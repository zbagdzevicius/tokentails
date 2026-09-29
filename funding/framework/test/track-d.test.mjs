import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apps = mkdtempSync(join(tmpdir(), 'fund-track-d-'));
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(apps, 'TRACKER.md');
const { CORE } = await import('../lib/core.mjs');
const D = await import('../tracks/d-dao/track.mjs');
const track = D.default;

const BUDGET = '| Item | Amount | Currency |\n|---|---|---|\n| Art | 3 | ETH |\n| Review | 5,000 | USD |\n| Total | 999 | ETH |\n';

function makeApp(slug, { fm = {}, budget = BUDGET, sponsors = D.SPONSORS_HEADER, draft } = {}) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: 'Nouns DAO proposal', track: 'D', status: 'researching', deadline: 'rolling', dao: 'Nouns', kill_after_days: 21, eth_usd: 2500, posted: '', ...fm }) + '| C1 | Fit | x | "q" |\n');
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n# Cats — application draft\n' + (draft ?? '## TL;DR <!-- criterion: C1 -->\nCats in noggles. We have 1,218,693 invocations [F-007].\n\n## Budget <!-- criterion: C1 -->\nPaid per milestone.\n'));
  if (budget != null) writeFileSync(join(dir, 'budget.md'), budget);
  if (sponsors != null) writeFileSync(join(dir, 'sponsors.md'), sponsors);
  return dir;
}

async function trackResults(slug) {
  const { results } = await CORE.runChecks(slug);
  return Object.fromEntries(results.filter((r) => r.name.startsWith('D:')).map((r) => [r.name.slice(2), r]));
}

const quiet = async (fn) => {
  const [log, err] = [console.log, console.error];
  const out = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try { return { code: await fn(), out: out.join('\n') }; } finally { console.log = log; console.error = err; }
};
const run = (cmd, args, flags = {}) => quiet(() => track.commands[cmd].run({ args, flags, core: CORE }));

// ---------- budget ----------

test('budget parses ETH and USD rows, ignores header, separator and hand-written totals', () => {
  const { rows, problems } = D.parseBudget(BUDGET);
  assert.deepEqual(problems, []);
  assert.deepEqual(rows, [{ item: 'Art', amount: 3, currency: 'ETH' }, { item: 'Review', amount: 5000, currency: 'USD' }]);
});

test('budget reports bad amounts and currencies', () => {
  const { rows, problems } = D.parseBudget('| Item | Amount | Currency |\n|---|---|---|\n| A | lots | ETH |\n| B | 2 | BTC |\n| C | 1 | usdc |\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].currency, 'USD');
  assert.equal(problems.length, 2);
});

test('budget totals convert both ways with eth_usd', () => {
  const { rows } = D.parseBudget(BUDGET);
  const t = D.budgetTotals(rows, 2500);
  assert.equal(t.eth, 3);
  assert.equal(t.usd, 5000);
  assert.equal(t.totalEth, 5);
  assert.equal(t.totalUsd, 12500);
  const noRate = D.budgetTotals(rows, '');
  assert.equal(noRate.totalEth, null);
  assert.equal(D.budgetTotals([{ item: 'x', amount: 2, currency: 'ETH' }], '').totalEth, 2);
  const table = D.budgetTable(rows, t);
  assert.match(table, /\*\*5 ETH\*\*/);
  assert.match(table, /\*\*\$12,500\*\*/);
});

test('budget bounds: within, below, above, USD unit, missing rate', () => {
  const t = D.budgetTotals(D.parseBudget(BUDGET).rows, 2500);
  assert.equal(D.budgetBounds(t, { min: 1, max: 25 }).level, 'ok');
  assert.equal(D.budgetBounds(t, { min: 10, max: 25 }).level, 'error');
  assert.equal(D.budgetBounds(t, { min: 1, max: 4 }).level, 'error');
  assert.equal(D.budgetBounds(t, { max: 10000, unit: 'USD' }).level, 'error');
  assert.equal(D.budgetBounds(D.budgetTotals(D.parseBudget(BUDGET).rows, ''), {}).level, 'error');
});

test('budget check runs inside fund check', async () => {
  makeApp('b-ok', { fm: { min_budget: 1, max_budget: 25 } });
  assert.equal((await trackResults('b-ok')).budget.level, 'ok');
  makeApp('b-high', { fm: { max_budget: 2 } });
  assert.equal((await trackResults('b-high')).budget.level, 'error');
  makeApp('b-empty', { budget: '| Item | Amount | Currency |\n|---|---|---|\n' });
  assert.equal((await trackResults('b-empty')).budget.level, 'warn');
  makeApp('b-empty-review', { fm: { status: 'in-review' }, budget: '| Item | Amount | Currency |\n|---|---|---|\n' });
  assert.equal((await trackResults('b-empty-review')).budget.level, 'error');
});

// ---------- clock ----------

const yes = [{ date: '2026-09-10', who: 'Noun owner', channel: 'forum', ask: 'sponsor', response: 'Yes, will sponsor' }];
const no = [{ date: '2026-09-10', who: 'delegate', channel: 'forum', ask: 'sponsor', response: 'no sponsor for now' }];

test('clock verdicts across dates', () => {
  const posted = '2026-09-01';
  assert.equal(D.clock({ posted: '', now: '2026-09-01T00:00:00Z' }).verdict, 'NOT POSTED');
  const d0 = D.clock({ posted, now: '2026-09-01T12:00:00Z' });
  assert.equal(d0.daysSince, 0);
  assert.equal(d0.daysLeft, 21);
  assert.equal(d0.verdict, 'FIND SPONSOR');
  assert.equal(d0.killDate, '2026-09-22');
  const d21 = D.clock({ posted, now: '2026-09-22T23:00:00Z' });
  assert.equal(d21.daysLeft, 0);
  assert.equal(d21.verdict, 'FIND SPONSOR');
  const d22 = D.clock({ posted, now: '2026-09-23T00:00:00Z' });
  assert.equal(d22.verdict, 'KILL');
  assert.equal(D.clock({ posted, now: '2026-09-23T00:00:00Z', sponsors: no }).verdict, 'KILL');
  assert.equal(D.clock({ posted, now: '2026-10-30T00:00:00Z', sponsors: yes }).verdict, 'CONTINUE');
  assert.equal(D.clock({ posted, now: new Date('2026-09-05T00:00:00Z'), killAfterDays: 3 }).verdict, 'KILL');
  assert.throws(() => D.clock({ posted: 'soon', now: 0 }));
});

test('sponsor responses: yes/sponsor count, negations do not', () => {
  for (const r of ['yes', 'Yes, happy to sponsor', 'Sponsored the candidate', 'will sponsor', 'sponsor', "I'll sponsor", 'can sponsor it']) assert.ok(D.isSponsorResponse(r), r);
  for (const r of ['no sponsor', 'not a yes yet', 'declined to sponsor', "won't sponsor", 'pending', 'maybe', '', 'try another sponsor', 'ask someone else to sponsor']) assert.ok(!D.isSponsorResponse(r), r);
});

test('kill-window check fails after the window without a sponsor, not when parked', async () => {
  process.env.FUND_NOW = '2026-10-01T00:00:00Z';
  try {
    makeApp('k-late', { fm: { posted: '2026-09-01' } });
    const r = (await trackResults('k-late'))['kill-window'];
    assert.equal(r.level, 'error');
    assert.match(r.detail, /status k-late parked/);
    makeApp('k-parked', { fm: { posted: '2026-09-01', status: 'parked' } });
    assert.equal((await trackResults('k-parked'))['kill-window'].level, 'ok');
    makeApp('k-sponsored', { fm: { posted: '2026-09-01' }, sponsors: D.SPONSORS_HEADER + '| 2026-09-10 | Noun owner | forum | sponsor? | yes |\n' });
    assert.equal((await trackResults('k-sponsored'))['kill-window'].level, 'ok');
    makeApp('k-fresh', { fm: { posted: '2026-09-25' } });
    assert.equal((await trackResults('k-fresh'))['kill-window'].level, 'ok');
  } finally { delete process.env.FUND_NOW; }
});

test('d:clock command prints verdict and next command; KILL exits 1', async () => {
  makeApp('c-cmd', { fm: { posted: '2026-09-01' } });
  const live = await run('d:clock', ['c-cmd'], { now: '2026-09-10T00:00:00Z' });
  assert.equal(live.code, 0);
  assert.match(live.out, /FIND SPONSOR/);
  assert.match(live.out, /next: node bin\/fund\.mjs d:log c-cmd/);
  const dead = await run('d:clock', ['c-cmd'], { now: '2026-10-10T00:00:00Z' });
  assert.equal(dead.code, 1);
  assert.match(dead.out, /KILL/);
});

// ---------- log ----------

test('d:log appends a dated row and escapes pipes', async () => {
  const dir = makeApp('l-app');
  const res = await run('d:log', ['l-app'], { who: 'Noun owner', channel: 'Discord', ask: 'sponsor | candidate', response: 'yes', now: '2026-09-25T10:00:00Z' });
  assert.equal(res.code, 0);
  assert.match(res.out, /counts as sponsor/);
  const rows = D.parseSponsors(readFileSync(join(dir, 'sponsors.md'), 'utf8'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-09-25');
  assert.equal(rows[0].who, 'Noun owner');
  assert.equal(rows[0].response, 'yes');
  assert.equal(rows[0].ask, 'sponsor | candidate');
  await run('d:log', ['l-app'], { who: 'delegate', channel: 'forum', ask: 'feedback', date: '2026-09-26' });
  const again = D.parseSponsors(readFileSync(join(dir, 'sponsors.md'), 'utf8'));
  assert.equal(again.length, 2);
  assert.equal(again[1].response, 'pending');
});

test('d:log creates sponsors.md when missing and rejects missing flags', async () => {
  const dir = makeApp('l-new', { sponsors: null });
  assert.equal(existsSync(join(dir, 'sponsors.md')), false);
  assert.equal((await run('d:log', ['l-new'], { who: 'delegate', channel: 'forum', ask: 'x' })).code, 0);
  assert.equal(D.parseSponsors(readFileSync(join(dir, 'sponsors.md'), 'utf8')).length, 1);
  assert.equal((await run('d:log', ['l-new'], { who: 'delegate' })).code, 2);
});

test('d:log refuses personal contact data and writes nothing', async () => {
  const dir = makeApp('l-pii');
  const before = readFileSync(join(dir, 'sponsors.md'), 'utf8');
  const res = await run('d:log', ['l-pii'], { who: 'someone at person@example.com', channel: 'mail', ask: 'x' });
  assert.equal(res.code, 1);
  assert.doesNotMatch(res.out, /person@example\.com/);
  assert.equal(readFileSync(join(dir, 'sponsors.md'), 'utf8'), before);
});

// ---------- PII ----------

test('PII detection finds emails and phones, ignores dates, amounts and addresses', () => {
  assert.deepEqual(D.findPII('ping a.b+c@mail.example.org').map((h) => h.kind), ['email']);
  assert.deepEqual(D.findPII('call +370 600 00000').map((h) => h.kind), ['phone']);
  assert.deepEqual(D.findPII('(555) 123-4567').map((h) => h.kind), ['phone']);
  assert.deepEqual(D.findPII('| 2026-09-25 | Noun owner | forum | 11.5 ETH | yes |'), []);
  assert.deepEqual(D.findPII('1,218,693 invocations at 2026-09-23T10:00:00Z'), []);
  assert.deepEqual(D.findPII('treasury 0x0BC3807Ec262cB779b38D65b38158acC3bfedE10'), []);
  assert.deepEqual(D.findPII('nouns.eth and @handle'), []);
  assert.doesNotMatch(D.maskPII({ kind: 'email', value: 'person@example.com' }), /person@example/);
});

test('sponsors-pii check fails on contact data', async () => {
  makeApp('p-bad', { sponsors: D.SPONSORS_HEADER + '| 2026-09-10 | delegate, 00370 612 34567 | forum | x | no |\n' });
  assert.equal((await trackResults('p-bad'))['sponsors-pii'].level, 'error');
  makeApp('p-ok', { sponsors: D.SPONSORS_HEADER + '| 2026-09-10 | delegate | forum | x | no |\n' });
  assert.equal((await trackResults('p-ok'))['sponsors-pii'].level, 'ok');
});

// ---------- export and proposal check ----------

test('d:export writes a paste-ready proposal with totals and sponsor ask', async () => {
  const dir = makeApp('e-app', { fm: { forum_url: 'https://forum.example/t/1', posted: '2026-09-01' } });
  const res = await run('d:export', ['e-app'], { now: '2026-09-05T00:00:00Z' });
  assert.equal(res.code, 0);
  assert.match(res.out, /next: node bin\/fund\.mjs d:clock e-app/);
  const p = readFileSync(join(dir, 'proposal.md'), 'utf8');
  assert.match(p, /^# Cats\n/);
  assert.match(p, /## TL;DR/);
  assert.doesNotMatch(p, /<!--/);
  assert.doesNotMatch(p, /\[F-\d{3}\]/);
  assert.match(p, /## Budget\n\nPaid per milestone\.\n\n\| Item \| Amount/);
  assert.match(p, /\*\*5 ETH\*\*/);
  assert.match(p, /\$12,500/);
  assert.match(p, /Looking for a sponsor/);
  assert.match(p, /on 2026-09-22/);
  assert.match(p, /forum\.example/);
  const cited = await run('d:export', ['e-app'], { cites: true });
  assert.equal(cited.code, 0);
  assert.match(readFileSync(join(dir, 'proposal.md'), 'utf8'), /\[F-007\]/);
});

test('export adds a Budget section when the draft has none', () => {
  makeApp('e-nobudget', { draft: '## TL;DR <!-- criterion: C1 -->\nHi.\n' });
  const { text } = D.buildProposal(CORE.loadApp('e-nobudget'));
  assert.match(text, /## Budget\n\n\| Item/);
});

test('proposal check: ready without proposal.md fails; stale export warns', async () => {
  makeApp('r-missing', { fm: { status: 'ready' } });
  assert.equal((await trackResults('r-missing')).proposal.level, 'error');
  const dir = makeApp('r-stale');
  await run('d:export', ['r-stale'], {});
  assert.equal((await trackResults('r-stale')).proposal.level, 'ok');
  const old = new Date(Date.now() - 60000);
  utimesSync(join(dir, 'proposal.md'), old, old);
  assert.equal((await trackResults('r-stale')).proposal.level, 'ok', 'an older mtime alone is not staleness');
  writeFileSync(join(dir, 'budget.md'), BUDGET + '| Extra | 1 | ETH |\n');
  assert.equal((await trackResults('r-stale')).proposal.level, 'warn');
});

test('d:post sets posted and forum_url; dry run changes nothing', async () => {
  const dir = makeApp('post-app');
  const dry = await run('d:post', ['post-app'], { url: 'https://forum.example/t/2', 'dry-run': true, now: '2026-09-25T00:00:00Z' });
  assert.equal(dry.code, 0);
  assert.equal(CORE.loadApp('post-app').call.fm.posted, '');
  await run('d:post', ['post-app'], { url: 'https://forum.example/t/2', date: '2026-09-20' });
  const fm = CORE.loadApp('post-app').call.fm;
  assert.equal(fm.posted, '2026-09-20');
  assert.equal(fm.forum_url, 'https://forum.example/t/2');
  assert.ok(existsSync(join(dir, 'call.md')));
});

test('fund new --track D scaffolds a folder that passes check', async () => {
  await CORE.scaffold('scaffolded', { track: 'D', program: 'Some DAO proposal' });
  const dir = join(apps, 'scaffolded');
  for (const f of ['call.md', 'draft.md', 'budget.md', 'sponsors.md']) assert.ok(existsSync(join(dir, f)), f);
  const fm = CORE.loadApp('scaffolded').call.fm;
  assert.equal(fm.kill_after_days, 21);
  assert.equal(fm.track, 'D');
  const { ok, results } = await CORE.runChecks('scaffolded');
  assert.ok(ok, JSON.stringify(results.filter((r) => r.level === 'error')));
});

// ---------- regressions found by the adversarial pass ----------

test('regression: status/next edits to call.md (the CONTINUE step) do not make proposal.md stale', async () => {
  const dir = makeApp('rg-status', { fm: { posted: '2026-09-01' }, sponsors: D.SPONSORS_HEADER + '| 2026-09-10 | Noun owner | forum | sponsor? | yes |\n' });
  await run('d:export', ['rg-status'], {});
  const old = new Date(Date.now() - 60000);
  utimesSync(join(dir, 'proposal.md'), old, old);
  CORE.updateFrontmatter(join(dir, 'call.md'), { status: 'ready', next: 'Sponsor found; get it onchain' });
  assert.equal((await trackResults('rg-status')).proposal.level, 'ok');
  writeFileSync(join(dir, 'draft.md'), readFileSync(join(dir, 'draft.md'), 'utf8') + 'One more line.\n');
  assert.equal((await trackResults('rg-status')).proposal.level, 'error', 'a real draft change at ready fails');
});

test('regression: d:post rejects loose, impossible and future dates', async () => {
  makeApp('rg-post');
  for (const date of ['Sept 5', '2026-09-31', '2026-02-30', '26-09-01', '']) {
    const r = await run('d:post', ['rg-post'], { date, now: '2026-09-25T00:00:00Z' });
    assert.equal(r.code, 2, date);
  }
  assert.equal((await run('d:post', ['rg-post'], { date: '2026-10-01', now: '2026-09-25T00:00:00Z' })).code, 2);
  assert.equal((await run('d:post', ['rg-post'], { date: true })).code, 2);
  assert.equal((await run('d:post', ['rg-post'], { url: 'not a url' })).code, 2);
  assert.equal(CORE.loadApp('rg-post').call.fm.posted, '');
});

test('regression: re-running d:post to add the URL keeps the original posted date', async () => {
  makeApp('rg-repost');
  await run('d:post', ['rg-repost'], { date: '2026-09-01', now: '2026-09-25T00:00:00Z' });
  const r = await run('d:post', ['rg-repost'], { url: 'https://forum.example/t/9', now: '2026-09-25T00:00:00Z' });
  assert.equal(r.code, 0);
  assert.match(r.out, /date kept/);
  const fm = CORE.loadApp('rg-repost').call.fm;
  assert.equal(fm.posted, '2026-09-01');
  assert.equal(fm.forum_url, 'https://forum.example/t/9');
  const moved = await run('d:post', ['rg-repost'], { date: '2026-09-03', now: '2026-09-25T00:00:00Z' });
  assert.match(moved.out, /moved from 2026-09-01/);
});

test('regression: bad --now or FUND_NOW is an error, not a NaN verdict', async () => {
  makeApp('rg-now', { fm: { posted: '2026-09-01' } });
  const r = await run('d:clock', ['rg-now'], { now: 'garbage' });
  assert.equal(r.code, 2);
  assert.match(r.out, /bad --now/);
  assert.throws(() => D.resolveNow('nope'));
  process.env.FUND_NOW = 'nope';
  try { assert.equal((await trackResults('rg-now'))['kill-window'].level, 'error'); } finally { delete process.env.FUND_NOW; }
});

test('regression: a malformed posted date fails check with a fix command', async () => {
  makeApp('rg-badposted', { fm: { posted: 'Sept 5' } });
  const r = (await trackResults('rg-badposted'))['kill-window'];
  assert.equal(r.level, 'error');
  assert.match(r.detail, /d:post/);
  makeApp('rg-future', { fm: { posted: '2099-01-01' } });
  assert.equal((await trackResults('rg-future'))['kill-window'].level, 'warn');
});

test('regression: d:log rejects an invalid --date and writes nothing', async () => {
  const dir = makeApp('rg-logdate');
  const before = readFileSync(join(dir, 'sponsors.md'), 'utf8');
  for (const date of ['tomorrow', '2026-13-01', true]) assert.equal((await run('d:log', ['rg-logdate'], { who: 'delegate', channel: 'x', ask: 'y', date })).code, 2);
  assert.equal(readFileSync(join(dir, 'sponsors.md'), 'utf8'), before);
});

test('regression: hedged or negative responses never count as a sponsor', () => {
  for (const r of ['sponsorship declined', 'pending sponsor reply', 'asked about sponsoring, no reply', 'sponsor? no',
    'yes if you halve the budget', 'considering sponsoring', 'maybe sponsor later', 'no, but yes later', 'Nope']) {
    assert.ok(!D.isSponsorResponse(r), r);
  }
  for (const r of ['Yes', 'Sponsor', 'yes — sponsored on 2026-09-30', 'Sponsoring it', 'agreed to sponsor'])assert.ok(D.isSponsorResponse(r), r);
  assert.equal(D.clock({ posted: '2026-09-01', now: '2026-10-30T00:00:00Z', sponsors: [{ response: 'sponsorship declined' }] }).verdict, 'KILL');
});

test('regression: CRLF files parse and d:export writes LF only; d:log keeps CRLF', async () => {
  const crlf = (t) => t.replace(/\n/g, '\r\n');
  const dir = makeApp('rg-crlf', { budget: crlf(BUDGET), sponsors: crlf(D.SPONSORS_HEADER) });
  for (const f of ['call.md', 'draft.md']) writeFileSync(join(dir, f), crlf(readFileSync(join(dir, f), 'utf8')));
  const { ok, results } = await CORE.runChecks('rg-crlf');
  assert.ok(ok, JSON.stringify(results.filter((r) => r.level === 'error')));
  await run('d:export', ['rg-crlf'], {});
  const p = readFileSync(join(dir, 'proposal.md'), 'utf8');
  assert.doesNotMatch(p, /\r/);
  assert.match(p, /\*\*5 ETH\*\*/);
  assert.equal((await trackResults('rg-crlf')).proposal.level, 'ok');
  await run('d:log', ['rg-crlf'], { who: 'delegate', channel: 'x', ask: 'y', date: '2026-09-25' });
  const s = readFileSync(join(dir, 'sponsors.md'), 'utf8');
  assert.doesNotMatch(s.replace(/\r\n/g, ''), /\n/, 'no bare LF mixed into a CRLF file');
  assert.equal(D.parseSponsors(s).length, 1);
});

test('regression: budget header variants, "Totally ..." items and "2,500" rates', () => {
  const { rows, problems } = D.parseBudget('| Line item | Amount (ETH or USD) | Currency |\n|---|---|---|\n| Totally new art | 3 | ETH |\n| Review | 5000 | USD |\n| **Total** | 5 | ETH |\n| Grand total: | 5 | ETH |\n');
  assert.deepEqual(problems, []);
  assert.deepEqual(rows.map((r) => r.item), ['Totally new art', 'Review']);
  assert.equal(D.budgetTotals(rows, '2,500').totalUsd, 12500);
  assert.equal(D.budgetTotals(rows, '$2500').rate, 2500);
});

test('regression: sponsor ask fits non-Nouns DAOs, USD-only budgets and sponsored candidates', () => {
  const clk = D.clock({ posted: '', now: 0 });
  const arb = D.sponsorAsk({ dao: 'Arbitrum', totals: D.budgetTotals([{ item: 'x', amount: 40000, currency: 'USD' }], ''), clk });
  assert.doesNotMatch(arb, /proliferate|\?/);
  assert.match(arb, /\$40,000/);
  assert.match(D.sponsorAsk({ dao: 'Nouns', totals: null, clk }), /proliferates Nouns/);
  const done = D.clock({ posted: '2026-09-01', now: '2026-09-05T00:00:00Z', sponsors: [{ response: 'yes' }] });
  assert.match(D.sponsorAsk({ dao: 'Nouns', totals: null, clk: done }), /^\*\*Sponsored\.\*\*/);
});

test('regression: d:clock --json prints exactly one JSON document', async () => {
  makeApp('rg-json', { fm: { posted: '2026-09-01' } });
  const r = await run('d:clock', ['rg-json'], { json: true, now: '2026-09-10T00:00:00Z' });
  const doc = JSON.parse(r.out);
  assert.equal(doc.verdict, 'FIND SPONSOR');
  assert.match(doc.next, /^node bin\/fund\.mjs d:log rg-json/);
});

test('regression: unicode fields survive d:log and the table parser', async () => {
  const dir = makeApp('rg-uni');
  await run('d:log', ['rg-uni'], { who: 'Nouncil narys — Žemaitija', channel: 'Discord 🐱', ask: 'Ar remsite?', response: 'yes', date: '2026-09-25' });
  const rows = D.parseSponsors(readFileSync(join(dir, 'sponsors.md'), 'utf8'));
  assert.equal(rows[0].who, 'Nouncil narys — Žemaitija');
  assert.equal(rows[0].channel, 'Discord 🐱');
});

test('regression: budget_unit USD leads the ask and footnote with USD; "an Arbitrum"', async () => {
  const dir = makeApp('rg-usd', { fm: { dao: 'Arbitrum', budget_unit: 'USD', min_budget: 5000, max_budget: 50000 } });
  const res = await run('d:export', ['rg-usd'], {});
  assert.match(res.out, /ask \$12,500 \(about 5 ETH/);
  const p = readFileSync(join(dir, 'proposal.md'), 'utf8');
  assert.match(p, /The ask is \$12,500 \(about 5 ETH at 1 ETH = \$2,500\)/);
  assert.match(p, /the ask is in USD/);
  assert.doesNotMatch(p, /onchain ask is in ETH/);
  assert.match(p, /an Arbitrum voter/);
  assert.equal(D.askText(D.budgetTotals(D.parseBudget(BUDGET).rows, 2500)), '5 ETH (about $12,500 at 1 ETH = $2,500)');
});

test('regression: template criteria quotes warn, and fail from in-review', async () => {
  const tpl = '| C1 | Fit | not stated | replace with the DAO\'s own wording |\n';
  const dir = makeApp('rg-crit');
  writeFileSync(join(dir, 'call.md'), readFileSync(join(dir, 'call.md'), 'utf8').replace(/\| C1 .*\n/, tpl));
  assert.equal((await trackResults('rg-crit'))['criteria-quotes'].level, 'warn');
  CORE.updateFrontmatter(join(dir, 'call.md'), { status: 'in-review' });
  const r = (await trackResults('rg-crit'))['criteria-quotes'];
  assert.equal(r.level, 'error');
  assert.match(r.detail, /prompt extract rg-crit --run --out/);
  assert.equal((await trackResults('b-ok'))['criteria-quotes'].level, 'ok');
});

test('regression: d:export refuses a draft with no sections instead of writing an empty proposal', async () => {
  const dir = makeApp('rg-nodraft', { draft: '' });
  const r = await run('d:export', ['rg-nodraft'], {});
  assert.equal(r.code, 1);
  assert.match(r.out, /prompt draft rg-nodraft/);
  assert.equal(existsSync(join(dir, 'proposal.md')), false);
});

test('regression: d: commands refuse non-D apps and broken frontmatter, and leave call.md untouched', async () => {
  const dir = makeApp('rg-notd', { fm: { track: 'C' } });
  const broken = makeApp('rg-broken');
  writeFileSync(join(broken, 'call.md'), readFileSync(join(broken, 'call.md'), 'utf8').replace(/^---\n/, ''));
  for (const slug of ['rg-notd', 'rg-broken']) {
    const before = readFileSync(join(apps, slug, 'call.md'), 'utf8');
    for (const [cmd, flags] of [['d:post', { url: 'https://forum.example/t/1' }], ['d:clock', {}], ['d:export', {}], ['d:log', { who: 'a', channel: 'b', ask: 'c' }]]) {
      const r = await run(cmd, [slug], flags);
      assert.equal(r.code, 2, `${cmd} ${slug}`);
      assert.match(r.out, /not a Track D application/);
    }
    assert.equal(readFileSync(join(apps, slug, 'call.md'), 'utf8'), before);
  }
  assert.equal(existsSync(join(dir, 'proposal.md')), false);
  assert.match((await run('d:clock', ['no-such-app'], {})).out, /new no-such-app --track D/);
});

test('regression: posting "today" in a timezone ahead of UTC is accepted and reads as day 0', async () => {
  makeApp('rg-tz');
  // 22:30 UTC on Sep 25 is already Sep 26 in Vilnius (UTC+3).
  const r = await run('d:post', ['rg-tz'], { date: '2026-09-26', now: '2026-09-25T22:30:00Z' });
  assert.equal(r.code, 0, r.out);
  const c = D.clock({ posted: '2026-09-26', now: '2026-09-25T22:30:00Z' });
  assert.equal(c.daysSince, 0);
  assert.equal(c.verdict, 'FIND SPONSOR');
  assert.equal((await run('d:post', ['rg-tz'], { date: '2026-09-28', now: '2026-09-25T22:30:00Z' })).code, 2);
});

// ---------- validator regressions ----------

test('regression: decimal-comma amounts are refused, not read as 10x', () => {
  const { rows, problems } = D.parseBudget('| Item | Amount | Currency |\n|---|---|---|\n| Ops | 2,5 | ETH |\n| Dev | 1.000,50 | USD |\n| Big | 12,000.50 | USD |\n| Art | $5,000 | USD |\n');
  assert.deepEqual(rows.map((r) => r.amount), [12000.5, 5000]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Ops: amount "2,5".*dot for decimals/);
  assert.ok(Number.isNaN(D.parseAmount('2,5')));
  assert.equal(D.parseAmount('Ξ3'), 3);
});

test('regression: "Total (ETH)" and "Subtotal" rows are refused instead of double-counted', () => {
  const { rows, problems } = D.parseBudget('| Item | Amount | Currency |\n|---|---|---|\n| Art | 3 | ETH |\n| Total (ETH) | 3 | ETH |\n| Subtotal art | 3 | ETH |\n| **Total** | 3 | ETH |\n');
  assert.deepEqual(rows.map((r) => r.item), ['Art']);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /hand-written total/);
});

test('regression: d:export refuses when a budget row does not parse (it used to drop it silently)', async () => {
  const dir = makeApp('rg-export-bad', { budget: BUDGET + '| Bad row | 3 ETH | |\n' });
  const r = await run('d:export', ['rg-export-bad'], { now: '2026-09-05T00:00:00Z' });
  assert.equal(r.code, 1);
  assert.match(r.out, /not exported: budget\.md — Bad row/);
  assert.equal(existsSync(join(dir, 'proposal.md')), false);
});

test('regression: d:export refuses an ask above max_budget', async () => {
  const dir = makeApp('rg-export-max', { fm: { max_budget: 4 } });
  const r = await run('d:export', ['rg-export-max'], {});
  assert.equal(r.code, 1);
  assert.match(r.out, /above max_budget/);
  assert.equal(existsSync(join(dir, 'proposal.md')), false);
});

test('regression: d:export writes but exits 1 and says so when fund check still fails', async () => {
  makeApp('rg-export-limit', { draft: '## TL;DR <!-- criterion: C1 | limit: 10 -->\nThis sentence is far longer than ten characters.\n' });
  const r = await run('d:export', ['rg-export-limit'], {});
  assert.equal(r.code, 1);
  assert.match(r.out, /fund check still fails \(limits\).*do not paste/);
  assert.match(r.out, /next: node bin\/fund\.mjs check rg-export-limit/);
});

test('regression: a typo in kill_after_days is an error, not a silent 21', async () => {
  assert.deepEqual(D.killDays(''), { days: 21, problem: null });
  assert.equal(D.killDays(30).days, 30);
  assert.match(D.killDays('2l').problem, /not a positive whole number/);
  assert.match(D.killDays(0).problem, /not a positive/);
  makeApp('rg-kill', { fm: { kill_after_days: '2l' } });
  const k = (await trackResults('rg-kill'))['kill-window'];
  assert.equal(k.level, 'error');
  assert.match(k.detail, /kill_after_days "2l"/);
  const r = await run('d:post', ['rg-kill'], { 'dry-run': true, now: '2026-09-25T00:00:00Z' });
  assert.equal(r.code, 2);
  assert.doesNotMatch(r.out, /day 2l/);
});

test('regression: a non-numeric eth_usd fails the budget check instead of hiding the USD column', async () => {
  assert.equal(D.ethUsdProblem('2,500'), null);
  assert.equal(D.ethUsdProblem(''), null);
  assert.match(D.ethUsdProblem('abc'), /eth_usd "abc"/);
  makeApp('rg-rate', { fm: { eth_usd: 'abc' }, budget: '| Item | Amount | Currency |\n|---|---|---|\n| Art | 3 | ETH |\n' });
  const b = (await trackResults('rg-rate')).budget;
  assert.equal(b.level, 'error');
  assert.match(b.detail, /eth_usd "abc"/);
});

test('regression: day-first dates (25.09.2026, 25/09/2026) are not phone numbers', () => {
  assert.deepEqual(D.findPII('call on 25.09.2026 and 25/09/2026'), []);
  assert.equal(D.findPII('ring +370 600 00000')[0].kind, 'phone');
});

test('regression: d:post points at d:export, because posting changes the closing line', async () => {
  makeApp('rg-post-next');
  const r = await run('d:post', ['rg-post-next'], { url: 'https://forum.example/t/5', now: '2026-09-25T00:00:00Z' });
  assert.equal(r.code, 0);
  assert.match(r.out, /next: node bin\/fund\.mjs d:export rg-post-next/);
  const stale = (await trackResults('rg-post-next')).proposal;
  assert.equal(stale.level, 'ok'); // never exported yet
});
