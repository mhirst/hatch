/**
 * First-run onboarding.
 *
 * The previous version assumed the user knew what Docker and Tailscale were
 * and just needed download links. That works for engineers; it doesn't work
 * for the PM-with-no-Docker-experience who is the actual target user.
 *
 * This is a guided setup with three steps:
 *
 *   1. Welcome  — what Hatch is, branch into "I'm setting up to share apps"
 *                 vs "I'm just here to view a teammate's app" (much shorter).
 *   2. Docker   — explanation, OS-aware download link, "Open Docker Desktop"
 *                 button, live status.
 *   3. Tailscale — explanation, OS-aware download link, "Sign in" button
 *                 that runs `tailscale up` on the user's behalf.
 *
 * State machine:
 *
 *   welcome ─┬─► docker ─► tailscale ─► onReady() ─► dashboard
 *            └─► viewer-mode ─► onReady() (Tailscale only; Docker skipped)
 *
 * The renderer never blocks waiting for prerequisites — every step polls
 * the daemon's /health every 3s and the UI updates from the result. The
 * "Continue" button on each step is gated on the corresponding state being
 * green; users can move backward with a "Back" link.
 */
import { useEffect, useState } from "react";
import { api, type Health } from "../lib/api";
import { Button, Card, HeroShape, Hairline, Mono, Shapes } from "./ui";

type Step = "welcome" | "docker" | "tailscale" | "viewer";

type DockerState = "ok" | "starting" | "stopped" | "missing";
type TailscaleState = "ok" | "starting" | "needs-login" | "stopped" | "missing";

interface Status {
  docker: DockerState;
  tailscale: TailscaleState;
}

function classify(h: Health, prev: Status | null): Status {
  // Docker: the daemon's /health pings `docker info` so a true return means
  // the engine is responsive. We tag "starting" only after we've already
  // seen a non-OK reading and the user just clicked the open-Docker button
  // — the parent wires that in via prev.
  const docker: DockerState = h.docker
    ? "ok"
    : prev?.docker === "starting"
      ? "starting"
      : "stopped";

  let tailscale: TailscaleState;
  switch (h.tailscale) {
    case "Running":
      tailscale = "ok";
      break;
    case "unavailable":
      tailscale = "missing";
      break;
    case "NeedsLogin":
      tailscale = "needs-login";
      break;
    case "Starting":
      tailscale = "starting";
      break;
    default:
      tailscale = prev?.tailscale === "starting" ? "starting" : "stopped";
  }
  return { docker, tailscale };
}

export function Onboarding({ onReady }: { onReady: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let stopped = false;
    let prev: Status | null = null;
    async function tick() {
      if (stopped) return;
      try {
        const h = await api.health();
        const next = classify(h, prev);
        prev = next;
        setStatus(next);
      } catch {
        // daemon hiccup; try again
      }
      setTimeout(tick, 3000);
    }
    tick();
    return () => {
      stopped = true;
    };
  }, []);

  // Mark "starting" optimistically when the user clicks the open-app button
  // so the row immediately shows feedback instead of waiting up to 3s for
  // the next poll.
  function markStarting(which: "docker" | "tailscale") {
    setStatus((s) => ({
      docker: which === "docker" ? "starting" : (s?.docker ?? "stopped"),
      tailscale: which === "tailscale" ? "starting" : (s?.tailscale ?? "stopped"),
    }));
  }

  const dockerOk = status?.docker === "ok";
  const tailscaleOk = status?.tailscale === "ok";

  // Auto-advance: when both are green and we're on the last step, finish.
  useEffect(() => {
    if (step === "tailscale" && dockerOk && tailscaleOk) onReady();
    if (step === "viewer" && tailscaleOk) onReady();
  }, [step, dockerOk, tailscaleOk]);

  return (
    <div className="max-w-xl mx-auto pt-2">
      {step === "welcome" && (
        <Welcome
          onDeploy={() => setStep("docker")}
          onView={() => setStep("viewer")}
        />
      )}
      {step === "docker" && (
        <DockerStep
          state={status?.docker ?? "stopped"}
          onContinue={() => setStep("tailscale")}
          onBack={() => setStep("welcome")}
          onMarkStarting={() => markStarting("docker")}
        />
      )}
      {step === "tailscale" && (
        <TailscaleStep
          state={status?.tailscale ?? "stopped"}
          onContinue={onReady}
          onBack={() => setStep("docker")}
          onMarkStarting={() => markStarting("tailscale")}
        />
      )}
      {step === "viewer" && (
        <ViewerStep
          state={status?.tailscale ?? "stopped"}
          onContinue={onReady}
          onBack={() => setStep("welcome")}
          onMarkStarting={() => markStarting("tailscale")}
        />
      )}
    </div>
  );
}

// ─── Welcome ────────────────────────────────────────────────────────────────

function Welcome({ onDeploy, onView }: { onDeploy: () => void; onView: () => void }) {
  return (
    <div className="pt-4">
      <HeroShape className="mx-auto mb-8" />
      <h1 className="font-serif text-4xl mb-3 text-paper text-center">
        Welcome to Hatch.
      </h1>
      <p className="text-base text-paper-2 mb-10 leading-relaxed text-center max-w-md mx-auto">
        Hatch lets your team share little apps you build — dashboards,
        forms, internal tools — without putting any of them on the internet.
      </p>

      <div className="space-y-3">
        <PathCard
          title="I want to share my own apps"
          description="You'll need Docker and Tailscale. Hatch helps you install them — about 5 minutes total."
          accent="cobalt"
          onClick={onDeploy}
          cta="Set up to deploy"
        />
        <PathCard
          title="I'm just here to view a teammate's app"
          description="Only Tailscale is needed. A few clicks and you're done."
          accent="rose"
          onClick={onView}
          cta="View-only setup"
        />
      </div>

      <p className="text-xs text-ash mt-8 text-center">
        Not sure yet? You can change your mind any time from Settings.
      </p>
    </div>
  );
}

function PathCard({
  title,
  description,
  accent,
  cta,
  onClick,
}: {
  title: string;
  description: string;
  accent: "cobalt" | "rose";
  cta: string;
  onClick: () => void;
}) {
  const ring = accent === "cobalt" ? "hover:border-cobalt" : "hover:border-rose";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border border-ink-3 bg-ink-2 rounded-soft p-5 transition-colors ${ring}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-base font-medium text-paper mb-1">{title}</p>
          <p className="text-sm text-paper-2 leading-relaxed">{description}</p>
        </div>
        <span
          className={`text-xs uppercase tracking-tight ${accent === "cobalt" ? "text-cobalt" : "text-rose"}`}
        >
          {cta} →
        </span>
      </div>
    </button>
  );
}

// ─── Docker step ────────────────────────────────────────────────────────────

function DockerStep({
  state,
  onContinue,
  onBack,
  onMarkStarting,
}: {
  state: DockerState;
  onContinue: () => void;
  onBack: () => void;
  onMarkStarting: () => void;
}) {
  const ok = state === "ok";

  function install() {
    open(dockerDownloadURL());
  }
  function startApp() {
    onMarkStarting();
    // Best effort: open the Docker Desktop app via the OS protocol handler.
    // If Docker Desktop isn't installed yet, this is a no-op (user clicks
    // Install instead). We could shell out via the Electron bridge but a
    // plain "docker-desktop://" link works and avoids a new IPC path.
    open("docker-desktop://");
  }

  return (
    <div className="pt-2">
      <StepHeader number={1} title="Install Docker" subtitle="Step 1 of 2" />
      <p className="text-sm text-paper-2 leading-relaxed mb-2">
        Docker is the tool that runs each of your apps in its own little box
        (a "container"). Hatch uses it so your apps don't conflict with each
        other or with your laptop's regular software.
      </p>
      <p className="text-xs text-ash mb-6">
        Free, made by Docker Inc. Used by every engineering team you've heard of.
      </p>

      <Card tone="raised" className={`!p-5 mb-3 ${ok ? "border-cobalt/40" : ""}`}>
        <StatusRow
          state={state}
          okLabel="Docker is running"
          startingLabel="Starting Docker — this can take 30 seconds the first time"
          stoppedLabel="Docker isn't running"
          missingLabel="Docker isn't installed yet"
        />
        {!ok && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {state === "missing" && (
              <Button variant="cobalt" onClick={install}>
                Install Docker Desktop
              </Button>
            )}
            {(state === "stopped" || state === "starting") && (
              <Button variant="cobalt" onClick={startApp} disabled={state === "starting"}>
                {state === "starting" ? "Starting…" : "Open Docker Desktop"}
              </Button>
            )}
            {state !== "missing" && (
              <Button variant="ghost" onClick={install}>
                Reinstall
              </Button>
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-ash mb-8">
        After installing, Docker Desktop opens automatically. Wait for the
        whale icon to stop animating, then come back here — Hatch checks
        every few seconds.
      </p>

      <StepFooter onBack={onBack} onContinue={onContinue} continueDisabled={!ok} />
    </div>
  );
}

// ─── Tailscale step ─────────────────────────────────────────────────────────

function TailscaleStep({
  state,
  onContinue,
  onBack,
  onMarkStarting,
}: {
  state: TailscaleState;
  onContinue: () => void;
  onBack: () => void;
  onMarkStarting: () => void;
}) {
  const ok = state === "ok";
  const [signingIn, setSigningIn] = useState(false);

  function install() {
    open(tailscaleDownloadURL());
  }

  async function signIn() {
    setSigningIn(true);
    onMarkStarting();
    try {
      await api.tailscaleUp();
      // Tailscale opens the auth URL in the user's default browser. We just
      // need to wait — the next /health poll will pick up the state change.
    } catch (e) {
      console.warn("tailscale up:", e);
    } finally {
      // Re-enable the button after 5s in case auth fails or user cancels;
      // they can retry without reloading.
      setTimeout(() => setSigningIn(false), 5000);
    }
  }

  return (
    <div className="pt-2">
      <StepHeader number={2} title="Connect Tailscale" subtitle="Step 2 of 2" />
      <p className="text-sm text-paper-2 leading-relaxed mb-2">
        Tailscale is a private network just for you and your teammates. When
        you share an app, your teammates reach it through Tailscale — never
        the open internet.
      </p>
      <p className="text-xs text-ash mb-6">
        Free for up to 100 devices on a personal account. Sign in with the
        same Google or Microsoft account your teammates will use.
      </p>

      <Card tone="raised" className={`!p-5 mb-3 ${ok ? "border-cobalt/40" : ""}`}>
        <StatusRow
          state={state}
          okLabel="Tailscale is running"
          startingLabel="Waiting for sign-in — finish in your browser"
          stoppedLabel="Tailscale isn't running"
          missingLabel="Tailscale isn't installed yet"
          needsLoginLabel="Tailscale is installed — needs sign-in"
        />
        {!ok && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {state === "missing" && (
              <Button variant="cobalt" onClick={install}>
                Install Tailscale
              </Button>
            )}
            {(state === "needs-login" || state === "stopped" || state === "starting") && (
              <Button variant="cobalt" onClick={signIn} disabled={signingIn}>
                {signingIn ? "Opening sign-in…" : "Sign in to Tailscale"}
              </Button>
            )}
            {state !== "missing" && (
              <Button variant="ghost" onClick={install}>
                Reinstall
              </Button>
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-ash mb-8">
        Sign-in opens a browser tab. Pick the same account your teammates
        will use. You can stay signed in forever; Tailscale runs quietly in
        the background.
      </p>

      <StepFooter onBack={onBack} onContinue={onContinue} continueDisabled={!ok} />
    </div>
  );
}

// ─── Viewer-only path ───────────────────────────────────────────────────────

function ViewerStep({
  state,
  onContinue,
  onBack,
  onMarkStarting,
}: {
  state: TailscaleState;
  onContinue: () => void;
  onBack: () => void;
  onMarkStarting: () => void;
}) {
  const ok = state === "ok";
  const [signingIn, setSigningIn] = useState(false);

  function install() {
    open(tailscaleDownloadURL());
  }

  async function signIn() {
    setSigningIn(true);
    onMarkStarting();
    try {
      await api.tailscaleUp();
    } catch (e) {
      console.warn("tailscale up:", e);
    } finally {
      setTimeout(() => setSigningIn(false), 5000);
    }
  }

  return (
    <div className="pt-2">
      <StepHeader number={1} title="Connect Tailscale" subtitle="Just one step" />
      <p className="text-sm text-paper-2 leading-relaxed mb-2">
        To open a teammate's shared app, you need Tailscale — a private
        network just for your team. Install it, sign in with the same
        account they used, and the link they sent you will work.
      </p>
      <p className="text-xs text-ash mb-6">
        You don't need Docker for view-only. You can come back and set that
        up any time if you decide to share apps yourself.
      </p>

      <Card tone="raised" className={`!p-5 mb-3 ${ok ? "border-cobalt/40" : ""}`}>
        <StatusRow
          state={state}
          okLabel="Tailscale is running"
          startingLabel="Waiting for sign-in — finish in your browser"
          stoppedLabel="Tailscale isn't running"
          missingLabel="Tailscale isn't installed yet"
          needsLoginLabel="Tailscale is installed — needs sign-in"
        />
        {!ok && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {state === "missing" && (
              <Button variant="cobalt" onClick={install}>
                Install Tailscale
              </Button>
            )}
            {(state === "needs-login" || state === "stopped" || state === "starting") && (
              <Button variant="cobalt" onClick={signIn} disabled={signingIn}>
                {signingIn ? "Opening sign-in…" : "Sign in to Tailscale"}
              </Button>
            )}
          </div>
        )}
      </Card>

      <Hairline className="my-8" />

      <p className="text-xs text-ash mb-8 leading-relaxed">
        After Tailscale is connected, just open the link from your teammate's
        invite. No need to keep Hatch open — Tailscale runs in the
        background.
      </p>

      <StepFooter onBack={onBack} onContinue={onContinue} continueDisabled={!ok} />
    </div>
  );
}

// ─── Shared subcomponents ───────────────────────────────────────────────────

function StepHeader({
  number,
  title,
  subtitle,
}: {
  number: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs uppercase tracking-tight text-ash mb-1">{subtitle}</p>
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-3xl text-paper">{title}</h1>
        <Shapes />
      </div>
    </div>
  );
}

function StepFooter({
  onBack,
  onContinue,
  continueDisabled,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onBack} className="text-xs text-ash hover:text-paper">
        ← Back
      </button>
      <Button variant="cobalt" onClick={onContinue} disabled={continueDisabled}>
        Continue
      </Button>
    </div>
  );
}

type AnyState = DockerState | TailscaleState;

function StatusRow({
  state,
  okLabel,
  startingLabel,
  stoppedLabel,
  missingLabel,
  needsLoginLabel,
}: {
  state: AnyState;
  okLabel: string;
  startingLabel: string;
  stoppedLabel: string;
  missingLabel: string;
  needsLoginLabel?: string;
}) {
  const dot = state === "ok"
    ? "bg-cobalt"
    : state === "starting"
      ? "bg-mustard animate-pulse"
      : state === "needs-login"
        ? "bg-mustard"
        : "bg-vermilion";
  const label = state === "ok"
    ? okLabel
    : state === "starting"
      ? startingLabel
      : state === "missing"
        ? missingLabel
        : state === "needs-login"
          ? (needsLoginLabel ?? stoppedLabel)
          : stoppedLabel;
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
      <p className="text-sm text-paper">{label}</p>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Open a URL through the Electron bridge if available, falling back to
 * window.open for the pure-web build.
 */
function open(url: string) {
  if (window.hatch) {
    void window.hatch.shell.openExternal(url);
  } else {
    window.open(url, "_blank", "noreferrer");
  }
}

/** OS-aware Docker Desktop direct download URL. */
function dockerDownloadURL(): string {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) {
    // Apple Silicon vs Intel: there's no clean way to detect chip from the
    // browser. Send users to the page that has both options and a clear
    // chooser. (Docker's installer page actually auto-detects.)
    return "https://www.docker.com/products/docker-desktop/";
  }
  if (/Win/i.test(ua)) {
    return "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe";
  }
  return "https://www.docker.com/products/docker-desktop/";
}

/** OS-aware Tailscale direct download URL. */
function tailscaleDownloadURL(): string {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) {
    // Mac App Store link — opens the App Store app directly.
    return "https://apps.apple.com/us/app/tailscale/id1475387142";
  }
  if (/Win/i.test(ua)) {
    return "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe";
  }
  return "https://tailscale.com/download";
}
