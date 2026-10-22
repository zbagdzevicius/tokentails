/**
 * Readability (ANIM-SPEC §9): telegraphs stay on top, effects never hide an enemy windup, an enemy effect never reads
 * as friendly. Packs active ENEMY windups into the FX shader's dim circles (uTele), computes the coverage-budget fade
 * for own / ally effects (enemy damage effects and telegraphs are never dimmed), and gives the relation rim colours.
 */
import type * as THREE from 'three';
import { RELATION } from '../../palette';
import { TELE_SLOTS } from './fxMaterial';
import type { Relation3 } from '../types';

export interface TeleSource {
  src: number;
  x: number;
  y: number;
  start: number;
  ticks: number;
}
export interface TeleWho {
  team: number;
  x: number;
  z: number;
}

/**
 * Rim colours: own gold, ally the team rose, enemy danger red. (The spec's "blue" ally rim would read as the enemy:
 * this game's one relation encoding has the enemy in blue, render/palette.ts RELATION.)
 */
export const RIM: Readonly<Record<Relation3, number>> = Object.freeze({ own: RELATION.self, ally: RELATION.ally, enemy: RELATION.danger });

/**
 * Pack up to TELE_SLOTS enemy windups as dim circles (x, z, radius, on). A windup's circle covers the caster and its
 * aim point (the cone / line / landing area between them), so any mesh FX over it drops to 35%.
 */
export function packTele(windups: readonly TeleSource[], who: (id: number) => TeleWho | null, myTeam: number, out: THREE.Vector4[]): number {
  let n = 0;
  for (let i = 0; i < windups.length && n < TELE_SLOTS; i++) {
    const w = windups[i];
    const src = who(w.src);
    if (!src || src.team === myTeam) continue;
    const ax = w.x / 1000;
    const az = -w.y / 1000;
    const cx = (src.x + ax) * 0.5;
    const cz = (src.z + az) * 0.5;
    const r = Math.hypot(ax - src.x, az - src.z) * 0.5 + 2.2;
    out[n++].set(cx, cz, r, 1);
  }
  for (let i = n; i < out.length; i++) out[i].w = 0;
  return n;
}

/** Coverage budget share of the view by tier (Med / High 30%, Low 20%). */
export const COVERAGE = Object.freeze({ low: 0.2, med: 0.3, high: 0.3 });

/**
 * The own / ally fade (1 → 0.5) when additive mesh FX cover more than the tier's share of the visible ground
 * (`viewArea` m²). Eased per frame by the caller.
 */
export function coverageFade(ownArea: number, viewArea: number, tier: 'low' | 'med' | 'high'): number {
  if (!(viewArea > 0)) return 1;
  const share = ownArea / viewArea;
  const lim = COVERAGE[tier];
  if (share <= lim) return 1;
  return Math.max(0.5, 1 - ((share - lim) / lim) * 0.5);
}

/** Dim factor a fragment at (x, z) gets from packed windups (the shader's rule, for tests). */
export function dimAt(x: number, z: number, tele: readonly THREE.Vector4[]): number {
  for (const t of tele) if (t.w > 0.5 && Math.hypot(x - t.x, z - t.y) < t.z) return 0.35;
  return 1;
}
