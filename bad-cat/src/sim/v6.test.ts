/**
 * SIM_VERSION 6 (review round 1 balance): Napper noise, the 7-cell cone, the mirror's check phase, the first heist
 * that never ends caught, the Party room's x4 cap, per-room rank titles. v5 keeps its own rules (v5.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  BTN_SWAT,
  COMBO_MAX,
  CONE_RANGE_V6,
  DEFAULT_CAT,
  FTUE_SUSPICION_CAP,
  HumanSt,
  MIRROR_CHECK_TICKS,
  MIRROR_FIRST_GLINT,
  MIRROR_GLINT_TICKS,
  NOISE,
  NOISE_V6,
  NO_INPUT,
  PARTY_SHELL_ID,
  PARTY_STACK_CAP,
  RANKS,
  SIM_VERSION,
  rankMin,
  type Dir8,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type Speed,
  type TickInput,
} from '../types';
import { coneCells, initSim, mirrorPhase, noiseOf, rankFor, runToEnd, seesCell, stepSim } from './index';
import { makeBossRoom, makeRoom, type FixtureOpts } from './fixtures';
import { botStats, playFor } from './bots.test-util';

const inp = (dir: Dir8, speed: Speed = 2, buttons = 0): TickInput => ({ dir, speed, buttons });
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
const calm = (o: FixtureOpts = {}): PlayableRoom => makeRoom({ ...o, routine: { eventTick: 5000, ...o.routine } });

describe('SIM_VERSION 6', () => {
  it('is still replayable (v8 is the current rule set)', () => {
    expect(SIM_VERSION).toBe(8);
    expect(initSim(makeRoom(), DEFAULT_CAT, { simVersion: 6 }).rules).toBe(6);
  });

  it('the cone reaches 7 cells in normal rooms, 10 in boss rooms, v5 keeps 10', () => {
    const play = makeRoom();
    const s6 = initSim(play, DEFAULT_CAT);
    const s5 = initSim(play, DEFAULT_CAT, { simVersion: 5 });
    for (const s of [s6, s5]) {
      s.humans[0].state = HumanSt.LOOK;
      s.humans[0].facing = 7;
    }
    const h6 = s6.humans[0];
    // the human stands at (11,5) looking W: (3,5) is 8 cells away, (4,5) is 7
    expect(seesCell(s6, h6, 7, 11 - CONE_RANGE_V6, 5, 3)).toBe(true);
    expect(seesCell(s6, h6, 7, 11 - CONE_RANGE_V6 - 1, 5, 3)).toBe(false);
    expect(seesCell(s5, s5.humans[0], 7, 11 - CONE_RANGE_V6 - 1, 5, 3)).toBe(true);
    expect(coneCells(s6, 0).length).toBeLessThan(coneCells(s5, 0).length);
    const boss = makeBossRoom();
    const sb = initSim(boss, DEFAULT_CAT);
    const hb = sb.humans[0];
    hb.state = HumanSt.LOOK;
    hb.facing = 7;
    const far = Array.from(coneCells(sb, 0)).some((i) => {
      const x = i % sb.grid.w;
      const z = Math.floor(i / sb.grid.w);
      return (x - hb.x) ** 2 + (z - hb.z) ** 2 > CONE_RANGE_V6 * CONE_RANGE_V6;
    });
    expect(far).toBe(true);
  });

  it('the Napper hears swats, louder trot steps, and forgets half as fast', () => {
    const nap = calm({ props: [{ kind: 1, x: 3, z: 1, level: 2, rot: 0 }], routine: { kind: 'napper', telegraph: [20, 20], look: [60, 60] } });
    const s = initSim(nap, DEFAULT_CAT, { simVersion: 6 });
    place(s, 1, 8, 3);
    run(s, nap, inp(3, 2), 1);
    run(s, nap, NO_INPUT, 7);
    expect(noiseOf(s)).toBe(NOISE_V6.trotStep);
    run(s, nap, NO_INPUT, 10);
    expect(noiseOf(s)).toBe(NOISE_V6.trotStep + 10 * NOISE_V6.decayPerTick);
    expect(NOISE_V6.decayPerTick * 2).toBe(NOISE.decayPerTick);
    // a swat at the wine glass on the counter edge: heard (+swat), and the crash after it
    const s2 = initSim(nap, DEFAULT_CAT, { simVersion: 6 });
    place(s2, 4, 1, 7);
    const ev = run(s2, nap, inp(0, 0, BTN_SWAT), 1);
    expect(ev.some((e) => e.t === 'swat')).toBe(true);
    expect(noiseOf(s2)).toBeGreaterThanOrEqual(NOISE_V6.swat);
    // v5: swats are silent
    const s5 = initSim(nap, DEFAULT_CAT, { simVersion: 5 });
    place(s5, 4, 1, 7);
    run(s5, nap, inp(0, 0, BTN_SWAT), 1);
    expect(noiseOf(s5)).toBe(0);
  });

  it('the mirror glints for 15 ticks, then watches for 45, only while she is busy', () => {
    const play = calm({ shell: { mirror: { x: 0, z: 8, facing: 3 } }, routine: { mirror: true } });
    const s = initSim(play, DEFAULT_CAT);
    const h = s.humans[0];
    h.state = HumanSt.BUSY;
    h.stateTicks = 1000;
    const at = (e: number) => {
      h.timer = h.stateTicks - e;
      return mirrorPhase(s, play);
    };
    expect(at(0)).toBe('off');
    expect(at(MIRROR_FIRST_GLINT)).toBe('glint');
    expect(at(MIRROR_FIRST_GLINT + MIRROR_GLINT_TICKS - 1)).toBe('glint');
    expect(at(MIRROR_FIRST_GLINT + MIRROR_GLINT_TICKS)).toBe('on');
    expect(at(MIRROR_FIRST_GLINT + MIRROR_GLINT_TICKS + MIRROR_CHECK_TICKS)).toBe('off');
    // a cat moving in the mirror cone during the glint: nothing; during the check: suspicion
    place(s, 2, 8, 3);
    at(MIRROR_FIRST_GLINT);
    run(s, play, inp(3), 1);
    expect(s.suspicion).toBe(0);
    const s2 = initSim(play, DEFAULT_CAT);
    s2.humans[0].stateTicks = 1000;
    s2.humans[0].timer = 1000 - (MIRROR_FIRST_GLINT + MIRROR_GLINT_TICKS + 1);
    place(s2, 2, 8, 3);
    run(s2, play, inp(3), 1);
    expect(s2.suspicion).toBeGreaterThan(0);
    // v5: the mirror watches the whole busy phase
    const s5 = initSim(play, DEFAULT_CAT, { simVersion: 5 });
    s5.humans[0].timer = s5.humans[0].stateTicks; // 0 ticks into BUSY
    expect(mirrorPhase(s5, play)).toBe('on');
  });

  it('the first heist never ends caught and warns 30 ticks ahead', () => {
    const play = makeRoom({ mode: 'ftue' });
    const inputs: TickInput[] = [];
    for (let i = 0; i < 1200; i++) inputs.push(inp(i % 14 < 7 ? 7 : 3));
    const r = runToEnd(play, DEFAULT_CAT, inputs);
    expect(r.stamp).not.toBe('caught');
    const s = initSim(play, DEFAULT_CAT);
    const ev = run(s, play, NO_INPUT, 300);
    const hs = ev.filter((e) => e.t === 'human') as { tick: number; state: string }[];
    expect(hs[1].tick - hs[0].tick).toBe(30);
    // the cap holds whatever the crashes add
    const s2 = initSim(play, DEFAULT_CAT);
    s2.suspicion = FTUE_SUSPICION_CAP + 5000;
    run(s2, play, NO_INPUT, 1);
    expect(s2.suspicion).toBeLessThanOrEqual(FTUE_SUSPICION_CAP);
  });

  it('the Party room caps a stack and the combo at x4', () => {
    // a cups tower (6 items) pushed off the counter's west edge: (2,1) → (1,1) on the floor
    const party = calm({ props: [{ kind: 27, x: 2, z: 1, level: 2, rot: 0 }], shell: { id: PARTY_SHELL_ID } });
    const kitchen = calm({ props: [{ kind: 27, x: 2, z: 1, level: 2, rot: 0 }] });
    const stackOf = (play: PlayableRoom) => {
      const s = initSim(play, DEFAULT_CAT);
      place(s, 3, 1, 7);
      const ev = run(s, play, inp(0, 0, BTN_SWAT), 40);
      return { ev: ev.find((e) => e.t === 'stack') as { items: number; points: number } | undefined, s };
    };
    const p = stackOf(party);
    const k = stackOf(kitchen);
    expect(p.ev?.items).toBe(PARTY_STACK_CAP);
    expect(k.ev?.items).toBe(6);
    expect(p.s.maxCombo).toBeLessThanOrEqual(PARTY_STACK_CAP);
    expect(k.s.maxCombo).toBeLessThanOrEqual(COMBO_MAX);
    expect(p.ev!.points).toBeLessThan(k.ev!.points);
  });

  it('rank titles scale per room (display only)', () => {
    const gremlin = RANKS.findIndex((r) => r.title === 'Gremlin');
    expect(rankMin(gremlin, 100)).toBe(RANKS[gremlin].min);
    expect(rankMin(gremlin, 50)).toBe(RANKS[gremlin].min / 2);
    expect(rankFor(RANKS[gremlin].min, false, 100)).toBe('Gremlin');
    expect(rankFor(RANKS[gremlin].min, false, 200)).not.toBe('Gremlin');
    expect(rankFor(1, false, 30)).toBe(RANKS[1].title);
    expect(rankFor(0, false, 30)).toBe(RANKS[0].title);
    expect(rankFor(99_999, true, 30)).toBe('Cuddled');
  });
});

describe('balance bots (review round 1 targets)', () => {
  it('a freeze bot is rarely caught on Wednesday (mirror) and never in the first heist', () => {
    for (const day of [3, 10]) expect(botStats(playFor(day), 'freeze', 20).caughtPct).toBeLessThanOrEqual(5);
    expect(botStats(playFor(1, 'ftue'), 'random', 20).caughtPct).toBe(0);
  });
  it('the Napper wakes during normal play; the Party room is no longer ~6x the Kitchen', () => {
    const nap = botStats(playFor(14), 'random', 20);
    expect(nap.wakePct).toBeGreaterThan(50);
    const party = botStats(playFor(5), 'freeze', 20).p90;
    const kitchen = botStats(playFor(1), 'freeze', 20).p90;
    expect(party).toBeLessThan(kitchen * 2.5);
  });
});
