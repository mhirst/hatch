/**
 * Preload — the only place where Node and the renderer meet.
 *
 * We expose a small, typed surface on `window.hatch` instead of opening up
 * `ipcRenderer` directly. The renderer treats this as its native bridge for
 * Electron-only features (settings, file dialogs, deep-link events). All
 * data-plane traffic still goes over plain HTTP to the daemon, so the same
 * renderer source compiles in both Electron and pure-web modes.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface HatchSettings {
  autoStart: boolean;
  daemonPort: number;
  notifyOnAccess: boolean;
  appVersion: string;
  daemonUrl: string;
  logsDir: string;
}

const api = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<HatchSettings>,
    set: (patch: Partial<HatchSettings>) => ipcRenderer.invoke("settings:set", patch),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke("dialog:pickFolder") as Promise<string | null>,
  },
  shell: {
    openLogs: () => ipcRenderer.invoke("shell:openLogs"),
    openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  },
  on: {
    deeplinkDeploy: (cb: (payload: { path: string; name: string }) => void) => {
      const handler = (_e: unknown, payload: { path: string; name: string }) => cb(payload);
      ipcRenderer.on("deeplink:deploy", handler);
      return () => ipcRenderer.removeListener("deeplink:deploy", handler);
    },
  },
};

contextBridge.exposeInMainWorld("hatch", api);

// Type augmentation lives here so the renderer gets autocomplete without a
// separate ambient.d.ts. (electron-vite picks this up via the renderer's
// vite-env.d.ts triple-slash reference below.)
export type HatchBridge = typeof api;
