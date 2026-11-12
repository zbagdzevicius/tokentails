// @vitest-environment happy-dom
/**
 * Founder bug 2026-11-08 (chase attack), V20-CHASE.md I3, on the real TouchControls: with ATK held or tapped (a tap
 * locks like a hold: no timer) the joystick held toward the attack target sends no Move (a Move would replace the
 * Attack order and cancel its windup); pulled away it moves at once, and a skill press ends the yield. After a hold-to-select release the stick yields to the SELECTED
 * unit, not to the one the press first ordered. Sim side: tests/unit/chase-attack.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { STICK, TouchControls } from '../../src/input/touch/touchControls';
import { simToScreen } from '../../src/render/coords';
import { Op, type Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });
const ME = { x: 24000, y: 29000 };

function rig(extra: Unit[], at: { x: number; y: number } = ME) {
  vi.advanceTimersByTime(1000);
  const units: Unit[] = [unit(0, 'hero', 0, at.x, at.y), ...extra];
  const sent: Command[] = [];
  const cds = [0, 0, 0, 0, 0];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'clem', trick: 'pounce', cooldowns: () => cds, level: () => 5, nowMs: () => performance.now() };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const sim = { x: at.x, y: at.y, tick: 100 };
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
  /** KITE-FIX: the stick's kite orders (unit ids). */
  const kites = () => sent.filter((c) => c.op === Op.Kite).map((c) => (c as { id: number }).id);
  const attacks = () => sent.filter((c) => c.op === Op.Attack).map((c) => (c as { id: number }).id);
  const stickUp = (x = 150, y = 400) => window.dispatchEvent(ev('pointerup', 1, x, y));
  return { t, sent, stick, steer, atkDown, atkDrag, atkUp, wait, moves, attacks, kites, stickUp };
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

  it('V20 review: one ATK tap on a minion holds the stick only ~700 ms; then the stick toward it walks on (up the lane)', () => {
    const r = rig([unit(20, 'minion', 1, ME.x + 1200, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    expect(r.attacks()).toEqual([20]);
    const before = r.moves();
    r.wait(400);
    expect(r.moves()).toBe(before);
    r.wait(1200);
    expect(r.moves()).toBeGreaterThan(before);
  });

  it('KITE-FIX review: the stick pushed into the map edge (no goal, no kite) still lets an ATK press attack', () => {
    const edge = { x: 700, y: ME.y };
    const r = rig([unit(3, 'hero', 1, edge.x + 1500, edge.y)], edge);
    r.stick(Math.PI);
    r.wait(200);
    r.atkDown();
    r.wait(100);
    expect(r.kites()).toEqual([]);
    expect(r.attacks()).toContain(3);
  });

  it('pulled away from the target the stick still moves (retreat, kite): KITE-FIX, as a kite on the held unit', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    const before = r.moves();
    r.steer(Math.PI);
    r.wait(300);
    expect(r.kites().length).toBeGreaterThan(0);
    expect(new Set(r.kites())).toEqual(new Set([3]));
    expect(r.moves()).toBe(before);
  });

  it('one ATK tap, then the stick held toward the target for 5 s: no Move replaces the Attack order', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    const before = r.moves();
    r.wait(5000);
    expect(r.moves()).toBe(before);
    expect(r.attacks()).toEqual([3]);
  });

  it('after a tap, the stick turned more than 90° away moves within one frame, and turning back keeps moving', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    r.wait(500);
    const before = r.moves();
    r.steer(Math.PI);
    r.wait(16);
    // KITE-FIX: the stick's order is a kite on the tapped hero (it walks, and swings again when ready)
    expect(r.kites()).toEqual([3]);
    expect(r.moves()).toBe(before);
    // turned back toward it: the plain Attack order takes over at once (the stick yields to it again)
    const atks = r.attacks().length;
    r.steer(0);
    r.wait(200);
    expect(r.attacks().length).toBe(atks + 1);
    expect(r.attacks().at(-1)).toBe(3);
    expect(r.moves()).toBe(before);
  });

  it('after a tap, a skill press ends the yield (the stick moves again)', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    r.wait(300);
    const before = r.moves();
    const q = r.t.root.querySelector('[data-b="q"]') as HTMLElement;
    q.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: 800, clientY: 500, pointerType: 'touch', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, clientX: 800, clientY: 500, pointerType: 'touch', bubbles: true }));
    r.wait(300);
    expect(r.moves()).toBeGreaterThan(before);
  });

  it('a tapped target that runs past the lock-break distance (having been in reach) frees the stick', () => {
    const foe = unit(3, 'hero', 1, ME.x + 1500, ME.y);
    const r = rig([foe]);
    r.stick(0);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    r.wait(200);
    const before = r.moves();
    // clem is melee: lock break = range + 1 m, edge to edge
    foe.x = ME.x + 1000 + 1600 + 1000 + 400;
    r.wait(200);
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

/**
 * KITE-FIX (docs/plans/moba/KITE-FIX.md; player report 2026-11-11 "can't both run and attack"): the stick held away
 * from the attack target sends kites (walk between swings, swing when ready), never the held ATK's standing Attack.
 */
describe('touch: KITE-FIX, the stick and ATK together', () => {
  it('ATK held + stick held away for 3 s: kites keep going on the unit, and the held repeat sends no Attack meanwhile', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(Math.PI);
    r.wait(200);
    const moves = r.moves();
    r.atkDown();
    // the press itself goes as a kite (an Attack would plant the hero until its next swing)
    expect(r.attacks()).toEqual([]);
    expect(r.kites()).toEqual([3]);
    r.wait(3000);
    expect(r.attacks()).toEqual([]);
    expect(r.moves()).toBe(moves);
    expect(r.kites().every((id) => id === 3)).toBe(true);
    // the stick re-sends as the hero walks on (the drawn hero here stands still, so a turn re-sends it)
    r.steer(Math.PI * 0.75);
    r.wait(200);
    expect(r.kites().length).toBeGreaterThan(1);
  });

  it('ATK held, the stick let go mid-kite: the Attack on that unit stands (no Stop), and the repeat goes on', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.stick(Math.PI);
    r.wait(200);
    r.atkDown();
    r.wait(400);
    r.stickUp();
    expect(r.sent.at(-1)).toEqual({ op: Op.Attack, id: 3 });
    expect(r.sent.some((c) => c.op === Op.Stop)).toBe(false);
    r.wait(800);
    expect(r.attacks().every((id) => id === 3)).toBe(true);
  });

  it('ATK let go with the stick still held away: the stick goes back to plain moves', () => {
    const r = rig([unit(20, 'minion', 1, ME.x + 1500, ME.y)]);
    r.stick(Math.PI);
    r.wait(200);
    r.atkDown();
    r.wait(300);
    r.atkUp();
    // a tapped minion holds the kite for TAP_YIELD_MS (700 ms), then the stick moves
    const moves = r.moves();
    r.wait(1000);
    expect(r.moves()).toBeGreaterThan(moves);
  });

  it('a drag release with the stick held away kites the dragged unit (its tap rule; no ATK held)', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 3000, ME.y)]);
    r.atkDown();
    r.atkDrag(0);
    r.wait(50);
    r.atkDrag(0);
    r.atkUp();
    expect(r.t.dragLock.id).toBe(3);
    r.wait(1000);
    r.stick(Math.PI / 2);
    r.wait(300);
    expect(r.kites().length).toBeGreaterThan(0);
    expect(r.kites().every((id) => id === 3)).toBe(true);
  });

  it('review: a drag-lock alone (the tap order over) does not kite: the stick moves, so a fleeing hero is never planted', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 3000, ME.y)]);
    r.atkDown();
    r.atkDrag(0);
    r.wait(50);
    r.atkDrag(0);
    r.atkUp();
    expect(r.t.dragLock.id).toBe(3);
    // the tapped order is over (as after a skill press); the timer-free lock stays
    (r.t as unknown as { atkYield: { clear(): void } }).atkYield.clear();
    r.wait(1000);
    const kites = r.kites().length;
    const moves = r.moves();
    r.stick(Math.PI);
    r.wait(300);
    expect(r.kites().length).toBe(kites);
    expect(r.moves()).toBeGreaterThan(moves);
  });

  it('review: a tapped hero kite, the stick let go with the hero out of reach: Stop, never a chase Attack', () => {
    const r = rig([unit(3, 'hero', 1, ME.x + 3000, ME.y)]);
    r.stick(Math.PI);
    r.wait(200);
    r.atkDown();
    r.atkUp();
    r.wait(400);
    expect(r.kites()).toContain(3);
    const atks = r.attacks().length;
    // let go where the knob is (not a field tap)
    r.stickUp(150 - STICK.radius, 400);
    expect(r.attacks().length).toBe(atks);
    expect(r.sent.at(-1)).toEqual({ op: Op.Stop });
  });
});
