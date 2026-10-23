// Boss HP, phase and damage rules (pure: node-importable for tests).

/** 1-based phase for hp/maxHp given descending cut fractions, e.g. [0.5] -> 2 phases, [0.66, 0.33] -> 3. */
export function phaseOf(hp: number, maxHp: number, cuts: readonly number[]): number {
  const f = maxHp > 0 ? hp / maxHp : 0;
  let p = 1;
  for (const c of cuts) if (f < c) p++;
  return p;
}

export type BossHitKind = 'swat' | 'pounce' | 'laser' | 'blast' | 'ball';

export interface BossDamageTable {
  swat: number;
  pounce: number;
  pounceDizzy?: number; // pounce damage while dizzy (replaces pounce x dizzyMul)
  laser: number; // per 60 fps frame
  blast: number; // x blast power
  ball: number; // a swatted-back projectile
  dizzyMul: number;
}

export const DOG_DAMAGE: BossDamageTable = { swat: 2, pounce: 4, laser: 0.15, blast: 4, ball: 3, dizzyMul: 1 };
export const ROOMBA_DAMAGE: BossDamageTable = { swat: 2, pounce: 8, pounceDizzy: 12, laser: 0.2, blast: 5, ball: 3, dizzyMul: 2 };

/**
 * Damage of one hit. `power` scales blasts (and swats by swatPower); `frames` scales the laser (dt * 60).
 * A shield blocks everything; dizzy multiplies (pounce uses pounceDizzy when set).
 */
export function bossDamage(t: BossDamageTable, kind: BossHitKind, o: { power?: number; frames?: number; dizzy?: boolean; shield?: boolean } = {}): number {
  if (o.shield) return 0;
  const dz = o.dizzy ? t.dizzyMul : 1;
  switch (kind) {
    case 'swat':
      return t.swat * (o.power ?? 1) * dz;
    case 'pounce':
      return o.dizzy && t.pounceDizzy !== undefined ? t.pounceDizzy : t.pounce * dz;
    case 'laser':
      return t.laser * (o.frames ?? 1) * dz;
    case 'blast':
      return t.blast * (o.power ?? 1) * dz;
    case 'ball':
      return t.ball * dz;
  }
}

/** New hp after `dmg`, clamped at 0. */
export function applyDamage(hp: number, dmg: number): number {
  return Math.max(0, hp - Math.max(0, dmg));
}

/** Ballistic launch velocity to cover (dx, dy, dz) in T seconds under vertical acceleration g (negative = down). */
export function ballistic(dx: number, dy: number, dz: number, T: number, g: number, out: { x: number; y: number; z: number }): void {
  const t = Math.max(0.05, T);
  out.x = dx / t;
  out.z = dz / t;
  out.y = (dy - 0.5 * g * t * t) / t;
}

/** Bounce a ground-bouncing ball: returns the new vertical speed (0 once it is too slow to bounce). */
export function bounce(vy: number, restitution: number, minVy = 6): number {
  const up = -vy * restitution;
  return up < minVy ? 0 : up;
}
