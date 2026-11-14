/**
 * Sim v28 (docs/plans/moba/V28.md §5): the mode sanity run's match runner, bundled for Node by tools/modes-sanity.mjs.
 * One match per seed: slot 0 a player-bot of `profile`, the in-sim bots at `difficulty`, under `mutator`. Read-only.
 */
import type { Difficulty, HeroId, Mutator, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { HERO_IDS } from '../../src/data/heroes';
import { G, RANGE } from '../../src/sim/world';
import { bossOf } from '../../src/sim/units/boss';

const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

export interface ModeRow {
  seed: number;
  ticks: number;
  winner: number;
  reason: string;
  kills: [number, number];
  towers: [number, number];
  /** Boss Weekend: the boss's last HP share (bp), its phase, how many hero deaths it caused, pound and meteor hits on heroes. */
  bossHpBp: number;
  bossPhase: number;
  heroDeaths: number;
  stuckBots: number;
}

export function modeMatch(seed: number, mutator: Mutator, difficulty: Difficulty, profile: string): ModeRow {
  const hero = HERO_IDS[(Math.imul(seed ^ 0x51, 0x9e3779b1) >>> 0) % HERO_IDS.length] as HeroId;
  const trick = TRICKS[(Math.imul(seed ^ 0x7a, 0x9e3779b1) >>> 0) % TRICKS.length];
  const { picks, tricks } = fillPicks(seed, hero, trick, 'crossing');
  const m = createMatch({ seed, picks, tricks, difficulty, mutator }) as MatchHandle;
  const w = m.world;
  const bot = createPlayerBot(m, profile as never);
  let heroDeaths = 0;
  const lastX = new Int32Array(6);
  const lastY = new Int32Array(6);
  const still = new Int32Array(6);
  let stuckBots = 0;
  while (!result(m)) {
    step(m, playerBotCommands(m, bot));
    for (const e of m.events) if (e.type === 'death' && e.id < RANGE.minions) heroDeaths++;
    const tick = w.globals[G.Tick];
    if (tick % 30 === 0) {
      for (let h = 0; h < 6; h++) {
        const moved = Math.abs(w.x[h] - lastX[h]) + Math.abs(w.y[h] - lastY[h]) > 300;
        still[h] = w.alive[h] === 1 && !moved && w.state[h] === 1 ? still[h] + 1 : 0;
        if (still[h] === 5) stuckBots++;
        lastX[h] = w.x[h];
        lastY[h] = w.y[h];
      }
    }
  }
  const r = result(m)!;
  const b = bossOf(w);
  return {
    seed,
    ticks: r.ticks,
    winner: r.winner,
    reason: r.reason,
    kills: [w.globals[G.Kills0], w.globals[G.Kills1]],
    towers: [w.globals[G.Towers0], w.globals[G.Towers1]],
    bossHpBp: b >= 0 ? Math.round((Math.max(0, w.hp[b]) * 10000) / w.maxHp[b]) : -1,
    bossPhase: b >= 0 ? w.globals[G.BossPhase] : -1,
    heroDeaths,
    stuckBots,
  };
}
