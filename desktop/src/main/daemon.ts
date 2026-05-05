/**
 * Daemon supervisor.
 *
 * Spawns the bundled `hatchd` (or `hatchd.exe`) sidecar, waits for it to
 * answer `/health`, and surfaces lifecycle events. On quit we send SIGTERM
 * (or `taskkill /T` on Windows), wait briefly, and SIGKILL if it doesn't
 * cooperate. We never run more than one daemon — single-instance lock in
 * `index.ts` already guards against double-spawn.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { app } from "electron";

export interface DaemonOptions {
  port: number;
}

export class Daemon {
  private proc: ChildProcess | null = null;
  private logStream: NodeJS.WritableStream | null = null;
  readonly port: number;

  constructor(opts: DaemonOptions) {
    this.port = opts.port;
  }

  isRunning() {
    return this.proc !== null && this.proc.exitCode === null;
  }

  baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    if (this.isRunning()) return;

    const binary = resolveBinary();
    if (!binary) {
      throw new Error(
        "hatchd binary not found. Run `npm run build:daemon` to build it before launching the desktop app.",
      );
    }

    // Friendly diagnostic: if something else is already on this port (a stray
    // daemon from a previous session, another app), tell the user what we
    // found instead of letting hatchd's exit cascade into a confusing
    // "write after end" stack from the unhealthy poll loop.
    const occupant = await whoIsOnPort(this.port);
    if (occupant !== null) {
      throw new Error(
        `Port ${this.port} is already in use by PID ${occupant}. ` +
          `Quit the other process (or change the port in Settings) and relaunch Hatch.`,
      );
    }

    const logDir = join(app.getPath("userData"), "logs");
    mkdirSync(logDir, { recursive: true });
    this.logStream = createWriteStream(join(logDir, "hatchd.log"), { flags: "a" });

    // Capture stderr separately so we can surface the daemon's own error
    // line on the rare exit-during-startup path.
    let stderrTail = "";
    const proc = spawn(binary, ["-addr", `127.0.0.1:${this.port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc = proc;

    proc.stdout?.on("data", (b) => this.safeWrite(b));
    proc.stderr?.on("data", (b) => {
      stderrTail = (stderrTail + b.toString()).slice(-2000);
      this.safeWrite(b);
    });
    proc.on("exit", (code, signal) => {
      this.safeWrite(`\n[hatchd exited code=${code} signal=${signal}]\n`);
      this.proc = null;
      // Closing the stream releases the file handle and prevents any further
      // writes (the original ERR_STREAM_WRITE_AFTER_END came from a write to
      // an already-closed stream after exit).
      this.logStream?.end();
      this.logStream = null;
    });

    try {
      await this.waitForHealthy(15_000);
    } catch (err) {
      // If the daemon never came up, attach whatever it printed to stderr so
      // the user sees the actual cause (port conflict, missing dep, etc.).
      const tail = stderrTail.trim();
      throw new Error(
        `${(err as Error).message}${tail ? `\n\nDaemon stderr:\n${tail}` : ""}`,
      );
    }
  }

  /** Write to the log stream only if it's still open. */
  private safeWrite(chunk: string | Buffer) {
    const s = this.logStream;
    if (!s || (s as { writableEnded?: boolean }).writableEnded) return;
    try {
      s.write(chunk);
    } catch {
      /* swallow — the stream raced to close. */
    }
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    return new Promise<void>((resolve) => {
      const onExit = () => resolve();
      proc.once("exit", onExit);

      if (process.platform === "win32" && typeof proc.pid === "number") {
        // /T kills child tree; /F is forceful.
        spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true });
      } else {
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 4000);
      }

      // Hard cap so we never hang a quit forever.
      setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve();
      }, 6000);
    });
  }

  private async waitForHealthy(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    let lastErr: unknown = null;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl()}/api/v1/health`);
        if (res.ok) return;
      } catch (err) {
        lastErr = err;
      }
      await sleep(250);
    }
    throw new Error(
      `daemon did not become healthy in ${timeoutMs}ms (last error: ${String(lastErr)})`,
    );
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Return the PID currently bound to a TCP port, or null if the port is free.
 * On Windows we shell out to netstat (always present); on Unix we use lsof
 * which is available on macOS and most Linux distros. Failures return null
 * so we fall through to the normal start path — the daemon's own bind error
 * will then surface in stderr.
 */
async function whoIsOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "netstat" : "lsof";
    const args = isWin ? ["-ano"] : ["-iTCP:" + port, "-sTCP:LISTEN", "-Pn"];

    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const lines = out.split(/\r?\n/);
      if (isWin) {
        // Look for "  TCP    127.0.0.1:<port>   ...   LISTENING   <pid>"
        const re = new RegExp(`:${port}\\s.*LISTENING\\s+(\\d+)`);
        for (const line of lines) {
          const m = re.exec(line);
          if (m) {
            resolve(Number(m[1]));
            return;
          }
        }
      } else {
        // lsof prints a header line; the second column of each data row is the PID.
        for (const line of lines.slice(1)) {
          const cols = line.trim().split(/\s+/);
          const pid = Number(cols[1]);
          if (Number.isInteger(pid) && pid > 0) {
            resolve(pid);
            return;
          }
        }
      }
      resolve(null);
    });
  });
}

/**
 * Find the bundled hatchd binary. Order:
 *   1. Packaged: <process.resourcesPath>/bin/hatchd[.exe]
 *   2. Dev: <projectRoot>/resources/bin/hatchd[.exe]
 *   3. Dev fallback: <projectRoot>/../daemon/hatchd[.exe]  (already-built locally)
 */
function resolveBinary(): string | null {
  const exe = process.platform === "win32" ? "hatchd.exe" : "hatchd";
  const candidates = [
    join(process.resourcesPath ?? "", "bin", exe),
    join(app.getAppPath(), "resources", "bin", exe),
    join(app.getAppPath(), "..", "daemon", exe),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
