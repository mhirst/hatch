# Code signing & distribution

Hatch ships unsigned by default — `npm run package` produces a working `.exe`
installer (Windows) and `.dmg` (macOS), but on first launch Windows SmartScreen
will warn and macOS Gatekeeper will require right-click → Open. That's fine
for sharing with teammates over a tailnet, less fine for public distribution.
This doc lists what you need when you're ready to sign.

## Windows (Authenticode)

You'll need a code-signing certificate. Two paths:

**OV (organization-verified)**: ~$150–300/year, smooths over SmartScreen after
some downloads but doesn't eliminate the first-run warning.

**EV (extended-validation)**: $300–600/year, ships on a hardware token (USB
HSM), but builds your SmartScreen reputation immediately. Recommended.

Once you have the cert exported (PFX) or accessible on the HSM:

```env
# .env at the project root
WIN_CSC_LINK=path/to/cert.pfx
WIN_CSC_KEY_PASSWORD=...
```

Or for an HSM-backed EV cert, configure `signtool.exe` once and add to
`package.json`:

```json
"win": {
  "signtoolOptions": {
    "sign": "node ./scripts/win-sign.cjs"
  }
}
```

…where the script invokes `signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "$0"`.

## macOS (Apple Developer signing + notarization)

You need:

1. An Apple Developer account ($99/year)
2. A "Developer ID Application" certificate in your login keychain
3. An app-specific password from appleid.apple.com for `notarytool`

Then add to your environment:

```env
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=path/to/cert.p12          # or rely on keychain
CSC_KEY_PASSWORD=...
```

`electron-builder` invokes `notarytool` automatically when those vars are set.
The first build will take 5–10 extra minutes for notarization to round-trip.

## Verifying

```bash
# macOS
codesign -dv --verbose=4 "dist/mac/Hatch.app"
spctl -a -t exec -vv "dist/mac/Hatch.app"

# Windows
sigcheck -m "dist/Hatch Setup 0.1.0.exe"
```

## Without certs

Until you have certs, ship the unsigned builds with a one-line note:

> "First-run only: right-click → Open on Mac, or click 'More info → Run anyway'
> on Windows. Hatch is unsigned because we're shipping fast — code is at
> github.com/yourhandle/hatch."

That's enough for technical teammates.
