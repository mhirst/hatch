/**
 * Persistent app settings, single source of truth.
 *
 * `Settings` is the on-disk shape we save with electron-store; `SettingsView`
 * is what we expose to the renderer (adds a few read-only fields like the
 * resolved daemon URL and log directory). Keeping these split prevents the
 * renderer from accidentally setting things like daemonUrl that aren't ours
 * to write.
 */
import Store from "electron-store";

export interface Settings {
  autoStart: boolean;
  daemonPort: number;
  notifyOnAccess: boolean;
}

export interface SettingsView extends Settings {
  appVersion: string;
  daemonUrl: string;
  logsDir: string;
}

export const settings = new Store<Settings>({
  defaults: { autoStart: false, daemonPort: 4592, notifyOnAccess: true },
});
