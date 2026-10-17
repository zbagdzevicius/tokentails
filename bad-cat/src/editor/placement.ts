/**
 * Room Maker placement (GDD 6.4 step 2): place, move, rotate, delete, cloth resize, targets, spawn. Pure: every
 * function returns a new RoomDef and never mutates its input. A prop always sits on the shell's surface level of its
 * cell (the highest surface, which is what the heightmap stores), so "snap to the highest surface" is a lookup.
 */
import { BOSS_TICKS, ROOM_EVENT_NAMES, RUN_TICKS, propKind, type Level, type PropKindDef, type PropPlacement, type RoomDef, type RoutineDef, type ShellDef } from '../types';
import { MAKER_TARGETS } from './budget';

export const DRAFT_ID = 'ugc-draft';
/** Cloth extents the editor allows (codec v2 holds 1..8). */
export const CLOTH_MIN = 1;
export const CLOTH_MAX = 6;

/** rot -> offset: 0 north, 1 east, 2 south, 3 west (same as content's cable rule). */
const ROT_DX = [0, 1, 0, -1];
const ROT_DZ = [-1, 0, 1, 0];

export interface EditResult {
  ok: boolean;
  room: RoomDef;
  /** Index of the placed / moved / rotated prop. */
  index?: number;
  /** Friendly reason when !ok. */
  reason?: string;
}

const fail = (room: RoomDef, reason: string): EditResult => ({ ok: false, room, reason });

export function inGrid(shell: ShellDef, x: number, z: number): boolean {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < shell.width && z < shell.depth;
}

/** Top surface level of a cell (the heightmap holds the highest walkable surface). */
export function surfaceLevel(shell: ShellDef, x: number, z: number): Level {
  return shell.levels[z * shell.width + x];
}

/** Cell index z * width + x. */
export function cellOf(shell: ShellDef, x: number, z: number): number {
  return z * shell.width + x;
}

function isHumanCell(shell: ShellDef, x: number, z: number): boolean {
  return (shell.humanSpot.x === x && shell.humanSpot.z === z) || (!!shell.humanSpot2 && shell.humanSpot2.x === x && shell.humanSpot2.z === z);
}

function onRoombaLoop(shell: ShellDef, x: number, z: number): boolean {
  return !!shell.roombaLoop?.some((c) => c.x === x && c.z === z);
}

/** Floor cell a lamp's cable hangs on (explicit `cable`, else the neighbour in the `rot` direction). */
export function cableCellOf(p: Pick<PropPlacement, 'x' | 'z' | 'rot' | 'cable'>): { x: number; z: number } {
  if (p.cable) return { x: p.cable.x, z: p.cable.z };
  return { x: p.x + ROT_DX[p.rot & 3], z: p.z + ROT_DZ[p.rot & 3] };
}

function isCloth(k: PropKindDef | undefined): boolean {
  return k?.pull === 'cloth';
}

/** Cells a prop covers (a cloth covers w x d, everything else its own cell). */
export function coveredCells(p: PropPlacement): { x: number; z: number }[] {
  if (!isCloth(propKind(p.kind))) return [{ x: p.x, z: p.z }];
  const out: { x: number; z: number }[] = [];
  for (let z = p.z; z < p.z + (p.d ?? 1); z++) for (let x = p.x; x < p.x + (p.w ?? 1); x++) out.push({ x, z });
  return out;
}

/**
 * The prop a tap on (x, z) means: a real prop on that cell first, else a cloth covering it. -1 when none.
 */
export function propAt(room: RoomDef, x: number, z: number): number {
  let cloth = -1;
  for (let i = room.props.length - 1; i >= 0; i--) {
    const p = room.props[i];
    const k = propKind(p.kind);
    if (isCloth(k)) {
      if (cloth < 0 && x >= p.x && z >= p.z && x < p.x + (p.w ?? 1) && z < p.z + (p.d ?? 1)) cloth = i;
    } else if (p.x === x && p.z === z) return i;
  }
  return cloth;
}

/** Index of a non-cloth prop on (x, z), skipping `ignore`; -1 when free. */
function solidAt(room: RoomDef, x: number, z: number, ignore = -1): number {
  for (let i = 0; i < room.props.length; i++) {
    if (i === ignore) continue;
    const p = room.props[i];
    if (!isCloth(propKind(p.kind)) && p.x === x && p.z === z) return i;
  }
  return -1;
}

/**
 * Why a cell is off limits for a kind, regardless of what else sits there (null = fine). These mirror the content
 * validator so a placed prop never fails the publish check for its cell alone.
 */
export function reservedReason(room: RoomDef, shell: ShellDef, x: number, z: number, kind: number, ignore = -1): string | null {
  if (!inGrid(shell, x, z)) return 'Outside the room. Nice try.';
  const k = propKind(kind);
  if (!k) return 'Unknown thing.';
  if (isHumanCell(shell, x, z)) return "That's the human's spot. Rude.";
  if (room.spawn.x === x && room.spawn.z === z) return 'Your cat starts there. Move the paw first.';
  if (shell.catBed.x === x && shell.catBed.z === z) return 'The cat bed. Nobody uses it, but still.';
  if (room.spawn.x === x && (z === room.spawn.z + 1 || z === room.spawn.z + 2)) return 'Keep the floor in front of your cat clear: hero shot.';
  const lv = surfaceLevel(shell, x, z);
  if (!isCloth(k)) {
    if (shell.spectatorSlots?.some((s) => s.x === x && s.z === z && s.level === lv)) return 'Reserved for a fan cat in the audience.';
    if (k.blocks && shell.accompliceSpot && shell.accompliceSpot.x === x && shell.accompliceSpot.z === z && shell.accompliceSpot.level === lv)
      return 'A Pink Paw cat naps there.';
    if (k.blocks && onRoombaLoop(shell, x, z)) return "That's the Roomba's road.";
    if (k.blocks)
      for (let i = 0; i < room.props.length; i++) {
        if (i === ignore) continue;
        const q = room.props[i];
        if (propKind(q.kind)?.pull !== 'cable') continue;
        const c = cableCellOf(q);
        if (c.x === x && c.z === z) return 'A lamp cable dangles there.';
      }
  }
  if (k.tall !== undefined) {
    if (lv !== 0) return 'The tree goes on the floor.';
    const ok = [0, 1, 2, 3].some((r) => {
      const nx = x + ROT_DX[r];
      const nz = z + ROT_DZ[r];
      return inGrid(shell, nx, nz) && surfaceLevel(shell, nx, nz) === k.tall;
    });
    if (!ok) return 'The tree needs a high shelf beside it to be shoved from.';
  }
  if (k.enterable && lv !== 0) return 'Boxes go on the floor. Every cat knows.';
  return null;
}

function cableOk(room: RoomDef, shell: ShellDef, p: PropPlacement, self: number): boolean {
  const c = cableCellOf(p);
  if (!inGrid(shell, c.x, c.z) || surfaceLevel(shell, c.x, c.z) !== 0) return false;
  if (isHumanCell(shell, c.x, c.z)) return false;
  for (let i = 0; i < room.props.length; i++) {
    if (i === self) continue;
    const q = room.props[i];
    if (q.x === c.x && q.z === c.z && propKind(q.kind)?.blocks) return false;
  }
  return true;
}

/** First rot (starting at `from`) whose cable cell is valid; -1 when none. */
export function cableRot(room: RoomDef, shell: ShellDef, x: number, z: number, from: number, self = -1): number {
  for (let i = 0; i < 4; i++) {
    const rot = ((from + i) & 3) as 0 | 1 | 2 | 3;
    if (cableOk(room, shell, { kind: 9, x, z, level: 0, rot }, self)) return rot;
  }
  return -1;
}

/** Why a cloth of w x d cannot sit at (x, z) (null = fine). */
function clothProblem(room: RoomDef, shell: ShellDef, x: number, z: number, w: number, d: number, self: number): string | null {
  const lv = surfaceLevel(shell, x, z);
  for (let cz = z; cz < z + d; cz++)
    for (let cx = x; cx < x + w; cx++) {
      if (!inGrid(shell, cx, cz)) return 'The tablecloth would fall off the room.';
      if (surfaceLevel(shell, cx, cz) !== lv) return 'A tablecloth lies flat on one surface.';
      if (isHumanCell(shell, cx, cz)) return 'Not over the human. They notice that.';
      for (let i = 0; i < room.props.length; i++) {
        if (i === self) continue;
        const q = room.props[i];
        if (!isCloth(propKind(q.kind))) continue;
        if (cx >= q.x && cz >= q.z && cx < q.x + (q.w ?? 1) && cz < q.z + (q.d ?? 1)) return 'Tablecloths do not stack.';
      }
    }
  return null;
}

/** Biggest cloth up to want x want that fits at (x, z) (square-ish, shrinking), null when not even 1 x 1. */
function fitCloth(room: RoomDef, shell: ShellDef, x: number, z: number, w: number, d: number, self: number): { w: number; d: number } | null {
  for (let ww = w; ww >= CLOTH_MIN; ww--)
    for (let dd = d; dd >= CLOTH_MIN; dd--) if (!clothProblem(room, shell, x, z, ww, dd, self)) return { w: ww, d: dd };
  return null;
}

function withProps(room: RoomDef, props: PropPlacement[]): RoomDef {
  return { ...room, props };
}

/** Place a new prop of `kind` on (x, z) at that cell's surface. */
/**
 * Things that only score by falling (a mug, a vase) can't sit on the floor: there is nothing to push them off.
 * Grabbables, tall props (the tree), boxes, cables and cloths, and the Roomba are fine down there.
 */
export function needsSurface(kind: number): boolean {
  const k = propKind(kind);
  return !!k && k.base > 0 && !k.grabbable && !k.tall && !k.enterable && !k.actor && !k.pull && !k.sponsor;
}
export const FLOOR_REASON = 'Cats push things OFF stuff: put it on a counter, shelf or table.';

export function placeProp(room: RoomDef, shell: ShellDef, kind: number, x: number, z: number): EditResult {
  const k = propKind(kind);
  if (!k) return fail(room, 'Unknown thing.');
  const why = reservedReason(room, shell, x, z, kind);
  if (why) return fail(room, why);
  if (needsSurface(kind) && surfaceLevel(shell, x, z) === 0) return fail(room, FLOOR_REASON);
  if (!isCloth(k) && solidAt(room, x, z) >= 0) return fail(room, 'Something is already there.');
  const level = surfaceLevel(shell, x, z);
  const p: PropPlacement = { kind, x, z, level, rot: 0 };
  if (isCloth(k)) {
    const fit = fitCloth(room, shell, x, z, 2, 2, -1);
    if (!fit) return fail(room, clothProblem(room, shell, x, z, 1, 1, -1) ?? 'No room for a tablecloth.');
    p.w = fit.w;
    p.d = fit.d;
  }
  if (k.pull === 'cable') {
    const rot = cableRot(room, shell, x, z, 0);
    if (rot < 0) return fail(room, 'A lamp needs a free floor cell beside it for the cable.');
    p.rot = rot as 0 | 1 | 2 | 3;
  }
  const props = [...room.props, p];
  return { ok: true, room: withProps(room, props), index: props.length - 1 };
}

/** Move prop `i` to (x, z), re-snapped to the new cell's surface. */
export function moveProp(room: RoomDef, shell: ShellDef, i: number, x: number, z: number): EditResult {
  const p = room.props[i];
  if (!p) return fail(room, 'Nothing to move.');
  if (p.x === x && p.z === z) return { ok: true, room, index: i };
  const k = propKind(p.kind);
  const why = reservedReason(room, shell, x, z, p.kind, i);
  if (why) return fail(room, why);
  if (needsSurface(p.kind) && surfaceLevel(shell, x, z) === 0 && p.level !== 0) return fail(room, FLOOR_REASON);
  if (!isCloth(k) && solidAt(room, x, z, i) >= 0) return fail(room, 'Something is already there.');
  const np: PropPlacement = { ...p, x, z, level: surfaceLevel(shell, x, z) };
  delete np.cable;
  if (isCloth(k)) {
    const fit = fitCloth(room, shell, x, z, p.w ?? 1, p.d ?? 1, i);
    if (!fit) return fail(room, clothProblem(room, shell, x, z, 1, 1, i) ?? 'No room for the tablecloth there.');
    np.w = fit.w;
    np.d = fit.d;
  }
  if (k?.pull === 'cable') {
    const rot = cableRot(room, shell, x, z, p.rot, i);
    if (rot < 0) return fail(room, 'A lamp needs a free floor cell beside it for the cable.');
    np.rot = rot as 0 | 1 | 2 | 3;
  }
  const props = room.props.slice();
  props[i] = np;
  return { ok: true, room: withProps(room, props), index: i };
}

/** Rotate prop `i` by 90°. A lamp turns to the next direction with a free floor cell for its cable. */
export function rotateProp(room: RoomDef, shell: ShellDef, i: number): EditResult {
  const p = room.props[i];
  if (!p) return fail(room, 'Nothing to rotate.');
  let rot = ((p.rot + 1) & 3) as 0 | 1 | 2 | 3;
  if (propKind(p.kind)?.pull === 'cable') {
    const r = cableRot(room, shell, p.x, p.z, rot, i);
    if (r < 0) return fail(room, 'The cable has nowhere else to dangle.');
    rot = r as 0 | 1 | 2 | 3;
  }
  const props = room.props.slice();
  const np: PropPlacement = { ...p, rot };
  delete np.cable;
  props[i] = np;
  return { ok: true, room: withProps(room, props), index: i };
}

export function deleteProp(room: RoomDef, i: number): EditResult {
  if (!room.props[i]) return fail(room, 'Nothing to delete.');
  const props = room.props.filter((_, j) => j !== i);
  return { ok: true, room: withProps(room, props), index: i };
}

/** Resize cloth `i` to w x d (clamped 1..CLOTH_MAX). */
export function resizeCloth(room: RoomDef, shell: ShellDef, i: number, w: number, d: number): EditResult {
  const p = room.props[i];
  if (!p || !isCloth(propKind(p.kind))) return fail(room, 'Only a tablecloth stretches.');
  const cw = Math.max(CLOTH_MIN, Math.min(CLOTH_MAX, Math.round(w)));
  const cd = Math.max(CLOTH_MIN, Math.min(CLOTH_MAX, Math.round(d)));
  const why = clothProblem(room, shell, p.x, p.z, cw, cd, i);
  if (why) return fail(room, why);
  const props = room.props.slice();
  props[i] = { ...p, w: cw, d: cd };
  return { ok: true, room: withProps(room, props), index: i };
}

export function targetCount(room: RoomDef): number {
  return room.props.reduce((n, p) => n + (p.target ? 1 : 0), 0);
}

/** A kind can be a Must-Wreck target (pushed and scores; not grabbable, not a box, not the Roomba). */
export function canTarget(kind: number): boolean {
  const k = propKind(kind);
  return !!k && !k.grabbable && k.base > 0 && !k.enterable && !k.actor && !(k.inert && !k.pull);
}

/** Toggle Must-Wreck on prop `i` (at most MAKER_TARGETS). */
export function toggleTarget(room: RoomDef, i: number): EditResult {
  const p = room.props[i];
  if (!p) return fail(room, 'Tap a prop to mark it.');
  const k = propKind(p.kind);
  if (!p.target) {
    if (!canTarget(p.kind)) return fail(room, k?.grabbable ? `The ${k.name.toLowerCase()} can only be stolen, not wrecked.` : `The ${k?.name.toLowerCase() ?? 'thing'} is unwreckable. Pick something juicier.`);
    if (targetCount(room) >= MAKER_TARGETS) return fail(room, 'Three is plenty. Untick one first.');
  }
  const props = room.props.slice();
  const np: PropPlacement = { ...p };
  if (p.target) delete np.target;
  else np.target = true;
  props[i] = np;
  return { ok: true, room: withProps(room, props), index: i };
}

/** Why the cat cannot start on (x, z) (null = fine). */
export function spawnReason(room: RoomDef, shell: ShellDef, x: number, z: number): string | null {
  if (!inGrid(shell, x, z)) return 'Outside the room. Nice try.';
  if (surfaceLevel(shell, x, z) !== 0) return 'Your cat starts on the floor.';
  if (isHumanCell(shell, x, z)) return "That's the human's spot. Rude.";
  if (shell.catBed.x === x && shell.catBed.z === z) return 'Too comfy: the cat would never leave the bed.';
  if (room.props.some((p) => p.x === x && p.z === z)) return 'Something is already there.';
  // the opening shot looks at the cat from +z: two clear floor cells in front, no counter beside them
  for (const dz of [1, 2]) {
    const cz = z + dz;
    if (cz >= shell.depth) break;
    if (surfaceLevel(shell, x, cz) !== 0) return 'Too hidden: the camera needs open floor in front of your cat.';
    if (room.props.some((p) => p.x === x && p.z === cz)) return 'Clear the floor in front of that spot first.';
  }
  if (z + 1 < shell.depth)
    for (let dx = -1; dx <= 1; dx++) if (inGrid(shell, x + dx, z + 1) && surfaceLevel(shell, x + dx, z + 1) >= 2) return 'Too hidden behind the furniture for the opening shot.';
  return null;
}

export function setSpawn(room: RoomDef, shell: ShellDef, x: number, z: number): EditResult {
  const why = spawnReason(room, shell, x, z);
  if (why) return fail(room, why);
  return { ok: true, room: { ...room, spawn: { x, z } } };
}

/** A floor cell near the cat bed with some free floor around it: the default cat start. */
export function defaultSpawn(room: Pick<RoomDef, 'props'>, shell: ShellDef): { x: number; z: number } {
  const r = { props: room.props, spawn: { x: -1, z: -1 } } as unknown as RoomDef;
  let best: { x: number; z: number } | null = null;
  let bestScore = Infinity;
  for (let z = 0; z < shell.depth; z++)
    for (let x = 0; x < shell.width; x++) {
      if (spawnReason(r, shell, x, z)) continue;
      if (onRoombaLoop(shell, x, z)) continue;
      let free = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + ROT_DX[d];
        const nz = z + ROT_DZ[d];
        if (inGrid(shell, nx, nz) && surfaceLevel(shell, nx, nz) <= 1 && !isHumanCell(shell, nx, nz) && solidAt(r, nx, nz) < 0) free++;
      }
      if (free < 3) continue;
      const score = Math.abs(x - shell.catBed.x) + Math.abs(z - shell.catBed.z);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  return best ?? { x: shell.catBed.x === 0 ? 1 : shell.catBed.x - 1, z: shell.catBed.z };
}

/** Default human per maker shell (index), filtered later by what the shell supports. */
const SHELL_ROUTINE: Readonly<Record<number, number>> = { 0: 0, 1: 4, 2: 4, 3: 6, 4: 0, 5: 8 };
const SHELL_EVENT: Readonly<Record<number, number>> = { 0: 1, 1: 10, 2: 2, 3: 11, 4: 5, 5: 6 };

/** Routines this shell can host (a mirror routine needs a mirror, an on-camera one a webcam). */
/** A routine fits a shell unless it needs a mirror the shell lacks (an on-camera human works anywhere). */
export function routineFits(r: RoutineDef, shell: ShellDef): boolean {
  if (r.mirror && !shell.mirror) return false;
  return true;
}

/**
 * Room events that make sense in a shell type (review round 1: "SPEECHES!" was offered in a kitchen). Indices into
 * ROOM_EVENT_NAMES; shells without an entry (boss rooms, admin) get every event.
 */
const SHELL_EVENTS: Readonly<Record<number, readonly number[]>> = {
  0: [0, 1, 2, 4, 9, 10], // Kitchen: delivery, kettle, phone call, oven ding, courier, pizza
  1: [0, 2, 3, 8, 9, 10], // Living room: delivery, phone, ad break, guests, courier, pizza
  2: [0, 2, 6, 9], // Bathroom: delivery, phone, alarm, courier
  3: [0, 2, 9, 10, 11], // Home office: delivery, phone, courier, pizza, you're on mute
  4: [0, 5, 7, 8, 10], // Party room: delivery, surprise, speeches, guests, pizza
  5: [0, 2, 6, 9], // Bedroom: delivery, phone, alarm, courier
  10: [0, 1, 2, 4, 8, 9, 10], // Kitchen (dinner)
  11: [0, 2, 3, 8, 9, 10, 11], // Living room (Zoom)
};

/** The room events offered for a shell (always including `current`, so an old room keeps its own). */
export function eventChoices(shellIndex: number, eventCount: number, current?: number, admin = false): number[] {
  const all = Array.from({ length: eventCount }, (_, i) => i);
  const fit = admin ? all : SHELL_EVENTS[shellIndex] ?? all;
  return current !== undefined && current >= 0 && current < eventCount && !fit.includes(current) ? [...fit, current].sort((a, b) => a - b) : [...fit];
}

/** Indices of the routines offered for a shell. */
export function routineChoices(routines: readonly RoutineDef[], shell: ShellDef, admin = false): number[] {
  const out: number[] = [];
  routines.forEach((r, i) => {
    if ((admin || r.maker) && routineFits(r, shell)) out.push(i);
  });
  return out;
}

export function defaultRoutine(routines: readonly RoutineDef[], shell: ShellDef, shellIndex: number, admin = false): number {
  const choices = routineChoices(routines, shell, admin);
  const want = SHELL_ROUTINE[shellIndex];
  if (want !== undefined && choices.includes(want)) return want;
  return choices[0] ?? 0;
}

export function defaultEvent(shellIndex: number): number {
  return SHELL_EVENT[shellIndex] ?? 0;
}

/** Second human for shells with two human spots (admin only: boss rooms, the holiday kitchen). */
export function defaultRoutine2(routines: readonly RoutineDef[], shell: ShellDef, first: number): number | undefined {
  if (!shell.humanSpot2) return undefined;
  const fits = routines.map((r, i) => (routineFits(r, shell) && i !== first ? i : -1)).filter((i) => i >= 0);
  const grandma = routines.findIndex((r) => r.persona === 'grandma');
  return fits.includes(grandma) ? grandma : (fits[0] ?? first);
}

/** Size, run length, boss flag and second human that follow from a shell. */
function shellFields(room: RoomDef, shell: ShellDef, routines: readonly RoutineDef[]): RoomDef {
  const boss = shell.width === 14 && shell.depth === 12;
  const next: RoomDef = { ...room, width: shell.width, depth: shell.depth, ticks: boss ? BOSS_TICKS : RUN_TICKS };
  if (boss) next.boss = true;
  else delete next.boss;
  if (shell.humanSpot2) {
    if (next.routine2 === undefined || !routines[next.routine2] || !routineFits(routines[next.routine2], shell)) next.routine2 = defaultRoutine2(routines, shell, next.routine);
  } else delete next.routine2;
  return next;
}

/** A fresh, empty draft for a shell. */
export function newDraft(shell: ShellDef, shellIndex: number, routines: readonly RoutineDef[], admin = false): RoomDef {
  let room: RoomDef = {
    id: DRAFT_ID,
    shell: shellIndex,
    routine: defaultRoutine(routines, shell, shellIndex, admin),
    event: defaultEvent(shellIndex),
    width: shell.width,
    depth: shell.depth,
    spawn: { x: 0, z: 0 },
    props: [],
    seed: 1,
    ticks: RUN_TICKS,
  };
  room = shellFields(room, shell, routines);
  room.spawn = defaultSpawn(room, shell);
  return room;
}

/**
 * Change the shell of a draft: props that still fit (same cell free, re-snapped to the new surface) stay, the rest go.
 * The spawn moves if it no longer works.
 */
export function switchShell(room: RoomDef, shell: ShellDef, shellIndex: number, routines: readonly RoutineDef[], admin = false): RoomDef {
  let next: RoomDef = shellFields(
    {
      ...room,
      shell: shellIndex,
      props: [],
      // round 3: a new room comes with its own human and event (a Living room opened with Chef Dad and KETTLE!); the
      // human step (3) comes after the room, so nothing the player chose is lost
      routine: room.shell === shellIndex && routineChoices(routines, shell, admin).includes(room.routine) ? room.routine : defaultRoutine(routines, shell, shellIndex, admin),
      event: room.shell === shellIndex && eventChoices(shellIndex, ROOM_EVENT_NAMES.length, undefined, admin).includes(room.event) ? room.event : defaultEvent(shellIndex),
    },
    shell,
    routines,
  );
  if (spawnReason(next, shell, room.spawn.x, room.spawn.z)) next.spawn = defaultSpawn(next, shell);
  for (const p of room.props) {
    const r = placeProp(next, shell, p.kind, p.x, p.z);
    if (!r.ok || r.index === undefined) continue;
    const props = r.room.props.slice();
    const placed = { ...props[r.index] };
    if (p.target) placed.target = true;
    props[r.index] = placed;
    next = { ...r.room, props };
  }
  return next;
}

/** Strip what the Room Maker cannot edit from a room opened for a remix (sponsor, accomplice, par, boss data). */
export function editableCopy(src: RoomDef, shell?: ShellDef): RoomDef {
  const props = src.props.filter((p) => p.kind !== 63).map((p) => ({ ...p, ...(p.cable ? { cable: { ...p.cable } } : {}) }));
  if (shell) snapRoombas(props, shell);
  const room: RoomDef = {
    id: DRAFT_ID,
    shell: src.shell,
    routine: src.routine,
    event: src.event,
    width: src.width,
    depth: src.depth,
    spawn: { ...src.spawn },
    props,
    seed: 1,
    ticks: src.ticks,
  };
  if (src.routine2 !== undefined) room.routine2 = src.routine2;
  if (src.boss) room.boss = true;
  if (src.theme && src.theme !== 'default') room.theme = src.theme;
  return room;
}

/**
 * A Roomba off its shell's road (older or preview layouts) moves to the nearest free road cell, so a remix of any
 * authored room passes the "wandered off its road" check (round 2). Mutates `props`.
 */
export function snapRoombas(props: PropPlacement[], shell: ShellDef): void {
  const loop = shell.roombaLoop;
  if (!loop?.length) return;
  const W = shell.width;
  const onLoop = new Set(loop.map((c) => c.z * W + c.x));
  props.forEach((p, i) => {
    if (propKind(p.kind)?.actor !== 'roomba' || onLoop.has(p.z * W + p.x)) return;
    const taken = new Set(props.filter((_, j) => j !== i).map((q) => q.z * W + q.x));
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const c of loop) {
      if (taken.has(c.z * W + c.x)) continue;
      const d = Math.abs(c.x - p.x) + Math.abs(c.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      p.x = best.x;
      p.z = best.z;
      p.level = surfaceLevel(shell, best.x, best.z) as PropPlacement['level'];
    }
  });
}

/** Gameplay identity of a room (what a clear run depends on): changes when anything playable changes. */
export function gameplayKey(room: RoomDef): string {
  const props = room.props.map((p) => [p.kind, p.x, p.z, p.level, p.rot, p.target ? 1 : 0, p.w ?? 0, p.d ?? 0, p.cable ? `${p.cable.x},${p.cable.z}` : ''].join(':'));
  return [room.shell, room.routine, room.routine2 ?? '', room.event, room.theme ?? '', room.spawn.x, room.spawn.z, room.width, room.depth, room.ticks, props.join('|')].join('/');
}
