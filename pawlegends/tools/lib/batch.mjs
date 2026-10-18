/**
 * Run a large headless batch across several Node processes (POC.md §15 items 11 and 12, nightly):
 * `tools/headless-match.mjs --json` fans the seed range out to `--procs` workers and merges the rows and per-hero
 * totals. Every match is still one deterministic run on one core, so the result is the same as one long serial run.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { PKG_ROOT } from './sim-bundle.mjs';

/**
 * @param {{ profile: string, difficulty: string, from?: number, seeds: number, procs?: number, hero?: string, trick?: string, fun?: boolean }} o
 * @returns {Promise<{ rows: any[], perHero: Record<string, { slots: number, wins: number, kills: number, deaths: number, assists: number }>, fun: any }>}
 */
export async function runBatch(o) {
  const procs = Math.max(1, Math.min(o.procs ?? Math.max(1, cpus().length - 2), o.seeds));
  const args = [join(PKG_ROOT, 'tools/headless-match.mjs'), '--seeds', String(o.seeds), '--from', String(o.from ?? 1), '--procs', String(procs)];
  args.push('--profile', o.profile, '--difficulty', o.difficulty, '--hero', o.hero ?? 'random', '--trick', o.trick ?? 'random', '--json');
  if (o.fun) args.push('--fun');
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const p = spawn(process.execPath, args, { cwd: PKG_ROOT });
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`headless-match batch failed: ${err.slice(0, 800)}`));
      }
    });
  });
}
