/**
 * Room validator v2 (GDD 4.1, 6.4, 13.7, no bot). Static checks plus a shortest-path search over the heightmap
 * with the sim's own moves: 8-way steps to equal-or-lower cells without corner cutting (7 / 10 trot ticks),
 * orthogonal jumps to a +1 cell (JUMP_TICKS; the sim also jumps diagonally, so this is conservative). Cells holding
 * an intact blocking prop or a human are walls.
 *
 * A target is wreckable when one of these works from a reachable cell (diagonal swats and dominoes are ignored):
 * - push: the cat stands on an orthogonal neighbour at the target's level and the cell beyond is lower;
 * - cloth pull: the target rides a tablecloth, sits on the cloth's edge row and the cat can stand just outside that
 *   edge, lower than the cloth (a chair beside the table, the floor beside a seat);
 * - cable pull: a lamp whose cable hangs on a floor cell the cat can stand on or next to;
 * - tall: the Christmas tree (L0) from an orthogonal neighbour at its `tall` level (the mantle at L3).
 */
import {
  BOSS_TICKS,
  JUMP_TICKS,
  RUN_TICKS,
  STEP_TICKS,
  TICK_HZ,
  propKind,
  type GridState,
  type HumanState,
  type Level,
  type PlayableRoom,
  type PropPlacement,
  type RoomDef,
  type RoutineDef,
  type SimState,
  type ValidationReport,
} from '../types';
import { looksAt, shortConeSees } from '../sim';
import { plannerRun } from '../sim/planner';
import { DECOR_FURNITURE } from './shells';

export const PROP_MIN = 25;
export const PROP_MAX = 45;
/** Boss rooms (GDD 4.1): up to 60 props. */
export const BOSS_PROP_MAX = 60;
/** Room Maker limit (GDD 6.4). */
export const MAKER_PROP_MAX = 40;
export const TARGETS_PER_ROOM = 3;
/** "First target <= 6 s" (GDD 13.7). */
export const FIRST_TARGET_MAX_TICKS = 180;
/** First heist (FTUE): the first Must-Wreck crash must be reachable by feel in 3 s. */
export const FTUE_FIRST_TARGET_MAX_TICKS = 90;
/** Chaos budget: summed base points of every prop. Room Maker rooms (GDD 6.4) and authored dailies. */
export const MAKER_BUDGET = 3000;
export const DAILY_BUDGET = 6000;
export const BOSS_BUDGET = 9500;
/** Spectator (cameo) slots per shell (GDD 3.4, 6.5). */
export const SPECTATORS_MIN = 10;
export const SPECTATORS_MAX = 15;
/** Room sizes [width, depth]: 12 x 10, boss 14 x 12. */
export const ROOM_SIZES: readonly (readonly [number, number])[] = [
  [12, 10],
  [14, 12],
];

const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DZ = [-1, -1, 0, 1, 1, 1, 0, -1];
const ORTHO = [0, 2, 4, 6];
/** rot (0..3) -> ORTHO direction index: 0 north, 1 east, 2 south, 3 west. */
const ROT_DIR = [0, 2, 4, 6];

/** Pre-FULL-build rooms (The Glass, Kitchen variants, preview days): v4 ghosts depend on them, never re-checked for v5 data. */
export function isLegacyRoom(room: RoomDef): boolean {
  return room.id === 'glass' || /^kitchen-v\d+$/.test(room.id) || room.id.startsWith('preview-');
}

/** Player-made room (Room Maker or a decoded room link). */
export function isMakerRoom(room: RoomDef): boolean {
  return room.id.startsWith('ugc-');
}

/** Human cells of a resolved room: the second human only when the room has one. */
export function humanCells(play: PlayableRoom): { x: number; z: number; routine: RoutineDef }[] {
  const out = [{ x: play.shell.humanSpot.x, z: play.shell.humanSpot.z, routine: play.routine }];
  if (play.routine2 && play.shell.humanSpot2) out.push({ x: play.shell.humanSpot2.x, z: play.shell.humanSpot2.z, routine: play.routine2 });
  return out;
}

/** The floor cell a lamp's cable hangs on: `cable`, else the neighbour in the `rot` direction. */
export function cableCell(p: PropPlacement): { x: number; z: number } {
  if (p.cable) return { x: p.cable.x, z: p.cable.z };
  const d = ROT_DIR[p.rot & 3];
  return { x: p.x + DX[d], z: p.z + DZ[d] };
}

/** Binary min-heap of (cost, cell) for Dijkstra. */
class Heap {
  private c: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.c.length;
  }
  push(cost: number, val: number): void {
    const c = this.c;
    const v = this.v;
    let i = c.length;
    c.push(cost);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] < cost || (c[p] === cost && v[p] <= val)) break;
      c[i] = c[p];
      v[i] = v[p];
      i = p;
    }
    c[i] = cost;
    v[i] = val;
  }
  pop(): [number, number] {
    const c = this.c;
    const v = this.v;
    const top: [number, number] = [c[0], v[0]];
    const lc = c.pop()!;
    const lv = v.pop()!;
    const n = c.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mc = lc;
        let mv = lv;
        if (l < n && (c[l] < mc || (c[l] === mc && v[l] < mv))) {
          m = l;
          mc = c[l];
          mv = v[l];
        }
        if (r < n && (c[r] < mc || (c[r] === mc && v[r] < mv))) {
          m = r;
          mc = c[r];
          mv = v[r];
        }
        if (m === i) break;
        c[i] = c[m];
        v[i] = v[m];
        i = m;
      }
      c[i] = lc;
      v[i] = lv;
    }
    return top;
  }
}

/** Trot+jump ticks from the spawn to every cell (Infinity = unreachable). Exported for tools and tests. */
export function travelTicks(play: PlayableRoom): Float64Array {
  const { room, shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const N = W * D;
  const blocked = new Uint8Array(N);
  for (const p of room.props) {
    const k = propKind(p.kind);
    if (k?.blocks && p.x >= 0 && p.z >= 0 && p.x < W && p.z < D) blocked[p.z * W + p.x] = 1;
  }
  for (const h of humanCells(play)) if (h.x >= 0 && h.z >= 0 && h.x < W && h.z < D) blocked[h.z * W + h.x] = 1;
  const lv = shell.levels;
  const free = (x: number, z: number, maxLevel: number): boolean =>
    x >= 0 && z >= 0 && x < W && z < D && !blocked[z * W + x] && lv[z * W + x] <= maxLevel;

  const dist = new Float64Array(N).fill(Infinity);
  const s = room.spawn;
  if (s.x < 0 || s.z < 0 || s.x >= W || s.z >= D || blocked[s.z * W + s.x]) return dist;
  dist[s.z * W + s.x] = 0;
  const heap = new Heap();
  heap.push(0, s.z * W + s.x);
  while (heap.size) {
    const [da, a] = heap.pop();
    if (da > dist[a]) continue;
    const ax = a % W;
    const az = (a - ax) / W;
    const la = lv[a];
    for (let d = 0; d < 8; d++) {
      const bx = ax + DX[d];
      const bz = az + DZ[d];
      const diag = d % 2 === 1;
      if (free(bx, bz, la)) {
        if (!diag || (free(bx, az, la) && free(ax, bz, la))) {
          const c = da + (diag ? STEP_TICKS.trotDiag : STEP_TICKS.trotOrtho);
          const b = bz * W + bx;
          if (c < dist[b]) {
            dist[b] = c;
            heap.push(c, b);
          }
        }
      }
      if (!diag && free(bx, bz, la + 1) && lv[bz * W + bx] === la + 1) {
        const b = bz * W + bx;
        const c = da + JUMP_TICKS;
        if (c < dist[b]) {
          dist[b] = c;
          heap.push(c, b);
        }
      }
    }
  }
  return dist;
}

/**
 * Can the camera (south, looking north and down) see a prop land on floor cell (x, z)? The cell in front of it
 * (z + 1) must not be L2+ furniture: a crash behind the table or under the shelf is invisible in the run and the clip.
 */
export function landingVisible(play: PlayableRoom, x: number, z: number): boolean {
  const { shell } = play;
  if (z + 1 >= shell.depth) return true;
  return shell.levels[(z + 1) * shell.width + x] < 2;
}

/**
 * Cheapest standing cell (trot+jump ticks) from which the prop at (px, pz) can be swatted off its surface; -1 if
 * none. A push away from the camera (north) only counts when its landing cell is visible (landingVisible).
 */
export function wreckTicks(play: PlayableRoom, dist: Float64Array, px: number, pz: number): number {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const lp = shell.levels[pz * W + px];
  let best = Infinity;
  for (const d of ORTHO) {
    const cx = px - DX[d];
    const cz = pz - DZ[d];
    const tx = px + DX[d];
    const tz = pz + DZ[d];
    if (cx < 0 || cz < 0 || cx >= W || cz >= D || tx < 0 || tz < 0 || tx >= W || tz >= D) continue;
    if (shell.levels[cz * W + cx] !== lp || shell.levels[tz * W + tx] >= lp) continue;
    if (DZ[d] < 0 && !landingVisible(play, tx, tz)) continue;
    best = Math.min(best, dist[cz * W + cx]);
  }
  return best === Infinity ? -1 : best;
}

/** Every way to wreck one prop (push, cloth, cable, tall); the cheapest ticks or -1. */
export function wreckTicksFor(play: PlayableRoom, dist: Float64Array, p: PropPlacement): number {
  const { shell, room } = play;
  const W = shell.width;
  const D = shell.depth;
  const inb = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < W && z < D;
  if (!inb(p.x, p.z)) return -1;
  const k = propKind(p.kind);
  let best = Infinity;
  const take = (t: number): void => {
    if (t >= 0 && t < best) best = t;
  };
  if (k?.tall !== undefined) {
    // The tree: swatted from an orthogonal neighbour at its `tall` level (the mantle), never pushed.
    for (const d of ORTHO) {
      const cx = p.x + DX[d];
      const cz = p.z + DZ[d];
      if (inb(cx, cz) && shell.levels[cz * W + cx] === k.tall) take(dist[cz * W + cx]);
    }
    return best === Infinity ? -1 : best;
  }
  take(wreckTicks(play, dist, p.x, p.z));
  if (k?.pull === 'cable') {
    const c = cableCell(p);
    if (inb(c.x, c.z) && shell.levels[c.z * W + c.x] === 0) {
      take(dist[c.z * W + c.x]);
      for (const d of ORTHO) {
        const nx = c.x + DX[d];
        const nz = c.z + DZ[d];
        if (inb(nx, nz) && shell.levels[nz * W + nx] === 0) take(dist[nz * W + nx]);
      }
    }
  }
  // Cloth pull: the prop rides a cloth and sits on its edge row; the cat pulls from just outside, lower down.
  for (const cl of room.props) {
    if (propKind(cl.kind)?.pull !== 'cloth') continue;
    const cw = Math.max(1, cl.w ?? 1);
    const cd = Math.max(1, cl.d ?? 1);
    if (p.x < cl.x || p.z < cl.z || p.x >= cl.x + cw || p.z >= cl.z + cd || p === cl) continue;
    const lc = shell.levels[cl.z * W + cl.x];
    for (const d of ORTHO) {
      const bx = p.x + DX[d];
      const bz = p.z + DZ[d];
      const inside = bx >= cl.x && bz >= cl.z && bx < cl.x + cw && bz < cl.z + cd;
      if (inside || !inb(bx, bz)) continue;
      if (shell.levels[bz * W + bx] >= lc) continue;
      if (DZ[d] < 0 && !landingVisible(play, bx, bz)) continue;
      // standing cells: any cell just outside this edge of the cloth, lower than the cloth, one level below at most
      for (let i = 0; i < (d === 0 || d === 4 ? cw : cd); i++) {
        const ex = d === 0 || d === 4 ? cl.x + i : d === 2 ? cl.x + cw : cl.x - 1;
        const ez = d === 0 ? cl.z - 1 : d === 4 ? cl.z + cd : cl.z + i;
        if (!inb(ex, ez)) continue;
        const le = shell.levels[ez * W + ex];
        if (le < lc && le >= lc - 1) take(dist[ez * W + ex]);
      }
    }
  }
  return best === Infinity ? -1 : best;
}

/**
 * Spawn readability (GDD 3.1 match-cut pose, FTUE): the two cells between the spawn and the camera (z + 1, z + 2,
 * where inside the room) are prop-free floor, and no L2+ furniture stands diagonally or directly in front of it,
 * so the cat is never hidden behind a sofa or a table at the start. Returns the reason, or '' when fine.
 */
export function spawnProblem(play: PlayableRoom, x: number, z: number, props = play.room.props): string {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  for (const dz of [1, 2]) {
    const cz = z + dz;
    if (cz >= D) break;
    if (shell.levels[cz * W + x] !== 0) return `camera-side cell ${x},${cz} is not floor`;
    if (props.some((p) => p.x === x && p.z === cz)) return `camera-side cell ${x},${cz} holds a prop`;
  }
  if (z + 1 < D)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx;
      if (cx >= 0 && cx < W && shell.levels[(z + 1) * W + cx] >= 2) return `L2 furniture at ${cx},${z + 1} hides the spawn`;
    }
  return '';
}

/** Must-Wreck targets (or a landing cell) a human can see on some look: at least this many of 3 (tension). */
export const VISIBLE_TARGETS_MIN = 2;

/**
 * Can a human see this target, or a cell it lands on when swatted off an edge, on any of their look facings
 * (cone with occlusion, or the near ring)? Uses the sim's own sight test; both humans in a boss room.
 */
export function targetVisible(play: PlayableRoom, px: number, pz: number): boolean {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const grid = {
    w: W,
    d: D,
    level: Uint8Array.from(shell.levels),
    occludes: Uint8Array.from(shell.occludes),
    propAt: new Int16Array(W * D).fill(-1),
  } as GridState;
  const s = { grid } as SimState;
  const lp = shell.levels[pz * W + px];
  const cells: [number, number, number][] = [[px, pz, lp]];
  for (const d of ORTHO) {
    const tx = px + DX[d];
    const tz = pz + DZ[d];
    if (tx < 0 || tz < 0 || tx >= W || tz >= D) continue;
    const lt = shell.levels[tz * W + tx];
    if (lt < lp) cells.push([tx, tz, lt]);
  }
  for (const hc of humanCells(play)) {
    const h = { x: hc.x, z: hc.z } as HumanState;
    for (const f of hc.routine.lookFacings) for (const [x, z, l] of cells) if (looksAt(s, h, f, x, z, l)) return true;
  }
  return false;
}

/** The accomplice's wish can be granted: wreck it, carry it (grabbable) or sit in it (enterable), from a reachable cell. */
export function wishReachable(play: PlayableRoom, dist: Float64Array, p: PropPlacement): boolean {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const k = propKind(p.kind);
  if (!k || p.x < 0 || p.z < 0 || p.x >= W || p.z >= D) return false;
  if (k.grabbable || k.enterable) {
    if (dist[p.z * W + p.x] !== Infinity) return true;
    const lp = shell.levels[p.z * W + p.x];
    for (let d = 0; d < 8; d++) {
      const nx = p.x + DX[d];
      const nz = p.z + DZ[d];
      if (nx >= 0 && nz >= 0 && nx < W && nz < D && shell.levels[nz * W + nx] === lp && dist[nz * W + nx] !== Infinity) return true;
    }
    return false;
  }
  return wreckTicksFor(play, dist, p) >= 0;
}

export function validate(play: PlayableRoom): ValidationReport {
  const errors: string[] = [];
  const { room, shell, routine } = play;
  const W = shell.width;
  const D = shell.depth;
  const N = W * D;
  const inb = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < W && z < D;
  const lvAt = (x: number, z: number): number => shell.levels[z * W + x];
  const legacy = isLegacyRoom(room);
  const boss = room.width === 14 && room.depth === 12;

  if (!ROOM_SIZES.some(([w, d]) => w === W && d === D)) errors.push(`shell size ${W}x${D} is not 12x10 or 14x12`);
  if (shell.levels.length !== N) errors.push(`shell levels length ${shell.levels.length} != ${N}`);
  if (shell.occludes.length !== N) errors.push(`shell occludes length ${shell.occludes.length} != ${N}`);
  if (room.width !== W || room.depth !== D) errors.push(`room size ${room.width}x${room.depth} != shell ${W}x${D}`);
  if (errors.length) return { ok: false, errors, firstTargetTicks: -1 };

  // ----- shell -----
  let occluders = 0;
  for (let i = 0; i < N; i++) {
    if (shell.occludes[i]) {
      occluders++;
      if (shell.levels[i] < 2) errors.push(`occluding cell ${i} is below L2`);
    }
  }
  if (occluders === 0) errors.push('no occluders');
  for (const f of shell.furniture) {
    if (f.x < 0 || f.z < 0 || f.x + f.w > W || f.z + f.d > D) errors.push(`furniture ${f.type} at ${f.x},${f.z} leaves the grid`);
    else if (!DECOR_FURNITURE.includes(f.type))
      for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) if (lvAt(x, z) !== f.level) errors.push(`furniture ${f.type} at ${x},${z} is L${f.level}, heightmap L${lvAt(x, z)}`);
  }

  const humans = humanCells(play);
  for (const h of humans) if (!inb(h.x, h.z) || lvAt(h.x, h.z) > 1) errors.push(`human spot ${h.x},${h.z} must be a floor or seat cell`);
  if (room.routine2 !== undefined && !shell.humanSpot2) errors.push('routine2 set but the shell has no humanSpot2');
  if (room.routine2 === undefined && shell.humanSpot2) errors.push('shell has a second human spot but the room has no routine2');
  if (room.routine2 !== undefined && !play.routine2) errors.push('routine2 did not resolve');
  if (humans.length === 2 && humans[0].x === humans[1].x && humans[0].z === humans[1].z) errors.push('both humans on one cell');
  const isHuman = (x: number, z: number): boolean => humans.some((h) => h.x === x && h.z === z);
  const bed = shell.catBed;
  if (!inb(bed.x, bed.z) || lvAt(bed.x, bed.z) !== 0) errors.push('cat bed must be a floor cell');
  const sp = room.spawn;
  if (!inb(sp.x, sp.z)) errors.push('spawn out of bounds');
  else if (lvAt(sp.x, sp.z) !== 0) errors.push('spawn must be on the floor');
  if (isHuman(sp.x, sp.z)) errors.push('spawn on the human');
  if (inb(sp.x, sp.z)) {
    const why = spawnProblem(play, sp.x, sp.z);
    if (why) errors.push(`spawn ${sp.x},${sp.z}: ${why}`);
  }
  if (shell.mirror && !inb(shell.mirror.x, shell.mirror.z)) errors.push('mirror outside the grid');
  if (shell.webcam && !inb(shell.webcam.x, shell.webcam.z)) errors.push('webcam outside the grid');
  for (const r of [routine, play.routine2]) {
    if (!r) continue;
    if (r.mirror && !shell.mirror) errors.push(`${r.name} needs a mirror the shell does not have`);
    // review round 1: an on-camera routine without a webcam is fine (the WFH Worker in any Room Maker room): the sim's
    // webcamOn() needs the shell's webcam, so the +50 % bonus simply never applies there
  }
  const furnitureAt = (x: number, z: number): boolean =>
    shell.furniture.some((f) => f.type !== 'rug' && f.type !== 'window' && f.type !== 'door' && f.type !== 'arch' && x >= f.x && z >= f.z && x < f.x + f.w && z < f.z + f.d);
  if (shell.roombaLoop) {
    const L = shell.roombaLoop;
    if (L.length < 4) errors.push('roomba loop shorter than 4 cells');
    const seenLoop = new Set<number>();
    L.forEach((c, i) => {
      const n = L[(i + 1) % L.length];
      if (!inb(c.x, c.z)) errors.push(`roomba loop cell ${c.x},${c.z} outside the grid`);
      else {
        if (lvAt(c.x, c.z) !== 0) errors.push(`roomba loop cell ${c.x},${c.z} is not floor`);
        if (furnitureAt(c.x, c.z)) errors.push(`roomba loop cell ${c.x},${c.z} has furniture`);
        if (isHuman(c.x, c.z) || (c.x === shell.humanSpot.x && c.z === shell.humanSpot.z)) errors.push(`roomba loop cell ${c.x},${c.z} is a human spot`);
      }
      const key = c.z * W + c.x;
      if (seenLoop.has(key)) errors.push(`roomba loop visits ${c.x},${c.z} twice`);
      seenLoop.add(key);
      const cheb = Math.max(Math.abs(n.x - c.x), Math.abs(n.z - c.z));
      if (cheb !== 1) errors.push(`roomba loop is not closed and 8-way adjacent at ${c.x},${c.z} -> ${n.x},${n.z}`);
    });
  }
  if (shell.spectatorSlots) {
    const ss = shell.spectatorSlots;
    if (ss.length < SPECTATORS_MIN || ss.length > SPECTATORS_MAX) errors.push(`${ss.length} spectator slots (need ${SPECTATORS_MIN}-${SPECTATORS_MAX})`);
    const seenSpec = new Set<number>();
    for (const s of ss) {
      if (!inb(s.x, s.z)) {
        errors.push(`spectator slot ${s.x},${s.z} outside the grid`);
        continue;
      }
      const key = s.z * W + s.x;
      if (seenSpec.has(key)) errors.push(`spectator slot ${s.x},${s.z} twice`);
      seenSpec.add(key);
      const l = lvAt(s.x, s.z);
      if (s.level < l) errors.push(`spectator slot ${s.x},${s.z} below the surface`);
      else if (s.level > l && s.z !== 0 && s.x !== 0) errors.push(`spectator slot ${s.x},${s.z} floats (not on a surface or a wall shelf)`);
      else if (s.level === l && room.props.some((p) => p.x === s.x && p.z === s.z && propKind(p.kind)?.pull !== 'cloth')) errors.push(`spectator slot ${s.x},${s.z} holds a prop`);
      if (isHuman(s.x, s.z) && s.level === l) errors.push(`spectator slot ${s.x},${s.z} on a human`);
    }
  }
  const acc = room.accomplice;
  const accSpot = acc && acc.x !== undefined && acc.z !== undefined ? { x: acc.x, z: acc.z, level: acc.level ?? lvAt(acc.x, acc.z) } : shell.accompliceSpot;
  if (accSpot) {
    if (!inb(accSpot.x, accSpot.z)) errors.push('accomplice spot outside the grid');
    else {
      const l = lvAt(accSpot.x, accSpot.z);
      if (accSpot.level < l || (accSpot.level > l && accSpot.z !== 0 && accSpot.x !== 0)) errors.push(`accomplice spot ${accSpot.x},${accSpot.z} is not on a surface`);
      if (accSpot.level === l && room.props.some((p) => p.x === accSpot.x && p.z === accSpot.z && propKind(p.kind)?.blocks)) errors.push('accomplice spot holds a prop');
      if (isHuman(accSpot.x, accSpot.z)) errors.push('accomplice spot on a human');
    }
  }
  if (shell.fridgeWall && (!inb(shell.fridgeWall.x, shell.fridgeWall.z) || !inb(shell.fridgeWall.x + shell.fridgeWall.w - 1, shell.fridgeWall.z))) errors.push('fridge wall outside the grid');

  // ----- props -----
  const n = room.props.length;
  const maxProps = isMakerRoom(room) ? (boss ? BOSS_PROP_MAX : MAKER_PROP_MAX) : boss ? BOSS_PROP_MAX : PROP_MAX;
  if (n < PROP_MIN || n > maxProps) errors.push(`prop count ${n} outside ${PROP_MIN}-${maxProps}`);
  const seen = new Set<number>();
  const clothCells = new Set<number>();
  let targets = 0;
  let budget = 0;
  room.props.forEach((p, i) => {
    const k = propKind(p.kind);
    if (!k) errors.push(`prop ${i}: unknown kind ${p.kind}`);
    if (!inb(p.x, p.z)) {
      errors.push(`prop ${i}: out of bounds`);
      return;
    }
    budget += k?.base ?? 0;
    const c = p.z * W + p.x;
    const name = k?.id ?? String(p.kind);
    if (p.level !== lvAt(p.x, p.z)) errors.push(`prop ${i} (${name}) level ${p.level} != shell level ${lvAt(p.x, p.z)} at ${p.x},${p.z}`);
    if (k?.pull === 'cloth') {
      const cw = p.w ?? 1;
      const cd = p.d ?? 1;
      if (cw < 1 || cd < 1) errors.push(`prop ${i}: cloth extent ${cw}x${cd}`);
      for (let z = p.z; z < p.z + cd; z++)
        for (let x = p.x; x < p.x + cw; x++) {
          if (!inb(x, z)) {
            errors.push(`prop ${i}: cloth leaves the grid at ${x},${z}`);
            continue;
          }
          if (lvAt(x, z) !== p.level) errors.push(`prop ${i}: cloth spans two surfaces at ${x},${z}`);
          if (clothCells.has(z * W + x)) errors.push(`prop ${i}: cloths overlap at ${x},${z}`);
          clothCells.add(z * W + x);
        }
    } else {
      if (p.w !== undefined || p.d !== undefined) errors.push(`prop ${i} (${name}): only a cloth has an extent`);
      if (seen.has(c)) errors.push(`prop ${i}: cell ${p.x},${p.z} already holds a prop`);
      seen.add(c);
    }
    if (isHuman(p.x, p.z)) errors.push(`prop ${i}: on the human`);
    if (p.x === sp.x && p.z === sp.z) errors.push(`prop ${i}: on the spawn cell`);
    if (p.x === bed.x && p.z === bed.z) errors.push(`prop ${i}: on the cat bed`);
    if (k?.pull === 'cable' || p.cable) {
      if (k?.pull !== 'cable') errors.push(`prop ${i} (${name}): only a lamp has a cable`);
      const cc = cableCell(p);
      if (!inb(cc.x, cc.z) || lvAt(cc.x, cc.z) !== 0) errors.push(`prop ${i} (${name}): cable cell ${cc.x},${cc.z} is not floor`);
      else if (Math.abs(cc.x - p.x) + Math.abs(cc.z - p.z) !== 1) errors.push(`prop ${i} (${name}): cable cell ${cc.x},${cc.z} is not next to the lamp`);
      else if (room.props.some((q) => q !== p && q.x === cc.x && q.z === cc.z && propKind(q.kind)?.blocks)) errors.push(`prop ${i} (${name}): a prop sits on the cable`);
    }
    if (k?.tall !== undefined) {
      if (p.level !== 0) errors.push(`prop ${i} (${name}): a tall prop stands on the floor`);
      if (!ORTHO.some((d) => inb(p.x + DX[d], p.z + DZ[d]) && lvAt(p.x + DX[d], p.z + DZ[d]) === k.tall)) errors.push(`prop ${i} (${name}): no L${k.tall} cell beside it to swat from`);
    }
    if (k?.enterable && p.level !== 0) errors.push(`prop ${i} (${name}): enterable props stand on the floor`);
    if (k?.sponsor && room.sponsor?.propIndex !== i) errors.push(`prop ${i}: sponsor product without RoomDef.sponsor`);
    if (p.target) {
      targets++;
      if (k && (k.grabbable || k.base <= 0 || k.enterable || k.actor || (k.inert && !k.pull))) errors.push(`prop ${i}: ${k.id} cannot be a target`);
    }
  });
  if (targets !== TARGETS_PER_ROOM) errors.push(`${targets} targets, need ${TARGETS_PER_ROOM}`);
  if (!legacy) {
    const cap = isMakerRoom(room) ? MAKER_BUDGET : boss ? BOSS_BUDGET : DAILY_BUDGET;
    if (budget > cap) errors.push(`chaos budget ${budget} > ${cap}`);
  }
  if (room.sponsor) {
    const sp2 = room.props[room.sponsor.propIndex];
    if (!sp2 || !propKind(sp2.kind)?.sponsor) errors.push('sponsor propIndex does not point at a sponsor product');
  }
  if (!legacy && shell.roombaLoop) {
    const loopSet = new Set(shell.roombaLoop.map((c) => c.z * W + c.x));
    for (const p of room.props) {
      const k = propKind(p.kind);
      if (k?.actor === 'roomba' && !loopSet.has(p.z * W + p.x)) errors.push(`the Roomba at ${p.x},${p.z} is not on its loop`);
      else if (!k?.actor && k?.blocks && loopSet.has(p.z * W + p.x)) errors.push(`prop ${k.id} at ${p.x},${p.z} blocks the Roomba loop`);
    }
  }

  // ----- routines -----
  const ticks = room.ticks;
  if (!legacy && ticks !== (boss ? BOSS_TICKS : RUN_TICKS)) errors.push(`run length ${ticks} ticks, expected ${boss ? BOSS_TICKS : RUN_TICKS}`);
  for (const r of [routine, play.routine2]) {
    if (!r) continue;
    if (r.busy[0] > r.busy[1] || r.look[0] > r.look[1] || r.telegraph[0] > r.telegraph[1]) errors.push(`${r.name}: routine range min > max`);
    if (!r.lookFacings.length) errors.push(`${r.name}: routine has no look facings`);
    if (r.eventTick <= 0 || r.eventTick >= ticks) errors.push(`${r.name}: event tick ${r.eventTick} outside the run`);
  }

  // ----- reachability -----
  const dist = travelTicks(play);
  let first = Infinity;
  room.props.forEach((p, i) => {
    if (!p.target || !inb(p.x, p.z)) return;
    const t = wreckTicksFor(play, dist, p);
    if (t < 0) errors.push(`target ${i} (${propKind(p.kind)?.id ?? p.kind}) at ${p.x},${p.z} cannot be wrecked from a reachable cell`);
    else first = Math.min(first, t);
  });
  if (acc) {
    const w = room.props[acc.wishPropIndex];
    if (!w) errors.push(`accomplice wish index ${acc.wishPropIndex} has no prop`);
    else {
      if (w.target) errors.push('the accomplice wish is a Must-Wreck target');
      if (!wishReachable(play, dist, w)) errors.push(`accomplice wish (${propKind(w.kind)?.id ?? w.kind}) at ${w.x},${w.z} cannot be granted`);
    }
  }
  if (play.mode === 'ftue') {
    // SIM_VERSION 4 (round 3 QA): a first-timer must see the step up. Every L2+ Must-Wreck surface needs an
    // unblocked L1 seat orthogonally beside it; a floor-to-L2 jump does not exist (the sim says "cantReach").
    room.props.forEach((p, i) => {
      if (!p.target || !inb(p.x, p.z) || lvAt(p.x, p.z) < 2) return;
      if (!seatBesideSurface(play, p.x, p.z)) errors.push(`first heist: target ${i} (${propKind(p.kind)?.id ?? p.kind}) at ${p.x},${p.z} needs a floor-to-L2 jump (no L1 seat beside its surface)`);
    });
  }
  const firstTargetTicks = first === Infinity ? -1 : first;
  const tgts = room.props.filter((p) => p.target && inb(p.x, p.z));
  const visible = tgts.filter((p) => targetVisible(play, p.x, p.z)).length;
  if (tgts.length && visible < Math.min(VISIBLE_TARGETS_MIN, tgts.length))
    errors.push(`only ${visible} of ${tgts.length} targets are ever in the human's sight (need ${VISIBLE_TARGETS_MIN})`);
  if (firstTargetTicks > FIRST_TARGET_MAX_TICKS) errors.push(`first target takes ${firstTargetTicks} ticks (> ${FIRST_TARGET_MAX_TICKS})`);
  if (play.mode === 'ftue' && firstTargetTicks > FTUE_FIRST_TARGET_MAX_TICKS)
    errors.push(`first heist: first target takes ${firstTargetTicks} ticks (> ${FTUE_FIRST_TARGET_MAX_TICKS})`);

  if (!legacy && !isMakerRoom(room) && play.mode !== 'ftue') for (const e of feelProblems(play, dist)) errors.push(e);

  return { ok: errors.length === 0, errors, firstTargetTicks };
}

/** Round 2 game feel (SIM_VERSION 7 content): a fragile prop this close to the spawn (Chebyshev cells)... */
export const STARTER_MAX_CELLS = 3;
/** ...and wreckable this quickly from it (5 s): the first crash comes in the first seconds. */
export const STARTER_MAX_TICKS = 150;
/** Webcam rooms (Thursday): this share (percent) of the raised props crash in the webcam's view... */
export const WEBCAM_PROPS_PCT = 30;
/** Rooms with a Roomba: this many raised props within 1 cell of its road (framing it needs a mess nearby). */
export const ROOMBA_ROAD_PROPS = 4;

/** Raised and fallable: a prop on a surface that scores by falling (not decor, not a grabbable, not a cloth). */
function raised(p: PropPlacement, lv: number): boolean {
  const k = propKind(p.kind);
  return !!k && lv >= 1 && k.base > 0 && !k.grabbable && !k.pull && !k.actor && !k.enterable && k.tall === undefined;
}

/**
 * The round 2 (QA) daily-room rules: a fragile starter prop near the spawn, a webcam that films a real share of the
 * room and a Must-Wreck target on Thursdays, and a mess along the Roomba's road. Daily and generated rooms only.
 */
export function feelProblems(play: PlayableRoom, dist: Float64Array = travelTicks(play)): string[] {
  const { room, shell } = play;
  const W = shell.width;
  const out: string[] = [];
  const lv = (x: number, z: number): number => shell.levels[z * W + x] ?? 0;
  // starter
  const starter = room.props.some((p) => {
    const k = propKind(p.kind);
    if (!k || !k.fragile || k.grabbable || k.onLand === 'land') return false;
    if (Math.max(Math.abs(p.x - room.spawn.x), Math.abs(p.z - room.spawn.z)) > STARTER_MAX_CELLS) return false;
    const t = wreckTicksFor(play, dist, p);
    return t >= 0 && t <= STARTER_MAX_TICKS;
  });
  if (!starter) out.push(`no starter: a fragile prop within ${STARTER_MAX_CELLS} cells of the spawn wreckable in ${STARTER_MAX_TICKS} ticks`);
  // webcam
  const cam = shell.webcam;
  if (cam && (play.routine.onCamera || play.routine2?.onCamera)) {
    const s = sightState(play);
    const sees = (x: number, z: number, l: number): boolean => shortConeSees(s, cam.x, cam.z, cam.facing, x, z, l, Math.max(2, shell.levels[cam.z * W + cam.x] ?? 0));
    const crashSeen = (p: PropPlacement): boolean => {
      if (sees(p.x, p.z, lv(p.x, p.z))) return true;
      for (const d of ORTHO) {
        const nx = p.x + DX[d];
        const nz = p.z + DZ[d];
        if (nx >= 0 && nz >= 0 && nx < W && nz < shell.depth && lv(nx, nz) < lv(p.x, p.z) && sees(nx, nz, lv(nx, nz))) return true;
      }
      return false;
    };
    const up = room.props.filter((p) => raised(p, lv(p.x, p.z)));
    const seen = up.filter(crashSeen).length;
    if (up.length && seen * 100 < up.length * WEBCAM_PROPS_PCT) out.push(`webcam sees ${seen} of ${up.length} raised props (need ${WEBCAM_PROPS_PCT} %)`);
    if (!room.props.some((p) => p.target && crashSeen(p))) out.push('webcam sees no Must-Wreck target');
  }
  // Roomba road
  const loop = shell.roombaLoop;
  if (loop?.length && room.props.some((p) => propKind(p.kind)?.actor === 'roomba')) {
    const near = room.props.filter((p) => raised(p, lv(p.x, p.z)) && loop.some((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.z - p.z)) <= 1)).length;
    if (near < ROOMBA_ROAD_PROPS) out.push(`only ${near} raised props within 1 cell of the Roomba road (need ${ROOMBA_ROAD_PROPS})`);
  }
  return out;
}

/** QA round 3: a cat that never freezes is caught before this tick (30 s). */
export const NO_FREEZE_CAUGHT_BY_TICK = 900;
/** QA round 3: the careful planner bot spends at most this share of the run (percent) holding still. */
export const WAITING_MAX_PCT = 40;

/**
 * QA round 3 feel rules that need the sim's planner bot (sim/planner.ts), so they are opt-in: tools/validate.mjs and
 * src/sim/balance.test.ts run them; `validate` (Room Maker, runtime) does not. A cat that never freezes must be caught
 * before NO_FREEZE_CAUGHT_BY_TICK (the human matters), and the careful bot must not wait more than WAITING_MAX_PCT.
 */
export function botProblems(play: PlayableRoom): string[] {
  if (play.mode === 'ftue') return [];
  const out: string[] = [];
  const greedy = plannerRun(play, { freeze: false });
  if (greedy.caughtTick < 0 || greedy.caughtTick > NO_FREEZE_CAUGHT_BY_TICK)
    out.push(`a cat that never freezes is ${greedy.caughtTick < 0 ? 'never caught' : `caught only at ${Math.round(greedy.caughtTick / TICK_HZ)} s`} (need < ${NO_FREEZE_CAUGHT_BY_TICK / TICK_HZ} s)`);
  const careful = plannerRun(play, { react: 6 });
  if (careful.waitPct > WAITING_MAX_PCT) out.push(`waiting ${careful.waitPct} % of the run (max ${WAITING_MAX_PCT} %)`);
  return out;
}

/** A sim state with only the grid (lines of sight for the cones). */
function sightState(play: PlayableRoom): SimState {
  const { shell } = play;
  const n = shell.width * shell.depth;
  const grid = { w: shell.width, d: shell.depth, level: Uint8Array.from(shell.levels), occludes: Uint8Array.from(shell.occludes), propAt: new Int16Array(n).fill(-1) } as GridState;
  return { grid } as SimState;
}

/**
 * Is there an L1 cell, free of blocking props and humans, orthogonally next to the connected surface (same
 * level, 4-connected) that holds (px, pz)? (An L3 above is reached from this surface, so it never counts.)
 */
export function seatBesideSurface(play: PlayableRoom, px: number, pz: number): boolean {
  const { room, shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const lp = shell.levels[pz * W + px];
  const blocked = new Set<number>();
  for (const p of room.props) if (propKind(p.kind)?.blocks) blocked.add(p.z * W + p.x);
  for (const h of humanCells(play)) blocked.add(h.z * W + h.x);
  const seen = new Uint8Array(W * D);
  const stack = [pz * W + px];
  seen[pz * W + px] = 1;
  while (stack.length) {
    const a = stack.pop()!;
    const ax = a % W;
    const az = (a - ax) / W;
    for (const d of ORTHO) {
      const bx = ax + DX[d];
      const bz = az + DZ[d];
      if (bx < 0 || bz < 0 || bx >= W || bz >= D) continue;
      const b = bz * W + bx;
      const lb = shell.levels[b];
      if (lb === lp - 1 && !blocked.has(b)) return true;
      if (lb === lp && !seen[b]) {
        seen[b] = 1;
        stack.push(b);
      }
    }
  }
  return false;
}

/**
 * A "run, hop, swat" line for the first heist: from (x, z) one floor step and one +1 hop in the same direction
 * land on the standing cell, with a Must-Wreck target straight ahead that a swat pushes off its edge (and, going
 * north, into sight). The cat arrives facing the target, so SWAT works with no turn. Returns the wreck ticks or -1.
 */
function straightLineTicks(play: PlayableRoom, x: number, z: number): number {
  const { room, shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const inb = (cx: number, cz: number): boolean => cx >= 0 && cz >= 0 && cx < W && cz < D;
  const lv = (cx: number, cz: number): number => shell.levels[cz * W + cx];
  const humans = humanCells(play);
  const blocks = (cx: number, cz: number): boolean =>
    room.props.some((p) => p.x === cx && p.z === cz && !!propKind(p.kind)?.blocks) || humans.some((h) => h.x === cx && h.z === cz);
  for (const d of ORTHO) {
    const ax = x + DX[d];
    const az = z + DZ[d];
    const cx = ax + DX[d];
    const cz = az + DZ[d];
    const tx = cx + DX[d];
    const tz = cz + DZ[d];
    const bx = tx + DX[d];
    const bz = tz + DZ[d];
    if (!inb(ax, az) || !inb(cx, cz) || !inb(tx, tz) || !inb(bx, bz)) continue;
    if (lv(ax, az) !== 0 || blocks(ax, az) || lv(cx, cz) !== 1 || blocks(cx, cz)) continue;
    if (lv(tx, tz) !== 1 || lv(bx, bz) >= 1) continue;
    if (DZ[d] < 0 && !landingVisible(play, bx, bz)) continue;
    if (!room.props.some((p) => p.target && p.x === tx && p.z === tz)) continue;
    return STEP_TICKS.trotOrtho + JUMP_TICKS;
  }
  return -1;
}

/**
 * FTUE spawn (first heist): a floor cell kept 3+ cells from every human (outside the near ring), 2+ cells from any
 * grabbable (SWAT must read SWAT at spawn), off the cat bed, and readable (spawnProblem). Preferred: a straight
 * "run, hop, swat" line onto a Must-Wreck target (straightLineTicks); else the cell from which a target is quickest
 * to wreck. Falls back to the room's own spawn. Deterministic: ties keep the lowest cell index.
 */
export function ftueSpawn(play: PlayableRoom): { x: number; z: number } {
  // Review round 1: the first clip should show the hook prop. When the room has a wine-glass target that can be
  // wrecked within FTUE_GLASS_MAX_TICKS (the 2 s first-crash promise), the spawn is picked by that glass alone (it
  // becomes the target nearest the spawn); otherwise by the quickest target.
  if (play.room.props.some((p) => p.target && p.kind === WINE_GLASS_KIND)) {
    const glassOnly: PlayableRoom = {
      ...play,
      room: { ...play.room, props: play.room.props.map((p) => (p.target && p.kind !== WINE_GLASS_KIND ? { ...p, target: false } : p)) },
    };
    const g = ftueSpawnSearch(glassOnly);
    if (g && g.ticks <= FTUE_GLASS_MAX_TICKS) return { x: g.x, z: g.z };
  }
  const q = ftueSpawnSearch(play);
  return q ? { x: q.x, z: q.z } : { x: play.room.spawn.x, z: play.room.spawn.z };
}

/** The wine glass wins the first-heist spawn only when it can crash within 2 s from there. */
export const FTUE_GLASS_MAX_TICKS = 60;

const WINE_GLASS_KIND = 1;

function ftueSpawnSearch(play: PlayableRoom): { x: number; z: number; ticks: number } | null {
  const { room, shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const humans = humanCells(play);
  const bed = shell.catBed;
  const occupied = new Set(room.props.filter((p) => propKind(p.kind)?.pull !== 'cloth').map((p) => p.z * W + p.x));
  const grabs = room.props.filter((p) => propKind(p.kind)?.grabbable);
  let best = room.spawn;
  let bestT = Infinity;
  let bestLine = false;
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (shell.levels[z * W + x] !== 0 || occupied.has(z * W + x)) continue;
      if (humans.some((h) => Math.max(Math.abs(x - h.x), Math.abs(z - h.z)) < 3)) continue;
      if (x === bed.x && z === bed.z) continue;
      if (grabs.some((g) => Math.max(Math.abs(g.x - x), Math.abs(g.z - z)) < 2)) continue;
      if (spawnProblem(play, x, z)) continue;
      const line = straightLineTicks(play, x, z);
      if (bestLine && line < 0) continue;
      const trial: PlayableRoom = { ...play, room: { ...room, spawn: { x, z } } };
      const dist = travelTicks(trial);
      let t = Infinity;
      for (const p of room.props) {
        if (!p.target) continue;
        const w = wreckTicksFor(trial, dist, p);
        if (w >= 0 && w < t) t = w;
      }
      if (line >= 0) t = Math.min(t, line);
      if (t === Infinity) continue;
      if ((line >= 0 && !bestLine) || t < bestT) {
        bestT = t;
        best = { x, z };
        bestLine = line >= 0;
      }
    }
  return bestT === Infinity ? null : { x: best.x, z: best.z, ticks: bestT };
}

/** Summed base points of every prop (the chaos budget). */
export function chaosBudget(room: RoomDef): number {
  let b = 0;
  for (const p of room.props) b += propKind(p.kind)?.base ?? 0;
  return b;
}

/** Level of a cell, or -1 outside. */
export function levelOf(play: PlayableRoom, x: number, z: number): Level | -1 {
  const { shell } = play;
  if (x < 0 || z < 0 || x >= shell.width || z >= shell.depth) return -1;
  return shell.levels[z * shell.width + x];
}
