/**
 * Settings panel — Electron-only. Renders nothing if `window.hatch` isn't
 * present (i.e., we're running the renderer in pure-web dev mode).
 */
import { useEffect, useState } from "react";
import { Button, Card, Hairline, Input, Label, Mono, Shapes } from "./ui";

interface HatchSettings {
  autoStart: boolean;
  daemonPort: number;
  notifyOnAccess: boolean;
  appVersion: string;
  daemonUrl: string;
  logsDir: string;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const bridge = window.hatch;
  const [s, setS] = useState<HatchSettings | null>(null);
  const [port, setPort] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.settings.get().then((v) => {
      setS(v);
      setPort(String(v.daemonPort));
    });
  }, []);

  if (!bridge) {
    return (
      <Card tone="raised">
        <p className="text-sm text-paper-2">
          Settings are only available in the desktop app.
        </p>
        <div className="mt-4">
          <Button onClick={onClose}>Back</Button>
        </div>
      </Card>
    );
  }
  if (!s) return <p className="text-ash text-sm">Loading…</p>;

  async function setFlag(patch: Partial<HatchSettings>) {
    await bridge!.settings.set(patch);
    setS({ ...s!, ...patch });
    setDirty(true);
  }

  async function savePort() {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) return;
    await bridge!.settings.set({ daemonPort: n });
    setS({ ...s!, daemonPort: n });
    setDirty(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-3xl text-paper">Settings</h1>
          <Shapes />
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      {dirty && (
        <p className="text-xs text-mustard">
          Some changes (daemon port) take effect on next launch.
        </p>
      )}

      <Card tone="raised">
        <Label>App</Label>
        <p className="text-sm text-paper-2 mb-4">Version <Mono tone="paper">{s.appVersion}</Mono></p>

        <Hairline className="my-4" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-paper">Start Hatch when I log in</p>
            <p className="text-xs text-ash">Launches in the background; access via the tray icon.</p>
          </div>
          <Toggle on={s.autoStart} onChange={(v) => setFlag({ autoStart: v })} />
        </div>

        <Hairline className="my-4" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-paper">Notify when teammates connect</p>
            <p className="text-xs text-ash">Native notification when access is granted to a shared app.</p>
          </div>
          <Toggle on={s.notifyOnAccess} onChange={(v) => setFlag({ notifyOnAccess: v })} />
        </div>
      </Card>

      <Card tone="raised">
        <Label>Daemon</Label>
        <div className="flex items-end gap-3 mb-3">
          <div className="flex-1">
            <Label>Port</Label>
            <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="4592" />
          </div>
          <Button variant="cobalt" onClick={savePort}>Save</Button>
        </div>
        <p className="text-xs text-ash">
          URL: <Mono tone="paper">{s.daemonUrl}</Mono>
        </p>
      </Card>

      <Card tone="raised">
        <Label>Logs</Label>
        <p className="text-xs text-ash mb-3">
          <Mono tone="paper">{s.logsDir}</Mono>
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => bridge.shell.openLogs()}>
            Open logs folder
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-pill transition-colors ${on ? "bg-cobalt" : "bg-ink-3"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
