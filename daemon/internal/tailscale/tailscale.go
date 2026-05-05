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
	"strings"
)

type Client struct {
	bin string
}

func New() *Client {
	bin, err := exec.LookPath("tailscale")
	if err != nil {
		bin = ""
	}
	return &Client{bin: bin}
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
