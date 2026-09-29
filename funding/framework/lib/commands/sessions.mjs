// Every AI step is a tracked Claude Code session, run by orc (funding/orchestrator).
//
//   fund ps [<slug>] [--all] [--json]   sessions, running first (a slug keeps only "<slug>/…" labels)
//   fund logs <id|last> [-f]            what a session did: text, tool calls, results, cost
//   fund watch [--once]                 live dashboard until nothing runs
//   fund orc <any orc command>          pass-through, e.g. fund orc kill <id>, fund orc stats --by label
//
// Also the AI backend itself (runAI): through orc when FUND_AI_CMD is not set, else the old
// "pipe the prompt to $FUND_AI_CMD" behaviour, unchanged. Sessions are stored in $ORC_HOME
// (default funding/framework/.orc) and labelled "<slug>/<step>".

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FRAMEWORK_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORC_BIN = process.env.FUND_ORC_BIN || join(FRAMEWORK_ROOT, '..', 'orchestrator', 'bin', 'orc.mjs');
const ORC_LIB = join(dirname(ORC_BIN), '..', 'lib', 'orc.mjs');

export const orcHome = () => process.env.ORC_HOME || join(FRAMEWORK_ROOT, '.orc');
export const orcEnv = () => ({ ...process.env, ORC_HOME: orcHome() });
/** true when AI steps run as Claude Code sessions through orc (FUND_AI_CMD not set). */
export const usesOrc = () => !process.env.FUND_AI_CMD;

/** orc's library, or null when funding/orchestrator is missing (fund keeps working without it). */
export async function orcLib() {
  if (!existsSync(ORC_LIB)) return null;
  try { return await import(pathToFileURL(ORC_LIB).href); } catch { return null; }
}

// ---------- the AI backend ----------

function runCmd(prompt) {
  const cmd = process.env.FUND_AI_CMD || 'claude -p';
  // FUND_AI_TIMEOUT (seconds, default 900) so a hanging AI command never hangs `fund run` or `fund go`.
  const timeout = (Number(process.env.FUND_AI_TIMEOUT) || 900) * 1000;
  const res = spawnSync(cmd, { shell: true, input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout, killSignal: 'SIGKILL' });
  if (res.error?.code === 'ETIMEDOUT') throw new Error(`AI command "${cmd}" timed out after ${timeout / 1000}s (FUND_AI_TIMEOUT)`);
  if (res.status !== 0) throw new Error(`AI command "${cmd}" failed: ${res.stderr || res.error?.message || res.status}`);
  return res.stdout;
}

/**
 * One Claude Code session through `orc exec --json`; → the result text. Throws with the session id
 * and the command to inspect it. meta: { label, model }. FUND_AI_MODEL is the default model,
 * FUND_AI_TIMEOUT (seconds) the session timeout.
 */
function runOrc(prompt, meta = {}) {
  if (!existsSync(ORC_BIN)) throw new Error(`orc not found at ${ORC_BIN} — set FUND_AI_CMD (e.g. "claude -p") or restore funding/orchestrator`);
  const label = meta.label || 'fund';
  const model = meta.model || process.env.FUND_AI_MODEL || '';
  const timeoutS = Number(process.env.FUND_AI_TIMEOUT) || 0;
  const args = [ORC_BIN, 'exec', '--label', label, '--cwd', FRAMEWORK_ROOT, ...(model ? ['--model', model] : []), ...(timeoutS ? ['--timeout', String(timeoutS)] : []), '--json'];
  const guard = ((timeoutS || Number(process.env.ORC_TIMEOUT) || 900) + 60) * 1000; // orc times out first and cleans up
  const res = spawnSync(process.execPath, args, { input: String(prompt), encoding: 'utf8', env: orcEnv(), cwd: FRAMEWORK_ROOT, maxBuffer: 256 * 1024 * 1024, timeout: guard, killSignal: 'SIGTERM' });
  let j = null;
  try { j = JSON.parse(String(res.stdout || '').trim().split('\n').filter(Boolean).pop() || ''); } catch { /* below */ }
  if (!j) {
    const why = res.error?.code === 'ETIMEDOUT' ? `no answer after ${guard / 1000}s` : String(res.stderr || res.error?.message || `exit ${res.status}`).trim().split('\n').slice(-3).join(' | ');
    throw new Error(`AI session "${label}" did not run: ${fundify(why)} — see: fund ps --all`);
  }
  if (!j.ok) {
    const err = String(j.meta?.error || j.result || j.status || 'failed').split('\n')[0].slice(0, 300);
    throw new Error(`AI session ${j.id} (${label}) ended ${j.status}: ${err} — see: fund logs ${j.id}`);
  }
  return String(j.result ?? '');
}

/** runAI(prompt, meta?) → string. Through orc unless FUND_AI_CMD is set (then exactly as before). */
export function runAI(prompt, meta = {}) {
  return usesOrc() ? runOrc(prompt, meta) : runCmd(prompt);
}

// ---------- session stats per "<slug>/<step>" label ----------

/** { "<slug>": { "<step>": { sessions, ok, costUsd, tokens, turns, durationMs } } } from the orc store. */
export async function sessionsBySlugStep() {
  const lib = await orcLib();
  if (!lib) return {};
  const out = {};
  for (const m of lib.listSessions({ store: orcHome(), all: true })) {
    const i = String(m.label || '').lastIndexOf('/');
    if (i <= 0) continue;
    const slug = m.label.slice(0, i); const step = m.label.slice(i + 1);
    const s = ((out[slug] ||= {})[step] ||= { sessions: 0, ok: 0, costUsd: 0, tokens: 0, turns: 0, durationMs: 0 });
    s.sessions++;
    if (m.status === 'done') s.ok++;
    s.costUsd += Number(m.costUsd) || 0;
    s.tokens += lib.totalTokens(m.usage) || 0;
    s.turns += Number(m.numTurns) || 0;
    s.durationMs += Number(m.durationMs) || 0;
  }
  return out;
}

// ---------- CLI wrappers ----------

/** orc prints "next: orc …"; say it the fund way. */
export function fundify(line) {
  return line.replace(/\borc (ps|logs|watch)\b/g, 'fund $1').replace(/\borc (?=(kill|resume|stats|run|flow|exec|help)\b)/g, 'fund orc ');
}

function argvOf(args, flags, booleans = []) {
  const out = [...args];
  for (const [k, v] of Object.entries(flags)) {
    if (v === true || booleans.includes(k)) out.push(`--${k}`);
    else out.push(`--${k}`, String(v));
  }
  return out;
}

/** Run orc with ORC_HOME set, streaming its output line by line through fundify. → exit code */
export function orc(argv) {
  if (!existsSync(ORC_BIN)) { console.error(`orc not found at ${ORC_BIN}`); return Promise.resolve(1); }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ORC_BIN, ...argv], { env: orcEnv(), stdio: ['inherit', 'pipe', 'pipe'] });
    const pipe = (from, to) => {
      let buf = '';
      from.setEncoding('utf8');
      from.on('data', (c) => { buf += c; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) to(fundify(l)); });
      from.on('end', () => { if (buf) to(fundify(buf)); });
    };
    pipe(child.stdout, (l) => console.log(l));
    pipe(child.stderr, (l) => console.error(l));
    const stop = () => { try { child.kill('SIGINT'); } catch { /* gone */ } };
    process.once('SIGINT', stop);
    child.on('close', (code) => { process.removeListener('SIGINT', stop); resolve(code ?? 1); });
  });
}

const ps = {
  name: 'ps',
  help: '[<slug>] [--all] [--json]              AI sessions (Claude Code), running first',
  booleanFlags: ['all', 'json'],
  async run({ args, flags }) {
    const lib = await orcLib();
    if (!lib) { console.error(`orc library not found next to ${ORC_BIN}`); return 1; }
    const slug = args[0];
    let rows = lib.listSessions({ store: orcHome(), all: !!flags.all || !!slug });
    if (slug) rows = rows.filter((m) => String(m.label || '').startsWith(`${slug}/`));
    if (flags.json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
    console.log(lib.psTable(rows));
    const running = rows.filter((m) => m.status === 'running');
    if (running.length) console.log(`next: fund logs ${running[0].id} -f   (or fund watch)`);
    else if (rows.length) console.log(`next: fund logs ${rows[0].id}   (or fund stats${slug ? ` ${slug}` : ''})`);
    else console.log(`next: fund run ${slug || '<slug>'}   # AI steps show up here as "<slug>/<step>" sessions`);
    return 0;
  },
};

const logs = {
  name: 'logs',
  help: '<id|last> [-f]                        what one AI session did (text, tools, result, cost)',
  async run({ args, flags }) {
    if (!args[0]) { console.error('usage: fund logs <id|last> [-f]   (ids: fund ps)'); return 2; }
    return orc(['logs', ...argvOf(args, flags, ['f', 'follow'])]);
  },
};

const watch = {
  name: 'watch',
  help: '[--once] [--interval S]               live dashboard of AI sessions until nothing runs',
  booleanFlags: ['once'],
  async run({ args, flags }) { return orc(['watch', ...argvOf(args, flags, ['once'])]); },
};

const orcCmd = {
  name: 'orc',
  help: '<orc command> ...                     orc pass-through with ORC_HOME set (kill, resume, stats --by label)',
  async run({ args, flags }) {
    if (!args.length) return orc(['help']);
    return orc(argvOf(args, flags, ['json', 'bg', 'all', 'dry', 'once', 'f', 'follow']));
  },
};

export default [ps, logs, watch, orcCmd];
