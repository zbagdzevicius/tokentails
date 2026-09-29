import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apps = mkdtempSync(join(tmpdir(), 'fund-track-c-'));
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(apps, 'TRACKER.md');
const { CORE } = await import('../lib/core.mjs');
const C = await import('../tracks/c-proposals/track.mjs');
const track = C.default;

const CRITERIA = [
  '| C1 | Relevance and European dimension | 20 | "q" |',
  '| C2 | Quality of content and activities | 25 | "q" |',
  '| C3 | Innovation | 15 | "q" |',
  '| C4 | Originality and story | 10 | "q" |',
  '| C5 | Impact | 30% | "q" |',
].join('\n') + '\n';
const crit = CORE.parseCriteria(CRITERIA);

function makeApp(slug, { call = {}, files = {} } = {}) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'C', status: 'drafting', deadline: 'rolling', ...call }) + CRITERIA);
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n## All <!-- criterion: C1, C2, C3, C4, C5 -->\nA Vilnius team.\n');
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}

async function checks(slug) {
  const app = CORE.loadApp(slug);
  const out = [];
  for (const chk of track.checks) out.push(...[].concat(await chk({ app, core: CORE })));
  return out;
}
const level = (rs, name) => rs.find((r) => r.name === name)?.level;

// Run a command with console output captured.
async function run(cmd, args, flags = {}, extra = {}) {
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const code = await track.commands[cmd].run({ args, flags, core: CORE, runAI: () => '', ...extra });
    return { code, out: logs.join('\n') };
  } finally { Object.assign(console, orig); }
}

const iso = (ms) => new Date(ms).toISOString();

// ---------- scores ----------

test('parseScore reads fractions, percentages, "out of" and bare numbers', () => {
  assert.deepEqual(C.parseScore('7/10'), { frac: 0.7, scale: 10 });
  assert.equal(C.parseScore('3.5/5').frac, 0.7);
  assert.equal(C.parseScore('**70%**').frac, 0.7);
  assert.equal(C.parseScore('14 out of 20').frac, 0.7);
  assert.deepEqual(C.parseScore('7 (weak)'), { bare: 7 });
  assert.equal(C.parseScore('n/a'), null);
});

test('parseWeight and weightsFor normalise points and percentages, filling missing weights', () => {
  assert.equal(C.parseWeight('25 points'), 25);
  assert.equal(C.parseWeight('~15 (uncertain)'), 15);
  assert.equal(C.parseWeight('not stated'), null);
  const w = C.weightsFor([{ id: 'C1', weight: '60%' }, { id: 'C2', weight: '20' }, { id: 'C3', weight: '' }]);
  assert.equal(w[2].assumed, true);
  assert.ok(Math.abs(w.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  assert.ok(Math.abs(w[0].share - 60 / 120) < 1e-9); // missing weight = mean(60, 20) = 40
});

test('scores in mixed formats are weighted by the call criteria', () => {
  const body = [
    '| Criterion | Score | Reason |', '|---|---|---|',
    '| C1 | 14/20 | a |', '| **C2** | 17/25 | b |', '| Innovation | 60% | c |',
    '| C4 Originality | 3.5/5 | d |', '| Impact | 6 | e |', '| Total | 62/100 | ignored |',
  ].join('\n');
  const rows = C.parseRoundScores(body, crit);
  assert.equal(rows.length, 5);
  assert.equal(rows.find((r) => r.id === 'C3').frac, 0.6);
  // a bare "6" is read on the table's most common explicit denominator (here /10)
  const rows10 = C.parseRoundScores(body.replace('| C1 | 14/20', '| C1 | 7/10').replace('17/25', '7/10'), crit);
  assert.equal(rows10.find((r) => r.id === 'C5').frac, 0.6);
  const { total, items } = C.weightedTotal(rows10, crit);
  // weights 20,25,15,10,30 -> 0.7*20 + 0.7*25 + 0.6*15 + 0.7*10 + 0.6*30 = 65.5
  assert.ok(Math.abs(total - 65.5) < 1e-9, `total ${total}`);
  assert.equal([...items].sort((a, b) => b.gain - a.gain)[0].id, 'C5');
});

test('bare scores use score_scale when the table has no denominators; unscored count as 0', () => {
  const rows = C.parseRoundScores('| C1 | 8 | x |\n| C2 | 4 | y |\n', crit, { scale: 10 });
  assert.equal(rows[0].frac, 0.8);
  assert.equal(rows[1].frac, 0.4);
  const { unscored, total } = C.weightedTotal(rows, crit);
  assert.deepEqual(unscored, ['C3', 'C4', 'C5']);
  assert.ok(Math.abs(total - (0.8 * 20 + 0.4 * 25)) < 1e-9);
});

test('review history splits rounds and shows a trend; threshold accepts 70 or 0.7', () => {
  const text = '# Reviews\n\n| C1 | 1/10 | not a round |\n\n## Review — r1\n| C1 | 5/10 | a |\n\n## Review - r2\n| C1 | 9/10 | b |\n\n## Review – r3 (no table)\nprose only\n';
  const h = C.scoreHistory(text, crit);
  assert.deepEqual(h.map((r) => r.title), ['r1', 'r2']);
  assert.ok(h[1].total > h[0].total);
  assert.equal(C.thresholdOf({ threshold: 70 }), 70);
  assert.equal(C.thresholdOf({ threshold: 0.7 }), 70);
  assert.equal(C.thresholdOf({}), null);
});

// ---------- budget ----------

const BUDGET = 'category,item,cost_eur,eligible\nStaff,Dev,"200,000",yes\nOther,Art,100000,yes\nOther,Ads,5000,no\n';

test('budget sums eligible costs, applies the funding rate and computes co-financing', () => {
  const b = C.analyzeBudget(BUDGET, { funding_rate: 0.6, max_grant: 200000 });
  assert.deepEqual(b.errors, []);
  assert.equal(b.eligibleTotal, 300000);
  assert.equal(b.ineligibleTotal, 5000);
  assert.equal(b.requested, 180000);
  assert.equal(b.own, 120000);
  assert.ok(Math.abs(b.ownShare - 0.4) < 1e-9);
  assert.equal(C.analyzeBudget(BUDGET, { funding_rate: 60, max_grant: 200000 }).requested, 180000);
});

test('budget errors when the request exceeds max_grant or requested_grant exceeds the rate', () => {
  const over = C.analyzeBudget(BUDGET, { funding_rate: 0.8, max_grant: 200000 });
  assert.equal(over.overCap, true);
  assert.match(over.errors.join(), /exceeds max_grant/);
  const asked = C.analyzeBudget(BUDGET, { funding_rate: 0.5, max_grant: 500000, requested_grant: 160000 });
  assert.match(asked.errors.join(), /exceeds eligible × funding_rate/);
  const low = C.analyzeBudget(BUDGET, { funding_rate: 0.6, max_grant: 200000, cofinancing_min: 0.5 });
  assert.match(low.errors.join(), /co-financing/);
});

test('budget rejects bad headers, costs and eligibility flags', () => {
  assert.match(C.analyzeBudget('cat,item,cost\n', {}).errors[0], /header/);
  const bad = C.analyzeBudget('category,item,cost_eur,eligible\nStaff,Dev,abc,yes\nStaff,QA,10,maybe\n', { funding_rate: 0.6 });
  assert.equal(bad.errors.length, 2);
  assert.match(C.analyzeBudget('category,item,cost_eur,eligible\n', { funding_rate: 0.6, max_grant: 1 }).warnings.join(), /no cost lines/);
});

// ---------- plan ----------

test('plan schedules backward from an internal deadline in the call timezone', () => {
  const today = Date.parse('2026-09-25T12:00:00Z');
  const p = C.buildPlan({ deadline: '2027-02-10T17:00:00+01:00', bufferDays: 7, today });
  assert.equal(p.deadline, '2027-02-10');
  assert.equal(p.internal, '2027-02-03');
  assert.equal(p.factor, 1);
  const by = Object.fromEntries(p.milestones.map((m) => [m.key, m.date]));
  assert.equal(by.submit, '2027-02-03');
  assert.equal(by.rubric, '2026-12-23');
  assert.equal(by.r1, '2027-01-10');
  assert.equal(by.compliance, '2027-01-31');
  // a late-evening deadline in a negative offset stays on its own calendar day
  assert.equal(C.buildPlan({ deadline: '2027-03-04T23:00:00-05:00', bufferDays: 0, today }).internal, '2027-03-04');
});

test('plan compresses when time is short and stretches to plan_start', () => {
  const short = C.buildPlan({ deadline: '2027-02-10T17:00:00+01:00', bufferDays: 7, today: Date.parse('2027-01-13T12:00:00Z') });
  assert.ok(short.compressed);
  assert.equal(short.milestones[0].date, '2027-01-13');
  const long = C.buildPlan({ deadline: '2027-02-10T17:00:00+01:00', bufferDays: 7, today: Date.parse('2026-09-25T12:00:00Z'), start: '2026-10-17' });
  assert.ok(long.factor > 1);
  assert.equal(long.milestones[0].date, '2026-10-17');
  assert.equal(C.buildPlan({ deadline: '2027-02-10T17:00:00+01:00', bufferDays: 7, today: Date.parse('2027-02-05T00:00:00Z') }).passed, true);
  assert.throws(() => C.buildPlan({ deadline: 'rolling' }));
});

test('c:plan writes plan.md, keeps ticks across regeneration and reports this week', async () => {
  const dl = iso(Date.now() + 20 * 86400000);
  const dir = makeApp('plan-app', { call: { deadline: dl, internal_buffer_days: 7 } });
  let r = await run('c:plan', ['plan-app']);
  assert.equal(r.code, 0);
  assert.match(r.out, /next: /);
  const plan = readFileSync(join(dir, 'plan.md'), 'utf8');
  assert.match(plan, /Internal deadline/);
  const ticked = plan.replace(/- \[ \] (\S+ — Rubric extracted)/, '- [x] $1');
  writeFileSync(join(dir, 'plan.md'), ticked);
  r = await run('c:plan', ['plan-app']);
  assert.match(readFileSync(join(dir, 'plan.md'), 'utf8'), /- \[x\] \S+ — Rubric extracted/);
  assert.match(r.out, /this week|overdue/);
  makeApp('plan-rolling');
  assert.equal((await run('c:plan', ['plan-rolling'])).code, 1);
});

// ---------- annexes ----------

test('annexes parse names, files and ticks; missing files are detected', () => {
  const text = '- [x] Budget — budget.csv\n- [ ] Hand-made art — annexes/art.pdf\n- [ ] PIC registered\n- [X] GDD -- `gdd.pdf`\nnot a list line\n';
  const items = C.parseAnnexes(text);
  assert.deepEqual(items.map((a) => [a.name, a.file, a.ticked]), [
    ['Budget', 'budget.csv', true], ['Hand-made art', 'annexes/art.pdf', false], ['PIC registered', null, false], ['GDD', 'gdd.pdf', true],
  ]);
  const dir = makeApp('annex-app', { files: { 'budget.csv': 'x', 'annexes.md': text } });
  const st = C.annexStatus(dir, text);
  assert.deepEqual(st.missing.map((a) => a.file), ['annexes/art.pdf', 'gdd.pdf']);
  assert.equal(st.complete, false);
});

test('c:annexes --sync ticks present files; --strict fails while incomplete', async () => {
  const dir = makeApp('annex-sync', { files: { 'budget.csv': 'x', 'annexes.md': '- [ ] Budget — budget.csv\n- [x] Art — art.pdf\n' } });
  const r = await run('c:annexes', ['annex-sync'], { sync: true });
  assert.equal(r.code, 0);
  assert.equal(readFileSync(join(dir, 'annexes.md'), 'utf8'), '- [x] Budget — budget.csv\n- [ ] Art — art.pdf\n');
  assert.equal((await run('c:annexes', ['annex-sync'], { strict: true })).code, 1);
  writeFileSync(join(dir, 'art.pdf'), 'x');
  await run('c:annexes', ['annex-sync'], { sync: true });
  assert.equal((await run('c:annexes', ['annex-sync'], { strict: true })).code, 0);
});

// ---------- commands against a full app ----------

const REVIEW_LOW = '## Review — r1\n| C1 | 5/10 | a |\n| C2 | 5/10 | b |\n| C3 | 5/10 | c |\n| C4 | 5/10 | d |\n| C5 | 5/10 | e |\n';
const REVIEW_HIGH = '## Review — r2\n| C1 | 8/10 | a |\n| C2 | 8/10 | b |\n| C3 | 8/10 | c |\n| C4 | 8/10 | d |\n| C5 | 8/10 | e |\n';

test('c:score prints total, trend and next command; c:budget writes the summary', async () => {
  const dir = makeApp('cmds', {
    call: { threshold: 70, funding_rate: 0.6, max_grant: 200000 },
    files: { 'review.md': `# R\n\n${REVIEW_LOW}\n${REVIEW_HIGH}`, 'budget.csv': BUDGET },
  });
  const s = await run('c:score', ['cmds']);
  assert.equal(s.code, 0);
  assert.match(s.out, /weighted total: 80\.0 \/ 100 {2}PASS/);
  assert.match(s.out, /trend: 50\.0 → 80\.0 {2}\(\+30\.0/);
  assert.match(s.out, /next: fund c:budget cmds && fund c:annexes cmds --sync/); // passing: move on
  makeApp('cmds-low', { call: { threshold: 70 }, files: { 'review.md': REVIEW_LOW } });
  assert.match((await run('c:score', ['cmds-low'])).out, /next: fund prompt draft cmds-low --section "All" --run --out applications\/cmds-low\/draft\.md/);
  const b = await run('c:budget', ['cmds']);
  assert.equal(b.code, 0);
  assert.match(readFileSync(join(dir, 'budget-summary.md'), 'utf8'), /Requested grant \| €180,000/);
});

test('c:review appends a scorable round from the AI and scores it (no network)', async () => {
  const dir = makeApp('rev', { call: { threshold: 70, frame: 'eu-cultural' }, files: { 'review.md': '# R\n' } });
  let seen = '';
  const fakeAI = (prompt) => { seen = prompt; return '| ID | Score | Reason |\n|---|---|---|\n| C1 | 9/10 | ok |\n| C2 | 9/10 | ok |\n| C3 | 9/10 | ok |\n| C4 | 9/10 | ok |\n| C5 | 9/10 | ok |\n'; };
  const r = await run('c:review', ['rev'], {}, { runAI: fakeAI });
  assert.equal(r.code, 0);
  assert.match(seen, /\| C5 \| <score>\/30 \|/);
  assert.match(readFileSync(join(dir, 'review.md'), 'utf8'), /## Review — \d{4}-/);
  assert.match(r.out, /weighted total: 90\.0/);
});

// ---------- checks by status ----------

test('checks: drafting warns, ready errors on low score, missing annexes and missing plan', async () => {
  const files = { 'review.md': REVIEW_LOW, 'budget.csv': BUDGET, 'annexes.md': '- [ ] Art — art.pdf\n' };
  const call = { threshold: 70, funding_rate: 0.6, max_grant: 200000, deadline: iso(Date.now() + 60 * 86400000) };
  makeApp('st-draft', { call, files });
  let rs = await checks('st-draft');
  assert.equal(level(rs, 'plan'), 'warn');
  assert.equal(level(rs, 'score'), 'warn');
  assert.equal(level(rs, 'annexes'), 'warn');
  assert.equal(level(rs, 'budget'), 'ok');
  assert.equal(level(rs, 'internal-deadline'), 'ok');

  makeApp('st-ready', { call: { ...call, status: 'ready' }, files });
  rs = await checks('st-ready');
  assert.equal(level(rs, 'plan'), 'error');
  assert.equal(level(rs, 'score'), 'error');
  assert.equal(level(rs, 'annexes'), 'error');

  const dir = makeApp('st-ready-ok', { call: { ...call, status: 'ready' }, files: { ...files, 'review.md': REVIEW_LOW + REVIEW_HIGH, 'annexes.md': '- [x] Art — art.pdf\n', 'art.pdf': 'x', 'plan.md': '# plan\n' } });
  rs = await checks('st-ready-ok');
  assert.deepEqual(rs.filter((r) => r.level !== 'ok'), []);
  assert.ok(existsSync(join(dir, 'art.pdf')));
});

test('checks: budget over max_grant errors; internal deadline passed errors unless submitted', async () => {
  makeApp('st-budget', { call: { funding_rate: 0.9, max_grant: 100000 }, files: { 'budget.csv': BUDGET } });
  assert.equal(level(await checks('st-budget'), 'budget'), 'error');
  const soon = iso(Date.now() + 3 * 86400000);
  makeApp('st-late', { call: { deadline: soon, internal_buffer_days: 7 } });
  assert.equal(level(await checks('st-late'), 'internal-deadline'), 'error');
  makeApp('st-late-done', { call: { deadline: soon, internal_buffer_days: 7, status: 'submitted' } });
  assert.equal(level(await checks('st-late-done'), 'internal-deadline'), 'ok');
  makeApp('st-close', { call: { deadline: iso(Date.now() + 10 * 86400000), internal_buffer_days: 7 } });
  assert.equal(level(await checks('st-close'), 'internal-deadline'), 'warn');
});

test('runChecks integrates the track and scaffold copies track templates', async () => {
  const tracks = { C: { ...track, dir: join(CORE.ROOT, 'tracks', 'c-proposals') } };
  makeApp('int', { call: { funding_rate: 0.6, max_grant: 200000 }, files: { 'budget.csv': BUDGET } });
  const { results } = await CORE.runChecks('int', { tracks });
  assert.equal(results.find((r) => r.name === 'C:budget').level, 'ok');
  const dir = await CORE.scaffold('scaf', { track: 'C', program: 'Test Call', deadline: '2027-03-04T14:00:00+01:00' });
  const fm = CORE.parseFrontmatter(readFileSync(join(dir, 'call.md'), 'utf8')).fm;
  assert.equal(fm.threshold, 70);
  assert.equal(fm.funding_rate, 0.6);
  assert.equal(fm.frame, 'eu-cultural');
  assert.ok(existsSync(join(dir, 'annexes.md')) && existsSync(join(dir, 'budget.csv')));
  assert.equal(CORE.loadApp('scaf').sections.length, 7);
  assert.ok(!existsSync(join(CORE.ROOT, 'applications', 'scaf')));
});

// ---------- regressions found by the adversarial validation pass ----------

const FENCED = (inner) => `Here is the updated file:\n\n\`\`\`markdown\n${inner}\n\`\`\`\n`;

test('regression: human-written frontmatter numbers ("70%", "60%", "200,000", "€200 000") are read', () => {
  assert.equal(C.num('200,000'), 200000);
  assert.equal(C.num('€200 000'), 200000);
  assert.equal(C.num('EUR 200000'), 200000);
  assert.equal(C.num('70%'), 70);
  assert.equal(C.num('abc'), null);
  assert.equal(C.num(true), null);
  assert.equal(C.fracOf('60%'), 0.6);
  assert.equal(C.fracOf('1%'), 0.01);
  assert.equal(C.fracOf(0.6), 0.6);
  assert.equal(C.thresholdOf({ threshold: '70%' }), 70);
  const b = C.analyzeBudget(BUDGET, { funding_rate: '60%', max_grant: '200,000' });
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.warnings, []);
  assert.equal(b.requested, 180000);
  assert.match(C.analyzeBudget(BUDGET, { funding_rate: 'sixty' }).errors.join(), /"sixty" is not a share/);
});

test('regression: c:budget points at call.md when the error is in call.md', async () => {
  makeApp('bud-next', { call: { funding_rate: 'n/a', max_grant: 200000 }, files: { 'budget.csv': BUDGET } });
  const r = await run('c:budget', ['bud-next']);
  assert.equal(r.code, 1);
  assert.match(r.out, /next: fix call\.md, then fund c:budget/);
});

test('regression: a fenced AI answer written over call.md is unwrapped, so Track C still applies', async () => {
  assert.equal(C.unwrapFence('---\na: 1\n---\nbody'), null);
  assert.equal(C.unwrapFence('no fence here'), null);
  assert.equal(C.unwrapFence(FENCED('---\na: 1\n---\n## S\nx')), '---\na: 1\n---\n## S\nx\n');
  assert.equal(C.unwrapFence('```\n## S <!-- criterion: C1 -->\ntext\n```'), '## S <!-- criterion: C1 -->\ntext\n');
  const dir = makeApp('fenced', { call: { deadline: iso(Date.now() + 90 * 86400000) } });
  const good = readFileSync(join(dir, 'call.md'), 'utf8');
  writeFileSync(join(dir, 'call.md'), FENCED(good).replace(/\n/g, '\r\n'));
  assert.equal(CORE.loadApp('fenced').call.fm.track, undefined); // this is what the core sees
  const r = await run('c:plan', ['fenced']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /unwrapped the AI's code fence around applications\/fenced\/call\.md/);
  assert.equal(CORE.loadApp('fenced').call.fm.track, 'C');
});

test('regression: a fenced draft.md fails C:fence; c:unwrap fixes it', async () => {
  const dir = makeApp('fenced-draft');
  writeFileSync(join(dir, 'draft.md'), FENCED('---\nversion: 2\n---\n## All <!-- criterion: C1, C2, C3, C4, C5 -->\nA Vilnius team.'));
  assert.equal(level(await checks('fenced-draft'), 'fence'), 'error');
  const r = await run('c:unwrap', ['fenced-draft']);
  assert.match(r.out, /unwrapped draft\.md/);
  assert.equal(level(await checks('fenced-draft'), 'fence'), undefined);
  assert.equal(CORE.loadApp('fenced-draft').draft.fm.version, 2);
  assert.match((await run('c:unwrap', ['fenced-draft'])).out, /not fenced/);
});

test('regression: c:plan without frontmatter says so instead of blaming the deadline', async () => {
  const dir = makeApp('no-fm');
  writeFileSync(join(dir, 'call.md'), '# just a body\n');
  const r = await run('c:plan', ['no-fm']);
  assert.equal(r.code, 1);
  assert.match(r.out, /no "---" frontmatter/);
});

test('regression: annex items with a dash but no file are not phantom missing files', () => {
  const items = C.parseAnnexes([
    '- [ ] PIC — registered on the Portal',
    '- [ ] Declaration of honour — signed — annexes/doh.pdf',
    '- [ ] Key art — `annexes/key art.pdf`',
    '- [ ] Letter of intent - partner.pdf',
    '- [ ] Co-financing letter — bank',
  ].join('\r\n'));
  assert.deepEqual(items.map((a) => [a.name, a.file]), [
    ['PIC — registered on the Portal', null],
    ['Declaration of honour — signed', 'annexes/doh.pdf'],
    ['Key art', 'annexes/key art.pdf'],
    ['Letter of intent', 'partner.pdf'],
    ['Co-financing letter — bank', null],
  ]);
});

test('regression: c:annexes --sync keeps Windows line endings', async () => {
  const dir = makeApp('annex-crlf', { files: { 'budget.csv': 'x', 'annexes.md': '# A\r\n- [ ] Budget — budget.csv\r\n- [ ] PIC — registered\r\n' } });
  await run('c:annexes', ['annex-crlf'], { sync: true });
  assert.equal(readFileSync(join(dir, 'annexes.md'), 'utf8'), '# A\r\n- [x] Budget — budget.csv\r\n- [ ] PIC — registered\r\n');
});

test('regression: bare scores in an out-of-weight table use their own criterion weight', () => {
  const crit5 = CORE.parseCriteria('| C1 | A1 | 20 | q |\n| C2 | B1 | 25 | q |\n| C3 | Cc1 | 5 | q |\n| C4 | D1 | 5 | q |\n| C5 | E1 | 10 | q |\n');
  const rows = C.parseRoundScores('| C1 | 14/20 | x |\n| C2 | 17/25 | x |\n| C3 | 3/5 | x |\n| C4 | 4/5 | x |\n| C5 | 7 | x |\n', crit5, { scale: 10 });
  assert.equal(rows.find((r) => r.id === 'C5').frac, 0.7); // was 7/5 clamped to 1.0
  // a table on one common scale keeps the old behaviour
  assert.equal(C.parseRoundScores('| C1 | 7/10 | x |\n| C2 | 6 | x |\n', crit5).find((r) => r.id === 'C2').frac, 0.6);
});

test('regression: short first cells ("a", "ID", "#") never match a criterion by substring', () => {
  const crit3 = CORE.parseCriteria('| C1 | Evidence and relevance | 10 | q |\n| C2 | Impact | 10 | q |\n');
  const rows = C.parseRoundScores('| ID | Score | Reason |\n|---|---|---|\n| C2 | 4/5 | ok |\n\n| # | Change | Gain |\n| a | Add partner letters | 3 |\n', crit3);
  assert.deepEqual(rows.map((r) => r.id), ['C2']);
  assert.equal(C.parseRoundScores('| Evidence | 4/5 | ok |\n', crit3)[0].id, 'C1'); // a real word still matches
});

test('regression: an unparseable newest round is flagged, not silently replaced by the previous score', async () => {
  const review = `${REVIEW_HIGH}\n## Review — r3 (AI returned prose)\nThe panel would reject this.\n`;
  const st = C.scoreState(review, crit);
  assert.equal(st.skipped, 'r3 (AI returned prose)');
  assert.equal(st.hist.length, 1);
  makeApp('skip', { call: { threshold: 70 }, files: { 'review.md': review } });
  const r = await run('c:score', ['skip']);
  assert.match(r.out, /newest round "r3 \(AI returned prose\)" has no parseable score table/);
  const rs = await checks('skip');
  assert.equal(level(rs, 'score'), 'warn');
  assert.match(rs.find((x) => x.name === 'score').detail, /newest round/);
});

test('regression: c:review demotes AI "## Review ..." headings so the new round is scored', async () => {
  const dir = makeApp('rev-head', { call: { threshold: 70 }, files: { 'review.md': '# R\n' } });
  const ai = () => '## Review of the application\n\n| ID | Score | Reason |\n|---|---|---|\n| C1 | 9/10 | a |\n| C2 | 9/10 | b |\n| C3 | 9/10 | c |\n| C4 | 9/10 | d |\n| C5 | 9/10 | e |\n';
  const r = await run('c:review', ['rev-head'], {}, { runAI: ai });
  assert.match(r.out, /weighted total: 90\.0/);
  assert.doesNotMatch(r.out, /no parseable score table/);
  assert.match(r.out, /next: fund c:budget rev-head/); // passing -> move on to paperwork
  assert.equal(C.splitReviews(readFileSync(join(dir, 'review.md'), 'utf8')).length, 1);
});

test('regression: c:plan rejects a bad or negative buffer instead of ignoring it', async () => {
  makeApp('buf', { call: { deadline: iso(Date.now() + 90 * 86400000) } });
  await assert.rejects(() => run('c:plan', ['buf'], { buffer: 'abc' }), /whole number of days/);
  await assert.rejects(() => run('c:plan', ['buf'], { buffer: '-5' }), /whole number of days/);
  makeApp('buf-fm', { call: { deadline: iso(Date.now() + 90 * 86400000), internal_buffer_days: 'soon' } });
  assert.equal(level(await checks('buf-fm'), 'plan'), 'error');
});

test('regression: a passed internal deadline points at submit (or park), not at the first milestone', async () => {
  makeApp('late-open', { call: { deadline: iso(Date.now() + 2 * 86400000), internal_buffer_days: 7 } });
  let r = await run('c:plan', ['late-open']);
  assert.equal(r.code, 1);
  assert.match(r.out, /next: fund check late-open && fund status late-open submitted/);
  assert.doesNotMatch(r.out, /overdue/);
  makeApp('late-closed', { call: { deadline: '2026-01-10T12:00:00Z' } });
  r = await run('c:plan', ['late-closed']);
  assert.match(r.out, /next: fund status late-closed parked/);
});

test('c:plan auto-ticks milestones the files prove done; a moved deadline makes plan.md stale', async () => {
  const dl = iso(Date.now() + 120 * 86400000);
  const dir = makeApp('auto', { call: { deadline: dl, threshold: 70 }, files: { 'review.md': REVIEW_LOW + REVIEW_HIGH } });
  const r = await run('c:plan', ['auto']);
  const plan = readFileSync(join(dir, 'plan.md'), 'utf8');
  for (const k of ['Rubric extracted', 'v1 draft complete', 'Hostile review round 1', 'Hostile review round 2']) assert.match(plan, new RegExp(`- \\[x\\] \\S+ — ${k}`));
  assert.match(plan, /- \[ \] \S+ — Fit check/);
  assert.match(r.out, /Fit check/);
  assert.equal(level(await checks('auto'), 'plan'), 'ok');
  CORE.updateFrontmatter(join(dir, 'call.md'), { deadline: iso(Date.now() + 150 * 86400000) });
  const rs = await checks('auto');
  assert.equal(level(rs, 'plan'), 'warn');
  assert.match(rs.find((x) => x.name === 'plan').detail, /run: fund c:plan auto/);
});

test('fast loop end to end through bin/fund.mjs with a fenced stub AI (no network)', async () => {
  const stub = join(apps, 'stub-ai.mjs');
  writeFileSync(stub, `import { readFileSync } from 'node:fs';
const p = readFileSync(0, 'utf8');
const between = (l) => { const i = p.indexOf(l); const s = p.indexOf('<<<\\n', i) + 4; return p.slice(s, p.indexOf('\\n>>>', s)); };
if (p.includes('extracting the rules')) {
  const call = between('Current call.md').replace('|---|---|---|---|', '|---|---|---|---|\\n| C1 | Excellence | 50 | "q" |\\n| C2 | Impact | 50 | "q" |').replace('max_grant: 0', 'max_grant: 500000');
  process.stdout.write('Here you go:\\n\\n\`\`\`markdown\\n' + call + '\\n\`\`\`\\n');
} else if (p.startsWith('Draft ')) {
  process.stdout.write('\`\`\`markdown\\n---\\nversion: 1\\n---\\n## Excellence <!-- criterion: C1 | limit: 3000 -->\\nThe pipeline writes each cat story and paints portraits [F-019].\\n\\n## Impact <!-- criterion: C2 | limit: 3000 -->\\nLive on iOS and Android [F-015] [F-016].\\n\`\`\`\\n');
} else process.stdout.write('## Review\\n| ID | Score | Reason |\\n|---|---|---|\\n| C1 | 40/50 | ok |\\n| C2 | 40/50 | ok |\\n');
`);
  process.env.FUND_AI_CMD = `node "${stub}"`;
  const { main } = await import('../bin/fund.mjs');
  const quiet = async (argv) => {
    const orig = { log: console.log, error: console.error };
    const logs = [];
    console.log = (...a) => logs.push(a.join(' '));
    console.error = (...a) => logs.push(a.join(' '));
    try { return { code: await main(argv), out: logs.join('\n') }; } finally { Object.assign(console, orig); }
  };
  const slug = 'e2e-eurostars';
  const out = `${join(apps, slug)}/`;
  assert.equal((await quiet(['new', slug, '--track', 'C', '--program', 'Eurostars Call 12', '--frame', 'ai-creative', '--deadline', iso(Date.now() + 160 * 86400000)])).code, 0);
  assert.equal((await quiet(['prompt', 'extract', slug, '--run', '--out', `${out}call.md`])).code, 0);
  assert.equal((await quiet(['c:plan', slug])).code, 0);
  assert.equal((await quiet(['prompt', 'draft', slug, '--run', '--out', `${out}draft.md`])).code, 0);
  let chk = await quiet(['check', slug]);
  // The core now strips an AI's wrapping fence on --out, so the draft is already clean.
  assert.doesNotMatch(chk.out, /✗ C:fence/);
  await quiet(['c:unwrap', slug]);
  assert.match((await quiet(['c:review', slug])).out, /weighted total: 80\.0 \/ 100 {2}PASS/);
  writeFileSync(`${out}budget.csv`, 'category,item,cost_eur,eligible\nStaff,R&D engineer,100000,yes\n');
  assert.equal((await quiet(['c:budget', slug])).code, 0);
  mkdirSync(`${out}annexes`, { recursive: true });
  writeFileSync(`${out}annexes/declaration-of-honour.pdf`, '');
  assert.equal((await quiet(['c:annexes', slug, '--sync'])).code, 0);
  await quiet(['c:plan', slug]);
  await quiet(['status', slug, 'ready']);
  chk = await quiet(['check', slug]);
  assert.equal(chk.code, 0, chk.out);
  assert.match(chk.out, /✓ C:score {17}80\.0\/100 >= 70/);
  delete process.env.FUND_AI_CMD;
});

test('regression: carried-over criteria with an unfilled source.md do not auto-tick "Rubric extracted"', async () => {
  const dir = makeApp('carried', { call: { deadline: iso(Date.now() + 120 * 86400000) }, files: { 'source.md': '# Source\n\nPaste the full 2027 call text here when it publishes.\n' } });
  await run('c:plan', ['carried']);
  assert.match(readFileSync(join(dir, 'plan.md'), 'utf8'), /- \[ \] \S+ — Rubric extracted/);
});

test('regression: c:review without criteria refuses before spending an AI call', async () => {
  const dir = makeApp('no-crit');
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: 'x', track: 'C', status: 'drafting' }) + '# no table\n');
  let called = false;
  const r = await run('c:review', ['no-crit'], {}, { runAI: () => { called = true; return ''; } });
  assert.equal(r.code, 1);
  assert.equal(called, false);
  assert.match(r.out, /next: fund prompt extract no-crit --run --out applications\/no-crit\/call\.md/);
});

test('regression: criteria named in non-Latin scripts match by name', () => {
  const greek = CORE.parseCriteria('| C1 | Καινοτομία | 50 | q |\n| C2 | Αντίκτυπος | 50 | q |\n');
  const rows = C.parseRoundScores('| Αντίκτυπος | 8/10 | ok |\n| Kūrybiškumas | 5/10 | no match |\n', greek);
  assert.deepEqual(rows.map((r) => [r.id, r.frac]), [['C2', 0.8]]);
});

test('regression: "c:annexes --sync <slug>" (flag before slug) works like "c:annexes <slug> --sync"', async () => {
  const { main } = await import('../bin/fund.mjs');
  const dir = makeApp('flag-first', { files: { 'budget.csv': 'x', 'annexes.md': '- [ ] Budget — budget.csv\n' } });
  const orig = console.log;
  const logs = [];
  console.log = (...a) => logs.push(a.join(' '));
  try { assert.equal(await main(['c:annexes', '--sync', 'flag-first']), 0); } finally { console.log = orig; }
  assert.equal(readFileSync(join(dir, 'annexes.md'), 'utf8'), '- [x] Budget — budget.csv\n');
});

// ---------- validator regressions ----------

test('regression: a European decimal comma ("3,5/5") is 70%, not 5/5 = 100%', () => {
  assert.deepEqual(C.parseScore('3,5/5'), { frac: 0.7, scale: 5 });
  assert.equal(C.parseScore('7,25 / 10').frac, 0.725);
  assert.equal(C.parseRoundScores('| C1 | 3,5/5 | ok |\n', crit)[0].frac, 0.7);
});

test('regression: unwrapping a fenced answer with a nested code block keeps the whole file', () => {
  const inner = '---\nversion: 1\n---\n## Plan <!-- criterion: C1 -->\nIntro.\n\n```js\nconst x = 1;\n```\n\nThe rest of the section must survive.\n\n## Team <!-- criterion: C2 -->\nA Vilnius team.';
  assert.equal(C.unwrapFence(`Here is the draft:\n\n\`\`\`markdown\n${inner}\n\`\`\`\n\nLet me know.\n`), `${inner}\n`);
  // an answer cut off before its closing fence is still unwrapped
  assert.equal(C.unwrapFence('```markdown\n---\na: 1\n---\n## X\ntext'), '---\na: 1\n---\n## X\ntext\n');
  // CRLF answers stay CRLF
  assert.equal(C.unwrapFence('```\r\n---\r\na: 1\r\n---\r\n## X\r\n```\r\n'), '---\r\na: 1\r\n---\r\n## X\r\n');
});

test('regression: a lowercase "## review — ..." heading starts its own round', () => {
  const review = '## Review — r1\n| C1 | 2/10 | a |\n\n## review — r2 (typed by hand)\n| C1 | 9/10 | b |\n';
  assert.deepEqual(C.splitReviews(review).map((r) => r.title), ['r1', 'r2 (typed by hand)']);
  const st = C.scoreState(review, crit);
  assert.equal(st.hist.at(-1).items.find((i) => i.id === 'C1').frac, 0.9);
});

test('regression: a threshold written on the call scale ("3/5", "7 out of 10") is read, not dropped', () => {
  assert.equal(C.thresholdOf({ threshold: '3/5' }), 60);
  assert.equal(C.thresholdOf({ threshold: '7 out of 10' }), 70);
  assert.equal(C.thresholdOf({ threshold: '3,5/5' }), 70);
  assert.equal(C.thresholdOf({ threshold: 70 }), 70);
});

test('regression: plan_start on or after the internal deadline is an error, not a one-day schedule', () => {
  const today = Date.parse('2026-09-25T12:00:00Z');
  assert.throws(() => C.buildPlan({ deadline: '2027-01-14', start: '2027-03-01', today }), /plan_start "2027-03-01" is on or after the internal deadline 2027-01-07/);
  assert.equal(C.buildPlan({ deadline: '2027-01-14', start: '2026-10-01', today }).milestones[0].date, '2026-10-01');
});

test('regression: c:plan on a submitted application with a past deadline does not say "submit now"', async () => {
  const dir = makeApp('done-past', { call: { deadline: '2026-01-10T12:00:00Z', status: 'submitted' } });
  const r = await run('c:plan', ['done-past']);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /submit now|parked/);
  assert.match(r.out, /nothing left to schedule\nnext: fund status done-past won/);
  assert.equal(existsSync(join(dir, 'plan.md')), false);
});

test('regression: cost cells like "0x10", "1e5" or "Infinity" are rejected; an empty budget names the header', () => {
  for (const bad of ['0x10', '1e5', 'Infinity']) {
    assert.match(C.analyzeBudget(`category,item,cost_eur,eligible\nStaff,a,${bad},yes\n`, { funding_rate: 0.6 }).errors[0], /is not a number/);
  }
  assert.match(C.analyzeBudget('', {}).errors[0], /first line must be category,item,cost_eur,eligible/);
});

test('regression: an empty annexes.md says to add annexes instead of "tick the remaining items"', async () => {
  makeApp('annex-empty', { files: { 'annexes.md': '# Annexes\n' } });
  const r = await run('c:annexes', ['annex-empty']);
  assert.match(r.out, /next: add one "- \[ \] Name — file" line per mandatory annex/);
  assert.doesNotMatch(r.out, /tick the remaining/);
  assert.match((await checks('annex-empty')).find((x) => x.name === 'annexes').detail, /lists no annexes/);
});

test('regression: the redraft next: chain unwraps the AI fence before fund check, so it does not stop on C:fence', async () => {
  makeApp('chain', { call: { threshold: 90 }, files: { 'review.md': REVIEW_LOW } });
  const r = await run('c:score', ['chain']);
  assert.match(r.out, /--out applications\/chain\/draft\.md && fund c:unwrap chain && fund check chain && fund c:review chain/);
  const v1 = C.MILESTONES.find((m) => m.key === 'v1').cmd;
  assert.match(v1, /&& fund c:unwrap \{\{SLUG\}\} && fund check \{\{SLUG\}\}$/);
});

test('regression: fit.md auto-ticks the fit milestone and a passing round 2 ticks v2', async () => {
  const dl = iso(Date.now() + 120 * 86400000);
  const dir = makeApp('fit-v2', { call: { deadline: dl, threshold: 70 }, files: { 'review.md': REVIEW_LOW + REVIEW_HIGH, 'fit.md': 'GO-IF: partner letter.\n' } });
  const r = await run('c:plan', ['fit-v2']);
  const plan = readFileSync(join(dir, 'plan.md'), 'utf8');
  assert.match(plan, /- \[x\] \S+ — Fit check/);
  assert.match(plan, /- \[x\] \S+ — v2 draft/);
  assert.match(plan, /`fund prompt fit fit-v2 --run --out applications\/fit-v2\/fit\.md`/);
  assert.doesNotMatch(r.out, /next: fund prompt fit/);
});
