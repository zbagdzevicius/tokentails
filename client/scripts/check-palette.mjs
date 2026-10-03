#!/usr/bin/env node
/**
 * Palette guard (plan G6 "Guard", F1 bundle-guards; task 3d).
 *
 *   node scripts/check-palette.mjs            # fail (exit 1) on any finding not allowlisted (CI mode)
 *   node scripts/check-palette.mjs --warn     # report only, always exit 0
 *   node scripts/check-palette.mjs --json     # machine-readable findings
 *   node scripts/check-palette.mjs --root <dir> --allowlist <file>   # tests
 *
 * Rules
 *   overlay-cream    a full-screen overlay painted `bg-yellow-300` / `bg-tt-cream` (the old cream
 *                    sheet, not night chrome). An overlay is `fixed` plus `inset-0`,
 *                    `inset-x-0 inset-y-0`, `top-0 left-0 right-0 bottom-0`, or `top-0 left-0` with
 *                    `w-full h-full` / `w-screen h-screen`. The classes are read per class
 *                    expression: every string inside one `className={...}` or one
 *                    `clsx(...)` / `cn(...)` / `classNames(...)` / `twMerge(...)` call is joined,
 *                    and a file-level `const NAME = "..."` used there is expanded.
 *   overlay-white    the same overlay painted `bg-white`
 *   overlay-z        the same overlay with an arbitrary `z-[N]` instead of a layer from the z scale
 *                    (`z-modal`, `z-auth`, ...; design/tokens.ts LAYERS)
 *   night-hex        a night hex literal (`#0b0820`, `#1e1633`, ... from NIGHT in design/tokens.ts)
 *                    outside the token files: use `tt-night-*`, `rgb(var(--tt-night-*))` or import
 *                    NIGHT / THEME_COLOR
 *
 * Allowlist: scripts/check-palette.allowlist.json, entries `{ "file", "rule", "max", "reason",
 * "until" }`. An entry covers at most `max` findings of that rule in that file (default 1): a new
 * finding in an allowlisted file fails as soon as the count goes over, and the report lists the
 * entry under `exceeded`. The W4 overlay migration (task 4d)
 * removed entries as each modal moved to GameModal; since task 7b CI runs it blocking.
 * The Heist host HTML (public/heist-game, catnip-heist) is never scanned: it carries its own palette
 * with a parity test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["components", "pages", "layouts", "features", "context", "hooks", "constants", "styles", "web3", "lib", "design", "app", "capacitor.config.ts", "tailwind.config.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "android", "ios", "public", "coverage", "__test__", "e2e", "heist-game"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".scss", ".css", ".html"]);

/** Where night hex literals belong. */
export const TOKEN_FILES = ["design/tokens.ts", "styles/tokens.css"];

/** NIGHT from design/tokens.ts, lower-case, read at run time so the guard never drifts. */
export function readNightHexes(root) {
  const fallback = ["#07051a", "#0b0820", "#120d1f", "#1e1633", "#2a1f45", "#3a2d5c"];
  const file = path.join(root, "design/tokens.ts");
  if (!fs.existsSync(file)) return fallback;
  const block = /export const NIGHT = \{([\s\S]*?)\}/.exec(fs.readFileSync(file, "utf8"));
  if (!block) return fallback;
  const hexes = block[1].match(/#[0-9a-fA-F]{6}\b/g);
  return hexes && hexes.length ? hexes.map((h) => h.toLowerCase()) : fallback;
}

const has = (classes, re) => re.test(classes);
/** A bare utility (variants allowed: `md:inset-0`). */
const util = (name) => new RegExp(`(?<![\\w-])(?:[\\w-]+:)*!?${name}(?![\\w-])`);
const U = Object.fromEntries(
  ["fixed", "inset-0", "inset-x-0", "inset-y-0", "top-0", "left-0", "right-0", "bottom-0", "w-full", "h-full", "w-screen", "h-screen"].map((n) => [n, util(n)]),
);
/** `fixed` and covering the viewport, in any of the spellings the codebase uses. */
export function isOverlay(classes) {
  const on = (n) => U[n].test(classes);
  if (!on("fixed")) return false;
  if (on("inset-0")) return true;
  if (on("inset-x-0") && on("inset-y-0")) return true;
  if (on("top-0") && on("left-0") && on("right-0") && on("bottom-0")) return true;
  return on("top-0") && on("left-0") && ((on("w-full") && on("h-full")) || (on("w-screen") && on("h-screen")));
}
const CREAM_BG = /(?<![\w-])(?:[\w-]+:)*!?bg-(?:yellow-300|tt-cream)(?![\w-])/;
const WHITE_BG = /(?<![\w-])(?:[\w-]+:)*!?bg-white(?![\w-])/;
const ARBITRARY_Z = /(?<![\w-])(?:[\w-]+:)*!?-?z-\[[^\]]+\]/;

/** String literals with their 1-based start line (template literals may span lines). */
function stringLiterals(text) {
  const out = [];
  const re = /(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(text))) {
    // Plain quotes never span lines; skip runaway matches across lines.
    if (m[1] !== "`" && m[2].includes("\n")) {
      re.lastIndex = m.index + 1;
      continue;
    }
    out.push({ value: m[2], index: m.index, end: m.index + m[0].length, line: text.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** The index just past the bracket that closes the one at `open` (string-aware enough for JSX). */
function closeOf(text, open) {
  const pairs = { "{": "}", "(": ")" };
  const want = [pairs[text[open]]];
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = text.indexOf(c, i + 1);
      if (end === -1) return text.length;
      i = end;
    } else if (c === "{" || c === "(") want.push(pairs[c]);
    else if (c === want[want.length - 1]) {
      want.pop();
      if (!want.length) return i + 1;
    }
  }
  return text.length;
}

/** Spans whose strings form one class list: `className={...}` and class-joining helper calls. */
function classSpans(text) {
  const spans = [];
  const re = /\bclass(?:Name)?=\{|\b(?:clsx|cn|classNames|classnames|twMerge|cx)\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    spans.push({ start: open, end: closeOf(text, open) });
  }
  return spans;
}

/** File-level `const NAME = "classes"` (or a template), for expanding `${NAME}` / `NAME`. */
function stringConsts(text) {
  const out = {};
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(["'`])((?:\\[\s\S]|(?!\2)[^\\])*?)\2/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[3];
  return out;
}

/**
 * Class lists to judge, each with the line it starts on. Strings inside one span are joined; a
 * string outside every span stands alone. Identifiers naming a string const are expanded.
 */
export function classGroups(text) {
  const literals = stringLiterals(text);
  const consts = stringConsts(text);
  const expand = (src) =>
    Object.entries(consts)
      .filter(([name]) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(src))
      .map(([, v]) => v)
      .join(" ");
  const groups = [];
  const used = new Set();
  // Outermost spans only: a clsx() inside className={...} belongs to the className group.
  const spans = classSpans(text).filter((s, i, all) => !all.some((o, j) => j !== i && o.start < s.start && s.end <= o.end));
  for (const span of spans) {
    const inside = literals.filter((l) => l.index > span.start && l.end <= span.end);
    inside.forEach((l) => used.add(l));
    const body = text.slice(span.start, span.end);
    const value = [...inside.map((l) => l.value), expand(body.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*?\1/g, (q) => (q[0] === "`" ? q : "")))].join(" ");
    if (value.trim()) groups.push({ value, line: text.slice(0, span.start).split("\n").length });
  }
  for (const l of literals) {
    if (used.has(l)) continue;
    const inner = l.value.match(/\$\{([^}]*)\}/g);
    groups.push({ value: inner ? `${l.value} ${expand(inner.join(" "))}` : l.value, line: l.line });
  }
  return groups;
}

/** Findings for one file's text. `name` is the client-relative path. */
export function checkSource(name, text, nightHexes) {
  const findings = [];
  const isStyle = /\.(s?css)$/.test(name);
  if (!isStyle) {
    for (const lit of classGroups(text)) {
      if (!isOverlay(lit.value)) continue;
      if (has(lit.value, CREAM_BG)) findings.push({ file: name, line: lit.line, rule: "overlay-cream", detail: "full-screen overlay on the cream sheet (bg-yellow-300 / bg-tt-cream)" });
      if (has(lit.value, WHITE_BG)) findings.push({ file: name, line: lit.line, rule: "overlay-white", detail: "full-screen overlay on bg-white" });
      const z = ARBITRARY_Z.exec(lit.value);
      if (z) findings.push({ file: name, line: lit.line, rule: "overlay-z", detail: `full-screen overlay uses ${z[0]}; use a layer (z-modal, z-auth, ...)` });
    }
  }
  if (!TOKEN_FILES.includes(name)) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const hexes = line.match(/#[0-9a-fA-F]{6}\b/g);
      if (!hexes) return;
      hexes
        .map((h) => h.toLowerCase())
        .filter((h) => nightHexes.includes(h))
        .forEach((h) => findings.push({ file: name, line: i + 1, rule: "night-hex", detail: `night literal ${h}; use the tt-night token` }));
    });
  }
  return findings;
}

function walk(root, target, files) {
  const abs = path.join(root, target);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(abs))) files.push(target.split(path.sep).join("/"));
    return;
  }
  for (const entry of fs.readdirSync(abs)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    walk(root, path.join(target, entry), files);
  }
}

export function loadAllowlist(file) {
  if (!file || !fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(data.entries) ? data.entries : [];
}

export function run({ root = CLIENT_ROOT, allowlistFile, roots = SOURCE_ROOTS } = {}) {
  const nightHexes = readNightHexes(root);
  const allowlist = loadAllowlist(allowlistFile ?? path.join(root, "scripts/check-palette.allowlist.json"));
  const files = [];
  roots.forEach((r) => walk(root, r, files));
  const findings = [];
  const allowed = [];
  const counts = new Map();
  for (const name of files) {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    for (const f of checkSource(name, text, nightHexes)) {
      const entry = allowlist.find((a) => a.file === f.file && a.rule === f.rule);
      if (!entry) {
        findings.push(f);
        continue;
      }
      const n = (counts.get(entry) || 0) + 1;
      counts.set(entry, n);
      const max = Number.isInteger(entry.max) ? entry.max : 1;
      if (n <= max) allowed.push({ ...f, reason: entry.reason });
      else findings.push({ ...f, detail: `${f.detail} (over the allowlist max of ${max} for this file)` });
    }
  }
  const stale = allowlist.filter((a) => !counts.has(a));
  const exceeded = allowlist
    .filter((a) => counts.get(a) > (Number.isInteger(a.max) ? a.max : 1))
    .map((a) => ({ file: a.file, rule: a.rule, max: Number.isInteger(a.max) ? a.max : 1, found: counts.get(a) }));
  const slack = allowlist
    .filter((a) => counts.has(a) && counts.get(a) < (Number.isInteger(a.max) ? a.max : 1))
    .map((a) => ({ file: a.file, rule: a.rule, max: a.max, found: counts.get(a) }));
  return { scanned: files.length, findings, allowed, stale, exceeded, slack };
}

function main(argv) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const warn = argv.includes("--warn");
  const root = arg("--root") ? path.resolve(arg("--root")) : CLIENT_ROOT;
  const allowlistFile = arg("--allowlist") ? path.resolve(arg("--allowlist")) : undefined;
  const result = run({ root, allowlistFile });

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const byRule = {};
    result.findings.forEach((f) => (byRule[f.rule] = (byRule[f.rule] || 0) + 1));
    console.log(
      `check-palette${warn ? " (warn mode)" : ""}: ${result.scanned} files, ${result.findings.length} findings, ${result.allowed.length} allowlisted`,
    );
    Object.entries(byRule).forEach(([rule, n]) => console.log(`  ${rule}: ${n}`));
    result.findings.forEach((f) => console.log(`${warn ? "warning" : "error"} ${f.file}:${f.line} [${f.rule}] ${f.detail}`));
    result.exceeded.forEach((e) => console.log(`${warn ? "warning" : "error"} allowlist max exceeded: ${e.file} [${e.rule}] ${e.found} > ${e.max}`));
    result.slack.forEach((e) => console.log(`note: allowlist max can drop: ${e.file} [${e.rule}] ${e.found} < ${e.max}`));
    result.stale.forEach((s) => console.log(`note: allowlist entry no longer needed: ${s.file} [${s.rule}]`));
  }
  if (!warn && result.findings.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
