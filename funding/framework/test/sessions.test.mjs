// fund ↔ orc: every AI step is a tracked Claude Code session. Hermetic: temp FUND_* dirs and
// ORC_HOME, FUND_AI_CMD unset, ORC_CLAUDE_BIN = a fake claude (orc's fake + fund-shaped answers).
// Never runs the real claude, never touches the network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ORC_FAKE = join(ROOT, '..', 'orchestrator', 'test', 'fixtures', 'fake-claude.mjs');
const FUND_FAKE = join(HERE, 'fixtures', 'fund-claude.mjs');
const ANSWERS = `"${process.execPath}" "${join(HERE, 'fixtures', 'engine-ai.mjs')}"`;

const tmp = mkdtempSync(join(tmpdir(), 'fund-sessions-'));
const apps = join(tmp, 'apps');
mkdirSync(apps);
const orcHome = join(tmp, '.orc');
const claudeLog = join(tmp, 'claude.log');
for (const k of Object.keys(process.env)) if (k.startsWith('FUND_') || k.startsWith('ORC_')) delete process.env[k];
Object.assign(process.env, {
  FUND_APPS_DIR: apps, FUND_TRACKER: join(tmp, 'TRACKER.md'), FUND_PORTFOLIO: join(tmp, 'opportunities.json'),
  FUND_NOW: '2026-09-26T12:00:00Z', ORC_HOME: orcHome, ORC_CLAUDE_BIN: FUND_FAKE, FAKE_CLAUDE_LOG: claudeLog,
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const { CORE } = await import('../lib/core.mjs');
const P = await import('../lib/pipeline.mjs');
const { runAI, main } = await import('../bin/fund.mjs');
const TRACKS = { X: { id: 'X', name: 'Test track', checks: [] } }; // no pipeline file: the default steps

function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

async function capture(fn) {
  const out = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  console.warn = (...a) => out.push(a.join(' '));
  try { const code = await fn(); return { code, text: out.join('\n') }; } finally { Object.assign(console, orig); }
}

function sessions() {
  const d = join(orcHome, 'sessions');
  return existsSync(d) ? readdirSync(d).sort().map((id) => JSON.parse(readFileSync(join(d, id, 'meta.json'), 'utf8'))) : [];
}
const byLabel = (label) => sessions().filter((m) => m.label === label);
const calls = () => (existsSync(claudeLog) ? readFileSync(claudeLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function scaffold(slug, { track = 'X', program = 'Stub Program', url = 'https://example.org/call', source } = {}) {
  const dir = join(apps, slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vars = { SLUG: slug, PROGRAM: program, TRACK: track, TRACK_NAME: 'Test track', FRAME: '', DEADLINE: 'rolling', URL: url, CREATED: '2026-09-26' };
  for (const f of readdirSync(CORE.PATHS.templates)) writeFileSync(join(dir, f), CORE.render(readFileSync(join(CORE.PATHS.templates, f), 'utf8'), vars));
  if (source) writeFileSync(join(dir, 'source.md'), source);
  return dir;
}

// ---------------------------------------------------------------------------------------------

test('runAI goes through orc: labelled session, step model, FUND_AI_MODEL default, framework cwd, auto mode', async () => {
  await withEnv({ ORC_CLAUDE_BIN: ORC_FAKE }, () => {
    assert.equal(runAI('hello from fund', { label: 'demo/extract', model: 'haiku' }).trim(), 'OK: hello from fund');
    const [m] = byLabel('demo/extract');
    assert.equal(m.status, 'done');
    assert.equal(m.model, 'haiku');
    assert.equal(m.numTurns, 3);
    assert.ok(m.costUsd > 0 && m.usage.output > 0, 'cost and tokens recorded');
    const c = calls().at(-1);
    assert.equal(c.cwd, ROOT);
    assert.deepEqual(c.argv.slice(0, 6), ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'auto']);
    assert.ok(c.argv.includes('haiku'));
  });
  await withEnv({ ORC_CLAUDE_BIN: ORC_FAKE, FUND_AI_MODEL: 'sonnet' }, () => {
    runAI('no model given', { label: 'demo/fit' });
    assert.equal(byLabel('demo/fit')[0].model, 'sonnet');
    runAI('the step model wins', { label: 'demo/draft', model: 'opus' });
    assert.equal(byLabel('demo/draft')[0].model, 'opus');
    runAI('no label at all');
    assert.equal(byLabel('fund').length, 1);
  });
});

test('runAI failures throw with the session id and "fund logs <id>"; FUND_AI_TIMEOUT becomes orc --timeout', async () => {
  await withEnv({ ORC_CLAUDE_BIN: ORC_FAKE }, () => {
    assert.throws(() => runAI('MODE:error please', { label: 'demo/review' }), /AI session \d{8}-\d{6}-\w+ \(demo\/review\) ended error: .*— see: fund logs \d{8}-/);
    assert.throws(() => runAI('MODE:crash now', { label: 'demo/crash' }), /ended error: .*see: fund logs/);
  });
  const t0 = Date.now();
  await withEnv({ ORC_CLAUDE_BIN: ORC_FAKE, FUND_AI_TIMEOUT: '1' }, () => {
    assert.throws(() => runAI('MODE:hang forever', { label: 'demo/hang' }), /ended timeout.*fund logs/);
  });
  assert.ok(Date.now() - t0 < 15000, 'the timeout stopped it');
  assert.equal(byLabel('demo/hang')[0].status, 'timeout');
});

test('FUND_AI_CMD set: the old pipe-to-command behaviour, no session', async () => {
  const before = sessions().length;
  await withEnv({ FUND_AI_CMD: `"${process.execPath}" -e "process.stdout.write('cmd:' + require('fs').readFileSync(0, 'utf8'))"` }, () => {
    assert.equal(runAI('piped', { label: 'demo/x', model: 'opus' }), 'cmd:piped');
  });
  assert.equal(sessions().length, before);
});

test('the engine labels every AI session "<slug>/<step>" with the step model', async () => {
  const slug = 'eng';
  scaffold(slug, { source: '# Source\n\nStub Program 2026 call. Remote teams welcome. Section 3: projects are scored on quality (50%) and expected impact (50%). Section 4: the summary is limited to 600 characters.\n' });
  await withEnv({ FUND_FAKE_ANSWERS: ANSWERS }, async () => {
    const steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
    const ctx = P.makeCtx({ slug, core: CORE, tracks: TRACKS }); // no runAI: the default backend (orc)
    const res = await P.runPipeline(steps, ctx, { until: 'fit' });
    assert.deepEqual(res.ran.map((r) => [r.id, r.ok]), [['extract', true], ['fit', true]], JSON.stringify(res.ran));
  });
  assert.equal(byLabel('eng/extract').length, 1);
  assert.equal(byLabel('eng/extract')[0].model, 'haiku');
  assert.equal(byLabel('eng/fit')[0].model, 'haiku');
  assert.match(readFileSync(join(apps, slug, 'call.md'), 'utf8'), /\| C1 \| Quality/);
});

test('agentic source: a session fetches the call page into source.md, then extract runs', async () => {
  const slug = 'agent-src';
  const dir = scaffold(slug, { program: 'Agent Program', url: 'https://example.org/agent-call' });
  let steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
  const src = steps.find((s) => s.id === 'source');
  assert.equal(src.kind, 'ai');
  assert.equal(src.model, 'sonnet');
  assert.match(src.title, /Fetch the call text/);
  await withEnv({ FUND_FAKE_ANSWERS: ANSWERS }, async () => {
    const res = await P.runPipeline(steps, P.makeCtx({ slug, core: CORE, tracks: TRACKS }), { until: 'extract' });
    assert.deepEqual(res.ran.map((r) => [r.id, r.ok]), [['source', true], ['extract', true]], JSON.stringify(res.ran));
  });
  const text = readFileSync(join(dir, 'source.md'), 'utf8');
  assert.match(text, /Agent Program 2026 call/);
  assert.match(text, /\(https:\/\/example\.org\/agent-call\)/);
  const call = calls().find((c) => c.prompt.includes(join(dir, 'source.md')));
  assert.match(call.prompt, /https:\/\/example\.org\/agent-call/);
  assert.match(call.prompt, /Never submit, sign/);
  assert.equal(byLabel('agent-src/source')[0].tools.Write, 1);
  // source.md now has real text: the step is the plain (human-kind) step again, and done
  steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
  assert.equal(steps.find((s) => s.id === 'source').kind, 'human');
  const rows = await P.evaluate(steps, P.makeCtx({ slug, core: CORE, tracks: TRACKS }));
  assert.equal(rows.find((r) => r.step.id === 'source').status, 'done');
});

test('agentic source that writes nothing fails once, then the step stays human with the old instructions', async () => {
  const slug = 'agent-empty';
  scaffold(slug);
  await withEnv({ FUND_FAKE_SOURCE: 'empty' }, async () => {
    const steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
    const res = await P.runPipeline(steps, P.makeCtx({ slug, core: CORE, tracks: TRACKS }));
    assert.equal(res.reason, 'failed');
    assert.match(res.message, /wrote 0 chars to source\.md — paste it yourself: Open the funder's call page/);
  });
  const steps = await P.resolvePipeline({ slug, core: CORE, tracks: TRACKS });
  assert.equal(steps.find((s) => s.id === 'source').kind, 'human');
  const res = await P.runPipeline(steps, P.makeCtx({ slug, core: CORE, tracks: TRACKS }));
  assert.equal(res.reason, 'human');
  assert.equal(res.stoppedAt, 'source');
  assert.equal(byLabel('agent-empty/source').length, 1, 'no second fetch');
  // no url, or FUND_AI_CMD set: never agentic
  scaffold('no-url', { url: '' });
  assert.equal((await P.resolvePipeline({ slug: 'no-url', core: CORE, tracks: TRACKS })).find((s) => s.id === 'source').kind, 'human');
  scaffold('cmd-ai');
  await withEnv({ FUND_AI_CMD: 'false' }, async () => {
    assert.equal((await P.resolvePipeline({ slug: 'cmd-ai', core: CORE, tracks: TRACKS })).find((s) => s.id === 'source').kind, 'human');
  });
});

test('track pipelines that override source keep the agent (Track A) and every track still resolves', async () => {
  const tracks = await CORE.loadTracks();
  for (const t of ['A', 'B', 'C', 'D', 'E']) {
    const slug = `trk-${t.toLowerCase()}`;
    scaffold(slug, { track: t });
    const steps = await P.resolvePipeline({ slug, core: CORE, tracks });
    assert.ok(steps.length > 3, t);
    const src = steps.find((s) => s.id === 'source');
    if (src) assert.ok(['ai', 'human'].includes(src.kind), t);
  }
  const a = (await P.resolvePipeline({ slug: 'trk-a', core: CORE, tracks })).find((s) => s.id === 'source');
  assert.equal(a.kind, 'ai');
  assert.match(String(a.done), /program profile/, 'Track A keeps its own done()');
});

test('fund ps / logs / stats show the sessions per app and step', async () => {
  const ps = await capture(() => main(['ps', 'eng']));
  assert.equal(ps.code, 0);
  assert.match(ps.text, /eng\/extract +done/);
  assert.match(ps.text, /eng\/fit +done/);
  assert.doesNotMatch(ps.text, /demo\//);
  assert.match(ps.text, /next: fund logs \d{8}-/);
  const all = await capture(() => main(['ps', '--all']));
  assert.match(all.text, /demo\/hang +timeout/);
  const id = byLabel('eng/extract')[0].id;
  const logs = await capture(() => main(['logs', id]));
  assert.equal(logs.code, 0);
  assert.match(logs.text, /eng\/extract/);
  assert.match(logs.text, /\[init\] session/);
  assert.match(logs.text, /→ Bash\(ls -la\)/);
  assert.match(logs.text, /\[result success\] 3 turns · \$0\.01/);
  assert.match(logs.text, /next: fund orc resume/);
  const stats = await capture(() => main(['stats', 'eng']));
  assert.equal(stats.code, 0);
  assert.match(stats.text, /sess +cost +tokens +turns/);
  assert.match(stats.text, /extract +ai +1 +1 +0 +\S+s +0\.1h +1 +\$0\.0123 +11\.3k +3/);
  assert.match(stats.text, /ai: 2 Claude Code session\(s\), \$0\.0246, 22\.7k tokens, 6 turns/);
  const j = JSON.parse((await capture(() => main(['stats', 'agent-src', '--json']))).text);
  assert.equal(j.apps[0].rows.find((r) => r.id === 'source').ai.sessions, 1);
  assert.equal(j.apps[0].rows.find((r) => r.id === 'source').kind, 'ai', 'the fetch ran as an ai step');
  const watch = await capture(() => main(['watch', '--once']));
  assert.equal(watch.code, 0);
  assert.match(watch.text, /fund watch|orc watch · /);
});

test('go --parallel 2 runs two applications at once (each sequential), with a live summary', async () => {
  for (const s of readdirSync(apps)) rmSync(join(apps, s), { recursive: true, force: true });
  const opp = (id, slug) => ({ id, program: `Parallel Grant ${id}`, track: 'D', slug, url: `https://example.org/${slug}`, deadline: '2026-12-01', capital_mid_usd: 20000, success: 0.3, framework_hours: 3, verdict: 'DO', condition: '', frame: '', notes: '' });
  writeFileSync(process.env.FUND_PORTFOLIO, JSON.stringify({ version: 1, as_of: '2026-09-26', opportunities: [opp(1, 'par-one'), opp(2, 'par-two')] }));
  const res = await withEnv({ FUND_FAKE_SLEEP: '1200', FUND_FAKE_ANSWERS: ANSWERS, FUND_GO_TICK: '1' }, () => capture(() => main(['go', '--scaffold', '--parallel', '2'])));
  assert.equal(res.code, 0, res.text);
  assert.match(res.text, /parallel 2: 2 application\(s\), one process each — track the AI sessions: fund watch/);
  assert.match(res.text, /▶ run par-one +started/);
  assert.match(res.text, /▶ run par-two +started · 2 running/);
  assert.match(res.text, /2\/2 done · 0 queued/);
  const one = sessions().filter((m) => m.label.startsWith('par-one/'));
  const two = sessions().filter((m) => m.label.startsWith('par-two/'));
  assert.ok(one.length >= 2 && two.length >= 2, `sessions: ${sessions().map((m) => m.label).join(', ')}`);
  assert.deepEqual(one.map((m) => m.label).slice(0, 2), ['par-one/source', 'par-one/extract']);
  const span = (list) => [Math.min(...list.map((m) => Date.parse(m.startedAt))), Math.max(...list.map((m) => Date.parse(m.endedAt)))];
  const [a0, a1] = span(one); const [b0, b1] = span(two);
  assert.ok(a0 < b1 && b0 < a1, 'the two apps ran at the same time');
  const seq = (list) => list.every((m, i) => i === 0 || Date.parse(list[i - 1].endedAt) <= Date.parse(m.startedAt));
  assert.ok(seq(one) && seq(two), 'each app ran its steps one after another');
  assert.match(readFileSync(join(apps, 'par-one', 'source.md'), 'utf8'), /Parallel Grant 1 2026 call/);
  assert.match(readFileSync(join(apps, 'WEEK.md'), 'utf8'), /par-one/);
});

test('go --parallel 2 interrupted: running sessions are killed (whole tree), queued apps never start, exit 130', async () => {
  const { spawn } = await import('node:child_process');
  for (const s of readdirSync(apps)) rmSync(join(apps, s), { recursive: true, force: true });
  const opp = (id, slug) => ({ id, program: `Stop Grant ${id}`, track: 'D', slug, url: `https://example.org/${slug}`, deadline: '2026-12-01', capital_mid_usd: 20000, success: 0.3, framework_hours: 3, verdict: 'DO', condition: '', frame: '', notes: '' });
  writeFileSync(process.env.FUND_PORTFOLIO, JSON.stringify({ version: 1, as_of: '2026-09-26', opportunities: [opp(1, 'stop-one'), opp(2, 'stop-two'), opp(3, 'stop-three')] }));
  const child = spawn(process.execPath, [join(ROOT, 'bin', 'fund.mjs'), 'go', '--scaffold', '--parallel', '2'], {
    env: { ...process.env, FUND_FAKE_SLEEP: '20000', FUND_FAKE_ANSWERS: ANSWERS, FUND_GO_TICK: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { out += b; });
  const exited = new Promise((r) => child.on('close', (code) => r(code)));
  const live = () => sessions().filter((m) => m.label.startsWith('stop-') && m.status === 'running' && m.numTurns >= 2);
  const until = Date.now() + 15000;
  while (live().length < 2 && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  assert.equal(live().length, 2, `two sessions running before the interrupt:\n${out}`);
  const grandchildren = [];
  for (const m of live()) {
    const ev = readFileSync(join(orcHome, 'sessions', m.id, 'events.jsonl'), 'utf8');
    const pid = Number(/grandchild (\d+)/.exec(ev)?.[1]);
    if (pid) grandchildren.push(pid);
  }
  assert.equal(grandchildren.length, 2, 'the fake claude printed its grandchild pids');
  const t0 = Date.now();
  child.kill('SIGINT'); // only go itself, not its process group
  const code = await exited;
  assert.ok(Date.now() - t0 < 10000, 'stopped promptly, not after the 20 s sessions');
  assert.equal(code, 130, out);
  assert.match(out, /interrupted — stopping 2 running application\(s\), not starting 1 queued/);
  assert.doesNotMatch(out, /▶ run stop-three/);
  const mine = sessions().filter((m) => m.label.startsWith('stop-'));
  assert.deepEqual(mine.map((m) => m.status).sort(), ['killed', 'killed'], mine.map((m) => `${m.label} ${m.status}`).join(', '));
  assert.ok(!mine.some((m) => m.label.startsWith('stop-three/')));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const deadline = Date.now() + 5000;
  const pids = [...grandchildren, ...mine.map((m) => m.pid), ...mine.map((m) => m.runnerPid)];
  while (pids.some(alive) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(pids.filter(alive), [], 'no claude, orc exec or grandchild left running');
});

test('runAI when orc cannot start a session: a clear error in fund terms', async () => {
  await withEnv({ ORC_CLAUDE_BIN: join(tmp, 'no-such-claude') }, () => {
    assert.throws(() => runAI('hi', { label: 'demo/missing' }), (e) => /AI session "demo\/missing" did not run: .*does not exist/.test(e.message) && !/next: orc /.test(e.message) && /fund orc help/.test(e.message));
  });
});
