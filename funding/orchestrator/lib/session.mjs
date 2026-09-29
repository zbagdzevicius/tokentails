// One session = one `claude -p --output-format stream-json` subprocess, recorded in the store.
import { spawn } from 'node:child_process';
import { accessSync, constants, createWriteStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { newSessionDir, sessionsDir, writeJsonAtomic, readJson, killTree, alive } from './util.mjs';

const isExec = (p) => { try { accessSync(p, constants.X_OK); return statSync(p).isFile(); } catch { return false; } };
const isScript = (p) => /\.(m?js|cjs)$/.test(p); // run with node, needs no exec bit

export function resolveClaude() {
  const env = process.env.ORC_CLAUDE_BIN;
  if (env) {
    if (!existsSync(env)) throw new Error(`ORC_CLAUDE_BIN=${env} does not exist`);
    if (!isScript(env) && !isExec(env)) throw new Error(`ORC_CLAUDE_BIN=${env} is not an executable file`);
    return resolve(env);
  }
  for (const d of (process.env.PATH || '').split(delimiter)) if (d && isExec(join(d, 'claude'))) return join(d, 'claude');
  for (const p of ['/Applications/cmux.app/Contents/Resources/bin/claude', join(homedir(), '.claude', 'local', 'claude')]) if (isExec(p)) return p;
  throw new Error('claude not found: set ORC_CLAUDE_BIN or put claude on PATH');
}

/** --timeout / $ORC_TIMEOUT in seconds (default 900). setTimeout fires at once for <= 0 or > ~24.8 days. */
export function timeoutOf(v) {
  const raw = v ?? process.env.ORC_TIMEOUT ?? 900;
  const n = Number(raw);
  if (!(n > 0 && n <= 2e6)) throw new Error(`timeout must be seconds between 1 and 2000000, got "${raw}"`);
  return n;
}

/** Split a byte stream into lines; tolerant of partial lines and multibyte chars cut across chunks. */
export function lineSplitter(onLine) {
  const dec = new StringDecoder('utf8');
  let buf = '';
  const flush = (all) => {
    const parts = buf.split('\n');
    buf = all ? '' : parts.pop();
    for (const l of parts) if (l.trim()) onLine(l.replace(/\r$/, ''));
  };
  return {
    push(chunk) { buf += dec.write(chunk); flush(false); },
    end() { buf += dec.end(); flush(true); },
  };
}

const ACTIVE = new Map(); // id -> { child, dir }
let ABORTED = false;
export const aborted = () => ABORTED;

/** Kill every session this process started (used on SIGINT/SIGTERM); flows stop starting new work. */
export function abortAll() {
  ABORTED = true;
  for (const [, { child, dir }] of ACTIVE) {
    try { writeFileSync(join(dir, 'kill'), new Date().toISOString()); } catch {}
    killTree(child.pid, 'SIGTERM');
  }
}

/** Is a "running" meta really running? The runner process owns the meta; if it is gone, it is lost. */
export function effectiveStatus(meta) {
  if (meta?.status !== 'running') return meta?.status;
  const owner = meta.runnerPid || meta.pid;
  if (owner && alive(owner)) return 'running';
  if (!owner && Date.now() - Date.parse(meta.startedAt) < 10_000) return 'running'; // just starting
  return 'lost';
}

export function readMeta(id, { store } = {}) {
  return readJson(join(sessionsDir(store), id, 'meta.json'));
}

export function listSessions({ store, all = true, flow, limit } = {}) {
  const dir = sessionsDir(store);
  if (!existsSync(dir)) return [];
  let rows = readdirSync(dir).map((id) => readJson(join(dir, id, 'meta.json'))).filter(Boolean);
  for (const m of rows) m.status = effectiveStatus(m);
  if (flow) rows = rows.filter((m) => m.flow === flow);
  const running = (m) => (m.status === 'running' ? 0 : 1);
  rows.sort((a, b) => running(a) - running(b) || String(b.startedAt).localeCompare(String(a.startedAt)) || b.id.localeCompare(a.id));
  if (!all) {
    const live = rows.filter((m) => m.status === 'running');
    rows = [...live, ...rows.filter((m) => m.status !== 'running').slice(0, limit ?? 15)];
  }
  return rows;
}

export function readSession(id, { store } = {}) {
  const dir = join(sessionsDir(store), id);
  const meta = readJson(join(dir, 'meta.json'));
  if (!meta) throw new Error(`no session ${id} (look with: orc ps --all)`);
  const events = [];
  const f = join(dir, 'events.jsonl');
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { events.push(JSON.parse(l)); } catch { events.push({ type: 'orc_raw', text: l }); }
  }
  const rf = join(dir, 'result.md');
  return { meta, events, result: existsSync(rf) ? readFileSync(rf, 'utf8') : null, dir };
}

/**
 * Run one session. opts: { prompt, store, label, cwd, model, budget, timeout, mode, resume, id,
 * flow, step, resumedFrom, onEvent(ev, meta) } → { ok, id, meta, result }
 */
export async function runSession(opts = {}) {
  const prompt = String(opts.prompt ?? '');
  if (!prompt.trim()) throw new Error('empty prompt');
  const bin = resolveClaude();
  const cwd = resolve(opts.cwd || '.');
  if (!existsSync(cwd)) throw new Error(`cwd ${cwd} does not exist`);
  const mode = opts.mode || process.env.ORC_PERMISSION_MODE || 'auto';
  const timeoutSec = timeoutOf(opts.timeout);
  const { id, dir } = newSessionDir(opts.store, opts.id);
  writeFileSync(join(dir, 'prompt.md'), prompt);

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', mode];
  if (opts.model) args.push('--model', String(opts.model));
  if (opts.budget != null && opts.budget !== '') args.push('--max-budget-usd', String(opts.budget));
  if (opts.resume) args.push('--resume', String(opts.resume));

  const meta = {
    id, label: opts.label || 'session', status: 'running', pid: null, runnerPid: process.pid, cwd,
    model: opts.model || null, mode, startedAt: new Date().toISOString(), endedAt: null, sessionId: null,
    durationMs: null, numTurns: 0, costUsd: null, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    tools: {}, lastEvent: 'starting', error: null, flow: opts.flow || null, step: opts.step || null,
    resumedFrom: opts.resumedFrom || null, resume: opts.resume || null, timeoutSec, exitCode: null,
  };
  const metaFile = join(dir, 'meta.json');
  let lastWrite = 0;
  let timer = null;
  const save = (force) => {
    const now = Date.now();
    if (force || now - lastWrite >= 500) {
      clearTimeout(timer); timer = null; lastWrite = now;
      writeJsonAtomic(metaFile, meta);
    } else if (!timer) {
      timer = setTimeout(() => save(true), 500 - (now - lastWrite));
    }
  };
  save(true);

  const log = createWriteStream(join(dir, 'events.jsonl'), { flags: 'a' });
  const stderrTail = [];
  const msgUsage = new Map(); // live usage by assistant message id
  let result = null;
  let parsed = 0;

  const onEvent = (ev) => {
    if (ev.type === 'system' && ev.subtype === 'init') {
      meta.sessionId = ev.session_id || meta.sessionId;
      meta.model = ev.model || meta.model;
      meta.lastEvent = 'init';
    } else if (ev.type === 'assistant' && ev.message) {
      const m = ev.message;
      if (m.id && !msgUsage.has(m.id)) meta.numTurns += 1;
      if (m.id && m.usage) msgUsage.set(m.id, m.usage); else if (m.id && !msgUsage.has(m.id)) msgUsage.set(m.id, null);
      for (const c of [].concat(m.content || [])) {
        if (c?.type === 'tool_use') { meta.tools[c.name] = (meta.tools[c.name] || 0) + 1; meta.lastEvent = `tool ${c.name}`; }
        else if (c?.type === 'text') meta.lastEvent = 'text';
      }
      if (!result) {
        let input = 0; let output = 0;
        for (const u of msgUsage.values()) if (u) { input += u.input_tokens || 0; output += u.output_tokens || 0; }
        meta.usage.input = input; meta.usage.output = output;
      }
    } else if (ev.type === 'user') {
      meta.lastEvent = 'tool result';
    } else if (ev.type === 'result') {
      result = ev;
      const u = ev.usage || {};
      meta.sessionId = ev.session_id || meta.sessionId;
      meta.durationMs = ev.duration_ms ?? null;
      meta.numTurns = ev.num_turns ?? meta.numTurns;
      meta.costUsd = ev.total_cost_usd ?? null;
      meta.usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
      meta.lastEvent = `result ${ev.subtype || ''}`.trim();
    } else if (ev.type) {
      meta.lastEvent = ev.subtype ? `${ev.type} ${ev.subtype}` : ev.type;
    }
    save(false);
    try { opts.onEvent?.(ev, meta); } catch {}
  };

  const splitOut = lineSplitter((line) => {
    let ev;
    try { ev = JSON.parse(line); } catch { ev = null; }
    if (ev && typeof ev === 'object' && !Array.isArray(ev)) {
      log.write(line + '\n');
      parsed++;
      onEvent(ev);
    } else {
      log.write(JSON.stringify({ type: 'orc_raw', text: line.slice(0, 4000) }) + '\n');
    }
  });
  const splitErr = lineSplitter((line) => { stderrTail.push(line); if (stderrTail.length > 20) stderrTail.shift(); });

  const [cmd, pre] = isScript(bin) ? [process.execPath, [bin]] : [bin, []];
  let child;
  let spawnError = null;
  let killedBy = null;
  const exit = await new Promise((done) => {
    try {
      child = spawn(cmd, [...pre, ...args], { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    } catch (e) { spawnError = e; return done({ code: null, signal: null }); }
    ACTIVE.set(id, { child, dir });
    meta.pid = child.pid || null;
    save(true);
    let finished = false;
    let exitInfo = null;
    const tm = setTimeout(() => {
      killedBy = 'timeout';
      killTree(child.pid, 'SIGTERM');
      setTimeout(() => killTree(child.pid, 'SIGKILL'), 2000).unref();
    }, timeoutSec * 1000);
    const finish = (info) => {
      if (finished) return;
      finished = true;
      clearTimeout(tm);
      // Drop the pipes: a grandchild still holding them must not keep this process alive.
      child.stdout.destroy(); child.stderr.destroy();
      done(info);
    };
    child.on('error', (e) => { spawnError = e; finish({ code: null, signal: null }); });
    child.stdout.on('data', (b) => splitOut.push(b));
    child.stderr.on('data', (b) => splitErr.push(b));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    // A grandchild holding stdout open must not keep us waiting after claude itself exited.
    child.on('exit', (code, signal) => { clearTimeout(tm); exitInfo = { code, signal }; setTimeout(() => finish(exitInfo), 1500).unref(); });
    child.on('close', (code, signal) => finish(exitInfo || { code, signal }));
  });
  ACTIVE.delete(id);
  splitOut.end();
  splitErr.end();

  const killFile = join(dir, 'kill');
  const killed = existsSync(killFile);
  meta.exitCode = exit.code;
  meta.endedAt = new Date().toISOString();
  if (meta.durationMs == null) meta.durationMs = Date.parse(meta.endedAt) - Date.parse(meta.startedAt);
  const tail = stderrTail.slice(-10).join('\n');
  if (spawnError) {
    meta.status = 'error';
    meta.error = `could not start ${bin}: ${spawnError.message}`;
  } else if (killedBy === 'timeout') {
    meta.status = 'timeout';
    meta.error = `timed out after ${timeoutSec}s` + (tail ? `\n${tail}` : '');
  } else if (killed) {
    meta.status = 'killed';
    meta.error = 'killed';
  } else if (result) {
    const bad = result.is_error || (result.subtype && result.subtype !== 'success');
    meta.status = bad ? 'error' : 'done';
    if (bad) meta.error = `${result.subtype || 'error'}: ${String(result.result ?? (result.errors || []).join('; ')).slice(0, 500)}`;
  } else {
    meta.status = 'error';
    meta.error = `no result event (exit code ${exit.code ?? '-'}${exit.signal ? `, signal ${exit.signal}` : ''}, ${parsed} events parsed)` + (tail ? `\nstderr:\n${tail}` : '');
  }
  if (meta.status === 'timeout' || meta.status === 'killed') killTree(meta.pid, 'SIGKILL'); // stragglers in the group
  const text = typeof result?.result === 'string' ? result.result : '';
  if (text) writeFileSync(join(dir, 'result.md'), text);
  await new Promise((r) => log.end(r));
  save(true);
  return { ok: meta.status === 'done', id, meta, result: text };
}
