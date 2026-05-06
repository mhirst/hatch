# Changelog

## 0.2.0 — onboarding for non-technical users

### Added
- **Three-step onboarding wizard** (Welcome → Docker → Tailscale) that explains what each tool is and why Hatch needs it before asking the user to install anything. Replaces the old "here are some links, figure it out" screen.
- **View-only path** for teammates clicking an invite who don't need Docker — Hatch now branches at the welcome screen between "set up to deploy" and "view-only".
- **One-click Tailscale sign-in** from inside Hatch — new `POST /api/v1/tailscale/up` endpoint runs `tailscale up` on the user's behalf so they don't have to find the Tailscale tray icon.
- **OS-aware direct download links** for Docker Desktop and Tailscale (Windows MSI from `pkgs.tailscale.com`, Mac App Store deep-link, etc.) — no more marketing-page detours.
- **"Open Docker Desktop" button** that uses the `docker-desktop://` protocol so users don't have to find the icon themselves after installing.
- **Live "Starting…" status** during the 30s+ Docker boot — was previously stuck red the entire time.
- **Help view** accessible from the header at any time. Eight short topics covering "what is Docker", "what is Tailscale", "what's my tailnet" (reads the actual value), "what happens when I quit Hatch", "why does my URL still say localhost", "how do I revoke access", "where are my logs".
- **Improved dashboard Tailscale banner** with one-click "Install Tailscale" / "Sign in to Tailscale" buttons instead of inline links.

### Changed
- **`local_url` and `tailnet_url` are now separate fields** in the daemon's app store. Previously every deploy stuffed `http://localhost:NNNN` into `tailnet_url` whenever Tailscale Serve hadn't published yet, so the dashboard misleadingly thought the app was shareable. Now `tailnet_url` is empty until Serve actually publishes; the renderer keys "this app is shareable" off its presence.
- App rows that aren't on the tailnet show a small **"local only"** pill in mustard.
- The Invite modal warns clearly before letting the operator generate an invite that would link to localhost.
- Tailscale CLI discovery now probes `C:\Program Files\Tailscale\tailscale.exe` and the macOS App Store sandbox path explicitly. Neither installer reliably adds the CLI to PATH for non-shell child processes, so the daemon was sometimes failing to find Tailscale on otherwise-healthy installs.

### Fixed
- Variable shadowing in `handleDeployApp` (`body, err := det.Dockerfile()`) renamed to `dockerfileBody` for clarity.
- `Settings.setFlag` was typed loosely enough that callers could try to write read-only fields like `daemonUrl` or `appVersion`. Now constrained to a `WritableSettings` subset.
- Settings port validation now shows a vermilion error message instead of silently dropping invalid input.
- Toggle uses `role="switch"` + `aria-checked` instead of `aria-pressed` (small a11y improvement).
- LogViewer now pulls `logsDir` from the bridge so the displayed path matches what "Open logs folder" actually opens.
- `api.health()` returns a typed `Health` interface instead of `unknown`.
- Hand-rolled `zodToJsonSchema` in the MCP server replaced with the published `zod-to-json-schema` package — the old version would silently misrender unions, records, and most non-trivial schemas.

### Repo / CI
- npm + Go module caches in CI (saves ~30s per build once warm).
- `cmd/dbdump` moved behind a `dev` build tag so it stops compiling into release binaries.
- `Dockerfile.hatch` artifact removed from `examples/` and `.gitignore`'d.

## 0.1.0 — Electron desktop app

### Added
- **`desktop/` Electron app** wrapping the daemon and dashboard:
  - System tray icon (open dashboard, quit)
  - Native menus on Mac/Windows (File, View, Window, Help)
  - Auto-start on login (opt-in toggle)
  - System notifications when teammates are granted access to a shared app
  - Settings panel — port, auto-start, notifications, logs path
  - In-app logs view (opens the OS file manager at the daemon log dir)
  - Deep links — `hatch://deploy?path=<encoded>&name=<encoded>` opens a confirm-and-deploy modal
  - Auto-update plumbing via electron-updater
  - Bundles `hatchd` as a sidecar via electron-builder `extraResources`
- **Preload bridge** (`window.hatch`) exposes only Electron-only features (settings, file dialogs, deep-link events). HTTP to the daemon is unchanged so the same renderer runs in pure-web and Electron.
- **Build scripts**:
  - `npm run build:daemon` cross-compiles `../daemon` to `resources/bin/hatchd[.exe]`
  - `npm run build:icons` renders SVG sources to PNG/ICO (sharp + png-to-ico)
  - `npm run package:{win,mac}` produces NSIS / DMG installers
- **Placeholder app icon + tray icon** (SVG sources in `desktop/build/icon.svg` and `desktop/resources/icons/tray.svg`).
- `desktop/SIGNING.md` — what's needed for signed Windows + macOS builds when you have certs.
- `desktop/README.md` — architecture diagram, build steps, known gaps.

### Changed
- **Whole UI flipped to dark + brights** — palette pulled from monpaco's hero (cobalt / rose / mustard / vermilion on near-black). Same editorial typography (italic EB Garamond serif headings, Inter UI), same playful shape language (chunky cut-outs around section titles).
- `web/` and `desktop/src/renderer/` share one source tree — the React UI is identical in both modes; differences live entirely in the Electron preload.

### Migrated
- Daemon SQLite store now uses **proper versioned migrations** (`PRAGMA user_version`). Migration 2 drops the `apps.owner_id → users.id` foreign key, which silently broke deploys in dev mode.
- Daemon `docker.Run` is now **idempotent** — orphaned containers from a previous run are force-removed before a new container starts.

### Fixed
- Empty stdout/stderr behavior on Windows where `Invoke-RestMethod` hung silently when the daemon returned a 5xx — the FK migration removes the silent-fail path, and `Run` no longer 500s on a container-name conflict.

## 0.1.0 — initial prototype
- Go daemon (`hatchd`) with Docker + Tailscale shell-out, SQLite store, Firebase ID-token verification.
- TypeScript MCP server exposing deploy / share / list / update / stop tools to Claude Code.
- React + Tailwind dashboard.
- Streamlit / FastAPI / Flask / Next / Vite / Node / Python / static framework auto-detection.
- `examples/hello-streamlit` test app.
