import { describe, expect, it } from 'vitest';
import { CORK_TIME, FLIP_TIME, SPIN_TIME, TrickTracker } from './tricks';

const air = { consumed: false, airborne: true, mode: 'run' };
const fly = (t: TrickTracker, s: number) => {
  for (let i = 0; i < Math.round(s * 120); i++) t.tick(1 / 120);
};

describe('tricks', () => {
  it('a spin is an unconsumed press in the air (run or ride, never arc)', () => {
    const t = new TrickTracker();
    expect(t.ability({ ...air, airborne: false })).toBeNull();
    t.jump({ air: false });
    expect(t.ability({ ...air, consumed: true })).toBeNull();
    expect(t.ability({ ...air, mode: 'arc' })).toBeNull();
    expect(t.ability(air)).toBe('SPIN');
    fly(t, SPIN_TIME + 0.02);
    expect(t.land({ impact: 16 })).toEqual({ paid: ['SPIN'], sloppy: false });
    t.jump({ air: false });
    expect(t.ability({ ...air, mode: 'ride' })).toBe('SPIN');
  });
  it('2nd and 3rd presses queue DOUBLE and TRIPLE; a 4th does nothing', () => {
    const t = new TrickTracker();
    t.jump({ air: false });
    expect([t.ability(air), t.ability(air), t.ability(air), t.ability(air)]).toEqual(['SPIN', 'DOUBLE', 'TRIPLE', null]);
    fly(t, SPIN_TIME * 3);
    expect(t.land({ impact: 20 })).toEqual({ paid: ['TRIPLE'], sloppy: false });
  });
  it('a plain jump (0.6 s) lands E, E as a DOUBLE; a very late double falls back to a spin', () => {
    const t = new TrickTracker();
    t.jump({ air: false });
    fly(t, 0.1);
    t.ability(air);
    t.ability(air);
    fly(t, 0.48);
    expect(t.land({ impact: 16 })).toEqual({ paid: ['DOUBLE'], sloppy: false });
    t.jump({ air: false });
    fly(t, 0.3);
    t.ability(air);
    t.ability(air);
    fly(t, 0.3);
    expect(t.land({ impact: 16 })).toEqual({ paid: ['SPIN'], sloppy: false });
  });
  it('with the landing predicted, a late press rushes its turn and lands clean (never SLOPPY)', () => {
    const t = new TrickTracker();
    const jump = 0.6;
    t.jump({ air: false });
    let tt = 0;
    const flyTo = (to: number) => {
      for (; tt < to - 1e-9; tt += 1 / 120) t.tick(1 / 120, jump - tt);
    };
    flyTo(0.45);
    t.ability(air);
    flyTo(jump);
    expect(t.land({ impact: 16 })).toEqual({ paid: ['SPIN'], sloppy: false });
    // E, E, E early in a plain jump: a TRIPLE
    t.jump({ air: false });
    tt = 0;
    flyTo(0.06);
    t.ability(air);
    t.ability(air);
    t.ability(air);
    flyTo(jump);
    expect(t.land({ impact: 16 })).toEqual({ paid: ['TRIPLE'], sloppy: false });
  });
  it('a rotation under 80% is SLOPPY (no points), and a hit in the air voids it', () => {
    const t = new TrickTracker();
    t.jump({ air: false });
    t.ability(air);
    fly(t, SPIN_TIME * 0.5);
    expect(t.land({ impact: 16 })).toEqual({ paid: [], sloppy: true });
    t.jump({ air: false });
    t.ability(air);
    fly(t, SPIN_TIME);
    t.hitNow();
    expect(t.land({ impact: 16 })).toBeNull();
  });
  it('the pounce is a FLIP; a press within 0.35 s makes it a CORKSCREW', () => {
    const t = new TrickTracker();
    t.jump({ air: false });
    t.pounce();
    fly(t, FLIP_TIME);
    expect(t.land({ impact: 18 })).toEqual({ paid: ['FLIP'], sloppy: false });
    t.jump({ air: false });
    t.pounce();
    fly(t, 0.2);
    expect(t.ability(air)).toBe('CORKSCREW');
    expect(t.rollAngle).toBe(0);
    fly(t, CORK_TIME);
    expect(t.rollAngle).toBeCloseTo(Math.PI * 2);
    expect(t.ability(air)).toBe('SPIN');
    fly(t, SPIN_TIME);
    expect(t.land({ impact: 18 })).toEqual({ paid: ['CORKSCREW', 'SPIN'], sloppy: false });
    t.jump({ air: false });
    t.pounce();
    fly(t, 0.4);
    expect(t.ability(air)).toBe('SPIN'); // too late for a corkscrew
  });
  it('PAW-DIVE is a fast fall then a landing; nothing tried = null', () => {
    const t = new TrickTracker();
    t.fastFall(); // on the ground: ignored
    expect(t.land({ impact: 0 })).toBeNull();
    t.jump({ air: false });
    expect(t.land({ impact: 16 })).toBeNull();
    t.jump({ air: false });
    t.fastFall();
    expect(t.land({ impact: 30 })).toEqual({ paid: ['PAW-DIVE'], sloppy: false });
  });
  it('spin angle and spinning state follow the queued turns', () => {
    const t = new TrickTracker();
    t.jump({ air: false });
    t.ability(air);
    expect(t.spinning).toBe(true);
    fly(t, SPIN_TIME / 2);
    expect(t.spinAngle).toBeCloseTo(Math.PI, 1);
    fly(t, SPIN_TIME);
    expect(t.spinAngle).toBeCloseTo(Math.PI * 2);
    expect(t.spinning).toBe(false);
    t.reset();
    expect(t.air).toBe(false);
  });
});
