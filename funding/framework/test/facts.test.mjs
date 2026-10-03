// `fund facts` (plan F7.1, G11; decisions #73-#77): schema rules, the generator, goal feasibility,
// drift detection, absorb, the weekly report and the release gate. Each test builds a scratch repo
// root, so nothing here writes into the real tree. The last block checks the real registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUSES, endOfDate, findPersonalData, inclusiveDays, validateRegistry } from '../lib/facts/schema.mjs';
import {
  REPO_ROOT, TARGETS, buildOutputs, factsMdState, formatUnits, goalFeasibility, mdStatus, parseUnits, publicEntries,
  renderCampaign, renderTs, writeOutputs,
} from '../lib/facts/build.mjs';
import { formatRegistry } from '../lib/facts/format.mjs';
import { absorbFactsMd } from '../lib/facts/absorb.mjs';
import { buildReport, fromBlockReconciliation, goalStatus, impactReconciliation, staleness } from '../lib/facts/report.mjs';
import { runFacts } from '../lib/facts/cli.mjs';
import { readFactRows } from '../lib/facts-refresh.mjs';
import { CORE } from '../lib/core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = 'backend/src/shelter/onchain/shelter-onchain.config.ts';
const ONE_USDC = '1000000000000000000';

// ---------- fixtures ----------

function fact(over = {}) {
  return {
    id: 'F-001', claim: 'Registered users, all time', value: 542000, unit: 'players',
    display: '540K+ registered players, all time (Apr 2026, company-reported)', source: 'extra/traction.md',
    asOf: '2026-04', checkedAt: '2026-04', status: 'company-reported', maxAgeDays: 365, surfaces: ['landing'],
    tense: 'past', ...over,
  };
}

function goalEntry(over = {}) {
  return {
    id: 'C-001', key: 'campaign', claim: 'A goal', value: '90', unit: 'USDC', display: 'Goal: 90 USDC by 30 Dec 2026',
    source: 'decision #76', asOf: '2026-09-30', checkedAt: '2026-09-30', status: 'verified', maxAgeDays: 120,
    surfaces: ['shelter-payouts'], chain: 'arc', tense: 'future',
    goal: { startDate: '2026-10-02', endDate: '2026-12-30', cap: { file: CONFIG, const: 'DEFAULT_DAILY_BUDGET_WEI', decimals: 18 } },
    campaign: { name: 'Pink Paw autumn rescue', chainId: 5042, fromBlock: null, shelter: { name: 'Pink Paw', wallet: null, handover: 'held-by-token-tails' } },
    ...over,
  };
}

function baseRegistry() {
  return {
    _readme: 'test registry',
    facts: [
      fact(),
      fact({ id: 'F-002', claim: 'Peak monthly web visitors (GA4)', value: '307,600 (246,900 new in one month)', unit: 'visitors', display: null, status: 'unverified', surfaces: [], maxAgeDays: null, asOf: '2025', checkedAt: '2025' }),
      fact({ id: 'F-003', claim: 'Peak weekly unique active wallets, week of 2025-11-17', value: 324422, unit: 'wallets', display: '324K+ active wallets in the peak week on SEI (Nov 2025)', status: 'sei-era', chain: 'sei', maxAgeDays: null, asOf: '2025-11-17', checkedAt: '2026-09-27' }),
      fact({ id: 'F-011', claim: 'X followers', value: 181010, unit: 'followers', display: '180K+ on X (Sep 2026)', source: 'https://api.fxtwitter.com/tokentails (public mirror)', status: 'verified', maxAgeDays: 90, asOf: '2026-09-27', checkedAt: '2026-09-27', tense: 'present' }),
      fact({ id: 'F-017', claim: 'Telegram Mini App (retired)', value: null, unit: null, display: null, status: 'retired', surfaces: [], maxAgeDays: null, asOf: null, checkedAt: '2026-09-29' }),
      goalEntry(),
      { id: 'C-005', key: 'daily_budget', claim: 'Daily treat budget', value: '1', unit: 'USDC', display: '1 USDC of treats a day', appDisplay: '$1 of treats a day', source: CONFIG, asOf: '2026-09-30', checkedAt: '2026-09-30', status: 'verified', maxAgeDays: 120, surfaces: ['heist'], chain: 'arc', tense: 'present', config: { file: CONFIG, const: 'DEFAULT_DAILY_BUDGET_WEI', decimals: 18 } },
      { id: 'L-countries', key: 'partner_countries', claim: 'Partner countries', value: null, unit: 'countries', display: '{n} partner countries', source: 'GET /impact', asOf: null, checkedAt: '2026-09-30', status: 'live', maxAgeDays: 2, surfaces: ['impact'], tense: 'present', live: { endpoint: '/impact', path: 'shelters.countries' } },
    ],
  };
}

/** A scratch repo root with a registry and the shelter config the goal cap is read from. */
function scratch(registry = baseRegistry(), { budgetWei = ONE_USDC } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fund-facts-'));
  mkdirSync(join(root, 'funding/framework/facts'), { recursive: true });
  writeFileSync(join(root, 'funding/framework/facts/facts.json'), formatRegistry(registry));
  mkdirSync(join(root, dirname(CONFIG)), { recursive: true });
  writeFileSync(join(root, CONFIG), `/** 1 USDC in wei. */\nconst DEFAULT_DAILY_BUDGET_WEI = '${budgetWei}';\nconst DEFAULT_AMOUNT_WEI = '10000000000000000';\n`);
  writeFileSync(join(root, 'funding/framework/facts/sources.json'), '{}\n');
  return root;
}

const problemsOf = (registry, opts) => validateRegistry(registry, opts).problems;
const withFact = (patch, id = 'F-001') => {
  const r = baseRegistry();
  const i = r.facts.findIndex((f) => f.id === id);
  r.facts[i] = { ...r.facts[i], ...patch };
  return r;
};
const quiet = () => {
  const lines = [];
  return { log: (s) => lines.push(String(s)), err: (s) => lines.push(String(s)), lines };
};

// ---------- schema ----------

test('schema: the fixture registry is valid and every G11 status is known', () => {
  assert.deepEqual(problemsOf(baseRegistry()), []);
  assert.deepEqual(STATUSES, ['verified', 'company-reported', 'sei-era', 'live', 'unverified', 'retired']);
});

test('schema: unverified and retired entries never have surfaces', () => {
  assert.match(problemsOf(withFact({ status: 'unverified' })).join('\n'), /F-001: unverified entries never have surfaces/);
  assert.match(problemsOf(withFact({ surfaces: ['landing'], display: 'x' }, 'F-017')).join('\n'), /F-017: retired entries never have surfaces/);
});

test('schema: required fields, unknown fields, ids, duplicates and enums', () => {
  const missing = baseRegistry();
  delete missing.facts[0].tense;
  assert.match(problemsOf(missing).join('\n'), /F-001: missing "tense"/);
  assert.match(problemsOf(withFact({ colour: 'red' })).join('\n'), /unknown field "colour"/);
  assert.match(problemsOf(withFact({ id: 'X-1' })).join('\n'), /id must be F-###/);
  const dup = baseRegistry();
  dup.facts.push({ ...dup.facts[0] });
  assert.match(problemsOf(dup).join('\n'), /F-001: duplicate id/);
  assert.match(problemsOf(withFact({ status: 'rumoured' })).join('\n'), /status must be one of/);
  assert.match(problemsOf(withFact({ surfaces: ['billboard'] })).join('\n'), /unknown surface "billboard"/);
  assert.match(problemsOf(withFact({ claim: 'a | b' })).join('\n'), /must not contain "\|"/);
  assert.match(problemsOf({ facts: 'nope' }).join('\n'), /"facts" array/);
});

test('schema: surfaced entries need display text and a maxAgeDays (SEI history excepted)', () => {
  assert.match(problemsOf(withFact({ display: null })).join('\n'), /needs display text/);
  assert.match(problemsOf(withFact({ maxAgeDays: null })).join('\n'), /needs maxAgeDays/);
  assert.deepEqual(problemsOf(withFact({ maxAgeDays: null }, 'F-003')), []);
});

test('schema: SEI-era, company-reported and live rules (R11, R12, decision #73)', () => {
  assert.match(problemsOf(withFact({ display: '324K+ active wallets in the peak week' }, 'F-003')).join('\n'), /must name SEI/);
  assert.match(problemsOf(withFact({ chain: 'stellar' }, 'F-003')).join('\n'), /chain "sei"/);
  assert.match(problemsOf(withFact({ tense: 'present' }, 'F-003')).join('\n'), /tense "past"/);
  assert.match(problemsOf(withFact({ display: '540K+ registered players' })).join('\n'), /must say "company-reported"/);
  assert.match(problemsOf(withFact({ status: 'live' })).join('\n'), /only L- entries are live/);
  assert.match(problemsOf(withFact({ live: undefined }, 'L-countries')).join('\n'), /live: \{ endpoint, path \}/);
  assert.match(problemsOf(withFact({ status: 'verified', value: 3 }, 'L-countries')).join('\n'), /L- entries are live/);
});

test('schema: future-tense display never says money already moved (R4)', () => {
  assert.match(problemsOf(withFact({ display: 'Goal: 90 USDC sent to Pink Paw' }, 'C-001')).join('\n'), /must not say the money already moved/);
});

test('schema: product claims backed by a spec stay unverified until it exists (decision #75)', () => {
  const p = { id: 'P-001', claim: 'From reel to on-chain in 3 taps', value: 3, unit: 'taps', display: '3 taps', source: 'spec', asOf: '2026-09-30', checkedAt: '2026-09-30', status: 'unverified', maxAgeDays: null, surfaces: [], tense: 'present', evidence: { spec: 'client/e2e/claims/three-taps.spec.ts', task: '7b' } };
  const reg = baseRegistry();
  reg.facts.push(p);
  assert.deepEqual(problemsOf(reg, { exists: () => false }), []);
  reg.facts[reg.facts.length - 1] = { ...p, status: 'verified', surfaces: ['landing'], maxAgeDays: 90 };
  assert.match(problemsOf(reg, { exists: () => false }).join('\n'), /P-001: status verified needs its spec/);
  assert.deepEqual(problemsOf(reg, { exists: () => true }), []);
});

test('schema: goal and campaign shape; only one campaign', () => {
  assert.match(problemsOf(withFact({ goal: { startDate: '2026-10-02', endDate: '2026-10-01', cap: goalEntry().goal.cap } }, 'C-001')).join('\n'), /endDate is before startDate/);
  assert.match(problemsOf(withFact({ value: 'ninety' }, 'C-001')).join('\n'), /decimal string/);
  assert.match(problemsOf(withFact({ goal: goalEntry().goal }, 'F-011')).join('\n'), /only C- entries have a goal/);
  const two = baseRegistry();
  two.facts.push(goalEntry({ id: 'C-009', key: 'campaign_two' }));
  assert.match(problemsOf(two).join('\n'), /only one entry may generate campaign.json/);
});

test('schema: personal data is refused anywhere in the registry (email, phone, IBAN)', () => {
  assert.deepEqual(findPersonalData({ a: 'no personal data here, 181,010 followers, 2026-09-27' }), []);
  for (const [kind, text] of [
    ['email', 'contact founder@example.com for the ledger'],
    ['phone', 'call +370 612 34567'],
    ['phone', 'tel:+37061234567'],
    ['IBAN', 'pay LT12 1000 0111 0100 1000'],
    ['IBAN', 'DE89370400440532013000'],
    ['phone', 'call (415) 555-0100 after six'],
    ['phone', 'or 415.555.0100'],
    ['phone', 'mobile 8 600 12345'],
    ['phone', 'mobile 860012345'],
    ['IBAN', 'pay lt12 1000 0111 0100 1000'],
    ['IBAN', 'de89370400440532013000'],
  ]) {
    const p = problemsOf(withFact({ source: text }));
    assert.ok(p.some((m) => m.includes(`personal data refused: ${kind} pattern at facts[0].source`)), `${kind}: ${text} -> ${p.join('; ')}`);
  }
  // Numbers and contract ids that are not personal data pass.
  assert.deepEqual(findPersonalData({ v: '1,218,693', c: 'CBHOJOPZ…6QVF', d: '2025–26', w: '324,422 wallets' }), []);
  assert.deepEqual(findPersonalData({
    day: 'week of 2025-11-17', big: '875,907 transactions', wei: '10000000000000000',
    tweet: 'https://x.com/tokentails/status/2046611480263467341', money: '€105 in FY2025',
    notIban: 'ab12cdefghijklmnop (fails the mod-97 check)',
  }), []);
});

test('dates: loose FACTS.md dates end at the end of their period; goal days are inclusive', () => {
  assert.equal(endOfDate('2026-04').toISOString().slice(0, 10), '2026-04-30');
  assert.equal(endOfDate('2025–26').toISOString().slice(0, 10), '2026-12-31');
  assert.equal(endOfDate('2026').toISOString().slice(0, 10), '2026-12-31');
  assert.equal(endOfDate('soon'), null);
  assert.equal(inclusiveDays('2026-10-02', '2026-10-02'), 1);
  assert.equal(inclusiveDays('2026-10-02', '2026-12-30'), 90);
});

// ---------- goal feasibility (decision #76) ----------

test('units: wei strings round-trip with 18 decimals', () => {
  assert.equal(formatUnits(10n ** 18n, 18), '1');
  assert.equal(formatUnits(10n ** 16n, 18), '0.01');
  assert.equal(parseUnits('90', 18), 90n * 10n ** 18n);
  assert.equal(parseUnits('12.5', 18), 125n * 10n ** 17n);
});

test('goal: 90 USDC over 90 days is reachable at 1 USDC/day; the old 500 USDC goal is not', () => {
  const root = scratch();
  const ok = goalFeasibility(goalEntry(), root);
  assert.deepEqual({ ok: ok.ok, days: ok.days, capPerDay: ok.capPerDay, maxAtCap: ok.maxAtCap, minDays: ok.minDays }, { ok: true, days: 90, capPerDay: '1', maxAtCap: '90', minDays: 90 });
  const old = goalFeasibility(goalEntry({ value: '500' }), root);
  assert.equal(old.ok, false);
  assert.equal(old.minDays, 500);
});

test('build: an unreachable goal fails with the numbers and writes nothing', async () => {
  const root = scratch(withFact({ value: '500', display: 'Goal: 500 USDC by 30 Dec 2026' }, 'C-001'));
  const { outputs, problems } = buildOutputs({ root });
  assert.equal(outputs.length, 0);
  assert.match(problems.join('\n'), /C-001: goal 500 USDC is unreachable at the cap: 1 USDC\/day for 90 days is at most 90 USDC \(needs 500 days\)/);
  const io = quiet();
  assert.equal(await build(root, ['--check'], io), 1);
  assert.ok(!existsSync(join(root, TARGETS.campaign)));
});

test('build: a lower configured cap makes the same goal unreachable', () => {
  const root = scratch(baseRegistry(), { budgetWei: '500000000000000000' });
  const { problems } = buildOutputs({ root });
  assert.ok(problems.some((p) => /C-001: goal 90 USDC is unreachable/.test(p)));
  assert.ok(problems.some((p) => /C-005: value 1 USDC does not match .* \(0.5\)/.test(p)), 'config mirrors follow the code');
});

test('build: a missing cap constant is a problem, not a crash', () => {
  const root = scratch();
  writeFileSync(join(root, CONFIG), 'export const nothing = 1;\n');
  assert.ok(buildOutputs({ root }).problems.some((p) => /no string constant DEFAULT_DAILY_BUDGET_WEI/.test(p)));
});

// ---------- generator ----------

function build(root, argv, io) {
  const flags = { root, check: argv.includes('--check'), quiet: argv.includes('--quiet') };
  return runFacts('build', { flags, log: io.log, err: io.err });
}

test('build: writes every target, then --check is clean; output is deterministic', async () => {
  const root = scratch();
  const io = quiet();
  assert.equal(await build(root, [], io), 0);
  for (const p of Object.values(TARGETS)) assert.ok(existsSync(join(root, p)), `${p} was written`);
  const first = Object.values(TARGETS).map((p) => readFileSync(join(root, p), 'utf8'));
  assert.equal(await build(root, ['--check'], quiet()), 0);
  assert.equal(await build(root, [], quiet()), 0);
  assert.deepEqual(Object.values(TARGETS).map((p) => readFileSync(join(root, p), 'utf8')), first);
});

test('build --check: fails on drift in any generated copy and names the file', async () => {
  const root = scratch();
  await build(root, [], quiet());
  writeFileSync(join(root, TARGETS.client), `${readFileSync(join(root, TARGETS.client), 'utf8')}// hand edit\n`);
  const io = quiet();
  assert.equal(await build(root, ['--check'], io), 1);
  assert.match(io.lines.join('\n'), /out of date \(1\)[\s\S]*client\/lib\/facts.generated.ts/);
  // A registry change without a rebuild is drift too.
  await build(root, [], quiet());
  const reg = JSON.parse(readFileSync(join(root, 'funding/framework/facts/facts.json'), 'utf8'));
  reg.facts.find((f) => f.id === 'F-011').display = '181K+ on X (Sep 2026)';
  writeFileSync(join(root, 'funding/framework/facts/facts.json'), formatRegistry(reg));
  assert.equal(await build(root, ['--check'], quiet()), 1);
});

test('build --check: a hand-edited FACTS.md points at `fund facts absorb`', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const md = join(root, TARGETS.factsMd);
  writeFileSync(md, readFileSync(md, 'utf8').replace('| 181,010 |', '| 182,000 |'));
  const io = quiet();
  assert.equal(await build(root, ['--check'], io), 1);
  assert.match(io.lines.join('\n'), /fund facts absorb/);
});

test('FACTS.md: same table format; only F- rows; company-reported reads as unverified', () => {
  const root = scratch();
  const { outputs } = buildOutputs({ root });
  writeOutputs(outputs, { root });
  const md = join(root, TARGETS.factsMd);
  const text = readFileSync(md, 'utf8');
  assert.match(text, /^# Fact base\n/);
  assert.match(text, /\| ID \| Fact \| Value \| Source \| Date \| Status \|\n\|---\|---\|---\|---\|---\|---\|/);
  assert.doesNotMatch(text, /\| (?:C-001|L-countries) \|/);
  // The two existing readers parse it.
  const rows = readFactRows(md);
  assert.deepEqual([...rows.keys()], ['F-001', 'F-002', 'F-003', 'F-011', 'F-017']);
  assert.deepEqual(rows.get('F-001'), { id: 'F-001', label: 'Registered users, all time', value: '542,000', source: 'extra/traction.md', date: '2026-04', status: 'unverified' });
  assert.equal(rows.get('F-017').value, '—');
  const { facts, problems } = CORE.loadFacts(md);
  assert.deepEqual(problems, []);
  assert.equal(facts.get('F-011').status, 'verified');
  assert.equal(mdStatus('live'), 'verified');
});

test('public subset: only public statuses with a surface; no internal sources or notes', () => {
  const reg = baseRegistry();
  reg.facts[0].note = 'internal note';
  const pub = publicEntries(reg);
  assert.deepEqual(pub.map((f) => f.id), ['C-001', 'C-005', 'F-001', 'F-003', 'F-011', 'L-countries']);
  const byId = Object.fromEntries(pub.map((f) => [f.id, f]));
  assert.equal(byId['C-005'].appDisplay, '$1 of treats a day');
  assert.equal(byId['F-011'].appDisplay, null);
  assert.equal(byId['F-001'].sourceUrl, null, 'repo paths never leave the repo');
  assert.equal(byId['F-011'].sourceUrl, 'https://api.fxtwitter.com/tokentails');
  assert.equal(byId['F-001'].note, undefined);
  assert.equal(byId['F-001'].claim, undefined);
  assert.deepEqual(byId['C-001'].goal, { startDate: '2026-10-02', endDate: '2026-12-30' });
  assert.equal(byId['C-001'].campaign, undefined);
  assert.deepEqual(byId['L-countries'].live, { endpoint: '/impact', path: 'shelters.countries' });
});

test('TypeScript copies: typed id union, no imports, no `satisfies`; the backend copy is lint-exempt', () => {
  const root = scratch();
  const { outputs } = buildOutputs({ root });
  const get = (p) => outputs.find((o) => o.path === p).content;
  for (const p of [TARGETS.client, TARGETS.backend, TARGETS.heist]) {
    const ts = get(p);
    assert.match(ts, /^\/\/ GENERATED by `fund facts build`/);
    assert.match(ts, /export type FactId = 'C-001' \| 'C-005' \| 'F-001' \| 'F-003' \| 'F-011' \| 'L-countries';/);
    assert.match(ts, /export const FACTS: Record<FactId, PublicFact> = \{/);
    assert.match(ts, /export const PUBLIC_FACTS_PATH = '\/facts\/facts.json';/);
    assert.doesNotMatch(ts, /\bimport\b|\bsatisfies\b/);
    assert.doesNotMatch(ts, /F-002|F-017/, 'unverified and retired ids are not citable');
  }
  assert.match(get(TARGETS.backend), /\/\* eslint-disable \*\//);
  assert.match(get(TARGETS.heist), /HEIST_FACTS_URL/);
  const json = JSON.parse(get(TARGETS.publicJson));
  assert.equal(json.version, 1);
  assert.equal(json.facts.length, 6);
});

test('campaign.json keeps its shape (client/__test__/shelter-campaign.test.ts)', () => {
  const c = JSON.parse(renderCampaign(goalEntry()));
  assert.deepEqual(Object.keys(c), ['name', 'goalUsdc', 'startDate', 'chainId', 'fromBlock', 'shelter']);
  assert.deepEqual(c, { name: 'Pink Paw autumn rescue', goalUsdc: '90', startDate: '2026-10-02', chainId: 5042, fromBlock: null, shelter: { name: 'Pink Paw', wallet: null, handover: 'held-by-token-tails' } });
  assert.equal(JSON.parse(renderCampaign(goalEntry({ campaign: { ...goalEntry().campaign, shelter: { name: 'P', handover: 'handed-over' } } }))).shelter.handover, 'handed-over');
});

test('build: schema problems stop the build before anything is written', async () => {
  const root = scratch(withFact({ status: 'unverified' }));
  const io = quiet();
  assert.equal(await build(root, [], io), 1);
  assert.match(io.lines.join('\n'), /F-001: unverified entries never have surfaces/);
  assert.ok(!existsSync(join(root, TARGETS.publicJson)));
});

test('build: personal data in the registry stops the build', async () => {
  const root = scratch(withFact({ source: 'ask jane.doe@example.org' }, 'F-002'));
  const io = quiet();
  assert.equal(await build(root, [], io), 1);
  assert.match(io.lines.join('\n'), /personal data refused: email/);
});

// ---------- absorb ----------

test('absorb: `fund refresh --write` edits to value, date and status move into facts.json', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const md = join(root, TARGETS.factsMd);
  writeFileSync(md, readFileSync(md, 'utf8').replace('| X followers | 181,010 | https://api.fxtwitter.com/tokentails (public mirror) | 2026-09-27 |', '| X followers | 183,400 | https://api.fxtwitter.com/tokentails (public mirror) | 2026-10-05 |'));
  const dry = absorbFactsMd({ root, write: false });
  assert.deepEqual(dry.patched, [{ id: 'F-011', changes: [['value', 181010, 183400], ['checkedAt', '2026-09-27', '2026-10-05']] }]);
  assert.equal(dry.wrote, false);
  const { wrote } = absorbFactsMd({ root });
  assert.equal(wrote, true);
  const f = JSON.parse(readFileSync(join(root, 'funding/framework/facts/facts.json'), 'utf8')).facts.find((x) => x.id === 'F-011');
  assert.equal(f.value, 183400);
  assert.equal(f.checkedAt, '2026-10-05');
  assert.equal(await build(root, [], quiet()), 0);
  assert.equal(await build(root, ['--check'], quiet()), 0);
});

test('absorb: a changed Fact or Source cell is left for a person', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const md = join(root, TARGETS.factsMd);
  writeFileSync(md, readFileSync(md, 'utf8').replace('| X followers |', '| X (Twitter) followers |'));
  const { manual, patched } = absorbFactsMd({ root, write: false });
  assert.deepEqual(patched, []);
  assert.match(manual.join('\n'), /F-011: the Fact cell differs/);
});

// ---------- weekly report and release gate ----------

const NOW = Date.parse('2026-09-30T12:00:00Z');

test('staleness: surfaced entries past maxAgeDays are problems; SEI history and live metrics never age', () => {
  assert.deepEqual(staleness(baseRegistry(), NOW), []);
  const later = Date.parse('2027-01-15T00:00:00Z');
  const s = staleness(baseRegistry(), later);
  assert.deepEqual(s.map((x) => [x.id, x.surfaced]), [['F-011', true]]);
  assert.deepEqual(staleness(baseRegistry(), Date.parse('2027-02-01T00:00:00Z')).map((x) => x.id), ['F-011', 'C-001', 'C-005']);
  assert.match(s[0].detail, /checked 2026-09-27, 109 days ago \(max 90\)/);
});

test('goals: before, during and after the goal window', () => {
  const root = scratch();
  const before = goalStatus(baseRegistry(), NOW, root)[0];
  assert.equal(before.problem, false);
  assert.match(before.detail, /starts 2026-10-02; 90 USDC needs 90 of 90 days at the cap \(0 spare\)\. Not counting yet \(no shelter\.wallet and fromBlock\); it must be counting by 2026-10-02/);
  const counting = withFact({ campaign: { ...goalEntry().campaign, fromBlock: 100, shelter: { name: 'Pink Paw', wallet: '0x1111111111111111111111111111111111111111', handover: 'held-by-token-tails' } } }, 'C-001');
  const mid = goalStatus(counting, Date.parse('2026-11-01T00:00:00Z'), root)[0];
  assert.equal(mid.problem, false);
  assert.match(mid.detail, /running: 60 of 90 days left/);
  assert.match(mid.detail, /reachable only if \/shelter-payouts already shows at least 30 USDC raised/);
  const ended = goalStatus(baseRegistry(), Date.parse('2026-12-31T00:00:00Z'), root)[0];
  assert.equal(ended.problem, true);
  assert.match(ended.detail, /ended on 2026-12-30/);
});

test('goals: a running goal that is not counting is a problem, and says when it becomes unreachable', () => {
  const root = scratch();
  // 122-day window, 90 needed: counting must start by 2026-11-03.
  const roomy = withFact({ goal: { ...goalEntry().goal, endDate: '2027-01-31' } }, 'C-001');
  const early = goalStatus(roomy, Date.parse('2026-10-05T00:00:00Z'), root)[0];
  assert.equal(early.problem, true);
  assert.match(early.detail, /has no shelter\.wallet and fromBlock, so no payout counts toward it; it must be counting by 2026-11-03/);
  const late = goalStatus(roomy, Date.parse('2026-11-10T00:00:00Z'), root)[0];
  assert.equal(late.problem, true);
  assert.match(late.detail, /cannot be met: 83 days left at 1 USDC\/day is at most 83 USDC/);
});

test('renderTs: every declaration is prettier-ignore, so a formatter leaves the generated file alone', () => {
  const ts = renderTs(publicEntries(baseRegistry()), { indent: 4, target: 'backend' });
  const exports = ts.split('\n').filter((l) => l.startsWith('export '));
  assert.ok(exports.length >= 5);
  const lines = ts.split('\n');
  lines.forEach((l, i) => { if (l.startsWith('export ')) assert.equal(lines[i - 1], '// prettier-ignore', `line ${i + 1}`); });
});

test('the generated backend file passes the backend prettier check', { skip: !existsSync(join(REPO_ROOT, 'backend/node_modules/.bin/prettier')) && 'backend deps not installed' }, () => {
  const r = spawnSync(join(REPO_ROOT, 'backend/node_modules/.bin/prettier'), ['--check', 'src/impact/facts.generated.ts'], { cwd: join(REPO_ROOT, 'backend'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('impact reconciliation: skipped until the snapshot is published; checks presence, freshness and RPC state', async () => {
  const reg = baseRegistry();
  assert.match((await impactReconciliation(reg, { impactUrl: '', now: NOW })).skipped, /FACTS_IMPACT_URL is not set/);
  const res = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });
  const fresh = await impactReconciliation(reg, { impactUrl: 'https://cdn/impact.json', fetchImpl: res({ asOf: '2026-09-30T11:00:00Z', shelters: { countries: 2 } }), now: NOW });
  assert.deepEqual(fresh.items, []);
  const bad = await impactReconciliation(reg, { impactUrl: 'https://cdn/impact.json', fetchImpl: res({ asOf: '2026-09-20T00:00:00Z', sources: { chain: 'error' }, shelters: {} }), now: NOW });
  assert.deepEqual(bad.items.map((i) => i.id), ['impact', 'L-countries']);
  assert.match(bad.items[0].detail, /sources.chain = "error"/);
  const down = await impactReconciliation(reg, { impactUrl: 'https://cdn/impact.json', fetchImpl: res({}, false, 503), now: NOW });
  assert.match(down.items[0].detail, /HTTP 503/);
});

test('report: one markdown body with problems for a person; probes run through fund refresh (never writing)', async () => {
  const root = scratch();
  let seen;
  const refresh = async (opts) => { seen = opts; return { results: [{ id: 'F-007', outcome: 'DRIFT', detail: '1,218,693 -> 1,300,000' }] }; };
  const r = await buildReport({ root, now: Date.parse('2027-01-15T00:00:00Z'), offline: true, refresh, impactUrl: '' });
  assert.equal(seen.write, false);
  assert.equal(seen.offline, true);
  assert.match(r.markdown, /^# Facts weekly report \(2027-01-15\)/);
  assert.match(r.markdown, /## Staleness[\s\S]*\*\*F-011 \(surfaced\)\*\*/);
  assert.match(r.markdown, /## Goals[\s\S]*\*\*C-001\*\*: goal ended/);
  assert.match(r.markdown, /## Reconciliation[\s\S]*DRIFT F-007/);
  assert.ok(r.problems.some((p) => /F-007 probe DRIFT/.test(p)));
  const clean = await buildReport({ root, now: NOW, offline: true, refresh: async () => ({ results: [] }), impactUrl: '' });
  assert.deepEqual(clean.problems, []);
  assert.match(clean.markdown, /No problems\./);
});

test('report: probe text from outside sites is a plain code block (no markup, links or mentions)', async () => {
  const root = scratch();
  const detail = 'page says ```\n# pwned``` @maintainer [x](https://evil.example)';
  const r = await buildReport({ root, now: NOW, offline: true, refresh: async () => ({ results: [{ id: 'F-007', outcome: 'DRIFT', detail }] }), impactUrl: '' });
  const section = r.markdown.slice(r.markdown.indexOf('## Reconciliation'));
  const fences = section.split('\n').filter((l) => l.startsWith('```'));
  assert.deepEqual(fences, ['```text', '```'], 'exactly one fence opens and one closes');
  assert.match(section, /```text\n- DRIFT F-007: page says '''/);
});

test('gate: build --check plus no stale surfaced fact, no network', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const prev = process.env.FUND_NOW;
  try {
    process.env.FUND_NOW = '2026-09-30T12:00:00Z';
    assert.equal(await runFacts('gate', { flags: { root }, ...quiet() }), 0);
    process.env.FUND_NOW = '2027-01-15T00:00:00Z';
    const io = quiet();
    assert.equal(await runFacts('gate', { flags: { root }, log: io.log, err: io.err }), 1);
    assert.match(io.lines.join('\n'), /surfaced fact\(s\) are stale[\s\S]*F-011/);
  } finally {
    if (prev === undefined) delete process.env.FUND_NOW; else process.env.FUND_NOW = prev;
  }
});

test('cli: unknown facts subcommand prints usage', async () => {
  const io = quiet();
  assert.equal(await runFacts('nope', { flags: {}, log: io.log, err: io.err }), 2);
  assert.match(io.lines.join('\n'), /facts build \[--check\]/);
});

// ---------- the real registry (G11 registry migration, decisions #29, #73-#77) ----------

const REAL = JSON.parse(readFileSync(join(HERE, '..', 'facts', 'facts.json'), 'utf8'));
const real = (id) => REAL.facts.find((f) => f.id === id);

test('real registry: valid, and `fund facts build --check` is clean against the tree', () => {
  const { problems, outputs } = buildOutputs({ root: REPO_ROOT });
  assert.deepEqual(problems, []);
  assert.deepEqual(writeOutputs(outputs, { root: REPO_ROOT, check: true }).changed, [], 'run `node funding/framework/bin/fund.mjs facts build`');
});

test('real registry: the accepted FACTS-proposed.md rows are applied', () => {
  assert.deepEqual([real('F-003').value, real('F-003').asOf, real('F-003').status], [324422, '2025-11-17', 'sei-era']);
  assert.match(real('F-003').claim, /^Peak weekly unique active wallets, week of 2025-11-17/);
  assert.deepEqual([real('F-004').value, real('F-004').status], [875907, 'sei-era']);
  assert.deepEqual([real('F-011').value, real('F-011').display, real('F-011').status], [181010, '180K+ on X (Sep 2026)', 'verified']);
  assert.doesNotMatch(real('F-014').value, /1st place/);
  assert.match(real('F-023').claim, /Le Chat-Rivari Café/);
  assert.deepEqual(real('F-023').surfaces, [], 'decision #74: no event chip until sourced');
  assert.deepEqual([real('F-024').status, real('F-024').surfaces, real('F-024').key], ['unverified', [], 'strays_saved'], 'decision #29');
});

test('real registry: G4 keys fold in and "3 taps" is retired with no surfaces (decision #75, task 7b)', () => {
  const keys = Object.fromEntries(REAL.facts.filter((f) => f.key).map((f) => [f.key, f.id]));
  assert.equal(keys.strays_saved, 'F-024');
  assert.equal(keys.partner_countries, 'L-countries');
  for (const k of ['purchase_share', 'paw', 'campaign']) assert.match(keys[k], /^C-\d{3}$/, k);
  const taps = REAL.facts.find((f) => f.id === 'P-001');
  assert.deepEqual([taps.unit, taps.status, taps.surfaces], ['taps', 'retired', []]);
});

test('real registry: C-001 is reachable at the configured cap before 2026-10-02 and generates campaign.json (decision #76)', () => {
  const c = real('C-001');
  const r = goalFeasibility(c, REPO_ROOT);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(c.goal.startDate, '2026-10-02');
  const campaign = JSON.parse(readFileSync(join(REPO_ROOT, TARGETS.campaign), 'utf8'));
  assert.equal(campaign.goalUsdc, c.value);
  assert.equal(campaign.startDate, c.goal.startDate);
  // A wallet without fromBlock would count every payout ever made to it (pass-5 review, issue 1).
  if (campaign.shelter.wallet !== null) assert.ok(Number.isInteger(campaign.fromBlock), 'campaign.json has a wallet, so it needs a fromBlock');
});

test('real registry: company-reported entries are labelled (decision #73)', () => {
  for (const f of REAL.facts.filter((x) => x.status === 'company-reported')) assert.match(f.display, /company-reported/, f.id);
});

// ---------- review fixes (task 2c) ----------

test('build: refuses to overwrite FACTS.md rows edited since the last build; absorb or --discard-md', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const md = join(root, TARGETS.factsMd);
  const refreshed = readFileSync(md, 'utf8').replace('| 181,010 |', '| 190,000 |'); // as `fund refresh --write` does
  writeFileSync(md, refreshed);
  const io = quiet();
  assert.equal(await build(root, [], io), 1);
  assert.match(io.lines.join('\n'), /edited since the last build[\s\S]*fund\.mjs facts absorb[\s\S]*--discard-md/);
  assert.equal(readFileSync(md, 'utf8'), refreshed, 'the edit is still there');
  // absorb moves it into facts.json, then the build keeps it.
  absorbFactsMd({ root });
  assert.equal(await build(root, [], quiet()), 0);
  assert.match(readFileSync(md, 'utf8'), /\| F-011 \| X followers \| 190,000 \|/);
  assert.equal(await build(root, ['--check'], quiet()), 0);
  // --discard-md throws an edit away on purpose.
  writeFileSync(md, readFileSync(md, 'utf8').replace('| 190,000 |', '| 1 |'));
  assert.equal(await runFacts('build', { flags: { root, 'discard-md': true }, log: () => {}, err: () => {} }), 0);
  assert.match(readFileSync(md, 'utf8'), /\| 190,000 \|/);
});

test('build: a FACTS.md that is only behind facts.json is overwritten without complaint', async () => {
  const root = scratch();
  await build(root, [], quiet());
  const regPath = join(root, 'funding/framework/facts/facts.json');
  const reg = JSON.parse(readFileSync(regPath, 'utf8'));
  reg.facts.find((f) => f.id === 'F-011').value = 185000;
  writeFileSync(regPath, formatRegistry(reg));
  assert.equal(await build(root, [], quiet()), 0);
  assert.match(readFileSync(join(root, TARGETS.factsMd), 'utf8'), /\| 185,000 \|/);
  // A FACTS.md from before the row stamp counts as edited when its rows differ.
  const md = join(root, TARGETS.factsMd);
  writeFileSync(md, readFileSync(md, 'utf8').replace(/\n<!-- fund facts build:[^\n]*-->\n/, '\n').replace('| 185,000 |', '| 184,000 |'));
  assert.equal(await build(root, [], quiet()), 1);
});

test('FACTS.md row stamp: states current, behind and edited', () => {
  const reg = baseRegistry();
  const md = buildOutputs({ root: scratch(reg) }).outputs.find((o) => o.path === TARGETS.factsMd).content;
  assert.equal(factsMdState(md, md), 'current');
  const newer = JSON.parse(JSON.stringify(reg));
  newer.facts.find((f) => f.id === 'F-011').value = 1;
  const md2 = buildOutputs({ root: scratch(newer) }).outputs.find((o) => o.path === TARGETS.factsMd).content;
  assert.equal(factsMdState(md, md2), 'behind');
  assert.equal(factsMdState(md.replace('| 181,010 |', '| 2 |'), md2), 'edited');
  const root = scratch(reg);
  writeFileSync(join(root, TARGETS.factsMd), md);
  assert.equal(readFactRows(join(root, TARGETS.factsMd)).get('F-011').value, '181,010');
});

test('goal: shareBps scales the cap to the shelter\'s share of the split; zero headroom is a warning', () => {
  const root = scratch();
  const full = goalFeasibility(goalEntry(), root);
  assert.equal(full.shareBps, 10000);
  assert.equal(full.spareDays, 0);
  const half = goalFeasibility(goalEntry({ goal: { ...goalEntry().goal, shareBps: 5000 } }), root);
  assert.deepEqual({ ok: half.ok, capPerDay: half.capPerDay, maxAtCap: half.maxAtCap, minDays: half.minDays }, { ok: false, capPerDay: '0.5', maxAtCap: '45', minDays: 180 });
  const { problems } = buildOutputs({ root: scratch(withFact({ goal: { ...goalEntry().goal, shareBps: 5000 } }, 'C-001')) });
  assert.ok(problems.some((p) => /C-001: goal 90 USDC is unreachable at the cap: 0\.5 USDC\/day \(50% of the 1 USDC budget\)/.test(p)), problems.join('; '));
  const { warnings } = buildOutputs({ root });
  assert.ok(warnings.some((w) => /C-001: goal 90 USDC has no headroom/.test(w)));
  const lower = buildOutputs({ root: scratch(withFact({ value: '80', display: 'Goal: 80 USDC by 30 Dec 2026' }, 'C-001')) });
  assert.deepEqual(lower.warnings, []);
  for (const bad of [0, 10001, 1.5, '5000']) {
    assert.ok(problemsOf(withFact({ goal: { ...goalEntry().goal, shareBps: bad } }, 'C-001')).some((p) => /shareBps must be an integer/.test(p)), String(bad));
  }
});

test('schema: displays on app surfaces pass the app-build word list, or carry an appDisplay (R10)', () => {
  const noApp = withFact({ appDisplay: undefined }, 'C-005');
  delete noApp.facts.find((f) => f.id === 'C-005').appDisplay;
  assert.match(problemsOf(noApp).join('\n'), /C-005: display is shown on app surface\(s\) heist but uses USDC/);
  assert.match(problemsOf(withFact({ appDisplay: 'a treat on Arc' }, 'C-005')).join('\n'), /C-005: appDisplay is shown on app surface\(s\) heist but uses a chain name: "Arc"/);
  assert.deepEqual(problemsOf(withFact({ surfaces: ['shelter-payouts'] }, 'C-005')), [], 'web surfaces may keep USDC in display');
  assert.match(problemsOf(withFact({ appDisplay: 'x' }, 'F-002')).join('\n'), /appDisplay is only for surfaced entries/);
  assert.match(problemsOf(withFact({ appDisplay: '' }, 'C-005')).join('\n'), /appDisplay must be a non-empty one-line string/);
  // The brand name is not a chain word.
  assert.deepEqual(problemsOf(withFact({ appDisplay: 'Token Tails sends $1 of treats a day' }, 'C-005')), []);
});

test('schema: short and recordsOnRequest are optional, surfaced-only and checked (review 26 #4, #8)', () => {
  assert.deepEqual(problemsOf(withFact({ short: '$1 a day' }, 'C-005')), []);
  assert.deepEqual(problemsOf(withFact({ recordsOnRequest: true }, 'C-005')), []);
  assert.match(problemsOf(withFact({ short: '' }, 'C-005')).join('\n'), /short must be a non-empty one-line string/);
  assert.match(problemsOf(withFact({ short: 'x' }, 'F-002')).join('\n'), /short is only for surfaced entries/);
  assert.match(problemsOf(withFact({ recordsOnRequest: false }, 'C-005')).join('\n'), /recordsOnRequest is opt-in/);
  assert.match(problemsOf(withFact({ recordsOnRequest: true }, 'F-002')).join('\n'), /recordsOnRequest is only for surfaced entries/);
  assert.match(problemsOf(withFact({ short: '1 USDC a day' }, 'C-005')).join('\n'), /short is shown on app surface\(s\) heist but uses USDC/);
});

test('real registry: C-004/C-005 are present-tense config amounts with app wording; L-rail carries rail state', () => {
  for (const id of ['C-004', 'C-005']) {
    const f = real(id);
    assert.equal(f.tense, 'present', id);
    assert.ok(f.appDisplay && !/USDC|Arc/.test(f.appDisplay), id);
  }
  const rail = real('L-rail');
  assert.deepEqual([rail.status, rail.live], ['live', { endpoint: '/shelter/donate/status', path: 'railState' }]);
  assert.equal(real('C-001').goal.shareBps, 10000);
});

// ---------- review fixes, pass 6 (task 2c) ----------

const PINK_WALLET = '0x' + '1a'.repeat(20);
const withCampaign = (campaign) => withFact({ campaign: { ...goalEntry().campaign, ...campaign, shelter: { ...goalEntry().campaign.shelter, ...(campaign.shelter || {}) } } }, 'C-001');

test('schema: a campaign wallet needs a fromBlock, and both must be well formed', () => {
  assert.deepEqual(problemsOf(withCampaign({ fromBlock: 100, shelter: { wallet: PINK_WALLET } })), []);
  assert.deepEqual(problemsOf(withCampaign({})), [], 'no wallet and no fromBlock: nothing counts, which is honest');
  assert.match(problemsOf(withCampaign({ shelter: { wallet: PINK_WALLET } })).join('\n'), /C-001: campaign\.shelter\.wallet is set but fromBlock is null, so the payouts page would count every payout ever made to that wallet, including ones before startDate \(2026-10-02\)/);
  for (const bad of ['0x1234', `${PINK_WALLET}0`, PINK_WALLET.replace('0x', '0X'), 'pinkpaw', 42]) {
    assert.match(problemsOf(withCampaign({ fromBlock: 1, shelter: { wallet: bad } })).join('\n'), /wallet must be null or a 0x address with 40 hex digits/, String(bad));
  }
  for (const bad of [-1, 1.5, '100']) assert.match(problemsOf(withCampaign({ fromBlock: bad })).join('\n'), /fromBlock must be null or a block number/, String(bad));
});

test('goals: a wallet without fromBlock is reported as counting from too early, not as counting nothing', () => {
  const root = scratch();
  const g = goalStatus(withCampaign({ shelter: { wallet: PINK_WALLET } }), Date.parse('2026-10-05T00:00:00Z'), root)[0];
  assert.equal(g.problem, true);
  assert.match(g.detail, /counting every payout to the wallet, including ones before startDate \(2026-10-02\)/);
  assert.doesNotMatch(g.detail, /no payout counts/);
});

test('reconciliation: fromBlock must be the first block of startDate (online only)', async () => {
  const start = Date.parse('2026-10-02T00:00:00Z') / 1000;
  // Block n is at start + (n - 100): block 100 is the first block of the day.
  const chain = async (_url, init) => {
    const n = parseInt(JSON.parse(init.body).params[0], 16);
    return { ok: true, status: 200, json: async () => ({ result: { timestamp: `0x${(start + n - 100).toString(16)}` } }) };
  };
  const at = (fromBlock) => fromBlockReconciliation(withCampaign({ fromBlock, shelter: { wallet: PINK_WALLET } }), { fetchImpl: chain });
  assert.deepEqual((await at(100)).map((i) => i.problem), [false]);
  assert.match((await at(99))[0].detail, /before startDate 2026-10-02/);
  assert.match((await at(101))[0].detail, /after the first block of 2026-10-02/);
  assert.deepEqual(await fromBlockReconciliation(baseRegistry(), { fetchImpl: chain }), [], 'nothing to check without a fromBlock');
  const down = await fromBlockReconciliation(withCampaign({ fromBlock: 100 }), { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.match(down[0].detail, /fromBlock check failed on chain 5042: HTTP 503/);
  const unknown = await fromBlockReconciliation(withCampaign({ fromBlock: 100, chainId: 1 }), { fetchImpl: chain });
  assert.match(unknown[0].detail, /no RPC known for chain 1/);
  // Offline reports never call the chain.
  const r = await buildReport({ root: scratch(withCampaign({ fromBlock: 100, shelter: { wallet: PINK_WALLET } })), now: NOW, offline: true, refresh: async () => ({ results: [] }), impactUrl: '', fetchImpl: async () => { throw new Error('network used offline'); } });
  assert.match(r.markdown, /campaign fromBlock: skipped \(offline\)/);
});
