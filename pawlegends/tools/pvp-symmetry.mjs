#!/usr/bin/env node
/**
 * Sim v16 PvP symmetry gate (docs/plans/moba/V16.md §3.1.8, §3.3): `node tools/pvp-symmetry.mjs [--seeds 2000]
 * [--from 1] [--procs N] [--json]`. Each seed plays two PvP matches with six `normal` pilots: cats on the left (team 0)
 * and the same line-up with the species swapped. Passes when the left side (team 0) wins 47% to 53% and the cats 46% to
 * 54% of all matches; exits 1 otherwise. A side bias outside the band pulls in the parity-alternating iteration item.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 2000);
const from = Number(argValue('--from') ?? 1);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));
const json = hasFlag('--json');

/** Aggregate pair rows: map side (team 0) and species win rates in %, over 2 × rows matches. */
export function symmetryStats(rows) {
  let left = 0;
  let cats = 0;
  for (const r of rows) {
    if (r.catsLeftWinner === 0) {
      left++;
      cats++;
    }
    if (r.dogsLeftWinner === 0) left++;
    else cats++;
  }
  const n = rows.length * 2;
  return { matches: n, leftPct: (100 * left) / n, catsPct: (100 * cats) / n };
}

export const symmetryGates = (s) => [
  ['map side (team 0) win rate 47% to 53%', s.leftPct >= 47 && s.leftPct <= 53, `${s.leftPct.toFixed(1)}% of ${s.matches}`],
  ['cat species win rate 46% to 54%', s.catsPct >= 46 && s.catsPct <= 54, `${s.catsPct.toFixed(1)}% of ${s.matches}`],
];

async function worker() {
  const fz = await importSim('tools/lib/fuzz-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.pvpSymmetryPair(i));
  process.stdout.write(JSON.stringify(rows));
}

async function run() {
  const per = Math.ceil(seeds / procs);
  const jobs = [];
  for (let k = 0; k < procs; k++) {
    const f = from + k * per;
    const c = Math.min(per, from + seeds - f);
    if (c <= 0) break;
    jobs.push(
      new Promise((resolve, reject) => {
        let out = '';
        let err = '';
        const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--seeds', String(c), '--from', String(f), '--procs', '1', '--worker']);
        ch.stdout.on('data', (d) => (out += d));
        ch.stderr.on('data', (d) => (err += d));
        ch.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`pvp-symmetry ${f}..${f + c - 1} failed: ${err.slice(0, 500)}`));
          }
        });
      }),
    );
  }
  return (await Promise.all(jobs)).flat();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (hasFlag('--worker')) await worker();
  else {
    const t0 = Date.now();
    const rows = await run();
    const stats = symmetryStats(rows);
    const gates = symmetryGates(stats);
    const ticks = rows.flatMap((r) => r.ticks).sort((a, b) => a - b);
    const median = ticks[ticks.length >> 1] ?? 0;
    if (json) console.log(JSON.stringify({ stats, gates, rows }, null, 2));
    else {
      console.log(`pvp-symmetry: ${stats.matches} matches (${seeds} seeds × both sides, six normal pilots, ${procs} processes, ${((Date.now() - t0) / 1000).toFixed(0)} s), median ${Math.floor(median / 1800)}:${String(Math.floor((median % 1800) / 30)).padStart(2, '0')}`);
      for (const [name, ok, value] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${value}`);
    }
    process.exit(gates.every((g) => g[1]) ? 0 : 1);
  }
}
