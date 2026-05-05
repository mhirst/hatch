/**
 * Build the Go daemon and stage it where electron-builder will pick it up.
 *
 *   npm run build:daemon
 *
 * This is a thin wrapper around `go build`, but it also handles:
 *   - target platform inference (host by default; override with HATCH_TARGET)
 *   - Windows-vs-Unix binary naming
 *   - copying into resources/bin so electron-builder bundles it as
 *     extraResources (see "build" in package.json)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const repoRoot = resolve(desktopRoot, "..");
const daemonDir = join(repoRoot, "daemon");

const target = process.env.HATCH_TARGET ?? `${process.platform}-${process.arch}`;
const [goos, goarch] = (() => {
  // Map node platform/arch tuples to Go's GOOS/GOARCH naming.
  const [p, a] = target.split("-");
  const os = { darwin: "darwin", linux: "linux", win32: "windows" }[p ?? ""] ?? p;
  const arch = { x64: "amd64", arm64: "arm64" }[a ?? ""] ?? a;
  return [os ?? process.platform, arch ?? process.arch];
})();

const outName = goos === "windows" ? "hatchd.exe" : "hatchd";
const stagingDir = join(desktopRoot, "resources", "bin");
mkdirSync(stagingDir, { recursive: true });
const outPath = join(stagingDir, outName);

console.log(`→ building hatchd for ${goos}/${goarch}`);
console.log(`  daemon dir: ${daemonDir}`);
console.log(`  output:     ${outPath}`);

if (!existsSync(daemonDir)) {
  console.error(`daemon directory not found at ${daemonDir}`);
  process.exit(1);
}

execFileSync(
  "go",
  ["build", "-trimpath", "-ldflags=-s -w", "-o", outPath, "./cmd/hatchd"],
  {
    cwd: daemonDir,
    stdio: "inherit",
    env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: "0" },
  },
);

console.log(`✓ wrote ${outPath}`);
