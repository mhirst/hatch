# Sharing Hatch with a teammate

You have a working installer. Here's how to actually try it with someone.

## What you'll send them

Two things:

1. **A link to the latest installer** — point them at https://github.com/mhirst/hatch/releases/latest. They pick the right file for their OS:
   - Windows: `Hatch-Setup-X.Y.Z.exe`
   - Mac (Apple Silicon): `Hatch-X.Y.Z-arm64.dmg`
   - Mac (Intel): `Hatch-X.Y.Z.dmg`
2. **An invite page** — a single self-contained HTML file you generate inside Hatch ("Invite" button on any deployed app). It has the Tailscale download link, your tailnet name, and the URL to your app.

Send both via DM, email, AirDrop, or a shared drive. The teammate doesn't need any of the source.

## What the teammate does

1. **Run the installer.** Windows SmartScreen will warn ("unrecognized publisher") because we haven't signed it yet — they click "More info → Run anyway." Mac will require right-click → Open the first time. After that it's a normal app.
2. **Launch Hatch.** It pops up, asks them to set up their org, then **automatically gates on the onboarding screen**: Docker + Tailscale must be installed and running. Each row has a button that opens the right install/login URL. The screen polls every few seconds and auto-advances when both go green.
3. **Open your invite.** The HTML page walks them through:
   - Install Tailscale → join your tailnet
   - Click the cobalt button → opens your shared app
   - Done. No accounts, no passwords.

If the teammate just wants to *use* a shared app and doesn't need to deploy their own, they can skip step 1 entirely — installing Tailscale and clicking the link in the invite page is enough.

## Pre-flight checklist for you

Before you DM the installer:

- [ ] Tailscale is signed in on your machine (`tailscale status` says Running)
- [ ] At least one app is deployed in Hatch (e.g. `hello-test`)
- [ ] You have a real `https://your-host.your-tailnet.ts.net/...` URL for the app, not a `localhost:NNNN` URL — only achievable when Tailscale Serve is configured (see TROUBLESHOOTING.md if it's still showing localhost)

If your URL still says `localhost`, the teammate can't reach it from their laptop — that's the one thing that has to work for the invite to be useful.

## What this gets you

- **Real demo loop**: 5 minutes from "here's a file" to "they're using your dashboard"
- **No SaaS, no cloud account, no IT ticket**: the data stays on your machine
- **Reversible**: revoke their access from your Hatch dashboard with one click

## When you'd want to upgrade

If the test goes well and you want this to feel less prototype-y:

1. **Sign the installer** (see `desktop/SIGNING.md`). Removes the SmartScreen / Gatekeeper warnings.
2. **Host the installer somewhere stable** — GitHub Releases is one click. Then the invite page can link directly there.
3. **Tighten the per-app ACL** — currently the daemon's ACL row is recorded but not enforced at the network layer. A teammate on your tailnet today can technically reach any of your shared apps if they know the URL. That's fine for trusted-tailnet teams, less fine for orgs with strict need-to-know boundaries. Wiring `tailscale serve --auth` per-path is a known follow-up.
