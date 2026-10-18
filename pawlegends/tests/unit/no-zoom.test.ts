// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, installNoZoom } from '../../src/app/noZoom';

type Pt = { id: number; x: number; y: number; target?: EventTarget };

/** A cancelable touch event with plain-object touch lists (happy-dom has no Touch constructor). */
function touch(type: string, target: EventTarget, changed: Pt[], active: Pt[] = []): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = (ps: Pt[]) => ps.map((p) => ({ identifier: p.id, clientX: p.x, clientY: p.y, target: p.target ?? target }));
  Object.defineProperty(e, 'changedTouches', { value: list(changed) });
  Object.defineProperty(e, 'touches', { value: list(active) });
  target.dispatchEvent(e);
  return e;
}

describe('installNoZoom', () => {
  let clock = 0;
  let uninstall: () => void;
  let btn: HTMLButtonElement;
  let clicks = 0;
  beforeEach(() => {
    clock = 1000;
    clicks = 0;
    document.body.innerHTML = '<button class="pl-btn">Play</button>';
    btn = document.querySelector('button')!;
    btn.addEventListener('click', () => clicks++);
    uninstall = installNoZoom(document, () => clock);
  });
  afterEach(() => uninstall());

  const tap = (x = 10, y = 10, moveTo?: { x: number; y: number }): Event => {
    touch('touchstart', btn, [{ id: 1, x, y }], [{ id: 1, x, y }]);
    const end = moveTo ?? { x, y };
    return touch('touchend', btn, [{ id: 1, ...end }]);
  };

  it('blocks the WebKit pinch gestures and dblclick', () => {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
      const e = new Event(type, { bubbles: true, cancelable: true });
      btn.dispatchEvent(e);
      expect(e.defaultPrevented, type).toBe(true);
    }
  });

  it('blocks a two-finger touchmove, not a one-finger one', () => {
    expect(touch('touchmove', btn, [{ id: 1, x: 5, y: 5 }], [{ id: 1, x: 5, y: 5 }]).defaultPrevented).toBe(false);
    const two = [{ id: 1, x: 5, y: 5 }, { id: 2, x: 50, y: 50 }];
    expect(touch('touchmove', btn, two, two).defaultPrevented).toBe(true);
  });

  it('a single tap is left alone (the browser clicks)', () => {
    expect(tap().defaultPrevented).toBe(false);
    expect(clicks).toBe(0); // no synthetic click: the native one does it
  });

  it('a fast second tap is prevented and still clicks the button once', () => {
    tap();
    clock += DOUBLE_TAP_MS - 50;
    expect(tap().defaultPrevented).toBe(true);
    expect(clicks).toBe(1);
  });

  it('a slow second tap is left alone', () => {
    tap();
    clock += DOUBLE_TAP_MS + 1;
    expect(tap().defaultPrevented).toBe(false);
    expect(clicks).toBe(0);
  });

  it('a fast second touch that dragged is prevented without a click', () => {
    tap();
    clock += 100;
    expect(tap(10, 10, { x: 60, y: 10 }).defaultPrevented).toBe(true);
    expect(clicks).toBe(0);
  });

  it('uninstall removes every guard', () => {
    uninstall();
    const g = new Event('gesturestart', { bubbles: true, cancelable: true });
    btn.dispatchEvent(g);
    expect(g.defaultPrevented).toBe(false);
    tap();
    clock += 50;
    expect(tap().defaultPrevented).toBe(false);
    uninstall = () => {};
  });
});
