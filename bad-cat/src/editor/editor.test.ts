import { eventChoices } from './placement';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { codec } from '../codec';
import { PROP_KINDS, propKind, type ContentApi, type RoomDef, type ShellDef } from '../types';
import { History, HISTORY_LIMIT } from './history';
import { MAKER_MAX_BUDGET, budgetCapFor, budgetMeter, fitsBudget, propCost, roomBudget } from './budget';
import { check, friendly } from './check';
import { EXCLUDED_KINDS, PALETTE_TABS, kindsForTab, placeableKinds, tabOf } from './palette';
import {
  canTarget,
  cableCellOf,
  deleteProp,
  editableCopy,
  gameplayKey,
  moveProp,
  newDraft,
  placeProp,
  propAt,
  resizeCloth,
  rotateProp,
  routineChoices,
  setSpawn,
  switchShell,
  targetCount,
  toggleTarget,
} from './placement';
import {
  ANON,
  UNTITLED,
  cleanAuthor,
  cleanTitle,
  exportJson,
  finalizeRoom,
  formatBuildTime,
  remixAncestors,
  remixLine,
  speedBadge,
  speedClock,
} from './publish';
import { editor } from './index';
import { KITCHEN, validKitchen } from './test-util';

const SH = content.shells!;
const KIT: ShellDef = SH[0];
const lv = (s: ShellDef, x: number, z: number): number => s.levels[z * s.width + x];
/** First cell of a level that a kind may be placed on in this room. */
function freeCell(room: RoomDef, s: ShellDef, level: number, kind = 2, skip = 0): { x: number; z: number } {
  let n = 0;
  for (let z = 0; z < s.depth; z++)
    for (let x = 0; x < s.width; x++) {
      if (lv(s, x, z) !== level) continue;
      if (!placeProp(room, s, kind, x, z).ok) continue;
      if (n++ === skip) return { x, z };
    }
  throw new Error(`no free L${level} cell`);
}

describe('palette', () => {
  it('maps every placeable kind to exactly one of the 6 tabs; Roomba and sponsor are excluded', () => {
    expect(PALETTE_TABS.map((t) => t.label)).toEqual(['Fragile', 'Food', 'Fabric', 'Tech', 'Plants', 'Party']);
    for (const k of PROP_KINDS) {
      if (EXCLUDED_KINDS.includes(k.kind)) expect(tabOf(k.kind)).toBeNull();
      else expect(tabOf(k.kind), k.id).not.toBeNull();
    }
    const all = PALETTE_TABS.flatMap((t) => kindsForTab(t.id).map((k) => k.kind));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(placeableKinds().length);
    expect(all).not.toContain(20);
    expect(all).not.toContain(63);
    expect(tabOf(14)).toBe('fabric'); // tablecloth
    for (const t of PALETTE_TABS) expect(kindsForTab(t.id).length).toBeGreaterThan(0);
  });
});

describe('placement', () => {
  it('snaps a placed prop to the surface level of its cell (floor, seat, counter, shelf)', () => {
    const room = KITCHEN();
    for (const level of [0, 1, 2, 3]) {
      const c = freeCell(room, KIT, level, 19);
      const r = placeProp(room, KIT, 19, c.x, c.z);
      expect(r.ok).toBe(true);
      expect(r.room.props[r.index!].level).toBe(level);
    }
  });

  it('never places on the human, the spawn, the cat bed, an occupied cell or outside the room', () => {
    const room = KITCHEN();
    expect(placeProp(room, KIT, 2, KIT.humanSpot.x, KIT.humanSpot.z).reason).toMatch(/human/);
    expect(placeProp(room, KIT, 2, room.spawn.x, room.spawn.z).reason).toMatch(/cat starts/);
    expect(placeProp(room, KIT, 2, KIT.catBed.x, KIT.catBed.z).reason).toMatch(/cat bed/);
    expect(placeProp(room, KIT, 2, -1, 0).ok).toBe(false);
    expect(placeProp(room, KIT, 2, KIT.width, 0).ok).toBe(false);
    const c = freeCell(room, KIT, 2);
    const one = placeProp(room, KIT, 2, c.x, c.z).room;
    expect(placeProp(one, KIT, 1, c.x, c.z).reason).toMatch(/already/);
    // inputs are never mutated
    expect(room.props).toHaveLength(0);
  });

  it('keeps the Roomba road and fan-cat slots free', () => {
    const room = KITCHEN();
    const loop = KIT.roombaLoop![0];
    expect(placeProp(room, KIT, 2, loop.x, loop.z).reason).toMatch(/Roomba/);
    const slot = KIT.spectatorSlots!.find((s) => s.level === lv(KIT, s.x, s.z));
    if (slot) expect(placeProp(room, KIT, 2, slot.x, slot.z).reason).toMatch(/fan cat/);
  });

  it('moves a prop and re-snaps it to the new surface; refuses a taken cell', () => {
    const room = KITCHEN();
    const a = freeCell(room, KIT, 2);
    const p1 = placeProp(room, KIT, 2, a.x, a.z);
    // a mug has nothing to fall off on the floor: refused (round 2); another surface cell is fine
    const floor = freeCell(p1.room, KIT, 0, 18);
    expect(moveProp(p1.room, KIT, 0, floor.x, floor.z)).toMatchObject({ ok: false, reason: expect.stringMatching(/OFF stuff/) });
    expect(placeProp(p1.room, KIT, 2, floor.x, floor.z)).toMatchObject({ ok: false, reason: expect.stringMatching(/OFF stuff/) });
    const f = freeCell(p1.room, KIT, 2, 2, 1);
    const m = moveProp(p1.room, KIT, 0, f.x, f.z);
    expect(m.ok).toBe(true);
    expect(m.room.props[0]).toMatchObject({ x: f.x, z: f.z, level: 2 });
    const b = freeCell(m.room, KIT, 2);
    const p2 = placeProp(m.room, KIT, 1, b.x, b.z);
    expect(moveProp(p2.room, KIT, 0, b.x, b.z).ok).toBe(false);
  });

  it('rotates by 90 degrees and wraps; deletes', () => {
    const room = KITCHEN();
    const a = freeCell(room, KIT, 2);
    let r = placeProp(room, KIT, 2, a.x, a.z).room;
    const rots: number[] = [];
    for (let i = 0; i < 4; i++) {
      r = rotateProp(r, KIT, 0).room;
      rots.push(r.props[0].rot);
    }
    expect(rots).toEqual([1, 2, 3, 0]);
    const d = deleteProp(r, 0);
    expect(d.ok).toBe(true);
    expect(d.room.props).toHaveLength(0);
    expect(deleteProp(d.room, 0).ok).toBe(false);
  });

  it('a lamp always points its cable at a free floor cell', () => {
    const room = KITCHEN();
    // a counter cell next to the floor
    let at: { x: number; z: number } | null = null;
    for (let z = 0; z < KIT.depth && !at; z++)
      for (let x = 0; x < KIT.width && !at; x++) if (lv(KIT, x, z) === 2 && placeProp(room, KIT, 9, x, z).ok) at = { x, z };
    const r = placeProp(room, KIT, 9, at!.x, at!.z);
    const c = cableCellOf(r.room.props[0]);
    expect(lv(KIT, c.x, c.z)).toBe(0);
    const rr = rotateProp(r.room, KIT, 0);
    if (rr.ok) expect(lv(KIT, cableCellOf(rr.room.props[0]).x, cableCellOf(rr.room.props[0]).z)).toBe(0);
    // nothing blocking may then land on the cable
    expect(placeProp(r.room, KIT, 2, c.x, c.z).reason).toMatch(/cable/);
  });

  it('a tablecloth covers w x d on one surface, carries props and resizes within bounds', () => {
    const party = SH[4];
    let room = newDraft(party, 4, content.routines!);
    const c = freeCell(room, party, 2, 14);
    const cl = placeProp(room, party, 14, c.x, c.z);
    expect(cl.ok).toBe(true);
    const p = cl.room.props[0];
    expect((p.w ?? 1) * (p.d ?? 1)).toBeGreaterThanOrEqual(1);
    room = cl.room;
    // a prop on the cloth's cell is allowed (it rides the cloth); the tap finds the prop first
    const on = placeProp(room, party, 2, c.x, c.z);
    expect(on.ok).toBe(true);
    expect(propAt(on.room, c.x, c.z)).toBe(1);
    expect(propAt(room, c.x, c.z)).toBe(0);
    const big = resizeCloth(room, party, 0, 1, 1);
    expect(big.ok).toBe(true);
    expect(big.room.props[0]).toMatchObject({ w: 1, d: 1 });
    expect(resizeCloth(room, party, 0, 40, 40).ok).toBe(false); // off the table
    expect(resizeCloth(on.room, party, 1, 2, 2).ok).toBe(false); // a mug does not stretch
    // two cloths never overlap
    expect(placeProp(room, party, 14, c.x, c.z).ok).toBe(false);
  });

  it('marks at most 3 targets, only wreckable ones', () => {
    let room = KITCHEN();
    for (let i = 0; i < 4; i++) {
      const c = freeCell(room, KIT, 2);
      room = placeProp(room, KIT, 2, c.x, c.z).room;
    }
    for (let i = 0; i < 3; i++) room = toggleTarget(room, i).room;
    expect(targetCount(room)).toBe(3);
    const fourth = toggleTarget(room, 3);
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toMatch(/Three is plenty/);
    room = toggleTarget(room, 0).room;
    expect(targetCount(room)).toBe(2);
    const s = freeCell(room, KIT, 0, 19);
    const sock = placeProp(room, KIT, 19, s.x, s.z);
    expect(toggleTarget(sock.room, sock.index!).reason).toMatch(/stolen/);
    expect(canTarget(2)).toBe(true);
    expect(canTarget(19)).toBe(false);
    expect(canTarget(54)).toBe(false);
  });

  it('moves the cat start to a clear floor cell only', () => {
    const room = KITCHEN();
    const c = freeCell(room, KIT, 2);
    expect(setSpawn(room, KIT, c.x, c.z).ok).toBe(false);
    expect(setSpawn(room, KIT, KIT.humanSpot.x, KIT.humanSpot.z).ok).toBe(false);
  });

  it('switching shells keeps what fits and re-checks the spawn; remix copies drop sponsor products', () => {
    const room = validKitchen();
    const living = switchShell(room, SH[1], 1, content.routines!);
    expect(living.shell).toBe(1);
    for (const p of living.props) expect(p.level).toBe(lv(SH[1], p.x, p.z));
    expect(routineChoices(content.routines!, SH[1])).toContain(living.routine);
    const sponsored: RoomDef = { ...room, props: [...room.props, { kind: 63, x: 0, z: 9, level: 0, rot: 0 }], sponsor: { propIndex: room.props.length, label: 'x' }, author: 'Zyg' };
    const copy = editableCopy(sponsored);
    expect(copy.props.some((p) => p.kind === 63)).toBe(false);
    expect(copy.sponsor).toBeUndefined();
    expect(copy.author).toBeUndefined();
  });

  it('offers the 4 maker humans in every maker room (review round 1: the WFH Worker works without a webcam)', () => {
    const names = (i: number) => routineChoices(content.routines!, SH[i]).map((r) => content.routines![r].name);
    expect(names(3)).toEqual(expect.arrayContaining(['Chef Dad', 'Couch Potato', 'WFH Worker', 'Napper']));
    expect(names(0)).toEqual(expect.arrayContaining(['Chef Dad', 'Couch Potato', 'WFH Worker', 'Napper']));
  });
  it('offers only the room events that fit the room type', () => {
    expect(eventChoices(0, 12)).not.toContain(7); // no SPEECHES! in a kitchen
    expect(eventChoices(4, 12)).toContain(7);
    expect(eventChoices(0, 12, 7)).toContain(7); // an old room keeps its own event
    expect(eventChoices(0, 12, undefined, true)).toHaveLength(12); // admin: all
  });

  it('gameplayKey changes with gameplay, not with the title', () => {
    const a = validKitchen();
    expect(gameplayKey({ ...a, title: 'x' })).toBe(gameplayKey(a));
    expect(gameplayKey(rotateProp(a, KIT, 0).room)).not.toBe(gameplayKey(a));
  });
});

describe('history (undo/redo, 20 steps)', () => {
  it('undoes and redoes in order', () => {
    const h = new History<number>();
    let cur = 0;
    for (let i = 1; i <= 3; i++) {
      h.commit(cur);
      cur = i;
    }
    expect((cur = h.undo(cur)!)).toBe(2);
    expect((cur = h.undo(cur)!)).toBe(1);
    expect((cur = h.redo(cur)!)).toBe(2);
    h.commit(cur);
    cur = 9;
    expect(h.canRedo).toBe(false);
    expect(h.redo(cur)).toBeNull();
  });
  it('keeps only the newest 20 steps', () => {
    const h = new History<number>();
    let cur = 0;
    for (let i = 1; i <= 30; i++) {
      h.commit(cur);
      cur = i;
    }
    expect(HISTORY_LIMIT).toBe(20);
    expect(h.undoDepth).toBe(20);
    let n = 0;
    while (h.canUndo) {
      cur = h.undo(cur)!;
      n++;
    }
    expect(n).toBe(20);
    expect(cur).toBe(10);
    expect(h.undo(cur)).toBeNull();
    let r = 0;
    while (h.canRedo) {
      cur = h.redo(cur)!;
      r++;
    }
    expect(r).toBe(20);
    expect(cur).toBe(30);
  });
});

describe('chaos budget', () => {
  it('counts base points; stacks count full (items x item points)', () => {
    expect(propCost(1)).toBe(150);
    expect(propCost(3)).toBe(4 * 80);
    expect(propCost(15)).toBe(5 * 40);
    expect(propCost(55)).toBe(6 * 60);
    expect(propCost(19)).toBe(0);
    expect(propCost(999)).toBe(0);
    for (const k of PROP_KINDS) if (k.stack) expect(propCost(k.kind)).toBe(k.stack.items * k.stack.itemBase);
    const room = { props: [{ kind: 3 }, { kind: 6 }, { kind: 19 }] } as RoomDef;
    expect(roomBudget(room)).toBe(320 + 400);
  });
  it('the meter fills to 3,000 and says so when over', () => {
    expect(MAKER_MAX_BUDGET).toBe(3000);
    expect(budgetMeter(0).line).toBe('Suspiciously tidy');
    expect(budgetMeter(500).line).toBe('Needs more breakables: 700 more points');
    expect(budgetMeter(1500).mood).toBe('spicy');
    expect(budgetMeter(2900).mood).toBe('wild');
    expect(budgetMeter(3000).mood).toBe('wild');
    const over = budgetMeter(3001);
    expect(over).toMatchObject({ mood: 'over', fill: 1 });
    expect(over.line).toBe('Too much chaos, even for a cat: 1 over');
    // admin (no cap): never "needs more breakables" at 5,080 (round 2)
    expect(budgetMeter(5080, Infinity).mood).toBe('wild');
    const seven = { props: Array.from({ length: 7 }, () => ({ kind: 6 })) } as RoomDef; // 2,800
    expect(fitsBudget(seven, 2)).toBe(true); // +100 = 2,900
    expect(fitsBudget(seven, 6)).toBe(false); // +400 = 3,200
  });
});

describe('check()', () => {
  it('passes a valid maker room', () => {
    const res = check(validKitchen(5), content);
    expect(res).toMatchObject({ ok: true, errors: [], bad: [] });
    expect(editor.check(validKitchen(), content).ok).toBe(true);
  });

  it('caps the room at 40 props', () => {
    const room = validKitchen();
    const props = room.props.slice();
    for (let z = 0; z < KIT.depth && props.length <= 40; z++)
      for (let x = 0; x < KIT.width && props.length <= 40; x++) if (!props.some((p) => p.x === x && p.z === z)) props.push({ kind: 19, x, z, level: lv(KIT, x, z) as 0, rot: 0 });
    const res = check({ ...room, props }, content);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/41 props: the limit is 40/);
    expect(check({ ...room, props }, content, { admin: true }).errors.join(' ')).not.toMatch(/limit is 40/);
  });

  it('caps the chaos budget at 3,000 (admin has no budget)', () => {
    const room = validKitchen();
    const props = room.props.slice();
    for (let i = 0; i < 8; i++) {
      const c = freeCell({ ...room, props }, KIT, 2, 6);
      props.push({ kind: 6, x: c.x, z: c.z, level: 2, rot: 0 });
    }
    const res = check({ ...room, props }, content);
    expect(res.budget).toBeGreaterThan(3000);
    expect(res.errors.join(' ')).toMatch(/Too much chaos, even for a cat/);
    expect(check({ ...room, props }, content, { admin: true }).errors.join(' ')).not.toMatch(/Too much chaos/);
  });

  it('needs an occluding furniture cell', () => {
    const flat: ShellDef = { ...KIT, occludes: KIT.occludes.map(() => 0 as const) };
    const c: ContentApi = { ...content, shells: [flat, ...SH.slice(1)] };
    expect(check(validKitchen(), c).errors.join(' ')).toMatch(/Nowhere to hide/);
  });

  it('needs exactly 3 targets', () => {
    const room = validKitchen();
    const two = toggleTarget(room, room.props.findIndex((p) => p.target)).room;
    expect(check(two, content).errors.join(' ')).toMatch(/Mark 1 more Must-Wreck target/);
    const c = freeCell(room, KIT, 2);
    const four: RoomDef = { ...room, props: [...room.props, { kind: 2, x: c.x, z: c.z, level: 2, rot: 0, target: true }] };
    expect(check(four, content).errors.join(' ')).toMatch(/Exactly 3 Must-Wreck targets/);
  });

  it('props sit on the shell surface; nothing on the human or the spawn', () => {
    const room = validKitchen();
    const f = freeCell(room, KIT, 0, 19);
    const floating: RoomDef = { ...room, props: [...room.props, { kind: 19, x: f.x, z: f.z, level: 3, rot: 0 }] };
    const r1 = check(floating, content);
    expect(r1.errors.join(' ')).toMatch(/floating/);
    expect(r1.bad).toContain(f.z * KIT.width + f.x);
    const onHuman: RoomDef = { ...room, props: [...room.props, { kind: 19, x: KIT.humanSpot.x, z: KIT.humanSpot.z, level: lv(KIT, KIT.humanSpot.x, KIT.humanSpot.z) as 0, rot: 0 }] };
    expect(check(onHuman, content).errors.join(' ')).toMatch(/on the human/);
    const onSpawn: RoomDef = { ...room, props: [...room.props, { kind: 19, x: room.spawn.x, z: room.spawn.z, level: 0, rot: 0 }] };
    expect(check(onSpawn, content).errors.join(' ')).toMatch(/start spot/);
  });

  it('every target must be reachable from the spawn (content BFS), offending cells in bad', () => {
    const room = validKitchen();
    const t = room.props.findIndex((p) => p.target);
    const tp = room.props[t];
    // wall the target in with blocking props on every neighbour at its level
    const props = room.props.slice();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = tp.x + dx;
      const z = tp.z + dz;
      if (x < 0 || z < 0 || x >= KIT.width || z >= KIT.depth || props.some((p) => p.x === x && p.z === z)) continue;
      props.push({ kind: 10, x, z, level: lv(KIT, x, z) as 0, rot: 0 });
    }
    const res = check({ ...room, props }, content);
    // round 3: the real cause (its neighbour cells are full), not "give it a chair"
    const reach = res.errors.find((e) => /nowhere to stand|nowhere to fall|can't reach/.test(e));
    expect(reach).toBeTruthy();
    expect(reach).not.toMatch(/Give it a chair/);
    expect(res.bad).toContain(tp.z * KIT.width + tp.x);
    // and the message map for the validator's own words
    const f = friendly(`target ${t} (mug) at ${tp.x},${tp.z} cannot be wrecked from a reachable cell`, room);
    expect(f.msg).toMatch(/can't reach the mug/);
    expect(f.cells).toContainEqual({ x: tp.x, z: tp.z });
  });

  it('a boxed-in spawn is reported (the paw cell goes red)', () => {
    const room = validKitchen();
    const res = check({ ...room, spawn: { x: KIT.humanSpot.x, z: KIT.humanSpot.z } }, content);
    expect(res.ok).toBe(false);
    expect(res.bad).toContain(KIT.humanSpot.z * KIT.width + KIT.humanSpot.x);
  });
});

describe('publish', () => {
  it('filters title (24) and author (12), with friendly fallbacks', () => {
    expect(cleanTitle(codec, "Zyg's Kitchen")).toBe("Zyg's Kitchen");
    expect(Array.from(cleanTitle(codec, 'A very long title that goes on and on')).length).toBeLessThanOrEqual(24);
    expect(cleanTitle(codec, 'visit www.spam.com')).not.toMatch(/spam\.com/);
    expect(cleanTitle(codec, '')).toBe(UNTITLED);
    expect(cleanTitle(codec, 'fuck')).toBe(UNTITLED);
    expect(cleanAuthor(codec, 'Mia')).toBe('Mia');
    expect(Array.from(cleanAuthor(codec, 'Maximilianoooooo')).length).toBeLessThanOrEqual(12);
    expect(cleanAuthor(codec, '@handle')).toBe(ANON);
    expect(cleanAuthor(codec, '')).toBe(ANON);
  });

  it('remix ancestors: up to 3 author names, newest first', () => {
    expect(remixAncestors({ author: 'Zyg' })).toEqual(['Zyg']);
    expect(remixAncestors({ author: 'Mia', ancestors: ['Zyg'] })).toEqual(['Mia', 'Zyg']);
    expect(remixAncestors({ author: 'Ola', ancestors: ['Mia', 'Zyg', 'Ann'] })).toEqual(['Ola', 'Mia', 'Zyg']);
    expect(remixAncestors({ author: '', ancestors: ['Mia'] })).toEqual(['Mia']);
    expect(remixLine({ author: 'Mia', ancestors: ['Zyg'] }, 'Kitchen')).toBe("Remix of Zyg's Kitchen");
    expect(remixLine({ author: 'Mia' }, 'Kitchen')).toBe('');
  });

  it('a published room round-trips through encodeRoom -> decodeRoom', () => {
    const draft = validKitchen(4);
    const { room, code } = finalizeRoom(draft, codec, "Zyg's Kitchen", 'Mia', ['Zyg', 'Ann', 'Bo', 'Extra']);
    expect(code.length).toBeGreaterThan(10);
    expect(room.id).toMatch(/^ugc-/);
    const back = codec.decodeRoom!(code)!;
    expect(back).toBeTruthy();
    expect(back.title).toBe("Zyg's Kitchen");
    expect(back.author).toBe('Mia');
    expect(back.ancestors).toEqual(['Zyg', 'Ann', 'Bo']);
    expect(back.props.map((p) => [p.kind, p.x, p.z, p.level, p.rot, !!p.target])).toEqual(draft.props.map((p) => [p.kind, p.x, p.z, p.level, p.rot, !!p.target]));
    expect(back.spawn).toEqual(draft.spawn);
    expect([back.shell, back.routine, back.event]).toEqual([draft.shell, draft.routine, draft.event]);
    // the published (decoded) room still passes the maker check, and its id survives a rename
    expect(check(back, content).ok).toBe(true);
    expect(finalizeRoom(draft, codec, 'Other name', 'Mia').room.id).toBe(room.id);
    // the link opens the same room
    const link = codec.buildLink({ room, ghosts: [] }, 'https://tokentails.com/badcat');
    const parsed = codec.parseLink(new URL(link));
    expect(parsed.room?.id).toBe(room.id);
    expect(parsed.room?.title).toBe("Zyg's Kitchen");
  });

  it('formats the speed-build clock and badge', () => {
    expect(formatBuildTime(0)).toBe('0:00');
    expect(formatBuildTime(87_000)).toBe('1:27');
    expect(formatBuildTime(59_999)).toBe('0:59');
    expect(formatBuildTime(-5)).toBe('0:00');
    expect(formatBuildTime(Number.NaN)).toBe('0:00');
    expect(speedClock(0)).toEqual({ text: '1:30', over: false });
    expect(speedClock(3_000)).toEqual({ text: '1:27', over: false });
    expect(speedClock(90_000)).toEqual({ text: '0:00', over: false });
    expect(speedClock(95_000)).toEqual({ text: '+0:05', over: true });
    expect(speedBadge(87_000, true)).toBe('built in 1:27');
    expect(speedBadge(87_000, false)).toBe('');
    expect(speedBadge(91_000, true)).toBe('');
  });

  it('admin export is RoomDef JSON', () => {
    const room = validKitchen();
    const parsed = JSON.parse(exportJson(room, 'room-kitchen')) as RoomDef;
    expect(parsed.id).toBe('room-kitchen');
    expect(parsed.props).toEqual(room.props);
    expect(propKind(parsed.props[0].kind)).toBeTruthy();
  });
});

describe('remix of authored rooms (round 2: none could ever publish)', () => {
  it('every maker-open daily room, preview days included, passes the maker check as a remix', () => {
    for (let d = -3; d <= 40; d++) {
      const r = content.dailyRoom(d);
      const sh = SH[r.shell];
      if (!sh.maker) continue;
      const res = check(editableCopy(r, sh), content, { maxBudget: budgetCapFor(r) });
      expect({ d, errors: res.errors }).toEqual({ d, errors: [] });
    }
  });
  it('the remix cap is the authored budget (min 3,000, max 10,000); a fresh room keeps 3,000', () => {
    expect(budgetCapFor(null)).toBe(MAKER_MAX_BUDGET);
    expect(budgetCapFor({ props: [] })).toBe(MAKER_MAX_BUDGET);
    expect(budgetCapFor({ props: Array.from({ length: 12 }, () => ({ kind: 6 })) } as RoomDef)).toBe(4800);
    expect(budgetCapFor({ props: Array.from({ length: 40 }, () => ({ kind: 17 })) } as RoomDef)).toBe(10000);
  });
});
