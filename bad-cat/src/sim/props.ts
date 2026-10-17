/**
 * Props (GDD 4.4, M0 rule set): swat → wobble/push, push off an edge → FALLING (FALL_TICKS), landing cell =
 * one step in the push direction, domino cascade (≤ MAX_CHAIN_STEPS), occupied landing cell, and
 * break / land / spill with scoring. Landed and broken props leave the grid (they never block).
 */
import {
  BONUS,
  COMBO_MAX,
  COMBO_WINDOW_TICKS,
  COMBO_WINDOW_V7,
  ON_CAMERA_PCT,
  DIR_DX,
  DIR_DZ,
  FALL_TICKS,
  HumanSt,
  MAX_CHAIN_STEPS,
  PropSt,
  STACK_COMBO_CAP_V7,
  SUSPICION,
  propKind,
  type Dir8,
  type Level,
  type PlayableRoom,
  type PropKindDef,
  type PropState,
  type SimEvent,
  type SimState,
} from '../types';
import { inBounds } from './grid';
import { activeFacing, looksAt } from './cone';
import { currentCombo, nextCombo, propPoints, stackPoints } from './scoring';
import { internal, isV5, isV6, isV7 } from './events';
import { addNoise, bumpRoomba, framedLanding, grantWish, noiseRules, spillPuddle, webcamOn, webcamSees } from './v5';

const NO_KIND: PropKindDef = {
  kind: 0, id: 'unknown', name: 'Unknown', base: 0, material: 'plastic', onLand: 'land', fragile: false,
  swats: 1, grabbable: false, blocks: true, inert: true, color: 0,
};
export function kindOf(p: PropState): PropKindDef {
  return propKind(p.kind) ?? NO_KIND;
}

export function humanAt(s: SimState, x: number, z: number): boolean {
  for (const h of s.humans) if (h.x === x && h.z === z) return true;
  return false;
}

/** Intact prop resting on (x, z)'s top surface, or -1. */
export function propOn(s: SimState, x: number, z: number): number {
  if (!inBounds(s.grid, x, z)) return -1;
  return s.grid.propAt[z * s.grid.w + x];
}

export function setPropAt(s: SimState, x: number, z: number, v: number): void {
  if (inBounds(s.grid, x, z)) s.grid.propAt[z * s.grid.w + x] = v;
}

export function levelAt(s: SimState, x: number, z: number): number {
  return s.grid.level[z * s.grid.w + x];
}

/** The prop has a drop in direction `dir` (the next cell is lower), so a nudge tips it over. */
function hasEdge(s: SimState, p: PropState, dir: Dir8): boolean {
  const nx = p.x + DIR_DX[dir];
  const nz = p.z + DIR_DZ[dir];
  return inBounds(s.grid, nx, nz) && levelAt(s, nx, nz) < p.level;
}

/** Start a fall from the prop's cell to the next cell in `dir` (which must be lower). */
export function startFall(s: SimState, idx: number, dir: Dir8, chain: number, out: SimEvent[]): void {
  const p = s.props[idx];
  const tx = p.x + DIR_DX[dir];
  const tz = p.z + DIR_DZ[dir];
  setPropAt(s, p.x, p.z, -1);
  p.fromX = p.x;
  p.fromZ = p.z;
  p.fromLevel = p.level;
  p.x = tx;
  p.z = tz;
  p.level = levelAt(s, tx, tz) as Level;
  p.dir = dir;
  p.chain = chain;
  p.state = PropSt.FALLING;
  const ft = FALL_TICKS[p.fromLevel][p.level] || 9;
  p.fallTicks = ft;
  p.fallTimer = ft;
  out.push({ t: 'fall', tick: s.tick, prop: idx, from: p.fromLevel, dir });
  if (isV5(s)) grantWish(s, idx, out);
}

/**
 * Swat prop `idx` in direction `dir`. Heavy props wobble until their swat count is reached; a push into a wall,
 * a higher surface, another intact prop or the human only wobbles it.
 */
export function swatProp(s: SimState, idx: number, dir: Dir8, out: SimEvent[]): void {
  const p = s.props[idx];
  const k = kindOf(p);
  // v6 Napper: batting at things is heard (a wobble or a push), wherever it lands
  if (isV6(s)) addNoise(s, noiseRules(s).swat, p.x, p.z, out);
  p.swats++;
  if (p.swats < k.swats) {
    p.state = PropSt.WOBBLE;
    out.push({ t: 'wobble', tick: s.tick, prop: idx });
    return;
  }
  pushProp(s, idx, dir, out);
}

/** Push prop `idx` one cell in `dir` (its swat count already reached, or a cable yank): fall, slide or wobble. */
export function pushProp(s: SimState, idx: number, dir: Dir8, out: SimEvent[]): void {
  const p = s.props[idx];
  const tx = p.x + DIR_DX[dir];
  const tz = p.z + DIR_DZ[dir];
  if (!inBounds(s.grid, tx, tz) || humanAt(s, tx, tz)) {
    p.state = PropSt.WOBBLE;
    out.push({ t: 'wobble', tick: s.tick, prop: idx });
    return;
  }
  const lv = levelAt(s, tx, tz);
  if (lv < p.level) {
    out.push({ t: 'push', tick: s.tick, prop: idx });
    startFall(s, idx, dir, 0, out);
    return;
  }
  const cat = s.cat;
  if (lv > p.level || propOn(s, tx, tz) !== -1 || (cat.x === tx && cat.z === tz)) {
    p.state = PropSt.WOBBLE;
    out.push({ t: 'wobble', tick: s.tick, prop: idx });
    return;
  }
  // Slide one cell along the same surface.
  setPropAt(s, p.x, p.z, -1);
  p.x = tx;
  p.z = tz;
  p.state = PropSt.REST;
  p.swats = 0;
  setPropAt(s, tx, tz, idx);
  out.push({ t: 'push', tick: s.tick, prop: idx });
}

function canDomino(s: SimState, q: number, dir: Dir8, chain: number): boolean {
  if (q < 0 || chain > MAX_CHAIN_STEPS) return false;
  const p = s.props[q];
  if (p.state !== PropSt.REST && p.state !== PropSt.WOBBLE) return false;
  if (kindOf(p).inert) return false;
  const nx = p.x + DIR_DX[dir];
  const nz = p.z + DIR_DZ[dir];
  return hasEdge(s, p, dir) && !humanAt(s, nx, nz);
}

/**
 * Is a crash at (x, z, level) visible to a LOOKing human? Returns 1 seen, 0 heard (LOOK, unseen), -1 nobody looking.
 * A prop whose fall started before the look began does not count (SIM_VERSION 3): the human turned too late, and
 * the "just in time" crime is the one the clip wants, so it is never punished.
 */
function crashWitness(s: SimState, p: PropState): number {
  let looking = false;
  const fallStart = s.tick - p.fallTicks;
  for (const h of s.humans) {
    if (h.state !== HumanSt.LOOK) continue;
    if (h.lookStartTick >= 0 && fallStart < h.lookStartTick) continue;
    looking = true;
    const f = activeFacing(h);
    if (f === 0) continue;
    if (looksAt(s, h, f, p.x, p.z, p.level) || looksAt(s, h, f, p.fromX, p.fromZ, p.fromLevel)) return 1;
  }
  return looking ? 0 : -1;
}

function addSuspicion(s: SimState, v: number): void {
  s.suspicion += v;
  if (s.suspicion > 100_000) s.suspicion = 100_000;
  const cap = internal(s).suspCap ?? 0;
  if (cap > 0 && s.suspicion > cap) s.suspicion = cap;
}

/** The combo window of this rule set (v7: COMBO_WINDOW_V7, a little longer, so a careful cat can chain). */
export function comboWindow(s: SimState): number {
  return isV7(s) ? COMBO_WINDOW_V7 : COMBO_WINDOW_TICKS;
}

/** v7: set the chain's combo (window refreshed, max kept); returns it. */
function bumpCombo(s: SimState, combo: number): number {
  const cap = internal(s).stackCap ?? 0;
  const c = cap > 0 && combo > cap ? cap : combo;
  s.combo = c;
  s.comboTimer = comboWindow(s);
  if (c > s.maxCombo) s.maxCombo = c;
  return c;
}

/** Occupied landing cell and domino rules (GDD 4.4), shared by both rule sets. */
function impact(s: SimState, idx: number, out: SimEvent[]): void {
  const p = s.props[idx];
  const k = kindOf(p);
  const dir = p.dir;
  const next = p.chain + 1;

  const occ = propOn(s, p.x, p.z);
  if (occ !== -1 && occ !== idx) {
    if (canDomino(s, occ, dir, next)) {
      startFall(s, occ, dir, next, out);
    } else if (!k.fragile) {
      // Non-fragile: skid to the first free cell up to 2 further on the same surface, else both count as hit.
      let moved = false;
      for (let n = 1; n <= 2 && !moved; n++) {
        const nx = p.x + DIR_DX[dir] * n;
        const nz = p.z + DIR_DZ[dir] * n;
        if (!inBounds(s.grid, nx, nz) || levelAt(s, nx, nz) !== p.level) break;
        if (propOn(s, nx, nz) !== -1 || humanAt(s, nx, nz)) continue;
        p.x = nx;
        p.z = nz;
        moved = true;
      }
      if (!moved) {
        const o = s.props[occ];
        p.hit = 1;
        if (!o.hit) {
          o.hit = 1;
          // v7: a prop hit by a landing extends the combo like a break
          const hc = isV7(s) ? bumpCombo(s, nextCombo(s.combo, s.comboTimer)) : currentCombo(s.combo, s.comboTimer);
          const pts = Math.floor(propPoints(kindOf(o).base, o.level, hc, s.eventActive, s.lastCall) / 2);
          s.score += pts;
          out.push({ t: 'hit', tick: s.tick, prop: occ, points: pts, combo: hc });
        }
      }
    }
    // Fragile onto something that cannot fall: it simply breaks there (outcome unchanged).
  } else if (occ === -1) {
    // The impact skids into the next cell in the push direction on the same surface.
    const nx = p.x + DIR_DX[dir];
    const nz = p.z + DIR_DZ[dir];
    if (inBounds(s.grid, nx, nz) && levelAt(s, nx, nz) === p.level) {
      const q = propOn(s, nx, nz);
      if (canDomino(s, q, dir, next)) startFall(s, q, dir, next, out);
    }
  }
}

/** Finish a fall: occupied-landing / domino rules, then break/land/spill, points, target bonus, suspicion. */
function land(s: SimState, idx: number, out: SimEvent[], play?: PlayableRoom): void {
  if (isV5(s)) {
    landV5(s, idx, out, play);
    return;
  }
  const p = s.props[idx];
  const k = kindOf(p);
  const outcome: 'break' | 'land' | 'spill' = k.onLand;
  impact(s, idx, out);

  // Points and combo.
  let combo: number;
  if (outcome === 'land') {
    combo = currentCombo(s.combo, s.comboTimer);
  } else {
    combo = nextCombo(s.combo, s.comboTimer);
    s.combo = combo;
    s.comboTimer = COMBO_WINDOW_TICKS;
    if (combo > s.maxCombo) s.maxCombo = combo;
  }
  const pts = propPoints(k.base, p.fromLevel, combo, s.eventActive, s.lastCall);
  p.points = pts;
  s.score += pts;
  p.state = outcome === 'break' ? PropSt.BROKEN : outcome === 'spill' ? PropSt.SPILLED : PropSt.LANDED;
  p.fallTimer = 0;
  p.restTick = s.tick;
  if (s.firstCrashTick < 0) s.firstCrashTick = s.tick;
  out.push({ t: outcome, tick: s.tick, prop: idx, points: pts, combo });

  if (p.target) {
    s.score += BONUS.target;
    s.targetsHit++;
    out.push({ t: 'target', tick: s.tick, prop: idx });
  }

  if (!p.seen) {
    const w = crashWitness(s, p);
    if (w === 1) {
      p.seen = 1;
      addSuspicion(s, outcome === 'land' ? SUSPICION.fallInCone : SUSPICION.breakInCone);
    } else if (w === 0) {
      addSuspicion(s, SUSPICION.heardCrash);
    }
  }
}

/**
 * v5 landing: the v4 impact rules, then stack scoring (one item at a time, combo +1 each), the webcam bonus,
 * framing the Roomba (+BONUS.framed, no suspicion from this fall), puddles, the Roomba's startle, napper noise.
 */
function landV5(s: SimState, idx: number, out: SimEvent[], play?: PlayableRoom): void {
  const p = s.props[idx];
  const k = kindOf(p);
  const outcome: 'break' | 'land' | 'spill' = k.onLand;
  impact(s, idx, out);

  let combo: number;
  let pts: number;
  // v6: the Party room caps stacks and the combo chain at x4 (a cloth pull at last call scored ~6x other rooms)
  const cap = isV6(s) ? internal(s).stackCap ?? 0 : 0;
  const maxCombo = cap > 0 && cap < COMBO_MAX ? cap : COMBO_MAX;
  const items = k.stack && k.stack.items > 0 ? (cap > 0 && k.stack.items > cap ? cap : k.stack.items) : 0;
  if (k.stack && items > 0) {
    let c0 = nextCombo(s.combo, s.comboTimer);
    if (c0 > maxCombo) c0 = maxCombo;
    // v7: outside the Party room a stack adds at most STACK_COMBO_CAP_V7 to the combo (its items and the chain)
    const stackMax = isV7(s) && cap === 0 ? Math.min(maxCombo, c0 + STACK_COMBO_CAP_V7) : maxCombo;
    pts = stackPoints(k.stack.itemBase, items, p.fromLevel, c0, s.eventActive, s.lastCall, stackMax);
    combo = c0 + items - 1 > stackMax ? stackMax : c0 + items - 1;
    s.combo = combo;
    s.comboTimer = comboWindow(s);
    if (combo > s.maxCombo) s.maxCombo = combo;
  } else {
    if (outcome === 'land' && !isV7(s)) {
      combo = currentCombo(s.combo, s.comboTimer);
    } else {
      // v7: a landing (toilet roll, books) extends the combo too, like a break or a spill
      combo = nextCombo(s.combo, s.comboTimer);
      if (combo > maxCombo) combo = maxCombo;
      s.combo = combo;
      s.comboTimer = comboWindow(s);
      if (combo > s.maxCombo) s.maxCombo = combo;
    }
    pts = propPoints(k.base, p.fromLevel, combo, s.eventActive, s.lastCall);
  }
  let cam = false;
  if (play && webcamOn(s, play) && webcamSees(s, play, p.x, p.z, p.level)) {
    cam = true;
    pts += Math.floor((pts * ON_CAMERA_PCT) / 100);
    p.onCam = 1;
    s.onCamera = (s.onCamera ?? 0) + 1;
  }
  const framed = framedLanding(s, p);
  p.points = pts;
  s.score += pts;
  p.state = outcome === 'break' ? PropSt.BROKEN : outcome === 'spill' ? PropSt.SPILLED : PropSt.LANDED;
  p.fallTimer = 0;
  p.restTick = s.tick;
  if (s.firstCrashTick < 0) s.firstCrashTick = s.tick;
  if (k.stack && items > 0) out.push({ t: 'stack', tick: s.tick, prop: idx, items, points: pts });
  const ev: SimEvent = { t: outcome, tick: s.tick, prop: idx, points: pts, combo };
  if (cam) ev.cam = true;
  if (framed) ev.framed = true;
  out.push(ev);
  if (framed) {
    s.score += BONUS.framed;
    s.framed++;
    p.framed = 1;
    out.push({ t: 'framed', tick: s.tick, prop: idx });
  }

  if (p.target) {
    s.score += BONUS.target;
    s.targetsHit++;
    out.push({ t: 'target', tick: s.tick, prop: idx });
  }

  if (!framed && !p.seen) {
    const w = crashWitness(s, p);
    if (w === 1) {
      p.seen = 1;
      addSuspicion(s, outcome === 'land' ? SUSPICION.fallInCone : SUSPICION.breakInCone);
    } else if (w === 0) {
      addSuspicion(s, SUSPICION.heardCrash);
    }
  }
  spillPuddle(s, p, out);
  bumpRoomba(s, p.x, p.z);
  const loud = outcome !== 'land' || k.tall !== undefined;
  addNoise(s, loud ? noiseRules(s).crash : noiseRules(s).land, p.x, p.z, out);
}

/** Advance every falling prop; landings resolve in index order after all timers tick (no same-tick double step). */
export function stepProps(s: SimState, out: SimEvent[], play?: PlayableRoom): void {
  const props = s.props;
  const landing: number[] = [];
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.state === PropSt.FALLING) {
      p.fallTimer--;
      if (p.fallTimer <= 0) landing.push(i);
    } else if (p.state === PropSt.CARRIED) {
      p.x = s.cat.x;
      p.z = s.cat.z;
      p.level = s.cat.level;
    }
  }
  for (const i of landing) land(s, i, out, play);
}
