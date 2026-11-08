/**
 * Shared status plumbing for the effect primitives: CC immunity, interrupts, per-tick timers and the snapshot buff
 * flags. Timers count ticks left; an effect applied with N ticks is active for the next N movement steps (timers tick
 * down right after movement, §4.3 step 4).
 */
import { CC_DR } from '../../data/effects';
import { FM, Kind, RANGE, UnitState, type World } from '../world';
import { clearStacks, tickStacks } from './stack';

/**
 * Structures, fountains, Pudding and dead units ignore CC and displacement. Sim v10 (GAPS B5): so does a unit with
 * Purr-ify's immunity (`ccImmT`).
 */
export function ccImmune(w: World, id: number): boolean {
  if (w.alive[id] === 0 || w.ccImmT[id] > 0) return true;
  const k = w.kind[id];
  return k !== Kind.Hero && k !== Kind.Minion && k !== Kind.Camp;
}

/** Ticks of lock `id` is already under: the longest of stun, fear or charm, root and a knockback in flight. */
const lockLeft = (w: World, id: number): number =>
  Math.max(w.stunT[id], w.fearT[id], w.rootT[id], w.fmKind[id] === FM.Knock ? w.fmT[id] : 0);

/**
 * Sim v17 Steadfast (CC_DR, docs/plans/moba/V17.md §3.1): the ticks a new hard CC of `ticks` on `id` may last. Only the
 * lock it adds beyond the lock already running counts toward the window's cap; the CC that reaches the cap is cut
 * short and grants CC immunity for the rest of the lock plus CC_DR.immune. Heroes only (minions and camps unchanged).
 * Call after the `ccImmune` check.
 */
export function drGrant(w: World, id: number, ticks: number): number {
  if (id < RANGE.heroes || id >= RANGE.minions) return ticks;
  if (w.ccWinT[id] === 0) {
    w.ccWinT[id] = CC_DR.window;
    w.ccSum[id] = 0;
  }
  const cur = lockLeft(w, id);
  const add = ticks - cur;
  if (add <= 0) return ticks;
  const grant = Math.min(add, CC_DR.cap - w.ccSum[id]);
  w.ccSum[id] += grant;
  if (w.ccSum[id] >= CC_DR.cap) w.ccImmT[id] = Math.max(w.ccImmT[id], cur + grant + CC_DR.immune);
  return cur + grant;
}

/**
 * Sim v17 Steadfast, once a tick after the status timers: the window runs down but never closes while a lock is still
 * running (so one unbroken lock is always counted in one window and never exceeds CC_DR.cap), and once the cap's
 * immunity has run out the window closes at once (the next CC opens a fresh one).
 */
function tickSteadfast(w: World, id: number): void {
  if (w.ccWinT[id] > 1 || lockLeft(w, id) === 0) dec(w.ccWinT, id);
  if (w.ccImmT[id] === 0 && (w.ccWinT[id] === 0 || w.ccSum[id] >= CC_DR.cap)) {
    w.ccWinT[id] = 0;
    w.ccSum[id] = 0;
  }
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
  w.ccWinT[id] = 0;
  w.ccSum[id] = 0;
  w.revealT[id] = 0;
  w.shield[id] = 0;
  w.shieldT[id] = 0;
  w.healT[id] = 0;
  w.healLeft[id] = 0;
  w.fmT[id] = 0;
  w.fmKind[id] = FM.None;
  w.fmTarget[id] = -1;
  w.tether[id] = -1;
  if (id < RANGE.minions) {
    clearStacks(w, id);
    // Sim v15: Domino's Spots fall off a hero that dies (a respawned hero never carries old Spots).
    w.dotN[id] = 0;
    w.dotT[id] = 0;
  }
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
    if (id < RANGE.minions && (w.ccWinT[id] > 0 || w.ccSum[id] > 0)) tickSteadfast(w, id);
    dec(w.revealT, id);
    if (w.shieldT[id] > 0 && --w.shieldT[id] === 0) w.shield[id] = 0;
    if (id < RANGE.minions) {
      tickStacks(w, id);
      // Sim v15: Domino's Spots expire.
      if (w.dotT[id] > 0 && --w.dotT[id] === 0) w.dotN[id] = 0;
    }
  }
}
