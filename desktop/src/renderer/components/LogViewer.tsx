/**
 * Daemon log viewer. The daemon writes its stdout/stderr to a file managed by
 * the Electron main process. We can't read the file directly from a sandboxed
 * renderer, so v1 just opens it in the OS's file manager via the bridge. v2
 * could add an SSE endpoint on the daemon to stream logs in-window — slated
 * for a later session.
 */
import { useEffect, useState } from "react";
import { Button, Card, Mono, Shapes } from "./ui";

export function LogViewer({ onClose }: { onClose: () => void }) {
  const bridge = window.hatch;
  const [logsDir, setLogsDir] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.settings
      .get()
      .then((raw) => setLogsDir((raw as { logsDir?: string }).logsDir ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-3xl text-paper">Logs</h1>
          <Shapes />
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <Card tone="raised">
        <p className="text-sm text-paper-2 mb-4">
          Hatch writes daemon stdout/stderr to:
        </p>
        <p className="text-sm text-paper mb-4">
          <Mono tone="paper">{logsDir ?? "(loading…)"}</Mono>
        </p>
        <div className="flex gap-3">
          <Button variant="cobalt" onClick={() => bridge?.shell.openLogs()}>
            Open logs folder
          </Button>
        </div>
        <p className="text-xs text-ash mt-4">
          A streaming in-app viewer is planned. For now, tail the file with
          your editor of choice.
        </p>
      </Card>
    </div>
  );
}
