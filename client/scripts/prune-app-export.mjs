// Removes web-only media from the Capacitor export in out/ (run by `npm run build:app`).
// The landing showreel and trailer never play in app builds (HeistSection shows the poster;
// SwordcatSection, RaveSection and BadcatSection are web only), so their video must not ship inside the app. `check-app-export.mjs` asserts these are gone.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Paths under out/ that app builds never use. */
export const WEB_ONLY_FILES = Object.freeze([
  "landing/heist-reel-v1.mp4",
  "landing/heist-reel-v1.webm",
  // The Pink Paw Knight trailer: SwordcatSection never renders in app builds.
  "landing/pinkpaw-knight-trailer-v1.mp4",
  "landing/pinkpaw-knight-trailer-v1.webm",
  // The Moon Rave promo reel and its posters: RaveSection never renders in app builds.
  "landing/rave/rave-promo-v3-16x9.mp4",
  "landing/rave/rave-promo-v3-9x16.mp4",
  "landing/rave/rave-promo-v3-poster-16x9.jpg",
  "landing/rave/rave-promo-v3-poster-9x16.jpg",
  // Bad Cat Daily's poster and picker art: BadcatSection and the picker card never render in app builds.
  "landing/badcat/badcat-poster-v1.webp",
  "game-select/badcat-preview@2x.webp",
  // The Moon Rave picker art: the picker card never renders in app builds (raveEntryEnabled).
  "game-select/rave-preview@2x.webp",
  // The Formula Meow picker art: the picker card never renders in app builds (formulaMeowEntryEnabled).
  "game-select/formula-meow-preview@2x.webp",
  // The blog RSS (scripts/build-feed-rss.mjs) is written by web builds and covers web-only articles.
  "feed/rss.xml",
]);

/** Blog images named web-* (client/public/feed/web-*) belong to web-only articles and cards (lib/feed/engine.ts WEB_ONLY_MEDIA). */
export const WEB_ONLY_PREFIXES = Object.freeze([
  "feed/web-",
  // Moon Rave second track: web only (the mix segments are about 62 MB and /rave is not in the app).
  "music/back-on-track-v1/bot-v1-",
]);

/** Whole folders under out/ that app builds never use. */
export const WEB_ONLY_DIRS = Object.freeze([
  // The web home page (about 105 MB with its videos): the app starts at pages/index.tsx, and the
  // export has no rewrite that could serve it (docs/CLIENT.md "Home page (/)").
  "home",
]);

/** Every file under out/ that matches a web-only prefix. */
export function webOnlyPrefixed(outDir) {
  const found = [];
  for (const prefix of WEB_ONLY_PREFIXES) {
    const dir = prefix.slice(0, prefix.lastIndexOf("/"));
    const start = prefix.slice(prefix.lastIndexOf("/") + 1);
    const full = join(outDir, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full)) if (name.startsWith(start)) found.push(`${dir}/${name}`);
  }
  return found;
}

export function pruneAppExport(outDir) {
  const removed = [];
  for (const dir of WEB_ONLY_DIRS) {
    const full = join(outDir, dir);
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
      removed.push(`${dir}/`);
    }
  }
  for (const file of webOnlyPrefixed(outDir)) {
    rmSync(join(outDir, file));
    removed.push(file);
  }
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
