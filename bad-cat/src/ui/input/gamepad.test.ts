import { describe, expect, it } from 'vitest';
import { BTN_GRAB, BTN_JUMP, BTN_SWAT } from '../../types';
import { createGamepad, PAD, padButtons, type PadSnapshot } from './gamepad';

const snap = (axes: number[] = [0, 0], down: number[] = []): PadSnapshot => {
  const pressed = Array.from({ length: 17 }, (_, i) => down.includes(i));
  return { axes, pressed };
};

describe('gamepad input', () => {
  it('maps A to jump, X or B to swat, Y to grab', () => {
    expect(padButtons(snap([], [PAD.A]).pressed)).toBe(BTN_JUMP);
    expect(padButtons(snap([], [PAD.B]).pressed)).toBe(BTN_SWAT);
    expect(padButtons(snap([], [PAD.X]).pressed)).toBe(BTN_SWAT);
    expect(padButtons(snap([], [PAD.Y]).pressed)).toBe(BTN_GRAB);
  });

  it('reads the stick through the dead zone and the d-pad as a trot', () => {
    let cur: PadSnapshot | null = snap([0.1, 0.1]);
    const pad = createGamepad(() => [cur]);
    expect(pad.read()).toEqual({ dir: 0, speed: 0 });
    cur = snap([0, -1]);
    expect(pad.read()).toEqual({ dir: 1, speed: 2 });
    cur = snap([0.3, 0]);
    expect(pad.read().speed).toBe(1);
    cur = snap([0, 0], [PAD.RIGHT, PAD.DOWN]);
    expect(pad.read()).toEqual({ dir: 4, speed: 2 });
    expect(pad.connected).toBe(true);
  });

  it('latches a press once, on the rising edge, and pauses on Start', () => {
    let cur: PadSnapshot | null = snap([0, 0], [PAD.X]);
    let paused = 0;
    const pad = createGamepad(() => [null, cur]);
    pad.onPause(() => paused++);
    pad.read();
    pad.read();
    expect(pad.take()).toBe(BTN_SWAT);
    expect(pad.take()).toBe(0);
    cur = snap([0, 0], [PAD.START]);
    pad.read();
    pad.read();
    expect(paused).toBe(1);
    pad.setEnabled(false);
    cur = snap([0, -1], [PAD.A]);
    expect(pad.read()).toEqual({ dir: 0, speed: 0 });
    expect(pad.take()).toBe(0);
  });

  it('is at rest with no pad', () => {
    const pad = createGamepad(() => []);
    expect(pad.read()).toEqual({ dir: 0, speed: 0 });
    expect(pad.connected).toBe(false);
  });
});
