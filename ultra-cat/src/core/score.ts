// Banking damage. FROZEN. Every lane scores through score() so combos, ULTRA charge, events and pops stay consistent.
import type * as THREE from 'three';
import { events } from './events';
import { popMoney } from './hud';
import { comboMult, ultraGain } from './scoring';
import { C, COMBO_T, G, game, P } from './state';

export function mult(): number {
  return comboMult(G.combo);
}

/** Combo hit: keeps the chain alive. */
export function comboHit(): void {
  G.combo++;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  G.comboT = COMBO_T;
  events.emit('comboHit', { combo: G.combo });
}

/**
 * Bank m raw $M (multiplied by combo, frenzy and the city's valueMul). `label` prefixes the money pop ('SWAT! ').
 * combo=false: does not feed the chain. The label 'ZAP ' while an ultra is active goes to the running G.zap tally.
 */
export function score(m: number, at: THREE.Vector3 | null, label = '', combo = true): void {
  if (game.mode !== 'play') return;
  const v = m * mult() * (G.frenzy ? 2 : 1) * game.level.valueMul;
  G.damage += v;
  if (combo && m >= 0.1) comboHit(); // trees and taxis don't feed the chain
  if (G.ultraT <= 0) G.ultra = Math.min(100, G.ultra + ultraGain(m, P.ultraCharge)); // no recharge while firing
  if (!at || v <= 0.05) return;
  events.emit('damage', { amount: v, label, x: at.x, y: at.y, z: at.z });
  // the cat glances at whatever it just broke
  game.rig.look = -Math.max(-1, Math.min(1, ((at.x - C.pos.x) * C.right.x + (at.z - C.pos.z) * C.right.z) / 40)); // right is the cat's local -x
  if (label === 'ZAP ' && G.ultraT > 0) G.zap += v;
  else popMoney(label, v, at);
}

/** Bank a flat bonus (landmarks, boss kills): multiplied by combo and frenzy, feeds the chain, no pop. Returns the banked value. */
export function bonus(m: number): number {
  if (game.mode !== 'play') return 0;
  const v = m * mult() * (G.frenzy ? 2 : 1);
  G.damage += v;
  comboHit();
  return v;
}
