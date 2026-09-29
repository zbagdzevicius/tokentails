// Golden path — the seams between the engine (plan/run/done/queue), fund loop, fund verify, fund go
// and the track pipelines. Hermetic: temp apps, tracker, facts copy, Track A/E state; the AI is the
// deterministic stub test/fixtures/pipelines-ai.mjs. No network (Track E state is pre-seeded fresh).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'fund-golden-'));
const apps = join(root, 'apps');
mkdirSync(apps);
const aiLog = join(root, 'ai.log');
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(root, 'TRACKER.md');
process.env.FUND_FACTS = join(root, 'FACTS.md');
copyFileSync(join(HERE, '..', 'facts', 'FACTS.md'), process.env.FUND_FACTS);
process.env.FUND_AI_CMD = `node "${join(HERE, 'fixtures', 'pipelines-ai.mjs')}"`;
process.env.PIPE_STUB_LOG = aiLog;
process.env.FUND_A_DEPLOYMENTS = join(root, 'deployments.json');
process.env.FUND_E_WATCHLIST = join(root, 'watchlist.json');
process.env.FUND_E_STATE = join(root, 'e-state.json');
process.env.FUND_E_CHANGES = join(root, 'E-CHANGES.md');
process.env.FUND_PORTFOLIO = join(root, 'opportunities.json');
delete process.env.FUND_NOW;
writeFileSync(process.env.FUND_A_DEPLOYMENTS, '[]\n');
writeFileSync(process.env.FUND_E_WATCHLIST, JSON.stringify([{ id: 'src-a', url: 'http://127.0.0.1:9/never-fetched', kind: 'html' }]));
writeFileSync(process.env.FUND_E_STATE, JSON.stringify({ 'src-a': { lastChecked: new Date().toISOString(), value: { items: [] } } }));
after(() => rmSync(root, { recursive: true, force: true }));

const { CORE } = await import('../lib/core.mjs');
const P = await import('../lib/pipeline.mjs');
const { runAI, main } = await import('../bin/fund.mjs');
const { scanSecrets } = await import('../lib/verify.mjs');
const TRACKS = await CORE.loadTracks();
const CMD = Object.fromEntries((await Promise.all(['plan', 'run', 'queue', 'loop'].map((m) => import(`../lib/commands/${m}.mjs`))))
  .flatMap((m) => [].concat(m.default)).map((c) => [c.name, c]));
// test-only track with no checks and no pipeline file: the default pipeline applies
const XT = { ...TRACKS, X: { id: 'X', name: 'Test track', checks: [] } };

async function quiet(fn) {
  const out = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  console.warn = (...a) => out.push(a.join(' '));
  try { const code = await fn(); return { code, text: out.join('\n') }; } finally { Object.assign(console, orig); }
}
const fund = (...argv) => quiet(() => main(argv));
const cmd = (name, args = [], flags = {}, tracks = XT) => quiet(() => CMD[name].run({ args, flags, core: CORE, runAI, tracks, invoke: (a) => main(a) }));
const setFm = (slug, patch) => CORE.updateFrontmatter(join(apps, slug, 'call.md'), patch);
const aiCalls = () => (existsSync(aiLog) ? readFileSync(aiLog, 'utf8').trim().split('\n').filter(Boolean) : []);
const resetLog = () => rmSync(aiLog, { force: true });
const ctxFor = (slug, tracks = XT) => P.makeCtx({ slug, core: CORE, runAI, invoke: (a) => main(a), tracks, flags: {} });
async function rows(slug, tracks = XT) { const s = await P.resolvePipeline({ slug, core: CORE, tracks }); return { steps: s, rows: await P.evaluate(s, ctxFor(slug, tracks)) }; }
async function row(slug, id, tracks = XT) { return (await rows(slug, tracks)).rows.find((r) => r.step.id === id); }

const SOURCE = `# Source text — Stub

Stub Program 2026 call. Remote teams welcome. Section 3: projects are scored on quality (50%)
and expected impact (50%). Section 4: the summary is limited to 600 characters. Deadline: rolling.
`;

function scaffoldX(slug) {
  const dir = join(apps, slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vars = { SLUG: slug, PROGRAM: 'Stub Program', TRACK: 'X', TRACK_NAME: 'Test track', FRAME: '', DEADLINE: 'rolling', URL: 'https://example.org/call', CREATED: '2026-09-26' };
  for (const f of readdirSync(CORE.PATHS.templates)) writeFileSync(join(dir, f), CORE.render(readFileSync(join(CORE.PATHS.templates, f), 'utf8'), vars));
  writeFileSync(join(dir, 'source.md'), SOURCE);
  return dir;
}
async function scaffold(slug, track) {
  rmSync(join(apps, slug), { recursive: true, force: true });
  await quiet(() => CORE.scaffold(slug, { track, program: 'Stub Program', url: 'https://example.org/call', deadline: 'rolling' }));
  return join(apps, slug);
}

// ---------- core requests applied ----------

test('core honours FUND_FACTS and runChecks can preview the strict gates without writing', async () => {
  assert.equal(CORE.PATHS.facts, process.env.FUND_FACTS);
  const dir = scaffoldX('gp-strict');
  const unverified = [...CORE.loadFacts().facts.values()].find((f) => f.status === 'unverified')?.id;
  assert.ok(unverified, 'the facts copy has an unverified fact');
  writeFileSync(join(dir, 'draft.md'), `---\nprogram: "Stub"\n---\n## Summary <!-- criterion: C1 -->\nWe have 1,000 players [${unverified}].\n`);
  const soft = (await CORE.runChecks('gp-strict', { tracks: XT })).results.find((r) => r.name === 'facts-soft');
  const strict = (await CORE.runChecks('gp-strict', { tracks: XT, status: 'ready' })).results.find((r) => r.name === 'facts-soft');
  assert.equal(soft.level, 'warn');
  assert.equal(strict.level, 'error');
  assert.equal(CORE.loadApp('gp-strict').call.fm.status, 'researching', 'nothing written');
  // the human read names what `ready` will refuse, so it is fixed in the same sitting
  const hr = await row('gp-strict', 'human-read');
  assert.match(hr.reason, /also fix before ready \(strict gates\): .*facts-soft/);
});

// ---------- next-step hints ----------

test('human steps print their real action: a:deploy, a:record, d:post, d:log; noOverride falls back to fund run', async () => {
  await scaffold('gp-a', 'A');
  setFm('gp-a', { chain: 'base', mainnet_required: true });
  const a = await rows('gp-a', TRACKS);
  const ctxA = ctxFor('gp-a', TRACKS);
  assert.equal(P.humanCommand('gp-a', a.rows.find((r) => r.step.id === 'deploy'), ctxA), 'fund a:deploy base mainnet');
  assert.equal(P.humanCommand('gp-a', a.rows.find((r) => r.step.id === 'record'), ctxA), 'fund a:record base mainnet <address> --tx <hash>');

  await scaffold('gp-d', 'D');
  const d = await rows('gp-d', TRACKS);
  assert.match(P.humanCommand('gp-d', d.rows.find((r) => r.step.id === 'post'), ctxFor('gp-d', TRACKS)), /^fund d:post gp-d --url <thread-url>/);
  assert.match(P.humanCommand('gp-d', d.rows.find((r) => r.step.id === 'sponsor-hunt'), ctxFor('gp-d', TRACKS)), /^fund d:log gp-d --who/);
  assert.equal(P.humanCommand('gp-d', d.rows.find((r) => r.step.id === 'budget'), ctxFor('gp-d', TRACKS)), 'fund run gp-d');

  await scaffold('gp-c', 'C');
  const c = await rows('gp-c', TRACKS);
  assert.equal(P.humanCommand('gp-c', c.rows.find((r) => r.step.id === 'annex-files'), ctxFor('gp-c', TRACKS)), 'fund run gp-c');
  assert.equal(P.humanCommand('gp-c', c.rows.find((r) => r.step.id === 'source'), ctxFor('gp-c', TRACKS)), 'fund done gp-c source', 'source says "Then run: fund done", which re-checks the paste');

  // and the commands that print them agree: plan's next line and the queue's then: line
  const plan = await fund('next', 'gp-d');
  assert.doesNotMatch(plan.text, /next: fund done gp-d budget/);
  const q = JSON.parse((await fund('queue', '--json')).text);
  for (const i of q.filter((x) => x.kind === 'human')) {
    const s = (await P.resolvePipeline({ slug: i.slug, core: CORE, tracks: TRACKS })).find((x) => x.id === i.step);
    if (s?.noOverride && i.command.startsWith(`fund done ${i.slug} ${i.step}`)) assert.match(P.instructionsOf(s, ctxFor(i.slug, TRACKS)), new RegExp(`fund done ${i.slug} ${i.step}`), `${i.slug}/${i.step}`);
  }
});

// ---------- done continues ----------

test('fund done continues with fund run; a blocker that is only stale automation is re-run first', async () => {
  const dir = scaffoldX('gp-flow');
  resetLog();
  const d1 = await cmd('done', ['gp-flow', 'source']);
  assert.equal(d1.code, 0, d1.text);
  assert.match(d1.text, /→ continuing: fund run gp-flow/);
  assert.match(d1.text, /✓ extract/);
  assert.match(d1.text, /☐ waiting for a person: human-read/);
  assert.deepEqual(aiCalls(), ['extract', 'fit', 'draft', 'review', 'compliance']);

  // compliance.md goes stale (older than draft.md): human-read is blocked by an ai step
  const old = new Date(Date.now() - 3600e3);
  utimesSync(join(dir, 'compliance.md'), old, old);
  assert.equal((await row('gp-flow', 'human-read')).blocked, true);
  resetLog();
  const d2 = await cmd('done', ['gp-flow', 'human-read']);
  assert.equal(d2.code, 0, d2.text);
  assert.match(d2.text, /human-read waits for compliance \(automatable\) — running them first/);
  assert.match(d2.text, /✓ gp-flow: human-read done/);
  assert.match(d2.text, /✓ ready/);
  assert.match(d2.text, /next: fund done gp-flow submit/);
  assert.deepEqual(aiCalls(), ['compliance']);

  const d3 = await cmd('done', ['gp-flow', 'submit']);
  assert.match(d3.text, /✓ record-submission/);
  assert.equal(CORE.loadApp('gp-flow').call.fm.status, 'submitted');
  const nx = await cmd('next', ['gp-flow']);
  assert.match(nx.text, /every step is done/);
});

test('--no-run keeps the old behaviour: mark only', async () => {
  scaffoldX('gp-norun');
  resetLog();
  const d = await cmd('done', ['gp-norun', 'source'], { 'no-run': true });
  assert.match(d.text, /next: fund run gp-norun/);
  assert.deepEqual(aiCalls(), []);
});

// ---------- loop ↔ pipeline ----------

test('a fund loop round counts as the current review; loop refuses ready apps and Track B', async () => {
  const dir = scaffoldX('gp-loop');
  await cmd('run', ['gp-loop']); // → human-read, with a plain review round
  resetLog();
  const l = await cmd('loop', ['gp-loop', '--rounds', '1'], { rounds: '1' });
  assert.equal(l.code, 0, l.text);
  assert.ok(aiCalls().includes('review-scored'), 'a partial plain-review score is not carried; the loop reviews');
  assert.match(l.text, /next: node bin\/fund\.mjs run gp-loop/);
  assert.match(readFileSync(join(dir, 'review.md'), 'utf8'), /^## Review — \S+ loop round 1$/m);
  const rv = await row('gp-loop', 'review');
  assert.equal(rv.done, true, `the default review step reads loop rounds: ${rv.reason}`);

  setFm('gp-loop', { status: 'ready' });
  const refused = await cmd('loop', ['gp-loop']);
  assert.equal(refused.code, 2);
  assert.match(refused.text, /is ready: a person already read and approved/);

  await scaffold('gp-b', 'B');
  const b = await fund('loop', 'gp-b');
  assert.equal(b.code, 2);
  assert.match(b.text, /track B does not use fund loop/);
});

test('a reverted loop autofix leaves draft.md mtime alone (no false "draft changed")', async () => {
  const dir = scaffoldX('gp-revert');
  await cmd('run', ['gp-revert']);
  // limit the first section to its length + 2: the stub autofix appends a sentence, check fails, loop reverts
  const first = CORE.loadApp('gp-revert').sections[0];
  const text = readFileSync(join(dir, 'draft.md'), 'utf8').replace(/limit: \d+/, `limit: ${first.chars + 2}`);
  writeFileSync(join(dir, 'draft.md'), text);
  const t = new Date(Date.now() - 60e3);
  utimesSync(join(dir, 'draft.md'), t, t);
  const before = statSync(join(dir, 'draft.md')).mtimeMs;
  const l = await cmd('loop', ['gp-revert', '--rounds', '1'], { rounds: '1' }); // the plain review scored C1 only (below target), so round 1 autofixes
  assert.match(l.text, /reverted/, l.text);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), text);
  assert.ok(Math.abs(statSync(join(dir, 'draft.md')).mtimeMs - before) < 2, 'mtime restored (to the millisecond)');
});

// ---------- engine ----------

test('runPipeline reports a failure even when the run then stops at a human step (exit 1)', async () => {
  scaffoldX('gp-fail');
  const steps = [
    { id: 'a', title: 'A', kind: 'ai', estimate_h: 0, needs: [], done: () => ({ done: false, reason: 'no' }), run: async () => ({ ok: false, message: 'AI down' }) },
    { id: 'b', title: 'B', kind: 'auto', estimate_h: 0, needs: [], done: (ctx) => ({ done: existsSync(join(ctx.dir, 'b.txt')), reason: 'b' }), run: async (ctx) => { writeFileSync(join(ctx.dir, 'b.txt'), 'x'); return { ok: true, message: 'b' }; } },
    { id: 'h', title: 'H', kind: 'human', estimate_h: 0, needs: ['b'], instructions: 'do it', done: () => ({ done: false, reason: 'waiting' }) },
  ];
  const res = await P.runPipeline(steps, ctxFor('gp-fail'));
  assert.equal(res.reason, 'human');
  assert.deepEqual(res.failures.map((f) => f.id), ['a']);
});

test('Track E: a parked monitor still scans, waits without entering the queue, and is not "closed"', async () => {
  const dir = await scaffold('gp-e', 'E');
  setFm('gp-e', { watch: ['src-a'], revisit: '2099-01-01' });
  assert.equal(CORE.loadApp('gp-e').call.fm.status, 'parked');
  const r = await fund('run', 'gp-e');
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /⧗ waiting: wait/);
  assert.doesNotMatch(r.text, /status is parked — nothing to run/);
  const q = JSON.parse((await fund('queue', '--json')).text);
  assert.ok(!q.some((i) => i.slug === 'gp-e'), 'nobody acts on a wait step');
  const all = await fund('plan', '--all');
  assert.match(all.text, /gp-e\s+parked.*⧗ wait/);
  const loop = await fund('loop', 'gp-e');
  assert.match(loop.text, /track E does not use fund loop/);
  void dir;
});

// ---------- verify ----------

test('verify does not scan .fund/ engine state for secrets, but still scans draft.v*.md backups', async () => {
  const dir = scaffoldX('gp-verify');
  mkdirSync(join(dir, '.fund'), { recursive: true });
  const fake = `sk-ant-${'a'.repeat(30)}`;
  writeFileSync(join(dir, '.fund', 'loop.json'), JSON.stringify({ runs: [{ note: fake }] }));
  assert.equal(scanSecrets(dir).length, 0);
  writeFileSync(join(dir, 'draft.v1.md'), `old draft ${fake}\n`);
  assert.deepEqual(scanSecrets(dir).map((h) => h.file), ['draft.v1.md']);
});
