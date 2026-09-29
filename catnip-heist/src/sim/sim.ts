/**
 * Catnip Heist deterministic simulation (SimAPI). Pure TypeScript: no DOM, no three, integer maths
 * only, fixed TICK_HZ. `step` never mutates its input.
 *
 * Cat movement model (SIM_VERSION 3): free, continuous movement in integer sub-tile units.
 * - Speed is exactly CAT_SPEED_NUM / CAT_SPEED_DEN units per tick (8/3 = 80 units/s = 5 tiles/s),
 *   kept exact by an integer accumulator (`moveAcc`, Bresenham style). Every moving tick adds
 *   CAT_SPEED_NUM * 256 (cardinal) or CAT_SPEED_NUM * DIAG_NUM (diagonal, DIAG_NUM / 256 ~ 1/sqrt 2,
 *   so diagonals are not faster) and moves floor(acc / (CAT_SPEED_DEN * 256)) units per axis. The
 *   accumulator resets to 0 on any tick the cat does not move, so from rest a cardinal input held
 *   for CAT_TICKS_PER_TILE (6) ticks moves exactly one tile (2,3,3,2,3,3 units) and ends with acc 0.
 * - Input is applied on the tick it arrives: instant start, instant stop on release, instant turn.
 *   There is no tile-centre gating for movement, interact or swap. The idle cat never moves.
 * - Collision: an axis-aligned hitbox (centre +- CAT_HALF units, inclusive) against every tile the
 *   cat cannot enter (walls, void, boxes, the crate, closed doors). Axes are resolved separately,
 *   so a blocked diagonal slides along the open axis at full cardinal speed. Corner assist: when a
 *   cardinal move is blocked but shifting sideways by at most CORNER_ASSIST units would clear it,
 *   the cat is nudged sideways towards the opening (doorways are easy to enter).
 * - Tile logic (coins, key, plates, checkpoints, exit, hints, meow tile, guard line of sight) uses
 *   the tile under the cat's centre, tileOf(pos). Plates stay pressed while a cat's centre is on
 *   the plate tile. A PLATE door never closes while any cat's hitbox overlaps the door tile.
 * - Interact: the active cat rescues when the crate is within 1 tile (Chebyshev) of its centre
 *   tile, else opens a closed VAULT door within 1 tile when holding the key. Pushing into a vault
 *   door with the key also opens it.
 * - Guards remain grid-locked (see below). The vision test uses the cat's exact centre point
 *   (inCone) and tile line of sight, which is exactly what render/vision.ts draws.
 *
 * Rules summary:
 * - Guards walk tile centre to tile centre (SUBTILE / speed ticks per tile) and only decide at
 *   centres.
 * - Plates are pressed while a cat's centre tile is the plate tile. A PLATE door is open while any
 *   linked plate is pressed, and never closes on an occupant. VAULT doors open once with the key.
 * - Sentries: a guard with a single waypoint stands at its post. With `turns` it faces each
 *   scheduled direction in turn, on the global tick clock (sentryFacing), so the schedule is a
 *   pure function of the tick. After an investigation it walks back and rejoins the schedule.
 * - Guards patrol waypoint loops (never pathing through PLATE doors), SNIFF at waypoints (first half facing the arrival direction,
 *   second half facing the next leg), INVESTIGATE a meow tile, and ALERT briefly after spotting.
 * - Spotted (in cone with line of sight, or touching a guard) => that cat goes back to its
 *   checkpoint, spottedCount++. Nobody dies.
 * - Meow: guards within meta.meowRadiusTiles with line of sight to the meowing cat's tile go
 *   INVESTIGATE: they walk there (BFS), look around for meta.investigateTicks, then resume the
 *   patrol. A guard turns towards the sound, so meowing inside its vision radius gets you seen.
 * - Win: rescue done and both cats on exit tiles. After a win `step` returns the state unchanged.
 * - Tick order: swap, cat movement, pickups/checkpoints, interact, meow, guards, vision, plates and
 *   doors, win, score, hash.
 */
import {
  NO_INPUT,
  SIM_VERSION,
  SUBTILE,
  TICK_HZ,
  type CatPose,
  type CatState,
  type GuardDef,
  type GuardMode,
  type GuardState,
  type Input,
  type LevelDef,
  type SimAPI,
  type SimEvent,
  type SimState,
  type Vec2i,
} from '../types';
import {
  DIRS4,
  atCenter,
  centerOf,
  compileLevel,
  distanceField,
  isOpenTile,
  lineOfSight,
  tileOf,
  type CompiledLevel,
} from './grid';
import { FNV_OFFSET, fnvInt } from './hash';
import { nextRng, rngInt, seedRng } from './rng';

// ---------------------------------------------------------------------------------------------
// Tunables (integers)
// ---------------------------------------------------------------------------------------------

/** Cat speed: CAT_SPEED_NUM / CAT_SPEED_DEN sub-tile units per tick (8/3 u/tick = 5 tiles/s). */
export const CAT_SPEED_NUM = 8;
export const CAT_SPEED_DEN = 3;
/** Diagonal factor DIAG_NUM / DIAG_SCALE (~0.7071) applied per axis on diagonal moves. */
export const DIAG_NUM = 181;
export const DIAG_SCALE = 256;
/** Ticks for a cardinal centre-to-centre move from rest (SUBTILE * DEN / NUM, exact). */
export const CAT_TICKS_PER_TILE = (SUBTILE * CAT_SPEED_DEN) / CAT_SPEED_NUM;
/** Cat hitbox half-size in sub-tile units: the box spans centre +- CAT_HALF (inclusive). */
export const CAT_HALF = 5;
/** Max sideways nudge (units) of the corner assist. */
export const CORNER_ASSIST = 6;
const ACC_UNIT = CAT_SPEED_DEN * DIAG_SCALE;
/** Ticks a caught cat is frozen (and invisible to guards) after respawning. */
export const STUN_TICKS = 45;
/** Ticks a guard stays ALERT after spotting a cat. */
export const ALERT_TICKS = 45;
/** Distance (sub-tile units) at which bumping into a guard spots the cat regardless of facing. */
export const TOUCH_RADIUS = 10;
/** Ticks the MEOW pose is shown. Also the meow cooldown. */
export const MEOW_TICKS = 20;
/** Idle ticks before the cat sits, and before it falls asleep. */
export const SIT_AFTER = 90;
export const SLEEP_AFTER = 600;
/** Safety cap: a guard gives up an investigation after this many ticks. */
export const INVESTIGATE_GIVE_UP = 900;
/** While investigating at the target, the guard looks around every N ticks. */
export const LOOK_AROUND_EVERY = 24;

const MODE_CODES: Record<GuardMode, number> = { PATROL: 0, SNIFF: 1, INVESTIGATE: 2, ALERT: 3 };
const POSE_CODES: Record<CatPose, number> = { IDLE: 0, WALK: 1, SIT: 2, MEOW: 3, HIT: 4, SLEEP: 5 };

/** CatState plus sim-internal counters (still plain integers, included in the hash). */
export interface SimCat extends CatState {
  vel: Vec2i;
  idleTicks: number;
  meowTicks: number;
  /** Movement accumulator (units of 1 / ACC_UNIT sub-tile units); 0 whenever the cat is still. */
  moveAcc: number;
}

/** GuardState plus sim-internal counters. */
export interface SimGuard extends GuardState {
  /** Ticks spent standing at the investigation target. */
  waitTicks: number;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function sign(v: number): -1 | 0 | 1 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function sameTile(a: Vec2i, b: Vec2i): boolean {
  return a.x === b.x && a.y === b.y;
}

function cloneCat(c: SimCat): SimCat {
  return {
    id: c.id,
    pos: { x: c.pos.x, y: c.pos.y },
    facing: { x: c.facing.x, y: c.facing.y },
    faceX: c.faceX,
    moving: c.moving,
    vel: c.vel ? { x: c.vel.x, y: c.vel.y } : { x: 0, y: 0 },
    checkpoint: { x: c.checkpoint.x, y: c.checkpoint.y },
    stunTicks: c.stunTicks,
    pose: c.pose,
    idleTicks: c.idleTicks,
    meowTicks: c.meowTicks,
    moveAcc: c.moveAcc | 0,
  };
}

function cloneGuard(g: SimGuard): SimGuard {
  return {
    id: g.id,
    sprite: g.sprite,
    pos: { x: g.pos.x, y: g.pos.y },
    facing: { x: g.facing.x, y: g.facing.y },
    faceX: g.faceX,
    mode: g.mode,
    modeTicks: g.modeTicks,
    waypointIndex: g.waypointIndex,
    target: g.target ? { x: g.target.x, y: g.target.y } : null,
    visionTiles: g.visionTiles,
    moving: g.moving,
    waitTicks: g.waitTicks,
  };
}

/** The tile a GUARD walking along `facing` will reach next (its own tile when centred). */
function destinationTile(pos: Vec2i, facing: Vec2i): Vec2i {
  if (atCenter(pos)) return tileOf(pos);
  const c = centerOf(tileOf(pos));
  // Moving from centre A to centre B: once past the midpoint tileOf is B; before it tileOf is A.
  const ox = pos.x - c.x;
  const oy = pos.y - c.y;
  const t = tileOf(pos);
  // If the offset points along facing we are leaving this tile, otherwise arriving.
  const leaving = ox * facing.x + oy * facing.y > 0;
  return leaving ? { x: t.x + facing.x, y: t.y + facing.y } : t;
}

// ---------------------------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------------------------

/** Integer 90-degree cone test from a guard at `gp` facing `f` to point `p` (sub-tile units). */
export function inCone(gp: Vec2i, f: Vec2i, p: Vec2i, visionTiles: number): boolean {
  const dx = p.x - gp.x;
  const dy = p.y - gp.y;
  const r = visionTiles * SUBTILE;
  if (dx * dx + dy * dy > r * r) return false;
  const dot = dx * f.x + dy * f.y;
  if (dot <= 0) return false;
  const cross = dx * f.y - dy * f.x;
  return (cross < 0 ? -cross : cross) <= dot;
}

/** Full sight test: cone + line of sight (tiles between guard and target must be transparent). */
export function guardSeesPoint(
  c: CompiledLevel,
  g: GuardState,
  p: Vec2i,
  doorsOpen: readonly boolean[],
): boolean {
  if (!inCone(g.pos, g.facing, p, g.visionTiles)) return false;
  return lineOfSight(c, tileOf(g.pos), tileOf(p), doorsOpen);
}

/**
 * Tiles whose centre the guard can currently see (for drawing vision cones exactly as the sim
 * evaluates them). Deterministic order (row-major).
 */
export function visibleTiles(level: LevelDef, g: GuardState, doorsOpen: readonly boolean[]): Vec2i[] {
  const c = compileLevel(level);
  const out: Vec2i[] = [];
  const gt = tileOf(g.pos);
  const r = g.visionTiles + 1;
  for (let y = gt.y - r; y <= gt.y + r; y++)
    for (let x = gt.x - r; x <= gt.x + r; x++) {
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
      if (c.terrain[y * c.w + x] !== 0) continue;
      if (guardSeesPoint(c, g, centerOf({ x, y }), doorsOpen)) out.push({ x, y });
    }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------------------------

/** Total length of a sentry's turn schedule in ticks (0 = not a turning sentry). */
export function sentryPeriod(def: GuardDef): number {
  if (!def.turns || def.turns.length === 0 || def.waypoints.length !== 1) return 0;
  let p = 0;
  for (const t of def.turns) p += t.ticks;
  return p;
}

/** Facing of a turning sentry at `tick` (see GuardDef.turns), or null for other guards. */
export function sentryFacing(def: GuardDef, tick: number): Vec2i | null {
  const period = sentryPeriod(def);
  if (period === 0) return null;
  let r = tick % period;
  for (const t of def.turns!) {
    if (r < t.ticks) return { x: t.facing.x, y: t.facing.y };
    r -= t.ticks;
  }
  return { x: def.turns![0].facing.x, y: def.turns![0].facing.y };
}

function firstLegFacing(level: LevelDef, gi: number): Vec2i {
  const def = level.guards[gi];
  const sf = sentryFacing(def, 0);
  if (sf) return sf;
  if (def.facing) return { x: def.facing.x, y: def.facing.y };
  const a = def.waypoints[0];
  const b = def.waypoints.length > 1 ? def.waypoints[1] : a;
  const fx = sign(b.x - a.x);
  const fy = sign(b.y - a.y);
  if (fx !== 0) return { x: fx, y: 0 };
  if (fy !== 0) return { x: 0, y: fy };
  return { x: 1, y: 0 };
}

function init(level: LevelDef, seed: number, catIds: [string, string]): SimState {
  compileLevel(level);
  const cats = [0, 1].map(
    (i): SimCat => ({
      id: catIds[i],
      pos: centerOf(level.catSpawns[i]),
      facing: { x: 1, y: 0 },
      faceX: 1,
      moving: false,
      vel: { x: 0, y: 0 },
      checkpoint: { x: level.catSpawns[i].x, y: level.catSpawns[i].y },
      stunTicks: 0,
      pose: 'IDLE',
      idleTicks: 0,
      meowTicks: 0,
      moveAcc: 0,
    }),
  ) as [SimCat, SimCat];
  const guards = level.guards.map((def, gi): SimGuard => {
    const f = firstLegFacing(level, gi);
    return {
      id: def.id,
      sprite: def.sprite,
      pos: centerOf(def.waypoints[0]),
      facing: f,
      faceX: f.x < 0 ? -1 : 1,
      mode: 'PATROL',
      modeTicks: 0,
      waypointIndex: def.waypoints.length > 1 ? 1 : 0,
      target: null,
      visionTiles: def.visionTiles,
      moving: false,
      waitTicks: 0,
    };
  });
  const s: SimState = {
    levelId: level.id,
    tick: 0,
    rng: seedRng(seed),
    cats,
    activeIndex: 0,
    guards,
    coins: level.coins.map((c) => ({ id: c.id, tile: { x: c.tile.x, y: c.tile.y }, taken: false })),
    coinsCollected: 0,
    hasKey: false,
    keyTaken: false,
    doorsOpen: level.doors.map(() => false),
    platesDown: level.plates.map(() => false),
    rescued: false,
    won: false,
    pendingInteract: false,
    spottedCount: 0,
    score: 0,
    hash: 0,
    events: [],
  };
  // Plates/doors may start pressed if a spawn is on a plate.
  updatePlatesAndDoors(compileLevel(level), s, []);
  s.score = computeScore(s);
  s.hash = hashState(s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------------------------

export function computeScore(s: SimState): number {
  const v = s.coinsCollected * 10 + (s.rescued ? 50 : 0) - Math.floor(s.tick / TICK_HZ / 10);
  return v < 0 ? 0 : v;
}

/** True when the cat hitbox centred at (x, y) overlaps no blocking tile. */
export function catBoxFree(c: CompiledLevel, doorsOpen: readonly boolean[], x: number, y: number): boolean {
  const x0 = (x - CAT_HALF) >> 4;
  const x1 = (x + CAT_HALF) >> 4;
  const y0 = (y - CAT_HALF) >> 4;
  const y1 = (y + CAT_HALF) >> 4;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!isOpenTile(c, tx, ty, doorsOpen)) return false;
  return true;
}

/** True when the cat hitbox centred at `p` overlaps tile `t`. */
function catBoxOverlaps(p: Vec2i, t: Vec2i): boolean {
  return (
    (p.x - CAT_HALF) >> 4 <= t.x && (p.x + CAT_HALF) >> 4 >= t.x && (p.y - CAT_HALF) >> 4 <= t.y && (p.y + CAT_HALF) >> 4 >= t.y
  );
}

/** Move the point along one axis by up to n units, stopping before the first blocked unit. */
function slideAxis(c: CompiledLevel, s: SimState, p: Vec2i, ax: number, ay: number, n: number): number {
  let m = 0;
  while (m < n && catBoxFree(c, s.doorsOpen, p.x + ax, p.y + ay)) {
    p.x += ax;
    p.y += ay;
    m++;
  }
  return m;
}

/**
 * Corner assist for a blocked cardinal move along (ax, ay): the smallest sideways shift (<=
 * CORNER_ASSIST, negative side first on ties) after which the forward unit is free, as a signed
 * offset along the perpendicular axis; 0 if none.
 */
function cornerAssist(c: CompiledLevel, s: SimState, p: Vec2i, ax: number, ay: number): number {
  const px = ay !== 0 ? 1 : 0;
  const py = ax !== 0 ? 1 : 0;
  let negOk = true;
  let posOk = true;
  for (let o = 1; o <= CORNER_ASSIST && (negOk || posOk); o++) {
    if (negOk) {
      if (!catBoxFree(c, s.doorsOpen, p.x - px * o, p.y - py * o)) negOk = false;
      else if (catBoxFree(c, s.doorsOpen, p.x - px * o + ax, p.y - py * o + ay)) return -o;
    }
    if (posOk) {
      if (!catBoxFree(c, s.doorsOpen, p.x + px * o, p.y + py * o)) posOk = false;
      else if (catBoxFree(c, s.doorsOpen, p.x + px * o + ax, p.y + py * o + ay)) return o;
    }
  }
  return 0;
}

/** Try to open a closed VAULT door at tile (x,y) with the key. Returns true if it opened. */
function tryOpenVault(c: CompiledLevel, s: SimState, x: number, y: number, events: SimEvent[]): boolean {
  if (!s.hasKey) return false;
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return false;
  const d = c.doorAt[y * c.w + x];
  if (d === 0) return false;
  const door = c.level.doors[d - 1];
  if (door.kind !== 'VAULT' || s.doorsOpen[d - 1]) return false;
  s.doorsOpen[d - 1] = true;
  s.hasKey = false;
  events.push({ type: 'DOOR', id: door.id, tile: { x, y }, open: true });
  return true;
}

/** Pushing into a closed vault door with the key opens it: probe the tiles the hitbox edge touches. */
function pushVault(c: CompiledLevel, s: SimState, p: Vec2i, dx: number, dy: number, events: SimEvent[]): void {
  if (!s.hasKey) return;
  if (dx !== 0) {
    const tx = (p.x + dx * (CAT_HALF + 1)) >> 4;
    for (let ty = (p.y - CAT_HALF) >> 4; ty <= (p.y + CAT_HALF) >> 4; ty++) if (tryOpenVault(c, s, tx, ty, events)) return;
  }
  if (dy !== 0) {
    const ty = (p.y + dy * (CAT_HALF + 1)) >> 4;
    for (let tx = (p.x - CAT_HALF) >> 4; tx <= (p.x + CAT_HALF) >> 4; tx++) if (tryOpenVault(c, s, tx, ty, events)) return;
  }
}

function stopCat(cat: SimCat): void {
  cat.moving = false;
  cat.moveAcc = 0;
  cat.vel = { x: 0, y: 0 };
}

function stepCat(c: CompiledLevel, s: SimState, i: number, input: Input, events: SimEvent[]): void {
  const cat = s.cats[i] as SimCat;
  if (cat.meowTicks > 0) cat.meowTicks--;
  if (cat.stunTicks > 0) {
    cat.stunTicks--;
    stopCat(cat);
    cat.idleTicks = 0;
    cat.pose = 'HIT';
    return;
  }
  const inp = i === s.activeIndex ? input : NO_INPUT;
  const dx = inp.dx;
  const dy = inp.dy;
  if (dx === 0 && dy === 0) {
    stopCat(cat);
    cat.idleTicks++;
    return;
  }
  cat.facing = { x: dx, y: dy };
  if (dx !== 0) cat.faceX = dx > 0 ? 1 : -1;
  const p = { x: cat.pos.x, y: cat.pos.y };
  const t0 = tileOf(p);
  // A diagonal with one axis blocked becomes a full-speed slide along the open axis.
  let ex: number = dx;
  let ey: number = dy;
  if (ex !== 0 && ey !== 0) {
    const fx = catBoxFree(c, s.doorsOpen, p.x + ex, p.y);
    const fy = catBoxFree(c, s.doorsOpen, p.x, p.y + ey);
    if (fx && !fy) ey = 0;
    else if (fy && !fx) ex = 0;
  }
  const diag = ex !== 0 && ey !== 0;
  let acc = cat.moveAcc + CAT_SPEED_NUM * (diag ? DIAG_NUM : DIAG_SCALE);
  const units = (acc / ACC_UNIT) | 0;
  acc -= units * ACC_UNIT;
  if (diag) {
    slideAxis(c, s, p, ex, 0, units);
    slideAxis(c, s, p, 0, ey, units);
  } else {
    const m = slideAxis(c, s, p, ex, ey, units);
    if (m < units) {
      const o = cornerAssist(c, s, p, ex, ey);
      if (o !== 0) {
        const so = o < 0 ? -1 : 1;
        slideAxis(c, s, p, ey !== 0 ? so : 0, ex !== 0 ? so : 0, Math.min(units - m, o * so));
      }
    }
  }
  if (p.x === cat.pos.x && p.y === cat.pos.y) {
    pushVault(c, s, p, dx, dy, events);
    stopCat(cat);
    cat.idleTicks++;
    return;
  }
  if (p.x !== cat.pos.x + ex * units || p.y !== cat.pos.y + ey * units) pushVault(c, s, p, dx, dy, events);
  cat.vel = { x: p.x - cat.pos.x, y: p.y - cat.pos.y };
  cat.pos = p;
  cat.moveAcc = acc;
  cat.moving = true;
  cat.idleTicks = 0;
  const t1 = tileOf(p);
  if (!sameTile(t0, t1)) events.push({ type: 'STEP', cat: i, tile: t1 });
}

function catPickups(c: CompiledLevel, s: SimState, i: number, events: SimEvent[]): void {
  const cat = s.cats[i];
  if (cat.stunTicks > 0) return;
  const t = tileOf(cat.pos);
  const ti = t.y * c.w + t.x;
  const ci = c.coinAt[ti];
  if (ci > 0 && !s.coins[ci - 1].taken) {
    s.coins[ci - 1] = { ...s.coins[ci - 1], taken: true };
    s.coinsCollected++;
    events.push({ type: 'COIN', cat: i, id: s.coins[ci - 1].id, tile: t });
  }
  if (ti === c.keyIdx && !s.keyTaken && c.level.key) {
    s.keyTaken = true;
    s.hasKey = true;
    events.push({ type: 'KEY', cat: i, id: c.level.key.id, tile: t });
  }
  const cp = c.checkpointAt[ti];
  if (cp > 0 && !sameTile(cat.checkpoint, t)) {
    cat.checkpoint = { x: t.x, y: t.y };
    events.push({ type: 'CHECKPOINT', cat: i, id: c.level.checkpoints[cp - 1].id, tile: t });
  }
}

/** Neighbour order for interact: the tile itself is never a door; E, S, W, N, then diagonals. */
const DIRS8: readonly Vec2i[] = [...DIRS4, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }];

/** Interact for the active cat: rescue if the crate is within 1 tile (Chebyshev), else open a vault. */
function doInteract(c: CompiledLevel, s: SimState, events: SimEvent[]): void {
  const i = s.activeIndex;
  const cat = s.cats[i];
  if (cat.stunTicks > 0) return;
  const t = tileOf(cat.pos);
  const crate = c.level.crate.tile;
  if (!s.rescued && Math.abs(crate.x - t.x) <= 1 && Math.abs(crate.y - t.y) <= 1) {
    s.rescued = true;
    events.push({ type: 'RESCUE', cat: i, id: c.level.crate.id, tile: { x: crate.x, y: crate.y } });
    return;
  }
  for (const d of DIRS8) if (tryOpenVault(c, s, t.x + d.x, t.y + d.y, events)) return;
}

function doMeow(c: CompiledLevel, s: SimState, level: LevelDef, events: SimEvent[]): void {
  const i = s.activeIndex;
  const cat = s.cats[i] as SimCat;
  if (cat.stunTicks > 0 || cat.meowTicks > 0) return;
  cat.meowTicks = MEOW_TICKS;
  cat.idleTicks = 0;
  const t = tileOf(cat.pos);
  events.push({ type: 'MEOW', cat: i, tile: t });
  const r = level.meta.meowRadiusTiles * SUBTILE;
  for (let gi = 0; gi < s.guards.length; gi++) {
    const g = s.guards[gi] as SimGuard;
    if (g.mode === 'ALERT') continue;
    const dx = cat.pos.x - g.pos.x;
    const dy = cat.pos.y - g.pos.y;
    if (dx * dx + dy * dy > r * r) continue;
    if (!lineOfSight(c, tileOf(g.pos), t, s.doorsOpen)) continue;
    g.mode = 'INVESTIGATE';
    g.modeTicks = 0;
    g.waitTicks = 0;
    g.target = { x: t.x, y: t.y };
    events.push({ type: 'INVESTIGATE', cat: i, id: g.id, tile: { x: t.x, y: t.y } });
  }
}

/**
 * Door state as guards path through it: PLATE doors always count as closed so a guard can never be
 * shut in behind one (sound and sight still pass through open doors).
 */
function guardDoors(c: CompiledLevel, s: SimState): boolean[] {
  return s.doorsOpen.map((o, i) => o && c.level.doors[i].kind !== 'PLATE');
}

/** First step direction from `from` towards `target` (4-neighbour BFS), or null. */
function stepToward(c: CompiledLevel, s: SimState, from: Vec2i, target: Vec2i, prefer: Vec2i): Vec2i | null {
  const dist = distanceField(c, target, guardDoors(c, s));
  const here = dist[from.y * c.w + from.x];
  if (here <= 0) return null;
  const tryDir = (d: Vec2i): boolean => {
    const nx = from.x + d.x;
    const ny = from.y + d.y;
    if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) return false;
    return dist[ny * c.w + nx] === here - 1;
  };
  if ((prefer.x === 0) !== (prefer.y === 0) && tryDir(prefer)) return { x: prefer.x, y: prefer.y };
  for (const d of DIRS4) if (tryDir(d)) return { x: d.x, y: d.y };
  return null;
}

function reachable(c: CompiledLevel, s: SimState, from: Vec2i, target: Vec2i): boolean {
  return distanceField(c, target, guardDoors(c, s))[from.y * c.w + from.x] >= 0;
}

function guardMove(g: SimGuard, dir: Vec2i, speed: number): void {
  g.facing = dir;
  if (dir.x !== 0) g.faceX = dir.x > 0 ? 1 : -1;
  g.pos = { x: g.pos.x + dir.x * speed, y: g.pos.y + dir.y * speed };
  g.moving = true;
}

function setMode(g: SimGuard, m: GuardMode): void {
  g.mode = m;
  g.modeTicks = 0;
  g.waitTicks = 0;
  if (m === 'PATROL' || m === 'SNIFF') g.target = null;
}

function patrolAtCenter(c: CompiledLevel, s: SimState, gi: number, allowSniff: boolean): void {
  const g = s.guards[gi] as SimGuard;
  const def = c.level.guards[gi];
  const n = def.waypoints.length;
  const t = tileOf(g.pos);
  if (n <= 1) {
    const wp = def.waypoints[0];
    if (sameTile(t, wp)) {
      g.moving = false;
      const sf = sentryFacing(def, s.tick);
      if (sf) g.facing = sf;
      else if (def.facing) g.facing = { x: def.facing.x, y: def.facing.y };
      if (g.facing.x !== 0) g.faceX = g.facing.x > 0 ? 1 : -1;
      return;
    }
    const dir = stepToward(c, s, t, wp, g.facing);
    if (dir) guardMove(g, dir, def.speed);
    else g.moving = false;
    return;
  }
  let wp = def.waypoints[g.waypointIndex];
  if (sameTile(t, wp)) {
    if (allowSniff && def.sniffTicks > 0) {
      setMode(g, 'SNIFF');
      g.moving = false;
      return;
    }
    g.waypointIndex = (g.waypointIndex + 1) % n;
    wp = def.waypoints[g.waypointIndex];
  }
  const dir = stepToward(c, s, t, wp, g.facing);
  if (dir) guardMove(g, dir, def.speed);
  else g.moving = false;
}

function stepGuard(c: CompiledLevel, s: SimState, gi: number, level: LevelDef): void {
  const g = s.guards[gi] as SimGuard;
  const def = level.guards[gi];
  g.modeTicks++;
  if (!atCenter(g.pos)) {
    // Always finish the current tile move before any decision.
    guardMove(g, g.facing, def.speed);
    return;
  }
  const t = tileOf(g.pos);
  switch (g.mode) {
    case 'PATROL':
      patrolAtCenter(c, s, gi, true);
      return;
    case 'SNIFF': {
      g.moving = false;
      const n = def.waypoints.length;
      const next = def.waypoints[(g.waypointIndex + 1) % n];
      if (g.modeTicks * 2 >= def.sniffTicks) {
        const dir = stepToward(c, s, t, next, g.facing);
        if (dir) {
          g.facing = dir;
          if (dir.x !== 0) g.faceX = dir.x > 0 ? 1 : -1;
        }
      }
      if (g.modeTicks >= def.sniffTicks) {
        setMode(g, 'PATROL');
        patrolAtCenter(c, s, gi, false);
      }
      return;
    }
    case 'INVESTIGATE': {
      const target = g.target ?? t;
      if (g.modeTicks > INVESTIGATE_GIVE_UP) {
        setMode(g, 'PATROL');
        patrolAtCenter(c, s, gi, false);
        return;
      }
      const there = sameTile(t, target) || !reachable(c, s, t, target);
      if (!there) {
        const dir = stepToward(c, s, t, target, g.facing);
        if (dir) {
          guardMove(g, dir, def.speed);
          return;
        }
      }
      g.moving = false;
      if (g.waitTicks === 0 && !sameTile(t, target)) {
        // Unreachable: face towards the sound along the dominant axis.
        const dx = target.x - t.x;
        const dy = target.y - t.y;
        const ax = dx < 0 ? -dx : dx;
        const ay = dy < 0 ? -dy : dy;
        g.facing = ax >= ay ? { x: sign(dx) || 1, y: 0 } : { x: 0, y: sign(dy) };
        if (g.facing.x !== 0) g.faceX = g.facing.x > 0 ? 1 : -1;
      }
      g.waitTicks++;
      if (g.waitTicks % LOOK_AROUND_EVERY === 0) {
        s.rng = nextRng(s.rng);
        const turn = rngInt(s.rng, 2) === 0 ? 1 : -1;
        // Rotate 90 degrees: (x,y) -> (-y*turn, x*turn)
        g.facing = { x: -g.facing.y * turn, y: g.facing.x * turn };
        if (g.facing.x !== 0) g.faceX = g.facing.x > 0 ? 1 : -1;
      }
      if (g.waitTicks >= level.meta.investigateTicks) {
        setMode(g, 'PATROL');
        patrolAtCenter(c, s, gi, false);
      }
      return;
    }
    case 'ALERT':
      g.moving = false;
      if (g.modeTicks >= ALERT_TICKS) {
        setMode(g, 'PATROL');
        patrolAtCenter(c, s, gi, false);
      }
      return;
  }
}

function checkVision(c: CompiledLevel, s: SimState, events: SimEvent[]): void {
  for (let ci = 0; ci < 2; ci++) {
    const cat = s.cats[ci] as SimCat;
    if (cat.stunTicks > 0) continue;
    for (let gi = 0; gi < s.guards.length; gi++) {
      const g = s.guards[gi] as SimGuard;
      const dx = cat.pos.x - g.pos.x;
      const dy = cat.pos.y - g.pos.y;
      const touch = dx * dx + dy * dy <= TOUCH_RADIUS * TOUCH_RADIUS;
      if (!touch && !guardSeesPoint(c, g, cat.pos, s.doorsOpen)) continue;
      const seenAt = tileOf(cat.pos);
      events.push({ type: 'SPOTTED', cat: ci, id: g.id, tile: seenAt });
      s.spottedCount++;
      setMode(g, 'ALERT');
      g.target = seenAt;
      if (!touch) {
        // Turn to face the cat along the dominant axis (only at centre, see destinationTile).
        if (atCenter(g.pos)) {
          const ax = dx < 0 ? -dx : dx;
          const ay = dy < 0 ? -dy : dy;
          g.facing = ax >= ay ? { x: sign(dx) || 1, y: 0 } : { x: 0, y: sign(dy) };
          if (g.facing.x !== 0) g.faceX = g.facing.x > 0 ? 1 : -1;
        }
      }
      cat.pos = centerOf(cat.checkpoint);
      stopCat(cat);
      cat.stunTicks = STUN_TICKS;
      cat.idleTicks = 0;
      cat.pose = 'HIT';
      break;
    }
  }
}

function updatePlatesAndDoors(c: CompiledLevel, s: SimState, events: SimEvent[]): void {
  const level = c.level;
  for (let pi = 0; pi < level.plates.length; pi++) {
    const pt = level.plates[pi].tile;
    let down = false;
    for (const cat of s.cats) if (sameTile(tileOf(cat.pos), pt)) down = true;
    if (down !== s.platesDown[pi]) {
      s.platesDown[pi] = down;
      events.push({ type: 'PLATE', id: level.plates[pi].id, tile: { x: pt.x, y: pt.y }, open: down });
    }
  }
  for (let di = 0; di < level.doors.length; di++) {
    const door = level.doors[di];
    if (door.kind !== 'PLATE') continue;
    let open = false;
    for (const pi of c.doorPlates[di]) if (s.platesDown[pi]) open = true;
    if (!open && s.doorsOpen[di]) {
      // Never close on an occupant (or on someone walking into the doorway).
      const dt = door.tile;
      for (const cat of s.cats) if (catBoxOverlaps(cat.pos, dt)) open = true;
      for (const g of s.guards) {
        if (sameTile(tileOf(g.pos), dt) || sameTile(destinationTile(g.pos, g.facing), dt)) open = true;
      }
    }
    if (open !== s.doorsOpen[di]) {
      s.doorsOpen[di] = open;
      events.push({ type: 'DOOR', id: door.id, tile: { x: door.tile.x, y: door.tile.y }, open });
    }
  }
}

function updatePoses(s: SimState): void {
  for (const cat of s.cats as unknown as SimCat[]) {
    if (cat.stunTicks > 0) cat.pose = 'HIT';
    else if (cat.moving) cat.pose = 'WALK';
    else if (cat.meowTicks > 0) cat.pose = 'MEOW';
    else if (cat.idleTicks >= SLEEP_AFTER) cat.pose = 'SLEEP';
    else if (cat.idleTicks >= SIT_AFTER) cat.pose = 'SIT';
    else cat.pose = 'IDLE';
  }
}

function step(state: SimState, input: Input, level: LevelDef): SimState {
  const c = compileLevel(level);
  const s: SimState = {
    ...state,
    cats: [cloneCat(state.cats[0] as SimCat), cloneCat(state.cats[1] as SimCat)],
    guards: state.guards.map((g) => cloneGuard(g as SimGuard)),
    coins: state.coins.slice(),
    doorsOpen: state.doorsOpen.slice(),
    platesDown: state.platesDown.slice(),
    events: [],
  };
  if (state.won) return s;
  const events: SimEvent[] = [];
  s.tick = state.tick + 1;

  // 1. Swap.
  if (input.swap) {
    s.activeIndex = s.activeIndex === 0 ? 1 : 0;
    events.push({ type: 'SWAP', cat: s.activeIndex });
  }
  // 2. Movement (only the active cat moves).
  stepCat(c, s, 0, input, events);
  stepCat(c, s, 1, input, events);
  // 3. Pickups and checkpoints.
  catPickups(c, s, 0, events);
  catPickups(c, s, 1, events);
  // 4. Buttons.
  if (input.interact) doInteract(c, s, events);
  if (input.meow) doMeow(c, s, level, events);
  // 5. Guards.
  for (let gi = 0; gi < s.guards.length; gi++) stepGuard(c, s, gi, level);
  // 6. Vision / touch.
  checkVision(c, s, events);
  // 7. Plates and doors.
  updatePlatesAndDoors(c, s, events);
  // 8. Win.
  if (s.rescued) {
    const a = tileOf(s.cats[0].pos);
    const b = tileOf(s.cats[1].pos);
    if (c.exitAt[a.y * c.w + a.x] && c.exitAt[b.y * c.w + b.x]) {
      s.won = true;
      events.push({ type: 'WIN' });
    }
  }
  updatePoses(s);
  s.score = computeScore(s);
  s.events = events;
  s.hash = hashState(s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------------------------

export function hashState(s: SimState): number {
  let h = FNV_OFFSET;
  h = fnvInt(h, SIM_VERSION);
  h = fnvInt(h, s.tick);
  h = fnvInt(h, s.rng);
  h = fnvInt(h, s.activeIndex);
  for (const cat of s.cats as unknown as SimCat[]) {
    h = fnvInt(h, cat.pos.x);
    h = fnvInt(h, cat.pos.y);
    h = fnvInt(h, cat.facing.x);
    h = fnvInt(h, cat.facing.y);
    h = fnvInt(h, cat.faceX);
    h = fnvInt(h, cat.moving ? 1 : 0);
    h = fnvInt(h, cat.vel ? cat.vel.x : 0);
    h = fnvInt(h, cat.vel ? cat.vel.y : 0);
    h = fnvInt(h, cat.moveAcc | 0);
    h = fnvInt(h, cat.checkpoint.x);
    h = fnvInt(h, cat.checkpoint.y);
    h = fnvInt(h, cat.stunTicks);
    h = fnvInt(h, POSE_CODES[cat.pose]);
    h = fnvInt(h, cat.idleTicks | 0);
    h = fnvInt(h, cat.meowTicks | 0);
  }
  for (const g of s.guards as SimGuard[]) {
    h = fnvInt(h, g.pos.x);
    h = fnvInt(h, g.pos.y);
    h = fnvInt(h, g.facing.x);
    h = fnvInt(h, g.facing.y);
    h = fnvInt(h, MODE_CODES[g.mode]);
    h = fnvInt(h, g.modeTicks);
    h = fnvInt(h, g.waypointIndex);
    h = fnvInt(h, g.target ? g.target.x : -1);
    h = fnvInt(h, g.target ? g.target.y : -1);
    h = fnvInt(h, g.visionTiles);
    h = fnvInt(h, g.waitTicks | 0);
  }
  let bits = 0;
  for (let i = 0; i < s.coins.length; i++) {
    if (s.coins[i].taken) bits |= 1 << (i & 31);
    if ((i & 31) === 31) {
      h = fnvInt(h, bits);
      bits = 0;
    }
  }
  h = fnvInt(h, bits);
  h = fnvInt(h, s.coinsCollected);
  h = fnvInt(h, (s.hasKey ? 1 : 0) | (s.keyTaken ? 2 : 0) | (s.rescued ? 4 : 0) | (s.won ? 8 : 0));
  for (const d of s.doorsOpen) h = fnvInt(h, d ? 1 : 0);
  for (const p of s.platesDown) h = fnvInt(h, p ? 1 : 0);
  h = fnvInt(h, s.spottedCount);
  h = fnvInt(h, s.score);
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const levelOfState = new WeakMap<SimState, LevelDef>();

/**
 * Create a SimAPI bound to no particular level: `init` remembers the level for the states it
 * produces, so `step(state, input)` works without passing the level again.
 */
export function createSim(): SimAPI {
  return {
    init(level, seed, catIds) {
      const s = init(level, seed, catIds);
      levelOfState.set(s, level);
      return s;
    },
    step(state, input) {
      const level = levelOfState.get(state);
      if (!level) throw new Error('sim.step: state was not produced by this sim (call init first)');
      const next = step(state, input, level);
      levelOfState.set(next, level);
      return next;
    },
    hash: hashState,
  };
}

/** Default SimAPI instance. */
export const Sim: SimAPI = createSim();

/** Level-explicit variants (useful for tools and when states are deserialised). */
export function initSim(level: LevelDef, seed: number, catIds: [string, string]): SimState {
  return Sim.init(level, seed, catIds);
}

export function stepSim(level: LevelDef, state: SimState, input: Input): SimState {
  const next = step(state, input, level);
  levelOfState.set(next, level);
  return next;
}
