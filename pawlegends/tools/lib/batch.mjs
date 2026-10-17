/**
 * Run a large headless batch across several Node processes (POC.md §15 items 11 and 12, nightly). Each process runs
 * `tools/headless-match.mjs --json` on its own seed range; the rows and per-hero totals are merged. Every match is
 * still one deterministic run on one core, so the result is the same as one long serial run, only faster.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { PKG_ROOT } from './sim-bundle.mjs';

/**
 * @param {{ profile: string, difficulty: string, from?: number, seeds: number, procs?: number, hero?: string, trick?: string }} o
 * @returns {Promise<{ rows: any[], perHero: Record<string, { slots: number, wins: number, kills: number, deaths: number, assists: number }> }>}
 */
export async function runBatch(o) {
  const from = o.from ?? 1;
  const procs = Math.max(1, Math.min(o.procs ?? Math.max(1, cpus().length - 2), o.seeds));
  const per = Math.ceil(o.seeds / procs);
  const jobs = [];
  for (let i = 0; i < procs; i++) {
    const f = from + i * per;
    const n = Math.min(per, from + o.seeds - f);
    if (n <= 0) break;
    const args = [join(PKG_ROOT, 'tools/headless-match.mjs'), '--seeds', String(n), '--from', String(f), '--profile', o.profile];
    args.push('--difficulty', o.difficulty, '--hero', o.hero ?? 'random', '--trick', o.trick ?? 'random', '--json');
    jobs.push(
      new Promise((resolve, reject) => {
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
            reject(new Error(`headless-match seeds ${f}..${f + n - 1} failed: ${err.slice(0, 500)}`));
          }
        });
      }),
    );
  }
  const parts = await Promise.all(jobs);
  const rows = parts.flatMap((p) => p.rows).sort((a, b) => a.seed - b.seed);
  const perHero = {};
  for (const p of parts) {
    for (const [hero, h] of Object.entries(p.perHero)) {
      const t = (perHero[hero] ??= { slots: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
      t.slots += h.slots;
      t.wins += h.wins;
      t.kills += h.kills;
      t.deaths += h.deaths;
      t.assists += h.assists;
    }
  }
  return { rows, perHero };
}
