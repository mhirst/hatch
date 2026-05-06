import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { authEnabled, signInGoogle, signOutUser, watchUser } from "./lib/firebase";
import { api, type App as HatchApp, type Org, type TailscaleStatus } from "./lib/api";
import {
  Button,
  Card,
  Hairline,
  HeroShape,
  Input,
  Label,
  Mono,
  Shapes,
  StatusDot,
} from "./components/ui";
import { Settings } from "./components/Settings";
import { LogViewer } from "./components/LogViewer";
import { DeepLinkDeploy } from "./components/DeepLinkDeploy";
import { Onboarding } from "./components/Onboarding";
import { Invite } from "./components/Invite";
import { Help } from "./components/Help";

type View =
  | "loading"
  | "signin"
  | "setup-org"
  | "onboarding"
  | "dashboard"
  | "settings"
  | "logs"
  | "help";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("loading");
  const [org, setOrg] = useState<Org | null>(null);
  const [pendingDeepLink, setPendingDeepLink] = useState<{ path: string; name: string } | null>(null);

  useEffect(() => {
    if (!authEnabled()) {
      setUser({ email: "you@local", displayName: "Local user" } as User);
      bootstrap();
      return;
    }
    return watchUser((u) => {
      setUser(u);
      if (u) bootstrap();
      else setView("signin");
    });
  }, []);

  // Subscribe to deep links once. The Electron main process will fire
  // `deeplink:deploy` when the user clicks a hatch://deploy?... URL.
  useEffect(() => {
    const unsub = window.hatch?.on.deeplinkDeploy(setPendingDeepLink);
    return () => {
      // The bridge returns its own teardown; we wrap it so React's cleanup
      // signature stays `() => void` regardless of the bridge implementation.
      unsub?.();
    };
  }, []);

  async function bootstrap() {
    try {
      const o = await api.org();
      setOrg(o);
      if (!o) {
        setView("setup-org");
        return;
      }
      // If Docker or Tailscale aren't ready, gate on the onboarding screen.
      const h = await api.health();
      if (!h.docker || h.tailscale !== "Running") {
        setView("onboarding");
      } else {
        setView("dashboard");
      }
    } catch {
      setView("setup-org");
    }
  }

  if (view === "loading") return <Splash>One moment.</Splash>;

  const showNav = view === "dashboard" || view === "settings" || view === "logs" || view === "help";

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        user={user}
        org={org}
        showNav={showNav}
        onNavigate={setView}
        onSignOut={() => signOutUser()}
      />
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12">
        {view === "signin" && <SignIn />}
        {view === "setup-org" && <SetupOrg onCreated={(o) => { setOrg(o); setView("onboarding"); }} />}
        {view === "onboarding" && <Onboarding onReady={() => setView("dashboard")} />}
        {view === "dashboard" && org && <Dashboard org={org} />}
        {view === "settings" && <Settings onClose={() => setView("dashboard")} />}
        {view === "logs" && <LogViewer onClose={() => setView("dashboard")} />}
        {view === "help" && <Help onClose={() => setView("dashboard")} />}
      </main>
      <Footer />
      {pendingDeepLink && (
        <DeepLinkDeploy
          payload={pendingDeepLink}
          onClose={() => setPendingDeepLink(null)}
          onDeployed={() => setView("dashboard")}
        />
      )}
    </div>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-ash text-sm">
      {children}
    </div>
  );
}

function Header({
  user,
  org,
  showNav,
  onNavigate,
  onSignOut,
}: {
  user: User | null;
  org: Org | null;
  showNav: boolean;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
}) {
  return (
    <header className="border-b border-ink-3">
      <div className="mx-auto w-full max-w-3xl px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => onNavigate("dashboard")}
          className="flex items-baseline gap-3 hover:opacity-90"
          aria-label="Go to dashboard"
        >
          {/* Wordmark — italic serif H lockup with a single mustard wedge */}
          <span className="flex items-baseline gap-1.5">
            <svg width="14" height="22" viewBox="0 0 14 22" aria-hidden>
              <rect x="0" y="4" width="14" height="14" rx="0" fill="#D4A82B" />
            </svg>
            <span className="font-serif italic text-2xl tracking-tight text-paper">Hatch</span>
          </span>
          {org && (
            <span className="text-xs uppercase tracking-tight text-ash">/ {org.name}</span>
          )}
        </button>
        {user && (
          <div className="flex items-center gap-4">
            {showNav && (
              <button onClick={() => onNavigate("help")} className="text-xs text-ash hover:text-paper">
                Help
              </button>
            )}
            {showNav && window.hatch && (
              <>
                <button onClick={() => onNavigate("logs")} className="text-xs text-ash hover:text-paper">
                  Logs
                </button>
                <button onClick={() => onNavigate("settings")} className="text-xs text-ash hover:text-paper">
                  Settings
                </button>
              </>
            )}
            <span className="text-xs text-ash">{user.email}</span>
            <button onClick={onSignOut} className="text-xs text-ash hover:text-paper">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-3">
      <div className="mx-auto w-full max-w-3xl px-6 py-5 text-xs text-ash flex items-center justify-between">
        <span>local-first · your data never leaves your laptop</span>
        <span className="font-serif italic text-paper-2">made with patience</span>
      </div>
    </footer>
  );
}

// ─── views ─────────────────────────────────────────────────────────────────

function SignIn() {
  return (
    <div className="text-center pt-12">
      <HeroShape className="mx-auto mb-8" />
      <h1 className="font-serif text-5xl mb-3 text-paper">Ship the apps you build.</h1>
      <p className="text-ash max-w-md mx-auto leading-relaxed mb-10">
        Hatch lets you share the tools you vibe-code in Claude Code with your
        team — securely, locally, no IT ticket required.
      </p>
      <Button onClick={() => signInGoogle()}>Continue with Google</Button>
    </div>
  );
}

function SetupOrg({ onCreated }: { onCreated: (org: Org) => void }) {
  const [name, setName] = useState("");
  const [tailnet, setTailnet] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const o = await api.createOrg(name.trim(), tailnet.trim());
      onCreated(o);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto pt-12">
      <Shapes className="mb-5" />
      <h1 className="font-serif text-3xl mb-2 text-paper">Name your team.</h1>
      <p className="text-ash text-sm mb-8">
        Everyone you share an app with belongs to one org. You can change this later.
      </p>
      <div className="space-y-6">
        <div>
          <Label>Org name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme PM team" />
        </div>
        <div>
          <Label>Tailscale tailnet (optional)</Label>
          <Input
            value={tailnet}
            onChange={(e) => setTailnet(e.target.value)}
            placeholder="acme.ts.net"
          />
          <p className="text-xs text-ash mt-2">
            If your team already uses Tailscale, paste your tailnet here. Hatch
            will route shared apps over it.
          </p>
        </div>
        {err && <p className="text-sm text-vermilion">{err}</p>}
        <Button disabled={busy || !name.trim()} onClick={submit}>
          {busy ? "Creating…" : "Create org"}
        </Button>
      </div>
    </div>
  );
}

function Dashboard({ org: _org }: { org: Org }) {
  const [apps, setApps] = useState<HatchApp[]>([]);
  const [ts, setTs] = useState<TailscaleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [deployForm, setDeployForm] = useState<{ path: string; name: string } | null>(null);

  // Two refresh paths: a silent background poll (no spinner — runs every 5s
  // as long as the dashboard is mounted) and a user-initiated refresh that
  // toggles `busy` so buttons disable and the spinner label shows.
  const fetchState = async () => {
    const [a, t] = await Promise.all([api.listApps(), api.tailscale()]);
    setApps(a);
    setTs(t);
  };

  async function refresh() {
    setBusy(true);
    try {
      await fetchState();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchState().catch(() => {});
    const id = setInterval(() => {
      fetchState().catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  async function pickFolder() {
    const path = await window.hatch?.dialog.pickFolder();
    if (!path) return;
    // Suggest a name from the folder's basename.
    const base = path.split(/[\\/]/).pop() ?? "";
    const name = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    setDeployForm({ path, name });
  }

  async function confirmDeploy() {
    if (!deployForm) return;
    setBusy(true);
    try {
      await api.deploy(deployForm.name, deployForm.path);
      setDeployForm(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-baseline justify-between mb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-4xl text-paper">Your apps</h1>
            <Shapes />
          </div>
          <div className="flex items-center gap-4">
            {window.hatch && (
              <Button variant="cobalt" onClick={pickFolder}>
                Deploy folder
              </Button>
            )}
            <span className="text-xs text-ash">{apps.length} deployed</span>
          </div>
        </div>

        {deployForm && (
          <Card tone="raised" className="mb-6">
            <Label>New deploy</Label>
            <div className="space-y-3">
              <div>
                <Label>Folder</Label>
                <Mono tone="paper">{deployForm.path}</Mono>
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={deployForm.name}
                  onChange={(e) =>
                    setDeployForm({ ...deployForm, name: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button variant="cobalt" onClick={confirmDeploy} disabled={busy || !deployForm.name}>
                  {busy ? "Deploying…" : "Deploy"}
                </Button>
                <Button variant="ghost" onClick={() => setDeployForm(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        <TailscaleBanner ts={ts} />

        {apps.length === 0 ? (
          <Card tone="raised" className="text-center py-12">
            <HeroShape className="mx-auto mb-6 opacity-90" />
            <p className="text-paper-2 mb-1">No apps yet.</p>
            <p className="text-sm text-ash">
              In Claude Code, say:{" "}
              <Mono tone="paper">deploy this app to my team as <em>my-dashboard</em></Mono>
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <AppRow key={app.id} app={app} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <Hairline />

      <section>
        <h2 className="font-serif text-2xl mb-3 text-paper">How sharing works</h2>
        <p className="text-ash text-sm leading-relaxed max-w-xl">
          Apps run in containers on this machine and are reachable only at your
          Tailscale address. Adding a teammate by email gives them access in
          your tailnet — they install Tailscale once, sign in with the same
          Google workspace, and the app appears at the URL above.
        </p>
      </section>

      <button
        onClick={refresh}
        disabled={busy}
        className="text-xs text-ash hover:text-paper"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function TailscaleBanner({ ts }: { ts: TailscaleStatus | null }) {
  const [busy, setBusy] = useState(false);

  if (!ts) return null;

  if (!ts.installed) {
    return (
      <Card tone="raised" className="mb-6 border-vermilion/40">
        <p className="text-sm text-paper-2 mb-3">
          Tailscale isn't installed. Until it is, apps you deploy here are
          reachable at <Mono tone="paper">localhost</Mono> only — your
          teammates won't be able to open them.
        </p>
        <Button
          variant="cobalt"
          onClick={() =>
            window.hatch
              ? window.hatch.shell.openExternal("https://tailscale.com/download")
              : window.open("https://tailscale.com/download", "_blank", "noreferrer")
          }
        >
          Install Tailscale
        </Button>
      </Card>
    );
  }

  if (ts.state !== "Running") {
    const needsLogin = ts.state === "NeedsLogin";
    return (
      <Card tone="raised" className="mb-6 border-mustard/40">
        <p className="text-sm text-paper-2 mb-3">
          {needsLogin
            ? "Tailscale is installed but not signed in. Sharing won't work until you sign in."
            : `Tailscale is installed but not running (${ts.state ?? "unknown"}).`}
        </p>
        <Button
          variant="cobalt"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.tailscaleUp();
            } finally {
              setTimeout(() => setBusy(false), 5000);
            }
          }}
        >
          {busy ? "Opening sign-in…" : "Sign in to Tailscale"}
        </Button>
      </Card>
    );
  }

  return (
    <p className="text-xs text-ash mb-6">
      Tailnet · <Mono tone="paper">{ts.host}</Mono>
    </p>
  );
}

function AppRow({ app, onChanged }: { app: HatchApp; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  // Prefer the shareable tailnet URL when we have one; fall back to localhost
  // so the operator at least has a working link on their own machine.
  const url = app.tailnet_url || app.local_url;
  const shareable = !!app.tailnet_url;

  return (
    <Card tone="raised" className="!p-5">
      <div className="flex items-center gap-4">
        <StatusDot status={app.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-medium text-paper">{app.name}</span>
            <span className="text-xs text-ash">{app.framework}</span>
            {!shareable && app.local_url && (
              <span className="text-[10px] uppercase tracking-tight text-mustard">
                local only
              </span>
            )}
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ash hover:text-cobalt truncate block"
            >
              {url}
            </a>
          )}
        </div>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Manage"}
        </Button>
      </div>
      {open && <AppDetail app={app} onChanged={onChanged} />}
    </Card>
  );
}

function AppDetail({ app, onChanged }: { app: HatchApp; onChanged: () => void }) {
  const [accessList, setAccessList] = useState<{ user_email: string }[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [tailnetHost, setTailnetHost] = useState<string | undefined>();

  async function refresh() {
    const list = await api.listAccess(app.name);
    setAccessList(list);
  }

  useEffect(() => {
    refresh();
    api.tailscale().then((t) => setTailnetHost(t.host)).catch(() => {});
  }, [app.name]);

  async function add() {
    if (!email) return;
    setBusy(true);
    try {
      await api.share(app.name, email);
      setEmail("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 pt-5 border-t border-ink-3 space-y-5">
      <div>
        <Label>Source</Label>
        <Mono tone="paper">{app.source_path}</Mono>
      </div>

      <div>
        <Label>Teammates with access</Label>
        {accessList.length === 0 ? (
          <p className="text-sm text-ash">Only you, for now.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {accessList.map((a) => (
              <li
                key={a.user_email}
                className="flex items-center justify-between text-paper-2"
              >
                <span>{a.user_email}</span>
                <button
                  onClick={async () => {
                    await api.revoke(app.name, a.user_email);
                    refresh();
                  }}
                  className="text-xs text-ash hover:text-vermilion"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mt-3">
          <Input
            placeholder="teammate@acme.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button variant="cobalt" onClick={add} disabled={busy || !email}>
            Add
          </Button>
          <Button variant="rose" onClick={() => setShowInvite(true)}>
            Invite
          </Button>
        </div>
        <p className="text-xs text-ash mt-2">
          "Invite" generates a shareable HTML page that walks a teammate
          through joining your tailnet and opening this app.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={async () => {
            setBusy(true);
            try {
              await api.update(app.name);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Rebuild
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Stop ${app.name}?`)) return;
            await api.remove(app.name);
            onChanged();
          }}
        >
          Stop
        </Button>
      </div>

      {showInvite && (
        <Invite
          app={app}
          tailnetHost={tailnetHost}
          onClose={() => {
            setShowInvite(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
