#!/usr/bin/env node
/**
 * npm run match: N seeded headless matches in Node (POC.md §3 tools, §7.2, §14 M3, §15 items 11 and 12, the fun
 * gates of the fun plan).
 *
 *   npm run match -- [--seeds 20] [--from 1] [--difficulty rookie|easy|normal|hard] [--hero clem|random] [--trick pounce|random]
 *                    [--profile idle|novice|naive|easy|normal|parked|feeder] [--json] [--quiet] [--fun] [--procs N]
 *                    [--check-determinism] [--gate fun1|fun2|novice|idle|parked|balance|hard|feeder|feedNormal] [--balance]
 *
 * Slot 0 is played by the profile: `idle` never acts, `novice` follows the first-match tips, `naive` is the
 * scripted first-timer of the fun gates, `easy` / `normal` run the bot brain from outside the sim (through
 * commands, like a human). Slots 1..5 are the in-sim bots: allies at the allied level, enemies at `--difficulty`.
 * `--hero random` draws slot 0's hero (and `--trick random` its trick) from the seed.
 *
 * `--gate` picks the gate's run (each can be overridden by a flag) and exits 1 when a check fails:
 *   fun1     naive vs rookie, 200 seeds        match 1 (first session)
 *   fun2     naive vs easy, 200 seeds          matches 2+
 *   novice   novice vs easy (≥ 85%) or --difficulty normal (≥ 40%), 400 seeds
 *   idle     idle vs rookie, 200 seeds         doing nothing must not reliably win (≤ 50%), nor lose before 6:00
 *   parked   parked vs easy (or --difficulty rookie), 100 seeds: a human parked off the lanes at 0:30 is not
 *            followed (allies beside it ≤ 10% of the time) and the match runs at least 2:00 past the park
 *   balance  normal vs normal, 2,000 seeds     length, side, species (cats 47% to 53%, sim v9), heroes, pace, comebacks
 *            (`--balance` is an alias)
 *   hard     normal vs hard, 200 seeds         a Normal-level player wins 20% to 40% against Hard bots (sim v6)
 *   feeder   feeder vs rookie, 200 seeds       a first-timer who dives under towers and feeds still wins ≥ 80% (sim v7)
 *   feedNormal feeder vs normal, 200 seeds    (sim v8, playtest round 2) a human who feeds is in the deficit gate too:
 *            its team, down 10+ takedowns at the end, wins < 5% (the novice gate checks it on Normal and Hard)
 * `--fun` prints the fun metrics (tools/lib/funstats.mjs). `--check-determinism` plays every seed twice and fails
 * unless both runs give the same hash trail and final hash. Batches of 40+ seeds run in `--procs` processes
 * (default: cores − 2); every match is still one deterministic run.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';
import { aggregateFun, createFunTracker, formatFun, funGates } from './lib/funstats.mjs';

const GATES = {
  fun1: { profile: 'naive', difficulty: 'rookie', seeds: 200 },
  fun2: { profile: 'naive', difficulty: 'easy', seeds: 200 },
  novice: { profile: 'novice', difficulty: 'easy', seeds: 400 },
  idle: { profile: 'idle', difficulty: 'rookie', seeds: 200 },
  parked: { profile: 'parked', difficulty: 'easy', seeds: 100 },
  balance: { profile: 'normal', difficulty: 'normal', seeds: 2000 },
  hard: { profile: 'normal', difficulty: 'hard', seeds: 200 },
  feeder: { profile: 'feeder', difficulty: 'rookie', seeds: 200 },
  feedNormal: { profile: 'feeder', difficulty: 'normal', seeds: 200 },
};
const gate = argValue('--gate') ?? (hasFlag('--balance') ? 'balance' : null);
if (gate && !GATES[gate]) {
  console.error(`headless-match: unknown gate "${gate}" (${Object.keys(GATES).join(', ')})`);
  process.exit(2);
}
const def = gate ? GATES[gate] : { profile: 'idle', difficulty: 'easy', seeds: 20 };
const seeds = Number(argValue('--seeds') ?? def.seeds);
const from = Number(argValue('--from') ?? 1);
const difficulty = argValue('--difficulty') ?? def.difficulty;
const heroArg = argValue('--hero') ?? (gate ? 'random' : 'clem');
const trickArg = argValue('--trick') ?? (gate ? 'random' : 'pounce');
const profile = argValue('--profile') ?? def.profile;
const json = hasFlag('--json');
const quiet = hasFlag('--quiet') || (gate !== null && !hasFlag('--rows'));
const checkDet = hasFlag('--check-determinism');
const fun = hasFlag('--fun') || gate !== null;
const worker = hasFlag('--worker');
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? (seeds >= 40 && !worker ? Math.max(1, cpus().length - 2) : 1)), seeds));

const sim = await importSim('src/sim/index.ts');
if (!sim.PLAYER_PROFILES.includes(profile)) {
  console.error(`headless-match: unknown profile "${profile}" (${sim.PLAYER_PROFILES.join(', ')})`);
  process.exit(2);
}
if (!sim.DIFFICULTIES.includes(difficulty)) {
  console.error(`headless-match: unknown difficulty "${difficulty}" (${sim.DIFFICULTIES.join(', ')})`);
  process.exit(2);
}
const HZ = sim.TICK_HZ;
const HEROES = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe'];
/** The cat heroes (HeroData.side 'cat'); every match is cats vs dogs, so the balance gate checks the species too. */
const CAT_HEROES = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe'];
const TRICKS = ['pounce', 'snack', 'hiss'];
const fmt = (ticks) => {
  const s = Math.floor(ticks / HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** A small seeded pick for slot 0 (independent of the sim's own streams). */
const pickFor = (seed, list, salt) => list[(Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % list.length];

function play(seed, track) {
  const hero = heroArg === 'random' ? pickFor(seed, HEROES, 0x51) : heroArg;
  const trick = trickArg === 'random' ? pickFor(seed, TRICKS, 0x7a) : trickArg;
  const { picks, tricks } = sim.fillPicks(seed, hero, trick);
  const m = sim.createMatch({ seed, picks, tricks, difficulty });
  const bot = sim.createPlayerBot(m, profile);
  const tracker = track ? createFunTracker(sim, m) : null;
  const t0 = performance.now();
  while (!sim.result(m)) {
    sim.step(m, sim.playerBotCommands(m, bot));
    tracker?.observe();
  }
  const ms = performance.now() - t0;
  const snap = sim.snapshot(m, 0);
  const res = sim.result(m);
  return { res, trail: sim.hashTrail(m).slice(), ms, score: snap.score, replay: sim.replayRecord(m), fun: tracker?.finish(res) };
}

/** Play seeds [f, f + n) in this process: rows, per-hero totals, determinism failures. */
function runRange(f, n) {
  const rows = [];
  const perHero = {};
  let failures = 0;
  for (let seed = f; seed < f + n; seed++) {
    const a = play(seed, fun);
    if (checkDet) {
      const b = play(seed, false);
      const same = a.res.finalHash === b.res.finalHash && a.trail.length === b.trail.length && a.trail.every((h, i) => h === b.trail[i]);
      if (!same) {
        failures++;
        console.error(`seed ${seed}: NOT deterministic (${a.res.finalHash} vs ${b.res.finalHash})`);
      }
    }
    rows.push({
      seed,
      ticks: a.res.ticks,
      winner: a.res.winner,
      reason: a.res.reason,
      finalHash: a.res.finalHash,
      towers: a.score.towers,
      kills: a.score.kills,
      ms: Math.round(a.ms),
      inputChars: a.replay.inputs.length,
      fun: a.fun,
    });
    for (const st of a.res.stats) {
      const h = (perHero[st.hero] ??= { slots: 0, wins: 0, kills: 0, deaths: 0, assists: 0, levels: 0, heroDamage: 0 });
      h.slots++;
      if ((st.slot < 3 ? 0 : 1) === a.res.winner) h.wins++;
      h.kills += st.kills;
      h.deaths += st.deaths;
      h.assists += st.assists;
      h.levels += st.level;
      h.heroDamage += st.heroDamage;
    }
  }
  return { rows, perHero, failures };
}

/** Fan the seed range out to child processes (each runs this file with --worker). */
async function runParallel() {
  const per = Math.ceil(seeds / procs);
  const self = fileURLToPath(import.meta.url);
  const passOn = ['--difficulty', difficulty, '--hero', heroArg, '--trick', trickArg, '--profile', profile];
  if (checkDet) passOn.push('--check-determinism');
  if (fun) passOn.push('--fun');
  const jobs = [];
  for (let i = 0; i < procs; i++) {
    const f = from + i * per;
    const n = Math.min(per, from + seeds - f);
    if (n <= 0) break;
    jobs.push(
      new Promise((resolve, reject) => {
        let out = '';
        let err = '';
        const p = spawn(process.execPath, [self, '--worker', '--procs', '1', '--seeds', String(n), '--from', String(f), ...passOn]);
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (err += d));
        p.on('error', reject);
        p.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`headless-match seeds ${f}..${f + n - 1} failed: ${err.slice(0, 800)}`));
          }
        });
      }),
    );
  }
  const parts = await Promise.all(jobs);
  const rows = parts.flatMap((p) => p.rows).sort((a, b) => a.seed - b.seed);
  const perHero = {};
  let failures = 0;
  for (const p of parts) {
    failures += p.failures;
    for (const [hero, h] of Object.entries(p.perHero)) {
      const t = (perHero[hero] ??= { slots: 0, wins: 0, kills: 0, deaths: 0, assists: 0, levels: 0, heroDamage: 0 });
      for (const k of Object.keys(t)) t[k] += h[k];
    }
  }
  return { rows, perHero, failures };
}

if (worker) {
  // Exit only once the pipe has taken the whole row set: stdout pipes are asynchronous on macOS, and an early
  // process.exit truncated large batches (200 seeds a worker on --gate balance).
  process.stdout.write(JSON.stringify(runRange(from, seeds)), () => process.exit(0));
} else {

const t0 = performance.now();
const { rows, perHero, failures } = procs > 1 ? await runParallel() : runRange(from, seeds);
const wall = ((performance.now() - t0) / 1000).toFixed(1);

const sorted = rows.map((r) => r.ticks).sort((x, y) => x - y);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
const summary = {
  matches: rows.length,
  medianTicks: pct(50),
  medianLength: fmt(pct(50)),
  p95Ticks: pct(95),
  p95Length: fmt(pct(95)),
  coreKills: rows.filter((r) => r.reason === 'core').length,
  safetyEnds: rows.filter((r) => r.reason === 'safetyEnd').length,
  purrhavenWins: rows.filter((r) => r.winner === 0).length,
  woofWins: rows.filter((r) => r.winner === 1).length,
  msPerMatch: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
  maxMs: Math.max(...rows.map((r) => r.ms)),
  avgTakedowns: (rows.reduce((s, r) => s + r.kills[0] + r.kills[1], 0) / rows.length).toFixed(1),
  maxInputChars: Math.max(...rows.map((r) => r.inputChars)),
  deterministic: checkDet ? failures === 0 : undefined,
};
const funAgg = fun ? aggregateFun(rows.map((r) => r.fun), sim.timelineFor(difficulty).suddenDeath) : null;
const gates = gate ? funGates(gate, funAgg, perHero, difficulty, CAT_HEROES) : [];
if (checkDet) gates.push(['deterministic (every seed played twice)', failures === 0, failures === 0 ? 'yes' : `${failures} differ`]);

if (json) console.log(JSON.stringify({ rows, summary, perHero, fun: funAgg, gates }, null, 2));
else {
  if (!quiet) {
    for (const r of rows) {
      console.log(
        `seed ${String(r.seed).padStart(6)}  ${fmt(r.ticks).padStart(5)}  ${r.winner === 0 ? 'Purrhaven' : 'Woof     '}  ${r.reason.padEnd(9)}  ` +
          `towers ${r.towers[0]}-${r.towers[1]}  kills ${r.kills[0]}-${r.kills[1]}  ${r.finalHash}  ${r.ms} ms`,
      );
    }
  }
  console.log(
    `\n${summary.matches} matches (${profile} + bots, ${difficulty}${gate ? `, gate ${gate}` : ''}): median ${summary.medianLength}, p95 ${summary.p95Length}, ` +
      `core kills ${summary.coreKills}, safety ends ${summary.safetyEnds}, Purrhaven ${summary.purrhavenWins} / Woof ${summary.woofWins}, ` +
      `takedowns ${summary.avgTakedowns} a match, ${summary.msPerMatch} ms a match (max ${summary.maxMs}), inputs ≤ ${summary.maxInputChars} chars, ${wall} s wall` +
      (checkDet ? `, deterministic: ${failures === 0 ? 'yes' : `NO (${failures})`}` : ''),
  );
  for (const [hero, h] of Object.entries(perHero)) {
    const avg = (v) => (v / h.slots).toFixed(1);
    console.log(
      `  ${hero.padEnd(10)} ${String(h.slots).padStart(4)} slots  win ${((100 * h.wins) / h.slots).toFixed(1)}%  ` +
        `K/D/A ${avg(h.kills)}/${avg(h.deaths)}/${avg(h.assists)}  level ${avg(h.levels)}  hero dmg ${avg(h.heroDamage)}`,
    );
  }
  if (funAgg) console.log(formatFun(funAgg));
  for (const [name, ok, value] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${value}`);
}
// exitCode, not exit(): a piped stdout is asynchronous and process.exit truncated large --json output.
process.exitCode = failures > 0 || gates.some((g) => !g[1]) ? 1 : 0;
}
