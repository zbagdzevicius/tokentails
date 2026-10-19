#!/usr/bin/env node
/**
 * GAPS A2 calibration: the grade distribution per role for a Normal-profile human against Normal bots.
 *
 *   node tools/grade-calibrate.mjs [--seeds 400] [--from 1] [--difficulty normal] [--profile normal] [--trick pounce|random]
 *                                  [--cache file.json] [--check]
 *
 * Runs `npm run match -- --hero <h> --difficulty <d> --profile <p> --seeds <n> --json --stats` once per hero (slot 0
 * is the human), grades slot 0 with src/meta/grade.ts and prints, per role: the share of S/A/B/C with the thresholds
 * in the code, the share of losses graded A or S, and the thresholds that would hit the target exactly
 * (12% S, 30% A, 35% B, 23% C). `--cache` keeps the raw rows so a re-fit needs no new matches. `--check` exits 1
 * when a role is more than 5 points off any target share (the GAPS §7 A2 gate), or losses graded A or S are under
 * 25%. Check on seeds the thresholds were not fitted on (e.g. `--from 1001 --seeds 400`): at 200 seeds a hero the
 * sampling error alone is about 3 points.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const HEROES = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe'];
const TARGET = { S: 0.12, A: 0.3, B: 0.35, C: 0.23 };
/** GAPS §7: per-role grade spread within ±5 points of the target (the epsilon keeps exactly 5.0 points a pass). */
const TOLERANCE = 0.05 + 1e-9;
const seeds = Number(argValue('--seeds') ?? 400);
const from = Number(argValue('--from') ?? 1);
const difficulty = argValue('--difficulty') ?? 'normal';
const profile = argValue('--profile') ?? 'normal';
const trick = argValue('--trick') ?? 'random';
const cache = argValue('--cache');
const check = hasFlag('--check');
const here = dirname(fileURLToPath(import.meta.url));

function runHero(hero) {
  return new Promise((res, rej) => {
    const args = [resolve(here, 'headless-match.mjs'), '--hero', hero, '--trick', trick, '--difficulty', difficulty, '--profile', profile, '--seeds', String(seeds), '--from', String(from), '--json', '--stats'];
    const p = spawn(process.execPath, args, { cwd: resolve(here, '..') });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => {
      try {
        res(JSON.parse(out).rows.map((r) => ({ winner: r.winner, stats: r.stats })));
      } catch {
        rej(new Error(`grade-calibrate: ${hero} failed: ${err.slice(0, 800)}`));
      }
    });
  });
}

let data;
const cached = !!cache && existsSync(cache);
if (cached) data = JSON.parse(readFileSync(cache, 'utf8'));
else {
  data = {};
  for (const h of HEROES) {
    process.stderr.write(`grade-calibrate: ${h} (${seeds} seeds)...\n`);
    data[h] = await runHero(h);
  }
  if (cache) writeFileSync(cache, JSON.stringify(data));
}

const g = await importSim('src/meta/grade.ts');
const byRole = {};
for (const [hero, rows] of Object.entries(data)) {
  const role = g.roleOf(hero);
  for (const r of rows) {
    const score = g.gradeScore(r.stats, 0);
    (byRole[role] ??= []).push({ hero, score, grade: g.gradeOf(score, role), won: r.winner === 0 });
  }
}

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];
let ok = true;
const lines = ['| Role | Heroes | n | Win | S | A | B | C | Losses A/S | Fit S | Fit A | Fit B |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
let lossAll = 0;
let lossAS = 0;
for (const [role, list] of Object.entries(byRole)) {
  const n = list.length;
  const share = (k) => list.filter((x) => x.grade === k).length / n;
  const losses = list.filter((x) => !x.won);
  const las = losses.filter((x) => x.grade === 'S' || x.grade === 'A').length / Math.max(1, losses.length);
  lossAll += losses.length;
  lossAS += losses.filter((x) => x.grade === 'S' || x.grade === 'A').length;
  const sorted = list.map((x) => x.score).sort((a, b) => a - b);
  const fit = { S: quantile(sorted, 1 - TARGET.S), A: quantile(sorted, 1 - TARGET.S - TARGET.A), B: quantile(sorted, TARGET.C) };
  for (const k of ['S', 'A', 'B', 'C']) if (Math.abs(share(k) - TARGET[k]) > TOLERANCE) ok = false;
  if (las < 0.25) ok = false;
  const heroes = [...new Set(list.map((x) => x.hero))].join(', ');
  lines.push(
    `| ${role} | ${heroes} | ${n} | ${pct(list.filter((x) => x.won).length / n)} | ${pct(share('S'))} | ${pct(share('A'))} | ${pct(share('B'))} | ${pct(share('C'))} | ${pct(las)} | ${fit.S.toFixed(3)} | ${fit.A.toFixed(3)} | ${fit.B.toFixed(3)} |`,
  );
}
console.log(cached ? `grade-calibrate: rows from ${cache}` : `grade-calibrate: ${profile} human vs ${difficulty} bots, seeds ${from}..${from + seeds - 1} a hero, trick ${trick}`);
console.log(lines.join('\n'));
console.log(`all roles: losses graded A or S ${pct(lossAS / Math.max(1, lossAll))} (target >= 25%)`);
if (check) {
  console.log(ok ? 'PASS' : 'FAIL');
  process.exitCode = ok ? 0 : 1;
}
