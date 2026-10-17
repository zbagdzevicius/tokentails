/**
 * The Watcher (GDD 4.3): BUSY → TELEGRAPH → LOOK → BUSY, TELEGRAPH → FAKEOUT → BUSY after
 * `fakeOutAfterTick`, escalation after `escalateAfterTick`, and the once-per-room EVENT (it pre-empts any
 * state so it always starts exactly on its tick). All rolls come from s.rng.
 */
import { EVENT_TICKS, FAKEOUT_AFTER_TICK_V8, FAKEOUT_PCT_V8, FTUE_TELEGRAPH_V6, HumanSt, NOISE, NOISE_AFTER_WAKE_V7, TWO_HUMAN_GAP_TICKS_V8, WAKE_LOOK_BONUS_V7, telegraphV8, type HumanState, type PlayableRoom, type RoutineDef, type SimEvent, type SimState } from '../types';
import { nextRng, rngInt } from './rng';
import { humanStateName, isV5, isV6, isV7, isV8 } from './events';
import { facingToward } from './cone';

/** v5 two-human rooms: the second human's first turn comes this much later, so the two never turn as one. */
export const SECOND_HUMAN_LAG_TICKS = 90;

/** Routine of human `idx` (boss rooms: humans[1] runs PlayableRoom.routine2). */
export function routineOf(play: PlayableRoom, idx: number): RoutineDef {
  return idx === 1 && play.routine2 ? play.routine2 : play.routine;
}
function homeOf(play: PlayableRoom, idx: number): { x: number; z: number } {
  return idx === 1 && play.shell.humanSpot2 ? play.shell.humanSpot2 : play.shell.humanSpot;
}
function eventSpotOf(play: PlayableRoom, idx: number): { x: number; z: number } {
  return idx === 1 ? play.shell.humanEventSpot2 ?? play.shell.humanEventSpot : play.shell.humanEventSpot;
}
/** v5 Napper (Sunday): sleeps until the noise meter wakes her. */
export function isNapper(s: SimState, play: PlayableRoom, idx: number): boolean {
  return isV5(s) && routineOf(play, idx).kind === 'napper';
}

/** Share of looks (percent) that turn toward the cat instead of a random look facing. */
export const LOOK_AT_CAT_PCT = 40;

/** First TELEGRAPH tick in FTUE (8 s) and the earliest one in ranked/practice (GDD 3.1: first turn ~8–12 s). */
export const FIRST_TURN_TICK = 240;
/** Ranked/practice jitter added to the first turn (0..60 ticks → 8–10 s). */
export const FIRST_TURN_JITTER = 60;
export const FTUE_EVENT_TICK = 450;
/** FTUE's first look lasts the routine's shortest look plus this (SIM_VERSION 4). */
export const FTUE_FIRST_LOOK_EXTRA = 15;
/** A fake-out twitch lasts this long before the human goes back to BUSY. */
export const FAKEOUT_TICKS = 15;
/** Busy never gets shorter than this, even escalated. */
export const MIN_BUSY_TICKS = 45;

export function roll(s: SimState, range: readonly [number, number]): number {
  const a = range[0];
  const b = range[1] < a ? a : range[1];
  s.rng = nextRng(s.rng);
  return a + rngInt(s.rng, b - a + 1);
}

export function eventTickOf(play: PlayableRoom): number {
  return play.mode === 'ftue' ? FTUE_EVENT_TICK : play.routine.eventTick;
}

export function initHuman(s: SimState, play: PlayableRoom, idx = 0): HumanState {
  const r = routineOf(play, idx);
  const home = homeOf(play, idx);
  const nap = isNapper(s, play, idx);
  let first = 0;
  if (!nap) {
    first = play.mode === 'ftue' ? FIRST_TURN_TICK : FIRST_TURN_TICK + roll(s, [0, FIRST_TURN_JITTER]);
    if (idx > 0) first += SECOND_HUMAN_LAG_TICKS;
  }
  const h: HumanState = {
    x: home.x,
    z: home.z,
    facing: r.busyFacing,
    state: nap ? HumanSt.NAP : HumanSt.BUSY,
    timer: first,
    stateTicks: first,
    telegraph: 0,
    fakeOut: 0,
    lookFacing: r.lookFacings.length ? r.lookFacings[0] : r.busyFacing,
    eventDone: 0,
    turns: 0,
    lookStartTick: -1,
  };
  if (isV5(s)) h.routine = idx === 1 ? play.room.routine2 ?? play.room.routine : play.room.routine;
  if (isV8(s) && r.lookOverV8 && r.lookOverV8 > 0) h.over = r.lookOverV8;
  if (isV8(s) && r.coneRangeV8 && r.coneRangeV8 > 0) h.r2 = r.coneRangeV8 * r.coneRangeV8;
  return h;
}

function setState(s: SimState, idx: number, h: HumanState, st: HumanSt, ticks: number, out: SimEvent[]): void {
  h.state = st;
  h.timer = ticks;
  h.stateTicks = ticks;
  out.push({ t: 'human', tick: s.tick, human: idx, state: humanStateName(st) });
}

function busyTicks(s: SimState, r: RoutineDef): number {
  let t = roll(s, r.busy);
  // v8: with two humans taking turns one after the other (never together), each is busy a quarter longer, so the
  // room is not mostly waiting (QA round 3: two-human rooms were 50–52 % waiting)
  if (isV8(s) && s.humans.length > 1) t += t >> 2;
  if (s.tick >= r.escalateAfterTick) t -= r.busyCutTicks;
  return t < MIN_BUSY_TICKS ? MIN_BUSY_TICKS : t;
}

/** FTUE's first look (SIM_VERSION 3): always toward the cat, the long look, half suspicion (see sim.ts). */
export function isFtueFirstLook(play: PlayableRoom, h: HumanState): boolean {
  return play.mode === 'ftue' && h.turns === 1;
}

function lookTicks(s: SimState, play: PlayableRoom, h: HumanState, r: RoutineDef): number {
  // FTUE: the first lesson is a slightly long look (the meter visibly climbs, freezing visibly saves you) but
  // not dead time (SIM_VERSION 4: look[0] + 15 = 2 s, was look[1] = 3.5 s); later FTUE looks use the shortest one.
  // Ranked rolls the range.
  if (play.mode === 'ftue') return isFtueFirstLook(play, h) ? r.look[0] + FTUE_FIRST_LOOK_EXTRA : r.look[0];
  let t = roll(s, r.look);
  if (s.tick >= r.escalateAfterTick) t += r.lookBonusTicks;
  // v7: the Napper's wake look lasts a second longer (she wakes less often, so each wake matters)
  // v8: back to the routine's look (QA round 3: a Sunday was half waiting with the bonus)
  if (isV7(s) && !isV8(s) && r.kind === 'napper') t += WAKE_LOOK_BONUS_V7;
  return t;
}

function toBusy(s: SimState, idx: number, h: HumanState, play: PlayableRoom, out: SimEvent[]): void {
  const r = routineOf(play, idx);
  const home = homeOf(play, idx);
  h.facing = r.busyFacing;
  h.x = home.x;
  h.z = home.z;
  h.fakeOut = 0;
  setState(s, idx, h, HumanSt.BUSY, busyTicks(s, r), out);
}

/** v5 Napper back to sleep. After a wake look (or an event that ate the wake) the meter drops to NOISE.afterWake. */
function toNap(s: SimState, idx: number, h: HumanState, play: PlayableRoom, out: SimEvent[]): void {
  const r = routineOf(play, idx);
  const home = homeOf(play, idx);
  const fromLook = h.state === HumanSt.LOOK || h.state === HumanSt.TELEGRAPH || h.state === HumanSt.FAKEOUT;
  h.facing = r.busyFacing;
  h.x = home.x;
  h.z = home.z;
  h.fakeOut = 0;
  if (fromLook || (s.noise ?? 0) >= NOISE.max) s.noise = isV7(s) ? NOISE_AFTER_WAKE_V7 : NOISE.afterWake;
  setState(s, idx, h, HumanSt.NAP, 0, out);
}

/**
 * v5 Napper wakes (noise meter full): 'wake', a yawn TELEGRAPH (routine telegraph range, one RNG roll) toward the
 * cat (she heard you), then a normal LOOK with cone, suspicion and caught. Called by the sim after the noise step.
 */
export function wakeNapper(s: SimState, idx: number, play: PlayableRoom, out: SimEvent[]): void {
  const h = s.humans[idx];
  const r = routineOf(play, idx);
  out.push({ t: 'wake', tick: s.tick, human: idx });
  const tg = roll(s, r.telegraph);
  h.lookFacing = r.lookFacings.length ? facingToward(r.lookFacings, h.x, h.z, s.cat.x, s.cat.z) : r.busyFacing;
  h.telegraph = tg;
  h.fakeOut = 0;
  setState(s, idx, h, HumanSt.TELEGRAPH, tg, out);
}

/**
 * v8: another (awake) human is warning, looking or faking a turn, or went back to work less than
 * TWO_HUMAN_GAP_TICKS_V8 ago: this one's turn waits.
 */
function otherTurning(s: SimState, idx: number): boolean {
  for (let i = 0; i < s.humans.length; i++) {
    if (i === idx) continue;
    const o = s.humans[i];
    if (o.state === HumanSt.TELEGRAPH || o.state === HumanSt.LOOK || o.state === HumanSt.FAKEOUT) return true;
    if (o.state === HumanSt.BUSY && o.turns > 0 && o.stateTicks - o.timer < TWO_HUMAN_GAP_TICKS_V8) return true;
  }
  return false;
}

/** Advance one human by one tick. */
export function stepHuman(s: SimState, idx: number, play: PlayableRoom, out: SimEvent[]): void {
  const h = s.humans[idx];
  const r = routineOf(play, idx);
  const nap = isNapper(s, play, idx);

  if (!h.eventDone && s.tick >= eventTickOf(play)) {
    const spot = eventSpotOf(play, idx);
    h.eventDone = 1;
    h.fakeOut = 0;
    h.x = spot.x;
    h.z = spot.z;
    s.eventActive = 1;
    setState(s, idx, h, HumanSt.EVENT, EVENT_TICKS, out);
  } else if (h.state === HumanSt.NAP) {
    return; // asleep: only the noise meter (sim.ts) or the room event wakes her
  } else if (h.timer <= 0) {
    switch (h.state) {
      case HumanSt.BUSY: {
        // FTUE: the telegraph is the longest (most forgiving) and there are no fake-outs.
        const ftue = play.mode === 'ftue';
        const v8 = isV8(s);
        // v8: two humans never warn at once; the second waits until the other has been back at work a moment
        if (v8 && !ftue && otherTurning(s, idx)) {
          // stays BUSY (no event, no roll); ticks-into-BUSY keeps counting for the mirror phase
          h.stateTicks += TWO_HUMAN_GAP_TICKS_V8 - h.timer;
          h.timer = TWO_HUMAN_GAP_TICKS_V8;
          break;
        }
        // v6: the first heist warns 30 ticks ahead on every turn (it was the weekday's 22-24)
        let tg = ftue ? (isV6(s) ? Math.max(FTUE_TELEGRAPH_V6, r.telegraph[1]) : r.telegraph[1]) : roll(s, r.telegraph);
        // v8: every ranked / practice warning is a quarter shorter (freezing is a reflex, not a free pass)
        if (v8 && !ftue) tg = telegraphV8(tg);
        let fake: 0 | 1 = 0;
        // v8: fake-outs are 35 % of turns from 20 s on (v4..v7: the routine's share, mostly 20 % from 30 s)
        const fakeAfter = v8 && r.fakeOutPct > 0 ? Math.min(r.fakeOutAfterTick, FAKEOUT_AFTER_TICK_V8) : r.fakeOutAfterTick;
        const fakePct = v8 && r.fakeOutPct > 0 ? Math.max(r.fakeOutPct, FAKEOUT_PCT_V8) : r.fakeOutPct;
        // v8: never two fake-outs in a row (QA round 3: three in a row let a cat that never froze go free)
        if (!ftue && s.tick >= fakeAfter && fakePct > 0 && !(v8 && h.lastFake)) {
          s.rng = nextRng(s.rng);
          fake = rngInt(s.rng, 100) < fakePct ? 1 : 0;
        }
        if (v8) h.lastFake = fake;
        if (ftue && h.turns === 0 && r.lookFacings.length) {
          // FTUE's first turn always looks at the cat (no roll): the red-light lesson must land.
          h.lookFacing = facingToward(r.lookFacings, h.x, h.z, s.cat.x, s.cat.z);
        } else if (r.lookFacings.length > 1) {
          s.rng = nextRng(s.rng);
          if (rngInt(s.rng, 100) < LOOK_AT_CAT_PCT) h.lookFacing = facingToward(r.lookFacings, h.x, h.z, s.cat.x, s.cat.z);
          else {
            s.rng = nextRng(s.rng);
            h.lookFacing = r.lookFacings[rngInt(s.rng, r.lookFacings.length)];
          }
        } else if (r.lookFacings.length === 1) h.lookFacing = r.lookFacings[0];
        h.telegraph = tg;
        h.fakeOut = fake;
        setState(s, idx, h, HumanSt.TELEGRAPH, tg, out);
        break;
      }
      case HumanSt.TELEGRAPH:
        if (h.fakeOut) {
          setState(s, idx, h, HumanSt.FAKEOUT, FAKEOUT_TICKS, out);
        } else {
          h.facing = h.lookFacing;
          h.turns++;
          h.lookStartTick = s.tick;
          setState(s, idx, h, HumanSt.LOOK, lookTicks(s, play, h, r), out);
        }
        break;
      case HumanSt.EVENT:
        s.eventActive = 0;
        if (nap) toNap(s, idx, h, play, out);
        else toBusy(s, idx, h, play, out);
        break;
      default: // LOOK, FAKEOUT
        if (nap) toNap(s, idx, h, play, out);
        else toBusy(s, idx, h, play, out);
        break;
    }
  }
  if (h.state !== HumanSt.NAP) h.timer--;
}
