#!/usr/bin/env node
/**
 * Codemod: legacy yellow utilities -> night design tokens (plan G6 "Codemod", F3.1; task 3d).
 *
 *   node scripts/codemods/night-tokens.mjs --dry           # report counts, write nothing
 *   node scripts/codemods/night-tokens.mjs                 # rewrite files in place
 *   node scripts/codemods/night-tokens.mjs --dry --json    # machine-readable report
 *   node scripts/codemods/night-tokens.mjs components/codex/Codex.tsx
 *   node scripts/codemods/night-tokens.mjs --all           # ignore the ownership exclusions
 *
 * Three steps, each counted in the report:
 *
 * 1. tt-cream exists. The token (`#fcecbb`, the same value the `yellow.300` override in
 *    tailwind.config.ts carries) must be in design/tokens.ts; the script stops if it is not.
 * 2. `yellow-300` -> `tt-cream` in every utility (`bg-`, `text-`, `border-`, `from-`, `via-`, `to-`,
 *    `ring-`, ...), with variants (`hover:`, `md:`), important (`!`) and opacity (`/50`) kept, plus
 *    `theme("colors.yellow.300")`. The colour is identical, so nothing changes on screen; what
 *    changes is that the surface now names a token, which lets the override go.
 * 3. `text-yellow-900` -> reviewed per surface. The surface is read from the class string the
 *    utility sits in:
 *      - a light surface (cream, white, yellow, amber, orange, pink, parchment, gold): gold ink,
 *        `text-tt-gold-ink` (#4a1d08, 9.53:1 on gold-400, more on cream);
 *      - a night surface (`bg-tt-night-*`, black, gray-800/900): cream ink, `text-tt-cream`;
 *      - no surface in the string (the colour is set for children on an inherited surface):
 *        gold ink, and the line is listed under "review" in the report.
 *    Files rendered only on out-of-scope routes (feed, stats, giveaway; see OUT_OF_SCOPE) skip
 *    step 3: those routes stay unchanged apart from the background.
 *
 * Files owned by other tasks in this wave (OWNED_ELSEWHERE) are not rewritten; their remaining
 * counts are reported so their owners (and task 7b) can migrate them. `--all` drops that filter.
 *
 * Text edits only: formatting, comments and the rest of every class string are kept.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ROOTS = ["components", "pages", "layouts", "features", "context", "hooks", "constants", "styles", "web3"];
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "android", "ios", "public", "coverage", "__test__", "e2e"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".scss", ".css"]);

/**
 * Files other tasks own in this wave (task 3d brief, "HARD EXCLUSIONS"), plus files no wave-3
 * task owns. Paths are relative to client/, a trailing slash means the whole directory.
 */
export const OWNED_ELSEWHERE = [
  // 3a
  "context/FirebaseAuthContext.tsx",
  "context/auth/",
  "context/ProfileContext.tsx",
  "context/ToastContext.tsx",
  "components/shared/Toast.tsx",
  "components/shared/SignIn.tsx",
  "components/shared/auth/",
  "api/api.ts",
  "api/user-api.ts",
  "pages/game.tsx",
  "pages/cats/",
  "pages/box.tsx",
  "pages/feed/",
  "pages/shelter-payouts.tsx",
  "pages/shelter-payouts/",
  "components/blog/feed/ArticlePageLayout.tsx",
  "components/shelter-payouts/GiveTreat.tsx",
  "components/game/Game.tsx",
  // 3e
  "components/Match3/",
  "components/CatnipChaos/",
  "components/PixelRescue/",
  "components/shelter/",
  "components/base/",
  "components/catbassadors/objects/",
  "components/catbassadors/scenes/",
  "components/Phaser/",
  "components/shared/Wheel.tsx",
  "components/shelter-payouts/shareCard.ts",
  "pages/portrait.tsx",
  "pages/portraits.tsx",
  // 3f
  "pages/index.tsx",
  "pages/impact.tsx",
  "components/landing/",
  "components/globe/",
  "components/claims/",
  "features/portrait/components/AboutUsModal.tsx",
  // Not owned by any wave-3 task: left for task 7b.
  "pages/proof.tsx",
];

/** Rendered only on routes outside the night scope (skyScope.ts): step 3 leaves them alone. */
export const OUT_OF_SCOPE = [
  "components/blog/",
  "components/stats/",
  "pages/stats.tsx",
  "pages/giveaway.tsx",
  "pages/404.tsx",
  "components/shared/Share.tsx", // feed actions only
  "components/shared/ShelterBenefits.tsx", // marketplace cat details (/cats) only
  "styles/globals.scss", // .article-content (feed articles)
  // <main> ink: keeps the brown for out-of-scope routes and switches to gold ink under
  // [data-sky] with the `[[data-sky]_&]:text-tt-gold-ink` variant; dark panels get cream ink from
  // the zero-specificity surface rules in styles/globals.scss.
  "layouts/MainLayout.tsx",
];

const UTILITIES =
  "bg|text|border(?:-[xytrblse])?|from|via|to|ring|ring-offset|outline|fill|stroke|shadow|divide|placeholder|decoration|accent|caret";

/** `hover:md:!bg-yellow-300/50` -> prefix `hover:md:!`, utility `bg`, suffix `/50`. */
const YELLOW_300 = new RegExp(
  `(?<![\\w-])((?:[\\w-]+:|\\[[^\\]\\s]+\\]:)*!?)(${UTILITIES})-yellow-300(?![\\w-])`,
  "g",
);
const THEME_YELLOW_300 = /theme\((["'])colors\.yellow\.300\1\)/g;
const TEXT_YELLOW_900 = /(?<![\w-])((?:[\w-]+:|\[[^\]\s]+\]:)*!?)text-yellow-900(?![\w-])/g;

const NIGHT_SURFACE = /(?<![\w-])(?:[\w-]+:)*bg-(?:tt-night-\d+|black|gray-(?:800|900|950)|slate-(?:800|900|950)|main-black|main-midnight)(?![\w-])/;
const LIGHT_SURFACE =
  /(?<![\w-])(?:[\w-]+:)*(?:bg|from|via|to)-(?:tt-cream|tt-parchment-\w+|tt-gold-\d+|white|cream|gold|(?:yellow|amber|orange|pink|rose|purple|blue|green|red|lime|cyan|sky|indigo|fuchsia|violet|emerald|teal)-(?:50|100|200|300|400))(?![\w-])/;

/** The class string around `index`: the nearest quote pair on the line, else the line. */
function enclosingString(line, index) {
  let start = -1;
  let quote = "";
  for (let i = index - 1; i >= 0; i--) {
    const c = line[i];
    if (c === '"' || c === "'" || c === "`") {
      start = i;
      quote = c;
      break;
    }
  }
  if (start === -1) return line;
  const end = line.indexOf(quote, index);
  return end === -1 ? line.slice(start + 1) : line.slice(start + 1, end);
}

export function surfaceOf(classString) {
  if (NIGHT_SURFACE.test(classString)) return "night";
  if (LIGHT_SURFACE.test(classString)) return "light";
  return "inherited";
}

/**
 * Rewrites one file's text. Returns the new text and per-step counts. `step3` false keeps
 * `text-yellow-900` (out-of-scope files).
 */
export function transformSource(source, { step3 = true } = {}) {
  const counts = { yellow300: 0, yellow900: { light: 0, night: 0, inherited: 0 } };
  const review = [];
  const lines = source.split("\n");
  const out = lines.map((line, lineIndex) => {
    let next = line.replace(YELLOW_300, (_m, prefix, utility) => {
      counts.yellow300++;
      return `${prefix}${utility}-tt-cream`;
    });
    next = next.replace(THEME_YELLOW_300, (_m, q) => {
      counts.yellow300++;
      return `theme(${q}colors.tt.cream${q})`;
    });
    if (!step3) return next;
    // Classify against the line as it is now (yellow-300 already renamed to tt-cream).
    const snapshot = next;
    next = next.replace(TEXT_YELLOW_900, (match, prefix, offset) => {
      const surface = surfaceOf(enclosingString(snapshot, offset));
      counts.yellow900[surface]++;
      if (surface === "inherited") review.push({ line: lineIndex + 1, text: snapshot.trim().slice(0, 160) });
      return `${prefix}${surface === "night" ? "text-tt-cream" : "text-tt-gold-ink"}`;
    });
    return next;
  });
  return { text: out.join("\n"), counts, review };
}

/** Occurrences left in a text (for the report and the override gate). */
export function remaining(source) {
  return {
    yellow300: (source.match(/yellow-300/g) || []).length + (source.match(/colors\.yellow\.300/g) || []).length,
    yellow900: (source.match(/text-yellow-900/g) || []).length,
  };
}

const rel = (file) => path.relative(CLIENT_ROOT, file).split(path.sep).join("/");
const listed = (file, list) => list.some((entry) => (entry.endsWith("/") ? file.startsWith(entry) : file === entry));

function walk(target, files) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(target))) files.push(target);
    return;
  }
  for (const name of fs.readdirSync(target)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    walk(path.join(target, name), files);
  }
}

function tokensHaveCream() {
  const tokens = fs.readFileSync(path.join(CLIENT_ROOT, "design/tokens.ts"), "utf8");
  return /\bcream:\s*"#fcecbb"/i.test(tokens);
}

function main(argv) {
  const dry = argv.includes("--dry");
  const json = argv.includes("--json");
  const all = argv.includes("--all");
  const explicit = argv.filter((a) => !a.startsWith("--"));

  if (!tokensHaveCream()) {
    console.error("Step 1 failed: design/tokens.ts has no tt-cream (#fcecbb). Add it to INK first.");
    process.exit(2);
  }

  const files = [];
  const roots = explicit.length ? explicit.map((p) => path.resolve(p)) : DEFAULT_ROOTS.map((r) => path.join(CLIENT_ROOT, r));
  roots.forEach((r) => walk(r, files));

  const report = {
    step1: "tt-cream present in design/tokens.ts",
    changed: [],
    skippedOwnedElsewhere: [],
    totals: { yellow300: 0, yellow900: { light: 0, night: 0, inherited: 0 } },
    review: [],
    left: [],
  };

  for (const file of files) {
    const name = rel(file);
    const source = fs.readFileSync(file, "utf8");
    const before = remaining(source);
    if (!before.yellow300 && !before.yellow900) continue;
    if (!all && !explicit.length && listed(name, OWNED_ELSEWHERE)) {
      report.skippedOwnedElsewhere.push({ file: name, ...before });
      continue;
    }
    const step3 = !listed(name, OUT_OF_SCOPE);
    const { text, counts, review } = transformSource(source, { step3 });
    const total = counts.yellow300 + counts.yellow900.light + counts.yellow900.night + counts.yellow900.inherited;
    if (total) {
      report.changed.push({ file: name, ...counts });
      report.totals.yellow300 += counts.yellow300;
      for (const k of ["light", "night", "inherited"]) report.totals.yellow900[k] += counts.yellow900[k];
      review.forEach((r) => report.review.push({ file: name, ...r }));
      if (!dry) fs.writeFileSync(file, text);
    }
    const after = remaining(text);
    if (after.yellow300 || after.yellow900) report.left.push({ file: name, ...after, outOfScope: !step3 });
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const t = report.totals;
  console.log(`night-tokens ${dry ? "(dry run)" : ""}`);
  console.log(`  step 1: ${report.step1}`);
  console.log(`  step 2: yellow-300 -> tt-cream: ${t.yellow300} in ${report.changed.filter((c) => c.yellow300).length} files`);
  console.log(
    `  step 3: text-yellow-900 -> gold ink ${t.yellow900.light} (light surface) + ${t.yellow900.inherited} (inherited, review); -> cream ${t.yellow900.night} (night surface)`,
  );
  for (const c of report.changed) {
    const y = c.yellow900;
    console.log(`    ${c.file}: yellow-300 ${c.yellow300}, text-yellow-900 light ${y.light} night ${y.night} inherited ${y.inherited}`);
  }
  if (report.review.length) {
    console.log("  review (text-yellow-900 with no surface in its class string):");
    report.review.forEach((r) => console.log(`    ${r.file}:${r.line}  ${r.text}`));
  }
  if (report.left.length) {
    console.log("  left in rewritten scope (out-of-scope ink, or non-utility mentions):");
    report.left.forEach((l) => console.log(`    ${l.file}: yellow-300 ${l.yellow300}, text-yellow-900 ${l.yellow900}${l.outOfScope ? " (out of scope)" : ""}`));
  }
  if (report.skippedOwnedElsewhere.length) {
    console.log("  owned elsewhere (not rewritten; for their owners and task 7b):");
    report.skippedOwnedElsewhere.forEach((s) => console.log(`    ${s.file}: yellow-300 ${s.yellow300}, text-yellow-900 ${s.yellow900}`));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
