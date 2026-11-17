/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §3): the map pool sanity run's match runner, bundled for Node by
 * tools/maps-sanity.mjs. One match per seed on `map`: slot 0 a player-bot of `profile`, the in-sim bots at
 * `difficulty` (or a PvP match of player-bots with `pvp`). Read-only.
 */
import type { Difficulty, HeroId, MapId, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBot, createPlayerBotFor, fillPicks, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { HERO_IDS } from '../../src/data/heroes';
import { G, RANGE } from '../../src/sim/world';
import { cellOf, walkable } from '../../src/sim/map/grid';

const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

export interface MapRow {
  seed: number;
  ticks: number;
  winner: number;
  reason: string;
  kills: [number, number];
  towers: [number, number];
  /** Objective events: mill captures, shrine captures, gem surges, goals (per team). */
  obj: [number, number];
  firstObjAt: number;
  pudding: number;
  stuckBots: number;
  stuckAt: number[];
  blocked: number;
  blockedAt: number[];
  /** Team 0 ahead in towers + kills/3 at 3:30 (-1 behind, 0 even, 1 ahead). */
  lead330: number;
}

export function mapMatch(seed: number, map: MapId, difficulty: Difficulty, profile: string, mutator?: string): MapRow {
  const hero = HERO_IDS[(Math.imul(seed ^ 0x51, 0x9e3779b1) >>> 0) % HERO_IDS.length] as HeroId;
  const trick = TRICKS[(Math.imul(seed ^ 0x7a, 0x9e3779b1) >>> 0) % TRICKS.length];
  const { picks, tricks } = fillPicks(seed, hero, trick, map);
  const m = createMatch({ seed, picks, tricks, difficulty, map, ...(mutator ? { mutator: mutator as never } : {}) }) as MatchHandle;
  const w = m.world;
  const bot = profile === 'idle' ? null : createPlayerBot(m, profile as never);
  void createPlayerBotFor;
  const lastX = new Int32Array(6);
  const lastY = new Int32Array(6);
  const still = new Int32Array(6);
  let stuckBots = 0;
  const stuckAt: number[] = [];
  let blocked = 0;
  const blockedAt: number[] = [];
  const obj: [number, number] = [0, 0];
  let firstObjAt = -1;
  let pudding = 0;
  let lead330 = 0;
  while (!result(m)) {
    step(m, bot ? playerBotCommands(m, bot) : []);
    for (const e of m.events) {
      if (e.type === 'millCapture' || e.type === 'shrineCapture' || e.type === 'gemSurge' || e.type === 'goal') {
        obj[e.team]++;
        if (firstObjAt < 0) firstObjAt = e.tick;
      }
      if (e.type === 'pudding' && e.what === 'calmed') pudding++;
    }
    const tick = w.globals[G.Tick];
    if (tick === 6300) {
      const s = w.globals[G.Towers0] - w.globals[G.Towers1] + (w.globals[G.Kills0] - w.globals[G.Kills1]) / 3;
      lead330 = s > 0.5 ? 1 : s < -0.5 ? -1 : 0;
    }
    if (tick % 30 === 0) {
      for (let h = 0; h < 6; h++) {
        const moved = Math.abs(w.x[h] - lastX[h]) + Math.abs(w.y[h] - lastY[h]) > 300;
        still[h] = w.alive[h] === 1 && !moved && w.state[h] === 1 ? still[h] + 1 : 0;
        if (still[h] === 5) {
          stuckBots++;
          if (stuckAt.length < 6) stuckAt.push(h, Math.round(w.x[h] / 1000), Math.round(w.y[h] / 1000));
        }
        lastX[h] = w.x[h];
        lastY[h] = w.y[h];
      }
      for (let id = 0; id < RANGE.end; id++) if (w.alive[id] === 1 && !walkable(m.grid, cellOf(w.x[id], w.y[id])) && id < RANGE.minions && w.fmT[id] === 0) {
        blocked++;
        if (blockedAt.length < 6) blockedAt.push(id, Math.round(w.x[id] / 100) / 10, Math.round(w.y[id] / 100) / 10);
      }
    }
  }
  const r = result(m)!;
  return {
    seed,
    ticks: r.ticks,
    winner: r.winner,
    reason: r.reason,
    kills: [w.globals[G.Kills0], w.globals[G.Kills1]],
    towers: [w.globals[G.Towers0], w.globals[G.Towers1]],
    obj,
    firstObjAt,
    pudding,
    stuckBots,
    stuckAt,
    blocked,
    blockedAt,
    lead330,
  };
}
