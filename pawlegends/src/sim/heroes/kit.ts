/**
 * Hero kits: the cast pipeline every ability and Paw Trick goes through (POC.md §4.3 steps 1 and 5), and the
 * dispatch to the bespoke hero modules (clem.ts, sage.ts, brutus.ts, cacklejaw.ts, and the sim v9 shelter champions
 * lambo.ts, aviete.ts, bengas.ts, gabe.ts) for their abilities, passives and damage hooks.
 *
 * Cast flow: a `cast`/`trick` command checks readiness (cooldown or an open recast window, level 4 for R, not
 * disabled, no mobility cast while rooted) and either walks in (a unit or ground target out of reach) or starts the
 * cast with its windup. Step 5 resolves a cast whose windup ends; the kit returns the cooldown to set, or −1 when it
 * fizzled (no cooldown spent).
 */
import { XP } from '../../data/xp';
import { NO_TARGET, type CastSlot } from '../api';
import { ANGLE_STEPS, BP_ONE, dist2, iatan2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, FM, G, Kind, RANGE, UnitState, type World } from '../world';
import { disabled, interrupt } from '../effects/status';
import { radiusOf, targetable } from '../units/kinds';
import { abil, type KitNumbers } from './talents';
import { CLEM_KIT } from './clem';
import { SAGE_KIT } from './sage';
import { BRUTUS_KIT } from './brutus';
import { CACKLEJAW_KIT } from './cacklejaw';
import { LAMBO_KIT } from './lambo';
import { AVIETE_KIT } from './aviete';
import { BENGAS_KIT } from './bengas';
import { GABE_KIT } from './gabe';
import { castTrick, trickAim } from './tricks';

/** How a slot is aimed. */
export const Aim = Object.freeze({
  /** A direction from the hero (a target id only aims it). */
  Dir: 0,
  /** A ground point within `reach`; further away, the hero walks in first. */
  Point: 1,
  /** An enemy unit within `reach`; further away, the hero walks in first. */
  Unit: 2,
  /** On the hero itself. */
  Self: 3,
} as const);

export const TRICK_SLOT = 4;

export interface SlotAim {
  aim: number;
  /** Walk-in reach (mm, centre to target edge); 0 = cast from where the hero stands. */
  reach: number;
  windup: number;
  /** Dashes and blinks: refused while rooted. */
  mobility: boolean;
}

export interface HeroKit {
  aim(a: KitNumbers, slot: number): SlotAim;
  /** Is a recast window open for `slot` (the cooldown is then ignored)? */
  recastReady?(w: World, id: number, slot: number): boolean;
  /** Resolve a cast. Returns the cooldown to set (0 keeps it ready), or −1 when it fizzled. */
  cast(m: MatchHandle, id: number, slot: number, x: number, y: number, target: number): number;
  /** Per tick (after the status timers): passive and ability timers. */
  stepKit?(m: MatchHandle, id: number): void;
  /** Every tick of an ability dash (FM.Dash) or homing dash (FM.Hunt), after the move. A dash that ended (landed or
   *  stopped by CC) shows as `fmKind === FM.None` in the kit's next stepKit. */
  onDashTick?(m: MatchHandle, id: number): void;
  /** Before a homing dash moves: aim it (FM.Hunt). */
  aimHunt?(m: MatchHandle, id: number): void;
  /** A basic attack resolves at `dst` with `dmg`. Return true when the kit fired it itself (no default hit or bolt). */
  basic?(m: MatchHandle, id: number, dst: number, dmg: number): boolean;
  /** After a basic attack landed (melee) or was fired (ranged). */
  afterBasic?(m: MatchHandle, id: number, dst: number): void;
  /** Outgoing damage before armour. */
  outgoing?(m: MatchHandle, id: number, dst: number, raw: number): number;
  /** Incoming damage after armour, from `src` (−1: the map). */
  incoming?(m: MatchHandle, id: number, src: number, dmg: number): number;
  /** Extra shield beyond the flat one (Honour); returns the amount absorbed. */
  absorb?(w: World, id: number, dmg: number): number;
  /** After `id` dealt `dmg` (shield included) to `dst`. */
  afterDeal?(m: MatchHandle, id: number, dst: number, dmg: number, kind: string): void;
  /** `id` took part in the takedown of enemy hero `victim`. */
  onTakedown?(m: MatchHandle, id: number, victim: number): void;
  /** Reset kit state at death and respawn. */
  reset?(w: World, id: number): void;
}

/** HERO_IDS order: clem, sage, brutus, cacklejaw, lambo, aviete, bengas, gabe. */
const KITS: readonly HeroKit[] = [CLEM_KIT, SAGE_KIT, BRUTUS_KIT, CACKLEJAW_KIT, LAMBO_KIT, AVIETE_KIT, BENGAS_KIT, GABE_KIT];

export const kitOf = (w: World, id: number): HeroKit => KITS[w.sub[id]];

/** Ability damage at the hero's level: base + perLevel × (level − 1). */
export const lvl = (w: World, id: number, base: number, perLevel: number): number => base + (perLevel ?? 0) * (w.level[id] - 1);

/** Direction from hero `id` to (x, y); its facing when the point is the hero's own position. */
export function aimAngle(w: World, id: number, x: number, y: number): number {
  if (x === w.x[id] && y === w.y[id]) return w.facing[id];
  return iatan2(y - w.y[id], x - w.x[id]);
}

export const HALF_TURN = ANGLE_STEPS >> 1;

const cdIndex = (id: number, slot: number): number => id * COOLDOWN_SLOTS + slot;

function slotAim(w: World, id: number, slot: number): SlotAim {
  return slot === TRICK_SLOT ? trickAim(w, id) : kitOf(w, id).aim(abil(w, id), slot);
}

/** Can hero `id` start `slot` now? */
export function canCast(w: World, id: number, slot: number): boolean {
  if (w.kind[id] !== Kind.Hero || w.alive[id] === 0 || disabled(w, id)) return false;
  if (w.fmKind[id] !== FM.None) return false;
  if (w.castPhase[id] === 2) return false;
  if (slot === 3 && w.level[id] < XP.ultimateLevel) return false;
  const ready = w.cooldowns[cdIndex(id, slot)] === 0 || (slot < TRICK_SLOT && kitOf(w, id).recastReady?.(w, id, slot) === true);
  if (!ready) return false;
  if (w.rootT[id] > 0 && slotAim(w, id, slot).mobility) return false;
  return true;
}

/** Is the cast target (unit or point) within the slot's reach? */
function inReach(w: World, id: number, s: SlotAim): boolean {
  if (s.reach <= 0) return true;
  const t = w.castId[id];
  const tx = t >= 0 ? w.x[t] : w.castX[id];
  const ty = t >= 0 ? w.y[t] : w.castY[id];
  const reach = s.reach + (t >= 0 ? radiusOf(w, t) : 0);
  return dist2(w.x[id], w.y[id], tx, ty) <= reach * reach;
}

/** Nearest enemy hero to (x, y) that `team` can target, within `reach` of hero `id`; −1 when none. */
function unitNear(w: World, id: number, x: number, y: number, reach: number): number {
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!targetable(w, e, w.team[id])) continue;
    const r = reach + radiusOf(w, e);
    if (dist2(w.x[id], w.y[id], w.x[e], w.y[e]) > r * r) continue;
    const d = dist2(x, y, w.x[e], w.y[e]);
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function beginWindup(m: MatchHandle, id: number, s: SlotAim): void {
  const w = m.world;
  w.castPhase[id] = 2;
  w.castT[id] = s.windup;
  w.pathLen[id] = 0;
  if (s.windup > 0) {
    w.state[id] = UnitState.Casting;
    m.events.push({ type: 'windup', tick: w.globals[G.Tick], src: id, slot: w.castSlot[id] as CastSlot | 4, x: w.castX[id], y: w.castY[id], ticks: s.windup });
  }
}

/** Step 1: a `cast` (slot 0..3) or `trick` (slot 4) command. Refused silently when not ready. */
export function orderCast(m: MatchHandle, id: number, slot: number, x: number, y: number, target: number): void {
  const w = m.world;
  if (!canCast(w, id, slot)) return;
  const s = slotAim(w, id, slot);
  let t = target !== NO_TARGET && target < RANGE.end && targetable(w, target, w.team[id]) ? target : -1;
  if (s.aim === Aim.Unit && t >= 0 && w.kind[t] !== Kind.Hero) t = -1;
  if (s.aim === Aim.Unit && t < 0) t = unitNear(w, id, x, y, s.reach);
  if (s.aim === Aim.Unit && t < 0) return;
  // A walk-in only follows a unit for unit casts and aimed directional casts (Dir with a target).
  if (s.aim === Aim.Point || s.aim === Aim.Self) t = -1;
  interrupt(w, id, false);
  w.castSlot[id] = slot;
  w.castX[id] = x;
  w.castY[id] = y;
  w.castId[id] = t;
  const walkIn = (s.aim === Aim.Point || s.aim === Aim.Unit || (s.aim === Aim.Dir && t >= 0)) && !inReach(w, id, s);
  if (walkIn) {
    w.castPhase[id] = 1;
    w.pathLen[id] = 0;
    w.timer[id] = 0;
  } else beginWindup(m, id, s);
}

/** Step 4 for a hero walking into cast reach: returns true while it still has to walk (the caller moves it). */
export function walkInDone(m: MatchHandle, id: number): boolean {
  const w = m.world;
  const t = w.castId[id];
  if (t >= 0 && !targetable(w, t, w.team[id])) {
    w.castPhase[id] = 0;
    return true;
  }
  const s = slotAim(w, id, w.castSlot[id]);
  if (!inReach(w, id, s)) return false;
  if (t >= 0) {
    w.castX[id] = w.x[t];
    w.castY[id] = w.y[t];
  }
  beginWindup(m, id, s);
  return true;
}

/** Where a walk-in goes. */
export const walkInX = (w: World, id: number): number => (w.castId[id] >= 0 ? w.x[w.castId[id]] : w.castX[id]);
export const walkInY = (w: World, id: number): number => (w.castId[id] >= 0 ? w.y[w.castId[id]] : w.castY[id]);

/** Step 5: casts whose windup ends now resolve. */
export function resolveCasts(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.castPhase[id] !== 2) continue;
    if (w.alive[id] === 0 || disabled(w, id)) {
      w.castPhase[id] = 0;
      continue;
    }
    if (w.castT[id] > 0 && --w.castT[id] > 0) continue;
    w.castPhase[id] = 0;
    const slot = w.castSlot[id];
    let t = w.castId[id];
    if (t >= 0 && !targetable(w, t, w.team[id])) t = -1;
    const x = t >= 0 ? w.x[t] : w.castX[id];
    const y = t >= 0 ? w.y[t] : w.castY[id];
    const s = slotAim(w, id, slot);
    if (s.aim !== Aim.Self && (x !== w.x[id] || y !== w.y[id])) w.facing[id] = iatan2(y - w.y[id], x - w.x[id]);
    const cd = slot === TRICK_SLOT ? castTrick(m, id, x, y) : kitOf(w, id).cast(m, id, slot, x, y, t);
    if (cd < 0) continue;
    if (cd > 0 || slot === TRICK_SLOT) w.cooldowns[cdIndex(id, slot)] = cd;
    if (w.state[id] === UnitState.Casting) w.state[id] = UnitState.Idle;
    m.events.push({ type: 'cast', tick, src: id, slot: slot as CastSlot | 4, x, y, target: t });
  }
}

/** Step 0: hero cooldowns tick down (faster under a cooldown-rate buff). */
export function tickCooldowns(w: World): void {
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.kind[id] !== Kind.Hero) continue;
    const extra = w.cdrT[id] > 0 ? w.cdrBp[id] : 0;
    for (let s = 0; s < COOLDOWN_SLOTS; s++) {
      const i = cdIndex(id, s);
      if (w.cooldowns[i] === 0) continue;
      // 1 + bp/10000 a tick; the fraction is spread over ticks (floor((t+1)·bp) − floor(t·bp), in bp units).
      let step = 1;
      if (extra > 0) {
        const t = w.globals[G.Tick];
        step += idiv((t + 1) * extra, BP_ONE) - idiv(t * extra, BP_ONE);
      }
      w.cooldowns[i] = Math.max(0, w.cooldowns[i] - step);
    }
  }
}

/** Step 4 (after the status timers): every hero's kit timers. */
export function stepKits(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.kind[id] !== Kind.Hero || w.alive[id] === 0) continue;
    kitOf(w, id).stepKit?.(m, id);
  }
}

/** A homing dash (FM.Hunt) is aimed by its kit before it moves. */
export function aimHunt(m: MatchHandle, id: number): void {
  if (m.world.fmKind[id] === FM.Hunt) kitOf(m.world, id).aimHunt?.(m, id);
}
