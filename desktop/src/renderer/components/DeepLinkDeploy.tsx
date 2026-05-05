/**
 * Modal that fires when the app receives a hatch://deploy?path=...&name=...
 * deep link. We don't auto-deploy — we show a confirmation card with the
 * folder + name, let the user click Deploy. This protects against malicious
 * deep links sent via email or chat.
 */
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card, Mono, Shapes } from "./ui";

interface Props {
  payload: { path: string; name: string };
  onClose: () => void;
  onDeployed: () => void;
}

export function DeepLinkDeploy({ payload, onClose, onDeployed }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deploy() {
    setBusy(true);
    setErr(null);
    try {
      await api.deploy(payload.name, payload.path);
      onDeployed();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <Card tone="raised" className="max-w-md w-full mx-6">
        <Shapes className="mb-3" />
        <h2 className="font-serif text-2xl text-paper mb-2">Deploy this app?</h2>
        <p className="text-sm text-paper-2 mb-4">
          A <Mono tone="paper">hatch://</Mono> link asked Hatch to deploy a folder.
          Confirm before continuing — only deploy folders you recognize.
        </p>
        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs uppercase tracking-tight text-ash mb-1">name</p>
            <p className="text-sm text-paper"><Mono tone="paper">{payload.name}</Mono></p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-tight text-ash mb-1">path</p>
            <p className="text-sm text-paper break-all"><Mono tone="paper">{payload.path}</Mono></p>
          </div>
        </div>
        {err && <p className="text-sm text-vermilion mb-3">{err}</p>}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="cobalt" disabled={busy} onClick={deploy}>
            {busy ? "Deploying…" : "Deploy"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
