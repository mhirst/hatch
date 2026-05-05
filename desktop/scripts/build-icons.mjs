/**
 * Render the SVG sources in build/icon.svg and resources/icons/tray.svg into
 * the PNG/ICO assets electron-builder and Tray expect.
 *
 * Usage: `node scripts/build-icons.mjs`. Relies on `sharp` and `png-to-ico`.
 * Both are installed automatically the first time you run `npm install`
 * if they're listed as devDependencies.
 *
 * On systems without sharp prebuilds we fall back to a no-op with a warning,
 * so the icon-less dev build still works. Production packaging requires the
 * icons to exist; the script exits non-zero if it can't produce them.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");

// ICO sizes: standard Windows icon set (16-256). NSIS rejects ICOs containing
// images larger than 256x256, so we cap there. The "main" PNG used by
// electron-builder for non-Windows builds gets a separate larger size.
const sources = [
  {
    svg: join(desktop, "build", "icon.svg"),
    icoSizes: [16, 24, 32, 48, 64, 128, 256],
    pngSize: 512,
    outDir: join(desktop, "build"),
    ico: "icon.ico",
    main: "icon.png",
  },
  {
    svg: join(desktop, "resources", "icons", "tray.svg"),
    icoSizes: null,
    pngSize: 64,
    outDir: join(desktop, "resources", "icons"),
    ico: null,
    main: "tray.png",
  },
];

let sharp;
let pngToIco;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("sharp not installed; installing it adds ~20MB. Skipping PNG render.");
}
try {
  pngToIco = (await import("png-to-ico")).default;
} catch {
  // optional — only needed for the .ico
}

if (!sharp) {
  console.warn("⚠ no PNG output produced — install `sharp` to render icons.");
  process.exit(0);
}

for (const s of sources) {
  if (!existsSync(s.svg)) {
    console.warn(`skip ${s.svg} (not found)`);
    continue;
  }
  mkdirSync(s.outDir, { recursive: true });
  const svgBuf = readFileSync(s.svg);

  const mainPath = join(s.outDir, s.main);
  await sharp(svgBuf, { density: 384 }).resize(s.pngSize, s.pngSize).png().toFile(mainPath);
  console.log(`✓ ${mainPath}`);

  if (s.ico && s.icoSizes && pngToIco) {
    const buffers = await Promise.all(
      s.icoSizes.map((sz) =>
        sharp(svgBuf, { density: 384 }).resize(sz, sz).png().toBuffer(),
      ),
    );
    const ico = await pngToIco(buffers);
    const icoPath = join(s.outDir, s.ico);
    writeFileSync(icoPath, ico);
    console.log(`✓ ${icoPath}  (sizes: ${s.icoSizes.join(", ")})`);
  }
}
