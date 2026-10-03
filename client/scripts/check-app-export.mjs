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
  // Catnip Heist: the host page (pages/heist.tsx, plan G2 layer 1), the static build it embeds
  // (catnip-heist: `npm run build:client`, plan F12), and the forwarder at the old static path,
  // which app builds need because they have no server redirects.
  "heist.html",
  "heist-game/index.html",
  "heist/index.html",
  // Impact and claims (plan F7.2, F7.6, G11): the /impact page, the bundled impact baseline every
  // surface falls back to offline, and the public facts registry the Heist and Claim chips read.
  "impact.html",
  "impact/snapshot.json",
  "facts/facts.json",
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

// The Heist page must load its bundle from /heist-game/, the base build:client sets.
const heist = readFileSync(join(outDir, "heist-game", "index.html"), "utf8");
if (!/(src|href)="\/heist-game\/build\//.test(heist)) {
  console.error(
    'App export check failed: heist-game/index.html does not load /heist-game/build/ (rebuild with "npm run build:client" in catnip-heist).',
  );
  process.exit(1);
}

// The host page must embed the Heist in its static HTML (no client-only iframe).
const heistHost = readFileSync(join(outDir, "heist.html"), "utf8");
if (!/<iframe[^>]+src="\/heist-game\/index\.html\?embed=1"/.test(heistHost)) {
  console.error(
    "App export check failed: heist.html does not embed /heist-game/index.html?embed=1 in its HTML.",
  );
  process.exit(1);
}

// The old static path forwards to the host page, not straight into the build.
const forwarder = readFileSync(join(outDir, "heist", "index.html"), "utf8");
if (!forwarder.includes('location.replace("/heist"')) {
  console.error("App export check failed: heist/index.html does not forward to /heist.");
  process.exit(1);
}

// The bundled impact baseline must be a v1 snapshot, and the facts registry must parse and carry
// the public entries, so an offline app still renders impact numbers with their tiers.
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(join(outDir, file), "utf8"));
  } catch (error) {
    console.error(`App export check failed: ${file} is not valid JSON (${error.message}).`);
    process.exit(1);
  }
};
const snapshot = readJson("impact/snapshot.json");
if (!snapshot || snapshot._v !== 1 || typeof snapshot.money !== "object") {
  console.error("App export check failed: impact/snapshot.json is not a v1 impact snapshot (node scripts/snapshot-impact.mjs).");
  process.exit(1);
}
const facts = readJson("facts/facts.json");
const factList = Array.isArray(facts) ? facts : facts && (facts.facts || facts.entries);
if (!Array.isArray(factList) || factList.length === 0 || !factList.every((f) => f && typeof f.id === "string")) {
  console.error('App export check failed: facts/facts.json has no public facts (run "node funding/framework/bin/fund.mjs facts build").');
  process.exit(1);
}

console.log(`App export check passed: ${requiredFiles.length} routes in ${outDir}.`);
