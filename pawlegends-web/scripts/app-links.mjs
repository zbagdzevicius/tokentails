#!/usr/bin/env node
// Party links open the app (docs/plans/moba/DEEP-LINKS.md). Writes the association files in public/ from
// app-links.json; with --check (npm prebuild) only verifies them and exits 1, loudly, when a fingerprint is malformed
// or a committed file differs, so a wrong file never ships.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { problems, outputs } = require("../lib/appLinks.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const cfg = JSON.parse(readFileSync(join(root, "app-links.json"), "utf8"));

const bad = problems(cfg);
if (bad.length) {
  console.error(`\n[app-links] app-links.json is wrong, refusing to publish association files:\n  - ${bad.join("\n  - ")}\n`);
  process.exit(1);
}

const stale = [];
for (const [rel, text] of Object.entries(outputs(cfg))) {
  const file = join(root, "public", rel);
  const have = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (have === text) continue;
  if (check) {
    stale.push(rel);
    continue;
  }
  if (text === null) rmSync(file);
  else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  console.log(`[app-links] ${text === null ? "removed" : "wrote"} public/${rel}`);
}
if (stale.length) {
  console.error(`\n[app-links] public/ does not match app-links.json: ${stale.join(", ")}. Run \`node scripts/app-links.mjs\` and commit.\n`);
  process.exit(1);
}
if (!cfg.android.sha256.length)
  console.warn("[app-links] WARNING: no Android fingerprint in app-links.json: assetlinks.json is not published, so Android opens party links in the browser (founder step in docs/plans/moba/DEEP-LINKS.md).");
if (check) console.log("[app-links] association files match app-links.json");
