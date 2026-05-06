// Package tailscale wraps the Tailscale CLI for the v1 daemon. Once the
// product stabilizes we can swap to tsnet for an embedded node, which removes
// the user-installed-tailscale dependency.
package tailscale

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

type Client struct {
	bin string
}

// New finds the Tailscale CLI. On Windows, Tailscale's installer doesn't
// always add itself to PATH, so we also probe the default install locations.
// macOS App Store installs put the CLI in a sandbox path that we cover too.
func New() *Client {
	if bin, err := exec.LookPath("tailscale"); err == nil {
		return &Client{bin: bin}
	}
	for _, candidate := range fallbackPaths() {
		if _, err := exec.LookPath(candidate); err == nil {
			return &Client{bin: candidate}
		}
	}
	return &Client{bin: ""}
}

func fallbackPaths() []string {
	switch runtime.GOOS {
	case "windows":
		return []string{
			`C:\Program Files\Tailscale\tailscale.exe`,
			`C:\Program Files (x86)\Tailscale\tailscale.exe`,
		}
	case "darwin":
		return []string{
			"/Applications/Tailscale.app/Contents/MacOS/Tailscale",
			"/usr/local/bin/tailscale",
			"/opt/homebrew/bin/tailscale",
		}
	default:
		return []string{"/usr/bin/tailscale", "/usr/local/bin/tailscale"}
	}
}

func (c *Client) Installed() bool { return c.bin != "" }

type Status struct {
	BackendState string   `json:"BackendState"`
	Self         SelfNode `json:"Self"`
	MagicDNSSuffix string `json:"MagicDNSSuffix"`
}

type SelfNode struct {
	HostName string   `json:"HostName"`
	DNSName  string   `json:"DNSName"`
	TailscaleIPs []string `json:"TailscaleIPs"`
}

func (c *Client) Status(ctx context.Context) (*Status, error) {
	if !c.Installed() {
		return nil, errors.New("tailscale CLI not installed")
	}
	out, err := exec.CommandContext(ctx, c.bin, "status", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("tailscale status: %w", err)
	}
	var s Status
	if err := json.Unmarshal(out, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// FundamentalURL returns the host portion of a tailnet URL pointing at this
// machine — e.g. "mike-laptop.tail-scale.ts.net". Falls back to localhost when
// Tailscale is not running.
func (c *Client) FundamentalHost(ctx context.Context) (string, error) {
	s, err := c.Status(ctx)
	if err != nil {
		return "", err
	}
	if s.BackendState != "Running" {
		return "", fmt.Errorf("tailscale backend state: %s", s.BackendState)
	}
	host := strings.TrimSuffix(s.Self.DNSName, ".")
	if host == "" {
		host = s.Self.HostName
	}
	return host, nil
}

// Funnel exposes a local port to the open internet via Tailscale Funnel. We
// don't use this for app sharing (peers are inside the tailnet), but it's
// handy as an emergency override if a teammate can't install Tailscale yet.
// Returns the public URL.
func (c *Client) Funnel(ctx context.Context, port int) (string, error) {
	if !c.Installed() {
		return "", errors.New("tailscale CLI not installed")
	}
	cmd := exec.CommandContext(ctx, c.bin, "funnel", "--bg", fmt.Sprintf("localhost:%d", port))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("tailscale funnel: %v: %s", err, string(out))
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "https://") {
			return strings.Fields(line)[0], nil
		}
	}
	return "", nil
}

// Up runs `tailscale up`, which brings the node online and triggers the
// browser auth flow if the user isn't logged in. Returns once the command
// has been kicked off — the auth itself happens in the user's browser and
// the caller should poll Status() to know when it's complete.
//
// We intentionally don't pass any flags. Bare `tailscale up` is a no-op for
// already-authenticated nodes (just brings the link up) and triggers auth
// for new ones, which is the exact behavior we want.
func (c *Client) Up(ctx context.Context) error {
	if !c.Installed() {
		return errors.New("tailscale CLI not installed")
	}
	// Don't capture stdout — `tailscale up` prints a URL and waits when not
	// authed, and we want it to fire-and-forget. The user gets the auth URL
	// via the Tailscale tray (or the OS opens it automatically).
	cmd := exec.CommandContext(ctx, c.bin, "up")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("tailscale up: %w", err)
	}
	// Don't Wait() — let the auth flow complete in the user's browser.
	go func() { _ = cmd.Wait() }()
	return nil
}

// SetServe binds a local port to the tailnet so peers in the org can reach it
// at https://<machine>.<tailnet>/<path>. v1 uses the simpler `tailscale serve`
// HTTPS-on-tailnet flow.
func (c *Client) SetServe(ctx context.Context, path string, port int) error {
	if !c.Installed() {
		return errors.New("tailscale CLI not installed")
	}
	args := []string{"serve", "--bg", "--set-path=" + path, fmt.Sprintf("http://localhost:%d", port)}
	cmd := exec.CommandContext(ctx, c.bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tailscale serve: %v: %s", err, string(out))
	}
	return nil
}
