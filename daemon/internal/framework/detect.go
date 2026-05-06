// Package framework detects the framework of a local app folder and emits a
// reasonable Dockerfile if the project doesn't already ship one.
package framework

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Kind string

const (
	KindStreamlit Kind = "streamlit"
	KindFastAPI   Kind = "fastapi"
	KindFlask     Kind = "flask"
	KindNext      Kind = "nextjs"
	KindVite      Kind = "vite"
	KindNode      Kind = "node"
	KindPython    Kind = "python"
	KindStatic    Kind = "static"
	KindUnknown   Kind = "unknown"
)

type Detected struct {
	Kind       Kind
	Port       int
	Entrypoint string
	HasDocker  bool
	DockerPath string
}

// Detect inspects path and returns the most likely framework along with a
// suggested port and entrypoint. The error return is reserved for I/O
// failures; today this can't fail (we tolerate missing files), so callers
// can ignore it.
func Detect(path string) Detected {
	d := Detected{Kind: KindUnknown, Port: 8080}

	if hasFile(path, "Dockerfile") {
		d.HasDocker = true
		d.DockerPath = filepath.Join(path, "Dockerfile")
	}

	// Order matters: the more specific Python frameworks (Streamlit, FastAPI,
	// Flask) must lose to a more generic Python catch only if we don't see
	// their tells in either requirements.txt or pyproject.toml.
	pyDeps := readDeps(path)

	switch {
	case hasAny(path, "streamlit_app.py", "app.py") && (pyDeps.has("streamlit") || hasFile(path, "requirements.txt")):
		// Streamlit is detected when the entrypoint exists; we don't gate on
		// `streamlit` in deps because some projects pin it transitively.
		d.Kind = KindStreamlit
		d.Port = 8501
		d.Entrypoint = pickFirst(path, "streamlit_app.py", "app.py", "main.py")
	case pyDeps.has("fastapi"):
		d.Kind = KindFastAPI
		d.Port = 8000
		d.Entrypoint = pickFirst(path, "main.py", "app.py")
	case pyDeps.has("flask"):
		d.Kind = KindFlask
		d.Port = 5000
		d.Entrypoint = pickFirst(path, "app.py", "main.py")
	case hasAny(path, "next.config.js", "next.config.mjs", "next.config.ts"):
		d.Kind = KindNext
		d.Port = 3000
	case fileGrep(filepath.Join(path, "package.json"), "\"vite\""):
		d.Kind = KindVite
		d.Port = 5173
	case hasFile(path, "package.json"):
		d.Kind = KindNode
		d.Port = 3000
	case hasFile(path, "requirements.txt") || hasFile(path, "pyproject.toml"):
		d.Kind = KindPython
		d.Port = 8000
		d.Entrypoint = pickFirst(path, "main.py", "app.py")
	case hasFile(path, "index.html"):
		d.Kind = KindStatic
		d.Port = 80
	}

	return d
}

// Dockerfile returns a generated Dockerfile body for the detected framework.
// If the project already has a Dockerfile, callers should prefer that.
func (d Detected) Dockerfile() (string, error) {
	switch d.Kind {
	case KindStreamlit:
		entry := fallback(d.Entrypoint, "app.py")
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "%s", "--server.port=8501", "--server.address=0.0.0.0", "--server.headless=true"]
`, entry), nil
	case KindFastAPI:
		entry := strings.TrimSuffix(fallback(d.Entrypoint, "main.py"), ".py")
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "%s:app", "--host", "0.0.0.0", "--port", "8000"]
`, entry), nil
	case KindFlask:
		entry := fallback(d.Entrypoint, "app.py")
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
ENV FLASK_APP=%s
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
`, entry), nil
	case KindNext:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`, nil
	case KindVite:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
`, nil
	case KindNode:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`, nil
	case KindPython:
		entry := fallback(d.Entrypoint, "main.py")
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "%s"]
`, entry), nil
	case KindStatic:
		return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`, nil
	}
	return "", fmt.Errorf("unsupported framework %q — please add a Dockerfile to the project", d.Kind)
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers

// pyDeps is a tiny parsed view of a project's Python dependency manifests.
// We don't try to be a real packaging tool — just substring-match against
// requirements.txt + pyproject.toml so framework picks survive either layout.
type pyDeps struct {
	blob string // concatenated, lowercased
}

func readDeps(dir string) pyDeps {
	var b strings.Builder
	for _, name := range []string{"requirements.txt", "pyproject.toml"} {
		if data, err := os.ReadFile(filepath.Join(dir, name)); err == nil {
			b.Write(data)
			b.WriteByte('\n')
		}
	}
	return pyDeps{blob: strings.ToLower(b.String())}
}

func (p pyDeps) has(pkg string) bool {
	if p.blob == "" {
		return false
	}
	return strings.Contains(p.blob, strings.ToLower(pkg))
}

func hasFile(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, name))
	return err == nil
}

func hasAny(dir string, names ...string) bool {
	for _, n := range names {
		if hasFile(dir, n) {
			return true
		}
	}
	return false
}

func pickFirst(dir string, names ...string) string {
	for _, n := range names {
		if hasFile(dir, n) {
			return n
		}
	}
	return ""
}

func fileGrep(path, needle string) bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(b)), strings.ToLower(needle))
}

func fallback(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
