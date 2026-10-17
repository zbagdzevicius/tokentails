/**
 * Room Maker limits (GDD 6.4, 13.7). Pure: <= 40 props, chaos budget <= 3,000 (stacks full), an occluding
 * furniture cell, exactly 3 targets, props on the shell surface, nothing on the human or the spawn, and the content
 * validator on the resolved room (BFS reachability of every target from the spawn, first target <= 6 s, two targets
 * in sight, cables, cloths, the Roomba road). Errors are friendly; `bad` holds the offending cells (z * width + x).
 */
import { propKind, type ContentApi, type GridState, type HumanState, type PlayableRoom, type RoomDef, type ShellDef, type SimState } from '../types';
import { looksAt } from '../sim';
import { ADMIN_MAX_PROPS, MAKER_MAX_BUDGET, MAKER_MAX_PROPS, MAKER_TARGETS, roomBudget } from './budget';
import { inGrid, surfaceLevel } from './placement';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  budget: number;
  /** Offending cells (z * width + x) for the red overlay. */
  bad: number[];
  /** Cells the human(s) can see when they turn (z * width + x): the view cone shown while marking targets. */
  look: number[];
}

export interface CheckOptions {
  /** Content authoring: no budget limit, the daily prop cap. */
  admin?: boolean;
  /** The chaos cap (a remix of an authored room keeps its budget: budgetCapFor). Default MAKER_MAX_BUDGET. */
  maxBudget?: number;
}

const KIND_NAME = (kind: number): string => propKind(kind)?.name.toLowerCase() ?? 'thing';

/** Validator messages the editor already reports in its own words (or does not apply to maker rooms). */
const SKIP = [/^prop count \d+ outside/, /^chaos budget \d+ >/, /^\d+ targets, need/];

export function check(room: RoomDef, content: ContentApi, opts: CheckOptions = {}): CheckResult {
  const errors: string[] = [];
  const bad = new Set<number>();
  const budget = roomBudget(room);
  const add = (msg: string, cells: { x: number; z: number }[] = []): void => {
    if (!errors.includes(msg)) errors.push(msg);
    for (const c of cells) if (c.x >= 0 && c.z >= 0 && c.x < room.width && c.z < room.depth) bad.add(c.z * room.width + c.x);
  };
  const shell: ShellDef | undefined = content.shells?.[room.shell];
  if (!shell) {
    add('That room shell does not exist (yet).');
    return { ok: false, errors, budget, bad: [], look: [] };
  }
  if (!opts.admin && !shell.maker) add('That room is not open in the Room Maker.');

  // ----- limits -----
  const maxProps = opts.admin ? ADMIN_MAX_PROPS : MAKER_MAX_PROPS;
  if (room.props.length > maxProps) add(`${room.props.length} props: the limit is ${maxProps}. Even a cat gets tired.`);
  const cap = opts.maxBudget ?? MAKER_MAX_BUDGET;
  if (!opts.admin && budget > cap) add(`Too much chaos, even for a cat: ${budget.toLocaleString('en-US')} of ${cap.toLocaleString('en-US')} points.`);
  if (!shell.occludes.some((o) => o === 1)) add('Nowhere to hide! The room needs at least one tall piece of furniture.');
  const targets = room.props.filter((p) => p.target);
  if (targets.length !== MAKER_TARGETS)
    add(targets.length < MAKER_TARGETS ? `Mark ${MAKER_TARGETS - targets.length} more Must-Wreck target${MAKER_TARGETS - targets.length === 1 ? '' : 's'} (exactly ${MAKER_TARGETS}).` : `Exactly ${MAKER_TARGETS} Must-Wreck targets, please. You have ${targets.length}.`);

  // ----- cells -----
  const humans = [shell.humanSpot, ...(shell.humanSpot2 && room.routine2 !== undefined ? [shell.humanSpot2] : [])];
  room.props.forEach((p) => {
    if (!inGrid(shell, p.x, p.z)) {
      add(`A ${KIND_NAME(p.kind)} fell out of the room.`);
      return;
    }
    if (p.level !== surfaceLevel(shell, p.x, p.z)) add(`The ${KIND_NAME(p.kind)} is floating. Props sit on a surface.`, [p]);
    if (humans.some((h) => h.x === p.x && h.z === p.z)) add(`The ${KIND_NAME(p.kind)} is on the human. They'd notice.`, [p]);
    if (p.x === room.spawn.x && p.z === room.spawn.z) add(`The ${KIND_NAME(p.kind)} is on your cat's start spot.`, [p]);
  });
  if (humans.some((h) => h.x === room.spawn.x && h.z === room.spawn.z)) add("Your cat can't start on the human's lap. Not yet.", [room.spawn]);

  // ----- the content validator on the resolved room (BFS from the spawn to every target) -----
  let look: number[] = [];
  try {
    const play = content.resolve({ ...room, id: room.id.startsWith('ugc-') ? room.id : `ugc-${room.id}` }, 'practice');
    look = lookCells(play);
    const rep = content.validate(play);
    for (const e of rep.errors) {
      if (SKIP.some((re) => re.test(e))) continue;
      const f = friendly(e, room, shell);
      add(f.msg, f.cells);
    }
  } catch {
    add('The room confused the validator. Try undoing the last change.');
  }

  return { ok: errors.length === 0, errors, budget, bad: [...bad].sort((a, b) => a - b), look };
}

/** Every cell some human can see on one of their turns (any look facing), the near ring included. */
export function lookCells(play: PlayableRoom): number[] {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const grid = { w: W, d: D, level: Uint8Array.from(shell.levels), occludes: Uint8Array.from(shell.occludes), propAt: new Int16Array(W * D).fill(-1) } as GridState;
  const s = { grid } as SimState;
  const humans = [{ at: shell.humanSpot, r: play.routine }, ...(play.routine2 && shell.humanSpot2 ? [{ at: shell.humanSpot2, r: play.routine2 }] : [])];
  const out = new Set<number>();
  for (const hm of humans) {
    if (play.routine.kind === 'napper' && hm.r === play.routine) continue; // asleep: a noise meter, not a cone
    const h = { x: hm.at.x, z: hm.at.z } as HumanState;
    for (const f of hm.r.lookFacings)
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++) {
          if (x === h.x && z === h.z) continue;
          if (looksAt(s, h, f, x, z, shell.levels[z * W + x])) out.add(z * W + x);
        }
  }
  return [...out].sort((a, b) => a - b);
}

/** "on the counter, back left": where a prop sits, in words a player can find on screen. */
export function placeOf(p: { x: number; z: number }, shell: ShellDef): string {
  const f = shell.furniture.find((q) => p.x >= q.x && p.x < q.x + q.w && p.z >= q.z && p.z < q.z + q.d && q.level > 0);
  const where = f ? `on the ${f.type.replace(/-/g, ' ')}` : 'on the floor';
  const col = p.x < shell.width / 3 ? 'left' : p.x >= (2 * shell.width) / 3 ? 'right' : 'middle';
  const row = p.z < shell.depth / 3 ? 'back' : p.z >= (2 * shell.depth) / 3 ? 'front' : '';
  return `${where}, ${row ? `${row} ${col}` : col}`;
}

/** Validator message -> cheeky, actionable text plus the cells to paint red. */
export function friendly(e: string, room: RoomDef, shell?: ShellDef): { msg: string; cells: { x: number; z: number }[] } {
  const cellRe = /(\d+),(\d+)/g;
  const cells: { x: number; z: number }[] = [];
  for (const m of e.matchAll(cellRe)) cells.push({ x: Number(m[1]), z: Number(m[2]) });
  const propIdx = /^(?:prop|target) (\d+)/.exec(e);
  const p = propIdx ? room.props[Number(propIdx[1])] : undefined;
  if (p) cells.push({ x: p.x, z: p.z });
  const name = p ? KIND_NAME(p.kind) : 'target';
  // review round 1: say WHICH one ("the wine glass on the counter, back left"), not just "the wine glass"
  if (/cannot be wrecked from a reachable cell/.test(e)) {
    // A fragile thing on the floor has nothing to fall off: say that, not "can't reach" (round 2).
    const onFloor = p && shell ? (shell.levels[p.z * shell.width + p.x] ?? 0) === 0 : false;
    if (onFloor) return { msg: `The ${name} is on the floor: nothing to push it off. Cats push things OFF stuff, so put it on a surface.`, cells };
    // round 3: name the real cause. A chair beside a packed table still read "give it a chair": the cells next to the
    // prop were full, so the cat had nowhere to stand (or nothing lower to push it onto).
    if (p && shell) {
      const W = shell.width;
      const lv = (x: number, z: number): number => shell.levels[z * W + x] ?? 0;
      const pl = lv(p.x, p.z);
      const full = (x: number, z: number): boolean => room.props.some((q) => q !== p && q.x === x && q.z === z && !!propKind(q.kind)?.blocks);
      const nb: { x: number; z: number }[] = [];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = p.x + dx;
          const z = p.z + dz;
          if ((dx || dz) && x >= 0 && z >= 0 && x < W && z < shell.depth) nb.push({ x, z });
        }
      const stand = nb.filter((c) => lv(c.x, c.z) === pl);
      const drop = nb.filter((c) => lv(c.x, c.z) < pl && !full(c.x, c.z));
      const where = placeOf(p, shell);
      if (!drop.length) return { msg: `The ${name} ${where} has nowhere to fall: nothing lower beside it is free. Move it to an edge.`, cells };
      if (stand.length && stand.every((c) => full(c.x, c.z)))
        return { msg: `Every spot beside the ${name} ${where} is taken (red): your cat has nowhere to stand to push it. Free one cell next to it.`, cells: [...cells, ...stand] };
    }
    return { msg: `Your cat can't reach the ${name}${p && shell ? ` ${placeOf(p, shell)}` : ''} (red). Give it a chair or shelf to climb.`, cells };
  }
  if (/^first target takes/.test(e)) return { msg: 'The first target is too far away: put one within 6 seconds of the paw.', cells: [room.spawn] };
  if (/in the human's sight/.test(e)) return { msg: 'Nobody would see the crime! Put at least 2 targets inside the blue area: where the human looks when they turn.', cells };
  if (/^spawn|spawn on the human|spawn must be/.test(e)) return { msg: 'Your cat is boxed in at the start. Give kitty some open floor (move the paw).', cells: [room.spawn, ...cells] };
  if (/blocks the Roomba loop/.test(e)) return { msg: "Something is parked on the Roomba's road.", cells };
  if (/cable/.test(e)) return { msg: `The lamp cable needs a free floor cell beside the lamp.`, cells };
  if (/cloth/.test(e)) return { msg: 'A tablecloth is hanging off something. Flat on one surface, please.', cells };
  if (/already holds a prop/.test(e)) return { msg: 'Two things in one spot. Physics says no.', cells };
  if (/spectator slot/.test(e)) return { msg: 'That spot is reserved for a fan cat.', cells };
  if (/accomplice spot/.test(e)) return { msg: 'A Pink Paw cat naps there. Move that prop.', cells };
  if (/cannot be a target/.test(e)) return { msg: `The ${name} can't be a Must-Wreck target.`, cells };
  if (/the Roomba .* is not on its loop/.test(e)) return { msg: 'The Roomba wandered off its road.', cells };
  if (/tall prop|swat from/.test(e)) return { msg: 'The tree needs a high shelf beside it to be shoved from.', cells };
  if (/enterable/.test(e)) return { msg: 'Boxes go on the floor.', cells };
  if (/on the cat bed/.test(e)) return { msg: 'Something is on the cat bed. The cat would like a word.', cells };
  if (/needs a (mirror|webcam)/.test(e)) return { msg: 'That human needs a mirror or a webcam this room does not have.', cells };
  return { msg: `Something's off: ${e}.`, cells };
}
