#!/usr/bin/env node
/**
 * Bundle guard (plan F1, task 7b): test, capture and forced-crash hooks must not ship.
 *
 *   node scripts/check-bundle-hooks.mjs .next/static          # web production build
 *   node scripts/check-bundle-hooks.mjs out/_next/static      # app (Capacitor) export
 *   node scripts/check-bundle-hooks.mjs --json <dir>...       # machine-readable result
 *
 * Every hook sits behind an inlined `process.env.NODE_ENV` / `NEXT_PUBLIC_E2E` /
 * `NEXT_PUBLIC_CAPTURE` check, so a build without those flags drops the code and its strings. A
 * marker found here means a hook escaped its gate (for example a check hidden inside a helper the
 * minifier cannot see through). Exit 1 lists each file with the markers it contains.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Marker name -> pattern. Keep in step with the hooks in context/auth/adapter.ts,
 *  context/GameContext.tsx, components/Phaser/look/*, components/Phaser/onboarding/ftue-store.ts
 *  and components/errors/crash-probe.tsx. */
export const HOOK_MARKERS = {
  "__TT_TEST__": /__TT_TEST__/,
  "__TT_E2E*": /__TT_E2E/,
  "__TT_CAPTURE__": /__TT_CAPTURE__/,
  "forced crash": /crash \(E2E\)/,
};

const SCANNED = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCANNED.has(path.extname(entry.name))) yield full;
  }
}

/**
 * Scans `dirs` and returns `{ scanned, findings: [{ file, markers }] }`. A missing directory is an
 * error (a guard that scanned nothing must not pass).
 */
export function scanBundles(dirs, markers = HOOK_MARKERS) {
  const findings = [];
  let scanned = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`check-bundle-hooks: ${dir} is not a directory (build first)`);
    }
    for (const file of walk(dir)) {
      // Source maps quote the original source, comments included; they are not shipped to users
      // by the web build, and the app export does not emit them. Skip them, scan everything else.
      if (file.endsWith(".map")) continue;
      scanned += 1;
      const text = fs.readFileSync(file, "utf8");
      const hit = Object.entries(markers)
        .filter(([, re]) => re.test(text))
        .map(([name]) => name);
      if (hit.length) findings.push({ file, markers: hit });
    }
  }
  return { scanned, findings };
}

function main(argv) {
  const json = argv.includes("--json");
  const dirs = argv.filter((a) => a !== "--json");
  if (!dirs.length) {
    console.error("usage: check-bundle-hooks.mjs [--json] <dir>...");
    return 2;
  }
  let result;
  try {
    result = scanBundles(dirs);
  } catch (error) {
    console.error(String(error.message || error));
    return 1;
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.findings.length) {
    console.error("Test, capture or forced-crash hook markers found in the bundle:");
    result.findings.forEach((f) => console.error(`  ${f.file}: ${f.markers.join(", ")}`));
  } else {
    console.log(`check-bundle-hooks: ${result.scanned} files in ${dirs.join(", ")}, no hook markers`);
  }
  // Annotations go to stdout, so they are skipped with --json: stdout must stay one JSON document.
  if (!json && result.findings.length && process.env.GITHUB_ACTIONS) {
    result.findings.forEach((f) => console.log(`::error file=${f.file}::hook markers in the bundle: ${f.markers.join(", ")}`));
  }
  return result.findings.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
