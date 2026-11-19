#!/usr/bin/env node
/**
 * Sim v38 (docs/plans/moba/V38.md §5): find the balance-gate matches on one map that hit the safety end, with the exact
 * seeding of `npm run match -- --gate balance --map pool` (tools/headless-match.mjs `play`), and describe them.
 *
 *   node tools/ridge-safety.mjs [--map ridge] [--from 100001] [--seeds 8000]
 */
import { argValue } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const map = argValue('--map') ?? 'ridge';
const from = Number(argValue('--from') ?? 100001);
const seeds = Number(argValue('--seeds') ?? 8000);
const sim = await importSim('src/sim/index.ts');
const HEROES = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino', 'mochi', 'ziggy', 'biscuit', 'champ', 'nova', 'dusty', 'barkula', 'ranger'];
const TRICKS = ['pounce', 'snack', 'hiss', 'purrify'];
const pickFor = (seed, list, salt) => list[(Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % list.length];
const out = [];
let n = 0;
for (let seed = from; seed < from + seeds; seed++) {
  if (sim.pickMap3v3(seed) !== map) continue;
  n++;
  const { picks, tricks } = sim.fillPicks(seed, pickFor(seed, HEROES, 0x51), pickFor(seed, TRICKS, 0x7a), map);
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'normal', botTalents: 'seeded', map });
  const bot = sim.createPlayerBot(m, 'normal');
  const trace = [];
  while (!sim.result(m)) {
    sim.step(m, sim.playerBotCommands(m, bot));
    const t = sim.tickOf(m);
    if (t % 1800 === 0) trace.push(sim.snapshot(m, 0).score);
  }
  const r = sim.result(m);
  if (r.reason !== 'core') {
    const s = sim.snapshot(m, 0);
    const structures = s.entities.filter((e) => e.kind === 'tower' || e.kind === 'core').map((e) => `${e.kind}:${e.team}:${e.lane ?? ''}:${Math.round((100 * e.hp) / e.maxHp)}%`);
    out.push({ seed, picks, reason: r.reason, winner: r.winner, ticks: r.ticks, score: s.score, structures, perMinute: trace.map((x) => `${x.kills.join('-')}/${x.towers.join('-')}`) });
  }
}
console.log(JSON.stringify({ map, from, seeds, matches: n, nonCore: out }, null, 1));
