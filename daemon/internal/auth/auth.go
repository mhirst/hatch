// Package auth verifies Firebase ID tokens. v1 uses Firebase Auth (Google
// sign-in) to identify the operator and their org. We fetch Google's public
// x509 certs, verify the JWT signature, validate the standard claims, and
// trust the email as the user identity.
//
// For local development, leave HATCH_FIREBASE_PROJECT_ID unset; the daemon
// then runs in single-user mode (the first browser to hit the local-only web
// UI bootstraps the org). The daemon only listens on 127.0.0.1, so dev mode
// is safe by default.
package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const googleKeysURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

// Verifier verifies Firebase-issued ID tokens for a specific project.
type Verifier struct {
	ProjectID string

	mu      sync.RWMutex
	keys    map[string]*rsa.PublicKey
	expires time.Time
}

// NewVerifier reads HATCH_FIREBASE_PROJECT_ID and returns a verifier scoped to
// that project. Empty project id => dev mode.
func NewVerifier() *Verifier {
	return &Verifier{ProjectID: os.Getenv("HATCH_FIREBASE_PROJECT_ID")}
}

func (v *Verifier) Enabled() bool { return v.ProjectID != "" }

// Identity is the verified subset of token claims we care about downstream.
type Identity struct {
	Email   string
	Name    string
	Sub     string
	Picture string
}

// Verify reads a bearer token from r and returns the verified identity. In
// dev mode (no project id), it returns the local developer identity since
// the daemon listens only on 127.0.0.1.
func (v *Verifier) Verify(ctx context.Context, r *http.Request) (*Identity, error) {
	if !v.Enabled() {
		return localIdentity(), nil
	}
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return nil, errors.New("missing bearer token")
	}
	return v.verifyToken(ctx, strings.TrimPrefix(header, "Bearer "))
}

func (v *Verifier) verifyToken(ctx context.Context, idToken string) (*Identity, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	headerB, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode header: %w", err)
	}
	var hdr struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerB, &hdr); err != nil {
		return nil, fmt.Errorf("parse header: %w", err)
	}
	if hdr.Alg != "RS256" {
		return nil, fmt.Errorf("unexpected alg %q", hdr.Alg)
	}

	key, err := v.key(ctx, hdr.Kid)
	if err != nil {
		return nil, err
	}

	signed := []byte(parts[0] + "." + parts[1])
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("decode signature: %w", err)
	}
	hashed := sha256.Sum256(signed)
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, hashed[:], sig); err != nil {
		return nil, fmt.Errorf("signature: %w", err)
	}

	payloadB, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	var claims struct {
		Iss     string `json:"iss"`
		Aud     string `json:"aud"`
		Exp     int64  `json:"exp"`
		Iat     int64  `json:"iat"`
		Sub     string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
		UserID  string `json:"user_id"`
	}
	if err := json.Unmarshal(payloadB, &claims); err != nil {
		return nil, fmt.Errorf("parse claims: %w", err)
	}
	now := time.Now().Unix()
	if claims.Exp < now {
		return nil, errors.New("token expired")
	}
	if claims.Iat > now+60 {
		return nil, errors.New("token issued in the future")
	}
	if claims.Aud != v.ProjectID {
		return nil, fmt.Errorf("aud mismatch: %s", claims.Aud)
	}
	if claims.Iss != "https://securetoken.google.com/"+v.ProjectID {
		return nil, fmt.Errorf("iss mismatch: %s", claims.Iss)
	}
	if claims.Email == "" {
		return nil, errors.New("token missing email")
	}
	uid := claims.UserID
	if uid == "" {
		uid = claims.Sub
	}
	return &Identity{
		Email:   strings.ToLower(claims.Email),
		Name:    claims.Name,
		Sub:     uid,
		Picture: claims.Picture,
	}, nil
}

func (v *Verifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	if v.keys != nil && time.Now().Before(v.expires) {
		if k, ok := v.keys[kid]; ok {
			v.mu.RUnlock()
			return k, nil
		}
	}
	v.mu.RUnlock()
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	k, ok := v.keys[kid]
	if !ok {
		return nil, fmt.Errorf("unknown kid %q", kid)
	}
	return k, nil
}

func (v *Verifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleKeysURL, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("google keys: %s", resp.Status)
	}
	var pemMap map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&pemMap); err != nil {
		return err
	}
	keys := make(map[string]*rsa.PublicKey, len(pemMap))
	for kid, certPEM := range pemMap {
		k, err := parseCertPublicKey(certPEM)
		if err != nil {
			continue
		}
		keys[kid] = k
	}
	v.mu.Lock()
	v.keys = keys
	v.expires = time.Now().Add(1 * time.Hour)
	v.mu.Unlock()
	return nil
}

func parseCertPublicKey(pemStr string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("no PEM block")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}
	pub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}
	return pub, nil
}

func localIdentity() *Identity {
	user := os.Getenv("USER")
	if user == "" {
		user = os.Getenv("USERNAME")
	}
	if user == "" {
		user = "you"
	}
	return &Identity{
		Email: user + "@local",
		Name:  user,
		Sub:   "local-" + user,
	}
}
