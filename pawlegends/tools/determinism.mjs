#!/usr/bin/env node
/**
 * Determinism fuzz at scale (POC.md §15 item 1): `node tools/determinism.mjs --seeds 1000 [--from 0] [--procs 10]`.
 * Each seed (tools/lib/fuzz-entry.ts `fuzzSeed`) plays a full match with a random command stream, records it and
 * replays it from the record; the hash trails (every 30 ticks) and results must match. Seeds run in parallel
 * processes (`--procs`, default cores − 2); `--json` prints the rows. Exits 1 on any mismatch.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 100);
const from = Number(argValue('--from') ?? 0);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));
const json = hasFlag('--json');

async function worker() {
  const fz = await importSim('tools/lib/fuzz-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.fuzzMatch(fz.fuzzSeed(i)));
  process.stdout.write(JSON.stringify(rows));
}

/** Run the seed range in `procs` child processes (each with `--procs 1`) and merge. */
export async function runFuzz(fromIdx, n, p) {
  const per = Math.ceil(n / p);
  const jobs = [];
  for (let k = 0; k < p; k++) {
    const f = fromIdx + k * per;
    const c = Math.min(per, fromIdx + n - f);
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
            reject(new Error(`fuzz ${f}..${f + c - 1} failed: ${err.slice(0, 500)}`));
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
    const rows = await runFuzz(from, seeds, procs);
    const bad = rows.filter((r) => !r.ok);
    if (json) console.log(JSON.stringify({ rows, failures: bad.length }, null, 2));
    else {
      for (const b of bad) console.error(`seed ${b.seed} (${b.hero}, ${b.difficulty}): first differing hash at tick ${b.firstDiff * 30}`);
      const cmds = rows.reduce((s, r) => s + r.commands, 0);
      console.log(
        `determinism: ${rows.length} seeds, ${cmds} commands, record → replay hash trails every 30 ticks: ` +
          `${bad.length === 0 ? 'all identical' : `${bad.length} MISMATCH`} (${procs} processes, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
      );
    }
    process.exit(bad.length ? 1 : 0);
  }
}
