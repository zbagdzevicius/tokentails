import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'fund-pipeline-'));
const apps = join(root, 'apps');
mkdirSync(apps);
const aiLog = join(root, 'ai.log');
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(root, 'TRACKER.md');
process.env.FUND_AI_CMD = `node "${join(HERE, 'fixtures', 'engine-ai.mjs')}"`;
process.env.ENGINE_AI_LOG = aiLog;
delete process.env.FUND_NOW;

const { CORE } = await import('../lib/core.mjs');
const P = await import('../lib/pipeline.mjs');
const { runAI } = await import('../bin/fund.mjs');
const planCmds = (await import('../lib/commands/plan.mjs')).default;
const runCmds = (await import('../lib/commands/run.mjs')).default;
const queueCmds = (await import('../lib/commands/queue.mjs')).default;
const CMD = Object.fromEntries([...planCmds, ...runCmds, ...queueCmds].map((c) => [c.name, c]));

// A test-only track with no checks and no pipeline file, so the default pipeline applies.
const TRACKS = { X: { id: 'X', name: 'Test track', checks: [] } };

const SOURCE = `# Source text — Stub

Stub Program 2026 call. Remote teams welcome. Section 3: projects are scored on quality (50%)
and expected impact (50%). Section 4: the summary is limited to 600 characters. Deadline: rolling.
`;

function scaffold(slug, { source = false, status } = {}) {
  const dir = join(apps, slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vars = { SLUG: slug, PROGRAM: 'Stub Program', TRACK: 'X', TRACK_NAME: 'Test track', FRAME: '', DEADLINE: 'rolling', URL: 'https://example.org/call', CREATED: '2026-09-26' };
  for (const f of readdirSync(CORE.PATHS.templates)) writeFileSync(join(dir, f), CORE.render(readFileSync(join(CORE.PATHS.templates, f), 'utf8'), vars));
  if (source) writeFileSync(join(dir, 'source.md'), SOURCE);
  if (status) CORE.updateFrontmatter(join(dir, 'call.md'), { status });
  return dir;
}

function aiCalls() { return existsSync(aiLog) ? readFileSync(aiLog, 'utf8').trim().split('\n').filter(Boolean) : []; }
function resetLog() { rmSync(aiLog, { force: true }); }

async function capture(fn) {
  const out = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  console.warn = (...a) => out.push(a.join(' '));
  try { const code = await fn(); return { code, text: out.join('\n') }; } finally { Object.assign(console, orig); }
}

function cmd(name, args = [], flags = {}) {
  return capture(() => CMD[name].run({ args, flags, core: CORE, runAI, tracks: TRACKS, invoke: async () => 0 }));
}

async function engine(slug, opts = {}) {
  const steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
  const ctx = P.makeCtx({ slug, core: CORE, runAI, tracks: TRACKS });
  return { steps, ctx, res: await P.runPipeline(steps, ctx, opts) };
}

async function statuses(slug) {
  const steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
  const rows = await P.evaluate(steps, P.makeCtx({ slug, core: CORE, runAI, tracks: TRACKS }));
  return Object.fromEntries(rows.map((r) => [r.step.id, r.status]));
}

function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; process.env[k] = vars[k]; }
  return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

const ids = (res) => res.ran.map((r) => r.id);

// ---------------------------------------------------------------------------------------------

test('defaultSteps follow the contract: ids, kinds, needs, done() and run()', () => {
  assert.deepEqual(P.defaultSteps.map((s) => s.id), ['source', 'extract', 'fit', 'draft', 'check', 'review', 'revise', 'compliance', 'human-read', 'ready', 'submit', 'record-submission']);
  const known = new Set(P.defaultSteps.map((s) => s.id));
  for (const s of P.defaultSteps) {
    assert.ok(['auto', 'ai', 'human'].includes(s.kind), s.id);
    assert.equal(typeof s.done, 'function', s.id);
    assert.equal(typeof s.estimate_h, 'number', s.id);
    if (s.kind === 'human') assert.ok(s.instructions, `${s.id} has instructions`);
    else assert.equal(typeof s.run, 'function', s.id);
    for (const n of s.needs) assert.ok(known.has(n), `${s.id} needs unknown ${n}`);
  }
  assert.deepEqual(P.defaultSteps.filter((s) => s.kind === 'human').map((s) => s.id), ['source', 'human-read', 'submit']);
});

test('a fresh scaffold stops at the source step and plans it as human', async () => {
  scaffold('fresh');
  resetLog();
  const { res } = await engine('fresh');
  assert.equal(res.reason, 'human');
  assert.equal(res.stoppedAt, 'source');
  assert.deepEqual(res.ran, []);
  assert.deepEqual(aiCalls(), []);
  const st = await statuses('fresh');
  assert.equal(st.source, 'human');
  assert.equal(st.extract, 'blocked');
  const refused = await cmd('done', ['fresh', 'source']);
  assert.equal(refused.code, 1);
  assert.match(refused.text, /not done: source\.md still holds only the template/);
});

test('one run takes a pasted call from scaffold to human-read, recording durations', async () => {
  const dir = scaffold('happy', { source: true });
  resetLog();
  const done = await cmd('done', ['happy', 'source'], { 'no-run': true }); // --no-run: this test runs the engine itself
  assert.equal(done.code, 0);
  assert.match(done.text, /✓ happy: source done/);
  assert.match(done.text, /next: fund run happy/);

  const { code, text } = await cmd('run', ['happy']);
  assert.equal(code, 0, text);
  assert.match(text, /✓ extract/);
  assert.match(text, /☐ waiting for a person: human-read/);
  assert.match(text, /next: fund done happy human-read/);
  assert.deepEqual(aiCalls(), ['extract', 'fit', 'draft', 'review', 'compliance']);

  // evidence on disk
  const call = CORE.parseFrontmatter(readFileSync(join(dir, 'call.md'), 'utf8'));
  assert.equal(call.fm.track, 'X', 'extract kept the frontmatter');
  assert.equal(call.fm.status, 'drafting', 'draft moved researching → drafting');
  assert.equal(CORE.parseCriteria(call.body).length, 2);
  assert.match(readFileSync(join(dir, 'fit.md'), 'utf8'), /^# Fit — /);
  assert.doesNotMatch(readFileSync(join(dir, 'draft.md'), 'utf8'), /```/, 'code fence unwrapped');
  const review = readFileSync(join(dir, 'review.md'), 'utf8');
  assert.match(review, /^## Review — \d{4}-\d{2}-\d{2}T/m);
  assert.match(review, /^### Verdict$/m, 'AI headings demoted');
  assert.ok(existsSync(join(dir, 'compliance.md')));

  // state: timestamps, durations, history
  const state = P.readState(dir);
  assert.equal(state.version, 1);
  for (const id of ['extract', 'fit', 'draft', 'review', 'compliance']) {
    const s = state.steps[id];
    assert.equal(s.status, 'done', id);
    assert.equal(typeof s.seconds, 'number', id);
    assert.ok(s.startedAt && s.doneAt && s.runs === 1, id);
  }
  assert.equal(state.steps.source.human, true);
  assert.deepEqual(state.history.map((h) => h.event).slice(0, 3), ['human-done', 'start', 'done']);
});

test('re-running is idempotent: no AI calls, nothing rewritten', async () => {
  const dir = join(apps, 'happy');
  const before = readFileSync(join(dir, 'draft.md'), 'utf8') + readFileSync(join(dir, 'review.md'), 'utf8');
  resetLog();
  const { res } = await engine('happy');
  assert.deepEqual(res.ran, []);
  assert.equal(res.stoppedAt, 'human-read');
  assert.deepEqual(aiCalls(), []);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8') + readFileSync(join(dir, 'review.md'), 'utf8'), before);
});

test('resumes after done: ready, then submit, then record-submission', async () => {
  const dir = join(apps, 'happy');
  const d = await cmd('done', ['happy', 'human-read', '--note'], { note: 'read twice', 'no-run': true });
  assert.equal(d.code, 0);
  let r = await engine('happy');
  assert.deepEqual(ids(r.res), ['ready']);
  assert.equal(r.res.stoppedAt, 'submit');
  assert.equal(CORE.parseFrontmatter(readFileSync(join(dir, 'call.md'), 'utf8')).fm.status, 'ready');

  const q = await cmd('queue');
  assert.match(q.text, /happy · submit/);
  assert.match(q.text, /form: https:\/\/example\.org\/call/);
  assert.match(q.text, /then: fund done happy submit/);

  await cmd('done', ['happy', 'submit'], { 'no-run': true });
  r = await engine('happy');
  assert.deepEqual(ids(r.res), ['record-submission']);
  assert.equal(r.res.reason, 'complete');
  const fm = CORE.parseFrontmatter(readFileSync(join(dir, 'call.md'), 'utf8')).fm;
  assert.equal(fm.status, 'submitted');
  assert.match(String(fm.submitted), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(existsSync(process.env.FUND_TRACKER));
});

test('done refuses auto steps and unknown steps', async () => {
  assert.equal((await cmd('done', ['happy', 'check'])).code, 2);
  assert.equal((await cmd('done', ['happy', 'nope'])).code, 2);
});

test('--dry prints the plan and changes nothing', async () => {
  const dir = scaffold('flags', { source: true });
  resetLog();
  const { code, text } = await cmd('run', ['flags'], { dry: true });
  assert.equal(code, 0);
  assert.match(text, /dry run, nothing executed/);
  assert.match(text, /1\. extract/);
  assert.match(text, /compliance/);
  assert.match(text, /then stops at human-read \(human\)/);
  assert.deepEqual(aiCalls(), []);
  assert.ok(!existsSync(join(dir, '.fund', 'state.json')));
});

test('--no-ai stops before the first ai step; --max and --until bound the run', async () => {
  resetLog();
  let r = await engine('flags', { noAi: true });
  assert.equal(r.res.reason, 'no-ai');
  assert.equal(r.res.stoppedAt, 'extract');
  assert.deepEqual(r.res.ran, []);

  r = await engine('flags', { max: 2 });
  assert.deepEqual(ids(r.res), ['extract', 'fit']);
  assert.equal(r.res.reason, 'max');
  assert.equal(r.res.stoppedAt, 'draft');

  r = await engine('flags', { until: 'check' });
  assert.deepEqual(ids(r.res), ['draft'], 'check passes by detection, so it never needs to run');
  assert.equal(r.res.reason, 'until');

  const t = await cmd('run', ['flags'], { until: 'nope' });
  assert.equal(t.code, 2);
  // auto steps still run with --no-ai once the ai work is done
  assert.deepEqual(aiCalls(), ['extract', 'fit', 'draft']);
});

test('check failures trigger an AI revise, then the loop continues', async () => {
  const dir = scaffold('bad-draft', { source: true });
  await withEnv({ ENGINE_DRAFT: 'bad' }, async () => {
    resetLog();
    const { res } = await engine('bad-draft');
    assert.deepEqual(ids(res), ['extract', 'fit', 'draft', 'check', 'revise', 'review', 'compliance']);
    assert.equal(res.ran[3].ok, false);
    assert.match(res.ran[3].message, /citations/);
    assert.equal(res.stoppedAt, 'human-read');
  });
  assert.match(readFileSync(join(dir, 'draft.md'), 'utf8'), /version: 2/);
  assert.equal(P.readState(dir).steps.revise.runs, 1);
});

test('a REJECT review is revised at most twice, then goes to the human read', async () => {
  const dir = scaffold('harsh', { source: true });
  await withEnv({ ENGINE_REVIEW: 'REJECT' }, async () => {
    resetLog();
    const { res } = await engine('harsh');
    assert.equal(res.stoppedAt, 'human-read');
    assert.deepEqual(aiCalls().filter((k) => k === 'revise' || k === 'review'), ['review', 'revise', 'review', 'revise', 'review']);
  });
  assert.equal((readFileSync(join(dir, 'review.md'), 'utf8').match(/^## Review — /gm) || []).length, 3);
});

test('a revise that cannot fix the check stops with a failure for a person', async () => {
  scaffold('stuck', { source: true });
  await withEnv({ ENGINE_DRAFT: 'bad', ENGINE_REVISE: 'bad' }, async () => {
    const { code, text } = await cmd('run', ['stuck']);
    assert.equal(code, 1);
    assert.match(text, /✗ stopped: check failed/);
    const q = await cmd('queue');
    assert.match(q.text, /✗ stuck · check/);
    assert.match(q.text, /then: fund run stuck/);
  });
});

test('fit NO-GO stops the run, does not re-ask the AI, and can be overruled', async () => {
  scaffold('nogo', { source: true });
  await withEnv({ ENGINE_FIT: 'NO-GO' }, async () => {
    resetLog();
    let { res } = await engine('nogo');
    assert.equal(res.reason, 'failed');
    assert.equal(res.stoppedAt, 'fit');
    assert.match(res.message, /NO-GO/);
    resetLog();
    ({ res } = await engine('nogo'));
    assert.equal(res.stoppedAt, 'fit');
    assert.deepEqual(aiCalls(), [], 'NO-GO is not re-asked while call.md is unchanged');
  });
  const o = await cmd('done', ['nogo', 'fit'], { note: 'gate 2 checked by hand', 'no-run': true });
  assert.equal(o.code, 0);
  const { res } = await engine('nogo', { until: 'draft' });
  assert.deepEqual(ids(res), ['draft']);
});

test('an AI failure is recorded and stops the run', async () => {
  const dir = scaffold('ai-down', { source: true });
  await withEnv({ ENGINE_FAIL: 'draft' }, async () => {
    const { res } = await engine('ai-down');
    assert.deepEqual(ids(res), ['extract', 'fit', 'draft']);
    assert.equal(res.reason, 'failed');
    assert.match(res.message, /forced failure/);
  });
  const s = P.readState(dir);
  assert.equal(s.steps.draft.status, 'failed');
  assert.equal(s.history.at(-1).event, 'fail');
  const n = await cmd('next', ['ai-down']);
  assert.match(n.text, /ai-down → draft/);
  assert.match(n.text, /last run failed: threw: AI command/);
  assert.match(n.text, /next: fund run ai-down/);
});

test('editing the draft after the human read re-opens the read', async () => {
  const dir = join(apps, 'bad-draft');
  await cmd('done', ['bad-draft', 'human-read']);
  assert.equal((await statuses('bad-draft'))['human-read'], 'done');
  const future = new Date(Date.now() + 3600e3);
  utimesSync(join(dir, 'draft.md'), future, future);
  const st = await statuses('bad-draft');
  assert.notEqual(st['human-read'], 'done');
  assert.notEqual(st.review, 'done', 'review is stale too');
});

test('parked applications never run', async () => {
  scaffold('parked', { source: true, status: 'parked' });
  const { res } = await engine('parked');
  assert.equal(res.reason, 'closed');
  assert.deepEqual(res.ran, []);
});

test('plan prints the table, writes PLAN.md and never clobbers a track plan.md', async () => {
  const dir = join(apps, 'flags');
  const { code, text } = await cmd('plan', ['flags']);
  assert.equal(code, 0);
  assert.match(text, /flags {2}· {2}track X/);
  assert.match(text, /✓ extract/);
  assert.match(text, /→ review\s+ai\s+next/);
  assert.match(text, /· human-read\s+human\s+blocked/);
  assert.match(text, /next: fund run flags/);
  const files = readdirSync(dir);
  const plan = files.find((f) => f.toLowerCase() === 'plan.md');
  assert.ok(plan);
  assert.match(readFileSync(join(dir, plan), 'utf8'), /\| 6 \| review — /);

  // a track-owned plan.md (Track C) is left alone; ours goes to .fund/PLAN.md
  writeFileSync(join(dir, plan), '# c:plan output\n');
  await cmd('plan', ['flags']);
  assert.equal(readFileSync(join(dir, plan), 'utf8'), '# c:plan output\n');
  assert.ok(existsSync(join(dir, '.fund', 'PLAN.md')));

  const j = await cmd('plan', ['flags'], { json: true });
  const parsed = JSON.parse(j.text);
  assert.equal(parsed.next.id, 'review');
  assert.equal(parsed.steps.length, 12);

  const all = await cmd('plan', [], { all: true });
  assert.match(all.text, /application\s+status\s+due/);
  assert.match(all.text, /parked\s+.*\(parked\)/);
  assert.match(all.text, /next: fund run /);
});

test('next names the single next step and the exact command', async () => {
  const h = await cmd('next', ['fresh']);
  assert.match(h.text, /fresh → source \(human/);
  assert.match(h.text, /do: Open the funder's call page/);
  assert.match(h.text, /next: fund done fresh source/);
  const done = await cmd('next', ['happy']);
  assert.match(done.text, /every step is done/);
});

test('queue lists human steps across apps with instructions, and --json', async () => {
  const q = await cmd('queue');
  assert.match(q.text, /step\(s\) wait for a person/);
  assert.match(q.text, /fresh · source/);
  assert.match(q.text, /harsh · human-read/);
  assert.doesNotMatch(q.text, /happy ·/, 'submitted apps drop out');
  assert.doesNotMatch(q.text, /parked ·/, 'parked apps drop out');
  const items = JSON.parse((await cmd('queue', [], { json: true })).text);
  assert.ok(items.every((i) => i.command.startsWith('fund ')));
  assert.ok(items.some((i) => i.slug === 'fresh' && i.step === 'source' && i.kind === 'human'));
});

test('queue sorts by deadline, soonest first', async () => {
  scaffold('soon');
  CORE.updateFrontmatter(join(apps, 'soon', 'call.md'), { deadline: new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10) });
  const items = JSON.parse((await cmd('queue', [], { json: true })).text);
  assert.equal(items[0].slug, 'soon');
});

test('stats reports actual seconds per step against the estimate', async () => {
  const s = await cmd('stats', ['happy']);
  assert.equal(s.code, 0);
  assert.match(s.text, /happy/);
  assert.match(s.text, /extract\s+ai\s+1\s+1\s+0\s+\d+\.\d\ds\s+0\.1h/);
  assert.match(s.text, /human-read\s+human/);
  assert.match(s.text, /total: \d+ run\(s\)/);
  const all = JSON.parse((await cmd('stats', [], { json: true })).text);
  assert.ok(all.apps.length >= 3);
  assert.ok(all.totals.runs > 10);
  const none = await cmd('stats', ['fresh']);
  assert.match(none.text, /No pipeline history yet/);
});

test('resolvePipeline loads a track pipeline.mjs and falls back on a broken one', async () => {
  const tdir = join(root, 'tracks-good');
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, 'pipeline.mjs'), `export default function pipeline(steps, h) {
    return h.insertAfter(h.remove(steps, 'fit'), 'draft', { id: 'budget', title: 'Budget', kind: 'auto', estimate_h: 0, needs: ['draft'], done: (ctx) => ({ done: h.fileExists(ctx, 'budget.csv'), reason: 'budget.csv' }), run: async () => ({ ok: true, message: 'x' }) });
  }\n`);
  const bdir = join(root, 'tracks-bad');
  mkdirSync(bdir, { recursive: true });
  writeFileSync(join(bdir, 'pipeline.mjs'), 'export default function pipeline() { return [{ id: "x" }]; }\n');
  scaffold('custom');
  CORE.updateFrontmatter(join(apps, 'custom', 'call.md'), { track: 'G' });
  const good = await P.resolvePipeline({ slug: 'custom', core: CORE, tracks: { G: { id: 'G', dir: tdir } } });
  assert.deepEqual(good.map((s) => s.id).slice(0, 5), ['source', 'extract', 'draft', 'budget', 'check']);
  assert.deepEqual(good.find((s) => s.id === 'draft').needs, ['extract'], 'remove() rewires needs');
  assert.equal(P.defaultSteps.find((s) => s.id === 'draft').needs[0], 'fit', 'defaultSteps untouched');

  CORE.updateFrontmatter(join(apps, 'custom', 'call.md'), { track: 'H' });
  const { text } = await capture(async () => {
    const steps = await P.resolvePipeline({ slug: 'custom', core: CORE, tracks: { H: { id: 'H', dir: bdir } } });
    assert.equal(steps.length, P.defaultSteps.length);
  });
  assert.match(text, /track H pipeline .* failed: .*using the default pipeline/);
});

test('helpers edit step lists without mutating them', () => {
  const s = P.defaultSteps;
  const x = { id: 'x', kind: 'auto', needs: [], done: () => ({ done: true }), run: async () => ({ ok: true }) };
  assert.equal(P.helpers.insertBefore(s, 'draft', x)[3].id, 'x');
  assert.equal(P.helpers.replace(s, 'draft', x)[3].id, 'x');
  assert.equal(s[3].id, 'draft');
  assert.throws(() => P.helpers.remove(s, 'nope'), /no step "nope"/);
});

test('state survives a corrupt file and markHumanDone records history', () => {
  const dir = join(root, 'state-only');
  mkdirSync(join(dir, '.fund'), { recursive: true });
  writeFileSync(join(dir, '.fund', 'state.json'), '{nope');
  assert.deepEqual(P.readState(dir), { version: 1, steps: {}, history: [] });
  P.markHumanDone(dir, 'submit', 'confirmation #1');
  const s = P.readState(dir);
  assert.equal(s.steps.submit.status, 'done');
  assert.equal(s.history[0].event, 'human-done');
  assert.equal(s.history[0].message, 'confirmation #1');
});

// ---------- regressions found by the adversarial validator ----------

test('regression: durations keep millisecond precision (a fast AI call is not recorded as 0 s)', () => {
  const s = P.readState(join(apps, 'happy'));
  for (const id of ['extract', 'fit', 'draft', 'review', 'compliance']) assert.ok(s.steps[id].seconds > 0, `${id} seconds ${s.steps[id].seconds}`);
  assert.ok(s.history.filter((h) => h.event === 'done' && ['extract', 'fit', 'draft', 'review', 'compliance'].includes(h.step)).every((h) => h.seconds > 0));
});

test('regression: --dry does not list steps whose evidence already exists behind a missing upstream step', async () => {
  // Like the example apps: a finished draft, but no fit.md yet. The real run only runs fit, review
  // and compliance; the dry run must say the same, not "draft, check, revise".
  const dir = scaffold('dry-honest', { source: true });
  await engine('dry-honest', { until: 'compliance' });
  for (const f of ['fit.md', 'review.md', 'compliance.md']) rmSync(join(dir, f));
  const { text } = await cmd('run', ['dry-honest'], { dry: true });
  assert.match(text, /1\. fit/);
  assert.doesNotMatch(text, /\d\. (draft|check|revise) /);
  resetLog();
  const { res } = await engine('dry-honest');
  assert.deepEqual(ids(res), ['fit', 'review', 'compliance']);
  const dryIds = [...text.matchAll(/\d\. (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(dryIds, ids(res), 'dry run predicts the real run');
});

test('regression: done refuses a human step whose inputs are not done (no early submit mark)', async () => {
  scaffold('early', { source: true });
  await engine('early'); // stops at human-read
  const r = await cmd('done', ['early', 'submit']);
  assert.equal(r.code, 1);
  assert.match(r.text, /submit cannot be marked done yet: it waits for ready/);
  assert.match(r.text, /next: fund done early human-read/);
  assert.equal(P.readState(join(apps, 'early')).steps.submit, undefined, 'nothing recorded');
  // and the engine never records a submission on its own
  await cmd('done', ['early', 'human-read'], { 'no-run': true });
  const { res } = await engine('early');
  assert.deepEqual(ids(res), ['ready']);
  assert.equal(res.stoppedAt, 'submit');
  assert.equal(CORE.parseFrontmatter(readFileSync(join(apps, 'early', 'call.md'), 'utf8')).fm.status, 'ready');
});

test('regression: malformed state.json (array steps, null history rows, string seconds) is sanitised', async () => {
  const dir = join(apps, 'early');
  writeFileSync(join(dir, '.fund', 'state.json'), JSON.stringify({ steps: [], history: [null, 5, { step: 'x' }, { step: 'fit', event: 'done', seconds: '2', at: '2026-09-26T00:00:00Z' }] }));
  const s = P.readState(dir);
  assert.deepEqual(s.steps, {});
  assert.equal(s.history.length, 2);
  const st = await cmd('stats', ['early']);
  assert.equal(st.code, 0, st.text);
  assert.match(st.text, /fit\s+ai\s+0\s+1\s+0\s+2\.00s/);
  // a human mark written on top of an array "steps" survives the round trip
  P.markHumanDone(dir, 'human-read', 'x');
  assert.equal(P.readState(dir).steps['human-read'].human, true);
});

test('regression: --max needs a whole number; plan --all with no applications is not a usage error', async () => {
  assert.equal((await cmd('run', ['flags'], { max: true })).code, 2);
  assert.equal((await cmd('run', ['flags'], { max: '1.5' })).code, 2);
  const empty = mkdtempSync(join(tmpdir(), 'fund-empty-'));
  const core = { ...CORE, listApps: () => [], PATHS: { ...CORE.PATHS, apps: empty } };
  const r = await capture(() => CMD.plan.run({ args: [], flags: { all: true }, core, runAI, tracks: TRACKS, invoke: async () => 0 }));
  assert.equal(r.code, 0);
  assert.match(r.text, /No applications/);
  assert.match(r.text, /next: fund new/);
});

test('regression: an AI failure mid-run resumes cleanly on the next run, and CRLF files work', async () => {
  const dir = scaffold('crlf', { source: false });
  writeFileSync(join(dir, 'source.md'), SOURCE.replace(/\n/g, '\r\n'));
  writeFileSync(join(dir, 'call.md'), readFileSync(join(dir, 'call.md'), 'utf8').replace(/\n/g, '\r\n'));
  await withEnv({ ENGINE_FAIL: 'review' }, async () => {
    const { res } = await engine('crlf');
    assert.equal(res.reason, 'failed');
    assert.equal(res.stoppedAt, 'review');
  });
  resetLog();
  const { res } = await engine('crlf');
  assert.deepEqual(aiCalls(), ['review', 'compliance'], 'only the failed step and what follows re-run');
  assert.equal(res.stoppedAt, 'human-read');
  assert.equal(P.readState(dir).steps.review.runs, 2);
  assert.equal(CORE.parseFrontmatter(readFileSync(join(dir, 'call.md'), 'utf8')).fm.track, 'X');
});

test('regression: plan --all does not send you to re-run an app whose last run failed', async () => {
  const core = { ...CORE, listApps: () => ['stuck'] };
  const r = await capture(() => CMD.plan.run({ args: [], flags: { all: true }, core, runAI, tracks: TRACKS, invoke: async () => 0 }));
  assert.match(r.text, /stuck .*check \(failed last run\)/);
  assert.match(r.text, /0 app\(s\) have automatable steps; 1 wait for a person/);
  assert.match(r.text, /next: fund queue/);
});
