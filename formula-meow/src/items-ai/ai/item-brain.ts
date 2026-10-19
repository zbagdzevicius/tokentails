/**
 * AI item use (GDD 5.2): when to fire, hold or drop each item. All decisions come from the race state and the
 * kart's `rngAi` stream, so they replay exactly.
 *
 * - Hairball: a rival within 30 m inside a ~10° cone ahead (aggressive cats aim looser); else backwards at a tailgater.
 * - Yarn: held as a shield while a rival is within 15 m behind; thrown (homing) when a rival is within 50 m ahead.
 * - Cucumber: dropped on a tailgater, lobbed at a rival 12–40 m ahead.
 * - Catnip on straights; Box when a projectile or the Laser Dot is coming; Bell with 2+ rivals within 25 m.
 * - Zoomies and Laser Dot soon after the roulette.
 * - AI karts more than 4 s ahead of the player use items half as often (slower to act, longer holds).
 */
import type { ItemId, Personality, TickInput } from '../../types';
import { ITEMS } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { curvatureAhead } from '../../core/sim/autopilot';
import { atan2L, wrapAngle } from '../../core/sim/fixed';
import { draw } from '../../core/sim/rng';
import { ProjKind, itemsOf } from '../items/state';
import { ownerLeads } from '../items/projectiles';
import { gapToPlayer } from './rubber-band';

export interface BrainMemory {
  /** ticks the current item has been ready */
  held: number;
  /** ticks before the cat reacts at all (rolled per item) */
  react: number;
  pressed: boolean;
  /** item the memory belongs to (reset on change) */
  id: ItemId | null;
}

export function newBrain(): BrainMemory {
  return { held: 0, react: 0, pressed: false, id: null };
}

interface Seen {
  /** nearest rival ahead inside the aim cone, metres (Infinity none) */
  aheadCone: number;
  /** nearest rival ahead by track distance */
  ahead: number;
  /** nearest rival behind by track distance, and whether it is roughly in our lane */
  behind: number;
  behindLane: boolean;
  /** rivals within the bell radius */
  near: number;
}

function look(ctx: SimContext, i: number, cone: number): Seen {
  const ks = ctx.st.karts;
  const k = ks[i];
  const s: Seen = { aheadCone: Infinity, ahead: Infinity, behind: Infinity, behindLane: false, near: 0 };
  const r2 = ITEMS.bell.radius * ITEMS.bell.radius;
  for (let j = 0; j < ks.length; j++) {
    if (j === i) continue;
    const o = ks[j];
    if (o.respawnTicks > 0 || o.finished) continue;
    const dx = o.x - k.x;
    const dz = o.z - k.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) s.near++;
    const g = o.dist - k.dist;
    if (g > 0) {
      if (g < s.ahead) s.ahead = g;
      if (d2 < 30 * 30 && Math.abs(wrapAngle(atan2L(dx, dz) - k.heading)) < cone) s.aheadCone = Math.min(s.aheadCone, Math.sqrt(d2));
    } else if (-g < s.behind) {
      s.behind = -g;
      s.behindLane = Math.abs(o.d - k.d) < 2.5;
    }
  }
  return s;
}

/** Is something about to hit kart i (a projectile closing in, or the Laser Dot coming for it)? */
export function threatened(ctx: SimContext, i: number): boolean {
  const s = itemsOf(ctx.st);
  const k = ctx.st.karts[i];
  if (s.laserWarn === i) return true;
  for (const p of s.proj) {
    if (p.owner === i && p.imm > 0) continue;
    const gap = k.dist - p.dist;
    if (p.kind === ProjKind.Laser) {
      if (p.target === i && gap < 45) return true;
    } else if (p.kind === ProjKind.YarnBall) {
      if (p.target === i && gap > -2 && gap < 25) return true;
    } else if (gap > -2 && gap < 18 && Math.abs(p.d - k.d) < 3.5) return true;
  }
  return false;
}

/** Fill `out.item` / `out.itemBack` for AI kart i. */
export function useItems(ctx: SimContext, i: number, out: TickInput, m: BrainMemory, p: Personality): void {
  const k = ctx.st.karts[i];
  out.item = false;
  out.itemBack = false;
  if (!k.item || k.rouletteTicks > 0 || k.spinTicks > 0) {
    if (!k.item) m.id = null;
    m.pressed = false;
    return;
  }
  if (m.id !== k.item) {
    m.id = k.item;
    m.held = 0;
    m.react = 10 + Math.floor(draw(k, 'rngAi') * (40 - 25 * p.skill));
  }
  m.held++;
  // far ahead of the player (> 4 s): half as eager
  const human = ctx.cfg.humans[0];
  const slow = human != null && -gapToPlayer(ctx, i) > 4 * ctx.tun.topSpeed ? 2 : 1;
  if (m.held < m.react * slow) return;
  if (m.pressed) {
    m.pressed = false; // release between presses (Catnip ×3 needs fresh edges)
    return;
  }
  const maxHold = (6 - 4 * p.aggression) * 60 * slow;
  const late = m.held > maxHold;
  const cone = (10 + 8 * p.aggression) * 0.017453292519943295;
  const s = look(ctx, i, cone);
  let fire = false;
  let back = false;
  switch (k.item) {
    case 'hairball':
      if (s.aheadCone < 30) fire = true;
      else if (s.behind < 12 && s.behindLane && m.held > maxHold / 2) fire = back = true;
      else fire = late;
      break;
    case 'yarn':
      if (s.behind < 15 && m.held < maxHold * 2) fire = false; // trailing shield
      else if (s.ahead < 50) fire = true;
      else if (late) {
        fire = true;
        back = s.behind < 40;
      }
      break;
    case 'cucumber':
      if (s.behind < 25 && s.behindLane) fire = back = true;
      else if (s.ahead > 12 && s.ahead < 40) fire = true;
      else fire = late;
      break;
    case 'catnip':
      fire = k.boostTicks === 0 && Math.abs(curvatureAhead(ctx, k.si, 0, 30)) < 0.015;
      if (!fire && late && k.boostTicks === 0) fire = true;
      break;
    case 'box':
      fire = threatened(ctx, i) || m.held > maxHold * 3;
      break;
    case 'bell':
      fire = s.near >= 2 || (late && s.near >= 1) || m.held > maxHold * 2;
      break;
    case 'zoomies':
      fire = true;
      break;
    case 'laser':
      // the leader keeps it (fired from the front it would only fizzle, B17)
      fire = !ownerLeads(ctx, i);
      break;
  }
  if (fire) {
    out.item = true;
    out.itemBack = back;
    m.pressed = true;
  }
}
