/**
 * Polls the daemon's access log every 10s and surfaces new entries as native
 * notifications. We deliberately keep this on the main process (not the
 * renderer) so notifications fire even when the dashboard window is hidden.
 *
 * v1 reads from `/api/v1/apps/<name>/access` per app, which is enough to see
 * grants/revokes; richer per-request access events would need a daemon-side
 * /events SSE stream — slated for v2.
 */
import type { Daemon } from "./daemon.js";
import { settings } from "./settings.js";

interface Opts {
  daemon: Daemon;
  onEvent: (e: { app: string; actor: string; action: string }) => void;
}

interface ApiApp {
  name: string;
  updated_at: number;
}

interface AccessRow {
  app_id: string;
  user_email: string;
  granted_by: string;
  granted_at: number;
}

const POLL_MS = 10_000;

export function startAccessLogPoller({ daemon, onEvent }: Opts) {
  // key: `${app}:${email}` → granted_at. We compare granted_at to spot
  // re-grants (revoke + add) of the same email, which would otherwise look
  // identical to the prior grant and silently miss a notification.
  const seen = new Map<string, number>();

  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (!settings.get("notifyOnAccess")) {
      schedule();
      return;
    }
    try {
      const apps = await fetchJson<ApiApp[]>(`${daemon.baseUrl()}/api/v1/apps`);
      for (const app of apps ?? []) {
        const access = await fetchJson<AccessRow[]>(
          `${daemon.baseUrl()}/api/v1/apps/${encodeURIComponent(app.name)}/access`,
        );
        for (const row of access ?? []) {
          const key = `${app.name}:${row.user_email}`;
          const prev = seen.get(key);
          if (prev === row.granted_at) continue;
          seen.set(key, row.granted_at);
          // Skip the warm-up: rows we see for the first time on app start
          // shouldn't fire a barrage of toasts for grants from yesterday.
          if (prev === undefined) continue;
          onEvent({
            app: app.name,
            actor: row.user_email,
            action: "was granted access",
          });
        }
      }
    } catch {
      // daemon may be restarting; the next tick will retry.
    } finally {
      schedule();
    }
  };

  function schedule() {
    if (stopped) return;
    setTimeout(tick, POLL_MS);
  }

  tick().catch(() => {});

  return () => {
    stopped = true;
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}
