import { idToken } from "./firebase";

export interface App {
  id: string;
  name: string;
  framework?: string;
  status: string;
  port?: number;
  source_path: string;
  /** http://localhost:NNNN — always present after a successful deploy. Only the operator can reach this. */
  local_url?: string;
  /** https://<machine>.<tailnet>.ts.net/<name> — only present once Tailscale Serve has published. */
  tailnet_url?: string;
  created_at: number;
  updated_at: number;
}

export interface Org {
  id: string;
  name: string;
  tailnet?: string;
}

export interface Access {
  app_id: string;
  user_email: string;
  granted_by: string;
  granted_at: number;
}

export interface TailscaleStatus {
  installed: boolean;
  state?: string;
  host?: string;
  hostname?: string;
  ips?: string[];
}

export interface Health {
  ok: boolean;
  docker: boolean;
  /** Tailscale BackendState — "Running", "NeedsLogin", "Stopped", or "unavailable". */
  tailscale: string;
  auth: { firebase: boolean };
}

/**
 * Resolve the daemon's base URL at request time.
 *
 * Three modes:
 *   1. Electron (renderer loaded from file://) — relative URLs would resolve
 *      against the file:// origin, so we MUST use an absolute URL here. The
 *      preload's settings bridge tells us where the main process spawned
 *      the daemon. If the bridge isn't wired yet, fall back to the default
 *      port — never let an Electron renderer issue a relative API call.
 *   2. Web dev (Vite proxy) — relative `/api/v1/...` works.
 *   3. Web prod (daemon serves /web/dist) — relative also works because the
 *      daemon is the origin.
 *
 * The promise is memoized so concurrent callers share one bridge round-trip.
 */
const ELECTRON_FALLBACK = "http://127.0.0.1:4592";

let basePromise: Promise<string> | null = null;
function daemonBase(): Promise<string> {
  if (basePromise) return basePromise;
  basePromise = (async () => {
    const isElectron = !!window.hatch;
    if (isElectron) {
      try {
        const s = (await window.hatch!.settings.get()) as { daemonUrl?: string };
        return s.daemonUrl ?? ELECTRON_FALLBACK;
      } catch {
        return ELECTRON_FALLBACK;
      }
    }
    // Web modes: relative paths — Vite proxy in dev, daemon-as-origin in prod.
    return "";
  })();
  return basePromise;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await idToken();
  const base = await daemonBase();
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>("GET", "/health"),
  me: () => request("GET", "/me"),
  org: () => request<Org | null>("GET", "/org"),
  createOrg: (name: string, tailnet: string) =>
    request<Org>("POST", "/org", { name, tailnet }),
  listApps: () => request<App[]>("GET", "/apps"),
  getApp: (name: string) => request<App>("GET", `/apps/${name}`),
  deploy: (name: string, path: string, framework?: string) =>
    request<App>("POST", "/apps", { name, path, framework }),
  update: (name: string) => request<App>("POST", `/apps/${name}/update`),
  remove: (name: string) => request("DELETE", `/apps/${name}`),
  listAccess: (name: string) => request<Access[]>("GET", `/apps/${name}/access`),
  share: (name: string, email: string) =>
    request<Access>("POST", `/apps/${name}/access`, { email }),
  revoke: (name: string, email: string) =>
    request("DELETE", `/apps/${name}/access/${email}`),
  tailscale: () => request<TailscaleStatus>("GET", "/tailscale/status"),
  tailscaleUp: () => request<void>("POST", "/tailscale/up"),
};
