/**
 * Help view — accessible from the header at any time. Re-renders the same
 * explanations from onboarding, plus FAQ-style answers to the questions
 * that come up after a user has actually used Hatch for a few minutes.
 *
 * Kept short on purpose: anything longer goes in the README/docs site;
 * this is for "I'm in the app right now and confused" moments.
 */
import { useEffect, useState } from "react";
import { api, type TailscaleStatus } from "../lib/api";
import { Button, Card, Hairline, Mono, Shapes } from "./ui";

export function Help({ onClose }: { onClose: () => void }) {
  const [ts, setTs] = useState<TailscaleStatus | null>(null);

  useEffect(() => {
    api.tailscale().then(setTs).catch(() => {});
  }, []);

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-3xl text-paper">Help</h1>
          <Shapes />
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <Topic title="What is Hatch?">
        Hatch lets you share little apps you build (dashboards, forms,
        scripts that grew a UI) with your team. The apps run on your laptop;
        teammates reach them through Tailscale. None of your data leaves
        your machine.
      </Topic>

      <Topic title="What is Docker, and why do I need it?">
        Docker runs each of your apps in its own little box (a "container").
        Containers stop your apps from conflicting with each other, with
        your laptop's regular software, or with other Hatch apps. You don't
        have to know anything about Docker to use Hatch — it just needs to
        be installed and running. Hatch handles the rest.
      </Topic>

      <Topic title="What is Tailscale, and why do I need it?">
        Tailscale is a private network just for you and your team. When you
        share an app, your teammates reach it through Tailscale — never the
        open internet. Sign in once with your Google or Microsoft account;
        invite teammates from{" "}
        <Link href="https://login.tailscale.com/admin/users">
          tailscale.com/admin/users
        </Link>
        .
      </Topic>

      <Topic title="What's my tailnet?">
        Your tailnet is the name Tailscale gave your private network.
        {ts?.host ? (
          <>
            {" "}
            Yours is{" "}
            <Mono tone="paper">{ts.host.replace(/^[^.]+\./, "")}</Mono>
            {" "}— share that with teammates so they sign into the same one.
          </>
        ) : (
          " It looks like `name.ts.net`. You'll see it once Tailscale is signed in."
        )}
      </Topic>

      <Topic title="Why do my app URLs say localhost?">
        That means Tailscale Serve hasn't published the app yet. Most of the
        time this fixes itself within a minute of deploying — Hatch retries
        automatically. If a URL stays at localhost for more than a couple of
        minutes, the most common causes are:
        <ul className="mt-2 list-disc list-inside space-y-1 text-paper-2">
          <li>Tailscale needs HTTPS certificates enabled in your tailnet
            (admin console → DNS → enable HTTPS).</li>
          <li>Your tailnet doesn't allow Serve for free accounts. Solo
            personal tailnets can; some org tailnets restrict it.</li>
        </ul>
      </Topic>

      <Topic title="What happens when I quit Hatch?">
        Hatch stops the daemon, which stops every container, which makes
        every shared app unreachable. Re-open Hatch and they all come back.
        If you want apps available 24/7, set Hatch to start on login from
        Settings.
      </Topic>

      <Topic title="How do I revoke a teammate's access?">
        Click <strong>Manage</strong> on any app, find their email under
        "Teammates with access", click <strong>Revoke</strong>. Takes effect
        immediately.
      </Topic>

      <Topic title="Where do my logs go?">
        On macOS:{" "}
        <Mono tone="paper">~/Library/Application Support/Hatch/logs/</Mono>.
        On Windows: <Mono tone="paper">%APPDATA%\Hatch\logs\</Mono>. The
        Logs page in the header has a button that opens that folder.
      </Topic>

      <Hairline />

      <p className="text-xs text-ash">
        Still stuck? Open an issue at{" "}
        <Link href="https://github.com/mhirst/hatch/issues">
          github.com/mhirst/hatch/issues
        </Link>
        .
      </p>
    </div>
  );
}

function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card tone="raised">
      <h2 className="font-serif text-xl text-paper mb-2">{title}</h2>
      <div className="text-sm text-paper-2 leading-relaxed">{children}</div>
    </Card>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    if (window.hatch) {
      void window.hatch.shell.openExternal(href);
    } else {
      window.open(href, "_blank", "noreferrer");
    }
  }
  return (
    <a href={href} onClick={open} className="text-cobalt hover:text-rose underline">
      {children}
    </a>
  );
}
