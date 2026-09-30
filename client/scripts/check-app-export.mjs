// Fails when the Capacitor web bundle in out/ is missing or incomplete.
// Run after `npm run build:app`; Capacitor copies out/ into the native apps.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.argv[2] || "out");

// The app starts at index.html. The rest are routes the app navigates to,
// including the client routes that replace the web-only dynamic pages.
const requiredFiles = [
  "index.html",
  "404.html",
  "game.html",
  "cats.html",
  "cats/view.html",
  "feed.html",
  "feed/article.html",
  "packs.html",
  "box.html",
];

const missing = requiredFiles.filter((file) => !existsSync(join(outDir, file)));

if (!existsSync(join(outDir, "_next", "static"))) {
  missing.push("_next/static/");
}

if (missing.length) {
  console.error(`App export check failed: missing in ${outDir}:`);
  missing.forEach((file) => console.error(`  - ${file}`));
  console.error('Run "npm run build:app" (static export needs NEXT_PUBLIC_IS_APP).');
  process.exit(1);
}

const index = readFileSync(join(outDir, "index.html"), "utf8");
if (!index.includes("/_next/static/")) {
  console.error("App export check failed: out/index.html does not load the Next bundle.");
  process.exit(1);
}

console.log(`App export check passed: ${requiredFiles.length} routes in ${outDir}.`);
