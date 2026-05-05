# Quickstart

This is a working prototype. End-to-end flow:

```
Claude Code → MCP server → hatchd → Docker → Tailscale → teammate's browser
```

> **There's now an Electron desktop app.** See `desktop/README.md` for the
> packaged-app flow. The instructions below are for the original web-only
> setup, which still works.

## Prerequisites

You already have these:

- [x] Docker Desktop (running)
- [x] Tailscale (signed in)

You'll need to install one more thing:

- [ ] **Go 1.22+** — `winget install GoLang.Go` (Windows) or `brew install go` (Mac).
      Until Go is installed, the daemon can't build. Everything else (web UI, MCP server) is plain Node.

## First run

```bash
# 1) build & start the daemon
cd daemon
go run ./cmd/hatchd
# → "hatchd listening on http://127.0.0.1:4592"

# 2) (in another terminal) build the web UI and copy it where the daemon serves it from
cd web
npm install
npm run build
# the build script copies dist/ into daemon/web/dist

# 3) open the dashboard
# → http://localhost:4592
# create your org. (auth is dev-mode until you set Firebase env vars)

# 4) build & register the MCP server with Claude Code
cd ../mcp-server
npm install
npm run build
claude mcp add hatch -- node "$(pwd)/dist/server.js"
```

That's it. In any Claude Code session now, you can say:

> deploy this app to my team and share it with sarah@acme.com

Claude will call `deploy_app` with the current project path, then `share_app`. The dashboard will show it within ~5 seconds.

## Single-user dev mode

Until you wire up Firebase, `hatchd` runs in single-user mode:

- It listens **only** on `127.0.0.1:4592` (never reachable from outside your laptop).
- The first browser session bootstraps the org as the local user.
- The MCP server forwards no token — Claude Code talks to the daemon as you.

This is safe for solo dev. Before you let teammates' browsers hit the daemon, set:

```
HATCH_FIREBASE_PROJECT_ID=your-project-id
```

…and configure `web/.env.local` (see `web/.env.example`). The daemon will then require a valid Firebase ID token on every request.

## Tailscale

The daemon shells out to the `tailscale` CLI. v1 uses `tailscale serve` to expose each app at `https://<your-machine>.<your-tailnet>.ts.net/<app-name>`. Teammates need to:

1. Install Tailscale on their machine
2. Sign in to your tailnet (same Google workspace)
3. Open the URL the dashboard shows for the app

No DNS, no certs, no port forwarding.

## Repo map

```
daemon/
  cmd/hatchd/           main.go, the binary entrypoint
  internal/
    api/                HTTP routes, middleware, deploy/share handlers
    auth/               Firebase ID token verifier
    docker/             shells out to `docker` CLI (build, run, port, stop)
    framework/          Streamlit/FastAPI/Next/etc detection + Dockerfile gen
    store/              SQLite — orgs, apps, access, audit log
    tailscale/          shells out to `tailscale` CLI (status, serve)
  web/dist/             web UI built into here

mcp-server/
  src/server.ts         MCP stdio server, wraps daemon endpoints

web/
  src/                  React UI: sign-in, org setup, apps dashboard
  tailwind.config.js    monpaco-inspired warm-minimal palette

scripts/
  dev.sh, dev.ps1       run daemon + web dev together
  install-mcp.sh        build the MCP server and register it with Claude Code
```

## Known gaps / TODOs

- Daemon doesn't yet verify ownership scope per-request (any local request can manage any app — fine for dev mode, must be tightened in multi-user mode).
- `tailscale serve` uses HTTPS on the tailnet but doesn't yet auto-confirm the cert prompt on first run.
- No auto-rebuild on file change. v1 loop is "edit → ask Claude to redeploy".
- Web UI has no real-time logs view; the `/access_log` table is populated but not exposed.
- (resolved) `web/package.json` previously used `cp -r`; replaced with a Node script (`scripts/copy-dist.mjs`) so PowerShell, cmd, bash all work.
