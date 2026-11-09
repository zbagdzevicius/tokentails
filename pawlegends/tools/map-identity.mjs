#!/usr/bin/env node
/**
 * Sim v18 gate G1 (docs/plans/moba/MAP-5V5.md §3.4, §7): the 3v3 map (Purrhaven Crossing) plays exactly as in v17.
 * `node tools/map-identity.mjs --write <file> [--seeds 500]` records, per seed, the final hash and the folded hash trail
 * of three profiles (co-op fuzz, party fuzz, PvP fuzz; tools/lib/fuzz-entry.ts); `--check <file>` replays the same seeds
 * with the current sim and exits 1 on the first difference. Write the baseline from the frozen version's commit.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 500);
const from = Number(argValue('--from') ?? 0);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));

async function worker() {
  const fz = await importSim('tools/lib/fuzz-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) {
    const seed = fz.fuzzSeed(i);
    const a = fz.fuzzFinal(seed);
    const b = fz.fuzzPartyFinal(seed);
    const c = fz.fuzzPvpFinal(seed);
    rows.push({ i, coop: `${a.finalHash}:${a.trail}:${a.ticks}`, party: `${b.finalHash}:${b.trail}:${b.ticks}`, pvp: `${c.finalHash}:${c.trail}:${c.ticks}` });
  }
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
            reject(new Error(`map-identity ${f}..${f + c - 1} failed: ${err.slice(0, 800)}`));
          }
        });
      }),
    );
  }
  return (await Promise.all(jobs)).flat().sort((a, b) => a.i - b.i);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (hasFlag('--worker')) await worker();
  else {
    const t0 = Date.now();
    const rows = await run();
    const write = argValue('--write');
    const check = argValue('--check');
    if (write) {
      writeFileSync(write, JSON.stringify(rows));
      console.log(`map-identity: wrote ${rows.length} seeds × 3 profiles to ${write} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } else if (check) {
      const base = new Map(JSON.parse(readFileSync(check, 'utf8')).map((r) => [r.i, r]));
      let bad = 0;
      let n = 0;
      for (const r of rows) {
        const b = base.get(r.i);
        if (!b) continue;
        for (const k of ['coop', 'party', 'pvp']) {
          n++;
          if (b[k] !== r[k]) {
            bad++;
            if (bad <= 10) console.log(`  DIFF seed #${r.i} ${k}: ${b[k]} -> ${r[k]}`);
          }
        }
      }
      console.log(`map-identity: ${n - bad}/${n} identical (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      process.exit(bad === 0 && n > 0 ? 0 : 1);
    }
  }
}
