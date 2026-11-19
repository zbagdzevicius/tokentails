/**
 * Sim v38 (docs/plans/moba/V38.md §1): the ally-spread probe's match runner, bundled for Node by tools/ally-spread.mjs.
 * One match per seed on `map` (Crossing, a pool map or Hearthwood): slot 0 a player-bot of `profile`, the in-sim bots
 * at `difficulty`. Every second it samples where each bot stands: within 10 m of its team's lead hero (slot 0 for the
 * human's allies, slot 3 for the enemy bots, the mirror seat), in the same lane region as that lead, and in which
 * region (a lane, the jungle, or the base). Read-only.
 */
import type { Difficulty, HeroId, MapId, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { pickMap3v3 } from '../../src/sim/api';
import { HERO_IDS } from '../../src/data/heroes';
import { CORE, LANES, MAP, mirrorX, mirrorY } from '../../src/data/map';
import { G, RANGE } from '../../src/sim/world';
import { nearLane, nearestLane } from '../../src/sim/map/grid';
import { dist2 } from '../../src/sim/fixed';

const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];
const NEAR = 10000;
const BASE = 16000;
const LANE_BAND = 7000;

/** Region of (x, y): −2 base, −1 jungle (off the lanes), else the nearest lane's index. */
function region(x: number, y: number): number {
  if (dist2(x, y, CORE.x, CORE.y) <= BASE * BASE || dist2(x, y, mirrorX(CORE.x), mirrorY(CORE.y)) <= BASE * BASE) return -2;
  if (!nearLane(x, y, LANE_BAND)) return -1;
  if (LANES.length === 1) return 0;
  if (MAP.point === 1) return nearestLane(x, y);
  return y >= MAP.height >> 1 ? 0 : 1;
}

/** Per bot slot (1, 2, 4, 5) and window (0: 0:30–5:00, 1: 5:00–end): samples, near its lead, same lane region as its lead; enemy bots also near the human. */
export interface SpreadRow {
  seed: number;
  map: string;
  ticks: number;
  winner: number;
  reason: string;
  kills: [number, number];
  /** [slot][window] = [samples both alive, near lead, both in a lane, same lane, (enemies) human alive, near the human] */
  s: number[][][];
  /** Lead-relative sample at 0:30, 2:00 and 5:00: per bot slot its region and whether near its lead. */
  at: Record<string, number[]>;
  /** Region counts per slot (0..5) in window 0: [base, jungle, lane0, lane1, lane2...]. */
  reg: number[][];
  stuckBots: number;
}

const SLOTS = [1, 2, 4, 5];

export function spreadMatch(seed: number, mapArg: MapId | 'crossing' | 'pool', difficulty: Difficulty, profile: string, mutator?: string): SpreadRow {
  const map = mapArg === 'pool' ? (pickMap3v3(seed) as MapId) : mapArg;
  const hero = HERO_IDS[(Math.imul(seed ^ 0x51, 0x9e3779b1) >>> 0) % HERO_IDS.length] as HeroId;
  const trick = TRICKS[(Math.imul(seed ^ 0x7a, 0x9e3779b1) >>> 0) % TRICKS.length];
  const mp = map === 'crossing' ? undefined : map;
  const { picks, tricks } = mp ? fillPicks(seed, hero, trick, mp) : fillPicks(seed, hero, trick);
  const m = createMatch({ seed, picks, tricks, difficulty, ...(mp ? { map: mp } : {}), ...(mutator ? { mutator: mutator as never } : {}) }) as MatchHandle;
  const w = m.world;
  const n = picks.length;
  const per = n >> 1;
  const bot = profile === 'idle' ? null : createPlayerBot(m, profile as never);
  const slots = n === 6 ? SLOTS : [1, 2, 3, 4, 6, 7, 8, 9];
  const s = Array.from({ length: n }, () => [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ]);
  const reg = Array.from({ length: n }, () => new Array(2 + LANES.length).fill(0));
  const at: Record<string, number[]> = {};
  const lastX = new Int32Array(n);
  const lastY = new Int32Array(n);
  const still = new Int32Array(n);
  let stuckBots = 0;
  while (!result(m)) {
    step(m, bot ? playerBotCommands(m, bot) : []);
    const tick = w.globals[G.Tick];
    if (tick % 30 !== 0 || tick < 900) continue;
    const win = tick < 9000 ? 0 : 1;
    for (const id of slots) {
      const lead = id < per ? 0 : per;
      if (w.alive[id] === 0 || w.alive[lead] === 0) continue;
      const row = s[id][win];
      row[0]++;
      const near = dist2(w.x[id], w.y[id], w.x[lead], w.y[lead]) <= NEAR * NEAR;
      if (near) row[1]++;
      const a = region(w.x[id], w.y[id]);
      const b = region(w.x[lead], w.y[lead]);
      if (a >= 0 && b >= 0) {
        row[2]++;
        if (a === b) row[3]++;
      }
      // the enemy bots: also within 10 m of the human (slot 0), the samples the human is alive
      if (id >= per && w.alive[0] === 1) {
        row[4]++;
        if (dist2(w.x[id], w.y[id], w.x[0], w.y[0]) <= NEAR * NEAR) row[5]++;
      }
      if (win === 0) reg[id][a + 2]++;
      if (tick === 900 || tick === 3600 || tick === 9000) (at[`${tick}`] ??= []).push(id, a, near ? 1 : 0);
    }
    for (let h = 0; h < n; h++) {
      const moved = Math.abs(w.x[h] - lastX[h]) + Math.abs(w.y[h] - lastY[h]) > 300;
      still[h] = w.alive[h] === 1 && !moved && w.state[h] === 1 ? still[h] + 1 : 0;
      if (still[h] === 5) stuckBots++;
      lastX[h] = w.x[h];
      lastY[h] = w.y[h];
    }
  }
  const r = result(m)!;
  void RANGE;
  return { seed, map: map, ticks: r.ticks, winner: r.winner, reason: r.reason, kills: [w.globals[G.Kills0], w.globals[G.Kills1]], s, at, reg, stuckBots };
}
