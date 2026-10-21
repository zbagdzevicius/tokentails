/**
 * AI item use (GDD 5.2): when to fire, hold or drop each item. All decisions come from the race state and the
 * kart's `rngAi` stream, so they replay exactly.
 *
 * - Hairball: a rival within 30 m inside a ~10° cone ahead (aggressive cats aim looser); else backwards at a tailgater.
 * - Yarn: held as a shield while a rival is within 15 m behind; thrown (homing) when a rival is within 50 m ahead.
 * - Cucumber: dropped on a tailgater, lobbed at a rival 12–40 m ahead.
 * - Catnip on straights; Box when a projectile or the Laser Dot is coming; Bell with 2+ rivals within 25 m.
 * - Zoomies and Laser Dot soon after the roulette.
 * - AI karts more than 4 s ahead of the player are a little less eager (AI.farAheadEager), so fights still happen
 *   ahead of the player (feel lane: they used to be half as eager, and the front of the field went quiet).
 * - The player's rival (`RacerInfo.rival`) aims at the player twice as often: it reacts and fires sooner and takes
 *   longer shots when the player is the target; a grudge (the player hit it in the last 20 s) doubles that again.
 * - Set pieces (SIM_VERSION 8): a kart on a loop's rail, in a jump gap's flight or its net cannot be hit, so it is no
 *   target (not ahead, behind or near); a cat in one of those holds its item until it is out.
 */
import type { ItemId, Personality, TickInput } from '../../types';
import { AI, ITEMS } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { curvatureAhead } from '../../core/sim/autopilot';
import { speedOf } from '../../core/sim/kart';
import { atan2L, wrapAngle } from '../../core/sim/fixed';
import { draw } from '../../core/sim/rng';
import { stuntImmune } from '../../core/sim/stunt';
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
  /** nearest rival behind by track distance, protected or not (it can still throw at us: the held-yarn shield) */
  chaser: number;
  /** rivals within the bell radius */
  near: number;
  /** the player: track gap (> 0 ahead), straight-line distance, inside the aim cone */
  player: number;
  playerDist: number;
  playerCone: boolean;
}

function look(ctx: SimContext, i: number, cone: number): Seen {
  const ks = ctx.st.karts;
  const k = ks[i];
  const s: Seen = { aheadCone: Infinity, ahead: Infinity, behind: Infinity, behindLane: false, chaser: Infinity, near: 0, player: 0, playerDist: Infinity, playerCone: false };
  const human = ctx.cfg.humans[0] ?? -1;
  const r2 = ITEMS.bell.radius * ITEMS.bell.radius;
  for (let j = 0; j < ks.length; j++) {
    if (j === i) continue;
    const o = ks[j];
    if (o.respawnTicks > 0 || o.finished || stuntImmune(o)) continue;
    const g = o.dist - k.dist;
    if (g <= 0 && -g < s.chaser) s.chaser = -g;
    // SIM_VERSION 10: a boxed, Zoomies or invulnerable kart is no aim target (applyHit blocks the hit: a wasted item)
    if (o.shieldTicks > 0 || o.autoTicks > 0 || o.invTicks > 0) continue;
    const dx = o.x - k.x;
    const dz = o.z - k.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) s.near++;
    if (j === human) {
      s.player = g;
      s.playerDist = Math.sqrt(d2);
      s.playerCone = g > 0 && Math.abs(wrapAngle(atan2L(dx, dz) - k.heading)) < cone * 1.5;
    }
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
      // (it rolls the way its thrower faced: against the lap, it closes in from the higher distance, SIM_VERSION 10)
      if (p.target === i && gap * p.dir > -2 && gap * p.dir < 25) return true;
    } else if (gap > -2 && gap < 18 && Math.abs(p.d - k.d) < 3.5) return true;
  }
  return false;
}

/** Fill `out.item` / `out.itemBack` for AI kart i. */
export function useItems(ctx: SimContext, i: number, out: TickInput, m: BrainMemory, p: Personality, grudge = false): void {
  const k = ctx.st.karts[i];
  out.item = false;
  out.itemBack = false;
  if (!k.item || k.rouletteTicks > 0 || k.spinTicks > 0) {
    if (!k.item) m.id = null;
    m.pressed = false;
    return;
  }
  const human = ctx.cfg.humans[0];
  const rival = human != null && !!ctx.cfg.racers[i]?.rival;
  const eager = rival ? AI.rival.eager * (grudge ? 2 : 1) : 1;
  if (m.id !== k.item) {
    m.id = k.item;
    m.held = 0;
    m.react = Math.floor((10 + Math.floor(draw(k, 'rngAi') * (40 - 25 * p.skill))) / eager);
  }
  m.held++;
  // on a loop's rail or over a gap: wait (a press would only be buffered until the exit)
  if (stuntImmune(k)) return;
  // far ahead of the player (> 4 s): a little less eager
  const slow = human != null && -gapToPlayer(ctx, i) > 4 * ctx.tun.topSpeed ? 1 / AI.farAheadEager : 1;
  if (m.held < m.react * slow) return;
  if (m.pressed) {
    m.pressed = false; // release between presses (Catnip ×3 needs fresh edges)
    return;
  }
  const maxHold = ((6 - 4 * p.aggression) * 60 * slow) / eager;
  const late = m.held > maxHold;
  const cone = (10 + 8 * p.aggression) * 0.017453292519943295;
  const s = look(ctx, i, cone);
  let fire = false;
  let back = false;
  // the rival takes longer shots at the player: up to 30 m × eagerness, in a wider cone
  const atPlayer = rival && s.playerCone && s.playerDist < 30 * Math.min(2, eager);
  switch (k.item) {
    case 'hairball':
      if (s.aheadCone < 30 || atPlayer) fire = true;
      else if (s.behind < 12 && s.behindLane && m.held > maxHold / 2) fire = back = true;
      else fire = late;
      break;
    case 'yarn':
      if (s.chaser < 15 && m.held < maxHold * 2 && !atPlayer) fire = false; // trailing shield
      else if (s.ahead < 50 || (rival && s.player > 0 && s.player < 50 * Math.min(2, eager))) fire = true;
      else if (late) {
        fire = true;
        back = s.behind < 40;
      }
      break;
    case 'cucumber':
      if (s.behind < 25 && s.behindLane) fire = back = true;
      else if ((s.ahead > 12 && s.ahead < 40) || (rival && s.player > 12 && s.player < 40)) fire = true;
      else fire = late;
      break;
    case 'catnip':
    {
      // a straight long enough for the whole boost (SIM_VERSION 6: a boosted kart cannot turn into a hairpin)
      const reach = Math.max(30, speedOf(k) * 1.8);
      const bend = Math.max(Math.abs(curvatureAhead(ctx, k.si, 0, reach * 0.5)), Math.abs(curvatureAhead(ctx, k.si, reach * 0.5, reach)));
      fire = k.boostTicks === 0 && bend < 0.015;
      if (!fire && late && k.boostTicks === 0 && bend < 0.03) fire = true;
    }
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
