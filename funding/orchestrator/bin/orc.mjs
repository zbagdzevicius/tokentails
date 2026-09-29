#!/usr/bin/env node
// orc — run Claude Code sessions as subprocesses, measure them, track them. See ../README.md.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync, existsSync, statSync, readSync, writeSync, closeSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  runSession, listSessions, readSession, readMeta, effectiveStatus, abortAll, runFlow, loadFlowFile, readFlowRun,
  flowRunning, stats, statsTable, psTable, flowTable, formatEvent, fmtCost, fmtTokens, fmtDur, totalTokens,
  toolCount, elapsedMs, short, storeDir, ORC_BIN,
} from '../lib/orc.mjs';
import { lineSplitter, timeoutOf } from '../lib/session.mjs';
import { stamp, killTree, alive, writeJsonAtomic, sessionsDir } from '../lib/util.mjs';

const BOOL = new Set(['json', 'bg', 'all', 'dry', 'once', 'f', 'follow', 'help', 'h']);
function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    const m = a.match(/^--?([\w-]+)(?:=(.*))?$/);
    if (!m || /^-\d/.test(a)) { pos.push(a); continue; }
    const k = m[1];
    if (m[2] !== undefined) flags[k] = m[2];
    else if (BOOL.has(k)) flags[k] = true;
    else if (i + 1 < argv.length) flags[k] = argv[++i];
    else throw new Error(`--${k} needs a value`);
  }
  return { pos, flags };
}

// A closed pipe (orc ps | head) must never abort a running session or flow.
for (const s of [process.stdout, process.stderr]) s.on('error', () => {});
const out = (s = '') => process.stdout.write(s + '\n');
const err = (s = '') => process.stderr.write(s + '\n');
const next = (...cmds) => cmds.filter(Boolean).forEach((c) => out(`next: ${c}`));
const q = (s) => (/^[\w./:@=-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = []; // decode once: a multibyte char can straddle two chunks
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function sessionOpts(f) {
  return { label: f.label, cwd: f.cwd, model: f.model, budget: f.budget, timeout: f.timeout, mode: f.mode, resume: f.resume, id: f.id, resumedFrom: f['resumed-from'] };
}

function onSignals() {
  let n = 0;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { abortAll(); if (++n > 2) process.exit(130); });
}

function resolveId(id) {
  if (!id) throw new Error('missing session id (see: orc ps)');
  const all = existsSync(sessionsDir()) ? readdirSync(sessionsDir()).sort() : [];
  if (id === 'last') { // most recently started, running or not
    const l = listSessions({ all: true }).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0];
    if (!l) throw new Error('no sessions yet');
    return l.id;
  }
  if (all.includes(id)) return id;
  const hits = all.filter((x) => x.startsWith(id) || x.endsWith(id));
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `ambiguous id ${id}: ${hits.slice(0, 5).join(', ')}` : `no session ${id} (see: orc ps --all)`);
}

const summaryLine = (m) => `${m.id} ${m.status} · ${m.numTurns ?? 0} turns · ${toolCount(m.tools)} tools · ${fmtCost(m.costUsd)} · ${fmtTokens(totalTokens(m.usage))} tokens · ${fmtDur(m.durationMs ?? elapsedMs(m))}`;

// ---------- commands ----------

async function cmdExec({ flags: f }) {
  const prompt = f.file ? readFileSync(f.file, 'utf8') : await readStdin();
  if (!prompt.trim()) throw new Error('exec needs a prompt on stdin or --file F');
  onSignals();
  const r = await runSession({ ...sessionOpts(f), prompt, label: f.label || 'exec' });
  if (f.json) out(JSON.stringify({ ok: r.ok, id: r.id, status: r.meta.status, result: r.result, meta: r.meta }));
  else if (r.result) process.stdout.write(r.result.endsWith('\n') ? r.result : r.result + '\n');
  err(`orc: ${summaryLine(r.meta)}`);
  if (!r.ok) err(`orc: ${String(r.meta.error || '').split('\n').slice(0, 12).join('\norc: ')}`);
  err(`next: orc logs ${r.id}`);
  return r.ok ? 0 : 1;
}

async function interactive(opts, { bg } = {}) {
  if (bg) {
    timeoutOf(opts.timeout); // fail here, not silently in the detached child
    const id = `${stamp()}-${randomBytes(2).toString('hex')}`;
    const bgDir = join(storeDir(), 'bg');
    mkdirSync(bgDir, { recursive: true });
    const pf = join(bgDir, `${id}.prompt.md`);
    writeFileSync(pf, opts.prompt);
    const args = [ORC_BIN, 'exec', '--id', id, '--file', pf];
    for (const k of ['label', 'cwd', 'model', 'budget', 'timeout', 'mode', 'resume']) if (opts[k] != null) args.push(`--${k}`, String(opts[k]));
    if (opts.resumedFrom) args.push('--resumed-from', opts.resumedFrom);
    const logFd = openSync(join(bgDir, `${id}.log`), 'a');
    const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, ORC_HOME: storeDir() } });
    child.unref();
    closeSync(logFd);
    out(`started ${id} in the background (pid ${child.pid})`);
    next(`orc logs ${id} -f`, 'orc watch', `orc kill ${id}`);
    return 0;
  }
  onSignals();
  const tty = process.stdout.isTTY;
  let meta = null; let lastTools = -1; let lastInit = false;
  const line = () => meta && `⟳ ${meta.label} · ${meta.numTurns} turns · ${toolCount(meta.tools)} tools · ${fmtCost(meta.costUsd)} · ${fmtDur(elapsedMs(meta))} · ${short(meta.lastEvent, 30)}`;
  const tick = tty ? setInterval(() => meta && process.stdout.write(`\r\x1b[K${line()}`), 500) : null;
  const r = await runSession({
    ...opts,
    onEvent: (ev, m) => {
      meta = m;
      if (tty) return;
      if (ev.type === 'system' && ev.subtype === 'init' && !lastInit) { lastInit = true; out(`${m.id} started · session ${m.sessionId} · model ${m.model}`); }
      const t = toolCount(m.tools);
      if (t !== lastTools && t > 0) { lastTools = t; out(line()); }
    },
  });
  if (tick) { clearInterval(tick); process.stdout.write('\r\x1b[K'); }
  const m = r.meta;
  out(`${m.status === 'done' ? '✓' : '✗'} ${summaryLine(m)}`);
  const tools = Object.entries(m.tools).map(([k, v]) => `${k}×${v}`).join(' ');
  if (tools) out(`  tools: ${tools}`);
  if (m.error) out(`  error: ${m.error.split('\n').join('\n         ')}`);
  if (r.result) { out('  result:'); for (const l of r.result.split('\n').slice(0, 20)) out(`    ${l.slice(0, 200)}`); }
  next(`orc logs ${m.id}`, m.sessionId ? `orc resume ${m.id} "<follow-up prompt>"` : null, 'orc stats');
  return r.ok ? 0 : 1;
}

async function cmdRun({ pos, flags: f }) {
  const [label, ...words] = pos;
  if (!label) throw new Error('usage: orc run <label> [prompt | --file F] [--bg]');
  const prompt = f.file ? readFileSync(f.file, 'utf8') : words.length ? words.join(' ') : await readStdin();
  if (!prompt.trim()) throw new Error('run needs a prompt: orc run <label> "do X", --file F, or stdin');
  return interactive({ ...sessionOpts(f), label, prompt }, { bg: f.bg });
}

async function cmdResume({ pos, flags: f }) {
  const id = resolveId(pos[0]);
  const prev = readMeta(id);
  if (!prev?.sessionId) throw new Error(`session ${id} has no Claude session id to resume (it never started)`);
  const prompt = pos.slice(1).join(' ') || (f.file ? readFileSync(f.file, 'utf8') : await readStdin());
  if (!prompt.trim()) throw new Error(`usage: orc resume ${id} "<follow-up prompt>"`);
  return interactive({
    ...sessionOpts(f), prompt, label: f.label || prev.label, cwd: f.cwd || prev.cwd, model: f.model || prev.model,
    mode: f.mode || prev.mode, resume: prev.sessionId, resumedFrom: id,
  }, { bg: f.bg });
}

async function cmdFlow({ pos, flags: f }) {
  if (!pos[0]) throw new Error('usage: orc flow <flow.json> [--parallel N] [--resume runId] [--dry]');
  const flow = loadFlowFile(pos[0]);
  const parallel = Number(f.parallel || flow.parallel || 2);
  if (f.dry) {
    const plan = await runFlow(flow, { dry: true });
    out(`flow ${plan.name}: ${plan.steps.length} steps, parallel ${parallel}`);
    plan.waves.forEach((w, i) => {
      out(`wave ${i + 1}:`);
      for (const id of w) {
        const s = plan.steps.find((x) => x.id === id);
        const what = s.kind === 'cmd' ? `cmd: ${short(s.cmd, 60)}` : `ai: ${short(s.prompt ?? `file ${s.prompt_file}`, 60)}`;
        out(`  ${id}  ${what}${s.needs?.length ? `  needs ${s.needs.join(',')}` : ''}${s.verify ? `  verify: ${short(s.verify, 40)} (retries ${s.retries})` : ''}  cwd ${s.cwd}`);
      }
    });
    next(`orc flow ${q(pos[0])}${f.parallel ? ` --parallel ${parallel}` : ''}`);
    return 0;
  }
  onSignals();
  const seen = {};
  const t = () => new Date().toTimeString().slice(0, 8);
  let header = false;
  const state = await runFlow(flow, {
    parallel, resume: f.resume,
    onUpdate: (st, stepId) => {
      if (!header) { header = true; out(`flow ${st.name} · run ${st.runId} · parallel ${parallel}${f.resume ? ' · resumed' : ''}`); out(`  track it: orc watch --flow ${st.runId}`); }
      if (!stepId) return;
      const s = st.steps[stepId];
      const key = `${s.status}/${s.attempts}/${s.error}`;
      if (seen[stepId] === key) return;
      seen[stepId] = key;
      const note = s.status === 'running' ? `attempt ${s.attempts}${s.error ? ` · last error: ${short(s.error, 60)}` : ''}` : s.error ? short(s.error, 70) : s.status === 'done' ? fmtCost(s.costUsd) : '';
      out(`${t()}  ${stepId.padEnd(14)} ${s.status.padEnd(8)} ${note}`);
    },
  });
  out('');
  out(flowTable(state));
  out(`flow ${state.status} · ${fmtCost(state.costUsd)} · ${fmtDur(Date.parse(state.endedAt) - Date.parse(state.startedAt))}`);
  next(state.status !== 'done' ? `orc flow ${q(pos[0])} --resume ${state.runId}` : null, `orc ps --flow ${state.runId}`, 'orc stats --by flow');
  return state.status === 'done' ? 0 : 1;
}

function cmdPs({ flags: f }) {
  const rows = listSessions({ all: !!f.all, flow: f.flow });
  if (f.json) { out(JSON.stringify(rows, null, 2)); return 0; }
  out(psTable(rows));
  const running = rows.filter((m) => m.status === 'running');
  const lost = rows.find((m) => m.status === 'lost');
  if (lost) next(`orc kill ${lost.id}   (its orc process died; this stops claude and closes the record)`);
  if (running.length) next(`orc logs ${running[0].id} -f`, 'orc watch');
  else if (rows.length) next(`orc logs ${rows[0].id}`, 'orc stats');
  else next('orc run hello "Say hello"');
  return 0;
}

// EPIPE only surfaces on a write, so `orc logs -f | head` on a quiet session would wait for the
// next event after head has gone. A zero-byte write reports a closed reader on macOS/BSD without
// printing anything; on Linux it is a no-op and the next real write still ends the follow.
function probeStdout() {
  if (process.stdout.isTTY) return;
  try { writeSync(1, ''); } catch (e) { if (e.code === 'EPIPE') process.exit(0); }
}

async function cmdLogs({ pos, flags: f }) {
  const id = resolveId(pos[0]);
  const { meta, dir } = readSession(id);
  out(`${meta.id} · ${meta.label} · ${meta.cwd}${meta.resumedFrom ? ` · resumed from ${meta.resumedFrom}` : ''}`);
  const file = join(dir, 'events.jsonl');
  let offset = 0;
  const split = lineSplitter((l) => {
    let ev; try { ev = JSON.parse(l); } catch { ev = { type: 'orc_raw', text: l }; }
    for (const x of formatEvent(ev)) out(x);
  });
  const drain = () => {
    if (!existsSync(file)) return false;
    const size = statSync(file).size;
    if (size <= offset) return false;
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    offset = size;
    split.push(buf);
    return true;
  };
  drain();
  if (f.f || f.follow) {
    for (;;) {
      const got = drain();
      const m = readMeta(id);
      if (!got && effectiveStatus(m) !== 'running') break;
      if (!got) probeStdout();
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  split.end();
  const m = readMeta(id);
  m.status = effectiveStatus(m);
  out(`— ${summaryLine(m)}`);
  if (m.error) out(`  error: ${m.error.split('\n').join('\n         ')}`);
  if (m.status === 'running') next(`orc logs ${id} -f`, `orc kill ${id}`);
  else next(m.sessionId ? `orc resume ${id} "<follow-up prompt>"` : null, 'orc ps');
  return 0;
}

async function cmdWatch({ flags: f }) {
  const interval = Number(f.interval || 2) * 1000;
  for (;;) {
    const rows = listSessions({ all: false, flow: f.flow, limit: 10 });
    const running = rows.filter((m) => m.status === 'running');
    const flowState = f.flow ? readFlowRun(f.flow) : null;
    if (f.flow && !flowState) throw new Error(`no flow run ${f.flow}`);
    const flowLive = flowState && flowRunning(flowState);
    const lines = [`orc watch · ${new Date().toTimeString().slice(0, 8)} · ${running.length} running${f.flow ? ` · flow ${f.flow} ${flowLive ? 'running' : flowState.status}` : ''}`, ''];
    if (flowState) lines.push(flowTable(flowState), '');
    lines.push(psTable(rows));
    if (process.stdout.isTTY && !f.once) process.stdout.write('\x1b[2J\x1b[H');
    out(lines.join('\n'));
    if (f.once || (!running.length && !flowLive)) break;
    await new Promise((r) => setTimeout(r, interval));
  }
  next(f.flow ? `orc ps --flow ${f.flow}` : 'orc ps', 'orc stats');
  return 0;
}

async function cmdKill({ pos }) {
  const id = resolveId(pos[0]);
  const { dir } = readSession(id);
  let m = readMeta(id);
  const st = effectiveStatus(m);
  if (st !== 'running' && st !== 'lost') { out(`${id} is already ${st}`); next('orc ps'); return 0; }
  writeFileSync(join(dir, 'kill'), new Date().toISOString());
  killTree(m.pid, 'SIGTERM');
  const waitFor = async (ms) => {
    for (const end = Date.now() + ms; Date.now() < end;) {
      m = readMeta(id);
      if (m.status !== 'running') return true;
      if (!alive(m.runnerPid)) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };
  if (!(await waitFor(5000))) {
    killTree(m.pid, 'SIGKILL');
    if (!(await waitFor(3000))) { // nobody left to finalize the meta: do it here
      m = readMeta(id);
      if (m.status === 'running') writeJsonAtomic(join(dir, 'meta.json'), { ...m, status: 'killed', endedAt: new Date().toISOString(), error: 'killed (runner gone)' });
    }
  }
  out(`killed ${summaryLine(readMeta(id))}`);
  next('orc ps', `orc logs ${id}`);
  return 0;
}

function cmdStats({ flags: f }) {
  const s = stats({ by: f.by, since: f.since });
  if (f.json) { out(JSON.stringify(s, null, 2)); return 0; }
  out(statsTable(s));
  const bs = Object.entries(s.total.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ');
  if (bs) out(`status: ${bs}`);
  next(f.by ? null : 'orc stats --by label', 'orc ps --all');
  return 0;
}

const HELP = `orc — run Claude Code sessions as subprocesses, measure and track them.
alias orc='node ${ORC_BIN}'   (store: $ORC_HOME or ./.orc)

  orc exec [--label L] [--cwd D] [--model M] [--budget USD] [--timeout S] [--mode M] [--resume SID] [--json] < prompt
  orc run <label> "prompt" | --file F [same flags] [--bg]
  orc flow <flow.json> [--parallel N] [--resume runId] [--dry]
  orc ps [--all] [--flow runId] [--json]
  orc logs <id|last> [-f]
  orc watch [--flow runId] [--once] [--interval S]
  orc kill <id>
  orc resume <id> "follow-up prompt"
  orc stats [--by label|model|flow] [--since ISO] [--json]

next: orc run hello "Say hello in one word"`;

const COMMANDS = { exec: cmdExec, run: cmdRun, resume: cmdResume, flow: cmdFlow, ps: cmdPs, logs: cmdLogs, watch: cmdWatch, kill: cmdKill, stats: cmdStats };

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { out(HELP); return 0; }
  const fn = COMMANDS[cmd];
  if (!fn) { err(`unknown command "${cmd}"`); out(HELP); return 2; }
  // Readers stop when their pipe closes (orc logs -f | head); runners keep going.
  if (['ps', 'logs', 'watch', 'stats'].includes(cmd)) process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });
  return fn(parseArgs(rest));
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  err(`orc: ${e.message}`);
  err('next: orc help');
  process.exitCode = 2;
});

