# Hatch — desktop app

Electron wrapper around the Go daemon and React dashboard. One double-clickable
app instead of three terminals.

## What's in here

```
desktop/
├── src/
│   ├── main/         Electron main process (window, tray, daemon supervision)
│   ├── preload/      contextBridge — Electron <-> renderer typed API
│   └── renderer/     React dashboard (was web/)
├── build/            installer assets — icon.svg, icon.ico, license
├── resources/        bundled at runtime — bin/hatchd[.exe], icons/tray.png
├── scripts/          build helpers — daemon, icons
├── electron.vite.config.ts
└── package.json
```

## Run in dev

```bash
# from repo root, build the daemon binary first
cd desktop
npm install
npm run build:daemon       # cross-compiles ../daemon → resources/bin/hatchd[.exe]
npm run build:icons        # SVG → PNG/ICO via sharp
npm run dev                # starts Electron + Vite renderer with HMR
```

The daemon is spawned as a child of the Electron process and killed on quit.
Logs land in:

- macOS: `~/Library/Application Support/Hatch/logs/hatchd.log`
- Windows: `%APPDATA%\Hatch\logs\hatchd.log`

## Package for distribution

```bash
npm run package          # current host
npm run package:win      # Windows NSIS installer
npm run package:mac      # macOS DMG (universal: arm64 + x64)
```

Outputs land in `dist/`. Builds are unsigned by default — see SIGNING.md.

## Architecture

```
┌──────────────┐    ┌─────────────────┐    ┌───────────────┐
│  Renderer    │◄──►│  Preload (IPC)  │◄──►│  Main proc    │
│  React UI    │    │  window.hatch   │    │  TS, Node     │
└──────┬───────┘    └─────────────────┘    └────────┬──────┘
       │                                            │ spawn / kill
       │  fetch http://127.0.0.1:4592               ▼
       │                                    ┌──────────────┐
       └────────────────────────────────────►   hatchd     │
                                            │   Go binary  │
                                            └──────────────┘
```

The data plane (apps list, deploys, sharing) is plain HTTP to the daemon. The
Electron-only surface (`window.hatch`) is just settings, file dialogs, deep
links, and the tray. This means the same renderer code runs in pure-web mode
for browser dev and in Electron — no branching needed.

## Tier-2 / 3 features wired

- **System tray icon** — open dashboard, quit
- **Native menus** — File / View / Window / Help with platform-correct items
- **Auto-start on login** (toggle in Settings)
- **System notifications** when access is granted to a shared app
- **Deep links** — `hatch://deploy?path=<encoded>&name=<encoded>` opens a
  confirmation card in the app
- **Auto-update** plumbing via electron-updater (point `publish.owner/repo`
  at your GitHub release once you have one)
- **Settings panel** — port, auto-start, notifications, logs
- **Log viewer** — opens the OS file manager at the daemon log directory

## Known gaps

- Tray icon is a placeholder; the SVG renders to PNG/ICO via the
  `build:icons` script. Wants a real designer pass.
- No streaming in-app log tail; just opens the folder. Needs a daemon-side
  SSE endpoint to do better.
- Deep-link handler doesn't validate the source app — if a teammate's
  laptop is compromised, they could trick the operator into deploying a
  random folder with `hatch://deploy?...`. We mitigate by always confirming
  with the user; we never auto-deploy.
- Auto-update assumes GitHub Releases. Self-hosted update servers work too
  via electron-builder's `generic` provider.
