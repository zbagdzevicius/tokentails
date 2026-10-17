/**
 * Fountains and the per-second rules (POC.md §5, §6.1, §7.3): a fountain heals allies inside 10% max HP a second and
 * shoots enemies inside for 500 a second; heroes out of combat (no damage for 5 s) regenerate 1% max HP a second; in
 * Sudden Death each core loses 2% max HP a second.
 */
import { FOUNTAIN } from '../../data/map';
import { HERO_RULES } from '../../data/xp';
import { SUDDEN_DEATH, TIMELINE } from '../../data/timeline';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE } from '../world';
import { dealDamage } from '../combat/damage';

export function stepSeconds(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (tick % TIMELINE.second !== 0) return;
  const r2 = FOUNTAIN.radius * FOUNTAIN.radius;
  for (let f = RANGE.fountains; f < RANGE.camps; f++) {
    const team = w.team[f];
    for (let id = 0; id < RANGE.towers; id++) {
      if (w.alive[id] === 0 || w.team[id] > 1) continue;
      if (dist2(w.x[f], w.y[f], w.x[id], w.y[id]) > r2) continue;
      if (w.team[id] === team) w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + applyBp(w.maxHp[id], FOUNTAIN.healBpPerSecond));
      else dealDamage(m, f, team, Kind.Fountain, id, FOUNTAIN.damagePerSecond, 'tower', { pure: true });
    }
  }
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.alive[id] === 0 || w.hp[id] <= 0 || tick - w.hurtTick[id] < HERO_RULES.outOfCombat) continue;
    w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + applyBp(w.maxHp[id], HERO_RULES.regenBpPerSecond));
  }
  if (tick >= TIMELINE.suddenDeath) {
    for (let c = RANGE.cores; c < RANGE.fountains; c++) {
      if (w.alive[c] === 0) continue;
      dealDamage(m, -1, 2, Kind.None, c, applyBp(w.maxHp[c], SUDDEN_DEATH.coreDecayBpPerSecond), 'zone', { pure: true, pierce: true });
    }
  }
}
