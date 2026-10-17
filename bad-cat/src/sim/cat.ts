/**
 * The cat (GDD 4.1, 4.2): 8-way cell stepping, direction read only at step ends, no corner cutting,
 * jumps (+1 up / any down), swat with auto-assist, grab/drop/stash, loaf after LOAF_DELAY_TICKS.
 */
import {
  BTN_GRAB,
  BTN_JUMP,
  BTN_SWAT,
  CatAct,
  DIR_DX,
  DIR_DZ,
  GRAB_TICKS,
  JUMP_TICKS,
  LOAF_DELAY_TICKS,
  PropSt,
  STEP_TICKS,
  SWAT_TICKS,
  isDiagonal,
  type Dir8,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type Speed,
  type TickInput,
} from '../types';
import { inBounds } from './grid';
import { humanAt, kindOf, levelAt, propOn, swatProp } from './props';
import { stashBonus } from './scoring';
import { internal, isV5, isV7 } from './events';
import {
  addNoise,
  boxAt,
  cableToPull,
  clothToPull,
  grantWish,
  normalKind,
  opposite,
  pullCable,
  pullCloth,
  puddleAt,
  swatTall,
  tallSwattable,
  noiseRules,
} from './v5';

/** What the SWAT button acts on: a prop to swat or grab, or (v5) a cloth/cable to pull. */
export interface SwatTarget {
  prop: number;
  grab: boolean;
  /** v5: the swat pulls this cloth or lamp cable instead of pushing a prop. */
  pull?: 'cloth' | 'cable';
}

/** v5 only: the Roomba's current cell blocks the cat. */
function roombaOn(s: SimState, x: number, z: number): boolean {
  const r = s.roomba;
  return !!r && isV5(s) && r.x === x && r.z === z;
}

/** Ticks of pushing the stick into a +1 cell before the cat hops up on its own (0.2 s, SIM_VERSION 3). */
export const AUTO_HOP_TICKS = 6;
/** After a refused push into a too-high ledge, the next 'cantReach' waits this many more ticks (no 5 Hz spam). */
export const CANT_REACH_REPEAT_TICKS = 30;

/** Facing rotated by r eighths (r may be negative). */
export function rotate(f: Facing, r: number): Facing {
  return ((((f - 1 + r) % 8) + 8) % 8) + 1 as Facing;
}

/** Direction from (ax, az) to an adjacent (bx, bz), 0 if equal. */
export function dirTo(ax: number, az: number, bx: number, bz: number): Dir8 {
  const dx = Math.sign(bx - ax);
  const dz = Math.sign(bz - az);
  for (let d = 1; d <= 8; d++) if (DIR_DX[d] === dx && DIR_DZ[d] === dz) return d as Dir8;
  return 0;
}

/** Can the cat (standing at `fromLevel`) walk into (x, z)? Equal or lower surface, no blocking prop, no human. */
export function passable(s: SimState, x: number, z: number, fromLevel: number): boolean {
  if (!inBounds(s.grid, x, z)) return false;
  if (levelAt(s, x, z) > fromLevel) return false;
  if (humanAt(s, x, z)) return false;
  if (roombaOn(s, x, z)) return false;
  const q = propOn(s, x, z);
  return q === -1 || !kindOf(s.props[q]).blocks;
}

/** Step legality including the corner-cutting rule for diagonals. */
export function canStep(s: SimState, x: number, z: number, level: number, dir: Dir8): boolean {
  if (dir === 0) return false;
  const tx = x + DIR_DX[dir];
  const tz = z + DIR_DZ[dir];
  if (!passable(s, tx, tz, level)) return false;
  if (isDiagonal(dir)) {
    if (!passable(s, tx, z, level) || !passable(s, x, tz, level)) return false;
  }
  return true;
}

/** Jump legality: the facing cell is exactly one level up, or any level down; free of blockers and humans. */
export function canJump(s: SimState, x: number, z: number, level: number, dir: Dir8): boolean {
  if (dir === 0) return false;
  const tx = x + DIR_DX[dir];
  const tz = z + DIR_DZ[dir];
  if (!inBounds(s.grid, tx, tz) || humanAt(s, tx, tz)) return false;
  if (roombaOn(s, tx, tz)) return false;
  const lv = levelAt(s, tx, tz);
  if (lv !== level + 1 && lv >= level) return false;
  const q = propOn(s, tx, tz);
  return q === -1 || !kindOf(s.props[q]).blocks;
}

export function stepTicksFor(dir: Dir8, speed: Speed): number {
  const diag = isDiagonal(dir);
  if (speed === 1) return diag ? STEP_TICKS.sneakDiag : STEP_TICKS.sneakOrtho;
  return diag ? STEP_TICKS.trotDiag : STEP_TICKS.trotOrtho;
}

function swattable(s: SimState, q: number): boolean {
  if (q < 0) return false;
  const p = s.props[q];
  if (p.state !== PropSt.REST && p.state !== PropSt.WOBBLE) return false;
  const k = kindOf(p);
  return !k.inert && p.level === s.cat.level;
}

/**
 * Auto-assist target (GDD 5.1): the facing cell, then the two neighbours within 60° (facing ∓ 1), then a grabbable
 * under the cat. Only props on the cat's own surface. While carrying, the target is the carried prop (drop/stash).
 */
export function findSwatTarget(s: SimState): SwatTarget {
  if (isV5(s)) return findSwatTargetV5(s);
  const c = s.cat;
  if (c.carrying >= 0) return { prop: c.carrying, grab: true };
  const order: Facing[] = [c.facing, rotate(c.facing, -1), rotate(c.facing, 1)];
  for (const f of order) {
    const q = propOn(s, c.x + DIR_DX[f], c.z + DIR_DZ[f]);
    if (swattable(s, q)) return { prop: q, grab: kindOf(s.props[q]).grabbable };
  }
  const own = propOn(s, c.x, c.z);
  if (swattable(s, own) && kindOf(s.props[own]).grabbable) return { prop: own, grab: true };
  return { prop: -1, grab: false };
}

function swattableV5(s: SimState, q: number): boolean {
  if (q < 0) return false;
  const p = s.props[q];
  if (p.state !== PropSt.REST && p.state !== PropSt.WOBBLE) return false;
  return normalKind(kindOf(p)) && p.level === s.cat.level;
}

/**
 * v5 auto-assist order: the prop in the facing cell (a tree from its `tall` level too), then a cloth to pull, then a
 * lamp cable under or in front of a floor cat, then the facing ∓ 1 neighbours, then a grabbable underfoot.
 * A swat at a prop goes to the prop; a swat at bare cloth pulls the cloth.
 */
function findSwatTargetV5(s: SimState): SwatTarget {
  const c = s.cat;
  if (c.carrying >= 0) return { prop: c.carrying, grab: true };
  const front = propOn(s, c.x + DIR_DX[c.facing], c.z + DIR_DZ[c.facing]);
  if (swattableV5(s, front)) return { prop: front, grab: kindOf(s.props[front]).grabbable };
  if (tallSwattable(s, front)) return { prop: front, grab: false };
  const cloth = clothToPull(s);
  if (cloth >= 0) return { prop: cloth, grab: false, pull: 'cloth' };
  const lamp = cableToPull(s);
  if (lamp >= 0) return { prop: lamp, grab: false, pull: 'cable' };
  for (const f of [rotate(c.facing, -1), rotate(c.facing, 1)]) {
    const q = propOn(s, c.x + DIR_DX[f], c.z + DIR_DZ[f]);
    if (swattableV5(s, q)) return { prop: q, grab: kindOf(s.props[q]).grabbable };
  }
  const own = propOn(s, c.x, c.z);
  if (swattableV5(s, own) && kindOf(s.props[own]).grabbable) return { prop: own, grab: true };
  return { prop: -1, grab: false };
}

function lock(s: SimState, act: CatAct, ticks: number): void {
  s.cat.act = act;
  s.cat.actTimer = ticks;
}

function dropOrStash(s: SimState, play: PlayableRoom, out: SimEvent[]): void {
  const c = s.cat;
  const idx = c.carrying;
  const p = s.props[idx];
  const bx = play.shell.catBed.x;
  const bz = play.shell.catBed.z;
  if (Math.abs(c.x - bx) <= 1 && Math.abs(c.z - bz) <= 1) {
    p.state = PropSt.STASHED;
    p.x = bx;
    p.z = bz;
    p.restTick = s.tick;
    const bonus = stashBonus(c.stashed);
    c.stashed++;
    s.score += bonus;
    p.points = bonus;
    c.carrying = -1;
    out.push({ t: 'stash', tick: s.tick, prop: idx });
    lock(s, CatAct.GRAB, GRAB_TICKS);
    return;
  }
  if (propOn(s, c.x, c.z) !== -1) return; // something already lies here: keep carrying
  p.state = PropSt.REST;
  p.x = c.x;
  p.z = c.z;
  p.level = c.level;
  p.swats = 0;
  s.grid.propAt[c.z * s.grid.w + c.x] = idx;
  c.carrying = -1;
  out.push({ t: 'drop', tick: s.tick, prop: idx });
  lock(s, CatAct.GRAB, GRAB_TICKS);
}

/**
 * SIM_VERSION 4 seat routing: the cat faces a surface it cannot jump onto (2+ levels up, e.g. floor to table).
 * Find a neighbouring cell exactly one level up (a chair, an ottoman) that is itself next to the high cell, so a
 * second hop reaches it. Directions are tried closest to the facing first (-1, +1, -2, +2, -3, +3): deterministic.
 * Returns the direction to hop, 0 when no seat helps.
 */
export function seatToward(s: SimState, dir: Dir8): Dir8 {
  if (dir === 0) return 0;
  const c = s.cat;
  const hx = c.x + DIR_DX[dir];
  const hz = c.z + DIR_DZ[dir];
  if (!inBounds(s.grid, hx, hz)) return 0;
  const high = levelAt(s, hx, hz);
  if (high !== c.level + 2) return 0;
  for (const r of [-1, 1, -2, 2, -3, 3]) {
    const d = rotate(dir as Facing, r);
    const ax = c.x + DIR_DX[d];
    const az = c.z + DIR_DZ[d];
    if (!inBounds(s.grid, ax, az) || levelAt(s, ax, az) !== c.level + 1) continue;
    if (Math.abs(ax - hx) > 1 || Math.abs(az - hz) > 1) continue;
    if (!canJump(s, c.x, c.z, c.level, d)) continue;
    return d;
  }
  if (!isV7(s)) return 0;
  // v7: any adjacent seat that itself touches a surface one more level up (the cat hops on from there), the
  // directions nearest the facing first (round 2: new players could not reach the counters)
  for (const r of [-1, 1, -2, 2, -3, 3, 4]) {
    const d = rotate(dir as Facing, r);
    const ax = c.x + DIR_DX[d];
    const az = c.z + DIR_DZ[d];
    if (!inBounds(s.grid, ax, az) || levelAt(s, ax, az) !== c.level + 1) continue;
    if (!canJump(s, c.x, c.z, c.level, d)) continue;
    if (chainFrom(s, ax, az, c.level + 1, hx, hz) < 0) continue;
    return d;
  }
  return 0;
}

/**
 * v7 seat chain: from a seat at (sx, sz, level), the cell to hop on to next: the high cell itself when it is next to
 * the seat, else the neighbour one level up nearest to it. z * w + x, or -1.
 */
export function chainFrom(s: SimState, sx: number, sz: number, level: number, hx: number, hz: number): number {
  let best = -1;
  let bestD = 99;
  for (let d = 1; d <= 8; d++) {
    const nx = sx + DIR_DX[d];
    const nz = sz + DIR_DZ[d];
    if (!inBounds(s.grid, nx, nz) || levelAt(s, nx, nz) !== level + 1) continue;
    if (!canJump(s, sx, sz, level, d as Dir8)) continue;
    const dist = Math.max(Math.abs(nx - hx), Math.abs(nz - hz));
    if (dist < bestD) {
      bestD = dist;
      best = nz * s.grid.w + nx;
    }
  }
  return best;
}

/** True when the facing cell is a surface 2+ levels above the cat (the jump is refused). */
function tooHigh(s: SimState, dir: Dir8): number {
  if (dir === 0) return -1;
  const c = s.cat;
  const tx = c.x + DIR_DX[dir];
  const tz = c.z + DIR_DZ[dir];
  if (!inBounds(s.grid, tx, tz)) return -1;
  const lv = levelAt(s, tx, tz);
  return lv >= c.level + 2 ? lv : -1;
}

/** A refused jump toward a too-high surface: hop onto a seat on the way, or tell the player why (cantReach). */
function routeOrRefuse(s: SimState, dir: Dir8, out: SimEvent[]): boolean {
  const c = s.cat;
  const lv = tooHigh(s, dir);
  if (lv < 0) return false;
  const seat = seatToward(s, dir);
  if (seat) {
    const hx = c.x + DIR_DX[dir];
    const hz = c.z + DIR_DZ[dir];
    c.facing = seat as Facing;
    jumpFacing(s, out);
    // v7: one press goes all the way: when the seat jump lands, hop on to the surface the cat aimed at
    if (isV7(s)) {
      const next = chainFrom(s, c.x, c.z, c.level, hx, hz);
      internal(s).chainHop = next >= 0 ? next + 1 : 0;
    }
    return true;
  }
  out.push({ t: 'cantReach', tick: s.tick, level: lv as Level });
  return false;
}

/** Handle buttons at rest. Returns true if an action started (the cat does not move this tick). */
function jumpFacing(s: SimState, out: SimEvent[]): void {
  const c = s.cat;
  const tx = c.x + DIR_DX[c.facing];
  const tz = c.z + DIR_DZ[c.facing];
  const to = levelAt(s, tx, tz) as Level;
  out.push({ t: 'jump', tick: s.tick, from: c.level, to });
  beginMove(s, tx, tz, to, JUMP_TICKS, CatAct.JUMP);
}

function doButtons(s: SimState, play: PlayableRoom, buttons: number, out: SimEvent[]): boolean {
  const c = s.cat;
  if (buttons & BTN_JUMP) {
    if (canJump(s, c.x, c.z, c.level, c.facing)) {
      jumpFacing(s, out);
      return true;
    }
    if (routeOrRefuse(s, c.facing, out)) return true;
  }
  if (buttons & (BTN_SWAT | BTN_GRAB)) {
    if (c.carrying >= 0) {
      dropOrStash(s, play, out);
      return true;
    }
    const t = findSwatTarget(s);
    if (t.prop >= 0 && t.grab) {
      const p = s.props[t.prop];
      s.grid.propAt[p.z * s.grid.w + p.x] = -1;
      p.state = PropSt.CARRIED;
      c.carrying = t.prop;
      out.push({ t: 'grab', tick: s.tick, prop: t.prop });
      if (isV5(s)) grantWish(s, t.prop, out);
      lock(s, CatAct.GRAB, GRAB_TICKS);
      return true;
    }
    if (buttons & BTN_SWAT) {
      out.push({ t: 'swat', tick: s.tick, prop: t.prop });
      if (t.prop >= 0 && t.pull === 'cloth') pullCloth(s, t.prop, opposite(c.facing), out);
      else if (t.prop >= 0 && t.pull === 'cable') pullCable(s, t.prop, out);
      else if (t.prop >= 0 && isV5(s) && kindOf(s.props[t.prop]).tall !== undefined) swatTall(s, t.prop, c.facing, out);
      else if (t.prop >= 0) {
        const p = s.props[t.prop];
        const d = dirTo(c.x, c.z, p.x, p.z) || c.facing;
        c.facing = d as Facing;
        swatProp(s, t.prop, d, out);
      }
      lock(s, CatAct.SWAT, SWAT_TICKS);
      return true;
    }
  }
  return false;
}

function beginMove(s: SimState, tx: number, tz: number, level: Level, ticks: number, act: CatAct): void {
  const c = s.cat;
  if (s.inBox !== undefined && s.inBox >= 0 && isV5(s)) s.inBox = -1; // hops out of the box
  c.fromX = c.x;
  c.fromZ = c.z;
  c.fromLevel = c.level;
  c.x = tx;
  c.z = tz;
  c.level = level;
  c.stepTicks = ticks;
  c.stepProgress = 0;
  c.act = act;
}

/**
 * v5, a step or jump just finished: noise for the napper (trot steps, landings from L2+), sitting in a box, and the
 * spill-slide: a normal step that ends on a slippery puddle skids one more cell the same way when that step is legal
 * (trot timing, no input read, never chains). Returns true when a slide started.
 */
function stepDoneV5(s: SimState, input: TickInput, act: number, fx: number, fz: number, fl: number, out: SimEvent[]): boolean {
  const c = s.cat;
  const st = internal(s);
  const wasSlide = st.slideStep === 1;
  st.slideStep = 0;
  const nz = noiseRules(s);
  if (act === CatAct.TROT) addNoise(s, nz.trotStep, c.x, c.z, out);
  else if (act === CatAct.JUMP && fl >= 2 && c.level < fl) addNoise(s, nz.jumpDown, c.x, c.z, out);
  const box = boxAt(s, c.x, c.z);
  if (box >= 0 && s.inBox !== box) {
    s.inBox = box;
    out.push({ t: 'enter', tick: s.tick, prop: box });
    grantWish(s, box, out);
  }
  if (wasSlide || (act !== CatAct.SNEAK && act !== CatAct.TROT) || puddleAt(s, c.x, c.z) !== 1) return false;
  const d = dirTo(fx, fz, c.x, c.z);
  if (!d || !canStep(s, c.x, c.z, c.level, d)) return false;
  const ox = c.x;
  const oz = c.z;
  const tx = c.x + DIR_DX[d];
  const tz = c.z + DIR_DZ[d];
  c.facing = d as Facing;
  beginMove(s, tx, tz, levelAt(s, tx, tz) as Level, stepTicksFor(d, 2), CatAct.TROT);
  st.slideStep = 1;
  s.slides = (s.slides ?? 0) + 1;
  st.btnBuf |= input.buttons;
  out.push({ t: 'slide', tick: s.tick, fromX: ox, fromZ: oz, x: tx, z: tz });
  return true;
}

/** Advance the cat by one tick (not called while CUDDLED). */
export function stepCat(s: SimState, play: PlayableRoom, input: TickInput, out: SimEvent[]): void {
  const c = s.cat;
  const st = internal(s);
  const hasInput = input.dir !== 0 || input.buttons !== 0;
  c.idleTicks = hasInput ? 0 : c.idleTicks + 1;

  // Mid-step / mid-jump: progress; buttons pressed now are buffered until the cat is free.
  if (c.stepTicks > 0) {
    c.stepProgress++;
    if (c.stepProgress < c.stepTicks) {
      st.btnBuf |= input.buttons;
      return;
    }
    const doneAct = c.act;
    const fx = c.fromX;
    const fz = c.fromZ;
    const fl = c.fromLevel;
    c.fromX = c.x;
    c.fromZ = c.z;
    c.fromLevel = c.level;
    c.stepTicks = 0;
    c.stepProgress = 0;
    c.act = CatAct.IDLE;
    if (isV5(s) && stepDoneV5(s, input, doneAct, fx, fz, fl, out)) return;
    // v7 seat chain: the seat jump landed, hop on up (the aim is kept even if the stick let go)
    if (isV7(s) && st.chainHop) {
      const cell = st.chainHop - 1;
      st.chainHop = 0;
      const tx = cell % s.grid.w;
      const tz = (cell - tx) / s.grid.w;
      const d = dirTo(c.x, c.z, tx, tz);
      if (doneAct === CatAct.JUMP && d && Math.max(Math.abs(tx - c.x), Math.abs(tz - c.z)) === 1 && canJump(s, c.x, c.z, c.level, d)) {
        c.facing = d as Facing;
        jumpFacing(s, out);
        return;
      }
    }
  }
  if (c.actTimer > 0) {
    c.actTimer--;
    if (c.actTimer > 0) {
      st.btnBuf |= input.buttons;
      return;
    }
    c.act = CatAct.IDLE;
  }

  // At rest: the stick sets the facing first so "hold toward the counter + JUMP" works.
  const prevFacing = c.facing;
  if (input.dir !== 0) c.facing = input.dir as Facing;
  const buttons = input.buttons | st.btnBuf;
  st.btnBuf = 0;
  if (buttons && doButtons(s, play, buttons, out)) {
    st.autoHop = 0;
    return;
  }

  if (input.dir !== 0 && input.speed !== 0) {
    const d = input.dir;
    // A blocked diagonal slides along its orthogonal parts (the one nearest the old facing first),
    // so holding W+D against a corner keeps the cat moving instead of stalling.
    let go: Dir8 = canStep(s, c.x, c.z, c.level, d) ? d : 0;
    if (!go && isDiagonal(d)) {
      const ox = dirTo(0, 0, DIR_DX[d], 0);
      const oz = dirTo(0, 0, 0, DIR_DZ[d]);
      const order = prevFacing === oz ? [oz, ox] : [ox, oz];
      for (const o of order) if (!go && canStep(s, c.x, c.z, c.level, o)) go = o;
      if (go) c.facing = go as Facing;
    }
    if (go) {
      st.autoHop = 0;
      const tx = c.x + DIR_DX[go];
      const tz = c.z + DIR_DZ[go];
      const lv = levelAt(s, tx, tz) as Level;
      beginMove(s, tx, tz, lv, stepTicksFor(go, input.speed), input.speed === 1 ? CatAct.SNEAK : CatAct.TROT);
      out.push({ t: 'step', tick: s.tick, level: lv, speed: input.speed });
      return;
    }
    // Auto-hop: pushing into a ledge exactly one level up for AUTO_HOP_TICKS jumps onto it.
    const tx = c.x + DIR_DX[d];
    const tz = c.z + DIR_DZ[d];
    if (inBounds(s.grid, tx, tz) && levelAt(s, tx, tz) === c.level + 1 && canJump(s, c.x, c.z, c.level, d)) {
      st.autoHop = prevFacing === d ? st.autoHop + 1 : 1;
      if (st.autoHop >= AUTO_HOP_TICKS) {
        st.autoHop = 0;
        c.facing = d as Facing;
        jumpFacing(s, out);
        return;
      }
    } else if (tooHigh(s, d) >= 0) {
      // Pushing into a table from the floor: after the same 0.2 s, hop onto a seat beside it or say why not.
      st.autoHop = prevFacing === d ? st.autoHop + 1 : 1;
      if (st.autoHop >= AUTO_HOP_TICKS) {
        c.facing = d as Facing;
        if (routeOrRefuse(s, d, out)) {
          st.autoHop = 0;
          return;
        }
        st.autoHop = AUTO_HOP_TICKS - CANT_REACH_REPEAT_TICKS;
      }
    } else st.autoHop = 0;
    c.act = CatAct.IDLE;
    return;
  }
  st.autoHop = 0;
  if (c.idleTicks >= LOAF_DELAY_TICKS) {
    if (c.act !== CatAct.LOAF) {
      c.act = CatAct.LOAF;
      out.push({ t: 'loaf', tick: s.tick });
    }
  } else if (c.act !== CatAct.LOAF || hasInput) {
    c.act = CatAct.IDLE;
  }
}
