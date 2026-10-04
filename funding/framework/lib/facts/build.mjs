// `fund facts build`: facts/facts.json -> every generated copy (plan F7.1, G11).
//
//   buildOutputs({ root }) -> { outputs: [{ path, content }], problems, warnings, registry, goals }
//   writeOutputs(outputs, { root, check }) -> { changed: string[], written: string[] }
//
// Generated files (paths relative to the repo root):
//   funding/framework/facts/FACTS.md          the application fact base, same table format as before
//   client/public/facts/facts.json            public subset (what the web, the app and the Heist fetch)
//   client/lib/facts.generated.ts             typed FactId union + the public subset
//   backend/src/impact/facts.generated.ts     the same, for the impact module (TypeScript 4.8)
//   catnip-heist/src/facts.generated.ts       the same, baked into the Heist as its offline fallback
//   client/public/shelter-payouts/campaign.json   the campaign goal (C- entry with `campaign`)
//
// The build is deterministic (no timestamps), so `--check` can compare bytes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_STATUSES, family, inclusiveDays, validateRegistry } from './schema.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const REGISTRY = 'funding/framework/facts/facts.json';

export const TARGETS = {
  factsMd: 'funding/framework/facts/FACTS.md',
  publicJson: 'client/public/facts/facts.json',
  client: 'client/lib/facts.generated.ts',
  backend: 'backend/src/impact/facts.generated.ts',
  heist: 'catnip-heist/src/facts.generated.ts',
  campaign: 'client/public/shelter-payouts/campaign.json',
};

/** The URL the web and the Heist fetch the public subset from (served by the client's public/). */
export const PUBLIC_FACTS_PATH = '/facts/facts.json';

export function loadRegistry(root = REPO_ROOT) {
  const file = join(root, REGISTRY);
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${REGISTRY}: ${e.code === 'ENOENT' ? 'missing' : `invalid JSON (${e.message})`}`); }
  return raw;
}

// ---------- config constants (read-only) ----------

/** Reads `const NAME = '123'` (a wei string) or `const NAME = 123` (an integer literal) from a
 *  TypeScript source; returns a BigInt. */
export function readWeiConst(root, file, name) {
  const path = join(root, file);
  if (!existsSync(path)) throw new Error(`${file} not found (needed for ${name})`);
  const text = readFileSync(path, 'utf8');
  const m = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*(?:['"\`](\\d+)['"\`]|(\\d+)(?![\\d._a-zA-Z]))`).exec(text);
  if (!m) throw new Error(`${file}: no string constant ${name}`);
  return BigInt(m[1] ?? m[2]);
}

/** 1000000000000000000n with 18 decimals -> "1"; 10000000000000000n -> "0.01". */
export function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** "90" or "12.5" -> units with `decimals` decimals. */
export function parseUnits(amount, decimals) {
  const [whole, frac = ''] = String(amount).split('.');
  return BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals));
}

/**
 * Goal feasibility (decision #76): the goal must be reachable at the configured daily cap
 * between startDate and endDate, both inclusive. Date-independent, so it can run on every PR.
 *
 * `goal.shareBps` (default 10000) is the share of the daily budget that reaches the goal's shelter.
 * ShelterSplit splits each donate across its recipients in one transaction and the campaign page
 * counts only Disbursed events to the shelter's own wallet, so with more than one recipient the
 * reachable amount is cap x shareBps / 10000 per day. The split config is not in this repo: the
 * value is an assumption a person keeps in step with it.
 */
export function goalFeasibility(entry, root) {
  const { goal } = entry;
  const budget = readWeiConst(root, goal.cap.file, goal.cap.const);
  const shareBps = goal.shareBps ?? 10000;
  const cap = (budget * BigInt(shareBps)) / 10000n;
  const days = inclusiveDays(goal.startDate, goal.endDate);
  const target = parseUnits(entry.value, goal.cap.decimals);
  const reachable = cap * BigInt(days);
  const minDays = cap > 0n ? Number((target + cap - 1n) / cap) : Infinity;
  const ok = cap > 0n && reachable >= target;
  return {
    id: entry.id,
    goal: entry.value,
    unit: entry.unit,
    days,
    shareBps,
    budgetPerDay: formatUnits(budget, goal.cap.decimals),
    capPerDay: formatUnits(cap, goal.cap.decimals),
    maxAtCap: formatUnits(reachable, goal.cap.decimals),
    minDays,
    /** Days the goal can miss the cap and still be reached (0: every day must hit the cap). */
    spareDays: ok ? days - minDays : 0,
    ok,
  };
}

// ---------- rendering ----------

const FACTS_MD_HEAD = `# Fact base

**The only numbers an application may use.** Every draft sentence containing a metric must cite an
ID here as \`[F-###]\`; \`fund check\` rejects anything else.

Status: \`verified\` (checked at the source, safe to use) · \`unverified\` (self-reported, verify
before a panel sees it) · \`sei-era\` (true, but from the SEI chain — say so in the sentence) ·
\`retired\` (never use; kept so old drafts fail loudly).

Never add secrets, keys, bank details or personal data here — this file is pasted into AI prompts.

Generated from \`facts/facts.json\` by \`fund facts build\`: edit that file, not this one. A
\`company-reported\` fact is listed here as \`unverified\` (an application still has to say it is the
company's own figure). \`fund refresh --write\` edits rows here; \`fund facts absorb\` moves those edits
into facts.json.
`;

/** The FACTS.md Value cell: numbers with thousands separators, strings as written. */
export function mdValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

/** FACTS.md keeps the four statuses verify.mjs knows. */
export function mdStatus(status) {
  if (status === 'company-reported') return 'unverified';
  if (status === 'live') return 'verified';
  return status;
}

// FACTS.md carries a hash of the rows it was generated with, so `fund facts build` can tell a
// FACTS.md edited since (by hand or by `fund refresh --write`) from one that is only behind
// facts.json, and refuse to overwrite the edit.
const ROW_LINE = /^\|\s*[A-Z]-[\w-]+\s*\|/;
const STAMP = /^<!-- fund facts build: rows sha256:([0-9a-f]{16}) -->$/m;

/** The FACTS.md table rows (not the header), as they are in the file. */
export function factsMdRows(text) {
  return String(text).split(/\r?\n/).filter((l) => ROW_LINE.test(l));
}

export function rowsHash(rows) {
  return createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);
}

/**
 * The state of an existing FACTS.md against the one the registry generates:
 *   'current'  same rows as the generated copy (only the heading may differ)
 *   'behind'   untouched since the last build; facts.json moved on, so it is safe to overwrite
 *   'edited'   its rows changed after the last build (or it predates the stamp): overwriting loses them
 */
export function factsMdState(current, generated) {
  const rows = factsMdRows(current);
  if (rows.join('\n') === factsMdRows(generated).join('\n')) return 'current';
  const m = STAMP.exec(current);
  return m && m[1] === rowsHash(rows) ? 'behind' : 'edited';
}

export function renderFactsMd(registry) {
  const rows = registry.facts
    .filter((f) => family(f.id) === 'F')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => `| ${f.id} | ${f.claim} | ${mdValue(f.value)} | ${f.source} | ${f.checkedAt} | ${mdStatus(f.status)} |`);
  return `${FACTS_MD_HEAD}\n| ID | Fact | Value | Source | Date | Status |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\n<!-- fund facts build: rows sha256:${rowsHash(rows)} -->\n`;
}

/** Only public URLs leave the repo; internal paths ("extra/traction.md") stay in FACTS.md. */
function publicSource(source) {
  const m = /https:\/\/[^\s)]+/.exec(source);
  return m ? m[0] : null;
}

/** Entries the public may see: a public status and at least one surface. */
export function publicEntries(registry) {
  return registry.facts
    .filter((f) => PUBLIC_STATUSES.includes(f.status) && f.surfaces.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => {
      const out = {
        id: f.id,
        display: f.display,
        appDisplay: f.appDisplay ?? null,
        value: f.value,
        unit: f.unit,
        status: f.status,
        tense: f.tense,
        asOf: f.asOf,
        checkedAt: f.checkedAt,
        maxAgeDays: f.maxAgeDays,
        surfaces: [...f.surfaces],
        sourceUrl: publicSource(f.source),
      };
      if (f.key) out.key = f.key;
      if (f.short) out.short = f.short;
      if (f.recordsOnRequest) out.recordsOnRequest = true;
      if (f.chain) out.chain = f.chain;
      if (f.live) out.live = { endpoint: f.live.endpoint, path: f.live.path };
      if (f.goal) out.goal = { startDate: f.goal.startDate, endDate: f.goal.endDate };
      return out;
    });
}

export function renderPublicJson(entries) {
  return `${JSON.stringify({ version: 1, generatedFrom: REGISTRY, facts: entries }, null, 2)}\n`;
}

function tsHeader(extra = '') {
  return `// GENERATED by \`fund facts build\` from ${REGISTRY}. Do not edit this file:
// edit facts.json, then run \`node funding/framework/bin/fund.mjs facts build\`.
${extra}`;
}

/**
 * One TypeScript module for the client, the backend and the Heist. TypeScript 4.8 compatible
 * (no \`satisfies\`), no imports, so it compiles in every package as is.
 */
export function renderTs(entries, { indent = 2, header = '', target }) {
  const ids = entries.map((f) => f.id);
  const union = ids.length ? ids.map((id) => `'${id}'`).join(' | ') : 'never';
  const body = JSON.stringify(Object.fromEntries(entries.map((f) => [f.id, f])), null, indent);
  const pad = ' '.repeat(indent);
  // Every declaration carries `// prettier-ignore`, so a formatter (`npm run format` in the backend,
  // format on save) leaves the file byte-identical and `fund facts build --check` stays green.
  return withPrettierIgnore(`${tsHeader(header)}
/** Every fact id a ${target} surface may cite (plan F7.1). */
export type FactId = ${union};

export type FactStatus = 'verified' | 'company-reported' | 'sei-era' | 'live';
export type FactSurface = 'landing' | 'game' | 'heist' | 'impact' | 'shelter-payouts' | 'store';

export interface PublicFact {
${pad}id: FactId;
${pad}/** Public wording. For live entries it is a template: "{n}" or "{amount}". */
${pad}display: string;
${pad}/** Wording for app builds (the Capacitor app, the Heist included) when display has money or chain words (R10). */
${pad}appDisplay: string | null;
${pad}/** Null for live metrics: read them from \`live.endpoint\`. */
${pad}value: number | string | null;
${pad}unit: string | null;
${pad}status: FactStatus;
${pad}tense: 'past' | 'present' | 'future';
${pad}asOf: string | null;
${pad}checkedAt: string;
${pad}/** Null only for SEI-era history, which never goes stale. */
${pad}maxAgeDays: number | null;
${pad}surfaces: FactSurface[];
${pad}sourceUrl: string | null;
${pad}key?: string;
${pad}/** A shorter wording for tight spaces (the lobby strip); the drawer still shows display. */
${pad}short?: string;
${pad}/** Token Tails holds records behind this entry and answers requests for them. */
${pad}recordsOnRequest?: true;
${pad}chain?: 'sei' | 'stellar' | 'arc' | 'skale';
${pad}live?: { endpoint: string; path: string };
${pad}goal?: { startDate: string; endDate: string };
}

/** Where the web app and the Heist fetch the current public facts. */
export const PUBLIC_FACTS_PATH = '${PUBLIC_FACTS_PATH}';

export const FACT_IDS: readonly FactId[] = ${JSON.stringify(ids)};

export const FACTS: Record<FactId, PublicFact> = ${body};
`);
}

/** Puts `// prettier-ignore` on the line before every top-level `export`. */
export function withPrettierIgnore(source) {
  return source.replace(/^export /gm, '// prettier-ignore\nexport ');
}

export function renderCampaign(entry) {
  const c = entry.campaign;
  const out = {
    name: c.name,
    goalUsdc: entry.value,
    startDate: entry.goal.startDate,
    chainId: c.chainId,
    fromBlock: c.fromBlock ?? null,
    shelter: {
      name: c.shelter.name,
      wallet: c.shelter.wallet ?? null,
      handover: c.shelter.handover === 'handed-over' ? 'handed-over' : 'held-by-token-tails',
    },
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// ---------- build ----------

export function buildOutputs({ root = REPO_ROOT, registry } = {}) {
  registry = registry || loadRegistry(root);
  const exists = (p) => existsSync(join(root, p));
  const { problems, warnings } = validateRegistry(registry, { exists });
  const goals = [];
  if (problems.length) return { outputs: [], problems, warnings, registry, goals };

  // C- entries that mirror a config constant must match it (the code is the source of truth).
  for (const f of registry.facts) {
    if (f.config) {
      try {
        const actual = formatUnits(readWeiConst(root, f.config.file, f.config.const), f.config.decimals);
        if (String(f.value) !== actual) problems.push(`${f.id}: value ${f.value} ${f.unit || ''} does not match ${f.config.file} ${f.config.const} (${actual}); update facts.json`);
      } catch (e) { problems.push(`${f.id}: ${e.message}`); }
    }
    if (f.goal) {
      try {
        const r = goalFeasibility(f, root);
        goals.push(r);
        const share = r.shareBps === 10000 ? '' : ` (${r.shareBps / 100}% of the ${r.budgetPerDay} ${r.unit} budget)`;
        if (!r.ok) problems.push(`${f.id}: goal ${r.goal} ${r.unit} is unreachable at the cap: ${r.capPerDay} ${r.unit}/day${share} for ${r.days} days is at most ${r.maxAtCap} ${r.unit} (needs ${r.minDays} days); lower the goal or extend endDate (decision #76)`);
        else if (r.spareDays === 0) warnings.push(`${f.id}: goal ${r.goal} ${r.unit} has no headroom: every one of its ${r.days} days must reach the ${r.capPerDay} ${r.unit} cap`);
      } catch (e) { problems.push(`${f.id}: ${e.message}`); }
    }
  }
  if (problems.length) return { outputs: [], problems, warnings, registry, goals };

  const pub = publicEntries(registry);
  const outputs = [
    { path: TARGETS.factsMd, content: renderFactsMd(registry) },
    { path: TARGETS.publicJson, content: renderPublicJson(pub) },
    { path: TARGETS.client, content: renderTs(pub, { indent: 2, target: 'client' }) },
    {
      path: TARGETS.backend,
      // The backend formats with prettier: renderTs marks every declaration prettier-ignore.
      content: renderTs(pub, { indent: 4, target: 'backend', header: '/* eslint-disable */\n' }),
    },
    { path: TARGETS.heist, content: renderTs(pub, { indent: 2, target: 'Heist', header: '// The Heist fetches PUBLIC_FACTS_PATH (HEIST_FACTS_URL) at runtime; this copy is the offline fallback.\n' }) },
  ];
  const campaign = registry.facts.find((f) => f.campaign);
  if (campaign) outputs.push({ path: TARGETS.campaign, content: renderCampaign(campaign) });
  return { outputs, problems, warnings, registry, goals };
}

/** Writes changed outputs (atomically), or with `check` only lists them. */
export function writeOutputs(outputs, { root = REPO_ROOT, check = false } = {}) {
  const changed = [];
  const written = [];
  for (const { path, content } of outputs) {
    const abs = join(root, path);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (current === content) continue;
    changed.push(path);
    if (check) continue;
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}`;
    writeFileSync(tmp, content);
    renameSync(tmp, abs);
    written.push(path);
  }
  return { changed, written };
}
