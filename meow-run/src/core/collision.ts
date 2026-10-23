// Track-space collision. FROZEN.
// Colliders live in (s, x, y) like the player. Set pieces add them through PieceCtx.addCollider (auto-removed on
// despawn) and may move them every step (chasers, rolling yarn). The player is a vertical capsule:
// radius TUNING.radius, from y to y + bodyHeight() (low while sliding).
import { bodyHeight, hurt, P, TUNING } from './player';
import { nearMiss } from './score';
import { game } from './state';
import type { Collider, ColliderInit } from './types';

const list: Collider[] = [];
const NEAR = 0.5;

export function addCollider(c: ColliderInit): Collider {
  const shape = c.shape ?? 'box';
  const col: Collider = {
    shape,
    s: c.s,
    x: c.x ?? 0,
    y: c.y ?? 0,
    hs: c.hs ?? 0.5,
    hx: c.hx ?? 0.5,
    h: c.h ?? 1,
    r: c.r ?? 0.5,
    kind: c.kind,
    label: c.label ?? c.kind,
    once: c.once ?? c.kind === 'trigger',
    near: c.near ?? c.kind === 'hurt',
    onTouch: c.onTouch,
    enabled: true,
    _in: false,
    _hit: false,
    _passed: false,
    _min: Infinity,
  };
  list.push(col);
  return col;
}

export function removeCollider(c: Collider): void {
  const i = list.indexOf(c);
  if (i >= 0) list.splice(i, 1);
}
export function clearColliders(): void {
  list.length = 0;
}
export const colliders = (): readonly Collider[] => list;

/**
 * Gap between the player body and the collider (< 0 = overlapping). Box: the largest separating gap on any axis.
 * Sphere: distance from the centre to the body segment minus both radii.
 */
export function gapTo(c: Collider): number {
  const R = TUNING.radius;
  const ph = bodyHeight();
  if (c.shape === 'sphere') {
    const lo = P.y + R;
    const hi = Math.max(lo, P.y + ph - R);
    const cy = Math.max(lo, Math.min(hi, c.y));
    return Math.hypot(P.s - c.s, P.x - c.x, cy - c.y) - c.r - R;
  }
  const gs = Math.abs(P.s - c.s) - c.hs - R;
  const gx = Math.abs(P.x - c.x) - c.hx - R;
  const gyAbove = P.y - (c.y + c.h); // player above the box
  const gyBelow = c.y - (P.y + ph); // player under it (sliding under a branch)
  return Math.max(gs, gx, gyAbove, gyBelow);
}

/** fixed step, after the player and the set pieces moved */
export function stepCollision(): void {
  if (game.mode !== 'play') return;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.enabled) continue;
    const ds = c.s - P.s;
    if (ds > 12 || ds < -12) {
      c._in = false;
      continue;
    }
    const gap = gapTo(c);
    const inside = gap < 0;
    if (c.kind === 'hurt') {
      if (inside && !c._hit) {
        c._hit = true;
        hurt(c.label);
        c.onTouch?.(c);
        if (c.once) c.enabled = false;
      }
      // near miss bookkeeping: the closest lateral/vertical clearance while level with it
      const reach = (c.shape === 'sphere' ? c.r : c.hs) + TUNING.radius;
      if (Math.abs(ds) <= reach) c._min = Math.min(c._min, gap);
      if (c.near && !c._passed && P.s - TUNING.radius > c.s + (c.shape === 'sphere' ? c.r : c.hs)) {
        c._passed = true;
        if (!c._hit && c._min < NEAR && c._min >= 0) nearMiss(c.label);
      }
    } else if (inside && !c._in) {
      c.onTouch?.(c);
      if (c.once) c.enabled = false;
    }
    c._in = inside;
  }
}
