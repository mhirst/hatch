/**
 * Invite page generator.
 *
 * Generates a single self-contained HTML page that bundles:
 *   - Hatch download link (Mac + Windows installers)
 *   - The operator's tailnet name
 *   - The teammate's email (so they know what to expect in their dashboard)
 *   - The shared app name and tailnet URL (if we know them)
 *   - Step-by-step that tells the teammate what to do
 *
 * The operator clicks "Generate invite", saves the .html file, and DMs it
 * to a teammate. The teammate opens it in a browser — no copy-paste of
 * three things from three Slack messages.
 */
import { useState } from "react";
import { Button, Card, Hairline, HeroShape, Input, Label, Mono } from "./ui";
import { api, type App as HatchApp } from "../lib/api";

interface Props {
  app: HatchApp;
  tailnetHost?: string;
  onClose: () => void;
}

export function Invite({ app, tailnetHost, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);

  async function generate() {
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      // Grant access first so the teammate's email is on the ACL.
      await api.share(app.name, email.trim());
      const html = renderInviteHtml({
        appName: app.name,
        tailnetUrl: app.tailnet_url ?? `http://localhost:${app.port}`,
        tailnetHost: tailnetHost ?? "your-tailnet",
        teammateEmail: email.trim(),
        ownerEmail: "the operator",
      });
      setGenerated(html);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!generated) return;
    const blob = new Blob([generated], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hatch-invite-${app.name}-${email.split("@")[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm overflow-auto py-12">
      <Card tone="raised" className="max-w-lg w-full mx-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl text-paper">Invite a teammate</h2>
          <button onClick={onClose} className="text-xs text-ash hover:text-paper">
            Close
          </button>
        </div>
        <p className="text-sm text-paper-2 mb-5">
          Generates a single HTML page that walks your teammate through
          installing Hatch, joining your tailnet, and opening this app.
        </p>

        <div className="space-y-3 mb-5">
          <div>
            <Label>App</Label>
            <Mono tone="paper">{app.name}</Mono>
          </div>
          <div>
            <Label>Teammate email</Label>
            <Input
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {err && <p className="text-sm text-vermilion mb-3">{err}</p>}

        {!generated ? (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="cobalt" onClick={generate} disabled={busy || !email}>
              {busy ? "Generating…" : "Generate invite"}
            </Button>
          </div>
        ) : (
          <>
            <Hairline className="my-5" />
            <p className="text-sm text-paper-2 mb-3">
              Invite ready. Save the page and share it however you like —
              email, Slack, AirDrop.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setGenerated(null)}>
                Generate another
              </Button>
              <Button variant="cobalt" onClick={download}>
                Save invite (.html)
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

interface InviteParams {
  appName: string;
  tailnetUrl: string;
  tailnetHost: string;
  teammateEmail: string;
  ownerEmail: string;
}

/**
 * The teammate-facing page. Self-contained — inlined CSS in the same dark +
 * brights palette, no fetches, no JS deps. We avoid the cream-colored serif
 * on a non-Hatch render because we can't guarantee the EB Garamond webfont
 * loads from the user's email client; system serif is a safe fallback.
 */
function renderInviteHtml(p: InviteParams): string {
  const appUrl = encodeAttr(p.tailnetUrl);
  const appName = escapeHtml(p.appName);
  const tailnetHost = escapeHtml(p.tailnetHost);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>You're invited to a Hatch app</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
    background: #1A1815;
    color: #F5F1EA;
    line-height: 1.6;
  }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 24px 96px; }
  h1, h2 { font-family: "EB Garamond", Georgia, serif; font-weight: 500; letter-spacing: -0.01em; margin: 0 0 12px; }
  h1 { font-size: 40px; }
  h2 { font-size: 22px; margin-top: 40px; }
  p { color: #EAE3D5; }
  .muted { color: #8C857C; font-size: 13px; }
  .card {
    border: 1px solid #2E2924;
    background: #231F1B;
    border-radius: 12px;
    padding: 20px;
    margin: 16px 0;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 10px 20px;
    border-radius: 999px;
    background: #3D52E2;
    color: #F5F1EA;
    text-decoration: none;
    font-weight: 500;
    font-size: 14px;
  }
  .pill.cream { background: #F5F1EA; color: #1A1815; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.92em; color: #F5F1EA; background: #2E2924; padding: 2px 6px; border-radius: 4px; }
  .step { display: flex; gap: 16px; margin: 24px 0; }
  .step .num {
    flex: 0 0 28px; height: 28px; border-radius: 999px;
    background: #D4A82B; color: #1A1815;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 14px;
  }
  .shapes { display: inline-flex; gap: 6px; vertical-align: middle; margin-left: 8px; }
  .shapes span { display: inline-block; width: 18px; height: 18px; }
  .s1 { background: #D4A82B; }
  .s2 { background: #3D52E2; border-radius: 50% 0 0 50%; }
  .s3 { background: #F5B9C9; border-radius: 50%; }
  .s4 { background: #E33627; border-radius: 0 50% 50% 0; }
  hr { border: 0; border-top: 1px solid #2E2924; margin: 40px 0; }
</style>
</head>
<body>
<div class="wrap">
  <p class="muted">Hatch invite</p>
  <h1>You're invited to use <em>${appName}</em>.
    <span class="shapes" aria-hidden>
      <span class="s1"></span><span class="s2"></span><span class="s3"></span><span class="s4"></span>
    </span>
  </h1>
  <p>
    Someone on your team built an internal app and shared it with
    <code>${escapeHtml(p.teammateEmail)}</code>. The app runs locally on
    their laptop and reaches you over Tailscale. Nothing leaves your network.
  </p>

  <h2>Three steps</h2>

  <div class="step">
    <div class="num">1</div>
    <div>
      <strong>Install Tailscale.</strong>
      <p class="muted">Free, takes about a minute.</p>
      <p><a class="pill" href="https://tailscale.com/download">Download Tailscale</a></p>
      <p class="muted">Sign in with the same Google or work account that the operator uses. You should land on tailnet <code>${tailnetHost}</code>.</p>
    </div>
  </div>

  <div class="step">
    <div class="num">2</div>
    <div>
      <strong>Open the app.</strong>
      <p class="muted">Once Tailscale is up, this link will work.</p>
      <p><a class="pill cream" href="${appUrl}">Open ${appName}</a></p>
      <p class="muted">Direct URL: <code>${escapeHtml(p.tailnetUrl)}</code></p>
    </div>
  </div>

  <div class="step">
    <div class="num">3</div>
    <div>
      <strong>That's it.</strong>
      <p class="muted">No accounts, no installs beyond Tailscale. The operator can revoke your access anytime.</p>
    </div>
  </div>

  <hr />

  <h2>Optional: install Hatch yourself</h2>
  <p>
    If you'd like to share your <em>own</em> internal apps with the team, you
    can install Hatch too. It's the same app the operator uses.
  </p>
  <p>
    <a class="pill" href="https://github.com/mhirst/hatch/releases">Download Hatch</a>
  </p>

  <hr />

  <p class="muted">
    This invite was generated for <code>${escapeHtml(p.teammateEmail)}</code>.
    Hatch is local-first and open source. If anything looks wrong, ask the
    person who sent it.
  </p>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeAttr(s: string): string {
  return escapeHtml(s);
}
