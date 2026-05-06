// Package docker is a thin shell-out wrapper around the docker CLI. It avoids
// pulling in the full Docker Engine SDK so we can ship a small daemon binary;
// any user with `docker` on PATH (Docker Desktop, Colima, Podman with the
// docker shim) is supported.
package docker

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

type Client struct{}

func New() (*Client, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return nil, errors.New("docker CLI not found on PATH")
	}
	return &Client{}, nil
}

func (c *Client) Available(ctx context.Context) error {
	cmd := exec.CommandContext(ctx, "docker", "info", "--format", "{{.ServerVersion}}")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker not running: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// Build builds the image at contextDir using the given Dockerfile path
// (relative to contextDir) and tags it as `tag`.
func (c *Client) Build(ctx context.Context, contextDir, dockerfile, tag string) error {
	args := []string{"build", "-t", tag}
	if dockerfile != "" {
		args = append(args, "-f", dockerfile)
	}
	args = append(args, contextDir)
	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker build: %v: %s", err, string(out))
	}
	return nil
}

// HatchLabel is attached to every container we start so cleanup tooling can
// distinguish Hatch-managed containers from anything else the user runs.
const HatchLabel = "io.hatch.managed=1"

// Run starts a detached container from the given image, mapping containerPort
// to a host port chosen by Docker. Returns the container ID and the host port.
//
// If a container with the same name already exists (orphaned from a previous
// run, or recovered after a daemon DB wipe), it's force-removed first so the
// deploy is idempotent.
func (c *Client) Run(ctx context.Context, image, name string, containerPort int) (string, int, error) {
	// Best-effort cleanup of any container squatting on this name. We ignore
	// errors here — `docker rm -f` is harmless if the container doesn't exist.
	_, _ = exec.CommandContext(ctx, "docker", "rm", "-f", name).CombinedOutput()

	args := []string{
		"run", "-d",
		"--name", name,
		"--label", HatchLabel,
		"--label", "io.hatch.app=" + name,
		"--restart", "unless-stopped",
		"-p", fmt.Sprintf("127.0.0.1::%d", containerPort),
		image,
	}
	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	if err != nil {
		return "", 0, fmt.Errorf("docker run: %v: %s", err, string(out))
	}
	id := strings.TrimSpace(string(out))
	port, err := c.HostPort(ctx, id, containerPort)
	if err != nil {
		return id, 0, err
	}
	return id, port, nil
}

func (c *Client) HostPort(ctx context.Context, containerID string, containerPort int) (int, error) {
	out, err := exec.CommandContext(ctx, "docker", "port", containerID, fmt.Sprintf("%d/tcp", containerPort)).Output()
	if err != nil {
		return 0, err
	}
	// Output looks like: "0.0.0.0:55014" or "127.0.0.1:55014"; can be multi-line.
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		idx := strings.LastIndex(line, ":")
		if idx == -1 {
			continue
		}
		var p int
		if _, err := fmt.Sscanf(line[idx+1:], "%d", &p); err == nil {
			return p, nil
		}
	}
	return 0, errors.New("could not parse host port")
}

func (c *Client) Stop(ctx context.Context, containerID string) error {
	out, err := exec.CommandContext(ctx, "docker", "rm", "-f", containerID).CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker rm: %v: %s", err, string(out))
	}
	return nil
}
