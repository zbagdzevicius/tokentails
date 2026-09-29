import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fund-portfolio-'));
process.env.FUND_APPS_DIR = join(tmp, 'apps');
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
process.env.FUND_PORTFOLIO = join(tmp, 'opportunities.json');
process.env.FUND_NOW = '2026-09-26T12:00:00Z';
process.env.FUND_AI_CMD = 'false'; // any AI call in these tests is a bug
mkdirSync(process.env.FUND_APPS_DIR, { recursive: true });

const { CORE } = await import('../lib/core.mjs');
const P = await import('../lib/portfolio.mjs');
const { go } = await import('../lib/commands/go.mjs');
const goCmd = (await import('../lib/commands/go.mjs')).default;
const { main } = await import('../bin/fund.mjs');

const NOW = new Date('2026-09-26T12:00:00Z');
const opp = (o) => ({ id: o.slug, program: o.slug, track: 'B', url: `https://${o.slug}.example`, deadline: 'rolling', capital_mid_usd: 10000, success: 0.1, framework_hours: 1, verdict: 'DO', condition: '', frame: '', notes: '', ...o });

async function quiet(fn) {
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try { return { value: await fn(), out: logs.join('\n') }; } finally { console.log = orig.log; console.error = orig.error; }
}

function makeApp(slug, fm = {}) {
  const dir = join(process.env.FUND_APPS_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'B', status: 'drafting', deadline: 'rolling', ...fm }));
}

// ---------- the real portfolio file ----------
test('portfolio/opportunities.json: valid rows, user exclusions and the 10% bar applied, only DO/COND/LATER/SKIP/CHECK', () => {
  const doc = P.loadPortfolio(join(import.meta.dirname, '..', 'portfolio', 'opportunities.json'));
  const rows = doc.opportunities;
  assert.ok(rows.length >= 35, String(rows.length));
  assert.deepEqual(rows.map((o) => o.id), rows.map((_, i) => i + 1), 'ids are 1..n, history kept');
  assert.deepEqual(P.validatePortfolio(doc), []);
  // Taiko and Solana (incl. Superteam) are excluded by the user: kept for history, never actionable.
  const userExcluded = rows.filter((o) => P.exclusionReason({ program: o.program, url: o.url }) !== null);
  for (const o of userExcluded) {
    assert.equal(o.verdict, 'SKIP', o.slug);
    assert.match(o.notes, /user excluded|below the 10% bar/, o.slug);
  }
  for (const slug of ['taiko-grant', 'solana-standard-grant', 'superteam']) {
    const o = rows.find((x) => x.slug === slug);
    assert.ok(o && userExcluded.includes(o), `${slug} must be caught by exclusionReason`);
  }
  assert.match(rows.find((o) => o.slug === 'taiko-grant').notes, /user excluded: Taiko owes the team money/);
  for (const slug of ['solana-standard-grant', 'superteam']) assert.match(rows.find((o) => o.slug === slug).notes, /user excluded: Solana/);
  // The 10% bar: anything with an estimated success <= 0.10 is SKIP and says why.
  for (const o of rows.filter((x) => typeof x.success === 'number' && x.success <= 0.1)) {
    assert.equal(o.verdict, 'SKIP', o.slug);
    assert.match(o.notes, /below the 10% bar|user excluded/, o.slug);
  }
  // Nothing actionable is excluded or below the bar.
  for (const o of rows.filter((x) => x.verdict !== 'SKIP')) {
    assert.equal(P.exclusionReason({ program: o.program, url: o.url }), null, o.program);
    assert.ok(o.success == null || o.success > 0.1, o.slug);
  }
  // Rows from HIGH-PROBABILITY-OPPORTUNITIES.md (id >= 35) wait for a person, with the P > 10% recorded
  // (rows a later re-check pushed under the bar are SKIP and covered above).
  const hp = rows.filter((x) => x.id >= 35 && x.verdict !== 'SKIP');
  assert.ok(hp.length >= 1);
  for (const o of hp) {
    assert.equal(o.verdict, 'COND', o.slug);
    assert.equal(o.condition_met, false, o.slug);
    assert.ok(o.condition && o.notes && o.success > 0.1, o.slug);
  }
  const dos = rows.filter((o) => o.verdict === 'DO').map((o) => o.slug);
  assert.deepEqual(dos, ['arc-microgrants', 'skale-sip6']); // Colosseum fell to 2% in the 2026-09-28 strategy proof
});

test('validatePortfolio catches bad verdicts, tracks, slugs, deadlines, COND without condition', () => {
  const problems = P.validatePortfolio({ opportunities: [
    opp({ slug: 'a', verdict: 'MAYBE' }), opp({ slug: 'a' }), opp({ slug: 'Bad Slug', track: 'Z' }),
    opp({ slug: 'c', deadline: 'soon' }), opp({ slug: 'd', verdict: 'COND' }), opp({ slug: 'e', success: 2 }),
  ] });
  const text = problems.join('\n');
  for (const re of [/verdict "MAYBE"/, /duplicate slug a/, /bad slug/, /track "Z"/, /unparseable deadline/, /COND needs a condition/, /success must be 0-1/]) assert.match(text, re);
});

// ---------- ranking math ----------
test('EV per hour and urgency boost', () => {
  assert.equal(P.expectedValue(opp({ slug: 'x', capital_mid_usd: 17500, success: 0.17 })), 2975);
  assert.equal(P.evPerHour(opp({ slug: 'x', capital_mid_usd: 17500, success: 0.17, framework_hours: 7 })), 425);
  assert.equal(P.evPerHour(opp({ slug: 'x', capital_mid_usd: null })), 0, 'unknown capital ranks as 0');
  assert.equal(P.evPerHour(opp({ slug: 'x', framework_hours: 0 })), 4000, 'hours floored at 0.25');
  assert.equal(P.urgency(null), 1);
  assert.equal(P.urgency(45), 1);
  assert.equal(P.urgency(15), 2);
  assert.equal(P.urgency(0), 3);
});

test('rank: DO before COND-met before LATER-reached; within a tier by EV/h × urgency', () => {
  const r = P.rank([
    opp({ slug: 'do-low', capital_mid_usd: 1000 }),                                       // 100/h
    opp({ slug: 'do-high', capital_mid_usd: 20000 }),                                     // 2000/h
    opp({ slug: 'do-urgent', capital_mid_usd: 8000, deadline: '2026-10-11' }),           // 800/h × ~2 = ~1600
    opp({ slug: 'cond-met', verdict: 'COND', condition: 'x', condition_met: true, capital_mid_usd: 1e6 }),
    opp({ slug: 'cond-open', verdict: 'COND', condition: 'partner signs' }),
    opp({ slug: 'later-now', verdict: 'LATER', after: '2026-09-01', capital_mid_usd: 1e7 }),
    opp({ slug: 'later-future', verdict: 'LATER', after: '2027-01-01' }),
    opp({ slug: 'later-nodate', verdict: 'LATER' }),
    opp({ slug: 'skip', verdict: 'SKIP', capital_mid_usd: 1e9 }),
    opp({ slug: 'check', verdict: 'CHECK' }),
  ], { now: NOW });
  assert.deepEqual(r.ranked.map((x) => x.slug), ['do-high', 'do-urgent', 'do-low', 'cond-met', 'later-now']);
  const urgent = r.ranked.find((x) => x.slug === 'do-urgent');
  assert.ok(urgent.urgency > 1.9 && urgent.urgency < 2.1, String(urgent.urgency));
  assert.deepEqual(r.waiting.map((x) => x.slug).sort(), ['check', 'cond-open', 'later-future', 'later-nodate']);
  assert.match(r.waiting.find((x) => x.slug === 'cond-open').reason, /partner signs/);
  assert.deepEqual(r.skipped.map((x) => x.slug), ['skip']);
});

test('rank: passed deadlines and closed applications drop out', () => {
  const r = P.rank([
    opp({ slug: 'passed', deadline: '2026-09-20' }),
    opp({ slug: 'today', deadline: '2026-09-26' }),       // date-only = end of day, still open
    opp({ slug: 'submitted-app' }),
    opp({ slug: 'parked-app' }),
  ], { now: NOW, apps: { 'submitted-app': { status: 'submitted' }, 'parked-app': { status: 'parked' } } });
  assert.deepEqual(r.ranked.map((x) => x.slug), ['today']);
  assert.deepEqual(r.dropped.map((x) => x.slug).sort(), ['passed', 'submitted-app']);
  assert.match(r.dropped.find((x) => x.slug === 'passed').reason, /deadline passed 6d ago/);
  assert.equal(r.waiting[0].slug, 'parked-app');
});

// ---------- capacity ----------
test('allocate: whole items in rank order, then a partial for the best one that did not fit', () => {
  const rows = [{ need_h: 7 }, { need_h: 10 }, { need_h: 2 }, { need_h: 1.5 }].map((x, i) => ({ ...x, slug: `s${i}` }));
  const { used } = P.allocate(rows, 12);
  assert.deepEqual(rows.map((r) => r.alloc_h), [7, 1.5, 2, 1.5]);
  assert.equal(rows[1].partial, true);
  assert.equal(used, 12);
  const small = [{ need_h: 3 }, { need_h: 3 }];
  assert.equal(P.allocate(small, 20).used, 6, 'never allocates more than needed');
});

test('weekPlan uses remaining pipeline hours when an app reports them', () => {
  const plan = P.weekPlan([opp({ slug: 'big', framework_hours: 40, capital_mid_usd: 1e6 }), opp({ slug: 'small' })], { now: NOW, capacity: 5, apps: { big: { status: 'drafting', remaining_h: 2 } } });
  assert.equal(plan.ranked[0].need_h, 2);
  assert.equal(plan.ranked[0].alloc_h, 2);
  assert.equal(plan.used, 3);
});

// ---------- triage parsing and exclusions ----------
test('parseTriageJson reads the fenced json block; exclusionReason enforces the user rules', () => {
  const rows = P.parseTriageJson('text\n```json\n[{"source":"a","opportunity":"YES"}]\n```\nmore');
  assert.equal(rows[0].source, 'a');
  assert.throws(() => P.parseTriageJson('nothing'), /no fenced/);
  assert.match(P.exclusionReason({ program: 'Stellar Community Fund #47' }), /excluded program/);
  assert.match(P.exclusionReason({ program: 'Giveth QF round' }), /excluded program/);
  assert.match(P.exclusionReason({ program: 'X', reason: 'in-person demo day required' }), /not remote/);
  assert.match(P.exclusionReason({ program: 'X', reason: 'token sale launchpad' }), /not a grant/);
  assert.match(P.exclusionReason({ program: 'Superteam listings grant', reason: 'remote grant' }), /excluded program/);
  assert.match(P.exclusionReason({ program: 'Solana Foundation grant' }), /excluded program \(Solana\)/);
  assert.match(P.exclusionReason({ program: 'X', url: 'https://taiko.xyz/grant-program' }), /excluded program \(taiko\)/i);
  assert.equal(P.exclusionReason({ program: 'Micro Jam 066 Ziva category', reason: 'remote online game jam, cash prizes' }), null);
  assert.equal(P.slugify('Inovacijų agentūra — 2027!'), 'inovaciju-agentura-2027');
});

// ---------- WEEK.md ----------
test('weekMarkdown: ranked table, autopilot log, human queue with commands, waiting, hours', () => {
  const plan = P.weekPlan([
    opp({ slug: 'alpha', program: 'Alpha Grant', deadline: '2026-10-10' }),
    opp({ slug: 'beta', verdict: 'COND', condition: 'partner signs' }),
    opp({ slug: 'gone', deadline: '2026-01-01' }),
  ], { now: NOW, capacity: 10, apps: { alpha: { status: 'drafting', next: 'Deploy to mainnet' } } });
  const md = P.weekMarkdown(plan, {
    ran: [{ command: 'node bin/fund.mjs run alpha', code: 0, note: '3 steps done' }],
    queue: [{ slug: 'alpha', step: 'deploy', instructions: 'Sign the deploy', due: '2026-10-10', command: 'node bin/fund.mjs done alpha deploy' }],
  });
  assert.match(md, /^# Week plan — 2026-09-26/);
  assert.match(md, /\| 1 \| Alpha Grant \| DO \| \$1k \| \$1k \| 2026-10-10 \(14d\) \| 1 \| drafting \| Deploy to mainnet \|/);
  assert.match(md, /`node bin\/fund.mjs run alpha` → ok — 3 steps done/);
  assert.match(md, /\| 1 \| 2026-10-10 \| alpha \| deploy \| Sign the deploy \| `node bin\/fund.mjs done alpha deploy` \|/);
  assert.match(md, /\*\*beta\*\* \(COND.*condition: partner signs/);
  assert.match(md, /## Dropped\n\n- gone — deadline passed/);
  assert.match(md, /\*\*Hours used vs capacity:\*\* 1 \/ 10/);
});

// ---------- go with a stubbed invoke ----------
function writePortfolio(opps) { writeFileSync(process.env.FUND_PORTFOLIO, JSON.stringify({ version: 1, opportunities: opps })); }

test('go: runs the engine for each active app in rank order within capacity, uses queue --json, writes WEEK.md', async () => {
  makeApp('top', { deadline: '2026-10-05', next: 'Sign it' });
  makeApp('mid');
  makeApp('huge');
  makeApp('skipped-app');
  writePortfolio([
    opp({ slug: 'mid', capital_mid_usd: 5000 }),
    opp({ slug: 'top', capital_mid_usd: 20000, deadline: '2026-10-05' }),
    opp({ slug: 'huge', capital_mid_usd: 1000, framework_hours: 50 }),
    opp({ slug: 'skipped-app', verdict: 'SKIP' }),
    opp({ slug: 'new-one', capital_mid_usd: 100 }),
  ]);
  const calls = [];
  const invoke = async (argv) => {
    calls.push(argv.join(' '));
    if (argv[0] === 'queue') console.log(JSON.stringify([
      { slug: 'mid', step: 'human-read', title: 'Read it', instructions: 'Read the draft aloud', deadline: 'rolling' },
      { slug: 'top', step: 'submit', title: 'Submit', instructions: 'Paste into the form and press submit', deadline: '2026-10-05' },
      { slug: 'skipped-app', step: 'submit', instructions: 'not this week', deadline: 'rolling' },
    ]));
    if (argv[0] === 'run') console.log(`ran 2 steps for ${argv[1]}`);
    return 0;
  };
  const { value, out } = await quiet(() => go({ flags: { hours: '3', 'no-ai': true }, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
  assert.equal(value, 0, out);
  assert.deepEqual(calls, ['run top --no-ai', 'run mid --no-ai', 'queue --json'], 'huge gets no hours, skipped app and missing app are not run');
  assert.match(out, /TOP HUMAN ACTIONS\n  1\. \[2026-10-05\] top: Paste into the form/);
  assert.match(out, /then: node bin\/fund.mjs done top submit/);
  assert.match(out, /next: node bin\/fund.mjs done top submit/);
  assert.match(out, /no application yet \(new-one\)/);
  const md = readFileSync(join(process.env.FUND_APPS_DIR, 'WEEK.md'), 'utf8');
  assert.match(md, /`node bin\/fund.mjs run top --no-ai` → ok — ran 2 steps for top/);
  assert.match(md, /\| huge \| DO .*\| 0 \(needs 50\) \|/, 'the missing app also consumes capacity, so huge gets none');
  assert.match(md, /`node bin\/fund.mjs done mid human-read`/);
  assert.doesNotMatch(md, /not this week/);
  assert.match(md, /1 human step\(s\) in applications not active this week \(skipped-app\)/);
  assert.match(md, /\*\*Hours used vs capacity:\*\* 3 \/ 3/);
});

test('go: falls back to check when run is not installed, and derives the queue from a pipeline', async () => {
  const calls = [];
  const invoke = async (argv) => { calls.push(argv.join(' ')); return 0; };
  const fakePipeline = {
    resolvePipeline: async () => [{ id: 'draft', kind: 'ai', estimate_h: 0.5 }, { id: 'sign', kind: 'human', estimate_h: 0.25, title: 'Sign', instructions: 'Sign the deploy with your key' }],
    makeCtx: () => ({}),
    evaluate: async (steps) => steps.map((step) => ({ step, done: false, blocked: false })),
  };
  const { value, out } = await quiet(() => go({ flags: { hours: '20', dry: true }, core: CORE, invoke, hasCommand: (n) => n !== 'run' && n !== 'queue', pipeline: fakePipeline }));
  assert.equal(value, 0, out);
  assert.ok(calls.includes('check top') && calls.includes('check mid'), calls.join(', '));
  assert.ok(!calls.some((c) => c.startsWith('run ')));
  assert.match(out, /run \(the pipeline engine\) is not installed — ran check instead/);
  assert.match(out, /then: node bin\/fund.mjs done top sign/);
  const md = readFileSync(join(process.env.FUND_APPS_DIR, 'WEEK.md'), 'utf8');
  assert.match(md, /dry run/);
  assert.match(md, /\| huge \| DO .*\| 0.75 \|/, 'remaining pipeline hours (0.5 + 0.25) replace framework_hours');
});

test('go --hours validation and --dry --scaffold only prints the scaffold commands', async () => {
  const { value } = await quiet(() => go({ flags: { hours: '0' }, core: CORE, invoke: async () => 0, hasCommand: () => true, pipeline: false }));
  assert.equal(value, 2);
  const calls = [];
  const { out } = await quiet(() => go({ flags: { dry: true, scaffold: true }, core: CORE, invoke: async (a) => { calls.push(a.join(' ')); return 0; }, hasCommand: () => false, pipeline: false }));
  assert.match(out, /would scaffold: node bin\/fund.mjs new new-one --track B/);
  assert.ok(!calls.some((c) => c.startsWith('new ')));
  assert.ok(!existsSync(join(process.env.FUND_APPS_DIR, 'new-one')));
});

// ---------- go --scaffold through the real CLI ----------
test('go --scaffold creates missing DO / COND-met apps (Track A via a:init, others via new) in the temp apps dir', async () => {
  writePortfolio([
    opp({ slug: 'arc-microgrants', a_program: 'arc-microgrants', track: 'A', program: 'Arc Microgrants', deadline: '2026-10-14', capital_mid_usd: 500, success: 0.4, framework_hours: 1.5, frame: 'payout-rail', from: 'no-such-app' }),
    opp({ slug: 'skale-sip6', program: 'SKALE SIP-6 forum post', frame: 'high-throughput' }),
    opp({ slug: 'cond-met-c', track: 'C', verdict: 'COND', condition: 'partner', condition_met: true, program: 'Cond Met Call', deadline: '2027-03-04' }),
    opp({ slug: 'cond-open', track: 'C', verdict: 'COND', condition: 'partner' }),
    opp({ slug: 'later-one', verdict: 'LATER', after: '2026-01-01' }),
  ]);
  const calls = [];
  const invoke = async (argv) => {
    calls.push(argv.join(' '));
    if (argv[0] === 'run' || argv[0] === 'queue') return 0; // keep the engine out of this test
    return main(argv);
  };
  const tracks = await CORE.loadTracks();
  const { value, out } = await quiet(() => goCmd.run({ flags: { scaffold: true, 'no-ai': true }, core: CORE, tracks, invoke, hasCommand: () => true, pipeline: false }));
  assert.equal(value, 0, out);
  assert.ok(calls.includes('a:init arc-microgrants'), calls.join('\n'));
  assert.ok(calls.some((c) => c.startsWith('new skale-sip6 --track B --program SKALE SIP-6 forum post')));
  assert.ok(calls.some((c) => c.startsWith('new cond-met-c --track C')));
  assert.ok(!calls.some((c) => /cond-open|later-one/.test(c) && /^(new|a:init)/.test(c)), 'COND not met and LATER are never scaffolded');
  const apps = CORE.listApps();
  for (const s of ['arc-microgrants', 'skale-sip6', 'cond-met-c']) assert.ok(apps.includes(s), s);
  const arc = CORE.loadApp('arc-microgrants').call.fm;
  assert.equal(arc.track, 'A');
  assert.equal(arc.chain, 'arc', 'Track A profile applied');
  assert.equal(CORE.loadApp('skale-sip6').call.fm.frame, 'high-throughput');
  assert.ok(calls.includes('run arc-microgrants --no-ai'), 'freshly scaffolded apps are run in the same pass');
  assert.match(readFileSync(join(process.env.FUND_APPS_DIR, 'WEEK.md'), 'utf8'), /✓|ok/);
});

test('fund go is registered in the CLI', async () => {
  const { out } = await quiet(() => main(['help']));
  assert.match(out, /go\s+\[--hours N=20\]/);
});

// ---------- adversarial regressions ----------
test('regression: a parked app is never run, whatever the verdict; go asks a person to unpark it', async () => {
  const r = P.rank([
    opp({ slug: 'p-cond', verdict: 'COND', condition: 'x', condition_met: true }),
    opp({ slug: 'p-later', verdict: 'LATER', after: '2026-01-01' }),
    opp({ slug: 'p-future', verdict: 'LATER', after: '2027-01-01' }),
  ], { now: NOW, apps: { 'p-cond': { status: 'parked' }, 'p-later': { status: 'parked' }, 'p-future': { status: 'parked' } } });
  assert.deepEqual(r.ranked, []);
  assert.deepEqual(r.waiting.filter((w) => w.parked).map((w) => w.slug).sort(), ['p-cond', 'p-later']);
  assert.equal(r.waiting.find((w) => w.slug === 'p-future').parked, false, 'not yet reached: waiting for its date, not for an unpark');

  makeApp('parked-later', { status: 'parked' });
  writePortfolio([opp({ slug: 'parked-later', verdict: 'LATER', after: '2026-09-01' })]);
  const calls = [];
  const { value, out } = await quiet(() => go({ flags: {}, core: CORE, invoke: async (a) => { calls.push(a.join(' ')); return 0; }, hasCommand: () => true, pipeline: false }));
  assert.equal(value, 0, out);
  assert.ok(!calls.some((c) => c.startsWith('run ')), calls.join(', '));
  assert.match(out, /parked-later: .*parked/);
  assert.match(out, /then: node bin\/fund.mjs status parked-later drafting/);
});

test('regression: a command that throws inside go becomes a failed row; go still writes WEEK.md', async () => {
  makeApp('boom-app');
  makeApp('fine-app');
  writePortfolio([opp({ slug: 'boom-app', capital_mid_usd: 90000 }), opp({ slug: 'fine-app' })]);
  const calls = [];
  const invoke = async (a) => {
    calls.push(a.join(' '));
    if (a[0] === 'run' && a[1] === 'boom-app') throw new Error('state.json is corrupt');
    if (a[0] === 'queue') throw new Error('queue broke');
    console.log('ran fine');
    return 0;
  };
  const { value, out } = await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
  assert.equal(value, 0, out);
  assert.ok(calls.includes('run fine-app'), 'the next app still runs');
  const md = readFileSync(join(process.env.FUND_APPS_DIR, 'WEEK.md'), 'utf8');
  assert.match(md, /`node bin\/fund.mjs run boom-app` → exit 1 — ✗ threw: state.json is corrupt/);
  assert.match(md, /queue --json` did not return JSON/);
});

test('regression: failure lines are never hidden behind a trailing hint in the run note', async () => {
  makeApp('hint-app');
  writePortfolio([opp({ slug: 'hint-app' })]);
  const invoke = async (a) => { if (a[0] === 'run') { console.log('✗ draft failed: AI command "x" failed'); console.log('hint: read fit.md'); console.log('next: fund run hint-app'); return 1; } return 0; };
  const { out } = await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
  assert.match(out, /run hint-app\s+✗ draft failed/);
});

test('regression: go refreshes status and next after autopilot ran (WEEK.md is not stale)', async () => {
  makeApp('moving', { next: 'old next step' });
  writePortfolio([opp({ slug: 'moving' })]);
  const invoke = async (a) => {
    if (a[0] === 'run') CORE.updateFrontmatter(join(process.env.FUND_APPS_DIR, 'moving', 'call.md'), { status: 'in-review', next: 'read the draft' });
    return 0;
  };
  await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
  const md = readFileSync(join(process.env.FUND_APPS_DIR, 'WEEK.md'), 'utf8');
  assert.match(md, /\| moving \| DO .*\| in-review \| read the draft \|/);
  assert.doesNotMatch(md, /old next step/);
  assert.match(md, /application\(s\) not in the portfolio, so never planned \(.*fine-app/);
});

test('regression: go refuses a bad FUND_NOW, a missing portfolio and malformed JSON before running anything', async () => {
  const calls = [];
  const invoke = async (a) => { calls.push(a); return 0; };
  const saved = process.env.FUND_NOW;
  process.env.FUND_NOW = 'garbage';
  try {
    const { value, out } = await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
    assert.equal(value, 2);
    assert.match(out, /FUND_NOW="garbage" is not a date/);
  } finally { process.env.FUND_NOW = saved; }
  const savedP = process.env.FUND_PORTFOLIO;
  process.env.FUND_PORTFOLIO = join(tmp, 'nope.json');
  try {
    const { value, out } = await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
    assert.equal(value, 1);
    assert.match(out, /no portfolio file at .*nope.json/);
    writeFileSync(process.env.FUND_PORTFOLIO, '{"opportunities": [ {bad');
    const r2 = await quiet(() => go({ flags: {}, core: CORE, invoke, hasCommand: () => true, pipeline: false }));
    assert.equal(r2.value, 1);
    assert.match(r2.out, /nope.json is not valid JSON/);
    writeFileSync(process.env.FUND_PORTFOLIO, '﻿{"opportunities": []}\r\n');
    assert.deepEqual(P.loadPortfolio().opportunities, [], 'BOM and CRLF are fine');
  } finally { process.env.FUND_PORTFOLIO = savedP; }
  assert.deepEqual(calls, []);
});

test('regression: exclusions catch equity and credit offers but not "no equity" grants; the LAST fenced json wins', () => {
  assert.match(P.exclusionReason({ program: 'X Accelerator', reason: 'remote, $500k for 7% equity' }), /equity/);
  assert.match(P.exclusionReason({ program: 'X', reason: 'remote, $100k in credits' }), /credits/);
  assert.match(P.exclusionReason({ program: 'X', reason: 'AWS credits for startups' }), /credits/);
  assert.equal(P.exclusionReason({ program: 'X', reason: 'remote non-dilutive grant, no equity taken' }), null);
  assert.equal(P.exclusionReason({ program: 'X', reason: 'equity-free remote accelerator' }), null);
  const text = 'Example:\n```json\n[{"source":"example"}]\n```\r\nAnswer:\r\n```JSON\r\n[{"source":"real","opportunity":"YES"}]\r\n```\r\n';
  assert.equal(P.parseTriageJson(text)[0].source, 'real');
  assert.deepEqual(P.parseTriageJson('```json\n[]\n```'), []);
});
