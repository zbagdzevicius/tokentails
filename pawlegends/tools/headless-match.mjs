#!/usr/bin/env node
/**
 * npm run match: N seeded headless matches in Node (POC.md §3 tools, §7.2, §14 M3, §15 items 11 and 12).
 *
 *   npm run match -- [--seeds 20] [--from 1] [--difficulty easy|normal] [--hero clem|random] [--trick pounce|random]
 *                    [--profile idle|novice|easy|normal] [--json] [--quiet] [--check-determinism] [--balance]
 *
 * Slot 0 is played by the profile: `idle` never acts, `novice` is the scripted new player (§7.2 tuning target),
 * `easy` / `normal` run the bot brain from outside the sim (through commands, like a human). Slots 1..5 are the
 * in-sim bots: allies at the allied level, enemies at `--difficulty`. `--hero random` draws slot 0's hero (and
 * `--trick random` its trick) from the seed, so a batch covers every hero on both sides.
 *
 * Prints one line per seed (with --quiet only the summary), then: median and p95 length, how many ended by a core
 * kill and how many reached the 11:00 safety end, side win rate, sim time per match, and per hero: slots, win rate,
 * K/D/A, level, hero damage. `--check-determinism` plays every seed twice and fails unless both runs give the same
 * hash trail and final hash. `--balance` checks the §14 M3 and §15 item 11 gates (median 7:00 to 9:00, p95 ≤ 10:30,
 * 100% by core kill before 11:00, side 45% to 55%, each hero 42% to 58%) and exits 1 when one fails.
 */
import { performance } from 'node:perf_hooks';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 20);
const from = Number(argValue('--from') ?? 1);
const difficulty = argValue('--difficulty') ?? 'easy';
const heroArg = argValue('--hero') ?? 'clem';
const trickArg = argValue('--trick') ?? 'pounce';
const profile = argValue('--profile') ?? 'idle';
const json = hasFlag('--json');
const quiet = hasFlag('--quiet');
const checkDet = hasFlag('--check-determinism');
const balance = hasFlag('--balance');

const sim = await importSim('src/sim/index.ts');
if (!sim.PLAYER_PROFILES.includes(profile)) {
  console.error(`headless-match: unknown profile "${profile}" (${sim.PLAYER_PROFILES.join(', ')})`);
  process.exit(2);
}
const HZ = sim.TICK_HZ;
const HEROES = ['clem', 'sage', 'brutus', 'cacklejaw'];
const TRICKS = ['pounce', 'snack', 'hiss'];
const fmt = (ticks) => {
  const s = Math.floor(ticks / HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** A small seeded pick for slot 0 (independent of the sim's own streams). */
const pickFor = (seed, list, salt) => list[(Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % list.length];

function play(seed) {
  const hero = heroArg === 'random' ? pickFor(seed, HEROES, 0x51) : heroArg;
  const trick = trickArg === 'random' ? pickFor(seed, TRICKS, 0x7a) : trickArg;
  const { picks, tricks } = sim.fillPicks(seed, hero, trick);
  const m = sim.createMatch({ seed, picks, tricks, difficulty });
  const bot = sim.createPlayerBot(m, profile);
  const t0 = performance.now();
  while (!sim.result(m)) sim.step(m, sim.playerBotCommands(m, bot));
  const ms = performance.now() - t0;
  const snap = sim.snapshot(m, 0);
  return { res: sim.result(m), trail: sim.hashTrail(m).slice(), ms, score: snap.score, replay: sim.replayRecord(m) };
}

const rows = [];
const perHero = {};
let failures = 0;
for (let seed = from; seed < from + seeds; seed++) {
  const a = play(seed);
  if (checkDet) {
    const b = play(seed);
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

const gates = [];
if (balance) {
  const n = rows.length;
  const side = (100 * summary.purrhavenWins) / n;
  gates.push(['median 7:00 to 9:00', summary.medianTicks >= 7 * 60 * HZ && summary.medianTicks <= 9 * 60 * HZ, summary.medianLength]);
  gates.push(['p95 ≤ 10:30', summary.p95Ticks <= (10 * 60 + 30) * HZ, summary.p95Length]);
  gates.push(['every match ends by a core kill before 11:00', summary.safetyEnds === 0, `${summary.safetyEnds} safety ends`]);
  gates.push(['side win rate 45% to 55%', side >= 45 && side <= 55, `Purrhaven ${side.toFixed(1)}%`]);
  for (const [hero, h] of Object.entries(perHero)) {
    const rate = (100 * h.wins) / h.slots;
    gates.push([`${hero} win rate 42% to 58%`, rate >= 42 && rate <= 58, `${rate.toFixed(1)}%`]);
  }
}

if (json) console.log(JSON.stringify({ rows, summary, perHero, gates }, null, 2));
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
    `\n${summary.matches} matches (${profile} + bots, ${difficulty}): median ${summary.medianLength}, p95 ${summary.p95Length}, ` +
      `core kills ${summary.coreKills}, safety ends ${summary.safetyEnds}, Purrhaven ${summary.purrhavenWins} / Woof ${summary.woofWins}, ` +
      `takedowns ${summary.avgTakedowns} a match, ${summary.msPerMatch} ms a match (max ${summary.maxMs}), inputs ≤ ${summary.maxInputChars} chars` +
      (checkDet ? `, deterministic: ${failures === 0 ? 'yes' : `NO (${failures})`}` : ''),
  );
  for (const [hero, h] of Object.entries(perHero)) {
    const avg = (v) => (v / h.slots).toFixed(1);
    console.log(
      `  ${hero.padEnd(10)} ${String(h.slots).padStart(4)} slots  win ${((100 * h.wins) / h.slots).toFixed(1)}%  ` +
        `K/D/A ${avg(h.kills)}/${avg(h.deaths)}/${avg(h.assists)}  level ${avg(h.levels)}  hero dmg ${avg(h.heroDamage)}`,
    );
  }
  for (const [name, ok, value] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${value}`);
}
process.exit(failures > 0 || gates.some((g) => !g[1]) ? 1 : 0);
