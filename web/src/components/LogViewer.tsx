/**
 * Daemon log viewer. The daemon writes its stdout/stderr to a file managed by
 * the Electron main process. We can't read the file directly from a sandboxed
 * renderer, so v1 just opens it in the OS's file manager via the bridge. v2
 * could add an SSE endpoint on the daemon to stream logs in-window — slated
 * for a later session.
 */
import { Button, Card, Mono, Shapes } from "./ui";

export function LogViewer({ onClose }: { onClose: () => void }) {
  const bridge = window.hatch;
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
          Hatch writes daemon logs to <Mono tone="paper">~/Library/Application Support/Hatch/logs/</Mono>{" "}
          on macOS, or <Mono tone="paper">%APPDATA%\Hatch\logs\</Mono> on Windows.
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
