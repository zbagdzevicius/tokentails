/**
 * Fountains and the per-second rules (POC.md §5, §6.1, §7.3; sim v4 numbers in data/): a fountain heals allies inside
 * 10% max HP a second and shoots enemies inside; heroes out of combat (no damage from an enemy hero for
 * HERO_RULES.outOfCombat) regenerate HERO_RULES.regenBpPerSecond a second (the human × DIFFICULTY_RULES.humanRegenBp);
 * in Sudden Death each core loses SUDDEN_DEATH.coreDecayBpPerSecond a second.
 */
import { FOUNTAIN } from '../../data/map';
import { HERO_RULES } from '../../data/xp';
import { SUDDEN_DEATH, TIMELINE } from '../../data/timeline';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE } from '../world';
import { dealDamage } from '../combat/damage';
import { trickleXp } from '../progression/xp';
import { HUMAN_SLOT } from '../api';
import { rulesOf } from '../rules';

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
      else {
        const dmg = w.kind[id] === Kind.Hero ? applyBp(w.maxHp[id], FOUNTAIN.heroDamageBpPerSecond) : FOUNTAIN.damagePerSecond;
        dealDamage(m, f, team, Kind.Fountain, id, dmg, 'tower', { pure: true });
      }
    }
  }
  if (tick >= TIMELINE.firstWave) trickleXp(m);
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    // v4: "out of combat" = no damage from an enemy hero for HERO_RULES.outOfCombat (minion and tower chip does not stop it).
    if (w.alive[id] === 0 || w.hp[id] <= 0 || tick - w.kHurt[id] < HERO_RULES.outOfCombat) continue;
    const regen = id === HUMAN_SLOT ? applyBp(HERO_RULES.regenBpPerSecond, rulesOf(m).humanRegenBp) : HERO_RULES.regenBpPerSecond;
    w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + applyBp(w.maxHp[id], regen));
  }
  if (tick >= w.globals[G.SuddenDeath]) {
    for (let c = RANGE.cores; c < RANGE.fountains; c++) {
      if (w.alive[c] === 0) continue;
      dealDamage(m, -1, 2, Kind.None, c, applyBp(w.maxHp[c], SUDDEN_DEATH.coreDecayBpPerSecond), 'zone', { pure: true, pierce: true });
    }
  }
}
