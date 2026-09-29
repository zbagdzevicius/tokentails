import { describe, expect, it } from 'vitest';
import { STICK_DEAD_ZONE, createInput, stickToAxes } from '../input';

function key(t: EventTarget, type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) {
  const e = new Event(type) as Event & Record<string, unknown>;
  Object.assign(e, { code, key: code, repeat: false, ...extra });
  t.dispatchEvent(e);
}

describe('input', () => {
  it('held movement, opposite keys cancel', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    key(t, 'keydown', 'KeyD');
    expect(inp.sample()).toMatchObject({ dx: 1, dy: 0 });
    key(t, 'keydown', 'ArrowUp');
    expect(inp.sample()).toMatchObject({ dx: 1, dy: -1 });
    key(t, 'keydown', 'KeyA');
    expect(inp.sample()).toMatchObject({ dx: 0, dy: -1 });
    key(t, 'keyup', 'KeyD');
    key(t, 'keyup', 'KeyA');
    key(t, 'keyup', 'ArrowUp');
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 0 });
  });

  it('buttons are edge-triggered: one true sample per press, repeats ignored', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    key(t, 'keydown', 'Space');
    key(t, 'keydown', 'Space', { repeat: true });
    expect(inp.sample().meow).toBe(true);
    expect(inp.sample().meow).toBe(false);
    // Tap entirely between two ticks still registers.
    key(t, 'keyup', 'Space');
    key(t, 'keydown', 'KeyE');
    key(t, 'keyup', 'KeyE');
    const s = inp.sample();
    expect(s.interact).toBe(true);
    expect(s.meow).toBe(false);
    // Holding without release does not fire again.
    key(t, 'keydown', 'KeyQ');
    expect(inp.sample().swap).toBe(true);
    key(t, 'keydown', 'KeyQ');
    expect(inp.sample().swap).toBe(false);
    key(t, 'keyup', 'KeyQ');
    key(t, 'keydown', 'Tab');
    expect(inp.sample().swap).toBe(true);
  });

  it('virtual presses, stick and pause callback', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    let paused = 0;
    inp.onPause = () => paused++;
    key(t, 'keydown', 'Escape');
    expect(paused).toBe(1);
    inp.press('swap');
    inp.setStick(0.9, 0.1);
    const s = inp.sample();
    expect(s).toMatchObject({ dx: 1, dy: 0, swap: true });
    expect(inp.lastDevice).toBe('touch');
    inp.setStick(0, 0);
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 0, swap: false });
  });

  it('disabled input yields nothing and drops pending edges', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    key(t, 'keydown', 'KeyW');
    key(t, 'keydown', 'Space');
    inp.setEnabled(false);
    expect(inp.sample()).toEqual({ dx: 0, dy: 0, swap: false, interact: false, meow: false });
    inp.setEnabled(true);
    expect(inp.sample()).toMatchObject({ dy: -1, meow: false });
  });

  it('mapDir remaps screen directions', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false, mapDir: (dx, dy) => [dy, dx] });
    key(t, 'keydown', 'KeyD');
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 1 });
  });

  it('direction changes apply on the very next sample; a tap between samples moves once', () => {
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    key(t, 'keydown', 'KeyD');
    expect(inp.sample()).toMatchObject({ dx: 1, dy: 0 });
    key(t, 'keyup', 'KeyD');
    key(t, 'keydown', 'KeyS');
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 1 });
    key(t, 'keyup', 'KeyS');
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 0 });
    // Down and up before the tick ran: counts for exactly one sample.
    key(t, 'keydown', 'KeyA');
    key(t, 'keyup', 'KeyA');
    expect(inp.sample()).toMatchObject({ dx: -1, dy: 0 });
    expect(inp.sample()).toMatchObject({ dx: 0, dy: 0 });
  });

  it('touch stick has a small dead zone', () => {
    expect(STICK_DEAD_ZONE).toBeLessThanOrEqual(0.2);
    expect(stickToAxes(0.15, 0)).toEqual([0, 0]);
    expect(stickToAxes(0.22, 0)).toEqual([1, 0]);
    const t = new EventTarget();
    const inp = createInput({ target: t, gamepad: false });
    inp.setStick(0, -0.25);
    expect(inp.sample()).toMatchObject({ dx: 0, dy: -1 });
  });

  it('stickToAxes: dead zone and 8 sectors', () => {
    expect(stickToAxes(0.1, 0.1)).toEqual([0, 0]);
    expect(stickToAxes(1, 0)).toEqual([1, 0]);
    expect(stickToAxes(0, -1)).toEqual([0, -1]);
    expect(stickToAxes(0.7, 0.7)).toEqual([1, 1]);
    expect(stickToAxes(-0.7, 0.2)).toEqual([-1, 0]);
  });
});
