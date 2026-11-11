#!/usr/bin/env node
/**
 * Sim v19 5v5 gates on Hearthwood Divide (docs/plans/moba/MAP-5V5.md §7):
 *
 *   node tools/hearth-gates.mjs [--seeds 300] [--from 1] [--procs N] [--det 40] [--json]
 *
 * - G5/G6 symmetry and balance: each seed plays two PvP matches with ten `normal` pilots, cats on team 0 and then the
 *   same line-up with the sides swapped (tools/lib/hearth-entry.ts hearthSymmetryPair). Passes when team 0 wins 47% to
 *   53%, cats 47% to 53%, every hero 46% to 54% (heroes with fewer than 60 matches are reported, not gated), the
 *   median length lies within 12:00 to 14:30 and at most 2% reach the safety end.
 * - G2 determinism: `--det` seeds each of a solo, a party and a PvP 5v5 match recorded and re-simulated from the record.
 * Exits 1 when a gate fails.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 300);
const from = Number(argValue('--from') ?? 1);
const det = Number(argValue('--det') ?? 40);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));
const json = hasFlag('--json');
// Experiment only (balance refits): `--tune file.json` replaces HEARTHWOOD_PVP's species and hero rows in the bundle,
// `{ cat?: {dmgBp, takenBp}, dog?: {...}, hero?: { id: {dmgBp, takenBp} }, pvp3?: { id: {dmgBp, takenBp} }, patches?: [{ file, from, to, re? }] }`
// (`pvp3` replaces a hero's own 3v3 `pvp` row); the source and the vendored sim are untouched.
const tune = argValue('--tune');
const TICKS_PER_MIN = 1800;

async function worker() {
  const fz = await importSim('tools/lib/hearth-entry.ts', tune ? await tunePatches(tune) : []);
  const kind = argValue('--kind');
  const rows = [];
  for (let i = from; i < from + seeds; i++) {
    const seed = Math.imul(i, 0x9e3779b1) >>> 0;
    if (kind === 'det') {
      const a = fz.hearthSoloPlay(seed);
      const b = fz.hearthPartyPlay(seed);
      const c = fz.hearthPvpPlay(seed);
      rows.push({ i, ok: [a.ok, b.ok, c.ok], ticks: [a.ticks, b.ticks, c.ticks] });
    } else rows.push(fz.hearthSymmetryPair(seed));
  }
  process.stdout.write(JSON.stringify(rows));
}

async function tunePatches(path) {
  const { readFileSync } = await import('node:fs');
  const t = JSON.parse(readFileSync(path, 'utf8'));
  const file = 'src/data/maps/hearthwood.ts';
  const row = (r) => `Object.freeze({ dmgBp: ${r.dmgBp ?? 10000}, takenBp: ${r.takenBp ?? 10000} })`;
  const out = [];
  for (const side of ['cat', 'dog']) if (t[side]) out.push({ file, from: new RegExp(`${side}: Object\\.freeze\\(\\{[^}]*\\}\\)`), to: `${side}: ${row(t[side])}`, name: `tune ${side}` });
  if (t.hero) {
    const body = Object.entries(t.hero).map(([h, r]) => `${h}: { dmgBp: ${r.dmgBp ?? 10000}, takenBp: ${r.takenBp ?? 10000} }`).join(', ');
    out.push({ file, from: /hero: Object\.freeze\(\{[^]*?\}\)/, to: `hero: Object.freeze({ ${body} })`, name: 'tune hero' });
  }
  // The heroes' own 3v3 `pvp` rows (they apply on Hearthwood too) and free source patches, as headless-match --tune.
  for (const [h, r] of Object.entries(t.pvp3 ?? {})) {
    // A row equal to the source would match nothing (sim-bundle throws on a patch that changes nothing): skip it.
    const cur = /pvp: \{ dmgBp: (\d+), takenBp: (\d+) \}/.exec(readFileSync(`src/data/heroes/${h}.ts`, 'utf8'));
    if (cur && +cur[1] === r.dmgBp && +cur[2] === r.takenBp) continue;
    out.push({ file: `src/data/heroes/${h}.ts`, from: /pvp: \{\s*dmgBp: \d+,\s*takenBp: \d+\s*\}/, to: `pvp: { dmgBp: ${r.dmgBp}, takenBp: ${r.takenBp} }`, name: `tune pvp3 ${h}` });
  }
  for (const [k, p] of (t.patches ?? []).entries()) out.push({ file: p.file, from: p.re ? new RegExp(p.from) : p.from, to: p.to, name: `tune patch ${k}` });
  return out;
}

function runJobs(kind, total, start) {
  const n = Math.max(1, Math.min(procs, total));
  const per = Math.ceil(total / n);
  const jobs = [];
  for (let k = 0; k < n; k++) {
    const f = start + k * per;
    const c = Math.min(per, start + total - f);
    if (c <= 0) break;
    jobs.push(
      new Promise((resolve, reject) => {
        let out = '';
        let err = '';
        const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--seeds', String(c), '--from', String(f), '--procs', '1', '--worker', '--kind', kind, ...(tune ? ['--tune', tune] : [])]);
        ch.stdout.on('data', (d) => (out += d));
        ch.stderr.on('data', (d) => (err += d));
        ch.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`hearth-gates ${kind} ${f}..${f + c - 1} failed: ${err.slice(0, 800)}`));
          }
        });
      }),
    );
  }
  return Promise.all(jobs).then((r) => r.flat());
}

const pct = (a, n) => (n ? (100 * a) / n : 0);
const mmss = (t) => `${Math.floor(t / TICKS_PER_MIN)}:${String(Math.floor((t % TICKS_PER_MIN) / 30)).padStart(2, '0')}`;

/** Aggregate symmetry rows into the gate numbers. */
export function hearthStats(rows) {
  let left = 0;
  let cats = 0;
  const hero = {};
  const add = (h, won) => {
    hero[h] ??= { n: 0, w: 0 };
    hero[h].n++;
    if (won) hero[h].w++;
  };
  const ticks = [];
  let safety = 0;
  let grizz4 = 0;
  let pudReach = 0;
  let pudTaken = 0;
  for (const r of rows) {
    // Match 1: cats on team 0. Match 2: dogs on team 0.
    const catsWon1 = r.catsLeftWinner === 0;
    const catsWon2 = r.dogsLeftWinner === 1;
    if (r.catsLeftWinner === 0) left++;
    if (r.dogsLeftWinner === 0) left++;
    if (catsWon1) cats++;
    if (catsWon2) cats++;
    for (const h of r.cats) {
      add(h, catsWon1);
      add(h, catsWon2);
    }
    for (const h of r.dogs) {
      add(h, !catsWon1);
      add(h, !catsWon2);
    }
    for (let k = 0; k < 2; k++) {
      ticks.push(r.ticks[k]);
      if (r.reasons[k] === 'safetyEnd') safety++;
      if (r.grizz[k] >= 0 && r.grizz[k] <= 4 * TICKS_PER_MIN) grizz4++;
      if (r.ticks[k] >= 9 * TICKS_PER_MIN) {
        pudReach++;
        if (r.pudding[k] > 0) pudTaken++;
      }
    }
  }
  ticks.sort((a, b) => a - b);
  const n = rows.length * 2;
  return {
    matches: n,
    leftPct: pct(left, n),
    catsPct: pct(cats, n),
    heroes: Object.fromEntries(Object.entries(hero).sort().map(([h, v]) => [h, { n: v.n, pct: pct(v.w, v.n) }])),
    p50: ticks[ticks.length >> 1] ?? 0,
    p95: ticks[Math.floor(ticks.length * 0.95)] ?? 0,
    safetyPct: pct(safety, n),
    grizz4Pct: pct(grizz4, n),
    pudPct: pct(pudTaken, pudReach),
  };
}

export function hearthGates(s) {
  const heroes = Object.entries(s.heroes).filter(([, v]) => v.n >= 60);
  const off = heroes.filter(([, v]) => v.pct < 46 || v.pct > 54);
  return [
    ['G6 side (team 0) win rate 47% to 53%', s.leftPct >= 47 && s.leftPct <= 53, `${s.leftPct.toFixed(1)}% of ${s.matches}`],
    ['G5 cats vs dogs 47% to 53%', s.catsPct >= 47 && s.catsPct <= 53, `${s.catsPct.toFixed(1)}%`],
    ['G5 every hero 46% to 54% (n ≥ 60)', off.length === 0, off.length ? off.map(([h, v]) => `${h} ${v.pct.toFixed(1)}%`).join(', ') : `${heroes.length} heroes in band`],
    ['G5 match length p50 12:00 to 14:30', s.p50 >= 12 * TICKS_PER_MIN && s.p50 <= 14.5 * TICKS_PER_MIN, `p50 ${mmss(s.p50)}, p95 ${mmss(s.p95)}`],
    ['G5 safety end ≤ 2%', s.safetyPct <= 2, `${s.safetyPct.toFixed(1)}%`],
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (hasFlag('--worker')) await worker();
  else {
    const t0 = Date.now();
    const rows = seeds > 0 ? await runJobs('pair', seeds, from) : [];
    const detRows = det > 0 ? await runJobs('det', det, from) : [];
    const stats = hearthStats(rows);
    const gates = rows.length ? hearthGates(stats) : [];
    const detBad = detRows.filter((r) => !r.ok.every(Boolean));
    gates.push(['G2 determinism: solo, party and PvP 5v5 records re-sim identically', detBad.length === 0, `${detRows.length * 3 - detBad.length} of ${detRows.length * 3}${detBad.length ? `; failing seeds ${detBad.map((r) => r.i).join(', ')}` : ''}`]);
    if (json) console.log(JSON.stringify({ stats, gates, rows }, null, 2));
    else {
      console.log(`hearth-gates: ${stats.matches} symmetry matches (${seeds} seeds), ${detRows.length * 3} determinism matches, ${procs} processes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      console.log(`  Grizzlechop taken by 4:00 in ${stats.grizz4Pct.toFixed(1)}%; Great Pudding calmed in ${stats.pudPct.toFixed(1)}% of matches reaching 9:00`);
      console.log(`  heroes: ${Object.entries(stats.heroes).map(([h, v]) => `${h} ${v.pct.toFixed(0)}% (${v.n})`).join(', ')}`);
      for (const [name, ok, value] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${value}`);
    }
    process.exit(gates.every((g) => g[1]) ? 0 : 1);
  }
}
