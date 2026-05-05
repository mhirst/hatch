/**
 * First-run prerequisite check.
 *
 * Hatch needs Docker (running) and Tailscale (signed in) to actually do
 * anything. Rather than dumping a teammate into the dashboard with broken
 * deploys, we gate the whole app on these two until they're green. Polls
 * the daemon's /health endpoint every 3s; auto-advances when both go green.
 *
 * Each row links out to the right install/login URL and shows a friendly
 * status. The user is never asked to run a command.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card, HeroShape, Hairline, Mono } from "./ui";

interface Health {
  ok: boolean;
  docker: boolean;
  tailscale: string;
}

type DockerState = "ok" | "missing" | "stopped";
type TailscaleState = "ok" | "missing" | "needs-login" | "stopped";

interface Status {
  docker: DockerState;
  tailscale: TailscaleState;
}

function classify(h: Health): Status {
  return {
    docker: h.docker ? "ok" : "stopped",
    tailscale:
      h.tailscale === "Running"
        ? "ok"
        : h.tailscale === "unavailable"
          ? "missing"
          : h.tailscale === "NeedsLogin"
            ? "needs-login"
            : "stopped",
  };
}

export function Onboarding({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        const h = (await api.health()) as Health;
        const s = classify(h);
        setStatus(s);
        if (s.docker === "ok" && s.tailscale === "ok") {
          onReady();
          return;
        }
      } catch {
        // daemon hiccup — try again
      }
      setTimeout(tick, 3000);
    }
    tick();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <div className="max-w-lg mx-auto pt-6">
      <HeroShape className="mx-auto mb-8" />
      <h1 className="font-serif text-4xl mb-2 text-paper">Two quick things.</h1>
      <p className="text-ash text-sm mb-8 leading-relaxed">
        Hatch builds containers with Docker and shares them over Tailscale.
        Both are free and easy to install — Hatch will pick up automatically
        once they're running.
      </p>

      <div className="space-y-3">
        <CheckRow
          title="Docker Desktop"
          status={status?.docker ?? "stopped"}
          missingHint="Install Docker Desktop"
          stoppedHint="Start Docker Desktop"
          downloadUrl="https://www.docker.com/products/docker-desktop"
        />
        <CheckRow
          title="Tailscale"
          status={status?.tailscale ?? "stopped"}
          missingHint="Install Tailscale"
          stoppedHint="Start Tailscale"
          needsLoginHint="Sign in to Tailscale"
          downloadUrl="https://tailscale.com/download"
        />
      </div>

      <Hairline className="my-8" />

      <p className="text-xs text-ash">
        Tip: this screen polls every few seconds. Once both rows are green,
        Hatch jumps straight to the dashboard.
      </p>
    </div>
  );
}

function CheckRow({
  title,
  status,
  missingHint,
  stoppedHint,
  needsLoginHint,
  downloadUrl,
}: {
  title: string;
  status: DockerState | TailscaleState;
  missingHint: string;
  stoppedHint: string;
  needsLoginHint?: string;
  downloadUrl: string;
}) {
  const isOk = status === "ok";
  const dot =
    status === "ok"
      ? "bg-cobalt"
      : status === "needs-login"
        ? "bg-mustard"
        : "bg-vermilion";
  const label =
    status === "ok"
      ? "Connected"
      : status === "missing"
        ? "Not installed"
        : status === "needs-login"
          ? "Needs sign-in"
          : "Not running";

  const ctaLabel =
    status === "ok"
      ? null
      : status === "missing"
        ? missingHint
        : status === "needs-login"
          ? (needsLoginHint ?? stoppedHint)
          : stoppedHint;

  function open() {
    const url = downloadUrl;
    if (window.hatch) {
      window.hatch.shell.openExternal(url);
    } else {
      window.open(url, "_blank", "noreferrer");
    }
  }

  return (
    <Card tone="raised" className={`!p-5 ${isOk ? "border-cobalt/40" : ""}`}>
      <div className="flex items-center gap-4">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
        <div className="flex-1">
          <p className="text-sm font-medium text-paper">{title}</p>
          <p className="text-xs text-ash">{label}</p>
        </div>
        {ctaLabel && (
          <Button variant="cobalt" onClick={open}>
            {ctaLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
