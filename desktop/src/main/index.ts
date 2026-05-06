/**
 * Hatch — Electron main process.
 *
 * Owns: app lifecycle, the dashboard window, the tray icon, native menus,
 * the bundled hatchd daemon (spawn + supervise + clean shutdown),
 * deep-link handling for hatch:// URLs, auto-update plumbing, and IPC bridges
 * to the renderer.
 *
 * The daemon is the single source of truth for app state — the renderer
 * fetches from http://127.0.0.1:<daemonPort>/api/v1/* exactly as it does in
 * web-only mode. Keeping the data plane in HTTP means the same renderer code
 * runs in browser dev mode and inside Electron with no branching.
 */
import { app, BrowserWindow, Tray, Menu, shell, Notification } from "electron";
// electron-updater ships as CommonJS; importing the default and destructuring
// is the form Node's ESM loader supports. The named-import form throws at
// startup ("SyntaxError: Named export 'autoUpdater' not found").
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Daemon } from "./daemon.js";
import { setupTray } from "./tray.js";
import { buildMenu } from "./menu.js";
import { registerIpc } from "./ipc.js";
import { startAccessLogPoller } from "./notifications.js";
import { settings } from "./settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
// `tray` is held in this scope to keep the GC from collecting it; we never
// read it back, hence the underscore prefix.
let _tray: Tray | null = null;
let daemon: Daemon | null = null;
let quitting = false;

// Single-instance guard. Second launches focus the existing window and forward
// any deep-link argv to the running instance via second-instance event.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    showWindow();
    handleDeepLink(argv.find((a) => a.startsWith("hatch://")));
  });
}

// Register the hatch:// protocol so deep links resolve to this app.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("hatch", process.execPath, [process.argv[1]!]);
  }
} else {
  app.setAsDefaultProtocolClient("hatch");
}

app.on("open-url", (e, url) => {
  e.preventDefault();
  showWindow();
  handleDeepLink(url);
});

// ─────────────────────────────────────────────────────────────────────────────
// app lifecycle

app.whenReady().then(async () => {
  daemon = new Daemon({ port: settings.get("daemonPort") });
  await daemon.start();

  await createWindow();
  _tray = setupTray({
    onShow: showWindow,
    onQuit: cleanQuit,
    iconPath: trayIconPath(),
  });
  Menu.setApplicationMenu(buildMenu({ onShow: showWindow, onQuit: cleanQuit }));

  registerIpc({ daemon, mainWindow: () => mainWindow });
  startAccessLogPoller({ daemon, onEvent: notifyAccess });

  // Auto-update only runs in packaged builds — there's nothing to update from
  // when running `npm run dev`.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn("autoUpdater:", err);
    });
  }

  if (settings.get("autoStart")) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  } else {
    app.setLoginItemSettings({ openAtLogin: false });
  }

  // forward initial deep-link from argv (Windows/Linux)
  handleDeepLink(process.argv.find((a) => a.startsWith("hatch://")));
});

// Keep running in the tray instead of quitting when the last window closes.
// `window-all-closed`'s default is to quit on Linux/Windows; we suppress that
// by simply *not* calling app.quit() — Electron only quits if you call it.
app.on("window-all-closed", () => {
  if (quitting) app.quit();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", async (e) => {
  if (daemon && daemon.isRunning()) {
    e.preventDefault();
    await daemon.stop();
    app.exit(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// window

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#F5F1EA", // matches the renderer's paper color
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Open external links in the user's default browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function cleanQuit() {
  quitting = true;
  if (daemon) await daemon.stop();
  app.quit();
}

// ─────────────────────────────────────────────────────────────────────────────
// deep links

function handleDeepLink(url: string | undefined) {
  if (!url) return;
  // hatch://deploy?path=<encoded>&name=<encoded>
  try {
    const u = new URL(url);
    if (u.host === "deploy") {
      const path = u.searchParams.get("path");
      const name = u.searchParams.get("name");
      if (path && name) {
        mainWindow?.webContents.send("deeplink:deploy", { path, name });
      }
    }
  } catch (err) {
    console.warn("bad deeplink", url, err);
  }
}

function notifyAccess(payload: { app: string; actor: string; action: string }) {
  if (!settings.get("notifyOnAccess")) return;
  if (!Notification.isSupported()) return;
  new Notification({
    title: `Hatch · ${payload.app}`,
    body: `${payload.actor} ${payload.action}`,
    silent: false,
  }).show();
}

function trayIconPath(): string {
  // packaged: extraResources at <res>/icons/tray.png
  // dev:     resources/icons/tray.png
  const candidates = [
    join(process.resourcesPath ?? "", "icons", "tray.png"),
    join(__dirname, "..", "..", "resources", "icons", "tray.png"),
    join(__dirname, "..", "..", "build", "icon.png"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}
