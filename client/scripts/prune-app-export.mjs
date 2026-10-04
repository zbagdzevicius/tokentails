// Removes web-only media from the Capacitor export in out/ (run by `npm run build:app`).
// The landing showreel never plays in app builds (HeistSection shows the poster), so its ~6 MB
// of video must not ship inside the app. `check-app-export.mjs` asserts these are gone.
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Paths under out/ that app builds never use. */
export const WEB_ONLY_FILES = Object.freeze([
  "landing/heist-reel-v1.mp4",
  "landing/heist-reel-v1.webm",
]);

export function pruneAppExport(outDir) {
  const removed = [];
  for (const file of WEB_ONLY_FILES) {
    const full = join(outDir, file);
    if (existsSync(full)) {
      rmSync(full);
      removed.push(file);
    }
  }
  return removed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] || "out");
  const removed = pruneAppExport(outDir);
  console.log(`App export prune: removed ${removed.length} web-only file(s) from ${outDir}.`);
}
