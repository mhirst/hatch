// Package api wires the daemon's HTTP routes. The daemon is the single source
// of truth for orgs, apps, container state and tailnet config; the MCP server
// and the web UI are both clients of this API.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/rs/cors"

	"github.com/hatch/hatchd/internal/auth"
	"github.com/hatch/hatchd/internal/docker"
	"github.com/hatch/hatchd/internal/framework"
	"github.com/hatch/hatchd/internal/store"
	"github.com/hatch/hatchd/internal/tailscale"
)

type Server struct {
	db     *store.DB
	docker *docker.Client
	ts     *tailscale.Client
	auth   *auth.Verifier
}

func NewServer(db *store.DB, dockerClient *docker.Client, ts *tailscale.Client) *Server {
	return &Server{
		db:     db,
		docker: dockerClient,
		ts:     ts,
		auth:   auth.NewVerifier(),
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(5 * time.Minute))

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})
	r.Use(c.Handler)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.requireIdentity)

		r.Get("/health", s.handleHealth)
		r.Get("/me", s.handleMe)
		r.Get("/org", s.handleGetOrg)
		r.Post("/org", s.handleCreateOrg)

		r.Route("/apps", func(r chi.Router) {
			r.Get("/", s.handleListApps)
			r.Post("/", s.handleDeployApp)
			r.Get("/{name}", s.handleGetApp)
			r.Post("/{name}/update", s.handleUpdateApp)
			r.Delete("/{name}", s.handleDeleteApp)

			r.Get("/{name}/access", s.handleListAccess)
			r.Post("/{name}/access", s.handleGrantAccess)
			r.Delete("/{name}/access/{email}", s.handleRevokeAccess)
		})

		r.Get("/tailscale/status", s.handleTailscaleStatus)
	})

	// Web UI. The Vite build lands in daemon/web/dist via the build script.
	r.Get("/*", s.serveWebUI())

	return r
}

// ─────────────────────────────────────────────────────────────────────────────
// middleware

type ctxKey string

const ctxIdentity ctxKey = "identity"

func (s *Server) requireIdentity(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := s.auth.Verify(r.Context(), r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		ctx := contextWithIdentity(r.Context(), id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func contextWithIdentity(ctx context.Context, id *auth.Identity) context.Context {
	return context.WithValue(ctx, ctxIdentity, id)
}

func identityFrom(ctx context.Context) *auth.Identity {
	if v, ok := ctx.Value(ctxIdentity).(*auth.Identity); ok {
		return v
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// handlers

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	dockerOK := false
	if s.docker != nil {
		dockerOK = s.docker.Available(r.Context()) == nil
	}
	tsStatus := "unavailable"
	if s.ts.Installed() {
		if st, err := s.ts.Status(r.Context()); err == nil {
			tsStatus = st.BackendState
		} else {
			tsStatus = "error"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"docker":    dockerOK,
		"tailscale": tsStatus,
		"auth":      map[string]any{"firebase": s.auth.Enabled()},
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	writeJSON(w, http.StatusOK, id)
}

func (s *Server) handleGetOrg(w http.ResponseWriter, r *http.Request) {
	org, err := s.db.FirstOrg()
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusOK, nil)
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, org)
}

func (s *Server) handleCreateOrg(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		Tailnet string `json:"tailnet"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "org name is required")
		return
	}
	org := store.Org{
		ID:        uuid.NewString(),
		Name:      body.Name,
		Tailnet:   strings.TrimSpace(body.Tailnet),
		CreatedAt: time.Now().Unix(),
	}
	if err := s.db.CreateOrg(org); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, org)
}

// ─────────────────────────────────────────────────────────────────────────────
// app deployment

type deployRequest struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Framework string `json:"framework,omitempty"`
}

func (s *Server) handleDeployApp(w http.ResponseWriter, r *http.Request) {
	if s.docker == nil {
		writeError(w, http.StatusServiceUnavailable, "docker is not available — start Docker Desktop and retry")
		return
	}
	id := identityFrom(r.Context())

	var body deployRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	body.Name = sanitizeName(body.Name)
	body.Path = strings.TrimSpace(body.Path)
	if body.Name == "" || body.Path == "" {
		writeError(w, http.StatusBadRequest, "name and path are required")
		return
	}
	abs, err := filepath.Abs(body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if info, err := os.Stat(abs); err != nil || !info.IsDir() {
		writeError(w, http.StatusBadRequest, "path must be a directory that exists")
		return
	}

	org, err := s.requireOrg()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	det := framework.Detect(abs)
	if body.Framework != "" {
		det.Kind = framework.Kind(body.Framework)
	}

	dockerfile := det.DockerPath
	if !det.HasDocker {
		body, err := det.Dockerfile()
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		generated := filepath.Join(abs, "Dockerfile.hatch")
		if err := os.WriteFile(generated, []byte(body), 0o644); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		dockerfile = generated
	}

	tag := fmt.Sprintf("hatch/%s:%s", body.Name, shortHash())
	if err := s.docker.Build(r.Context(), abs, dockerfile, tag); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	containerName := fmt.Sprintf("hatch-%s", body.Name)
	// If a previous container exists, replace it.
	if existing, err := s.db.GetAppByName(org.ID, body.Name); err == nil && existing.ContainerID != "" {
		_ = s.docker.Stop(r.Context(), existing.ContainerID)
	}

	containerID, hostPort, err := s.docker.Run(r.Context(), tag, containerName, det.Port)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	tailnetURL := fmt.Sprintf("http://localhost:%d", hostPort)
	if s.ts.Installed() {
		if err := s.ts.SetServe(r.Context(), "/"+body.Name, hostPort); err == nil {
			if host, err := s.ts.FundamentalHost(r.Context()); err == nil {
				tailnetURL = fmt.Sprintf("https://%s/%s", host, body.Name)
			}
		}
	}

	app := &store.App{
		ID:          uuid.NewString(),
		OrgID:       org.ID,
		OwnerID:     id.Sub,
		Name:        body.Name,
		SourcePath:  abs,
		Framework:   string(det.Kind),
		Port:        hostPort,
		ContainerID: containerID,
		Status:      "running",
		TailnetURL:  tailnetURL,
	}
	if existing, err := s.db.GetAppByName(org.ID, body.Name); err == nil {
		app.ID = existing.ID
		app.CreatedAt = existing.CreatedAt
	}
	if err := s.db.UpsertApp(app); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	frameworkLabel := string(det.Kind)
	if frameworkLabel == "" || frameworkLabel == "unknown" {
		frameworkLabel = "unknown framework"
	}
	_ = s.db.LogAccess(app.ID, id.Email, "deploy", frameworkLabel)

	writeJSON(w, http.StatusCreated, app)
}

func (s *Server) handleListApps(w http.ResponseWriter, r *http.Request) {
	org, err := s.requireOrg()
	if err != nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	apps, err := s.db.ListApps(org.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if apps == nil {
		apps = []store.App{}
	}
	writeJSON(w, http.StatusOK, apps)
}

func (s *Server) handleGetApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleUpdateApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	// Re-deploy from the original source path.
	payload, _ := json.Marshal(deployRequest{Name: app.Name, Path: app.SourcePath, Framework: app.Framework})
	r2 := r.Clone(r.Context())
	r2.Body = io.NopCloser(bytes.NewReader(payload))
	s.handleDeployApp(w, r2)
}

func (s *Server) handleDeleteApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if app.ContainerID != "" && s.docker != nil {
		_ = s.docker.Stop(r.Context(), app.ContainerID)
	}
	if err := s.db.DeleteApp(app.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListAccess(w http.ResponseWriter, r *http.Request) {
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	access, err := s.db.ListAccess(app.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if access == nil {
		access = []store.Access{}
	}
	writeJSON(w, http.StatusOK, access)
}

func (s *Server) handleGrantAccess(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(body.Email, "@") {
		writeError(w, http.StatusBadRequest, "valid email required")
		return
	}
	a := store.Access{
		AppID:     app.ID,
		UserEmail: body.Email,
		GrantedBy: id.Email,
		GrantedAt: time.Now().Unix(),
	}
	if err := s.db.GrantAccess(a); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = s.db.LogAccess(app.ID, id.Email, "grant", body.Email)
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) handleRevokeAccess(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	app, err := s.appFromURL(r)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	email := strings.ToLower(chi.URLParam(r, "email"))
	if err := s.db.RevokeAccess(app.ID, email); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = s.db.LogAccess(app.ID, id.Email, "revoke", email)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTailscaleStatus(w http.ResponseWriter, r *http.Request) {
	if !s.ts.Installed() {
		writeJSON(w, http.StatusOK, map[string]any{"installed": false})
		return
	}
	st, err := s.ts.Status(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"installed": true, "error": err.Error()})
		return
	}
	host, _ := s.ts.FundamentalHost(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"installed": true,
		"state":     st.BackendState,
		"host":      host,
		"hostname":  st.Self.HostName,
		"ips":       st.Self.TailscaleIPs,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers

func (s *Server) requireOrg() (*store.Org, error) {
	org, err := s.db.FirstOrg()
	if err != nil {
		return nil, fmt.Errorf("no org configured — POST /api/v1/org first")
	}
	return org, nil
}

func (s *Server) appFromURL(r *http.Request) (*store.App, error) {
	org, err := s.requireOrg()
	if err != nil {
		return nil, err
	}
	name := sanitizeName(chi.URLParam(r, "name"))
	if name == "" {
		return nil, errors.New("missing app name")
	}
	return s.db.GetAppByName(org.ID, name)
}

func (s *Server) serveWebUI() http.HandlerFunc {
	root := os.Getenv("HATCH_WEB_DIR")
	if root == "" {
		root = "web/dist"
	}
	fsys := os.DirFS(root)
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		f, err := fsys.Open(path)
		if err != nil {
			// SPA fallback — serve index.html for unknown routes.
			f, err = fsys.Open("index.html")
			if err != nil {
				http.Error(w, "web ui not built — run `npm run build` in web/", http.StatusNotFound)
				return
			}
		}
		defer f.Close()
		stat, err := f.Stat()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		seeker, ok := f.(io.ReadSeeker)
		if !ok {
			// fs.File doesn't guarantee seekability; fall back to copy.
			w.Header().Set("Content-Type", contentTypeFor(path))
			_, _ = io.Copy(w, f)
			return
		}
		http.ServeContent(w, r, path, stat.ModTime(), seeker)
	}
}

func contentTypeFor(path string) string {
	switch {
	case strings.HasSuffix(path, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(path, ".js"):
		return "application/javascript"
	case strings.HasSuffix(path, ".css"):
		return "text/css"
	case strings.HasSuffix(path, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(path, ".json"):
		return "application/json"
	}
	return "application/octet-stream"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func sanitizeName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= '0' && r <= '9',
			r == '-':
			out = append(out, r)
		case r == ' ' || r == '_':
			out = append(out, '-')
		}
	}
	return strings.Trim(string(out), "-")
}

func shortHash() string {
	return uuid.NewString()[:8]
}
