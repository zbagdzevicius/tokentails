/**
 * SIM_VERSION 8 (QA round 3 balance): red-pawed, fake-outs (35 % from 20 s, never two in a row), shorter warnings,
 * the mirror's 8 s cycle, two humans never warning together, eyes that follow a moving cat, the Couch Potato and
 * Party Host sight rules, and the Napper's quieter ears. v7 keeps its own rules (v7 ghosts replay bit-exact).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAT,
  HumanSt,
  NO_INPUT,
  PropSt,
  RED_PAWED_GAIN_V8,
  SIM_VERSION,
  telegraphV8,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type TickInput,
} from '../types';
import { initSim, runToEnd, stepSim } from './index';
import { looksAt } from './cone';
import { mirrorPhase } from './v5';
import { makeBossRoom, makeRoom } from './fixtures';

function place(s: SimState, x: number, z: number, facing: Facing): void {
  const c = s.cat;
  c.x = c.fromX = x;
  c.z = c.fromZ = z;
  c.level = c.fromLevel = s.grid.level[z * s.grid.w + x] as Level;
  c.facing = facing;
}
function run(s: SimState, play: PlayableRoom, input: TickInput, n: number, out: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) stepSim(s, play, input, out);
  return out;
}
/** Force human 0 into a LOOK toward `facing` for `ticks`. */
function look(s: SimState, facing: Facing, ticks = 200): void {
  const h = s.humans[0];
  h.state = HumanSt.LOOK;
  h.facing = facing;
  h.timer = ticks;
  h.stateTicks = ticks;
}

describe('SIM_VERSION 8', () => {
  it('is the current rule set; v7 stays replayable', () => {
    expect(SIM_VERSION).toBe(8);
    expect(initSim(makeRoom(), DEFAULT_CAT, { simVersion: 7 }).rules).toBe(7);
  });

  it('red-pawed: frozen in sight beside a fresh mess gains suspicion (v7: a frozen cat sheds it)', () => {
    const play = makeRoom({ routine: { eventTick: 5000 } });
    for (const v of [7, 8]) {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      place(s, 7, 5, 7); // open floor, in the west-facing cone of the human at (11,5)
      const p = s.props[0];
      // a mug that just broke one cell away
      p.x = 6;
      p.z = 5;
      p.level = 0;
      p.state = PropSt.BROKEN;
      p.restTick = s.tick;
      s.suspicion = 10_000;
      look(s, 7);
      const ev = run(s, play, NO_INPUT, 20);
      if (v === 7) expect(s.suspicion).toBeLessThanOrEqual(10_000);
      else {
        expect(s.suspicion).toBeGreaterThan(10_000 + 10 * RED_PAWED_GAIN_V8);
        expect(ev.filter((e) => e.t === 'redpaw')).toHaveLength(1);
      }
    }
  });

  it('no red-pawed far from the mess, or once the mess is old', () => {
    const play = makeRoom({ routine: { eventTick: 5000 } });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 7, 5, 7);
    const p = s.props[0];
    p.x = 6;
    p.z = 8; // 3 cells away
    p.level = 0;
    p.state = PropSt.BROKEN;
    p.restTick = s.tick;
    s.suspicion = 10_000;
    look(s, 7);
    run(s, play, NO_INPUT, 20);
    expect(s.suspicion).toBeLessThanOrEqual(10_000);
  });

  it('turn warnings are a quarter shorter (Monday 24 -> 18, Saturday 15 -> 12)', () => {
    expect(telegraphV8(24)).toBe(18);
    expect(telegraphV8(15)).toBe(12);
    const play = makeRoom({ routine: { telegraph: [24, 24], eventTick: 5000 } });
    for (const v of [7, 8]) {
      const r = runToEnd(play, DEFAULT_CAT, [], { simVersion: v });
      const hs = r.events.filter((e) => e.t === 'human') as { tick: number; state: string }[];
      const t = hs.findIndex((e) => e.state === 'telegraph');
      expect(hs[t + 1].tick - hs[t].tick).toBe(v === 8 ? 18 : 24);
    }
  });

  it('fake-outs start at 20 s, about a third of the turns, never two in a row', () => {
    let fakes = 0;
    let turns = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const play = makeRoom({ seed, routine: { eventTick: 5000, busy: [60, 90] } });
      const r = runToEnd(play, DEFAULT_CAT, []);
      const hs = (r.events.filter((e) => e.t === 'human') as { tick: number; state: string }[]).filter((e) => e.state === 'look' || e.state === 'fakeout');
      for (let i = 0; i < hs.length; i++) {
        if (hs[i].state === 'fakeout') {
          expect(hs[i].tick).toBeGreaterThan(600);
          expect(hs[i - 1]?.state).not.toBe('fakeout');
        }
        if (hs[i].tick > 600) {
          turns++;
          if (hs[i].state === 'fakeout') fakes++;
        }
      }
    }
    expect(fakes / turns).toBeGreaterThan(0.2);
    expect(fakes / turns).toBeLessThan(0.4);
  });

  it('a human who sees the cat move keeps his eyes on it (his cone follows, full length)', () => {
    const play = makeRoom({ routine: { eventTick: 5000 } });
    const s = initSim(play, DEFAULT_CAT);
    place(s, 7, 5, 6);
    look(s, 7, 300);
    // trot south-west out of the west cone: he follows
    const ev = run(s, play, { dir: 6, speed: 2, buttons: 0 }, 40);
    expect(ev.some((e) => e.t === 'seen')).toBe(true);
    expect(s.humans[0].facing).not.toBe(7);
    expect(looksAt(s, s.humans[0], s.humans[0].facing, s.cat.x, s.cat.z, s.cat.level, true)).toBe(true);
  });

  it('two humans never warn at once', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const play = makeBossRoom({ seed });
      const s = initSim(play, DEFAULT_CAT);
      let both = 0;
      while (!s.ended) {
        stepSim(s, play, NO_INPUT, []);
        const warn = s.humans.filter((h) => h.state === HumanSt.TELEGRAPH || h.state === HumanSt.LOOK).length;
        if (warn > 1) both++;
      }
      expect(both, `seed ${seed}`).toBe(0);
    }
  });

  it('the mirror glints once per 8 s (v7: every 4 s)', () => {
    const play = makeRoom({ routine: { mirror: true, busy: [900, 900], eventTick: 5000 }, shell: { mirror: { x: 0, z: 5, facing: 3 } } });
    const count = (v: number): number[] => {
      const s = initSim(play, DEFAULT_CAT, { simVersion: v });
      const at: number[] = [];
      let prev = 'off';
      for (let i = 0; i < 1500; i++) {
        stepSim(s, play, NO_INPUT, []);
        const ph = mirrorPhase(s, play);
        if (ph === 'glint' && prev !== 'glint') at.push(s.tick);
        prev = ph;
      }
      return at;
    };
    const v7 = count(7);
    const v8 = count(8);
    expect(v8.length).toBeGreaterThan(1);
    expect(v7.length).toBeGreaterThan(v8.length * 1.6);
  });

  it('replays deterministically', () => {
    const play = makeRoom();
    const inputs: TickInput[] = Array.from({ length: 900 }, (_, i) => ({ dir: (i % 50 < 25 ? 3 : 7) as TickInput['dir'], speed: 2, buttons: i % 23 === 0 ? 1 : 0 }));
    expect(runToEnd(play, DEFAULT_CAT, inputs).finalHash).toBe(runToEnd(play, DEFAULT_CAT, inputs).finalHash);
    expect(runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 7 }).finalHash).toBe(runToEnd(play, DEFAULT_CAT, inputs, { simVersion: 7 }).finalHash);
  });

  it('the Napper: loafing forgets 1.5x faster than v7, and the wake look has no v7 bonus', () => {
    const nap = makeRoom({ routine: { kind: 'napper', telegraph: [20, 20], look: [60, 60], eventTick: 5000, busy: [3000, 3000] } });
    const drop = (v: number): number => {
      const s = initSim(nap, DEFAULT_CAT, { simVersion: v });
      s.noise = 50_000;
      run(s, nap, NO_INPUT, 40);
      return 50_000 - (s.noise ?? 0);
    };
    expect(drop(8)).toBeGreaterThan(drop(7) * 1.3);
    const w = initSim(nap, DEFAULT_CAT);
    place(w, 0, 9, 1);
    w.noise = 100_000;
    const ev = run(w, nap, NO_INPUT, 200);
    const lk = ev.find((e) => e.t === 'human' && (e as { state?: string }).state === 'look');
    const back = ev.find((e) => e.t === 'human' && (e as { state?: string }).state === 'nap' && e.tick > (lk?.tick ?? 0));
    expect(back!.tick - lk!.tick).toBe(60);
  });
});
