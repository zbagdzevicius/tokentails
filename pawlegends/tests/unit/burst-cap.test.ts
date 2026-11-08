/**
 * Sim v17 burst cap (docs/plans/moba/V17.md §3.11, RESEARCH §C6 "one hero's full combo <= 70% of a squishy's HP"):
 * each of the 20 heroes at level 10 (no talents, no Toys) under PVP_RULES runs its full combo on a level-10 copy of
 * the squishiest marksman or mage, standing still: every ability and basics, each cast the tick it is ready, aimed at
 * the victim. The HP it loses in the 45 ticks (1.5 s) after the first hit must stay <= 7000 bp of its max HP. Nine
 * Lives (Hard and PvP) is the structural cap; a hero over the line is tuned in its own ability damage, never its pvp
 * row. The 60-tick loss is logged for V17.md §6.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { Op, type Command, type HeroId } from '../../src/sim/api';
import { createMatch, step, type MatchHandle } from '../../src/sim/index';
import { grantXp } from '../../src/sim/progression/levels';
import { XP } from '../../src/data/xp';
import { G } from '../../src/sim/world';
import { canCast } from '../../src/sim/heroes/kit';
import { place } from './heroes/kit-helpers';

const ATK = 0;
const VIC = 3;
const WINDOW = 45;
const CAP_BP = 7000;
const X = 50000;
const Y = 30000;

/** The squishiest marksman or mage at level 10 (lowest max HP; ties: HERO_IDS order). */
function squishiest(): HeroId {
  let best: HeroId | null = null;
  let bestHp = 0;
  for (const h of HERO_IDS) {
    const d = HEROES[h];
    if (d.role !== 'marksman' && d.role !== 'mage') continue;
    const hp = d.base.hp + (d.base.hpPerLevel ?? 0) * 9;
    if (best === null || hp < bestHp) {
      best = h;
      bestHp = hp;
    }
  }
  return best!;
}

const FILL: readonly HeroId[] = ['clem', 'sage', 'brutus', 'gabe', 'nugget', 'howler', 'pixel'];

function duel(attacker: HeroId, victim: HeroId): MatchHandle {
  const used = new Set<HeroId>([attacker, victim]);
  const fill = FILL.filter((h) => !used.has(h));
  const picks: HeroId[] = [attacker, fill[0], fill[1], victim, fill[2], fill[3]];
  const m = createMatch({ seed: 17, picks, tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5], mode: 'pvp' });
  m.world.globals[G.Tick] = 300;
  for (let id = 0; id < 6; id++) place(m, id, X + (id < 3 ? -30000 : 30000), Y + (id % 3) * 12000 - 12000, 0);
  for (const id of [ATK, VIC]) grantXp(m, id, XP.toLevel[9] - m.world.xp[id], 'minion', true);
  for (const id of [ATK, VIC]) m.world.hp[id] = m.world.maxHp[id];
  place(m, ATK, X - 2000, Y, 0);
  place(m, VIC, X, Y, 2048);
  return m;
}

/** HP the victim loses in the first `n` ticks after the first hit, of its max HP (bp). */
function burst(attacker: HeroId, victim: HeroId): { at45: number; at60: number } {
  const m = duel(attacker, victim);
  const w = m.world;
  const max = w.maxHp[VIC];
  const full = w.hp[VIC];
  let first = -1;
  let at45 = 0;
  let at60 = 0;
  for (let t = 0; t < 240; t++) {
    // One command a tick, like a player: the first ready ability (R first), else a basic attack on the victim.
    let cmd: Command | null = null;
    if (w.castPhase[ATK] === 0) {
      for (const slot of [3, 0, 1, 2] as const) {
        if (canCast(w, ATK, slot)) {
          cmd = { op: Op.Cast, slot, x: w.x[VIC], y: w.y[VIC], id: VIC };
          break;
        }
      }
      if (!cmd && w.target[ATK] !== VIC) cmd = { op: Op.Attack, id: VIC };
    }
    // The victim stands still: no orders, no attacks of its own.
    w.attackTimer[VIC] = 1 << 20;
    step(m, cmd ? [cmd] : [], [[], [], [], [], [], []]);
    const lost = Math.max(0, full - w.hp[VIC]);
    if (first < 0 && lost > 0) first = t;
    if (w.alive[VIC] === 0) {
      at45 = t - first <= WINDOW ? max : at45;
      at60 = max;
      break;
    }
    if (first >= 0) {
      if (t - first <= WINDOW) at45 = lost;
      if (t - first <= 60) at60 = lost;
      else break;
    }
  }
  return { at45: Math.trunc((at45 * 10000) / max), at60: Math.trunc((at60 * 10000) / max) };
}

describe('sim v17 burst cap (§3.11)', { timeout: 300_000 }, () => {
  const victim = squishiest();

  it('the squishiest marksman or mage is the victim', () => {
    expect(['marksman', 'mage']).toContain(HEROES[victim].role);
  });

  it(`every hero's full combo takes <= ${CAP_BP / 100}% of a level-10 ${'squishy'} in 1.5 s`, () => {
    const rows = HERO_IDS.map((h) => ({ hero: h, ...burst(h, victim) }));
    // eslint-disable-next-line no-console
    console.log(`burst-cap vs ${victim}:\n` + rows.map((r) => `${r.hero.padEnd(12)} 45t ${(r.at45 / 100).toFixed(1)}%  60t ${(r.at60 / 100).toFixed(1)}%`).join('\n'));
    for (const r of rows) expect(r.at45, r.hero).toBeLessThanOrEqual(CAP_BP);
    // The probe really fights: most heroes land something in the window.
    expect(rows.filter((r) => r.at45 > 1000).length).toBeGreaterThanOrEqual(15);
  });
});
