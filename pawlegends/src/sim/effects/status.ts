/**
 * Shared status plumbing for the effect primitives: CC immunity, interrupts, per-tick timers and the snapshot buff
 * flags. Timers count ticks left; an effect applied with N ticks is active for the next N movement steps (timers tick
 * down right after movement, §4.3 step 4).
 */
import { FM, Kind, RANGE, UnitState, type World } from '../world';

/**
 * Structures, fountains, Pudding and dead units ignore CC and displacement. Sim v10 (GAPS B5): so does a unit with
 * Purr-ify's immunity (`ccImmT`).
 */
export function ccImmune(w: World, id: number): boolean {
  if (w.alive[id] === 0 || w.ccImmT[id] > 0) return true;
  const k = w.kind[id];
  return k !== Kind.Hero && k !== Kind.Minion && k !== Kind.Camp;
}

/**
 * Sim v10 (GAPS B5) `cleanse`: remove stun, root, slow, fear and charm from `id`, then `immuneTicks` of CC immunity.
 * A knockback in flight finishes (it is displacement, not a status).
 */
export function cleanse(w: World, id: number, immuneTicks: number): void {
  w.stunT[id] = 0;
  w.rootT[id] = 0;
  w.fearT[id] = 0;
  w.fearSrc[id] = -1;
  w.slowT[id] = 0;
  w.slowBp[id] = 0;
  w.ccImmT[id] = Math.max(w.ccImmT[id], immuneTicks);
}

/**
 * Cancel what `id` is doing: the basic-attack windup, a cast in progress, Nap, an ability dash. `hard` CC (stun,
 * fear, knockback) also breaks Snack Break.
 */
export function interrupt(w: World, id: number, hard: boolean): void {
  w.windup[id] = 0;
  if (id < RANGE.minions) {
    w.castPhase[id] = 0;
    w.castT[id] = 0;
    if (w.napT[id] > 0) {
      w.napT[id] = 0;
      w.state[id] = UnitState.Idle;
    }
  }
  if (w.fmKind[id] !== FM.None && w.fmKind[id] !== FM.Knock) {
    w.fmT[id] = 0;
    w.fmKind[id] = FM.None;
    w.fmTarget[id] = -1;
  }
  if (hard) {
    w.healT[id] = 0;
    w.healLeft[id] = 0;
  }
}

/** Is `id` unable to act (stunned, feared or charmed, knocked back)? */
export const disabled = (w: World, id: number): boolean =>
  w.stunT[id] > 0 || w.fearT[id] > 0 || w.fmKind[id] === FM.Knock;

/** Clear every status of `id` (death, respawn). */
export function clearStatus(w: World, id: number): void {
  w.stunT[id] = 0;
  w.rootT[id] = 0;
  w.fearT[id] = 0;
  w.fearSrc[id] = -1;
  w.slowT[id] = 0;
  w.slowBp[id] = 0;
  w.hasteT[id] = 0;
  w.hasteBp[id] = 0;
  w.asT[id] = 0;
  w.asBp[id] = 0;
  w.cdrT[id] = 0;
  w.cdrBp[id] = 0;
  w.stealthT[id] = 0;
  w.untargT[id] = 0;
  w.ccImmT[id] = 0;
  w.revealT[id] = 0;
  w.shield[id] = 0;
  w.shieldT[id] = 0;
  w.healT[id] = 0;
  w.healLeft[id] = 0;
  w.fmT[id] = 0;
  w.fmKind[id] = FM.None;
  w.fmTarget[id] = -1;
  w.tether[id] = -1;
}

const dec = (a: Int32Array, i: number): void => {
  if (a[i] > 0) a[i]--;
};

/** Step 4 (after movement): every status timer ticks down; expired buffs lose their strength. */
export function tickStatus(w: World): void {
  for (let id = 0; id < RANGE.end; id++) {
    if (w.alive[id] === 0) continue;
    dec(w.stunT, id);
    dec(w.rootT, id);
    dec(w.fearT, id);
    if (w.fearT[id] === 0) w.fearSrc[id] = -1;
    dec(w.slowT, id);
    if (w.slowT[id] === 0) w.slowBp[id] = 0;
    dec(w.hasteT, id);
    if (w.hasteT[id] === 0) w.hasteBp[id] = 0;
    dec(w.asT, id);
    if (w.asT[id] === 0) w.asBp[id] = 0;
    dec(w.cdrT, id);
    if (w.cdrT[id] === 0) w.cdrBp[id] = 0;
    dec(w.stealthT, id);
    dec(w.untargT, id);
    dec(w.ccImmT, id);
    dec(w.revealT, id);
    if (w.shieldT[id] > 0 && --w.shieldT[id] === 0) w.shield[id] = 0;
  }
}
