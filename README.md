# Hatch

[![latest release](https://img.shields.io/github/v/release/mhirst/hatch?label=release&color=3D52E2)](https://github.com/mhirst/hatch/releases/latest)
[![build](https://img.shields.io/github/actions/workflow/status/mhirst/hatch/build.yml?branch=main&label=build)](https://github.com/mhirst/hatch/actions/workflows/build.yml)
[![license](https://img.shields.io/github/license/mhirst/hatch?color=D4A82B)](LICENSE)

> Ship the apps you build with Claude Code to your team — without leaving your laptop.

**Download:** [latest installer for Windows / macOS](https://github.com/mhirst/hatch/releases/latest)

Hatch is a local-first deployment layer for vibe-coded internal tools. It runs a small daemon on your machine, exposes an MCP server to Claude Code, and gives you a desktop app to manage everything. Say "ship this to Sarah" — your app gets containerized, your teammates reach it over an encrypted peer-to-peer mesh, no cloud, no IT ticket.

## Why

Claude Code makes it trivial to throw together a Streamlit dashboard or a Next.js form over your reporting data. But sharing it is suddenly hard:

- "Just send me your screen" — doesn't scale
- "Push it to Vercel" — your data can't leave the building
- "Get IT to spin up a server" — see you in three quarters

Hatch closes that last mile. Local container, mesh VPN, org-aware access control. The data never leaves your laptop; the URL is reachable only by the teammates you name.

## How it works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Code  │ ──► │  hatch-mcp   │ ──► │   hatchd     │
│  (your IDE)  │     │  (TypeScript)│     │   (Go)       │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                       ┌─────────┼──────────┐
                                       ▼         ▼          ▼
                                    Docker   Tailscale    Hatch (Electron)
                                  containers   (mesh)     desktop app
```

- **`hatchd`** — Go daemon. Builds containers, runs them, manages your Tailscale identity and ACLs.
- **`hatch-mcp`** — TypeScript MCP server. Speaks to Claude Code; calls `hatchd` to deploy / share / list / update apps.
- **Hatch desktop app** — Electron wrapper around the dashboard. Bundles `hatchd` as a sidecar, gives you a tray icon, native menus, system notifications, deep links, auto-update. The web UI is still there for browser-only use.

## Repo layout

```
.
├── daemon/           Go daemon — container + tailnet + SQLite
├── mcp-server/       TypeScript MCP server — Claude Code bridge
├── desktop/          Electron app — wraps daemon + dashboard
├── web/              same React UI as a pure-web build
├── examples/         test apps (hello-streamlit etc.)
└── scripts/          install / dev helpers
```

## Quick start

There are two ways to run Hatch — pick one:

### A. Desktop app (recommended)

```bash
cd desktop
npm install
npm run build:daemon       # cross-compiles ../daemon to a sidecar binary
npm run build:icons        # SVG → PNG/ICO
npm run dev                # starts Electron with HMR
```

For a packaged installer:

```bash
npm run package:win        # Windows NSIS .exe
npm run package:mac        # macOS DMG
```

### B. Web mode (no Electron)

Three terminals:

```bash
# 1) the daemon
cd daemon && go run ./cmd/hatchd

# 2) the web UI
cd web && npm install && npm run build

# 3) the MCP server (one-time)
cd mcp-server && npm install && npm run build
claude mcp add hatch -- node "$PWD/dist/server.js"
```

Then `http://localhost:4592`.

## Try it

In any Claude Code session:

```
> deploy this folder to my team and share it with sarah@acme.com
```

Claude calls the MCP tools (`deploy_app`, `share_app`); the daemon containerizes whatever's in your project; Sarah opens the tailnet URL on her laptop.

## Status

Working prototype. The deploy-to-shared-URL loop is end-to-end functional. See `desktop/README.md` for what's still rough.
