// orc library: the contract's exports plus the formatters the CLI uses.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolveClaude, runSession, listSessions, readSession, readMeta, effectiveStatus, abortAll } from './session.mjs';
import { runFlow, loadFlowFile, validateFlow, readFlowRun, flowRunning } from './flow.mjs';
import { fmtCost, fmtTokens, fmtDur, totalTokens, toolCount, elapsedMs, table, short, storeDir } from './util.mjs';

export { resolveClaude, runSession, listSessions, readSession, readMeta, effectiveStatus, abortAll };
export { runFlow, loadFlowFile, validateFlow, readFlowRun, flowRunning };
export { fmtCost, fmtTokens, fmtDur, totalTokens, toolCount, elapsedMs, table, short, storeDir };

export const ORC_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'orc.mjs');

/**
 * Run one session synchronously through the CLI (`orc exec --json`), for callers that cannot await.
 * opts: { label, cwd, model, budget, timeout, mode, resume, store } → { ok, result, meta, error }
 */
export function execSync(prompt, opts = {}) {
  const args = [ORC_BIN, 'exec', '--json'];
  for (const k of ['label', 'cwd', 'model', 'budget', 'timeout', 'mode', 'resume']) if (opts[k] != null && opts[k] !== '') args.push(`--${k}`, String(opts[k]));
  const env = { ...process.env, ...(opts.store ? { ORC_HOME: storeDir(opts.store) } : {}) };
  const timeoutSec = Number(opts.timeout ?? process.env.ORC_TIMEOUT ?? 900) || 900;
  const r = spawnSync(process.execPath, args, { input: String(prompt), encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, timeout: (timeoutSec + 30) * 1000 });
  try {
    const j = JSON.parse(r.stdout);
    return { ok: !!j.ok, result: j.result ?? '', meta: j.meta, error: j.meta?.error || null };
  } catch {
    return { ok: false, result: '', meta: null, error: (r.error?.message || r.stderr || `exit ${r.status}`).trim() };
  }
}

// ---------- stats ----------

export function stats({ store, by, since } = {}) {
  let rows = listSessions({ store, all: true });
  if (since) {
    const t = Date.parse(since);
    if (!Number.isFinite(t)) throw new Error(`--since "${since}" is not a date`);
    rows = rows.filter((m) => Date.parse(m.startedAt) >= t);
  }
  const agg = (key, list) => {
    const ended = list.filter((m) => m.status !== 'running');
    const ok = ended.filter((m) => m.status === 'done').length;
    const sum = (f) => list.reduce((a, m) => a + (f(m) || 0), 0);
    const dur = ended.reduce((a, m) => a + (m.durationMs ?? elapsedMs(m) ?? 0), 0);
    return {
      key, sessions: list.length, done: ok, ended: ended.length, successRate: ended.length ? ok / ended.length : null,
      avgDurationMs: ended.length ? dur / ended.length : null, totalDurationMs: dur,
      avgTurns: list.length ? sum((m) => m.numTurns) / list.length : null,
      costUsd: sum((m) => m.costUsd), avgCostUsd: list.length ? sum((m) => m.costUsd) / list.length : null,
      tokens: sum((m) => totalTokens(m.usage)), tools: sum((m) => toolCount(m.tools)),
      byStatus: list.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {}),
    };
  };
  const groups = [];
  if (by) {
    if (!['label', 'model', 'flow'].includes(by)) throw new Error('--by must be label, model or flow');
    const map = new Map();
    for (const m of rows) {
      const k = m[by] || '-';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    for (const [k, list] of map) groups.push(agg(k, list));
    groups.sort((a, b) => b.costUsd - a.costUsd || b.sessions - a.sessions);
  }
  return { total: agg('total', rows), groups, by: by || null, since: since || null };
}

export function statsTable(s) {
  const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const row = (g) => [g.key, g.sessions, pct(g.successRate), fmtDur(g.avgDurationMs), g.avgTurns == null ? '-' : g.avgTurns.toFixed(1), fmtCost(g.costUsd), fmtCost(g.avgCostUsd), fmtTokens(g.tokens)];
  return table([[s.by || 'group', 'sessions', 'ok', 'avg time', 'avg turns', 'cost', 'avg cost', 'tokens'], ...s.groups.map(row), row(s.total)]);
}

// ---------- ps ----------

export function psTable(rows, now = Date.now()) {
  if (!rows.length) return '(no sessions)';
  return table([
    ['id', 'label', 'status', 'elapsed', 'turns', 'tools', 'cost', 'tokens', 'last'],
    ...rows.map((m) => [m.id, short(m.label, 28), m.status, fmtDur(elapsedMs(m, now)), m.numTurns ?? 0, toolCount(m.tools), fmtCost(m.costUsd), fmtTokens(totalTokens(m.usage)), m.status === 'running' ? short(m.lastEvent, 24) : short(String(m.error || '').split('\n')[0], 40)]),
  ]);
}

export function flowTable(state) {
  return table([
    ['step', 'status', 'kind', 'attempts', 'cost', 'sessions', 'note'],
    ...Object.entries(state.steps).map(([id, s]) => [id, s.skipped ? 'done (kept)' : s.status, s.kind, s.attempts, fmtCost(s.costUsd), s.sessions.slice(-1)[0] || '-', short(s.error || '', 50)]),
  ]);
}

// ---------- logs ----------

const toolInput = (input = {}) => {
  for (const k of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']) if (input[k]) return short(input[k], 70);
  return short(JSON.stringify(input), 70);
};
const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x?.text ?? '').join(' ') : JSON.stringify(c ?? ''));

/** One event → readable lines (or [] for noise). */
export function formatEvent(ev) {
  switch (ev.type) {
    case 'system':
      if (ev.subtype === 'init') return [`[init] session ${ev.session_id} · model ${ev.model || '-'} · cwd ${ev.cwd || '-'}`];
      return [];
    case 'assistant': {
      const out = [];
      for (const c of [].concat(ev.message?.content || [])) {
        if (c?.type === 'text' && c.text?.trim()) out.push(`  ${short(c.text, 300)}`);
        else if (c?.type === 'tool_use') out.push(`→ ${c.name}(${toolInput(c.input)})`);
      }
      return out;
    }
    case 'user': {
      const out = [];
      for (const c of [].concat(ev.message?.content || [])) {
        if (c?.type === 'tool_result') out.push(`← ${c.is_error ? 'ERROR ' : ''}${short(resultText(c.content), 100)}`);
      }
      return out;
    }
    case 'result': {
      const u = ev.usage || {};
      const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      return [`[result ${ev.subtype}${ev.is_error ? ' (error)' : ''}] ${ev.num_turns ?? '-'} turns · ${fmtCost(ev.total_cost_usd)} · ${fmtTokens(tok)} tokens · ${fmtDur(ev.duration_ms)}`, ...String(ev.result ?? '').split('\n').slice(0, 40).map((l) => `  ${l.slice(0, 300)}`)];
    }
    case 'orc_raw': return [`[raw] ${short(ev.text, 200)}`];
    default: return [];
  }
}
