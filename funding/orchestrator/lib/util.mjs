// Store paths, atomic JSON, ids, process helpers and formatting. No dependencies.
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

// ---------- store ----------

export const storeDir = (store) => resolve(store || process.env.ORC_HOME || join(process.cwd(), '.orc'));
export const sessionsDir = (store) => join(storeDir(store), 'sessions');
export const flowsDir = (store) => join(storeDir(store), 'flows');

const pad = (n, w = 2) => String(n).padStart(w, '0');
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Create a new session folder with a sortable unique id (20260927-143012-a1b2). */
export function newSessionDir(store, wanted) {
  mkdirSync(sessionsDir(store), { recursive: true });
  for (let i = 0; i < 50; i++) {
    const id = wanted && i === 0 ? wanted : `${stamp()}-${randomBytes(2).toString('hex')}`;
    if (!/^[\w.-]+$/.test(id)) throw new Error(`bad session id "${id}"`);
    const dir = join(sessionsDir(store), id);
    try { mkdirSync(dir); return { id, dir }; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (wanted && i === 0) throw new Error(`session ${id} already exists`);
    }
  }
  throw new Error('could not allocate a session id');
}

/** Write JSON atomically (temp file + rename), so a concurrent reader never sees half a file. */
export function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, file);
}

export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

// ---------- processes ----------

export function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Signal a whole process group (children are spawned detached, so pid = pgid). */
export function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return false;
  try { process.kill(-pid, signal); return true; } catch {
    try { process.kill(pid, signal); return true; } catch { return false; }
  }
}

/** Run a shell command asynchronously in its own process group. → { code, out, timedOut } */
export function sh(cmd, { cwd, timeoutSec = 600, env } = {}) {
  return new Promise((done) => {
    let out = '';
    let timedOut = false;
    const keep = (b) => { out += b; if (out.length > 64 * 1024) out = out.slice(-64 * 1024); };
    const child = spawn('/bin/sh', ['-c', cmd], { cwd, env: env || process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid, 'SIGKILL'); }, timeoutSec * 1000);
    child.on('error', (e) => { clearTimeout(timer); done({ code: 127, out: String(e.message), timedOut }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      done({ code: timedOut ? 124 : code ?? (signal ? 128 : 1), out: timedOut ? out + `\n[timed out after ${timeoutSec}s]` : out, timedOut });
    });
  });
}

// ---------- formatting ----------

export function fmtCost(usd) { return usd == null ? '-' : `$${Number(usd).toFixed(2)}`; }

export function fmtTokens(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

export function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h${pad(Math.floor(s / 60) % 60)}m`;
}

export const totalTokens = (u = {}) => (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
export const toolCount = (tools = {}) => Object.values(tools).reduce((a, b) => a + b, 0);

export function elapsedMs(meta, now = Date.now()) {
  const start = Date.parse(meta.startedAt);
  const end = meta.endedAt ? Date.parse(meta.endedAt) : now;
  return Number.isFinite(start) ? end - start : null;
}

/** Plain text table: rows of arrays, first row is the header. */
export function table(rows) {
  const w = [];
  for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); });
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i]))).join('  ')).join('\n');
}

export const short = (s, n = 80) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export const exists = existsSync;
