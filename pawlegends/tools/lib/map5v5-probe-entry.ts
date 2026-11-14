/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §8 tests, §10 timings, §14 G9 and G10): the 5v5 map probe's match
 * runner, bundled for Node by tools/map5v5-probe.mjs. One PvP Hearthwood match per seed with ten `normal` pilots (cats
 * on team 0 on even seeds), observed from the outside: it reads the world, the events and the pilots' own memory, and
 * never writes them.
 *
 * Definitions (30 ticks = 1 s):
 * - Prowl at Grizzlechop: the first tick after 1:30 a team's Prowl stands within 12 m of the pit centre.
 * - gank start: the first tick a Prowl's pilot memory holds a gank target (bots/jungle.ts JG.Gank).
 * - gank takedown: a hero death whose killing team's Prowl was ganking within the last 10 s and stands within 15 m.
 * - stuck: a living hero walking (state moving, no cast) to a goal over 2 m away whose positions over the last 3 s
 *   (sampled each 1 s) all lie within 1 m of where it is now (sim v22 balance pass: was "under 0.3 m between two
 *   samples 3 s apart", which also flagged a lane dance that came back to the same spot). Sim v26: a hero that dealt or
 *   took a hit from an enemy hero in those 3 s is in a fight, not stuck (rooted, body-blocked or trading blows on the
 *   spot; such fights flagged about one seed in 120 on every version, v25 included), so it is not counted.
 * - calm: a living hero with no enemy hero within 14 m and no PvP hit dealt or taken in the last 3 s.
 */
import type { HeroId, MatchConfig, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { Rng } from '../../src/sim/rng';
import { G, JG_ROW, MG, RANGE, UnitState } from '../../src/sim/world';
import { JG } from '../../src/sim/bots/jungle';
import { ROLE } from '../../src/sim/bots/roles';

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];
const PITS = [
  [92000, 36000],
  [36000, 92000],
] as const;

export interface ProbeRow {
  seed: number;
  ticks: number;
  winner: number;
  catsLeft: boolean;
  /** Per team: Prowl first at Grizzlechop, first gank start (−1 none). */
  prowlGrizz: [number, number];
  gankStart: [number, number];
  ganks: [number, number];
  firstBlood: number;
  firstGrizz: number;
  firstTower: number;
  firstPudding: number;
  cannonFired: number;
  takedowns: number;
  gankTakedowns: number;
  pitDeaths: number;
  baseFights: number;
  fights: number;
  calmTicks: number;
  aliveTicks: number;
  longestCalm: number;
  /** Stuck stretches over 3 s (count) and the longest (ticks). */
  stuck: number;
  stuckLongest: number;
  /** The first stuck stretches: tick, hero, role, x, y (m), goal x, y (m), bot mode. */
  stuckSamples: number[][];
  /** At 5:00: each team's Prowl XP and Fish against its laners' average (bp). */
  prowlXpBp: [number, number];
  prowlFishBp: [number, number];
  /** Each Prowl's XP by source until 5:00 ({ reason: amount }), and each laner's average. */
  prowlXpBy: Record<string, number>[];
  /** Comeback: the team down ≥ 2 towers or ≥ 5 takedowns at 7:00 (−1 none) and the biggest takedown gap (and who led). */
  behindAt7: number;
  maxGap: number;
  maxGapLeader: number;
  /** When the biggest gap was first reached (tick), each team's final takedowns and towers destroyed. */
  maxGapAt: number;
  kills: [number, number];
  towers: [number, number];
  reason: string;
  /** Each core's HP share (bp) at Sunset (10:00) and at Sudden Death (13:00), and the takedowns at Sudden Death. */
  coreAt10: [number, number];
  coreAt13: [number, number];
  killsAt13: [number, number];
}

/** One PvP match on Hearthwood with every slot a `normal` pilot. */
export function probe5v5(seed: number): ProbeRow {
  const r = new Rng(seed).fork('map5v5-probe');
  const draw = (pool: readonly HeroId[]): HeroId[] => {
    const left = pool.slice();
    const out: HeroId[] = [];
    for (let k = 0; k < 5; k++) out.push(left.splice(r.int(left.length), 1)[0]);
    return out;
  };
  const cats = draw(CAT_IDS);
  const dogs = draw(DOG_IDS);
  const catsLeft = (seed & 1) === 0;
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seats = slots.map((slot) => {
    const cat = slot < 5 === catsLeft;
    return { slot, hero: (cat ? cats : dogs)[slot % 5], trick: TRICKS[r.int(TRICKS.length)] };
  });
  const { picks, tricks } = fillPicksParty(seed, seats, 'hearthwood');
  const config: MatchConfig = { seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', map: 'hearthwood' };
  const m = createMatch(config) as MatchHandle;
  const w = m.world;
  const pilots = slots.map((s) => createPlayerBotFor(m, 'normal', s));
  const row: ProbeRow = {
    seed,
    ticks: 0,
    winner: -1,
    catsLeft,
    prowlGrizz: [-1, -1],
    gankStart: [-1, -1],
    ganks: [0, 0],
    firstBlood: -1,
    firstGrizz: -1,
    firstTower: -1,
    firstPudding: -1,
    cannonFired: -1,
    takedowns: 0,
    gankTakedowns: 0,
    pitDeaths: 0,
    baseFights: 0,
    fights: 0,
    calmTicks: 0,
    aliveTicks: 0,
    longestCalm: 0,
    stuck: 0,
    stuckLongest: 0,
    stuckSamples: [],
    prowlXpBp: [0, 0],
    prowlFishBp: [0, 0],
    prowlXpBy: [{}, {}],
    behindAt7: -1,
    maxGap: 0,
    maxGapLeader: -1,
    maxGapAt: -1,
    kills: [0, 0],
    towers: [0, 0],
    reason: '',
    coreAt10: [-1, -1],
    coreAt13: [-1, -1],
    killsAt13: [-1, -1],
  };
  const lastPvp = new Int32Array(10).fill(-100000);
  const gankAt = new Int32Array(10).fill(-100000);
  const prevGank = new Int32Array(10);
  const histX = slots.map(() => [] as number[]);
  const histY = slots.map(() => [] as number[]);
  const stuckFor = new Int32Array(10);
  const kills = [0, 0];
  const towers = [0, 0];
  let lastAnyPvp = 0;
  let fightAt = -100000;
  let fightX = 0;
  let fightY = 0;
  const prowl = [-1, -1];
  while (!result(m)) {
    const out = pilots.map((p) => playerBotCommands(m, p));
    step(m, out[0], out);
    const tick = w.globals[G.Tick];
    if (prowl[0] < 0) for (let h = 0; h < 10; h++) if (w.mg[MG.Role + h] === ROLE.Prowl) prowl[w.team[h]] = h;
    for (const e of m.events) {
      if (e.type === 'hit' && e.src >= 0 && e.src < 10 && e.dst >= 0 && e.dst < 10 && w.team[e.src] !== w.team[e.dst]) {
        lastPvp[e.src] = e.tick;
        lastPvp[e.dst] = e.tick;
        row.longestCalm = Math.max(row.longestCalm, e.tick - lastAnyPvp);
        lastAnyPvp = e.tick;
        const mx = (w.x[e.src] + w.x[e.dst]) / 2;
        const my = (w.y[e.src] + w.y[e.dst]) / 2;
        if (e.tick - fightAt > 150 || (mx - fightX) ** 2 + (my - fightY) ** 2 > 14000 ** 2) {
          row.fights++;
          if (mx + my <= 56000 || mx + my >= 200000) row.baseFights++;
        }
        fightAt = e.tick;
        fightX = mx;
        fightY = my;
      }
      if (e.type === 'death' && e.id >= 0 && e.id < 10) {
        const kt = 1 - w.team[e.id];
        // Sim v27 (V27.md §1.A): the score is the sim's own (an execution by a tower, minion or camp is no takedown)
        kills[0] = w.globals[G.Kills0];
        kills[1] = w.globals[G.Kills1];
        row.takedowns++;
        if (row.firstBlood < 0) row.firstBlood = e.tick;
        if (PITS.some(([px, py]) => (w.x[e.id] - px) ** 2 + (w.y[e.id] - py) ** 2 <= 15000 ** 2)) row.pitDeaths++;
        const p = prowl[kt];
        if (p >= 0 && e.tick - gankAt[p] <= 300 && (w.x[p] - w.x[e.id]) ** 2 + (w.y[p] - w.y[e.id]) ** 2 <= 15000 ** 2) row.gankTakedowns++;
        const gap = Math.abs(kills[0] - kills[1]);
        if (gap > row.maxGap) {
          row.maxGap = gap;
          row.maxGapLeader = kills[0] > kills[1] ? 0 : 1;
          row.maxGapAt = e.tick;
        }
      }
      if (e.type === 'objective' && e.kind === 'grizzlechop' && row.firstGrizz < 0) row.firstGrizz = e.tick;
      if (e.type === 'objective' && e.kind === 'pudding' && row.firstPudding < 0) row.firstPudding = e.tick;
      if (e.type === 'tower') {
        towers[e.destroyedBy]++;
        if (row.firstTower < 0) row.firstTower = e.tick;
      }
      if (e.type === 'cannonFire' && row.cannonFired < 0) row.cannonFired = e.tick;
      if (e.type === 'xp' && e.tick < 9000 && e.id >= 0 && e.id < 10 && prowl[w.team[e.id]] === e.id) {
        const by = row.prowlXpBy[w.team[e.id]];
        by[e.reason] = (by[e.reason] ?? 0) + e.amount;
      }
    }
    // Pilots' jungle memory: gank starts.
    for (let s = 0; s < 10; s++) {
      const g = pilots[s].mem.jg[s * JG_ROW + JG.Gank];
      if (g !== 0) {
        gankAt[s] = tick;
        if (prevGank[s] === 0) {
          const t = w.team[s];
          row.ganks[t]++;
          if (row.gankStart[t] < 0) row.gankStart[t] = tick;
        }
      }
      prevGank[s] = g;
    }
    for (let t = 0; t < 2; t++) {
      const p = prowl[t];
      if (p >= 0 && row.prowlGrizz[t] < 0 && tick >= 2700 && w.alive[p] === 1) {
        const [px, py] = PITS[0];
        if ((w.x[p] - px) ** 2 + (w.y[p] - py) ** 2 <= 12000 ** 2) row.prowlGrizz[t] = tick;
      }
    }
    if (tick === 9000) {
      for (let t = 0; t < 2; t++) {
        const p = prowl[t];
        if (p < 0) continue;
        let xp = 0;
        let fish = 0;
        let n = 0;
        for (let h = 0; h < 10; h++) {
          if (w.team[h] !== t || h === p || w.mg[MG.Role + h] === ROLE.Guard) continue;
          xp += w.xp[h];
          fish += w.fishTotal[h];
          n++;
        }
        row.prowlXpBp[t] = n && xp ? Math.round((w.xp[p] * 10000 * n) / xp) : 0;
        row.prowlFishBp[t] = n && fish ? Math.round((w.fishTotal[p] * 10000 * n) / fish) : 0;
      }
    }
    if (tick === 18000 || tick === 23400) {
      const at = tick === 18000 ? row.coreAt10 : row.coreAt13;
      for (let t = 0; t < 2; t++) at[t] = Math.round((w.hp[RANGE.cores + t] * 10000) / w.maxHp[RANGE.cores + t]);
      if (tick === 23400) row.killsAt13 = [kills[0], kills[1]];
    }
    if (tick === 12600) {
      if (towers[0] - towers[1] >= 2 || kills[0] - kills[1] >= 5) row.behindAt7 = 1;
      else if (towers[1] - towers[0] >= 2 || kills[1] - kills[0] >= 5) row.behindAt7 = 0;
    }
    for (let h = 0; h < 10; h++) {
      if (w.alive[h] !== 1) {
        stuckFor[h] = 0;
        continue;
      }
      row.aliveTicks++;
      let near = false;
      for (let e = 0; e < 10; e++) if (w.alive[e] === 1 && w.team[e] !== w.team[h] && (w.x[e] - w.x[h]) ** 2 + (w.y[e] - w.y[h]) ** 2 <= 14000 ** 2) near = true;
      if (!near && tick - lastPvp[h] > 90) row.calmTicks++;
      if (tick % 30 === 0) {
        histX[h].push(w.x[h]);
        histY[h].push(w.y[h]);
        const n = histX[h].length;
        const goal = (w.moveX[h] - w.x[h]) ** 2 + (w.moveY[h] - w.y[h]) ** 2 > 2000 ** 2;
        // Every sample of the last 3 s within 1 m of the latest: a stall or a back-and-forth on the spot (two rules
        // taking turns), not a lane dance that happens to come back to where it was 3 s ago.
        let still = n > 3;
        for (let k = n - 4; still && k < n - 1; k++) if ((histX[h][n - 1] - histX[h][k]) ** 2 + (histY[h][n - 1] - histY[h][k]) ** 2 >= 1000 ** 2) still = false;
        if (still && goal && w.castPhase[h] === 0 && w.state[h] === UnitState.Moving && tick - lastPvp[h] > 90) {
          stuckFor[h] += 30;
          if (stuckFor[h] === 90) {
            row.stuck++;
            if (row.stuckSamples.length < 12) row.stuckSamples.push([tick, h, w.mg[MG.Role + h], Math.round(w.x[h] / 100) / 10, Math.round(w.y[h] / 100) / 10, Math.round(w.moveX[h] / 100) / 10, Math.round(w.moveY[h] / 100) / 10, pilots[h].mem.mode[h], w.state[h]]);
          }
          row.stuckLongest = Math.max(row.stuckLongest, stuckFor[h] + 60);
        } else stuckFor[h] = 0;
      }
    }
  }
  const res = result(m)!;
  row.ticks = res.ticks;
  row.winner = res.winner;
  row.kills = [kills[0], kills[1]];
  row.towers = [towers[0], towers[1]];
  row.reason = res.reason;
  return row;
}
