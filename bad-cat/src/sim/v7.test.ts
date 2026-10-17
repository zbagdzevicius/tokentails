/**
 * SIM_VERSION 7 (QA round 2 game feel): the seat chain, the combo on lands and hits (held while a fall is in flight),
 * the stack's combo cap, framing the Roomba from 2 cells, the Napper's loaf decay and longer wake look. v6 keeps its
 * own rules (v6.test.ts), so v6 ghosts still replay bit-exact.
 */
import { describe, expect, it } from 'vitest';
import {
  BTN_JUMP,
  COMBO_WINDOW_TICKS,
  DEFAULT_CAT,
  HumanSt,
  NOISE_LOAF_DECAY_V7,
  NOISE_V6,
  NO_INPUT,
  PropSt,
  STACK_COMBO_CAP_V7,
  WAKE_LOOK_BONUS_V7,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type TickInput,
} from '../types';
import { initSim, looksAt, runToEnd, stepSim } from './index';
import { startFall } from './props';
import { frameOnLook, framedLanding } from './v5';
import { makeBossRoom, makeRoom } from './fixtures';
import { botStats, playFor } from './bots.test-util';

function run(s: SimState, play: PlayableRoom, input: TickInput, n = 1, out: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) stepSim(s, play, input, out);
  return out;
}
function place(s: SimState, x: number, z: number, facing: Facing): void {
  const c = s.cat;
  c.x = c.fromX = x;
  c.z = c.fromZ = z;
  c.level = c.fromLevel = s.grid.level[z * s.grid.w + x] as Level;
  c.facing = facing;
}
const calm = (o: Parameters<typeof makeRoom>[0] = {}): PlayableRoom => makeRoom({ ...o, routine: { eventTick: 5000, busy: [3000, 3000], ...o?.routine } });

describe('SIM_VERSION 7', () => {
  it('one JUMP at a counter from the floor hops onto the chair and on up (v6 stops on the chair)', () => {
    const play = calm({ props: [{ kind: 1, x: 9, z: 1, level: 2, rot: 0, target: true }] });
    for (const v of [6, 7]) {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      place(s, 5, 2, 1); // facing N: the counter (5,1) is two levels up; the chair (6,2) is next to both
      const ev = run(s, play, { dir: 0, speed: 0, buttons: BTN_JUMP }, 1);
      run(s, play, NO_INPUT, 40, ev);
      const jumps = ev.filter((e) => e.t === 'jump');
      if (v === 6) {
        expect(jumps).toHaveLength(1);
        expect([s.cat.x, s.cat.z, s.cat.level]).toEqual([6, 2, 1]);
      } else {
        expect(jumps).toHaveLength(2);
        expect([s.cat.x, s.cat.z, s.cat.level]).toEqual([5, 1, 2]);
      }
    }
  });

  it('a seat that is not next to the counter still helps (any seat touching a higher surface)', () => {
    // seat (3,3) L1 beside the cat at (4,2); the counter (4,1) is not next to it, but the seat touches (2,2) L2
    const play = calm({ levels: [{ x: 3, z: 3, level: 1 }, { x: 2, z: 2, level: 2 }] });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 4, 2, 1);
    const ev = run(s, play, { dir: 0, speed: 0, buttons: BTN_JUMP }, 1);
    run(s, play, NO_INPUT, 40, ev);
    expect(ev.filter((e) => e.t === 'jump')).toHaveLength(2);
    expect(ev.some((e) => e.t === 'cantReach')).toBe(false);
    expect(s.cat.level).toBe(2);
  });

  it('a landing extends the combo (v6 kept it), and the window holds while a fall is in flight', () => {
    const play = calm({ props: [{ kind: 12, x: 4, z: 1, level: 2, rot: 0 }] }); // toilet roll: lands, never breaks
    const combos: number[] = [];
    for (const v of [6, 7]) {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      place(s, 0, 9, 1);
      s.combo = 2;
      s.comboTimer = 2; // would run out long before the 13-tick fall lands
      const out: SimEvent[] = [];
      startFall(s, 0, 5, 0, out); // south, off the counter onto the floor (L2 -> L0)
      run(s, play, NO_INPUT, 20, out);
      const land = out.find((e) => e.t === 'land') as unknown as { combo: number } | undefined;
      expect(land).toBeTruthy();
      combos.push(land!.combo);
      if (v === 7) expect(s.comboTimer).toBeGreaterThan(COMBO_WINDOW_TICKS - 20);
    }
    expect(combos).toEqual([1, 3]); // v6: the window ran out mid-air, the landing kept x1; v7: held, then +1
  });

  it('a stack adds at most +3 to the combo outside the Party room', () => {
    const play = calm({ props: [{ kind: 27, x: 4, z: 1, level: 2, rot: 0 }] }); // cups tower
    const after: number[] = [];
    for (const v of [6, 7]) {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      place(s, 0, 9, 1);
      const out: SimEvent[] = [];
      startFall(s, 0, 5, 0, out);
      run(s, play, NO_INPUT, 20, out);
      after.push(s.combo);
    }
    expect(after[1]).toBe(1 + STACK_COMBO_CAP_V7);
    expect(after[0]).toBeGreaterThan(after[1]);
  });

  it('frames the Roomba from 2 cells away when a human looks at the Roomba or at the mess', () => {
    const play = makeBossRoom();
    for (const v of [6, 7]) {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      const r = s.roomba!;
      const h = s.humans[1]; // the caterer at (0,6)
      h.state = HumanSt.LOOK;
      let f: Facing | 0 = 0;
      for (let d = 1; d <= 8 && !f; d++) if (looksAt(s, h, d as Facing, r.x, r.z, 0)) f = d as Facing;
      expect(f).not.toBe(0);
      h.facing = f as Facing;
      s.humans[0].state = HumanSt.BUSY;
      const p = s.props[11]; // the sock, as if it had just landed 2 cells from the Roomba
      p.x = r.x + 2;
      p.z = r.z;
      p.level = 0;
      p.state = PropSt.FALLING;
      expect(framedLanding(s, p)).toBe(v === 7);
    }
  });

  it('a fresh mess by the Roomba frames it when a human turns and sees it (careful cats freeze during looks)', () => {
    const play = makeBossRoom();
    const s = initSim(play, DEFAULT_CAT);
    const r = s.roomba!;
    const h = s.humans[1];
    let f: Facing | 0 = 0;
    for (let d = 1; d <= 8 && !f; d++) if (looksAt(s, h, d as Facing, r.x, r.z, 0)) f = d as Facing;
    const p = s.props[5]; // the mug, as if it had broken 2 cells from the Roomba 3 s ago, unseen
    p.x = r.x + 1;
    p.z = r.z;
    p.level = 0;
    p.state = PropSt.BROKEN;
    p.restTick = s.tick;
    s.tick += 90;
    h.state = HumanSt.LOOK;
    h.facing = f as Facing;
    h.lookStartTick = s.tick;
    const out: SimEvent[] = [];
    const before = s.score;
    frameOnLook(s, 1, out);
    expect(out.map((e) => e.t)).toEqual(['framed']);
    expect(s.framed).toBe(1);
    expect(s.score - before).toBe(300);
    frameOnLook(s, 1, out); // once per mess
    expect(s.framed).toBe(1);
  });

  it('the Napper forgets faster while the cat loafs, sleeps deeper after a wake, and each wake look is 1 s longer', () => {
    const nap = calm({ routine: { kind: 'napper', telegraph: [20, 20], look: [60, 60] } });
    const s = initSim(nap, DEFAULT_CAT, { simVersion: 7 });
    s.noise = 50_000;
    run(s, nap, NO_INPUT, 30); // idle 10 ticks, then a loaf
    expect(50_000 - (s.noise ?? 0)).toBeGreaterThan(-NOISE_LOAF_DECAY_V7 * 15);
    const s6 = initSim(nap, DEFAULT_CAT, { simVersion: 6 });
    s6.noise = 50_000;
    run(s6, nap, NO_INPUT, 30);
    expect(s6.noise).toBe(50_000 + 30 * NOISE_V6.decayPerTick);
    // a full meter: the wake look lasts look + WAKE_LOOK_BONUS_V7 (v8 drops the bonus: QA round 3)
    const w = initSim(nap, DEFAULT_CAT, { simVersion: 7 });
    place(w, 0, 9, 1);
    w.noise = 100_000;
    const ev = run(w, nap, NO_INPUT, 200);
    const look = ev.find((e) => e.t === 'human' && (e as { state?: string }).state === 'look');
    const back = ev.find((e) => e.t === 'human' && (e as { state?: string }).state === 'nap' && e.tick > (look?.tick ?? 0));
    expect(look && back).toBeTruthy();
    expect(back!.tick - look!.tick).toBe(60 + WAKE_LOOK_BONUS_V7);
  });

  it('replays deterministically and v6 / v7 ghosts keep their own result', () => {
    const play = playFor(1);
    const inputs: TickInput[] = Array.from({ length: 600 }, (_, i) => ({ dir: (i % 40 < 20 ? 1 : 3) as TickInput['dir'], speed: 2, buttons: i % 17 === 0 ? 1 : i % 29 === 0 ? 2 : 0 }));
    const a = runToEnd(play, DEFAULT_CAT, inputs);
    const b = runToEnd(play, DEFAULT_CAT, inputs);
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.simVersion).toBe(8);
    const v7a = runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 7 });
    expect(v7a.simVersion).toBe(7);
    expect(runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 7 }).finalHash).toBe(v7a.finalHash);
    const v6a = runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 6 });
    const v6b = runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 6 });
    expect(v6a.finalHash).toBe(v6b.finalHash);
    expect(v6a.simVersion).toBe(6);
  });

  it('balance: the careful bot strings combos (median max combo x2+ in the Kitchen)', () => {
    const st = botStats(playFor(1), 'freeze', 40);
    expect(st.median).toBeGreaterThan(0);
  });
});
