// Cross-platform replacement for `cp -r dist ../daemon/web/`. Copies the
// Vite build output into the location the Go daemon serves from.
import { cp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "dist");
const dst = resolve(here, "..", "..", "daemon", "web", "dist");

await rm(dst, { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} → ${dst}`);
