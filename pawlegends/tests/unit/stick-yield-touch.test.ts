// @vitest-environment happy-dom
/**
 * Founder bug 2026-11-08 (chase attack), on the real TouchControls: with ATK held (or tapped within
 * STICK_YIELD.tapMs) the joystick held toward the attack target sends no Move (a Move would replace the Attack order
 * and cancel its windup); pulled away it still moves. After a hold-to-select release the stick yields to the SELECTED
 * unit, not to the one the press first ordered. Sim side: tests/unit/chase-attack.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { STICK_YIELD } from '../../src/input/touch/assist';
import { STICK, TouchControls } from '../../src/input/touch/touchControls';
import { simToScreen } from '../../src/render/coords';
import { Op, type Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });
const ME = { x: 24000, y: 29000 };

function rig(extra: Unit[]) {
  vi.advanceTimersByTime(1000);
  const units: Unit[] = [unit(0, 'hero', 0, ME.x, ME.y), ...extra];
  const sent: Command[] = [];
  const cds = [0, 0, 0, 0, 0];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'clem', trick: 'pounce', cooldowns: () => cds, level: () => 5, nowMs: () => performance.now() };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const sim = { x: ME.x, y: ME.y, tick: 100 };
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero: 'clem', yaw: 0 }), recentre() {}, denyRing() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {}, simMe: () => sim } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  orders.update();
  const ev = (type: string, id: number, x: number, y: number) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
  const atkBtn = () => t.root.querySelector('[data-b="attack"]') as HTMLElement;
  const dir = (a: number): { x: number; y: number } => {
    const v = simToScreen(Math.cos(a), Math.sin(a));
    const l = Math.hypot(v.x, v.y);
    return { x: v.x / l, y: -v.y / l };
  };
  const stick = (a: number) => {
    canvas.dispatchEvent(ev('pointerdown', 1, 150, 400));
    const d = dir(a);
    window.dispatchEvent(ev('pointermove', 1, 150 + d.x * STICK.radius, 400 + d.y * STICK.radius));
  };
  const steer = (a: number) => {
    const d = dir(a);
    window.dispatchEvent(ev('pointermove', 1, 150 + d.x * STICK.radius, 400 + d.y * STICK.radius));
  };
  const atkDown = () => atkBtn().dispatchEvent(ev('pointerdown', 2, 900, 600));
  const atkDrag = (a: number, px = 70) => {
    const d = dir(a);
    window.dispatchEvent(ev('pointermove', 2, 900 + d.x * px, 600 + d.y * px));
  };
  const atkUp = (x = 900, y = 600) => window.dispatchEvent(ev('pointerup', 2, x, y));
  const wait = (ms: number) => {
    for (let k = 0; k < ms; k += 16) {
      vi.advanceTimersByTime(16);
      orders.update();
      t.update(cds, [1, 1, 1, 1, 1], 5);
    }
  };
  const moves = () => sent.filter((c) => c.op === Op.Move).length;
  const attacks = () => sent.filter((c) => c.op === Op.Attack).map((c) => (c as { id: number }).id);
  return { t, sent, stick, steer, atkDown, atkDrag, atkUp, wait, moves, attacks };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('touch: the stick yields to ATK while chasing', () => {
  it('ATK held with the stick toward the target: the Attack order goes out and no Move replaces it', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    const before = r.moves();
    r.atkDown();
    expect(r.attacks()).toEqual([3]);
    r.wait(1000);
    expect(r.moves()).toBe(before);
    expect(r.attacks().at(-1)).toBe(3);
    expect(r.t.stickYields).toBeGreaterThan(0);
  });

  it('pulled away from the target the stick still moves (retreat, kite)', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    const before = r.moves();
    r.steer(Math.PI);
    r.wait(300);
    expect(r.moves()).toBeGreaterThan(before);
  });

  it('after ATK lets go the stick waits STICK_YIELD.tapMs, then moves again', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    const before = r.moves();
    r.wait(STICK_YIELD.tapMs - 200);
    expect(r.moves()).toBe(before);
    r.wait(400);
    expect(r.moves()).toBeGreaterThan(before);
  });

  it('hold-to-select: the stick yields to the selected unit, not to the press pick', () => {
    // the press picks the hero (east); the drag west selects the minion there; the stick then points west at it
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y), unit(20, 'minion', 1, ME.x - 2500, ME.y)]);
    r.atkDown();
    expect(r.attacks()).toEqual([3]);
    r.atkDrag(Math.PI);
    r.wait(50);
    r.atkDrag(Math.PI);
    r.atkUp();
    expect(r.attacks().at(-1)).toBe(20);
    const before = r.moves();
    r.stick(Math.PI);
    r.wait(400);
    expect(r.moves()).toBe(before);
    expect(r.attacks().at(-1)).toBe(20);
  });
});
