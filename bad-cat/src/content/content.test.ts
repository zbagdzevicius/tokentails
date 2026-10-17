import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOSS_TICKS, BTN_SWAT, DEFAULT_CAT, NO_INPUT, ROOM_EVENT_NAMES, RUN_TICKS, propKind, type RoomDef, type TickInput } from '../types';
import { initSim, runToEnd } from '../sim';
import { encodeRoom } from '../codec';
import { PINK_PAW_CATS } from '../platform';
import {
  archive,
  content,
  dailyEntry,
  dailyRoom,
  dayLabel,
  dayNoFor,
  glassRoom,
  KITCHEN,
  KITCHEN_VARIANTS,
  pickerRooms,
  resolve,
  roomForDay,
  roomLabel,
  ROUTINES,
  SHELL,
  SHELLS,
  validate,
  weekdayOf,
  FTUE_EVENT_TICK,
  DECOR_FURNITURE,
  WEEKDAY_TELEGRAPH,
  DAILY_ROOMS,
  buildDailyRoom,
  travelTicks,
  chaosBudget,
} from './index';
import { cableCell, seatBesideSurface, spawnProblem } from './validate';
import { KITS } from './kits';
import { dateOfDay, recipeForDay } from './schedule';

const here = dirname(fileURLToPath(import.meta.url));
const legacyRooms = (): RoomDef[] => [glassRoom(), ...KITCHEN_VARIANTS, dailyRoom(0), dailyRoom(-40)];
const days = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const slugs = (r: RoomDef): string[] => r.props.filter((p) => p.target).map((p) => propKind(p.kind)!.id);

describe('frozen v4 content', () => {
  it('The Glass and kitchen-v1..7 JSON are byte-identical (v4 ghosts depend on them)', () => {
    const pinned: Record<string, string> = {
      glass: '0c841554004c9f71ba4525139f769b3ed7e0a6d0',
      'kitchen-v1': '70fc1959a09bf99f254033bccc97016ff4776427',
      'kitchen-v2': 'c875a2f571d9097ddb14e50280c3ed579e97d87a',
      'kitchen-v3': '0fcb77d0872bd1c3227e7baa49a4b44c3bee3bf4',
      'kitchen-v4': 'ce4c2e447bb805fe3cdaed643761e3c941fd8e50',
      'kitchen-v5': '28796667a39bd932096a2f17f7446afdcd2836d2',
      'kitchen-v6': 'f054bbfd3a453c20e585619e2945224de71be450',
      'kitchen-v7': 'cb70fd8c432645605d5d06dbdf80fe02b0215fbc',
    };
    for (const [id, sha] of Object.entries(pinned)) expect(createHash('sha1').update(readFileSync(join(here, 'rooms', `${id}.json`))).digest('hex'), id).toBe(sha);
  });
  it('Kitchen heightmap, spots and furniture are unchanged', () => {
    expect(createHash('sha1').update(JSON.stringify([KITCHEN.levels, KITCHEN.occludes, KITCHEN.furniture, KITCHEN.humanSpot, KITCHEN.humanEventSpot, KITCHEN.catBed])).digest('hex')).toBe(
      createHash('sha1')
        .update(
          JSON.stringify([
            KITCHEN.levels.slice(),
            KITCHEN.occludes.slice(),
            KITCHEN.furniture,
            { x: 5, z: 2 },
            { x: 12, z: 3 },
            { x: 10, z: 8 },
          ]),
        )
        .digest('hex'),
    );
    expect(KITCHEN.levels.join('')).toBe(
      ['222222222233', '222222222233', '331000001000', '330000000000', '330000100022', '000122220022', '000022221022', '001101000001', '000000111100', '000000111100'].join(''),
    );
    expect(KITCHEN.furniture.length).toBe(21);
  });
  it('Chef Dad tempos 0..3 keep their v4 rule data', () => {
    const rule = (i: number) => {
      const r = ROUTINES[i];
      return [r.id, r.busy, r.telegraph, r.look, r.fakeOutPct, r.fakeOutAfterTick, r.escalateAfterTick, r.lookBonusTicks, r.busyCutTicks, r.eventTick, r.busyFacing, r.lookFacings, r.cue];
    };
    expect(rule(0)).toEqual([0, [90, 270], [24, 24], [45, 90], 20, 900, 1350, 15, 30, 1200, 1, [5, 4, 6, 3, 7], 'stove timer']);
    expect(rule(1)).toEqual([1, [100, 260], [24, 24], [45, 90], 20, 900, 1350, 15, 30, 1050, 1, [5, 4, 6, 3, 7], 'stove timer']);
    expect(rule(2)).toEqual([2, [80, 220], [22, 24], [45, 90], 20, 900, 1350, 15, 30, 1260, 1, [5, 4, 6, 3, 7], 'stove timer']);
    expect(rule(3)).toEqual([3, [120, 300], [24, 24], [60, 105], 20, 900, 1350, 15, 30, 1140, 1, [5, 4, 6, 3, 7], 'stove timer']);
  });
  it('preview days keep the Kitchen rotation, ids and titles', () => {
    expect(dailyRoom(0).id).toBe('preview-001');
    expect(dailyRoom(-1).id).toBe('preview-002');
    expect(dailyRoom(0).title).toBe('Kitchen: Sunday Roast'); // day 0 is a Sunday (round 2: Sunday Roast was on Saturdays) // review round 1: each preview version has a name
    expect(dailyRoom(-6).title).toBe('Kitchen: Breakfast Heist');
    expect(new Set([0, -1, -2, -3, -4, -5, -6].map((n) => dailyRoom(n).title)).size).toBe(7);
    expect(dailyRoom(0).props).toEqual(KITCHEN_VARIANTS[6].props);
    expect(dailyRoom(-6).props).toEqual(KITCHEN_VARIANTS[0].props);
    expect(dailyRoom(0).telegraph).toBeUndefined();
  });
});

describe('shells', () => {
  it('fixed indices, sizes, maker shells', () => {
    expect(SHELLS.map((s) => s.name).slice(0, 10)).toEqual(['Kitchen', 'Living room', 'Bathroom', 'Home office', 'Party room', 'Bedroom', 'Birthday hall', 'Wedding hall', 'Christmas living room', "New Year's party"]);
    SHELLS.forEach((s, i) => {
      expect(s.id, s.name).toBe(i);
      expect(s.levels.length).toBe(s.width * s.depth);
      expect(s.occludes.length).toBe(s.width * s.depth);
      const boss = i >= 6 && i <= 9;
      expect([s.width, s.depth], s.name).toEqual(boss ? [14, 12] : [12, 10]);
      expect(!!s.maker, s.name).toBe(i <= 5);
      expect(!!s.humanSpot2, s.name).toBe(boss || i === SHELL.kitchenDinner);
    });
  });
  it('every shell: occluder, cat bed, spectators 10-15, accomplice spot, furniture on its heightmap, warm palette', () => {
    for (const s of SHELLS) {
      expect(s.occludes.some((o) => o === 1), s.name).toBe(true);
      expect(s.levels[s.catBed.z * s.width + s.catBed.x], s.name).toBe(0);
      expect(s.furniture.some((f) => f.type === 'cat-bed'), s.name).toBe(true);
      expect(s.spectatorSlots!.length, s.name).toBeGreaterThanOrEqual(10);
      expect(s.spectatorSlots!.length, s.name).toBeLessThanOrEqual(15);
      expect(s.accompliceSpot, s.name).toBeDefined();
      expect(s.wallColor, s.name).toBeDefined();
      for (const f of s.furniture) {
        if (DECOR_FURNITURE.includes(f.type)) continue;
        for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) expect(s.levels[z * s.width + x], `${s.name} ${f.type} ${x},${z}`).toBe(f.level);
      }
    }
  });
  it('every shell: L0 -> L1 -> L2 -> L3 by +1 jumps, every surface cell reachable from the spawn (empty room)', () => {
    SHELLS.forEach((s, i) => {
      const kit = KITS[i];
      const room: RoomDef = { id: 'x', shell: i, routine: 0, event: 0, width: s.width, depth: s.depth, spawn: kit.spawn, props: [], seed: 1, ticks: RUN_TICKS };
      if (s.humanSpot2) room.routine2 = 9;
      const play = resolve(room, 'ranked');
      const dist = travelTicks(play);
      const levels = new Set<number>();
      for (let c = 0; c < s.width * s.depth; c++) {
        const x = c % s.width;
        const z = (c - x) / s.width;
        const human = (s.humanSpot.x === x && s.humanSpot.z === z) || (s.humanSpot2?.x === x && s.humanSpot2?.z === z);
        if (human) continue;
        expect(dist[c], `${s.name} ${x},${z}`).not.toBe(Infinity);
        levels.add(s.levels[c]);
      }
      expect([...levels].sort(), s.name).toEqual([0, 1, 2, 3]);
    });
  });
  it('twists live in the shells: bathroom mirror, office webcam, Zoom living room webcam, kitchen fridge wall, Christmas mantle beside the tree', () => {
    expect(SHELLS[SHELL.bathroom].mirror).toBeDefined();
    expect(SHELLS[SHELL.office].webcam).toBeDefined();
    expect(SHELLS[SHELL.livingZoom].webcam).toBeDefined();
    expect(SHELLS[SHELL.living].webcam).toBeUndefined();
    expect(KITCHEN.fridgeWall).toBeDefined();
    const x = SHELLS[SHELL.bossChristmas];
    expect(x.levels[1 * x.width + 5]).toBe(0); // the tree spot
    expect(x.levels[0 * x.width + 5]).toBe(3); // the mantle right above it
    for (const s of SHELLS) if (s.roombaLoop) expect(s.roombaLoop.length, s.name).toBeGreaterThanOrEqual(4);
  });
});

describe('routines', () => {
  it('fixed indices, personas, maker humans, twists', () => {
    expect(ROUTINES.map((r) => r.name)).toEqual([
      'Chef Dad', 'Chef Dad', 'Chef Dad', 'Chef Dad', 'Couch Potato', 'Skincare Sis', 'WFH Worker', 'Party Host', 'Napper', 'Grandma', 'Caterer A', 'Caterer B', 'Party Host', 'WFH Worker', 'Christmas Host',
    ]);
    ROUTINES.forEach((r, i) => {
      expect(r.id).toBe(i);
      expect(r.persona, r.name).toBeDefined();
      expect(r.holding, r.name).toBeDefined();
      expect(r.pose, r.name).toBeDefined();
    });
    expect(ROUTINES.filter((r) => r.maker).map((r) => r.id)).toEqual([0, 4, 6, 8]);
    expect(ROUTINES[4]).toMatchObject({ pose: 'sit', holding: 'remote', cue: 'TV jingle' });
    expect(ROUTINES[5]).toMatchObject({ mirror: true, cue: 'mirror hum' });
    expect(ROUTINES[6]).toMatchObject({ onCamera: true, cue: "you're on mute", holding: 'laptop' });
    expect(ROUTINES[8]).toMatchObject({ kind: 'napper', pose: 'lie' });
    const g = ROUTINES[9];
    expect(g.telegraph[0]).toBeGreaterThan(24);
    expect(g.look[0]).toBeGreaterThan(ROUTINES[0].look[0]);
    expect(g.fakeOutPct).toBeLessThan(ROUTINES[0].fakeOutPct);
  });
});

describe('rooms', () => {
  it('validate passes every daily 1..200 (ranked)', () => {
    for (const n of days(1, 200)) {
      const r = dailyRoom(n);
      const rep = validate(resolve(r, 'ranked', n));
      expect(rep.errors, `day ${n} ${r.title}`).toEqual([]);
      expect(rep.firstTargetTicks, r.id).toBeGreaterThanOrEqual(0);
      expect(rep.firstTargetTicks, r.id).toBeLessThanOrEqual(180);
    }
  });
  it('first heist (FTUE) works on every daily 1..200 and every legacy room', () => {
    for (const r of [...legacyRooms(), ...days(1, 200).map(dailyRoom)]) {
      const play = resolve(r, 'ftue');
      const rep = validate(play);
      expect(rep.errors, r.id).toEqual([]);
      expect(rep.firstTargetTicks, r.id).toBeLessThanOrEqual(90);
      expect(spawnProblem(play, play.room.spawn.x, play.room.spawn.z), r.id).toBe('');
    }
  });
  it('a sample room of every shell validates', () => {
    SHELLS.forEach((s, i) => {
      const boss = i >= 6 && i <= 9;
      const room = buildDailyRoom({
        id: `sample-${i}`,
        seed: 777 + i,
        shell: i,
        routine: [0, 4, 5, 6, 7, 8, 12, 10, 12, 12, 0, 13][i],
        routine2: s.humanSpot2 ? [9, 9, 9, 11, 9, 4, 9, 9, 9, 9, 9, 9][i] : undefined,
        event: 0,
        name: 'Sample',
        title: 'Sample',
        telegraph: 20,
        boss,
        targets: i === SHELL.bossChristmas ? [{ kind: 17, at: [5, 1] }, { kind: 2 }, { kind: 1 }] : [{ kind: 2 }, { kind: 1 }, { kind: 7 }],
        wish: 19,
        pinkPawId: PINK_PAW_CATS[0].id,
      });
      if (room.routine2 === undefined) delete room.routine2;
      expect(validate(resolve(room, 'ranked')).errors, s.name).toEqual([]);
      expect(validate(resolve(room, 'ftue')).errors, s.name).toEqual([]);
    });
  });
  it('25-45 props (boss up to 60), exactly 3 targets, budget, cloths, lamps with cables, the Roomba on its loop', () => {
    for (const n of days(1, 63)) {
      const r = dailyRoom(n);
      const boss = !!r.boss;
      expect(r.props.length, r.id).toBeGreaterThanOrEqual(25);
      expect(r.props.length, r.id).toBeLessThanOrEqual(boss ? 60 : 45);
      expect(r.props.filter((p) => p.target).length).toBe(3);
      expect(r.ticks).toBe(boss ? BOSS_TICKS : RUN_TICKS);
      expect([r.width, r.depth]).toEqual(boss ? [14, 12] : [12, 10]);
      expect(chaosBudget(r), r.id).toBeGreaterThan(0);
      for (const p of r.props) {
        const k = propKind(p.kind)!;
        if (k.pull === 'cloth') expect((p.w ?? 1) * (p.d ?? 1), r.id).toBeGreaterThan(1);
        if (k.pull === 'cable') {
          expect(p.cable, r.id).toBeDefined();
          // the lamp faces its cable, so a codec that drops `cable` finds the same cell from `rot`
          expect(cableCell({ ...p, cable: undefined }), r.id).toEqual(p.cable);
        }
      }
      const shell = SHELLS[r.shell];
      const roomba = r.props.find((p) => propKind(p.kind)?.actor === 'roomba');
      if (shell.roombaLoop) expect(roomba && shell.roombaLoop.some((c) => c.x === roomba.x && c.z === roomba.z), r.id).toBe(true);
    }
  });
  it('every authored day 1..21 is baked JSON with an accomplice, a wish and a weekday telegraph', () => {
    expect(DAILY_ROOMS.length).toBe(21);
    for (const n of days(1, 21)) {
      const r = dailyRoom(n);
      expect(r.id).toBe(`daily-${String(n).padStart(3, '0')}`);
      expect(r.accomplice?.pinkPawId, r.id).toBeDefined();
      const w = r.props[r.accomplice!.wishPropIndex];
      expect(w && !w.target, r.id).toBe(true);
      expect(r.telegraph).toBe(WEEKDAY_TELEGRAPH[weekdayOf(n)]);
      expect(r.accomplice!.x).toBe(SHELLS[r.shell].accompliceSpot!.x);
    }
  });
  it('dailyRoom is deterministic, seeds differ per day, copies are independent', () => {
    expect(dailyRoom(18)).toEqual(dailyRoom(18));
    expect(dailyRoom(118)).toEqual(dailyRoom(118));
    expect(dailyRoom(18).seed).not.toBe(dailyRoom(11).seed);
    const a = dailyRoom(2);
    a.props[0].x = 99;
    expect(dailyRoom(2).props[0].x).not.toBe(99);
    const b = dailyRoom(90);
    b.props.length = 0;
    expect(dailyRoom(90).props.length).toBeGreaterThan(0);
  });
  it('The Glass: wine glass on the counter edge is target #1', () => {
    const g = glassRoom();
    expect(g.id).toBe('glass');
    expect(g.title).toBe('The Glass');
    expect(propKind(g.props[0].kind)!.id).toBe('wine-glass');
    expect(g.props[0].target).toBe(true);
    expect(g.props[0].level).toBe(2);
    expect(KITCHEN.levels[(g.props[0].z + 1) * 12 + g.props[0].x]).toBe(0);
  });
  it('legacy first heist: run, hop and swat crashes a Must-Wreck target within 2 s', () => {
    for (const r of legacyRooms()) {
      const play = resolve(r, 'ftue');
      const inputs: TickInput[] = [];
      for (let i = 0; i < 26; i++) inputs.push({ dir: 3, speed: 2, buttons: 0 });
      inputs.push({ dir: 0, speed: 0, buttons: BTN_SWAT });
      const res = runToEnd(play, DEFAULT_CAT, inputs);
      const hit = res.events.find((e) => e.t === 'target');
      expect(hit, r.id).toBeDefined();
      expect(hit!.tick, r.id).toBeLessThanOrEqual(60);
    }
  });
  it('legacy Kitchen targets never only fall north out of sight', () => {
    for (const r of legacyRooms()) for (const p of r.props) if (p.target) expect(p.z === 5 && (p.x === 5 || p.x === 6), `${r.id} ${p.x},${p.z}`).toBe(false);
  });
});

describe('Appendix A (days 1-14) and week 3', () => {
  const A: [number, number, string, string[], string, string][] = [
    [1, SHELL.kitchen, 'Chef Dad', ['wine-glass', 'fruit-bowl', 'egg-carton'], 'tuna-can', 'KETTLE!'],
    [2, SHELL.living, 'Couch Potato', ['tv-remote', 'popcorn-bowl', 'lamp'], 'yarn-ball', 'PIZZA!'],
    [3, SHELL.bathroom, 'Skincare Sis', ['toilet-roll', 'perfume', 'toothbrush-cup'], 'rubber-duck', 'PHONE CALL!'],
    // round 2 (QA): Thursday's Zoom Call is in the Home office from day 4 (the sofa webcam saw 2 of 21 props)
    [4, SHELL.office, 'WFH Worker', ['mug', 'phone', 'potted-plant'], 'pen-cup', "YOU'RE ON MUTE!"],
    [5, SHELL.party, 'Party Host', ['cake', 'cups-tower', 'balloon'], 'ribbon', 'SURPRISE!'],
    [6, SHELL.bossBirthday, 'Party Host + Grandma', ['cake', 'gift-stack', 'punch-bowl'], 'birthday-candles', 'SPEECHES!'],
    [7, SHELL.bedroom, 'Napper', ['laundry-basket', 'alarm-clock', 'jewellery-dish'], 'sock', 'ALARM!'],
    [8, SHELL.kitchen, 'Chef Dad', ['cookie-tray', 'flour-bag', 'mixer-bowl'], 'butter', 'OVEN DING!'],
    [9, SHELL.living, 'Couch Potato', ['board-game', 'snack-tower', 'controller'], 'dice', 'DELIVERY!'],
    [10, SHELL.bathroom, 'Skincare Sis', ['scented-candle', 'face-mask-jar', 'towel-stack'], 'rubber-duck', 'PHONE CALL!'],
    [11, SHELL.kitchenDinner, 'Chef Dad + Grandma', ['gravy-boat', 'pie', 'turkey-platter'], 'turkey-leg', 'GUESTS!'],
    [12, SHELL.party, 'Party Host', ['box-tower', 'bubble-wrap', 'receipt-pile'], 'cardboard-box', 'COURIER!'],
    [13, SHELL.bossWedding, 'Two caterers', ['cake', 'champagne-tower', 'bouquet'], 'ribbon', 'SPEECHES!'],
    [14, SHELL.bedroom, 'Napper', ['phone', 'water-glass', 'potted-plant'], 'blanket', 'ALARM!'],
  ];
  it.each(A)('day %i', (n, shell, human, targets, wish, event) => {
    const r = dailyRoom(n);
    const e = dailyEntry(n);
    expect(r.shell).toBe(shell);
    expect(e.human).toBe(human);
    expect(slugs(r)).toEqual(targets);
    expect(e.wish).toBe(wish);
    expect(e.event).toBe(event);
    expect(ROOM_EVENT_NAMES[r.event]).toBe(event);
  });
  it('Day #1 title, the Zoom call routine and the bosses', () => {
    expect(dailyRoom(1).title).toBe('Kitchen #1: Breakfast Heist');
    expect(dailyRoom(4).routine).toBe(6);
    expect(ROUTINES[dailyRoom(4).routine].onCamera).toBe(true);
    expect(dailyRoom(6)).toMatchObject({ boss: true, routine2: 9, theme: 'birthday' });
    expect(dailyRoom(13)).toMatchObject({ boss: true, routine: 10, routine2: 11, theme: 'wedding' });
    expect(dailyRoom(11).routine2).toBe(9);
  });
  it('week 3: Leftovers, Season 1 themes, the Christmas Tree boss, Sunday Nap', () => {
    expect(dailyRoom(15).title).toBe('Kitchen #15: Leftovers');
    expect(dailyRoom(15).theme).toBeUndefined();
    expect(dailyRoom(16)).toMatchObject({ shell: SHELL.living, title: 'Living room #16: Tinsel TV Night', theme: 'xmas' });
    expect(dailyRoom(17)).toMatchObject({ shell: SHELL.bathroom, title: 'Bathroom #17: Bubble Bath', theme: 'xmas' });
    expect(dailyRoom(18)).toMatchObject({ shell: SHELL.office, title: 'Home office #18: Zoom Call', theme: 'xmas', routine: 6 });
    expect(dailyRoom(19)).toMatchObject({ shell: SHELL.party, title: 'Party room #19: Ugly Sweater Felony Friday', theme: 'xmas' });
    expect(dailyRoom(20)).toMatchObject({ shell: SHELL.bossChristmas, title: 'Boss: Christmas Tree #20', theme: 'xmas', boss: true });
    expect(slugs(dailyRoom(20))[0]).toBe('christmas-tree');
    expect(dailyRoom(21)).toMatchObject({ shell: SHELL.bedroom, title: 'Bedroom #21: Sunday Nap', routine: 8 });
    expect(dailyEntry(19).felonyFriday).toBe(true);
    expect(dailyEntry(5).felonyFriday).toBe(true);
    expect(dailyEntry(6).felonyFriday).toBeUndefined();
  });
});

describe('calendar', () => {
  it('Day #1 on 2026-11-16 and 18 seventeen days later, at any local hour', () => {
    for (const h of [0, 1, 12, 23]) {
      expect(dayNoFor(new Date(2026, 10, 16, h, 59))).toBe(1);
      expect(dayNoFor(new Date(2026, 11, 3, h, 30))).toBe(18);
    }
    expect(dayNoFor(new Date(2026, 10, 15, 23, 59, 59))).toBe(0);
    expect(dayNoFor(new Date('nope'))).toBe(0);
  });
  it('dayNo -> weekday across the DST changes (EU Mar 28 / Oct 31 2027, US Mar 14 2027)', () => {
    expect(dayNoFor(new Date(2027, 2, 29, 12))).toBe(134);
    expect(weekdayOf(134)).toBe(0); // Mon Mar 29 2027
    for (const [y, m, d, wd] of [
      [2027, 2, 27, 5], // Sat before the EU change
      [2027, 2, 28, 6], // the EU change (Sunday)
      [2027, 2, 15, 0], // after the US change
      [2027, 9, 31, 6], // the EU change back (Sunday)
      [2027, 10, 1, 0],
    ] as const) {
      for (const h of [0, 3, 23]) {
        const n = dayNoFor(new Date(y, m, d, h));
        expect(weekdayOf(n), `${y}-${m + 1}-${d} ${h}h`).toBe(wd);
        expect(dateOfDay(n)).toBe(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    expect(weekdayOf(1)).toBe(0);
    expect(weekdayOf(0)).toBe(6);
    expect(weekdayOf(-6)).toBe(0);
  });
  it('weekday telegraph: Mon 24, Tue 22, Wed 20, Thu 19, Fri 17, Sat 15, Sun 24 (Grandma keeps her slow warning)', () => {
    expect(WEEKDAY_TELEGRAPH).toEqual([24, 22, 20, 19, 17, 15, 24]);
    for (const n of days(1, 70)) {
      const r = dailyRoom(n);
      const play = resolve(r, 'ranked', n);
      const want = WEEKDAY_TELEGRAPH[weekdayOf(n)];
      const slow = (i: number) => Math.max(0, ROUTINES[i].telegraph[0] - 24);
      expect(play.routine.telegraph, `day ${n}`).toEqual([want + slow(r.routine), want + slow(r.routine)]);
      if (r.routine2 !== undefined) expect(play.routine2!.telegraph).toEqual([want + slow(r.routine2), want + slow(r.routine2)]);
      expect(ROUTINES[r.routine].telegraph).toEqual(ROUTINES[r.routine].telegraph); // never mutated
    }
    expect(resolve(dailyRoom(6), 'ranked').routine2!.telegraph).toEqual([15 + 8, 15 + 8]);
  });
  it('Season 1: every Saturday Dec 1 - Jan 10 is the Christmas Tree boss, Dec 31 is the New Year party, Feb 14 is Valentine', () => {
    for (const n of days(16, 56)) {
      const date = dateOfDay(n);
      const r = dailyRoom(n);
      if (date === '2026-12-31') expect(r).toMatchObject({ shell: SHELL.bossNye, boss: true, theme: 'nye' });
      else if (weekdayOf(n) === 5) {
        expect(r, date).toMatchObject({ shell: SHELL.bossChristmas, boss: true, theme: 'xmas' });
        expect(slugs(r)[0]).toBe('christmas-tree');
      } else expect(r.theme, date).toBe('xmas');
    }
    const v = dailyRoom(91);
    expect(dateOfDay(91)).toBe('2027-02-14');
    expect(v).toMatchObject({ boss: true, theme: 'valentine' });
    expect(v.title).toBe("Boss: Valentine's Dinner #91");
  });
  it('Saturdays outside Season 1 alternate Birthday and Wedding', () => {
    const sats = days(57, 200).filter((n) => weekdayOf(n) === 5);
    const shells = sats.map((n) => dailyRoom(n).shell);
    for (let i = 1; i < shells.length; i++) expect(shells[i], dateOfDay(sats[i])).not.toBe(shells[i - 1]);
    expect(new Set(shells)).toEqual(new Set([SHELL.bossBirthday, SHELL.bossWedding]));
    expect(dailyRoom(6).shell).toBe(SHELL.bossBirthday);
    expect(dailyRoom(13).shell).toBe(SHELL.bossWedding);
  });
  it('the week: Mon Kitchen, Tue Living room, Wed Bathroom, Thu Home office, Fri Party room, Sun Bedroom (after week 3)', () => {
    const want = [SHELL.kitchen, SHELL.living, SHELL.bathroom, SHELL.office, SHELL.party, -1, SHELL.bedroom];
    for (const n of days(57, 200)) {
      const date = dateOfDay(n);
      if (weekdayOf(n) === 5 || date.endsWith('02-14') || date.endsWith('12-31')) continue;
      expect(dailyRoom(n).shell, date).toBe(want[weekdayOf(n)]);
    }
  });
});

describe('labels, entries, archive, picker', () => {
  it('roomLabel / dayLabel', () => {
    expect(roomLabel(1)).toBe('Kitchen #1');
    expect(roomLabel(18)).toBe('Home office #18');
    expect(roomLabel(20)).toBe('Boss: Christmas Tree #20');
    expect(roomLabel(4)).toBe('Home office #4');
    expect(roomLabel(11)).toBe('Kitchen #11');
    expect(dayLabel(18)).toBe('Home office #18');
    expect(roomLabel(0)).toBe('Sunday Roast · Nov 15');
    expect(roomLabel(-13)).toBe('Breakfast Heist · Nov 2');
  });
  it('dailyEntry: schedule fields', () => {
    const e = dailyEntry(20);
    expect(e).toMatchObject({ dayNo: 20, date: '2026-12-05', weekday: 5, roomId: 'daily-020', label: 'Boss: Christmas Tree #20', boss: true, theme: 'xmas', season: 's1', human: 'Christmas Host + Grandma', routine: 14, routine2: 9 });
    expect(e.twist).toBeTruthy();
    expect(e.accomplice).toBe(dailyRoom(20).accomplice!.pinkPawId);
    expect(dailyEntry(3).twist).toMatch(/Mirror/);
    expect(dailyEntry(7).twist).toMatch(/noise meter/);
    expect(dailyEntry(18).twist).toMatch(/camera/);
    const p = dailyEntry(0);
    expect(p).toMatchObject({ preview: true, roomId: 'preview-001', label: 'Sunday Roast · Nov 15', weekday: 6 });
    expect(dailyEntry(1).season).toBe('s0');
  });
  it('accomplices rotate the waiting Pink Paw cats', () => {
    const ids = days(1, 8).map((n) => dailyEntry(n).accomplice);
    expect(new Set(ids).size).toBe(Math.min(8, PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED').length));
  });
  it('archive: newest first, never before Day #1', () => {
    expect(archive(30, 14).map((e) => e.dayNo)).toEqual(days(16, 29).reverse());
    expect(archive(3, 14).map((e) => e.dayNo)).toEqual([2, 1]);
    expect(archive(1, 14)).toEqual([]);
    expect(archive(-10, 30).every((e) => e.preview)).toBe(true);
  });
  it('picker: The Glass first, today, then 14 past days newest first', () => {
    const p = pickerRooms(30);
    expect(p[0].label).toBe('The Glass');
    expect(p[0].dayNo).toBeUndefined();
    expect(p[1]).toMatchObject({ dayNo: 30, label: `Today: ${roomLabel(30)}` });
    expect(p.slice(2).map((x) => x.dayNo)).toEqual(days(16, 29).reverse());
    expect(p.length).toBe(16);
    expect(pickerRooms(1).length).toBe(2);
    expect(pickerRooms(3).map((x) => x.dayNo)).toEqual([undefined, 3, 2, 1]);
  });
  it('before launch the picker shows The Glass and all 7 Kitchen variants', () => {
    const p = pickerRooms(-30);
    expect(p.length).toBe(8);
    expect(new Set(p.slice(1).map((x) => JSON.stringify(x.room.props))).size).toBe(7);
  });
});

describe('hand-edited schedule fields', () => {
  it('Community Sunday: a valid room code becomes the day, credited to its author', () => {
    const code = encodeRoom({ ...glassRoom() });
    const r = roomForDay(21, { community: { code, title: "Mia's Kitchen", author: 'Mia' } });
    expect(r).toMatchObject({ id: 'daily-021', author: 'Mia', title: "Kitchen #21: Mia's Kitchen", telegraph: 24 });
    expect(validate(resolve(r, 'ranked')).ok).toBe(true);
  });
  it('Community Sunday: an invalid code, a non-Sunday or a day before week 3 keeps the generated room', () => {
    const generated = dailyRoom(21);
    expect(roomForDay(21, { community: { code: 'not-a-room', title: 'x', author: 'y' } })).toEqual(generated);
    const broken = { ...glassRoom(), props: glassRoom().props.slice(0, 5) }; // too few props
    expect(roomForDay(21, { community: { code: encodeRoom(broken), title: 'x', author: 'y' } })).toEqual(generated);
    const code = encodeRoom(glassRoom());
    expect(roomForDay(20, { community: { code, title: 'x', author: 'y' } }).author).toBeUndefined();
    expect(roomForDay(14, { community: { code, title: 'x', author: 'y' } }).author).toBeUndefined();
  });
  it('sponsor: the product lands on a validated free cell and RoomDef.sponsor points at it', () => {
    for (const n of [1, 2, 3, 5, 6, 18, 20, 64]) {
      const r = roomForDay(n, { sponsor: { label: 'Purrfect Tuna', url: 'https://example.com' } });
      expect(r.sponsor, `day ${n}`).toBeDefined();
      const p = r.props[r.sponsor!.propIndex];
      expect(propKind(p.kind)!.sponsor).toBe(true);
      expect(r.sponsor!.label).toBe('Purrfect Tuna');
      expect(validate(resolve(r, 'ranked')).errors).toEqual([]);
    }
  });
});

describe('resolve', () => {
  it('bundles shell and routines; legacy rooms keep the routine object; FTUE pins the event at 450', () => {
    const k = KITCHEN_VARIANTS[2];
    const play = resolve(k, 'ranked', 18);
    expect(play.shell).toBe(SHELLS[0]);
    expect(play.routine).toBe(ROUTINES[k.routine]);
    expect(play.dayNo).toBe(18);
    const f = resolve(k, 'ftue');
    expect(f.routine.eventTick).toBe(FTUE_EVENT_TICK);
    expect('dayNo' in f).toBe(false);
    expect(play.routine2).toBeUndefined();
    const boss = resolve(dailyRoom(6), 'ranked');
    expect(boss.routine2?.name).toBe('Grandma');
  });
  it('unknown indices fall back to the Kitchen and Chef Dad; routine2 needs a second human spot', () => {
    const r = { ...glassRoom(), shell: 99, routine: 99, routine2: 99 };
    const play = resolve(r, 'ranked');
    expect(play.shell).toBe(SHELLS[0]);
    expect(play.routine).toBe(ROUTINES[0]);
    expect(play.routine2).toBeUndefined();
    expect(validate(play).errors.join('\n')).toMatch(/routine2 set but the shell has no humanSpot2/);
  });
  it('content api object', () => {
    expect(content.dailyRoom(1).id).toBe('daily-001');
    expect(content.dailyEntry!(1).roomId).toBe('daily-001');
    expect(content.archive!(5, 2).length).toBe(2);
    expect(content.roomLabel!(20)).toBe('Boss: Christmas Tree #20');
    expect(content.shells!.length).toBe(SHELLS.length);
    expect(content.routines!.length).toBe(ROUTINES.length);
  });
  it('the recipe of a day is deterministic', () => {
    expect(recipeForDay(40)).toEqual(recipeForDay(40));
    expect(recipeForDay(40).seed).not.toBe(recipeForDay(41).seed);
  });
});

describe('validator catches broken rooms', () => {
  const base = (): RoomDef => glassRoom();
  it('prop on the human, wrong level, duplicate cell, missing target', () => {
    const r = base();
    r.props.push({ kind: 2, x: 5, z: 2, level: 0, rot: 0 });
    r.props.push({ kind: 2, x: 0, z: 0, level: 0, rot: 0 });
    r.props.push({ kind: 2, x: r.props[3].x, z: r.props[3].z, level: r.props[3].level, rot: 0 });
    r.props[1].target = undefined;
    const text = validate(resolve(r, 'ranked')).errors.join('\n');
    expect(text).toMatch(/on the human/);
    expect(text).toMatch(/level 0 != shell level 2/);
    expect(text).toMatch(/already holds a prop/);
    expect(text).toMatch(/2 targets/);
  });
  it('first heist rejects an L2 target with no L1 seat beside its surface (floor-to-L2 jumps do not exist)', () => {
    for (const r of [glassRoom(), ...KITCHEN_VARIANTS]) {
      const play = resolve(r, 'ftue');
      for (const p of play.room.props) if (p.target && p.level >= 2) expect(seatBesideSurface(play, p.x, p.z), `${r.id} ${p.x},${p.z}`).toBe(true);
    }
    const b = resolve(KITCHEN_VARIANTS[0], 'ftue');
    const W = b.shell.width;
    const flat = { ...b, shell: { ...b.shell, levels: b.shell.levels.map((l) => (l === 1 ? 0 : l)) } };
    const l2 = b.room.props.find((p) => p.target && b.shell.levels[p.z * W + p.x] === 2);
    if (l2) {
      expect(seatBesideSurface(flat, l2.x, l2.z)).toBe(false);
      expect(validate(flat).errors.some((e) => e.includes('floor-to-L2'))).toBe(true);
    }
  });
  it('unreachable target and too few props', () => {
    const r = base();
    r.props = r.props.filter((p) => !p.target).slice(0, 10);
    r.props.push({ kind: 1, x: 10, z: 1, level: 3, rot: 0, target: true });
    r.props.push({ kind: 2, x: 10, z: 0, level: 3, rot: 0, target: true });
    r.props.push({ kind: 2, x: 11, z: 0, level: 3, rot: 0, target: true });
    const text = validate(resolve(r, 'ranked')).errors.join('\n');
    expect(text).toMatch(/prop count/);
    expect(text).toMatch(/cannot be wrecked/);
  });
  it('v5 data: cloth across two surfaces, cable off the floor, a tree without a mantle, a box on a table, a broken wish', () => {
    const r = dailyRoom(5); // party room with a cloth
    const cloth = r.props.find((p) => p.kind === 14)!;
    cloth.w = 8;
    const lamp = dailyRoom(2);
    const l = lamp.props.find((p) => p.kind === 9)!;
    l.cable = { x: 2, z: 8 };
    const tree = dailyRoom(20);
    tree.props[0] = { ...tree.props[0], x: 10, z: 6 };
    const box = dailyRoom(12);
    const bx = box.props.find((p) => p.kind === 54)!;
    Object.assign(bx, { x: 3, z: 5, level: 2 });
    const wish = dailyRoom(1);
    wish.accomplice!.wishPropIndex = 0;
    const t = (room: RoomDef) => validate(resolve(room, 'ranked')).errors.join('\n');
    expect(t(r)).toMatch(/cloth (spans two surfaces|leaves the grid)/);
    expect(t(lamp)).toMatch(/cable cell 2,8 is not floor/);
    expect(t(tree)).toMatch(/no L3 cell beside it/);
    expect(t(box)).toMatch(/enterable props stand on the floor/);
    expect(t(wish)).toMatch(/wish is a Must-Wreck target/);
  });
  it('shell data: broken Roomba loop, floating spectator, second human without routine2, budget', () => {
    const r = dailyRoom(2);
    const shell = { ...SHELLS[1], roombaLoop: [{ x: 9, z: 6 }, { x: 11, z: 6 }, { x: 11, z: 7 }, { x: 9, z: 7 }], spectatorSlots: [...SHELLS[1].spectatorSlots!, { x: 6, z: 6, level: 2 as const }] };
    const t1 = validate({ ...resolve(r, 'ranked'), shell }).errors.join('\n');
    expect(t1).toMatch(/not closed and 8-way adjacent/);
    expect(t1).toMatch(/floats/);
    const two = { ...resolve(dailyRoom(1), 'ranked') };
    two.shell = { ...two.shell, humanSpot2: { x: 9, z: 9 } };
    expect(validate(two).errors.join('\n')).toMatch(/no routine2/);
    const rich = dailyRoom(3);
    for (const p of rich.props) if (!p.target && !propKind(p.kind)!.grabbable && !propKind(p.kind)!.actor && p.kind !== 33) p.kind = 6; // cakes everywhere
    expect(validate(resolve(rich, 'ranked')).errors.join('\n')).toMatch(/chaos budget/);
  });
});

describe('sim smoke', () => {
  let simReady = true;
  try {
    initSim(resolve(glassRoom(), 'practice'), DEFAULT_CAT);
  } catch {
    simReady = false;
  }
  it.skipIf(!simReady)('every legacy room and every authored day runs to the end with no input', () => {
    for (const r of [...legacyRooms(), ...days(1, 21).map(dailyRoom)]) {
      const res = runToEnd(resolve(r, 'practice'), DEFAULT_CAT, [NO_INPUT]);
      expect(res.roomId).toBe(r.id);
    }
  });
});
