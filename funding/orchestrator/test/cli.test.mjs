import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setup, waitFor, pidAlive, grandchildPid, ORC } from './helpers.mjs';
import { stats, listSessions, fmtCost, fmtTokens, fmtDur } from '../lib/orc.mjs';

const t = setup();
after(() => t.cleanup());

const DEAD = 999_999; // no such pid on macOS (pid_max 99998)
const mins = (n) => new Date(Date.now() - n * 60_000).toISOString();
function fakeMeta(id, over) {
  const dir = join(t.store, 'sessions', id);
  mkdirSync(dir, { recursive: true });
  const m = { id, label: 'x', status: 'done', pid: DEAD, runnerPid: DEAD, cwd: t.root, model: 'sonnet', mode: 'auto', startedAt: mins(10), endedAt: mins(9), sessionId: 's-' + id, durationMs: 60_000, numTurns: 2, costUsd: 0.1, usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, tools: { Bash: 2 }, lastEvent: 'result success', error: null, flow: null, step: null, ...over };
  if (!('endedAt' in over)) m.endedAt = new Date(Date.parse(m.startedAt) + 60_000).toISOString();
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(m));
  return m;
}

test('formatting: $0.00, 12.3k, 1m04s', () => {
  assert.equal(fmtCost(0.0123), '$0.01');
  assert.equal(fmtCost(1.5), '$1.50');
  assert.equal(fmtCost(null), '-');
  assert.equal(fmtTokens(12_345), '12.3k');
  assert.equal(fmtTokens(950), '950');
  assert.equal(fmtTokens(2_500_000), '2.5M');
  assert.equal(fmtDur(64_000), '1m04s');
  assert.equal(fmtDur(4_200), '4s');
  assert.equal(fmtDur(3_725_000), '1h02m');
});

test('ps: running first, then newest; a running session whose pid is gone is lost', () => {
  fakeMeta('20260101-000001-aaaa', { label: 'old-done', startedAt: mins(30) });
  fakeMeta('20260101-000002-bbbb', { label: 'new-done', startedAt: mins(5) });
  fakeMeta('20260101-000003-cccc', { label: 'live', status: 'running', runnerPid: process.pid, startedAt: mins(20), endedAt: null, costUsd: null });
  fakeMeta('20260101-000004-dddd', { label: 'ghost', status: 'running', startedAt: mins(1), endedAt: null });
  const r = t.orc(['ps']);
  assert.equal(r.status, 0, r.stderr);
  const labels = r.stdout.split('\n').slice(1).map((l) => l.split(/\s+/)[1]).filter((x) => ['old-done', 'new-done', 'live', 'ghost'].includes(x));
  assert.deepEqual(labels, ['live', 'ghost', 'new-done', 'old-done']);
  assert.match(r.stdout, /ghost\s+lost/);
  assert.match(r.stdout, /live\s+running\s+20m00s/);
  assert.match(r.stdout, /new-done\s+done\s+1m00s\s+2\s+2\s+\$0\.10\s+1\.5k/);
  assert.match(r.stdout, /next: orc logs 20260101-000003-cccc -f/);
  assert.match(r.stdout, /next: orc kill 20260101-000004-dddd /); // a lost session gets a way out
  const j = JSON.parse(t.orc(['ps', '--json']).stdout);
  assert.equal(j.find((m) => m.label === 'ghost').status, 'lost');
});

test('stats aggregates totals and groups', () => {
  const s = stats({ store: t.store, by: 'label' });
  const byKey = Object.fromEntries(s.groups.map((g) => [g.key, g]));
  assert.equal(s.total.sessions, 4);
  assert.equal(byKey['new-done'].successRate, 1);
  assert.equal(byKey.ghost.successRate, 0); // lost counts as ended, not successful
  assert.equal(byKey.live.ended, 0);
  assert.equal(Math.round(s.total.costUsd * 100), 30);
  assert.equal(s.total.tokens, 6000);
  const since = stats({ store: t.store, since: mins(8) });
  assert.equal(since.total.sessions, 2);
  const r = t.orc(['stats', '--by', 'label']);
  assert.match(r.stdout, /total\s+4\s+67%\s+1m00s\s+2\.0\s+\$0\.30\s+\$0\.0[78]\s+6\.0k/);
  assert.match(r.stdout, /next: orc ps --all/);
  assert.throws(() => stats({ store: t.store, by: 'color' }), /--by must be/);
});

test('logs: readable text, tool calls, tool results, result', () => {
  const before = t.sessions();
  t.orc(['exec', '--label', 'logme'], { input: 'show me logs' });
  const id = t.sessions().find((x) => !before.includes(x));
  const r = t.orc(['logs', id]);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, /\[init\] session [0-9a-f-]{36} · model claude-sonnet-4-5/);
  assert.match(out, /^ {2}Looking at the task\.$/m);
  assert.match(out, /^→ Bash\(ls -la\)$/m);
  assert.match(out, /^← total 0 drwxr-xr-x 2 u staff 64 \.$/m);
  assert.match(out, /\[result success\] 3 turns · \$0\.01 · 11\.3k tokens · \ds/);
  assert.match(out, /^ {2}OK: show me logs$/m);
  assert.match(out, /next: orc resume /);
  assert.equal(t.orc(['logs', 'last']).stdout.split('\n')[0], r.stdout.split('\n')[0]);
  assert.equal(t.orc(['logs', id.slice(-4)]).status, 0); // unique suffix
  assert.equal(t.orc(['logs', 'nope-nope']).status, 2);
});

test('logs -f follows a running session until it ends', async () => {
  const before = t.sessions();
  const child = t.orcAsync(['exec'], { input: 'MODE:slow SLEEP:1200 follow' });
  const id = await waitFor(() => t.sessions().find((x) => !before.includes(x)));
  await waitFor(() => existsSync(join(t.store, 'sessions', id, 'meta.json')));
  const f = t.orcAsync(['logs', id, '-f']);
  const [r] = await Promise.all([f.done, child.done]);
  assert.match(r.stdout, /→ Bash\(ls -la\)/);
  assert.match(r.stdout, /\[result success\]/);
  assert.match(r.stdout, /done · 3 turns/);
});

test('kill: SIGTERMs the tree and records killed', async () => {
  const before = t.sessions();
  const child = t.orcAsync(['exec', '--label', 'victim'], { input: 'MODE:hang' });
  const id = await waitFor(() => t.sessions().find((x) => !before.includes(x)));
  await waitFor(() => t.meta(id).tools?.Bash === 1);
  const g = grandchildPid(t.file(id, 'events.jsonl'));
  assert.ok(pidAlive(g));
  const r = t.orc(['kill', id]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /killed .* killed/);
  const res = await child.done;
  assert.equal(res.status, 1);
  const m = t.meta(id);
  assert.equal(m.status, 'killed');
  await waitFor(() => !pidAlive(g), { timeout: 5000 });
  assert.equal(pidAlive(m.pid), false);
  assert.match(t.orc(['kill', id]).stdout, /already killed/);
});

test('kill a lost session finalizes its meta', () => {
  fakeMeta('20260101-000009-eeee', { label: 'orphan', status: 'running', endedAt: null });
  const r = t.orc(['kill', '20260101-000009-eeee']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(t.meta('20260101-000009-eeee').status, 'killed');
});

test('resume passes --resume <session_id> and links the new session', () => {
  const before = t.sessions();
  t.orc(['exec', '--label', 'first', '--model', 'haiku'], { input: 'first prompt' });
  const first = t.sessions().find((x) => !before.includes(x));
  const sid = t.meta(first).sessionId;
  const mid = t.sessions();
  const r = t.orc(['resume', first, 'follow', 'up', 'please']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✓ .* done · 3 turns/);
  const second = t.sessions().find((x) => !mid.includes(x));
  const m = t.meta(second);
  assert.equal(m.resumedFrom, first);
  assert.equal(m.sessionId, sid);
  assert.equal(m.label, 'first');
  assert.equal(m.model, 'haiku');
  const call = t.claudeCalls().at(-1);
  assert.deepEqual(call.argv.slice(-4), ['--model', 'haiku', '--resume', sid]);
  assert.equal(call.prompt, 'follow up please');
  assert.match(t.orc(['logs', second]).stdout, /resumed from /);
});

test('run --bg detaches, prints the id, and the session completes', async () => {
  const r = t.orc(['run', 'bg-job', 'MODE:slow SLEEP:300 in background', '--bg']);
  assert.equal(r.status, 0, r.stderr);
  const id = r.stdout.match(/started (\S+) in the background/)[1];
  assert.match(r.stdout, new RegExp(`next: orc logs ${id} -f`));
  const m = await waitFor(() => { const x = t.meta(id); return x.status !== 'running' && x; });
  assert.equal(m.status, 'done');
  assert.equal(m.label, 'bg-job');
  assert.equal(listSessions({ store: t.store }).find((x) => x.id === id).costUsd, 0.0123);
});

test('run prints progress and a summary with next commands', () => {
  const r = t.orc(['run', 'hello', 'Say', 'hello']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /started · session /);
  assert.match(r.stdout, /⟳ hello · \d turns · 1 tools/);
  assert.match(r.stdout, /✓ \S+ done · 3 turns · 1 tools · \$0\.01 · 11\.3k tokens/);
  assert.match(r.stdout, /tools: Bash×1/);
  assert.match(r.stdout, /OK: Say hello/);
  assert.match(r.stdout, /next: orc resume /);
  const bad = t.orc(['run', 'boom', 'MODE:error']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✗ .* error/);
});

test('watch --once renders; watch exits when nothing is running', () => {
  const once = t.orc(['watch', '--once']);
  assert.equal(once.status, 0, once.stderr);
  assert.match(once.stdout, /orc watch · \d\d:\d\d:\d\d · 1 running/); // the fake "live" row owned by this test process
  const t0 = Date.now();
  // make the live row finished, then a plain watch must exit on its own
  fakeMeta('20260101-000003-cccc', { label: 'live', status: 'done' });
  const w = t.orc(['watch', '--interval', '0.2']);
  assert.equal(w.status, 0);
  assert.ok(Date.now() - t0 < 5000);
  assert.match(w.stdout, /0 running/);
  assert.match(w.stdout, /next: orc ps/);
});

test('bad usage exits 2 with a hint', () => {
  const r = t.orc(['frobnicate']);
  assert.equal(r.status, 2);
  const e = t.orc(['exec'], { input: '' });
  assert.equal(e.status, 2);
  assert.match(e.stderr, /needs a prompt/);
});

test('logs -f | head exits when the pipe closes, even while the session still runs', async () => {
  const before = t.sessions();
  const child = t.orcAsync(['exec', '--label', 'piped'], { input: 'MODE:hang piped' });
  const id = await waitFor(() => t.sessions().find((x) => !before.includes(x)));
  await waitFor(() => t.meta(id).tools?.Bash === 1);
  const t0 = Date.now();
  const r = spawnSync('/bin/sh', ['-c', `"${process.execPath}" "${ORC}" logs ${id} -f | head -1`], { env: t.env, encoding: 'utf8', timeout: 15_000 });
  const took = Date.now() - t0;
  assert.equal(t.orc(['kill', id]).status, 0);
  await child.done;
  assert.equal(r.status, 0);
  assert.match(r.stdout, new RegExp(`^${id} · piped`));
  assert.ok(took < 5000, `logs -f | head took ${took} ms`);
});
