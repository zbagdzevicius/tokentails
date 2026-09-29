import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setup, waitFor, pidAlive, grandchildPid, ORC } from './helpers.mjs';
import { runSession, execSync, resolveClaude, readSession } from '../lib/orc.mjs';
import { lineSplitter } from '../lib/session.mjs';

const t = setup();
after(() => t.cleanup());

const only = (before) => { const now = t.sessions(); const add = now.filter((x) => !before.includes(x)); assert.equal(add.length, 1); return add[0]; };

test('exec success: result on stdout, full meta and files recorded', () => {
  const before = t.sessions();
  const r = t.orc(['exec', '--label', 'ok', '--model', 'opus', '--budget', '0.5'], { input: 'Say hi\nsecond line' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OK: Say hi\n');
  assert.match(r.stderr, /next: orc logs /);
  const id = only(before);
  assert.match(id, /^\d{8}-\d{6}-[0-9a-f]{4}$/);
  const m = t.meta(id);
  assert.equal(m.status, 'done');
  assert.equal(m.label, 'ok');
  assert.equal(m.mode, 'auto');
  assert.equal(m.model, 'opus');
  assert.match(m.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(m.numTurns, 3);
  assert.equal(m.costUsd, 0.0123);
  assert.deepEqual(m.usage, { input: 1200, output: 340, cacheRead: 9000, cacheWrite: 800 });
  assert.deepEqual(m.tools, { Bash: 1 });
  assert.equal(typeof m.durationMs, 'number');
  assert.ok(m.endedAt && m.startedAt);
  assert.equal(t.file(id, 'prompt.md'), 'Say hi\nsecond line');
  assert.equal(t.file(id, 'result.md'), 'OK: Say hi');
  const lines = t.file(id, 'events.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((e) => e.type), ['system', 'system', 'assistant', 'assistant', 'user', 'rate_limit_event', 'result']);
  const argv = t.claudeCalls().at(-1).argv;
  assert.deepEqual(argv, ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'auto', '--model', 'opus', '--max-budget-usd', '0.5']);
});

test('exec --json and ORC_PERMISSION_MODE', () => {
  const r = t.orc(['exec', '--json'], { input: 'json please' });
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.result, 'OK: json please');
  assert.equal(j.meta.status, 'done');
  process.env.ORC_PERMISSION_MODE = 'plan';
  const res = execSync('via library', { store: t.store });
  delete process.env.ORC_PERMISSION_MODE;
  assert.equal(res.ok, true);
  assert.equal(res.result, 'OK: via library');
  assert.equal(res.meta.mode, 'plan');
});

test('exec error result → status error, exit 1', () => {
  const before = t.sessions();
  const r = t.orc(['exec'], { input: 'MODE:error please' });
  assert.equal(r.status, 1);
  const m = t.meta(only(before));
  assert.equal(m.status, 'error');
  assert.match(m.error, /error_during_execution: Tool permission denied/);
  assert.equal(m.costUsd, 0.0123);
});

test('crash with no result → error with the last stderr lines', () => {
  const before = t.sessions();
  const r = t.orc(['exec'], { input: 'MODE:crash' });
  assert.equal(r.status, 1);
  const m = t.meta(only(before));
  assert.equal(m.status, 'error');
  assert.equal(m.exitCode, 2);
  assert.match(m.error, /no result event \(exit code 2/);
  assert.match(m.error, /fatal: something broke inside claude/);
  assert.match(r.stderr, /fatal: something broke/);
});

test('garbage lines and split multibyte writes are tolerated', () => {
  const before = t.sessions();
  const r = t.orc(['exec'], { input: 'MODE:garbage' });
  assert.equal(r.status, 0, r.stderr);
  const id = only(before);
  const { events, meta } = readSession(id, { store: t.store });
  assert.equal(meta.status, 'done');
  const raw = events.filter((e) => e.type === 'orc_raw').map((e) => e.text);
  assert.deepEqual(raw, ['this is not json', '{"broken": ']);
  assert.ok(events.some((e) => e.message?.content?.[0]?.text === 'split across writes — ünïcødé ✓'));
});

test('huge output is streamed and stored', () => {
  const before = t.sessions();
  const r = t.orc(['exec', '--json'], { input: 'MODE:huge' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.length, 5 + 1024 * 1024);
  const id = only(before);
  assert.ok(statSync(join(t.store, 'sessions', id, 'events.jsonl')).size > 3_000_000);
  assert.equal(t.meta(id).status, 'done');
});

test('timeout kills the whole process tree and records timeout', async () => {
  const before = t.sessions();
  const t0 = Date.now();
  const r = t.orc(['exec', '--timeout', '1'], { input: 'MODE:hang' });
  assert.equal(r.status, 1);
  assert.ok(Date.now() - t0 < 10_000);
  const id = only(before);
  const m = t.meta(id);
  assert.equal(m.status, 'timeout');
  assert.match(m.error, /timed out after 1s/);
  const g = grandchildPid(t.file(id, 'events.jsonl'));
  assert.ok(g);
  await waitFor(() => !pidAlive(g), { timeout: 5000 });
  assert.equal(pidAlive(m.pid), false);
});

test('meta.json is updated live while the session runs', async () => {
  const before = t.sessions();
  const child = t.orcAsync(['exec', '--label', 'live'], { input: 'MODE:slow SLEEP:2500' });
  const id = await waitFor(() => t.sessions().find((x) => !before.includes(x)));
  const mid = await waitFor(() => { const m = t.meta(id); return m.tools?.Bash === 1 && m; });
  assert.equal(mid.status, 'running');
  assert.match(mid.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(mid.numTurns, 2);
  assert.equal(mid.usage.input, 1300);
  assert.equal(mid.endedAt, null);
  assert.ok(pidAlive(mid.pid));
  const res = await child.done;
  assert.equal(res.status, 0);
  const end = t.meta(id);
  assert.equal(end.status, 'done');
  assert.equal(end.numTurns, 3);
  const g = grandchildPid(t.file(id, 'events.jsonl'));
  assert.equal(pidAlive(g), false);
});

test('runSession in-process with onEvent', async () => {
  const seen = [];
  const r = await runSession({ prompt: 'in process', store: t.store, label: 'lib', onEvent: (ev) => seen.push(ev.type) });
  assert.equal(r.ok, true);
  assert.equal(r.result, 'OK: in process');
  assert.equal(seen.at(-1), 'result');
  await assert.rejects(runSession({ prompt: '  ', store: t.store }), /empty prompt/);
  await assert.rejects(runSession({ prompt: 'x', store: t.store, cwd: join(t.root, 'nope') }), /does not exist/);
});

test('lineSplitter handles partial lines and cut multibyte characters', () => {
  const got = [];
  const s = lineSplitter((l) => got.push(l));
  const b = Buffer.from('{"a":"ü"}\r\n\n{"b":1}\npartial');
  s.push(b.subarray(0, 7)); s.push(b.subarray(7, 15)); s.push(b.subarray(15));
  assert.deepEqual(got, ['{"a":"ü"}', '{"b":1}']);
  s.end();
  assert.deepEqual(got, ['{"a":"ü"}', '{"b":1}', 'partial']);
});

test('resolveClaude honours ORC_CLAUDE_BIN and fails clearly', () => {
  assert.equal(resolveClaude(), process.env.ORC_CLAUDE_BIN);
  const keep = process.env.ORC_CLAUDE_BIN;
  process.env.ORC_CLAUDE_BIN = join(t.root, 'missing-claude');
  assert.throws(() => resolveClaude(), /does not exist/);
  process.env.ORC_CLAUDE_BIN = keep;
});

test('meta writes are atomic: a concurrent reader never sees half a file', async () => {
  const dir = join(t.root, 'atomic');
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'meta.json');
  const util = new URL('../lib/util.mjs', import.meta.url).href;
  const code = `import { writeJsonAtomic } from '${util}';
    const big = { pad: 'z'.repeat(200000) };
    for (let i = 0; i < 400; i++) writeJsonAtomic(${JSON.stringify(f)}, { i, ...big });`;
  const w = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'inherit' });
  const exited = new Promise((r) => w.on('exit', r));
  let reads = 0; let done = false;
  exited.then(() => { done = true; });
  while (!done) {
    let txt = null;
    try { txt = readFileSync(f, 'utf8'); } catch {}
    if (txt !== null) { JSON.parse(txt); reads++; }
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(await exited, 0);
  assert.ok(reads > 5, `read ${reads} times`);
});

// ---------- regressions found by the validator ----------

test('a 1 MB multibyte prompt reaches prompt.md and claude byte-for-byte', () => {
  const before = t.sessions();
  const prompt = 'big unicode\n' + 'ą🐱日'.repeat(100_000); // ~1 MB, chars straddle 64 KB chunk edges
  const r = t.orc(['exec', '--label', 'big'], { input: prompt });
  assert.equal(r.status, 0, r.stderr);
  const id = only(before);
  assert.equal(t.file(id, 'prompt.md'), prompt);
  assert.equal(t.claudeCalls().at(-1).prompt, prompt);
  assert.ok(!t.file(id, 'prompt.md').includes('�'));
});

test('a claude that cannot be spawned fails fast instead of waiting for the timeout', () => {
  const bad = join(t.root, 'bad-shebang');
  writeFileSync(bad, '#!/no/such/interpreter\n');
  chmodSync(bad, 0o755);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [ORC, 'exec', '--label', 'nospawn'], { input: 'hi', env: { ...t.env, ORC_CLAUDE_BIN: bad }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 1, r.stderr);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  assert.match(r.stderr, /error .*\n.*could not start/);
});

test('ORC_CLAUDE_BIN that is not executable is rejected clearly', () => {
  const f = join(t.root, 'plain-file');
  writeFileSync(f, 'echo hi\n');
  const keep = process.env.ORC_CLAUDE_BIN;
  process.env.ORC_CLAUDE_BIN = f;
  try { assert.throws(() => resolveClaude(), /is not an executable file/); } finally { process.env.ORC_CLAUDE_BIN = keep; }
});

test('a grandchild holding stdout open does not keep exec alive', () => {
  const before = t.sessions();
  const t0 = Date.now();
  const r = t.orc(['exec', '--label', 'orphan'], { input: 'MODE:orphan' });
  const took = Date.now() - t0;
  const id = only(before);
  const m = t.meta(id);
  try { process.kill(-m.pid, 'SIGKILL'); } catch {} // the fake's leftover shell lives in the session's group
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OK: MODE:orphan\n');
  assert.ok(took < 6000, `exec took ${took} ms`);
  assert.equal(m.status, 'done');
});

test('bad --timeout values are refused', () => {
  for (const v of ['-1', '0', 'abc', '99999999']) {
    const r = t.orc(['exec', '--timeout', v], { input: 'x' });
    assert.equal(r.status, 2, `--timeout ${v}`);
    assert.match(r.stderr, /timeout must be seconds/);
  }
  const bg = t.orc(['run', 'x', 'hello', '--bg', '--timeout', '-5']);
  assert.equal(bg.status, 2);
  assert.match(bg.stderr, /timeout must be seconds/);
});
