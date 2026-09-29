// Flow = a DAG of steps (AI sessions or shell commands), each optionally verified and retried.
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { runSession, aborted } from './session.mjs';
import { flowsDir, writeJsonAtomic, readJson, stamp, sh, alive } from './util.mjs';

const TEMPLATE = /\{\{\s*steps\.([\w-]+)\.result\s*\}\}/g;

/** Throws with every problem found; returns the waves (topological levels) for printing. */
export function validateFlow(flow) {
  const errs = [];
  if (!flow || !Array.isArray(flow.steps) || !flow.steps.length) throw new Error('flow needs a non-empty "steps" array');
  const ids = new Set();
  for (const s of flow.steps) {
    if (!s.id || !/^[\w-]+$/.test(s.id)) errs.push(`step id "${s.id}" must be letters, digits, - or _`);
    if (ids.has(s.id)) errs.push(`duplicate step id "${s.id}"`);
    ids.add(s.id);
    const kinds = ['prompt', 'prompt_file', 'cmd'].filter((k) => s[k] != null);
    if (kinds.length !== 1) errs.push(`step "${s.id}" needs exactly one of prompt, prompt_file, cmd`);
  }
  for (const s of flow.steps) {
    for (const n of s.needs || []) if (!ids.has(n)) errs.push(`step "${s.id}" needs unknown step "${n}"`);
    for (const m of String(s.prompt || '').matchAll(TEMPLATE)) if (!ids.has(m[1])) errs.push(`step "${s.id}" uses {{steps.${m[1]}.result}} but there is no such step`);
  }
  if (errs.length) throw new Error(errs.join('\n'));
  const waves = [];
  const placed = new Set();
  while (placed.size < flow.steps.length) {
    const wave = flow.steps.filter((s) => !placed.has(s.id) && (s.needs || []).every((n) => placed.has(n)));
    if (!wave.length) throw new Error(`dependency cycle among: ${flow.steps.filter((s) => !placed.has(s.id)).map((s) => s.id).join(', ')}`);
    wave.forEach((s) => placed.add(s.id));
    waves.push(wave.map((s) => s.id));
  }
  return waves;
}

export function loadFlowFile(file) {
  const path = resolve(file);
  let flow;
  try { flow = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`cannot read flow ${file}: ${e.message}`); }
  flow.__file = path;
  flow.__dir = resolve(path, '..');
  return flow;
}

export const readFlowRun = (runId, { store } = {}) => readJson(join(flowsDir(store), `${runId}.json`));

export function flowRunning(state) {
  return state?.status === 'running' && alive(state.runnerPid);
}

function kindOf(s) { return s.cmd != null ? 'cmd' : 'ai'; }

/**
 * runFlow(flow, { store, parallel, resume, dry, onUpdate(state, stepId), baseDir })
 * → state ({ runId, status: done|failed, steps: { id: { status, attempts, sessions, result, verify, error } } })
 */
export async function runFlow(flow, { store, parallel = 2, resume, dry, onUpdate, baseDir } = {}) {
  const waves = validateFlow(flow);
  const base = resolve(baseDir || flow.__dir || process.cwd());
  const d = flow.defaults || {};
  const abs = (p) => (isAbsolute(p) ? p : resolve(base, p));
  const cfg = (s) => ({
    cwd: abs(s.cwd ?? d.cwd ?? '.'), model: s.model ?? d.model, budget: s.budget ?? d.budget,
    timeout: s.timeout ?? d.timeout, mode: s.mode ?? d.mode, retries: Number(s.retries ?? d.retries ?? 0),
  });
  if (dry) return { dry: true, name: flow.name || 'flow', waves, steps: flow.steps.map((s) => ({ ...s, kind: kindOf(s), ...cfg(s) })) };

  mkdirSync(flowsDir(store), { recursive: true });
  let state;
  if (resume) {
    state = readFlowRun(resume, { store });
    if (!state) throw new Error(`no flow run ${resume} (list them with: ls ${flowsDir(store)})`);
    if (flowRunning(state)) throw new Error(`flow run ${resume} is still running (pid ${state.runnerPid})`);
  } else {
    const slug = String(flow.name || 'flow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow';
    let runId = `${slug}-${stamp()}`;
    for (let i = 2; existsSync(join(flowsDir(store), `${runId}.json`)); i++) runId = `${slug}-${stamp()}-${i}`;
    state = { runId, name: flow.name || slug, file: flow.__file || null, steps: {} };
  }
  state.status = 'running';
  state.runnerPid = process.pid;
  state.parallel = parallel;
  state.startedAt = new Date().toISOString();
  state.endedAt = null;
  state.resumes = resume ? (state.resumes || 0) + 1 : 0;
  for (const s of flow.steps) {
    const prev = state.steps[s.id];
    if (prev?.status === 'done') { prev.skipped = true; continue; }
    state.steps[s.id] = { status: 'pending', kind: kindOf(s), attempts: 0, sessions: prev?.sessions || [], result: null, verify: null, error: null, startedAt: null, endedAt: null, costUsd: prev?.costUsd || 0 };
  }
  const file = join(flowsDir(store), `${state.runId}.json`);
  const save = (stepId) => { writeJsonAtomic(file, state); try { onUpdate?.(state, stepId); } catch {} };
  save(null);

  const promptOf = (s) => {
    const raw = s.prompt ?? readFileSync(abs(s.prompt_file), 'utf8');
    return raw.replace(TEMPLATE, (_, id) => state.steps[id]?.result ?? '');
  };

  async function runStep(s) {
    const st = state.steps[s.id];
    const c = cfg(s);
    st.status = 'running';
    st.startedAt = new Date().toISOString();
    st.error = null;
    st.killed = false;
    let feedback = '';
    for (let attempt = 1; attempt <= c.retries + 1; attempt++) {
      st.attempts = attempt;
      st.verify = null;
      save(s.id);
      let ok;
      let output;
      try {
        if (s.cmd != null) {
          const r = await sh(s.cmd, { cwd: c.cwd, timeoutSec: Number(c.timeout) || 900 });
          ok = r.code === 0;
          output = r.out.trim();
          if (!ok) st.error = `cmd exit ${r.code}`;
        } else {
          const prompt = promptOf(s) + feedback;
          const r = await runSession({ prompt, store, label: `${state.name}/${s.id}`, flow: state.runId, step: s.id, cwd: c.cwd, model: c.model, budget: c.budget, timeout: c.timeout, mode: c.mode });
          st.sessions.push(r.id);
          st.costUsd = (st.costUsd || 0) + (r.meta.costUsd || 0);
          ok = r.ok;
          output = r.result;
          if (!ok) st.error = `session ${r.id} ${r.meta.status}: ${String(r.meta.error || '').split('\n')[0]}`;
          if (r.meta.status === 'killed') st.killed = true; // a person stopped it: never retry
        }
      } catch (e) { ok = false; output = ''; st.error = e.message; }
      st.result = output;
      if (ok && s.verify) {
        const v = await sh(s.verify, { cwd: c.cwd, timeoutSec: 300 });
        st.verify = { cmd: s.verify, code: v.code, output: v.out.slice(-4000) };
        ok = v.code === 0;
        if (!ok) st.error = `verify exit ${v.code}`;
        feedback = `\n\n---\nThe previous attempt did not pass verification (\`${s.verify}\` exited ${v.code}). Fix this:\n\n\`\`\`\n${v.out.slice(-4000).trim()}\n\`\`\`\n`;
      } else if (!ok) {
        feedback = `\n\n---\nThe previous attempt failed (${st.error}). Fix this and finish the task.\n`;
      }
      if (ok) { st.status = 'done'; st.error = null; break; }
      save(s.id);
      if (st.killed || aborted()) break;
    }
    if (st.status !== 'done') st.status = 'failed';
    st.endedAt = new Date().toISOString();
    save(s.id);
  }

  const running = new Map();
  for (;;) {
    let changed = true;
    while (changed) { // block dependants of failed/blocked steps
      changed = false;
      for (const s of flow.steps) {
        const st = state.steps[s.id];
        if (st.status !== 'pending') continue;
        const bad = (s.needs || []).find((n) => ['failed', 'blocked'].includes(state.steps[n].status));
        if (bad) { st.status = 'blocked'; st.error = `needs ${bad} (${state.steps[bad].status})`; changed = true; save(s.id); }
      }
    }
    const ready = flow.steps.filter((s) => state.steps[s.id].status === 'pending' && !running.has(s.id) && (s.needs || []).every((n) => state.steps[n].status === 'done'));
    for (const s of ready) {
      if (running.size >= Math.max(1, parallel) || aborted()) break;
      running.set(s.id, runStep(s).finally(() => running.delete(s.id)));
    }
    if (!running.size) break;
    await Promise.race(running.values());
  }
  const all = Object.values(state.steps);
  state.status = flow.steps.every((s) => state.steps[s.id].status === 'done') ? 'done' : aborted() ? 'killed' : 'failed';
  state.endedAt = new Date().toISOString();
  state.costUsd = all.reduce((a, s) => a + (s.costUsd || 0), 0);
  save(null);
  return state;
}
