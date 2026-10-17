import { describe, expect, it } from 'vitest';
import {
  BTN_GRAB,
  BTN_JUMP,
  BTN_SWAT,
  BONUS,
  CUDDLE_TICKS,
  CatAct,
  DEFAULT_CAT,
  FTUE_TICKS,
  HumanSt,
  NO_INPUT,
  PropSt,
  SUSPICION_MAX,
  type Dir8,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type Speed,
  type TickInput,
} from '../types';
import { canStep, coneCells, hashState, initSim, runToEnd, stepSim, swatTarget, nextRng, seedRng, rngInt } from './index';
import { facingToward, looksAt, seesCell } from './cone';
import { makeRoom } from './fixtures';

const inp = (dir: Dir8, speed: Speed = 2, buttons = 0): TickInput => ({ dir, speed, buttons });

function run(s: SimState, play: PlayableRoom, input: TickInput, n = 1, out: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) stepSim(s, play, input, out);
  return out;
}

/** Step NO_INPUT until the cat is free (no step, no lock). Returns ticks spent. */
function settle(s: SimState, play: PlayableRoom, out: SimEvent[] = []): number {
  let n = 0;
  while ((s.cat.stepTicks > 0 || s.cat.actTimer > 0) && n < 100) {
    stepSim(s, play, NO_INPUT, out);
    n++;
  }
  return n;
}

function place(s: SimState, x: number, z: number, facing: Facing): void {
  const c = s.cat;
  c.x = c.fromX = x;
  c.z = c.fromZ = z;
  c.level = c.fromLevel = s.grid.level[z * s.grid.w + x] as Level;
  c.facing = facing;
}

describe('cat stepping (GDD 4.1)', () => {
  it('orthogonal and diagonal step timing', () => {
    for (const [dir, speed, ticks] of [
      [3, 2, 7],
      [3, 1, 13],
      [4, 2, 10],
      [4, 1, 19],
    ] as [Dir8, Speed, number][]) {
      const play = makeRoom();
      const s = initSim(play, DEFAULT_CAT);
      run(s, play, inp(dir, speed));
      expect(s.cat.stepTicks).toBe(ticks);
      run(s, play, NO_INPUT, ticks - 1);
      expect(s.cat.stepTicks).toBe(ticks); // still mid-step
      run(s, play, NO_INPUT);
      expect(s.cat.stepTicks).toBe(0);
    }
  });
  it('holding a direction chains steps every 7 trot ticks', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    run(s, play, inp(3), 15); // steps start at ticks 0, 7, 14
    expect(s.cat.x).toBe(9);
    expect(s.cat.fromX).toBe(8);
  });
  it('refuses corner cutting past the chair and slides along the free orthogonal part', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT); // (6,3), chair L1 at (6,2)
    expect(canStep(s, 6, 3, 0, 2)).toBe(false); // NE to (7,2): orthogonal (6,2) is higher
    run(s, play, inp(2)); // the diagonal falls back to E (north is the chair)
    expect([s.cat.x, s.cat.z, s.cat.stepTicks]).toEqual([7, 3, 7]);
    expect(s.cat.facing).toBe(3);
  });
  it('a blocked diagonal tries the orthogonal part nearest the old facing first', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 7, 3, 1); // facing N; NW (6,2) is the chair (higher), so the diagonal is refused
    run(s, play, inp(8)); // N (7,2) is tried before W (6,3) because the cat faced N
    expect([s.cat.x, s.cat.z]).toEqual([7, 2]);
    const s2 = initSim(play, DEFAULT_CAT);
    place(s2, 7, 3, 7); // facing W: W first
    run(s2, play, inp(8));
    expect([s2.cat.x, s2.cat.z]).toEqual([6, 3]);
  });
  it('blocks steps up and into the human', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    run(s, play, inp(1)); // chair is higher
    expect(s.cat.z).toBe(3);
    place(s, 10, 5, 3);
    run(s, play, inp(3)); // human at (11,5)
    expect(s.cat.x).toBe(10);
  });
  it('loafs after 10 idle ticks', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    const ev = run(s, play, NO_INPUT, 9);
    expect(s.cat.act).toBe(CatAct.IDLE);
    run(s, play, NO_INPUT, 1, ev);
    expect(s.cat.act).toBe(CatAct.LOAF);
    expect(ev.filter((e) => e.t === 'loaf').length).toBe(1);
  });
});

describe('jumps (GDD 4.1)', () => {
  it('up exactly +1, refuses +2, down any', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    const ev = run(s, play, inp(1, 0, BTN_JUMP)); // floor -> chair L1
    expect(ev.some((e) => e.t === 'jump')).toBe(true);
    expect([s.cat.x, s.cat.z, s.cat.level, s.cat.stepTicks]).toEqual([6, 2, 1, 12]);
    settle(s, play);
    run(s, play, inp(1, 0, BTN_JUMP)); // chair L1 -> counter L2
    expect(s.cat.level).toBe(2);
    settle(s, play);
    run(s, play, inp(3, 0, BTN_JUMP)); // counter -> counter same level: refused
    expect([s.cat.x, s.cat.stepTicks]).toEqual([6, 0]);

    place(s, 3, 2, 1); // floor next to the counter, no seat nearby: +2 refused and said so (SIM_VERSION 4)
    const refused = run(s, play, inp(1, 0, BTN_JUMP));
    expect([s.cat.z, s.cat.stepTicks]).toEqual([2, 0]);
    expect(refused.filter((e) => e.t === 'cantReach')).toEqual([{ t: 'cantReach', tick: expect.any(Number), level: 2 }]);

    place(s, 10, 1, 5); // fridge L3 -> floor L0
    run(s, play, inp(5, 0, BTN_JUMP));
    expect([s.cat.z, s.cat.level]).toEqual([2, 0]);
  });
  it('a +2 jump hops onto a seat next to the high surface first (SIM_VERSION 4)', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 5, 2, 1); // floor facing the counter (5,1) L2; the chair (6,2) L1 is beside the cat and the counter
    const ev = run(s, play, inp(1, 0, BTN_JUMP));
    expect(ev.some((e) => e.t === 'cantReach')).toBe(false);
    expect(ev.find((e) => e.t === 'jump')).toMatchObject({ from: 0, to: 1 });
    expect([s.cat.x, s.cat.z, s.cat.level]).toEqual([6, 2, 1]);
    settle(s, play);
    run(s, play, inp(1, 0, BTN_JUMP)); // second press: chair -> counter
    expect(s.cat.level).toBe(2);
  });
  it('pushing into a too-high ledge routes through a seat, or reports cantReach about once a second', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 5, 2, 1);
    run(s, play, inp(1), 6);
    expect([s.cat.x, s.cat.z, s.cat.level]).toEqual([6, 2, 1]);
    const s2 = initSim(play, DEFAULT_CAT);
    place(s2, 2, 5, 3); // floor west of the table, no seat
    const ev = run(s2, play, inp(3), 60);
    expect([s2.cat.x, s2.cat.z]).toEqual([2, 5]);
    const n = ev.filter((e) => e.t === 'cantReach').length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  });
  it('a jump pressed mid-step is buffered, not lost', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    run(s, play, inp(3)); // step E to (7,3)
    run(s, play, inp(0, 0, BTN_JUMP)); // pressed while walking
    settle(s, play);
    expect(s.cat.x).toBe(7);
    // the buffered jump fires facing E onto (8,3): same level -> refused, nothing lost or crashed
    expect(s.cat.act === CatAct.IDLE || s.cat.act === CatAct.LOAF).toBe(true);
  });
});

describe('props (GDD 4.4)', () => {
  it('push off the counter edge: fall ticks and landing cell, break + target', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 4, 0, 5);
    expect(swatTarget(s)).toEqual({ prop: 0, grab: false });
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    const fall = ev.find((e) => e.t === 'fall');
    expect(fall).toMatchObject({ prop: 0, from: 2, dir: 5 });
    const p = s.props[0];
    expect([p.state, p.x, p.z, p.level, p.fallTicks]).toEqual([PropSt.FALLING, 4, 2, 0, 13]);
    expect(s.grid.propAt[1 * 12 + 4]).toBe(-1);
    run(s, play, NO_INPUT, 12, ev);
    expect(p.state).toBe(PropSt.FALLING);
    run(s, play, NO_INPUT, 1, ev);
    expect(p.state).toBe(PropSt.BROKEN);
    expect(ev.find((e) => e.t === 'break')).toMatchObject({ prop: 0, points: 225, combo: 1 });
    expect(ev.some((e) => e.t === 'target')).toBe(true);
    expect(s.score).toBe(225 + BONUS.target);
    expect(s.targetsHit).toBe(1);
  });
  it('auto-assist hits a prop 45° off the facing and pushes it away from the cat', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 5, 0, 5); // facing S, glass at (4,1) is SW
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    expect(ev.find((e) => e.t === 'fall')).toMatchObject({ prop: 0, dir: 6 });
    expect([s.props[0].x, s.props[0].z]).toEqual([3, 2]);
  });
  it('slides along a surface and wobbles against a wall', () => {
    const play = makeRoom({ props: [{ kind: 2, x: 5, z: 0, level: 2, rot: 0 }] });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 6, 0, 7);
    run(s, play, inp(0, 0, BTN_SWAT));
    expect([s.props[0].x, s.props[0].state]).toEqual([4, PropSt.REST]);
    expect(s.grid.propAt[4]).toBe(0);
    place(s, 5, 1, 1); // mug at (4,0); push N into the wall
    s.props[0].x = 5;
    s.grid.propAt[4] = -1;
    s.grid.propAt[5] = 0;
    settle(s, play);
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    expect(ev.some((e) => e.t === 'wobble')).toBe(true);
    expect(s.props[0].z).toBe(0);
  });
  it('heavy props need 2 swats', () => {
    const play = makeRoom({ props: [{ kind: 6, x: 4, z: 1, level: 2, rot: 0 }] });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 4, 0, 5);
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    expect(ev.some((e) => e.t === 'wobble')).toBe(true);
    expect(s.props[0].state).toBe(PropSt.WOBBLE);
    settle(s, play, ev);
    run(s, play, inp(0, 0, BTN_SWAT), 1, ev);
    expect(s.props[0].state).toBe(PropSt.FALLING);
  });
  it.each([
    [4, [1, 2], 2],
    [5, [4, 5], 5], // v5: the plate stack scores 4 items (combo 1..4), the mug is the 5th
  ])('domino: a fall onto a prop with an edge tips it too (chain 1), rules %i', (rules, combos, maxCombo) => {
    const play = makeRoom({
      levels: [{ x: 10, z: 2, level: 1 }],
      props: [
        { kind: 3, x: 10, z: 1, level: 3, rot: 0 },
        { kind: 2, x: 10, z: 2, level: 1, rot: 0 },
      ],
    });
    const s = initSim(play, DEFAULT_CAT, { simVersion: rules });
    place(s, 10, 0, 5);
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    expect(s.props[0].fallTicks).toBe(13); // L3 -> L1
    run(s, play, NO_INPUT, 13, ev);
    expect(s.props[0].state).toBe(PropSt.BROKEN);
    const b = s.props[1];
    expect([b.state, b.chain, b.x, b.z, b.level, b.fallTicks]).toEqual([PropSt.FALLING, 1, 10, 3, 0, 9]);
    run(s, play, NO_INPUT, 9, ev);
    expect(b.state).toBe(PropSt.BROKEN);
    const breaks = ev.filter((e) => e.t === 'break') as { combo: number }[];
    expect(breaks.map((e) => e.combo)).toEqual(combos);
    expect(s.maxCombo).toBe(maxCombo);
  });
  it('occupied landing: non-fragile skids on, else both count as hit; fragile breaks in place', () => {
    // free cell 1 further
    let play = makeRoom({
      props: [
        { kind: 15, x: 4, z: 1, level: 2, rot: 0 },
        { kind: 2, x: 4, z: 2, level: 0, rot: 0 },
      ],
    });
    let s = initSim(play, DEFAULT_CAT);
    place(s, 4, 0, 5);
    let ev = run(s, play, inp(0, 0, BTN_SWAT));
    run(s, play, NO_INPUT, 13, ev);
    expect([s.props[0].state, s.props[0].z]).toEqual([PropSt.LANDED, 3]);
    expect(s.props[1].state).toBe(PropSt.REST);

    // blocked 2 further: lands in place, both hit
    play = makeRoom({
      props: [
        { kind: 15, x: 4, z: 1, level: 2, rot: 0 },
        { kind: 2, x: 4, z: 2, level: 0, rot: 0 },
        { kind: 2, x: 4, z: 3, level: 0, rot: 0 },
        { kind: 2, x: 4, z: 4, level: 0, rot: 0 },
      ],
    });
    s = initSim(play, DEFAULT_CAT);
    place(s, 4, 0, 5);
    ev = run(s, play, inp(0, 0, BTN_SWAT));
    run(s, play, NO_INPUT, 13, ev);
    expect([s.props[0].z, s.props[0].hit, s.props[1].hit]).toEqual([2, 1, 1]);
    expect(ev.find((e) => e.t === 'hit')).toMatchObject({ prop: 1, points: 50 });

    // fragile onto a floor prop: breaks, the floor prop stays
    play = makeRoom({
      props: [
        { kind: 1, x: 4, z: 1, level: 2, rot: 0 },
        { kind: 2, x: 4, z: 2, level: 0, rot: 0 },
      ],
    });
    s = initSim(play, DEFAULT_CAT);
    place(s, 4, 0, 5);
    ev = run(s, play, inp(0, 0, BTN_SWAT));
    run(s, play, NO_INPUT, 13, ev);
    expect([s.props[0].state, s.props[1].state]).toEqual([PropSt.BROKEN, PropSt.REST]);
  });
  it('grab, drop, stash in the cat bed', () => {
    const play = makeRoom({
      props: [
        { kind: 19, x: 3, z: 9, level: 0, rot: 0 },
        { kind: 18, x: 5, z: 9, level: 0, rot: 0 },
      ],
    });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 4, 9, 7);
    expect(swatTarget(s)).toEqual({ prop: 0, grab: true });
    const ev = run(s, play, inp(0, 0, BTN_SWAT)); // SWAT on a grabbable grabs
    expect(s.cat.carrying).toBe(0);
    expect(s.props[0].state).toBe(PropSt.CARRIED);
    settle(s, play, ev);
    run(s, play, inp(0, 0, BTN_GRAB), 1, ev); // away from the bed: drop
    expect(s.props[0].state).toBe(PropSt.REST);
    expect([s.props[0].x, s.props[0].z]).toEqual([4, 9]);
    settle(s, play, ev);
    run(s, play, inp(0, 0, BTN_GRAB), 1, ev); // pick it up from under the cat
    expect(s.cat.carrying).toBe(0);
    settle(s, play, ev);
    run(s, play, inp(7), 1, ev);
    settle(s, play, ev);
    run(s, play, inp(7), 1, ev);
    settle(s, play, ev); // now at (2,9), bed at (0,9) is 2 away
    run(s, play, inp(7), 1, ev);
    settle(s, play, ev); // (1,9)
    run(s, play, inp(0, 0, BTN_GRAB), 1, ev);
    expect(s.props[0].state).toBe(PropSt.STASHED);
    expect(s.score).toBe(BONUS.stash);
    expect(ev.some((e) => e.t === 'stash')).toBe(true);
  });
});

describe('the Watcher (GDD 4.3)', () => {
  it('cone is blocked by an occluding cell, not at L3 (v5: the full 10-cell cone)', () => {
    const play = makeRoom({ levels: [{ x: 2, z: 6, level: 3, occludes: 1 }] });
    const s = initSim(play, DEFAULT_CAT, { simVersion: 5 });
    const h = s.humans[0];
    h.state = HumanSt.LOOK;
    h.facing = 7;
    const cells = Array.from(coneCells(s, 0));
    expect(cells).toContain(5 * 12 + 8); // open floor in front
    expect(cells).not.toContain(5 * 12 + 2); // behind the table (3..4, 5..6)
    expect(seesCell(s, h, 7, 2, 5, 0)).toBe(false);
    expect(seesCell(s, h, 7, 2, 6, 3)).toBe(true); // on the high shelf behind the table
    h.state = HumanSt.BUSY;
    expect(coneCells(s, 0).length).toBe(0);
  });
  it('FTUE: first telegraph at 240, event at 450, 1 200 ticks', () => {
    const play = makeRoom({ mode: 'ftue' });
    const s = initSim(play, DEFAULT_CAT);
    expect(s.ticks).toBe(FTUE_TICKS);
    const ev = run(s, play, NO_INPUT, 460);
    const hs = ev.filter((e) => e.t === 'human') as { tick: number; state: string }[];
    expect(hs[0]).toMatchObject({ tick: 240, state: 'telegraph' });
    expect(hs[1]).toMatchObject({ tick: 270, state: 'look' }); // v6 FTUE telegraph = 30 ticks (v5: the longest, 24)
    expect(hs.find((e) => e.state === 'event')?.tick).toBe(450);
    expect(s.eventActive).toBe(1);
    run(s, play, NO_INPUT, 2000, ev);
    expect(s.ended).toBe(1);
    expect(s.tick).toBe(FTUE_TICKS);
  });
  it('ranked: first turn between 8 and 10 s, fake-outs only after 30 s (v7 rules; v8 starts them at 20 s)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const play = makeRoom({ seed, routine: { fakeOutPct: 100 } });
      const r = runToEnd(play, DEFAULT_CAT, [], { simVersion: 7 });
      const hs = r.events.filter((e) => e.t === 'human') as { tick: number; state: string }[];
      expect(hs[0].state).toBe('telegraph');
      expect(hs[0].tick).toBeGreaterThanOrEqual(240);
      expect(hs[0].tick).toBeLessThanOrEqual(300);
      for (const e of hs) if (e.state === 'fakeout') expect(e.tick).toBeGreaterThan(900);
      expect(hs.some((e) => e.state === 'fakeout')).toBe(true);
    }
  });
  it('trotting in the cone gets the cat caught → cuddle → ended (stamp caught, half score)', () => {
    const play = makeRoom({ routine: { look: [300, 300] } });
    const s = initSim(play, DEFAULT_CAT);
    s.score = 1001;
    place(s, 8, 5, 3);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 1000 && !s.ended; i++) stepSim(s, play, inp(((i / 20) | 0) % 2 ? 3 : 7), ev);
    expect(ev.some((e) => e.t === 'seen')).toBe(true);
    const caught = ev.find((e) => e.t === 'caught');
    expect(caught).toBeDefined();
    expect(s.suspicion).toBe(SUSPICION_MAX);
    expect(s.cat.act).toBe(CatAct.CUDDLED);
    const end = ev.find((e) => e.t === 'end')!;
    expect(end.tick - caught!.tick).toBe(CUDDLE_TICKS);
    expect([s.ended, s.stamp, s.finalScore]).toEqual([1, 3, 500]);
  });
  it('a frozen cat in the cone is not "seen"; moving in it is, once per stretch (SIM_VERSION 4)', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 8, 5, 3);
    const h = s.humans[0];
    h.state = HumanSt.LOOK;
    h.facing = 7;
    h.timer = 500;
    const ev = run(s, play, NO_INPUT, 30);
    expect(s.seen).toBe(1);
    expect(s.seenCount).toBe(0);
    expect(ev.some((e) => e.t === 'seen')).toBe(false);
    run(s, play, inp(5, 1), 40, ev); // sneak south inside the cone
    run(s, play, NO_INPUT, 20, ev); // freeze again: same stretch, no second count
    expect(s.seenCount).toBe(1);
    expect(ev.filter((e) => e.t === 'seen').length).toBe(1);
  });
  it('loafing in the cone lowers suspicion, busy decays it', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 8, 5, 3);
    s.suspicion = 50_000;
    const h = s.humans[0];
    h.state = HumanSt.LOOK;
    h.facing = 7;
    h.timer = 500;
    run(s, play, NO_INPUT, 20);
    expect(s.cat.act).toBe(CatAct.LOAF);
    expect(s.suspicion).toBe(50_000 - 333 * 11); // loaf from the 10th idle tick
    h.state = HumanSt.BUSY;
    run(s, play, NO_INPUT, 1);
    expect(s.suspicion).toBe(50_000 - 333 * 11 - 267);
  });
});

/** The FTUE path: spawn → chair → counter → walk to the glass → swat it off. */
function glassScript(): TickInput[] {
  const seq: [TickInput, number][] = [
    [inp(1, 0, BTN_JUMP), 1],
    [NO_INPUT, 11], // jump 12
    [inp(1, 0, BTN_JUMP), 1],
    [NO_INPUT, 11],
    [inp(1), 7], // (6,0)
    [inp(7), 14], // (5,0), (4,0)
    [inp(5), 1], // glass blocks: just face S
    [inp(0, 0, BTN_SWAT), 1],
  ];
  const out: TickInput[] = [];
  for (const [i, n] of seq) for (let k = 0; k < n; k++) out.push(i);
  return out;
}

describe('runs', () => {
  it('a scripted run breaks the glass inside 6 s', () => {
    const play = makeRoom({ mode: 'ftue' });
    const r = runToEnd(play, DEFAULT_CAT, glassScript());
    const brk = r.events.find((e) => e.t === 'break')!;
    expect(brk).toBeDefined();
    expect(brk.tick).toBeLessThan(180);
    expect(r.targets).toBe(1);
    expect(r.stamp).toBe('perfect');
    expect(r.score).toBe(225 + 1000 + Math.floor((225 + 1000) / 4));
    expect(r.ticks).toBe(FTUE_TICKS);
    expect(r.timeline).toContain('🎯');
  });

  function randomInputs(seed: number, n: number): TickInput[] {
    let r = seedRng(seed);
    const out: TickInput[] = [];
    let cur: TickInput = NO_INPUT;
    for (let i = 0; i < n; i++) {
      r = nextRng(r);
      if (rngInt(r, 8) === 0) {
        r = nextRng(r);
        const dir = rngInt(r, 9) as Dir8;
        r = nextRng(r);
        const speed = (1 + rngInt(r, 2)) as Speed;
        r = nextRng(r);
        const b = rngInt(r, 6);
        cur = { dir, speed, buttons: b === 0 ? BTN_SWAT : b === 1 ? BTN_JUMP : b === 2 ? BTN_GRAB : 0 };
      }
      out.push(cur);
    }
    return out;
  }

  it('determinism: same inputs → same finalHash 3 times', () => {
    const play = makeRoom({
      props: [
        { kind: 1, x: 4, z: 1, level: 2, rot: 0, target: true },
        { kind: 2, x: 7, z: 1, level: 2, rot: 0 },
        { kind: 6, x: 8, z: 0, level: 2, rot: 0, target: true },
        { kind: 15, x: 10, z: 1, level: 3, rot: 0 },
        { kind: 19, x: 2, z: 8, level: 0, rot: 0 },
        { kind: 7, x: 3, z: 5, level: 2, rot: 0, target: true },
      ],
    });
    for (const seed of [1, 2, 3]) {
      const ins = randomInputs(seed, 2250);
      const a = runToEnd(play, DEFAULT_CAT, ins);
      const b = runToEnd(play, DEFAULT_CAT, ins);
      const c = runToEnd(play, DEFAULT_CAT, ins);
      expect(a.finalHash).toBe(b.finalHash);
      expect(b.finalHash).toBe(c.finalHash);
      expect(a.events).toEqual(c.events);
      expect(a.ticks).toBeGreaterThanOrEqual(1);
    }
  });

  it('determinism survives structuredClone of a mid-run snapshot', () => {
    const play = makeRoom();
    const ins = randomInputs(7, 2250);
    const full = runToEnd(play, DEFAULT_CAT, ins);
    const s = initSim(play, DEFAULT_CAT);
    for (let i = 0; i < 900; i++) stepSim(s, play, ins[i], []);
    const snap = structuredClone(s);
    expect(hashState(snap)).toBe(hashState(s));
    while (!snap.ended) stepSim(snap, play, ins[snap.tick] ?? NO_INPUT, []);
    expect(hashState(snap)).toBe(full.finalHash);
  });

  it('a 2 250-tick random-input run ends', () => {
    const play = makeRoom();
    const r = runToEnd(play, DEFAULT_CAT, randomInputs(42, 2250));
    expect(r.ticks).toBeGreaterThan(0);
    const s = initSim(play, DEFAULT_CAT);
    for (const i of r.inputs) stepSim(s, play, i, []);
    expect(s.ended).toBe(1);
    expect(hashState(s)).toBe(r.finalHash);
  });

  it('last call doubles points in the final 5 s', () => {
    const play = makeRoom({ ticks: 300, routine: { busy: [900, 900] } });
    const s = initSim(play, DEFAULT_CAT);
    const ev = run(s, play, NO_INPUT, 160);
    expect(ev.find((e) => e.t === 'lastcall')?.tick).toBe(150);
    place(s, 4, 0, 5);
    s.cat.stepTicks = 0;
    run(s, play, inp(0, 0, BTN_SWAT), 1, ev);
    run(s, play, NO_INPUT, 13, ev);
    expect(ev.find((e) => e.t === 'break')).toMatchObject({ points: 450 });
  });

  it('room event multiplies by 1.25 while active', () => {
    const play = makeRoom({ routine: { eventTick: 5 } });
    const s = initSim(play, DEFAULT_CAT);
    run(s, play, NO_INPUT, 6);
    expect(s.eventActive).toBe(1);
    expect(s.humans[0].state).toBe(HumanSt.EVENT);
    place(s, 4, 0, 5);
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    run(s, play, NO_INPUT, 13, ev);
    expect(ev.find((e) => e.t === 'break')).toMatchObject({ points: 281 }); // floor(225 × 1.25)
  });
});

describe('SIM_VERSION 2 sight rules', () => {
  it('during LOOK the near ring (Chebyshev 2) sees the cat even behind the human', () => {
    const play = makeRoom({ routine: { lookFacings: [7 as Facing] } });
    const s = initSim(play, DEFAULT_CAT);
    const h = s.humans[0];
    h.state = HumanSt.LOOK;
    h.facing = 7; // looking W; (11,5) human; cat right behind him at (11,3) is off-cone but within 2
    expect(seesCell(s, h, 7, 11, 3, 0)).toBe(false);
    expect(looksAt(s, h, 7, 11, 3, 0)).toBe(true);
    expect(looksAt(s, h, 7, 11, 2, 0)).toBe(false);
  });
  it('facingToward picks the look facing whose ray is nearest the cat', () => {
    expect(facingToward([5, 4, 6, 3, 7] as Facing[], 5, 2, 9, 2)).toBe(3);
    expect(facingToward([5, 4, 6, 3, 7] as Facing[], 5, 2, 1, 2)).toBe(7);
    expect(facingToward([5, 4, 6, 3, 7] as Facing[], 5, 2, 5, 8)).toBe(5);
    expect(facingToward([5, 4, 6, 3, 7] as Facing[], 5, 2, 8, 5)).toBe(4);
  });
  it('a zero-chaos run is never a perfect crime', () => {
    const play = makeRoom({ ticks: 60 });
    const r = runToEnd(play, DEFAULT_CAT, []);
    expect(r.score).toBe(0);
    expect(r.stamp).not.toBe('perfect');
  });
});

describe('SIM_VERSION 3 first-heist rules', () => {
  it('auto-hop: holding the stick into a +1 ledge for 6 ticks jumps onto it', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 6, 3, 5); // the L1 chair (6,2) is north
    const ev = run(s, play, inp(1), 5);
    expect(ev.some((e) => e.t === 'jump')).toBe(false);
    run(s, play, inp(1), 1, ev);
    expect(ev.find((e) => e.t === 'jump')).toMatchObject({ from: 0, to: 1 });
    settle(s, play);
    expect([s.cat.x, s.cat.z, s.cat.level]).toEqual([6, 2, 1]);
  });
  it('auto-hop never climbs two levels and resets when the stick lets go', () => {
    const play = makeRoom();
    const s = initSim(play, DEFAULT_CAT);
    place(s, 3, 7, 1); // the L2 table (3,6) is north: two levels up
    const ev = run(s, play, inp(1), 20);
    expect(ev.some((e) => e.t === 'jump')).toBe(false);
    place(s, 6, 3, 5);
    run(s, play, inp(1), 4, ev);
    run(s, play, NO_INPUT, 1, ev);
    run(s, play, inp(1), 4, ev);
    expect(ev.some((e) => e.t === 'jump')).toBe(false);
  });
  it('FTUE first turn always looks at the cat, holds look[0] + 15 and counts half', () => {
    const play = makeRoom({ mode: 'ftue', routine: { lookFacings: [7, 6, 5] as Facing[] } });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 9, 5, 5); // west of the human at (11,5)
    while (s.humans[0].state !== HumanSt.LOOK) stepSim(s, play, NO_INPUT, []);
    expect(s.humans[0].facing).toBe(7);
    expect(s.humans[0].stateTicks).toBe(60); // SIM_VERSION 4: 2 s, was look[1] (3.5 s)
    const before = s.suspicion;
    // trot back and forth inside the cone
    run(s, play, inp(7), 7);
    expect(s.suspicion - before).toBeLessThan(7 * 2333);
    expect(s.suspicion - before).toBeGreaterThan(0);
  });
  it('a prop pushed before the look started adds no suspicion when it lands during the look', () => {
    const play = makeRoom({ props: [{ kind: 1, x: 7, z: 1, level: 2, rot: 0, target: true }] });
    const s = initSim(play, DEFAULT_CAT);
    s.humans[0].timer = 3; // turns in a few ticks
    s.humans[0].state = HumanSt.TELEGRAPH;
    s.humans[0].lookFacing = 7;
    s.humans[0].fakeOut = 0;
    place(s, 7, 0, 5);
    s.cat.level = s.cat.fromLevel = 2;
    const ev = run(s, play, inp(0, 0, BTN_SWAT));
    run(s, play, NO_INPUT, 20, ev);
    expect(ev.some((e) => e.t === 'break')).toBe(true);
    expect(s.humans[0].state).toBe(HumanSt.LOOK);
    expect(s.suspicion).toBe(0);
  });
  it('a caught run is ranked Cuddled', () => {
    const play = makeRoom({ mode: 'ranked' });
    const inputs: TickInput[] = [];
    for (let i = 0; i < 2250; i++) inputs.push(inp(i % 14 < 7 ? 7 : 3));
    const r = runToEnd(play, DEFAULT_CAT, inputs);
    expect(r.stamp).toBe('caught');
    expect(r.rank).toBe('Cuddled');
    // v5 first heist could end caught; v6 never does (FTUE_SUSPICION_CAP)
    const ftue = makeRoom({ mode: 'ftue' });
    const ftueInputs = inputs.slice(0, FTUE_TICKS);
    expect(runToEnd(ftue, DEFAULT_CAT, ftueInputs, { simVersion: 5 }).stamp).toBe('caught');
    expect(runToEnd(ftue, DEFAULT_CAT, ftueInputs).stamp).not.toBe('caught');
  });
});
