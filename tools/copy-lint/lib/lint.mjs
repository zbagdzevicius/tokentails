// Copy lint driver (plan F11): which files, which rule sets, and how citations are found.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { extractJson, extractTs } from './extract.mjs';
import { checkCitation, checkUnit } from './rules.mjs';

/**
 * Scan targets. `app: true` applies the app-build rules (R10): the Capacitor export ships every
 * client page and client/public (the Heist build included), so only `isApp` web branches, Heist
 * `isWebHost` / `HEIST_WEB` branches and files marked `// copy-lint: web-only <reason>` are exempt.
 */
export const TARGETS = [
  {
    name: 'client',
    include: ['client/components/**/*.{ts,tsx}', 'client/pages/**/*.{ts,tsx}', 'client/features/**/*.{ts,tsx}', 'client/layouts/**/*.{ts,tsx}', 'client/lib/**/*.{ts,tsx}', 'client/constants/**/*.{ts,tsx}', 'client/context/**/*.{ts,tsx}', 'client/hooks/**/*.{ts,tsx}'],
    exclude: ['**/__test__/**', '**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'client/shared-contracts/**', '**/*.d.ts', 'client/lib/facts.generated.ts'],
    ruleset: 'client',
    app: true,
  },
  {
    name: 'client-json',
    include: ['client/public/**/*.json'],
    // NFT metadata (mystery boxes, Catnip Chaos badges) is what already-minted tokens point at: it
    // can't be reworded, so it is not linted.
    exclude: ['client/public/heist/**', 'client/public/facts/**', 'client/public/shelter-payouts/campaign.json', 'client/public/**/levels/**', 'client/public/**/*.map.json', 'client/public/utilities/mystery-boxes/**', 'client/public/catnip-chaos/badges/**'],
    ruleset: 'client',
    app: true,
    json: true,
  },
  {
    name: 'heist',
    include: ['catnip-heist/src/**/*.ts'],
    exclude: ['**/__tests__/**', '**/*.test.ts', 'catnip-heist/src/shared-contracts/**', 'catnip-heist/src/facts.generated.ts', 'catnip-heist/src/**/dev/**', 'catnip-heist/src/sim/**', 'catnip-heist/src/levels/**'],
    ruleset: 'client',
    app: true,
  },
  {
    // Level titles, objectives and hints are player-visible; the rest of a level is map data.
    name: 'heist-levels',
    include: ['catnip-heist/src/levels/*.json'],
    exclude: ['catnip-heist/src/levels/*.solution.json'],
    ruleset: 'client',
    app: true,
    json: true,
    jsonPaths: ['meta.title', 'meta.objectives[]', 'meta.hints[].text'],
  },
  {
    name: 'backend',
    include: ['backend/src/**/*.ts'],
    exclude: ['**/*.spec.ts', 'backend/src/shared-contracts/**', 'backend/src/impact/facts.generated.ts', 'backend/src/**/*.schema.ts', 'backend/src/**/dto/**'],
    ruleset: 'backend',
    app: false,
  },
  {
    // The CMS is an admin tool; its public text is what managers type (quests, blessings, shelters),
    // which lives in the database and is covered by the F11 runtime Playwright scan. Statically we
    // read the model defaults and the public card preview.
    name: 'cms',
    include: ['cms/models/**/*.ts', 'cms/components/tailsCard/**/*.tsx'],
    exclude: ['**/__tests__/**'],
    ruleset: 'client',
    app: false,
  },
];

/** Tone rules (R9) never apply here: legacy components awaiting retirement and the web-only Vault. */
export const TONE_EXEMPT = ['client/components/legacy/**', '**/vault/**', '**/Vault*', '**/*Vault*.{ts,tsx}'];

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'dist', 'build', 'coverage', '.git', 'android', 'ios', 'test-results', 'playwright-report']);

// ---------- globs ----------

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
      else re += '[^/]*';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matcher = (globs) => {
  const res = globs.map(globToRegExp);
  return (p) => res.some((r) => r.test(p));
};

function* walk(root, dir) {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(root, rel); }
    else if (e.isFile()) yield rel;
  }
}

/** Every file a target scans, repo-relative with forward slashes. */
export function targetFiles(root, target) {
  const inc = matcher(target.include);
  const exc = matcher(target.exclude || []);
  const baseOf = (g) => {
    const parts = g.split('/');
    const i = parts.findIndex((p) => /[*{?]/.test(p));
    return (i === -1 ? parts.slice(0, -1) : parts.slice(0, i)).join('/');
  };
  const bases = [...new Set(target.include.map(baseOf))];
  const out = new Set();
  for (const base of bases) {
    if (!existsSync(join(root, base))) continue;
    for (const f of walk(root, base)) if (inc(f) && !exc(f)) out.add(f);
  }
  return [...out].sort();
}

// ---------- surfaces and citations ----------

/** The facts.json surface a file renders on (R5), or null when there is none to check. */
export function surfaceOf(file) {
  if (/^client\/components\/landing\//.test(file) || file === 'client/pages/index.tsx' || /^client\/components\/globe\//.test(file)) return 'landing';
  if (/shelter-payouts/.test(file)) return 'shelter-payouts';
  if (/^client\/(?:pages|components)\/impact/.test(file)) return 'impact';
  if (file.startsWith('catnip-heist/')) return 'heist';
  if (file.startsWith('client/') || file.startsWith('backend/')) return 'game';
  return null;
}

const ID = String.raw`(?:[FPC]-\d{3}|L-[a-z0-9]+(?:-[a-z0-9]+)*)`;
// data-claim="F-011", <Claim id="F-011">, claim: "F-011", claimId={'F-011'}, FACTS["F-011"], fact('F-011')
const CITE_CODE = new RegExp(String.raw`(?:data-claim\s*=\s*\{?\s*|<Claim\b[^>]*?\bid\s*=\s*\{?\s*|\bclaim(?:Id)?\s*[:=]\s*\{?\s*|\bFACTS\s*\[\s*|\bfacts?\(\s*)["'\`](${ID})["'\`]`, 'g');
// // claim: F-003, F-004   {/* claim: F-011 */}
const CITE_COMMENT = new RegExp(String.raw`\bclaim:\s*(${ID}(?:\s*,\s*${ID})*)`, 'g');
const FICTION = /\bclaim:\s*fiction\b([^\n]*)/g;
const IGNORE = /copy-lint-ignore\s+((?:R\d{1,2}\s*,?\s*)+)(.*)/;

// A fiction marker must say why the line is fiction: at least 3 words and 10 characters
// ("// claim:fiction x" covers nothing).
export const FICTION_MIN_WORDS = 3;
export const FICTION_MIN_CHARS = 10;
export const fictionReasonOk = (reason) => !!reason && reason.length >= FICTION_MIN_CHARS && reason.split(/\s+/).filter((w) => /\w/.test(w)).length >= FICTION_MIN_WORDS;

/** Per-line citations, fiction markers and ignore pragmas of a source file. */
export function scanMarkers(text) {
  const lines = text.split('\n');
  const ids = [];
  const fiction = [];
  const ignores = [];
  lines.forEach((l, i) => {
    const line = i + 1;
    for (const m of l.matchAll(CITE_CODE)) ids.push({ id: m[1], line });
    for (const m of l.matchAll(CITE_COMMENT)) for (const id of m[1].split(/\s*,\s*/)) if (!ids.some((x) => x.id === id && x.line === line)) ids.push({ id, line });
    for (const m of l.matchAll(FICTION)) {
      const reason = m[1].replace(/\*\/.*$/, '').replace(/[}\s]+$/, '').replace(/^[\s:—-]+/, '').trim();
      fiction.push({ line, reason });
    }
    const ig = IGNORE.exec(l);
    if (ig) ignores.push({ line, rules: ig[1].split(/[\s,]+/).filter(Boolean), reason: ig[2].replace(/\*\/.*$/, '').trim() });
  });
  return { ids, fiction, ignores };
}

const WINDOW = 3;

export function lintSource(file, text, { facts, target, toneExempt = false }) {
  const findings = [];
  const surface = surfaceOf(file);
  const units = target.json ? extractJson(file, text, { paths: target.jsonPaths }) : extractTs(file, text, { ruleset: target.ruleset });
  const markers = target.json ? { ids: [], fiction: [], ignores: [] } : scanMarkers(text);
  const add = (line, rule, message, unitText) => {
    const ig = markers.ignores.find((x) => (x.line === line || x.line === line - 1) && x.rules.includes(rule));
    if (ig && ig.reason) return;
    findings.push({ file, line, rule, message, text: unitText ? unitText.slice(0, 140) : undefined });
  };

  for (const f of markers.fiction) {
    if (!f.reason) add(f.line, 'R2', 'claim:fiction needs a reason ("// claim:fiction in-game rescue, no money moves")');
    else if (!fictionReasonOk(f.reason)) add(f.line, 'R2', `claim:fiction reason "${f.reason}" is too short: say why the line is fiction in at least ${FICTION_MIN_WORDS} words ("// claim:fiction in-game rescue, no money moves")`);
  }
  for (const ig of markers.ignores) if (!ig.reason) findings.push({ file, line: ig.line, rule: ig.rules[0], message: 'copy-lint-ignore needs a reason after the rule ids' });
  for (const { id, line } of markers.ids) for (const r of checkCitation(id, { facts, surface })) add(line, r.rule, r.message);

  for (const u of units) {
    const lo = u.line - WINDOW;
    const hi = u.endLine + WINDOW;
    const ids = [...new Set(markers.ids.filter((x) => x.line >= lo && x.line <= hi).map((x) => x.id))];
    if (u.claim) {
      ids.push(u.claim);
      for (const r of checkCitation(u.claim, { facts, surface })) add(u.line, r.rule, r.message, u.text);
    }
    const fiction = markers.fiction.some((x) => fictionReasonOk(x.reason) && x.line >= lo && x.line <= hi);
    const ctx = { facts, surface, toneExempt, appScope: !!target.app, near: { ids, fiction } };
    for (const r of checkUnit(u, ctx)) add(u.line, r.rule, r.message, u.text);
  }
  return findings;
}

export function loadFacts(root) {
  const path = join(root, 'funding/framework/facts/facts.json');
  const map = new Map();
  if (!existsSync(path)) return map;
  const reg = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of reg.facts || []) map.set(f.id, f);
  return map;
}

const MAX_BYTES = 2 * 1024 * 1024;

/** Lints the repo (or `only` repo-relative files). Returns { findings, files, byTarget, skipped };
 * `skipped` lists `only` paths that no selected target scans, so a caller can say so instead of
 * reporting them clean. */
export function lintRepo(root, { only, targets = TARGETS } = {}) {
  const facts = loadFacts(root);
  const exempt = matcher(TONE_EXEMPT);
  const findings = [];
  let files = 0;
  const byTarget = {};
  const onlySet = only ? new Set(only.map((p) => relative(root, join(root, p)).split(sep).join('/'))) : null;
  const seen = new Set();
  for (const target of targets) {
    const list = targetFiles(root, target).filter((f) => !onlySet || onlySet.has(f));
    for (const f of list) seen.add(f);
    byTarget[target.name] = { files: list.length, findings: 0 };
    for (const file of list) {
      const abs = join(root, file);
      if (statSync(abs).size > MAX_BYTES) continue;
      files++;
      const found = lintSource(file, readFileSync(abs, 'utf8'), { facts, target, toneExempt: exempt(file) });
      byTarget[target.name].findings += found.length;
      findings.push(...found);
    }
  }
  const skipped = onlySet ? [...onlySet].filter((f) => !seen.has(f)).sort() : [];
  return { findings, files, byTarget, skipped };
}
