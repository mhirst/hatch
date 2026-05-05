# Changelog

## 0.2.0 — Electron desktop app

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
