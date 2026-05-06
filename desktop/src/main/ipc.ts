/**
 * IPC bridge. The renderer talks to the daemon over HTTP exactly as in web
 * mode; this module exposes only the *Electron-specific* features the
 * renderer can't get from a fetch call: settings, OS-native dialogs, and
 * lifecycle hooks.
 */
import { app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import { join } from "node:path";
import type { Daemon } from "./daemon.js";
import { settings, type Settings, type SettingsView } from "./settings.js";

interface IpcDeps {
  daemon: Daemon;
  mainWindow: () => BrowserWindow | null;
}

export function registerIpc({ daemon, mainWindow }: IpcDeps) {
  ipcMain.handle("settings:get", (): SettingsView => ({
    autoStart: settings.get("autoStart"),
    daemonPort: settings.get("daemonPort"),
    notifyOnAccess: settings.get("notifyOnAccess"),
    appVersion: app.getVersion(),
    daemonUrl: daemon.baseUrl(),
    logsDir: logsDir(),
  }));

  ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => {
    if (patch.autoStart !== undefined) {
      settings.set("autoStart", patch.autoStart);
      app.setLoginItemSettings({
        openAtLogin: patch.autoStart,
        openAsHidden: patch.autoStart,
      });
    }
    if (patch.notifyOnAccess !== undefined) {
      settings.set("notifyOnAccess", patch.notifyOnAccess);
    }
    // daemonPort changes require a restart — honored on next launch.
    if (patch.daemonPort !== undefined) {
      settings.set("daemonPort", patch.daemonPort);
    }
  });

  ipcMain.handle("dialog:pickFolder", async () => {
    const win = mainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select an app folder to deploy",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:openLogs", () => {
    shell.openPath(logsDir());
  });

  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    shell.openExternal(url);
  });
}

function logsDir(): string {
  return join(app.getPath("userData"), "logs");
}
