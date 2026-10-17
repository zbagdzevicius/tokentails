/**
 * Bad Cat sim core (GDD 4, 13.4): initSim / stepSim / runToEnd / hashState.
 * Integer maths only; all randomness from s.rng; stepSim mutates its state and appends events.
 *
 * Tick order: combo window → last call → humans → falling props → [v5 Roomba] → cat → suspicion → [v5 noise] →
 * caught → tick++ → end. `s.rules` picks the rule set (4 = M0 rules, bit-exact for v4 ghosts; 5 = FULL build).
 */
import {
  CONE_RANGE_V6,
  FTUE_SUSPICION_CAP,
  PARTY_SHELL_ID,
  PARTY_STACK_CAP,
  CUDDLE_TICKS,
  CatAct,
  FTUE_TICKS,
  HumanSt,
  LAST_CALL_TICKS,
  MIN_REPLAY_SIM_VERSION,
  MIRROR_SUSPICION_PCT,
  NO_INPUT,
  PropSt,
  RED_PAWED_GAIN_V8,
  RED_PAWED_HOLD_TICKS_V8,
  RED_PAWED_MESS_TICKS_V8,
  RED_PAWED_RANGE_V8,
  SIM_VERSION,
  SUSPICION,
  SUSPICION_MAX,
  catActGainsSuspicion,
  type CatSpec,
  type Facing,
  type Level,
  type PlayableRoom,
  type PropState,
  type RunResult,
  type SimEvent,
  type SimState,
  type TickInput,
} from '../types';
import { seedRng } from './rng';
import { FNV_OFFSET, fnvInt } from './hash';
import { initHuman, isFtueFirstLook, isNapper, stepHuman } from './human';
import { stepCat } from './cat';
import { kindOf, stepProps } from './props';
import { facingToward, looksAt } from './cone';

const ALL_FACINGS: readonly Facing[] = [1, 2, 3, 4, 5, 6, 7, 8];
import { finalizeScore, rankFor, stampId } from './scoring';
import { internal, isV5, isV7, isV8, timelineOf, type SimStateL1 } from './events';
import { frameOnLook, initCables, initRoomba, mirrorHuman, mirrorSees, stepNoise, stepRoomba } from './v5';

/** Options of initSim / runToEnd: `simVersion` picks the rule set (MIN_REPLAY_SIM_VERSION..SIM_VERSION). */
export interface SimOpts {
  simVersion?: number;
}

/** The rule set to run, RangeError outside MIN_REPLAY_SIM_VERSION..SIM_VERSION. */
export function rulesFor(opts?: SimOpts): number {
  const v = opts?.simVersion ?? SIM_VERSION;
  if (!Number.isInteger(v) || v < MIN_REPLAY_SIM_VERSION || v > SIM_VERSION)
    throw new RangeError(`simVersion ${v} outside ${MIN_REPLAY_SIM_VERSION}..${SIM_VERSION}`);
  return v;
}

export function initSim(play: PlayableRoom, _cat: CatSpec, opts?: SimOpts): SimState {
  const rules = rulesFor(opts);
  const v5 = rules >= 5;
  const sh = play.shell;
  const w = sh.width;
  const d = sh.depth;
  const n = w * d;
  const level = new Uint8Array(n);
  const occludes = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    level[i] = sh.levels[i] ?? 0;
    occludes[i] = sh.occludes[i] ?? 0;
  }
  const propAt = new Int16Array(n).fill(-1);
  const props: PropState[] = [];
  play.room.props.forEach((pl, i) => {
    props.push({
      kind: pl.kind,
      x: pl.x,
      z: pl.z,
      level: pl.level,
      fromX: pl.x,
      fromZ: pl.z,
      fromLevel: pl.level,
      state: PropSt.REST,
      swats: 0,
      fallTimer: 0,
      fallTicks: 0,
      dir: 0,
      chain: 0,
      points: 0,
      target: pl.target ? 1 : 0,
      hit: 0,
      seen: 0,
      restTick: -1,
    });
    // Tablecloth-style decoration (inert and non-blocking) never occupies a cell. v5: neither do boxes.
    const isCloth = pl.kind === 14;
    const offGrid = v5 && (kindOf(props[i]).enterable || kindOf(props[i]).pull === 'cloth');
    if (v5) {
      const p = props[i];
      p.pulls = 0;
      p.w = pl.w ?? 1;
      p.d = pl.d ?? 1;
      p.sway = 0;
      p.framed = 0;
      p.onCam = 0;
    }
    if (!isCloth && !offGrid && pl.x >= 0 && pl.z >= 0 && pl.x < w && pl.z < d && propAt[pl.z * w + pl.x] === -1) {
      propAt[pl.z * w + pl.x] = i;
    }
  });
  const sx = play.room.spawn.x;
  const sz = play.room.spawn.z;
  const lv = (level[sz * w + sx] ?? 0) as Level;
  const s: SimStateL1 = {
    tick: 0,
    ticks: play.mode === 'ftue' ? FTUE_TICKS : play.room.ticks,
    rng: seedRng(play.room.seed),
    grid: { w, d, level, occludes, propAt },
    cat: {
      x: sx,
      z: sz,
      level: lv,
      fromX: sx,
      fromZ: sz,
      fromLevel: lv,
      stepTicks: 0,
      stepProgress: 0,
      facing: 5, // facing the camera: the match-cut pose
      act: CatAct.IDLE,
      actTimer: 0,
      idleTicks: 0,
      carrying: -1,
      stashed: 0,
    },
    humans: [],
    props,
    suspicion: 0,
    maxSuspicion: 0,
    seen: 0,
    seenCount: 0,
    score: 0,
    combo: 1,
    maxCombo: 1,
    comboTimer: 0,
    targetsHit: 0,
    wish: 0,
    framed: 0,
    eventActive: 0,
    lastCall: 0,
    firstCrashTick: -1,
    stamp: 0,
    caughtTick: -1,
    ended: 0,
    finalScore: 0,
    btnBuf: 0,
    autoHop: 0,
    spotted: 0,
  };
  s.rules = rules;
  if (rules >= 6) {
    const boss = !!play.room.boss || !!play.routine2;
    s.coneR2 = boss ? 0 : CONE_RANGE_V6 * CONE_RANGE_V6;
    s.suspCap = play.mode === 'ftue' ? FTUE_SUSPICION_CAP : 0;
    s.stackCap = play.shell.id === PARTY_SHELL_ID && !boss ? PARTY_STACK_CAP : 0;
  }
  if (rules >= 7) s.chainHop = 0;
  if (rules >= 8) {
    (s as SimStateL1).redpaw = 0;
    (s as SimStateL1).track = 0;
  }
  s.humans.push(initHuman(s, play));
  if (v5) {
    if (play.routine2 && play.shell.humanSpot2) s.humans.push(initHuman(s, play, 1));
    s.grid.puddle = new Uint8Array(n);
    s.noise = 0;
    s.maxNoise = 0;
    s.slides = 0;
    s.pulls = 0;
    s.onCamera = 0;
    s.inBox = -1;
    s.slideStep = 0;
    s.noisy = 0;
    s.wishProp = play.room.accomplice?.wishPropIndex ?? -1;
    s.napper = -1;
    for (let i = 0; i < s.humans.length; i++) if (s.napper < 0 && isNapper(s, play, i)) s.napper = i;
    s.cables = initCables(s, play);
    s.roomba = initRoomba(s, play);
    if (s.roomba) {
      const r = s.roomba;
      if (propAt[r.z * w + r.x] === r.prop) propAt[r.z * w + r.x] = -1;
    }
  }
  return s;
}

/** A prop is in the air (v7 combo hold). */
function anyFalling(s: SimState): boolean {
  for (const p of s.props) if (p.state === PropSt.FALLING) return true;
  return false;
}

function endRun(s: SimState, tick: number, out: SimEvent[]): void {
  const caught = s.caughtTick >= 0;
  let looks = 0;
  for (const h of s.humans) looks += h.turns;
  let breaks = 0;
  for (const p of s.props) if (p.state === PropSt.BROKEN || p.state === PropSt.SPILLED) breaks++;
  const f = finalizeScore(s.score, caught, s.maxSuspicion, { looks, breaks, targets: s.targetsHit });
  s.finalScore = f.finalScore;
  s.stamp = f.stamp;
  s.ended = 1;
  out.push({ t: 'end', tick });
}

function clampSuspicion(s: SimState): void {
  if (s.suspicion < 0) s.suspicion = 0;
  if (s.suspicion > SUSPICION_MAX) s.suspicion = SUSPICION_MAX;
  const cap = (s as SimStateL1).suspCap ?? 0;
  if (cap > 0 && s.suspicion > cap) s.suspicion = cap; // v6 first heist: never caught
  if (s.suspicion > s.maxSuspicion) s.maxSuspicion = s.suspicion;
}

/** Cat visibility and per-tick suspicion (GDD 4.3). */
function stepSuspicion(s: SimState, play: PlayableRoom, out: SimEvent[]): void {
  if (isV5(s)) {
    stepSuspicionV5(s, play, out);
    return;
  }
  const c = s.cat;
  let looking = false;
  let seen: 0 | 1 = 0;
  let half = false;
  for (const h of s.humans) {
    if (h.state !== HumanSt.LOOK) continue;
    looking = true;
    if (
      looksAt(s, h, h.facing, c.x, c.z, c.level) ||
      (c.stepTicks > 0 && looksAt(s, h, h.facing, c.fromX, c.fromZ, c.fromLevel))
    ) {
      seen = 1;
      if (isFtueFirstLook(play, h)) half = true;
    }
  }
  if (seen) {
    let gain = 0;
    if (c.act === CatAct.LOAF) gain = SUSPICION.loafInCone;
    else if (c.act === CatAct.SNEAK) gain = SUSPICION.moveSneakInCone;
    else if (catActGainsSuspicion(c.act)) gain = SUSPICION.moveTrotInCone;
    // IDLE (the 10 ticks before the loaf) adds nothing: a frozen cat is not suspicious yet.
    // FTUE's first look is the forgiving lesson: gains count half (the meter visibly climbs, ~60 % on a pass).
    if (half && gain > 0) gain = Math.floor(gain / 2);
    s.suspicion += gain;
  } else if (!looking) {
    s.suspicion += SUSPICION.decayBusy;
  }
  clampSuspicion(s);
  // SIM_VERSION 4: "seen" counts the moments the cat MOVES in a cone (suspicion rises). A cat that froze in time
  // is in sight (s.seen) but not spotted; one count per continuous stretch in the cone.
  const st = internal(s);
  if (!seen) st.spotted = 0;
  else if (!st.spotted && catActGainsSuspicion(c.act)) {
    st.spotted = 1;
    s.seenCount++;
    out.push({ t: 'seen', tick: s.tick, suspicion: s.suspicion });
  }
  s.seen = seen;
}

/**
 * v8: a prop that broke, spilled or landed less than `maxAge` ticks ago (RED_PAWED_MESS_TICKS_V8 to start a red-pawed
 * stretch, RED_PAWED_HOLD_TICKS_V8 to keep it) within RED_PAWED_RANGE_V8 cells of the cat.
 */
export function freshMessBeside(s: SimState, maxAge: number = RED_PAWED_MESS_TICKS_V8): boolean {
  const c = s.cat;
  for (const p of s.props) {
    if (p.restTick < 0 || s.tick - p.restTick >= maxAge) continue;
    if (p.state !== PropSt.BROKEN && p.state !== PropSt.SPILLED && p.state !== PropSt.LANDED) continue;
    if (Math.abs(p.x - c.x) <= RED_PAWED_RANGE_V8 && Math.abs(p.z - c.z) <= RED_PAWED_RANGE_V8) return true;
  }
  return false;
}

/** In-cone gain of the cat's current act (shared by v5 human and mirror sight). */
function moveGain(act: number): number {
  if (act === CatAct.LOAF) return SUSPICION.loafInCone;
  if (act === CatAct.SNEAK) return SUSPICION.moveSneakInCone;
  if (catActGainsSuspicion(act)) return SUSPICION.moveTrotInCone;
  return 0;
}

/**
 * v5 suspicion: v4's human cones (any of the humans; one shared meter), plus the mirror (a moving cat in the live
 * mirror cone adds MIRROR_SUSPICION_PCT % of the move rates) and the box (loafing in it sheds 2x the loaf rate).
 */
function stepSuspicionV5(s: SimState, play: PlayableRoom, out: SimEvent[]): void {
  const c = s.cat;
  let looking = false;
  let seen: 0 | 1 = 0;
  let by = -1;
  let half = false;
  const st0 = internal(s);
  const v8 = isV8(s);
  // v8: the human tracking the cat lost it when his look ended
  if (v8 && st0.track && s.humans[st0.track - 1]?.state !== HumanSt.LOOK) st0.track = 0;
  for (let i = 0; i < s.humans.length; i++) {
    const h = s.humans[i];
    if (h.state !== HumanSt.LOOK) continue;
    looking = true;
    // v8: eyes on a cat he saw move reach the full cone length (it cannot just trot out of range)
    const full = v8 && st0.track === i + 1;
    if (
      looksAt(s, h, h.facing, c.x, c.z, c.level, full) ||
      (c.stepTicks > 0 && looksAt(s, h, h.facing, c.fromX, c.fromZ, c.fromLevel, full))
    ) {
      if (!seen) by = i;
      seen = 1;
      if (isFtueFirstLook(play, h)) half = true;
    }
  }
  let mirror = -1;
  if (!seen) {
    const m = mirrorHuman(s, play);
    if (
      m >= 0 &&
      (mirrorSees(s, play, c.x, c.z, c.level) || (c.stepTicks > 0 && mirrorSees(s, play, c.fromX, c.fromZ, c.fromLevel)))
    )
      mirror = m;
  }
  const boxLoaf = (s.inBox ?? -1) >= 0 && c.act === CatAct.LOAF;
  let gain = 0;
  // v8 red-pawed: freezing in sight right beside a fresh mess is no alibi (QA round 3: a 0.2-1.0 s reaction was
  // never caught). Hiding in a box still works, and the first heist keeps its forgiving lesson.
  const st8 = internal(s);
  // he turns and sees the cat frozen beside a fresh mess: red-pawed for as long as it stays there in sight
  // (not the Napper: she is groggy and her own noise meter is the Sunday's rule)
  const red =
    seen && isV8(s) && !boxLoaf && play.mode !== 'ftue' && !catActGainsSuspicion(c.act) && !isNapper(s, play, by) && freshMessBeside(s, st8.redpaw ? RED_PAWED_HOLD_TICKS_V8 : RED_PAWED_MESS_TICKS_V8);
  if (isV8(s)) {
    if (red && !st8.redpaw) out.push({ t: 'redpaw', tick: s.tick, human: by });
    st8.redpaw = red ? 1 : 0;
  }
  // v8: a human who sees the cat move keeps his eyes on it (his cone follows the cat for the rest of the look):
  // moving in sight is no longer a gamble on getting out of a 70° cone in time (QA round 3: a cat that never
  // froze was never caught on Tuesdays). Freezing is the answer.
  if (v8 && play.mode !== 'ftue') {
    if (seen && by >= 0 && catActGainsSuspicion(c.act)) {
      const h = s.humans[by];
      h.facing = facingToward(ALL_FACINGS, h.x, h.z, c.x, c.z);
      st0.track = by + 1;
    } else if (!seen) st0.track = 0;
  }
  if (red) {
    gain = RED_PAWED_GAIN_V8;
  } else if (seen) {
    gain = boxLoaf ? 2 * SUSPICION.loafInCone : moveGain(c.act);
    if (half && gain > 0) gain = Math.floor(gain / 2);
  } else if (mirror >= 0 && catActGainsSuspicion(c.act)) {
    gain = Math.floor((moveGain(c.act) * MIRROR_SUSPICION_PCT) / 100);
  } else if (boxLoaf) {
    gain = 2 * SUSPICION.loafInCone;
  } else if (!looking) {
    gain = SUSPICION.decayBusy;
  }
  s.suspicion += gain;
  clampSuspicion(s);
  const vis = seen || mirror >= 0;
  const st = internal(s);
  if (!vis) st.spotted = 0;
  else if (!st.spotted && catActGainsSuspicion(c.act)) {
    st.spotted = 1;
    s.seenCount++;
    out.push({ t: 'seen', tick: s.tick, suspicion: s.suspicion, by: seen ? 'human' : 'mirror', human: seen ? by : mirror });
  }
  s.seen = vis ? 1 : 0;
}

export function stepSim(s: SimState, play: PlayableRoom, input: TickInput, out: SimEvent[]): void {
  if (s.ended) return;
  internal(s);
  const c = s.cat;

  if (s.comboTimer > 0) {
    // v7: the window holds while a fall (a domino in flight) has not landed yet
    if (!(isV7(s) && anyFalling(s))) s.comboTimer--;
    if (s.comboTimer === 0) s.combo = 1;
  }

  if (c.act === CatAct.CUDDLED) {
    // Caught: the cuddle plays out; props already in the air still land (visuals, no new suspicion matters).
    stepProps(s, out, play);
    if (isV5(s)) stepRoomba(s, play, out);
    c.actTimer--;
    if (c.actTimer <= 0) endRun(s, s.tick, out);
    s.tick++;
    return;
  }

  if (!s.lastCall && s.ticks - s.tick <= LAST_CALL_TICKS) {
    s.lastCall = 1;
    out.push({ t: 'lastcall', tick: s.tick });
  }

  for (let i = 0; i < s.humans.length; i++) {
    stepHuman(s, i, play, out);
    // v7: a human who just turned can still see a fresh mess by the Roomba (framing it)
    if (isV7(s) && s.humans[i].state === HumanSt.LOOK && s.humans[i].lookStartTick === s.tick) frameOnLook(s, i, out);
  }
  stepProps(s, out, play); // before the cat: a fall started this tick by a swat lands exactly fallTicks later
  const v5 = isV5(s);
  if (v5) stepRoomba(s, play, out);
  stepCat(s, play, input, out);
  stepSuspicion(s, play, out);
  if (v5) stepNoise(s, play, out);
  // v6 first heist: a crash seen late in the tick (props.ts) may have pushed past the cap
  const cap = (s as SimStateL1).suspCap ?? 0;
  if (cap > 0 && s.suspicion > cap) s.suspicion = cap;

  if (s.suspicion >= SUSPICION_MAX) {
    s.caughtTick = s.tick;
    c.act = CatAct.CUDDLED;
    c.actTimer = CUDDLE_TICKS;
    out.push({ t: 'caught', tick: s.tick });
  }

  s.tick++;
  if (c.act !== CatAct.CUDDLED && s.tick >= s.ticks) endRun(s, s.tick - 1, out);
}

export function runToEnd(play: PlayableRoom, cat: CatSpec, inputs: readonly TickInput[], opts?: SimOpts): RunResult {
  const s = initSim(play, cat, opts);
  const events: SimEvent[] = [];
  const used: TickInput[] = [];
  const cap = s.ticks + CUDDLE_TICKS + 2;
  while (!s.ended && s.tick < cap) {
    const i = inputs[s.tick] ?? NO_INPUT;
    used.push(i);
    stepSim(s, play, i, events);
  }
  return {
    roomId: play.room.id,
    dayNo: play.dayNo,
    mode: play.mode,
    simVersion: s.rules ?? SIM_VERSION,
    score: s.finalScore,
    stamp: stampId(s.stamp),
    rank: rankFor(s.finalScore, s.caughtTick >= 0, play.rankPct ?? 100, play.rankMins),
    maxCombo: s.maxCombo,
    seenCount: s.seenCount,
    targets: s.targetsHit,
    framed: s.framed,
    ticks: s.tick,
    timeline: timelineOf(events, s.stamp),
    inputs: used,
    events,
    finalHash: hashState(s),
    wish: s.wish === 1,
    stashed: s.cat.stashed,
    slides: s.slides ?? 0,
    pulls: s.pulls ?? 0,
    onCamera: s.onCamera ?? 0,
    maxNoise: s.maxNoise ?? 0,
    humans: s.humans.length,
  };
}

/** FNV-1a over every integer field of the state, including the typed arrays. */
export function hashState(s: SimState): number {
  const rules = s.rules ?? SIM_VERSION;
  let h = FNV_OFFSET;
  h = fnvInt(h, rules);
  h = fnvInt(h, s.tick);
  h = fnvInt(h, s.ticks);
  h = fnvInt(h, s.rng);
  const g = s.grid;
  h = fnvInt(h, g.w);
  h = fnvInt(h, g.d);
  for (let i = 0; i < g.level.length; i++) h = fnvInt(h, g.level[i]);
  for (let i = 0; i < g.occludes.length; i++) h = fnvInt(h, g.occludes[i]);
  for (let i = 0; i < g.propAt.length; i++) h = fnvInt(h, g.propAt[i]);
  const c = s.cat;
  for (const v of [c.x, c.z, c.level, c.fromX, c.fromZ, c.fromLevel, c.stepTicks, c.stepProgress, c.facing, c.act, c.actTimer, c.idleTicks, c.carrying, c.stashed])
    h = fnvInt(h, v);
  for (const u of s.humans)
    for (const v of [u.x, u.z, u.facing, u.state, u.timer, u.stateTicks, u.telegraph, u.fakeOut, u.lookFacing, u.eventDone, u.turns, u.lookStartTick])
      h = fnvInt(h, v);
  for (const p of s.props)
    for (const v of [p.kind, p.x, p.z, p.level, p.fromX, p.fromZ, p.fromLevel, p.state, p.swats, p.fallTimer, p.fallTicks, p.dir, p.chain, p.points, p.target, p.hit, p.seen, p.restTick])
      h = fnvInt(h, v);
  for (const v of [s.suspicion, s.maxSuspicion, s.seen, s.seenCount, s.score, s.combo, s.maxCombo, s.comboTimer, s.targetsHit, s.wish, s.framed, s.eventActive, s.lastCall, s.firstCrashTick, s.stamp, s.caughtTick, s.ended, s.finalScore, (s as SimStateL1).btnBuf ?? 0, (s as SimStateL1).autoHop ?? 0, (s as SimStateL1).spotted ?? 0])
    h = fnvInt(h, v);
  if (rules >= 5) h = hashV5(h, s as SimStateL1);
  if (rules >= 7) h = fnvInt(h, (s as SimStateL1).chainHop ?? 0);
  if (rules >= 8) {
    h = fnvInt(h, (s as SimStateL1).redpaw ?? 0);
    h = fnvInt(h, (s as SimStateL1).track ?? 0);
    for (const u of s.humans) {
      h = fnvInt(h, u.over ?? 0);
      h = fnvInt(h, u.lastFake ?? 0);
      h = fnvInt(h, u.r2 ?? 0);
    }
  }
  return h >>> 0;
}

/** The v5 fields, hashed only under rules >= 5 (so v4 hashes equal the pre-v5 code with the constant 4). */
function hashV5(h: number, s: SimStateL1): number {
  for (const v of [s.noise ?? 0, s.maxNoise ?? 0, s.slides ?? 0, s.pulls ?? 0, s.onCamera ?? 0, s.inBox ?? -1])
    h = fnvInt(h, v);
  for (const v of [s.slideStep ?? 0, s.noisy ?? 0, s.wishProp ?? -1, s.napper ?? -1]) h = fnvInt(h, v);
  const cs = s.cables ?? [];
  h = fnvInt(h, cs.length);
  for (let i = 0; i < cs.length; i++) h = fnvInt(h, cs[i]);
  const r = s.roomba;
  if (r) for (const v of [1, r.prop, r.x, r.z, r.fromX, r.fromZ, r.loopIndex, r.stepProgress, r.facing, r.pause]) h = fnvInt(h, v);
  else h = fnvInt(h, 0);
  const pu = s.grid.puddle;
  if (pu) for (let i = 0; i < pu.length; i++) h = fnvInt(h, pu[i]);
  for (const p of s.props)
    for (const v of [p.pulls ?? 0, p.w ?? 1, p.d ?? 1, p.sway ?? 0, p.framed ?? 0, p.onCam ?? 0]) h = fnvInt(h, v);
  for (const u of s.humans) h = fnvInt(h, u.routine ?? -1);
  return h;
}
