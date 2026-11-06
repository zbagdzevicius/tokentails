// @vitest-environment happy-dom
/**
 * Audit 2026-11-06 quick wins, input layer (no sim change): CF-03 full-range blink taps and edge-scaled drags.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { aimFor, trickAim } from '../../src/input/abilities';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { smartAim, type Unit } from '../../src/input/targeting';
import { dragFullPx, TouchControls } from '../../src/input/touch/touchControls';
import { Op, type Command, type HeroId } from '../../src/sim/api';
import { TRICKS } from '../../src/data/tricks';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });

function rig(hero: HeroId, extra: Unit[] = []) {
  const units: Unit[] = [unit(0, 'hero', 0, 20000, 10000), ...extra];
  const sent: Command[] = [];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => 0 };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const notes: string[] = [];
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero, yaw: 0 }), recentre() {}, gr: { camera: null }, juice: { push: (n: { title: string }) => notes.push(n.title) } };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  return { t, sent, units, view, notes, orders };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CF-03 blink taps go the full range', () => {
  it('Pounce and Avietė E are blinks; other ground aims are not', () => {
    expect(trickAim('pounce').blink).toBe(true);
    expect(aimFor('aviete', 2).blink).toBe(true);
    expect(aimFor('aviete', 0).blink).toBeFalsy();
  });

  it('a smart (tap) blink with nothing around lands at the full range along the facing', () => {
    const me = unit(0, 'hero', 0, 20000, 10000);
    const p = smartAim(trickAim('pounce'), [me], me, 0, 0);
    expect(p.x - me.x).toBeCloseTo(TRICKS.pounce.blink, 0);
    expect(p.y).toBeCloseTo(me.y, 0);
  });

  it('a tapped Pounce follows the held joystick at full range', () => {
    const r = rig('clem');
    // hold the stick straight up (screen) = +y in the sim
    (r.t as unknown as { stick: unknown }).stick = { id: 9, bx: 100, by: 300, x: 100, y: 200, moved: true, at: 0 };
    const p = r.t.tapAim(4, r.units[0]);
    expect(p.x).toBeCloseTo(20000, 0);
    expect(p.y - 10000).toBeCloseTo(TRICKS.pounce.blink, 0);
  });

  it('a drag toward a near screen edge reaches full range before the edge', () => {
    // 60 px from the right edge: dragging right means full range at 50 px, not 90
    expect(dragFullPx(784, 200, 1, 0, 844, 390)).toBe(50);
    // open space: the usual 90 px
    expect(dragFullPx(400, 200, -1, 0, 844, 390)).toBe(90);
    // never shorter than 36 px
    expect(dragFullPx(840, 200, 1, 0, 844, 390)).toBe(36);
    // a casting drag sends the full blink when the thumb is stopped by the edge
    const r = rig('clem');
    const btn = r.t.root.querySelector('[data-b="trick"]') as HTMLElement;
    const W = window.innerWidth;
    const x0 = W - 60;
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, clientX: x0, clientY: 200, pointerType: 'touch', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 4, clientX: x0 + 52, clientY: 200, pointerType: 'touch' }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, clientX: x0 + 52, clientY: 200, pointerType: 'touch' }));
    const cast = r.sent.find((c) => c.op === Op.Cast || c.op === Op.Trick) as { x: number; y: number } | undefined;
    expect(cast, JSON.stringify(r.sent)).toBeTruthy();
    expect(cast!.x - 20000).toBeGreaterThanOrEqual(TRICKS.pounce.blink - 20);
  });
});

describe('CF-07 a refused unit-target cast says so on touch', () => {
  it('Avietė R with no enemy hero: no command, the red flash and "No hero in range"', () => {
    expect(aimFor('aviete', 3).kind).toBe('unit');
    const r = rig('aviete');
    expect(r.orders.cast(3, 21000, 10000, 0xff)).toBe(false);
    const btn = r.t.root.querySelector('[data-b="r"]') as HTMLElement;
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 600, clientY: 200, pointerType: 'touch', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 600, clientY: 200, pointerType: 'touch' }));
    expect(r.sent.filter((c) => c.op === Op.Cast)).toEqual([]);
    expect(btn.classList.contains('deny')).toBe(true);
    expect(r.notes).toContain('No hero in range');
  });

  it('with an enemy hero in reach the same tap casts on it', () => {
    const r = rig('aviete', [unit(4, 'hero', 1, 23000, 10000)]);
    const btn = r.t.root.querySelector('[data-b="r"]') as HTMLElement;
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, clientX: 600, clientY: 200, pointerType: 'touch', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, clientX: 600, clientY: 200, pointerType: 'touch' }));
    expect(r.sent.find((c) => c.op === Op.Cast)).toMatchObject({ slot: 3, id: 4 });
    expect(r.notes).toEqual([]);
  });
});

describe('CF-08 a smart cast never walks in under an untanked enemy tower', () => {
  it('Avietė R (unit aim) skips a hero past its range that a tower guards; it takes it with no tower', () => {
    const aim = aimFor('aviete', 3);
    const me = unit(0, 'hero', 0, 20000, 10000);
    const foe = unit(4, 'hero', 1, 20000 + aim.range + 1500, 10000);
    const tower: Unit = { ...unit(30, 'tower', 1, foe.x + 2000, 10000), hp: 1000, maxHp: 1000 };
    expect(smartAim(aim, [me, foe], me, 0, 0).id).toBe(4);
    expect(smartAim(aim, [me, foe, tower], me, 0, 0).id).toBe(0xff);
    // a foe within range is still a target under the tower (no walk-in)
    const near = { ...foe, x: 20000 + aim.range - 500 };
    expect(smartAim(aim, [me, near, tower], me, 0, 0).id).toBe(4);
  });
});
