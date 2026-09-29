import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setup, waitFor, sleep } from './helpers.mjs';
import { runFlow, validateFlow, readFlowRun, listSessions } from '../lib/orc.mjs';

const t = setup();
after(() => t.cleanup());

let n = 0;
function workdir() { const d = join(t.root, `w${++n}`); mkdirSync(d, { recursive: true }); return d; }
const flowFile = (dir, flow) => { const f = join(dir, 'flow.json'); writeFileSync(f, JSON.stringify(flow, null, 2)); return f; };
const span = (st, id) => [Date.parse(st.steps[id].startedAt), Date.parse(st.steps[id].endedAt)];

const PAR = (cwd) => ({
  name: 'par', defaults: { cwd },
  steps: [
    { id: 'a', prompt: 'MODE:slow SLEEP:700 step a' },
    { id: 'b', prompt: 'MODE:slow SLEEP:700 step b' },
    { id: 'c', prompt: 'join {{steps.a.result}} + {{steps.b.result}}', needs: ['a', 'b'] },
  ],
});

test('parallel steps overlap; dependants wait; results are templated', async () => {
  const st = await runFlow(PAR(workdir()), { store: t.store, parallel: 2 });
  assert.equal(st.status, 'done');
  const [a0, a1] = span(st, 'a'); const [b0, b1] = span(st, 'b'); const [c0] = span(st, 'c');
  assert.ok(b0 < a1 && a0 < b1, 'a and b overlap');
  assert.ok(c0 >= Math.max(a1, b1), 'c starts after a and b');
  const cSession = st.steps.c.sessions[0];
  assert.equal(t.file(cSession, 'prompt.md'), 'join OK: MODE:slow SLEEP:700 step a + OK: MODE:slow SLEEP:700 step b');
  const metas = listSessions({ store: t.store, flow: st.runId });
  assert.equal(metas.length, 3);
  assert.deepEqual(metas.map((m) => m.step).sort(), ['a', 'b', 'c']);
  assert.ok(metas.every((m) => m.label.startsWith('par/')));
  assert.deepEqual(readFlowRun(st.runId, { store: t.store }).steps.c.status, 'done');
});

test('--parallel 1 runs one step at a time', async () => {
  const st = await runFlow(PAR(workdir()), { store: t.store, parallel: 1 });
  const [a0, a1] = span(st, 'a'); const [b0, b1] = span(st, 'b');
  assert.ok(b0 >= a1 || a0 >= b1, 'no overlap');
});

test('verify failure retries with the verify output appended', async () => {
  const cwd = workdir();
  const st = await runFlow({
    name: 'fix', defaults: { cwd },
    steps: [{ id: 'w', prompt: 'WRITE:out.txt:bad FIXWRITE:out.txt:good', verify: 'cat out.txt; grep -q good out.txt', retries: 1 }],
  }, { store: t.store });
  assert.equal(st.status, 'done');
  const s = st.steps.w;
  assert.equal(s.attempts, 2);
  assert.equal(s.sessions.length, 2);
  assert.equal(s.verify.code, 0);
  const retry = t.file(s.sessions[1], 'prompt.md');
  assert.match(retry, /did not pass verification \(`cat out.txt; grep -q good out.txt` exited 1\)\. Fix this:/);
  assert.match(retry, /```\nbad\n```/);
  assert.equal(readFileSync(join(cwd, 'out.txt'), 'utf8'), 'good\n');
});

test('retries exhausted → failed; dependants blocked; independent steps still run; resume skips done', async () => {
  const cwd = workdir();
  const flow = {
    name: 'blocky', defaults: { cwd },
    steps: [
      { id: 'x', prompt: 'MODE:error x', retries: 1 },
      { id: 'y', prompt: 'after x', needs: ['x'] },
      { id: 'y2', cmd: 'echo never', needs: ['y'] },
      { id: 'z', prompt: 'independent z' },
    ],
  };
  const file = flowFile(cwd, flow);
  const r1 = t.orc(['flow', file, '--parallel', '2']);
  assert.equal(r1.status, 1, r1.stderr);
  const runId = r1.stdout.match(/run (\S+) · parallel/)[1];
  let st = readFlowRun(runId, { store: t.store });
  assert.equal(st.status, 'failed');
  assert.equal(st.steps.x.status, 'failed');
  assert.equal(st.steps.x.attempts, 2);
  assert.match(t.file(st.steps.x.sessions[1], 'prompt.md'), /The previous attempt failed \(session \S+ error: error_during_execution/);
  assert.equal(st.steps.y.status, 'blocked');
  assert.equal(st.steps.y2.status, 'blocked');
  assert.match(st.steps.y2.error, /needs y \(blocked\)/);
  assert.equal(st.steps.z.status, 'done');
  assert.match(r1.stdout, new RegExp(`next: orc flow \\S+ --resume ${runId}`));
  assert.match(r1.stdout, /x\s+running\s+attempt 1 · last error: session \S+ error: error_during_execution/, 'a failed attempt is shown before the retry');
  const zSession = st.steps.z.sessions[0];

  flow.steps[0].prompt = 'x is fixed now';
  flowFile(cwd, flow);
  const r2 = t.orc(['flow', file, '--resume', runId]);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  st = readFlowRun(runId, { store: t.store });
  assert.equal(st.status, 'done');
  assert.equal(st.resumes, 1);
  assert.deepEqual(st.steps.z.sessions, [zSession], 'z was not re-run');
  assert.equal(st.steps.z.skipped, true);
  assert.equal(st.steps.x.sessions.length, 3);
  assert.equal(st.steps.y2.result, 'never');
  assert.match(r2.stdout, /z\s+done \(kept\)/);
  assert.match(r2.stdout, new RegExp(`run ${runId} · parallel 2 · resumed\n  track it: orc watch --flow ${runId}`));
});

test('cmd steps, verify on cmd, and step cwd relative to the flow file', async () => {
  const cwd = workdir();
  mkdirSync(join(cwd, 'sub'));
  const file = flowFile(cwd, {
    name: 'cmds',
    steps: [
      { id: 'mk', cmd: 'echo hi > made.txt && echo made', cwd: 'sub', verify: 'test -s made.txt' },
      { id: 'fail', cmd: 'echo oops >&2; exit 3' },
    ],
  });
  const r = t.orc(['flow', file]);
  assert.equal(r.status, 1);
  assert.ok(existsSync(join(cwd, 'sub', 'made.txt')));
  const runId = r.stdout.match(/run (\S+) · parallel/)[1];
  const st = readFlowRun(runId, { store: t.store });
  assert.equal(st.steps.mk.status, 'done');
  assert.equal(st.steps.mk.result, 'made');
  assert.equal(st.steps.fail.status, 'failed');
  assert.equal(st.steps.fail.error, 'cmd exit 3');
  assert.equal(st.steps.fail.result, 'oops');
});

test('--dry prints the plan and runs nothing', () => {
  const cwd = workdir();
  const before = t.sessions().length;
  const file = flowFile(cwd, PAR(cwd));
  const r = t.orc(['flow', file, '--dry']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /flow par: 3 steps, parallel 2/);
  assert.match(r.stdout, /wave 1:\n {2}a {2}ai: .*\n {2}b {2}ai: /);
  assert.match(r.stdout, /wave 2:\n {2}c {2}ai: .* {2}needs a,b/);
  assert.match(r.stdout, /next: orc flow /);
  assert.equal(t.sessions().length, before);
});

test('validation: cycles, unknown needs, bad templates, missing kind', () => {
  assert.throws(() => validateFlow({ steps: [{ id: 'a', prompt: 'x', needs: ['b'] }, { id: 'b', prompt: 'y', needs: ['a'] }] }), /cycle among: a, b/);
  assert.throws(() => validateFlow({ steps: [{ id: 'a', prompt: 'x', needs: ['nope'] }] }), /unknown step "nope"/);
  assert.throws(() => validateFlow({ steps: [{ id: 'a', prompt: '{{steps.zz.result}}' }] }), /no such step/);
  assert.throws(() => validateFlow({ steps: [{ id: 'a' }] }), /exactly one of/);
  assert.throws(() => validateFlow({ steps: [] }), /non-empty/);
  assert.deepEqual(validateFlow(PAR('.')), [['a', 'b'], ['c']]);
});

test('the example flow validates', () => {
  const f = JSON.parse(readFileSync(new URL('../examples/hello-flow.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateFlow(f).length >= 2, true);
});

test('orc kill on a step session is not retried; watch --flow shows the steps', async () => {
  const cwd = workdir();
  const file = flowFile(cwd, { name: 'killme', defaults: { cwd }, steps: [{ id: 'h', prompt: 'MODE:hang', retries: 2 }, { id: 'after', prompt: 'x', needs: ['h'] }] });
  const run = t.orcAsync(['flow', file]);
  const sid = await waitFor(() => listSessions({ store: t.store }).find((m) => m.flow?.startsWith('killme') && m.status === 'running' && m.tools?.Bash));
  const w = t.orc(['watch', '--flow', sid.flow, '--once']);
  assert.match(w.stdout, /flow killme-\S+ running/);
  assert.match(w.stdout, /h\s+running\s+ai\s+1/);
  assert.match(w.stdout, /after\s+pending/);
  assert.equal(t.orc(['kill', sid.id]).status, 0);
  const r = await run.done;
  assert.equal(r.status, 1);
  const st = readFlowRun(sid.flow, { store: t.store });
  assert.equal(st.steps.h.status, 'failed');
  assert.equal(st.steps.h.attempts, 1);
  assert.match(st.steps.h.error, /killed/);
  assert.equal(st.steps.after.status, 'blocked');
  const w2 = t.orc(['watch', '--flow', sid.flow]);
  assert.equal(w2.status, 0);
  assert.match(w2.stdout, /flow killme-\S+ failed/);
});

test('Ctrl-C on a flow kills its sessions and starts nothing new', async () => {
  const cwd = workdir();
  const file = flowFile(cwd, { name: 'sigint', defaults: { cwd }, steps: [{ id: 'h', prompt: 'MODE:hang', retries: 3 }, { id: 'n', prompt: 'next', needs: ['h'] }] });
  const before = t.sessions().length;
  const run = t.orcAsync(['flow', file]);
  const m = await waitFor(() => listSessions({ store: t.store }).find((x) => x.flow?.startsWith('sigint') && x.status === 'running' && x.tools?.Bash));
  run.kill('SIGINT');
  const r = await run.done;
  assert.equal(r.status, 1);
  await sleep(200);
  assert.equal(t.sessions().length, before + 1, 'no retry session started');
  const st = readFlowRun(m.flow, { store: t.store });
  assert.equal(st.status, 'killed');
  assert.equal(t.meta(m.id).status, 'killed');
  assert.equal(st.steps.n.status, 'blocked');
});
