// Hermetic test setup: every test file gets its own temp ORC_HOME and the fake claude.
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
export const FAKE = join(here, 'fixtures', 'fake-claude.mjs');
export const ORC = join(here, '..', 'bin', 'orc.mjs');

export function setup() {
  const root = mkdtempSync(join(tmpdir(), 'orc-test-'));
  const env = { ...process.env, ORC_HOME: join(root, '.orc'), ORC_CLAUDE_BIN: FAKE, FAKE_CLAUDE_LOG: join(root, 'claude.log') };
  for (const k of ['ORC_PERMISSION_MODE', 'ORC_TIMEOUT']) delete env[k];
  for (const k of Object.keys(env)) if (k.startsWith('FUND_')) delete env[k]; // orc never reads them; keep nothing leaking in
  Object.assign(process.env, env);
  for (const k of ['ORC_PERMISSION_MODE', 'ORC_TIMEOUT']) delete process.env[k];
  const children = new Set();
  return {
    root, env, store: env.ORC_HOME,
    orc(args, { input, cwd } = {}) {
      return spawnSync(process.execPath, [ORC, ...args], { input, cwd: cwd || root, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
    },
    orcAsync(args, { input, cwd } = {}) {
      const child = spawn(process.execPath, [ORC, ...args], { cwd: cwd || root, env, stdio: ['pipe', 'pipe', 'pipe'] });
      children.add(child);
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (b) => { stdout += b; });
      child.stderr.on('data', (b) => { stderr += b; });
      child.stdin.end(input ?? '');
      child.done = new Promise((r) => child.on('close', (status) => { children.delete(child); r({ status, stdout, stderr }); }));
      return child;
    },
    sessions() {
      const d = join(env.ORC_HOME, 'sessions');
      return existsSync(d) ? readdirSync(d).sort() : [];
    },
    meta(id) { return JSON.parse(readFileSync(join(env.ORC_HOME, 'sessions', id, 'meta.json'), 'utf8')); },
    file(id, name) { return readFileSync(join(env.ORC_HOME, 'sessions', id, name), 'utf8'); },
    claudeCalls() {
      const f = env.FAKE_CLAUDE_LOG;
      return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    },
    cleanup() {
      for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch {} try { c.kill('SIGKILL'); } catch {} }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 10_000, every = 50 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await sleep(every);
  }
}

export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The fake prints "grandchild <pid>" in slow/hang modes. */
export function grandchildPid(events) {
  const m = events.match(/grandchild (\d+)/);
  return m ? Number(m[1]) : null;
}
