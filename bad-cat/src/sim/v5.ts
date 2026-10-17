/**
 * SIM_VERSION 5 rules (FULL build, GDD 3.5, 4.2-4.5): spill-slide puddles, the Roomba (and framing it), the
 * accomplice wish, the enterable box, cloth and cable pulls, the tall tree topple, the Napper's noise meter,
 * mirror and webcam cones. Everything here runs only when `isV5(s)`; the v4 rule set never calls in.
 * Integer maths only; no RNG draws (the only v5 draws are the second human's and the napper's yawn, human.ts).
 */
import {
  BONUS,
  CatAct,
  FRAME_RANGE_V7,
  NOISE_LOAF_DECAY_V7,
  NOISE_LOAF_DECAY_V8,
  NOISE_V8,
  DIR_DX,
  DIR_DZ,
  FALL_TICKS,
  HumanSt,
  MIRROR_CHECK_TICKS,
  MIRROR_CYCLE_TICKS,
  MIRROR_CYCLE_TICKS_V8,
  MIRROR_FIRST_GLINT,
  MIRROR_GLINT_TICKS,
  NOISE,
  NOISE_V6,
  NOISE_V7,
  PropSt,
  ROOMBA_STEP_TICKS,
  isDiagonal,
  type Dir8,
  type Facing,
  type Level,
  type PlayableRoom,
  type PropKindDef,
  type PropState,
  type RoombaState,
  type SimEvent,
  type SimState,
} from '../types';
import { inBounds } from './grid';
import { internal, isV5, isV6, isV7, isV8 } from './events';
import { humanAt, kindOf, levelAt, propOn, pushProp, setPropAt, startFall } from './props';
import { looksAt, originLevel, shortConeSees } from './cone';
import { routineOf, wakeNapper } from './human';

/** The Roomba waits this long when the cat, a human or an intact floor prop is in its way. */
export const ROOMBA_BLOCK_PAUSE = 15;
/** ...and this long when something crashes on or next to it ("what was that?!"). */
export const ROOMBA_CRASH_PAUSE = 30;
/** Noise counts 3/2 within this Chebyshev distance of the napper. */
export const NOISE_NEAR = 3;
/** A cloth drops off the table on its second pull. */
export const CLOTH_MAX_PULLS = 2;
/** A knocked-over prop that has nowhere lower to go (tree topple) falls in place over this many ticks. */
export const KNOCK_TICKS = 9;

const cheb = (ax: number, az: number, bx: number, bz: number): number => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

/** Facing rotated by r eighths (r may be negative). */
function rot(f: Facing, r: number): Facing {
  return (((((f - 1 + r) % 8) + 8) % 8) + 1) as Facing;
}
/** Direction from a to b by sign (b need not be adjacent), 0 when equal. */
export function dirToward(ax: number, az: number, bx: number, bz: number): Dir8 {
  const dx = Math.sign(bx - ax);
  const dz = Math.sign(bz - az);
  for (let d = 1; d <= 8; d++) if (DIR_DX[d] === dx && DIR_DZ[d] === dz) return d as Dir8;
  return 0;
}
export function opposite(d: Facing): Facing {
  return rot(d, 4);
}

// ---------------------------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------------------------

/** v5: props the cat can swat normally (not inert, not actor/box/tall/cloth). */
export function normalKind(k: PropKindDef): boolean {
  return !k.inert && !k.enterable && !k.actor && k.tall === undefined && k.pull !== 'cloth';
}
export function intact(p: PropState): boolean {
  return p.state === PropSt.REST || p.state === PropSt.WOBBLE;
}

// ---------------------------------------------------------------------------------------------
// Accomplice wish, box
// ---------------------------------------------------------------------------------------------

/** Grant the accomplice's wish the first time its prop falls, is grabbed or entered (+BONUS.wish, once). */
export function grantWish(s: SimState, idx: number, out: SimEvent[]): void {
  if (!isV5(s) || s.wish) return;
  const w = internal(s).wishProp ?? -1;
  if (w < 0 || w !== idx) return;
  s.wish = 1;
  s.score += BONUS.wish;
  out.push({ t: 'wish', tick: s.tick });
}

/** Enterable prop (box) on (x, z), -1 none. Boxes never sit in propAt. */
export function boxAt(s: SimState, x: number, z: number): number {
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    if (p.x === x && p.z === z && p.state === PropSt.REST && kindOf(p).enterable) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Puddles
// ---------------------------------------------------------------------------------------------

export function puddleAt(s: SimState, x: number, z: number): number {
  const pu = s.grid.puddle;
  if (!pu || !inBounds(s.grid, x, z)) return 0;
  return pu[z * s.grid.w + x];
}

function setPuddle(s: SimState, x: number, z: number, kind: 1 | 2, out: SimEvent[]): void {
  const pu = s.grid.puddle;
  if (!pu || !inBounds(s.grid, x, z) || levelAt(s, x, z) !== 0) return;
  const i = z * s.grid.w + x;
  if (pu[i] !== 0) return;
  pu[i] = kind;
  out.push({ t: 'puddle', tick: s.tick, x, z, kind });
}

/**
 * A spilled/broken puddle kind that landed on the floor leaves a 2 x 2 puddle: the landing cell, +1 in the push
 * direction, +1 perpendicular clockwise and the diagonal between them. A diagonal push uses its x and z parts as
 * the two axes. Cells off the grid or above L0 are clipped; existing puddles stay as they are.
 */
export function spillPuddle(s: SimState, p: PropState, out: SimEvent[]): void {
  const k = kindOf(p);
  if (!k.puddle || p.level !== 0) return;
  const kind: 1 | 2 = k.puddle === 'slip' ? 1 : 2;
  const d = (p.dir || 5) as Facing;
  let ax: number, az: number, bx: number, bz: number;
  if (isDiagonal(d)) {
    ax = DIR_DX[d];
    az = 0;
    bx = 0;
    bz = DIR_DZ[d];
  } else {
    const c = rot(d, 2);
    ax = DIR_DX[d];
    az = DIR_DZ[d];
    bx = DIR_DX[c];
    bz = DIR_DZ[c];
  }
  setPuddle(s, p.x, p.z, kind, out);
  setPuddle(s, p.x + ax, p.z + az, kind, out);
  setPuddle(s, p.x + bx, p.z + bz, kind, out);
  setPuddle(s, p.x + ax + bx, p.z + az + bz, kind, out);
}

// ---------------------------------------------------------------------------------------------
// Napper noise
// ---------------------------------------------------------------------------------------------

/** The noise numbers of this run's rule set (v6 hears swats and forgets slower). */
export function noiseRules(s: SimState): { trotStep: number; jumpDown: number; crash: number; land: number; decayPerTick: number; swat: number; max: number; afterWake: number } {
  return isV8(s) ? NOISE_V8 : isV7(s) ? NOISE_V7 : isV6(s) ? NOISE_V6 : { ...NOISE, swat: 0 };
}

/**
 * Add noise at (x, z) while the napper sleeps (TELEGRAPH, LOOK and the alarm EVENT freeze the meter). 3/2 within
 * NOISE_NEAR cells of her. Emits 'noise' for every quarter crossed going up.
 */
export function addNoise(s: SimState, amount: number, x: number, z: number, out: SimEvent[]): void {
  if (!isV5(s)) return;
  const st = internal(s);
  const n = st.napper ?? -1;
  if (n < 0) return;
  const h = s.humans[n];
  if (!h || h.state !== HumanSt.NAP) return;
  const a = cheb(h.x, h.z, x, z) <= NOISE_NEAR ? Math.floor((amount * 3) / 2) : amount;
  const before = s.noise ?? 0;
  let after = before + a;
  if (after > NOISE.max) after = NOISE.max;
  s.noise = after;
  st.noisy = 1;
  if (after > (s.maxNoise ?? 0)) s.maxNoise = after;
  const q0 = Math.floor((before * 4) / NOISE.max);
  const q1 = Math.floor((after * 4) / NOISE.max);
  for (let q = q0 + 1; q <= q1 && q <= 4; q++) out.push({ t: 'noise', tick: s.tick, level: (q * NOISE.max) / 4 });
}

/** End of tick: decay on quiet ticks while she sleeps; a full meter wakes her (yawn telegraph, then a look). */
export function stepNoise(s: SimState, play: PlayableRoom, out: SimEvent[]): void {
  const st = internal(s);
  const n = st.napper ?? -1;
  if (n < 0) return;
  const h = s.humans[n];
  if (h.state === HumanSt.NAP) {
    if ((s.noise ?? 0) >= NOISE.max) wakeNapper(s, n, play, out);
    else if (!st.noisy) {
      // v7: a loafing cat lets her drift back off much faster (fewer, scarier wakes)
      const loaf = isV7(s) && s.cat.act === CatAct.LOAF;
      // v8: 1.5x faster again (QA round 3: the Bedroom planner woke her 7 times and scored 0)
      const v = (s.noise ?? 0) + (loaf ? (isV8(s) ? NOISE_LOAF_DECAY_V8 : NOISE_LOAF_DECAY_V7) : noiseRules(s).decayPerTick);
      s.noise = v < 0 ? 0 : v;
    }
  }
  st.noisy = 0;
}

// ---------------------------------------------------------------------------------------------
// Roomba
// ---------------------------------------------------------------------------------------------

/** The Roomba prop on a loop cell, -1 none (init). */
export function initRoomba(s: SimState, play: PlayableRoom): RoombaState | null {
  const loop = play.shell.roombaLoop;
  if (!loop || loop.length < 2) return null;
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    if (kindOf(p).actor !== 'roomba') continue;
    for (let j = 0; j < loop.length; j++) {
      if (loop[j].x !== p.x || loop[j].z !== p.z) continue;
      const nx = loop[(j + 1) % loop.length];
      return {
        prop: i,
        x: p.x,
        z: p.z,
        fromX: p.x,
        fromZ: p.z,
        loopIndex: j,
        stepProgress: 0,
        facing: (dirToward(p.x, p.z, nx.x, nx.z) || 3) as Facing,
        pause: 0,
      };
    }
  }
  return null;
}

function roombaBlocked(s: SimState, x: number, z: number): boolean {
  const c = s.cat;
  if (c.x === x && c.z === z) return true;
  if (c.stepTicks > 0 && c.fromX === x && c.fromZ === z) return true;
  if (humanAt(s, x, z)) return true;
  const q = propOn(s, x, z);
  if (q >= 0) {
    const p = s.props[q];
    if (p.level === 0 && intact(p) && kindOf(p).blocks) return true;
  }
  return false;
}

/**
 * The Roomba drives its loop one cell per ROOMBA_STEP_TICKS. It never enters the cat's cell, a human's or one with
 * an intact blocking floor prop (waits ROOMBA_BLOCK_PAUSE), and drags a slip puddle it drives through onto the next
 * loop cell. Emits 'roomba' when it starts into a new cell.
 */
export function stepRoomba(s: SimState, play: PlayableRoom, out: SimEvent[]): void {
  const r = s.roomba;
  const loop = play.shell.roombaLoop;
  if (!r || !loop || loop.length < 2) return;
  const n = loop.length;
  if (r.fromX !== r.x || r.fromZ !== r.z) {
    r.stepProgress++;
    if (r.stepProgress < ROOMBA_STEP_TICKS) return;
    r.fromX = r.x;
    r.fromZ = r.z;
    r.stepProgress = 0;
    if (puddleAt(s, r.x, r.z) === 1) {
      const nx = loop[(r.loopIndex + 1) % n];
      setPuddle(s, nx.x, nx.z, 1, out);
    }
  }
  if (r.pause > 0) {
    r.pause--;
    return;
  }
  const next = loop[(r.loopIndex + 1) % n];
  if (roombaBlocked(s, next.x, next.z)) {
    r.pause = ROOMBA_BLOCK_PAUSE;
    return;
  }
  const d = dirToward(r.x, r.z, next.x, next.z);
  if (d) r.facing = d as Facing;
  r.x = next.x;
  r.z = next.z;
  r.loopIndex = (r.loopIndex + 1) % n;
  r.stepProgress = 0;
  const p = s.props[r.prop];
  if (p) {
    p.x = r.x;
    p.z = r.z;
  }
  out.push({ t: 'roomba', tick: s.tick, x: r.x, z: r.z });
}

/** A crash on or next to the Roomba makes it stop and stare. */
export function bumpRoomba(s: SimState, x: number, z: number): void {
  const r = s.roomba;
  if (!r || cheb(r.x, r.z, x, z) > 1) return;
  if (r.pause < ROOMBA_CRASH_PAUSE) r.pause = ROOMBA_CRASH_PAUSE;
}

/** FRAMED: the landing is within 1 cell of the Roomba and a LOOKing human has the Roomba in sight. */
export function framedLanding(s: SimState, p: PropState): boolean {
  const r = s.roomba;
  // v7: within FRAME_RANGE_V7 cells, and the human may be looking at the Roomba or at the mess itself
  const v7 = isV7(s);
  if (!r || cheb(r.x, r.z, p.x, p.z) > (v7 ? FRAME_RANGE_V7 : 1)) return false;
  for (const h of s.humans) {
    if (h.state !== HumanSt.LOOK) continue;
    if (looksAt(s, h, h.facing, r.x, r.z, 0)) return true;
    if (v7 && looksAt(s, h, h.facing, p.x, p.z, p.level)) return true;
  }
  return false;
}

/** v7: a mess this recent (ticks) still frames the Roomba when a human turns and sees it. */
export const FRAME_RECENT_TICKS_V7 = 240;

/**
 * v7: a human just turned (LOOK starts): a crash that landed in the last FRAME_RECENT_TICKS_V7 ticks within
 * FRAME_RANGE_V7 cells of the Roomba, unseen so far, frames it when she sees the Roomba or the mess. (Careful cats
 * freeze while she looks, so the v5 rule, a crash landing during a look, almost never happened: 0.00-0.01 per run.)
 */
export function frameOnLook(s: SimState, human: number, out: SimEvent[]): void {
  const r = s.roomba;
  const h = s.humans[human];
  if (!r || !h || h.state !== HumanSt.LOOK || !isV7(s)) return;
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    if (p.framed || p.seen || p.restTick < 0 || s.tick - p.restTick > FRAME_RECENT_TICKS_V7) continue;
    if (p.state !== PropSt.BROKEN && p.state !== PropSt.SPILLED && p.state !== PropSt.LANDED) continue;
    if (cheb(r.x, r.z, p.x, p.z) > FRAME_RANGE_V7) continue;
    if (!looksAt(s, h, h.facing, r.x, r.z, 0) && !looksAt(s, h, h.facing, p.x, p.z, p.level)) continue;
    p.framed = 1;
    s.framed++;
    s.score += BONUS.framed;
    out.push({ t: 'framed', tick: s.tick, prop: i });
  }
}

/**
 * A mess that would frame the Roomba if a human turned now (v7+ rules: unseen, landed in the last
 * FRAME_RECENT_TICKS_V7 ticks, within FRAME_RANGE_V7 cells of the Roomba): its prop index, -1 none. Read only (the
 * HUD's "let him turn" coach line and the render's ring around the Roomba, QA round 3).
 */
export function frameableMess(s: SimState): number {
  const r = s.roomba;
  if (!r || !isV7(s)) return -1;
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    if (p.framed || p.seen || p.restTick < 0 || s.tick - p.restTick > FRAME_RECENT_TICKS_V7) continue;
    if (p.state !== PropSt.BROKEN && p.state !== PropSt.SPILLED && p.state !== PropSt.LANDED) continue;
    if (cheb(r.x, r.z, p.x, p.z) <= FRAME_RANGE_V7) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Mirror and webcam
// ---------------------------------------------------------------------------------------------

/** Human index whose mirror is live now (routine.mirror and BUSY, shell has a mirror; v6: in a check phase), -1 none. */
export function mirrorHuman(s: SimState, play: PlayableRoom): number {
  if (!isV5(s) || !play.shell.mirror) return -1;
  for (let i = 0; i < s.humans.length; i++) {
    if (routineOf(play, i).mirror && s.humans[i].state === HumanSt.BUSY && mirrorPhaseOf(s, i) === 'on') return i;
  }
  return -1;
}

export type MirrorPhase = 'off' | 'glint' | 'on';

/**
 * v6: the mirror watches only while she "checks the mirror": MIRROR_FIRST_GLINT ticks into BUSY a glint warns for
 * MIRROR_GLINT_TICKS, then the mirror is live for MIRROR_CHECK_TICKS, every MIRROR_CYCLE_TICKS. v5: live all BUSY.
 */
function mirrorPhaseOf(s: SimState, i: number): MirrorPhase {
  const h = s.humans[i];
  if (!h || h.state !== HumanSt.BUSY) return 'off';
  if (!isV6(s)) return 'on';
  const e = h.stateTicks - h.timer; // ticks into BUSY
  if (e < MIRROR_FIRST_GLINT) return 'off';
  // v8: one glint per 8 s (QA round 3: the Bathroom was 60 % waiting)
  const ph = (e - MIRROR_FIRST_GLINT) % (isV8(s) ? MIRROR_CYCLE_TICKS_V8 : MIRROR_CYCLE_TICKS);
  if (ph < MIRROR_GLINT_TICKS) return 'glint';
  return ph < MIRROR_GLINT_TICKS + MIRROR_CHECK_TICKS ? 'on' : 'off';
}

/** The room's mirror phase now ('off' without a live mirror routine): the HUD's glint warning, the bots. */
export function mirrorPhase(s: SimState, play: PlayableRoom): MirrorPhase {
  if (!isV5(s) || !play.shell.mirror) return 'off';
  let best: MirrorPhase = 'off';
  for (let i = 0; i < s.humans.length; i++) {
    if (!routineOf(play, i).mirror) continue;
    const ph = mirrorPhaseOf(s, i);
    if (ph === 'on') return 'on';
    if (ph === 'glint') best = 'glint';
  }
  return best;
}

export function mirrorSees(s: SimState, play: PlayableRoom, x: number, z: number, level: number): boolean {
  const m = play.shell.mirror;
  if (!m) return false;
  return shortConeSees(s, m.x, m.z, m.facing, x, z, level);
}

/** The webcam records (some routine has onCamera and the shell has a webcam). */
export function webcamOn(s: SimState, play: PlayableRoom): boolean {
  if (!isV5(s) || !play.shell.webcam) return false;
  return !!(play.routine.onCamera || play.routine2?.onCamera);
}

/** A webcam films from eye height (a monitor or a tripod): it sees over L2 furniture whatever it stands on. */
export function webcamOver(s: SimState, x: number, z: number): number {
  return Math.max(2, originLevel(s, x, z));
}

export function webcamSees(s: SimState, play: PlayableRoom, x: number, z: number, level: number): boolean {
  const w = play.shell.webcam;
  if (!w) return false;
  return shortConeSees(s, w.x, w.z, w.facing, x, z, level, webcamOver(s, w.x, w.z));
}

// ---------------------------------------------------------------------------------------------
// Cloth and cable
// ---------------------------------------------------------------------------------------------

export function clothCovers(p: PropState, x: number, z: number): boolean {
  const w = p.w ?? 1;
  const d = p.d ?? 1;
  return x >= p.x && x < p.x + w && z >= p.z && z < p.z + d;
}

/**
 * The cloth the cat would pull now, -1 none: the cat faces orthogonally into a covered cell from an uncovered one,
 * standing at the cloth's level or lower.
 */
export function clothToPull(s: SimState): number {
  const c = s.cat;
  if (isDiagonal(c.facing)) return -1;
  const fx = c.x + DIR_DX[c.facing];
  const fz = c.z + DIR_DZ[c.facing];
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    if (p.state !== PropSt.REST || kindOf(p).pull !== 'cloth') continue;
    if (c.level > p.level) continue;
    if (clothCovers(p, fx, fz) && !clothCovers(p, c.x, c.z)) return i;
  }
  return -1;
}

/**
 * Pull cloth `ci` one cell in `dir` (toward the cat): every intact swattable prop on its covered cells at its level
 * moves one cell, nearest to the cat first; those pushed off the surface start FALLING (chain 0). The cloth shifts
 * with them; on its second pull it drops ('land', 0 points).
 */
export function pullCloth(s: SimState, ci: number, dir: Facing, out: SimEvent[]): void {
  const cloth = s.props[ci];
  const dx = DIR_DX[dir];
  const dz = DIR_DZ[dir];
  const riders: number[] = [];
  for (let j = 0; j < s.props.length; j++) {
    if (j === ci) continue;
    const p = s.props[j];
    if (!intact(p) || p.level !== cloth.level || !normalKind(kindOf(p))) continue;
    if (propOn(s, p.x, p.z) !== j || !clothCovers(cloth, p.x, p.z)) continue;
    riders.push(j);
  }
  // Nearest to the cat first = furthest along the pull direction; ties by index.
  riders.sort((a, b) => {
    const pa = s.props[a];
    const pb = s.props[b];
    const ka = pa.x * dx + pa.z * dz;
    const kb = pb.x * dx + pb.z * dz;
    return kb - ka || a - b;
  });
  let moved = 0;
  for (const j of riders) {
    const p = s.props[j];
    const tx = p.x + dx;
    const tz = p.z + dz;
    if (!inBounds(s.grid, tx, tz)) continue;
    const lv = levelAt(s, tx, tz);
    if (lv < p.level) {
      if (humanAt(s, tx, tz)) continue;
      startFall(s, j, dir, 0, out);
      moved++;
    } else if (lv === p.level && propOn(s, tx, tz) === -1 && !humanAt(s, tx, tz) && !(s.cat.x === tx && s.cat.z === tz)) {
      setPropAt(s, p.x, p.z, -1);
      p.x = tx;
      p.z = tz;
      setPropAt(s, tx, tz, j);
      moved++;
    }
  }
  cloth.x += dx;
  cloth.z += dz;
  cloth.pulls = (cloth.pulls ?? 0) + 1;
  s.pulls = (s.pulls ?? 0) + 1;
  out.push({ t: 'pull', tick: s.tick, prop: ci, dir, kind: 'cloth', moved });
  if (cloth.pulls >= CLOTH_MAX_PULLS) {
    cloth.state = PropSt.LANDED;
    cloth.restTick = s.tick;
    cloth.fromX = cloth.x;
    cloth.fromZ = cloth.z;
    cloth.fromLevel = cloth.level;
    out.push({ t: 'land', tick: s.tick, prop: ci, points: 0, combo: s.comboTimer > 0 ? s.combo : 1 });
  }
}

/** Cable cell of lamp `idx`, or null. */
export function cableCell(s: SimState, idx: number): { x: number; z: number } | null {
  const cs = internal(s).cables;
  if (!cs) return null;
  for (let i = 0; i < cs.length; i += 3) if (cs[i] === idx) return { x: cs[i + 1], z: cs[i + 2] };
  return null;
}

/** Cable cells at init: PropPlacement.cable, else the cell next to the lamp in its rot direction (0 N, 1 E, 2 S, 3 W). */
export function initCables(s: SimState, play: PlayableRoom): number[] {
  const out: number[] = [];
  const RX = [0, 1, 0, -1];
  const RZ = [-1, 0, 1, 0];
  play.room.props.forEach((pl, i) => {
    const k = kindOf(s.props[i]);
    if (k.pull !== 'cable') return;
    const c = pl.cable ?? { x: pl.x + RX[pl.rot & 3], z: pl.z + RZ[pl.rot & 3] };
    out.push(i, c.x, c.z);
  });
  return out;
}

/** The lamp whose cable a floor cat stands on or faces, -1 none. */
export function cableToPull(s: SimState): number {
  const c = s.cat;
  const cs = internal(s).cables;
  if (!cs || c.level !== 0) return -1;
  const fx = c.x + DIR_DX[c.facing];
  const fz = c.z + DIR_DZ[c.facing];
  for (let i = 0; i < cs.length; i += 3) {
    const p = s.props[cs[i]];
    if (!p || !intact(p)) continue;
    const x = cs[i + 1];
    const z = cs[i + 2];
    if ((x === c.x && z === c.z) || (x === fx && z === fz)) return cs[i];
  }
  return -1;
}

/** Yank the cable: the lamp is pushed one cell toward the cable side whatever its swat count (normal push / fall). */
export function pullCable(s: SimState, idx: number, out: SimEvent[]): void {
  const p = s.props[idx];
  const cc = cableCell(s, idx);
  if (!cc) return;
  const d = dirToward(p.x, p.z, cc.x, cc.z);
  if (!d) return;
  const bx = p.x;
  const bz = p.z;
  pushProp(s, idx, d, out);
  const moved = p.state === PropSt.FALLING || p.x !== bx || p.z !== bz ? 1 : 0;
  p.pulls = 1;
  s.pulls = (s.pulls ?? 0) + 1;
  out.push({ t: 'pull', tick: s.tick, prop: idx, dir: d, kind: 'cable', moved });
}

// ---------------------------------------------------------------------------------------------
// Tall props (Christmas tree)
// ---------------------------------------------------------------------------------------------

/** Can the cat swat tall prop `q` now? Cat at the prop's `tall` level, orthogonally adjacent, facing it. */
export function tallSwattable(s: SimState, q: number): boolean {
  if (q < 0) return false;
  const p = s.props[q];
  const k = kindOf(p);
  const c = s.cat;
  if (k.tall === undefined || !intact(p) || c.level !== k.tall || isDiagonal(c.facing)) return false;
  return c.x + DIR_DX[c.facing] === p.x && c.z + DIR_DZ[c.facing] === p.z;
}

/** Knock an intact prop over in `dir`: off its edge when there is one, else it falls over where it stands. */
function knock(s: SimState, q: number, dir: Dir8, out: SimEvent[]): void {
  const p = s.props[q];
  const nx = p.x + DIR_DX[dir];
  const nz = p.z + DIR_DZ[dir];
  if (inBounds(s.grid, nx, nz) && levelAt(s, nx, nz) < p.level && !humanAt(s, nx, nz)) {
    startFall(s, q, dir, 1, out);
    return;
  }
  setPropAt(s, p.x, p.z, -1);
  p.fromX = p.x;
  p.fromZ = p.z;
  p.fromLevel = p.level;
  p.dir = dir;
  p.chain = 1;
  p.state = PropSt.FALLING;
  p.fallTicks = KNOCK_TICKS;
  p.fallTimer = KNOCK_TICKS;
  out.push({ t: 'fall', tick: s.tick, prop: q, from: p.fromLevel, dir });
  grantWish(s, q, out);
}

/**
 * Swat a tall prop: it sways until kind.swats, then topples kind.topple cells in `dir` (stopped by walls, L2+
 * furniture and humans). Intact props on L0/L1 along the way are knocked over (domino), the tree lands on the far
 * cell scoring from its `tall` level.
 */
export function swatTall(s: SimState, idx: number, dir: Facing, out: SimEvent[]): void {
  const p = s.props[idx];
  const k = kindOf(p);
  p.swats++;
  p.sway = p.swats;
  if (p.swats < k.swats) {
    p.state = PropSt.WOBBLE;
    out.push({ t: 'wobble', tick: s.tick, prop: idx });
    return;
  }
  const n = k.topple ?? 1;
  let cells = 0;
  for (let i = 1; i <= n; i++) {
    const x = p.x + DIR_DX[dir] * i;
    const z = p.z + DIR_DZ[dir] * i;
    if (!inBounds(s.grid, x, z) || levelAt(s, x, z) >= 2 || humanAt(s, x, z)) break;
    cells = i;
  }
  if (cells === 0) {
    p.state = PropSt.WOBBLE;
    out.push({ t: 'wobble', tick: s.tick, prop: idx });
    return;
  }
  setPropAt(s, p.x, p.z, -1);
  out.push({ t: 'topple', tick: s.tick, prop: idx, cells, dir });
  for (let i = 1; i <= cells; i++) {
    const q = propOn(s, p.x + DIR_DX[dir] * i, p.z + DIR_DZ[dir] * i);
    if (q < 0 || q === idx) continue;
    const o = s.props[q];
    if (!intact(o) || o.level > 1 || !normalKind(kindOf(o))) continue;
    knock(s, q, dir, out);
  }
  const tall = (k.tall ?? 3) as Level;
  p.fromX = p.x;
  p.fromZ = p.z;
  p.fromLevel = tall;
  p.x += DIR_DX[dir] * cells;
  p.z += DIR_DZ[dir] * cells;
  p.level = levelAt(s, p.x, p.z) as Level;
  p.dir = dir;
  p.chain = 0;
  p.state = PropSt.FALLING;
  const ft = FALL_TICKS[tall][p.level] || KNOCK_TICKS;
  p.fallTicks = ft;
  p.fallTimer = ft;
  out.push({ t: 'fall', tick: s.tick, prop: idx, from: tall, dir });
  grantWish(s, idx, out);
}
