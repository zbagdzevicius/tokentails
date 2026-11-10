// @vitest-environment happy-dom
/**
 * Drag-lock on the touch Attack button (founder 2026-11-10: "on mobile can't hold and drag my basic attacks target to
 * lock-into selected one ... implement similar technique as wild rift"). Pure part: the drag direction picks the
 * pointed-at unit with enemy heroes preferred out to the lock range, nothing when the thumb points at nothing, and
 * DragLock's persistence and break rules. Real TouchControls part: a quick tap is unchanged, a drag locks a hero behind
 * the wave, the lock outlives LOCK.ms and feeds later taps, the centre cancels it, the stick held away lets it go, and
 * the idle re-send never fires under an untanked enemy tower.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATK_SELECT, DragLock, selectCandidates, snapTarget } from '../../src/input/touch/attackSelect';
import { LOCK } from '../../src/input/touch/assist';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { STICK, TouchControls } from '../../src/input/touch/touchControls';
import { simToScreen } from '../../src/render/coords';
import { Op, type Command } from '../../src/sim/api';

const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });
const me = u(0, 'hero', 0, 50000, 30000);
const RANGE = 1800;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const unitAt = (id: number, kind: Unit['kind'], deg: number, mm: number, team = 1): Unit =>
  u(id, kind, team, me.x + Math.cos(rad(deg)) * mm, me.y + Math.sin(rad(deg)) * mm);

describe('drag direction -> target (heroes preferred)', () => {
  it('a drag toward an enemy hero 8 m away behind two minions selects the hero', () => {
    const units = [me, unitAt(10, 'minion', 0, 3000), unitAt(11, 'minion', 5, 4000), unitAt(3, 'hero', 2, 8000)];
    const c = selectCandidates(units, me, 0, RANGE);
    expect(c.map((x) => x.id)).toContain(3);
    expect(c[0].id).toBe(3); // heroes first
    expect(snapTarget(c, me, rad(0))).toBe(3);
  });

  it('heroes are offered out to the lock range (centre to centre), not past it', () => {
    expect(ATK_SELECT.heroReachMm).toBe(LOCK.rangeMm);
    const near = unitAt(3, 'hero', 0, LOCK.rangeMm - 100);
    const far = unitAt(4, 'hero', 90, LOCK.rangeMm + 100);
    const ids = selectCandidates([me, near, far], me, 0, RANGE).map((x) => x.id);
    expect(ids).toEqual([3]);
    // even the selected one (keep) is never offered past the lock range: DragLock would let it go at once
    expect(selectCandidates([me, far], me, 0, RANGE, 4).map((x) => x.id)).toEqual([]);
  });

  it('a drag pointing away from everything (120 deg off) selects nothing', () => {
    const units = [me, unitAt(10, 'minion', 0, 3000), unitAt(3, 'hero', 10, 7000)];
    const c = selectCandidates(units, me, 0, RANGE);
    expect(snapTarget(c, me, rad(130))).toBeNull();
  });

  it('a minion within maxGap of the drag is still selected; past it (no hero in the cone) nothing is', () => {
    const c = selectCandidates([me, unitAt(10, 'minion', 0, 3000)], me, 0, RANGE);
    expect(snapTarget(c, me, rad(50))).toBe(10);
    expect(snapTarget(c, me, rad(70))).toBeNull();
  });

  it('a hero inside the cone wins over a nearer minion the thumb is not pointed right at', () => {
    const c = selectCandidates([me, unitAt(10, 'minion', 20, 2500), unitAt(3, 'hero', 40, 8500)], me, 0, RANGE);
    expect(snapTarget(c, me, rad(32))).toBe(3); // minion 12 deg off (past ATK_SELECT.point), hero 8 deg off
  });
});

describe('DragLock: persistence and breaks', () => {
  const hero = (x = me.x + 5000): Unit => u(3, 'hero', 1, x, me.y);

  it('has no timer: it holds well past LOCK.ms', () => {
    const l = new DragLock();
    l.set(3, 0);
    expect(l.check([me, hero()], me, 0, LOCK.ms * 4)).toBe(3);
  });

  it('a kiting target that was in reach and steps out (up to LOCK.rangeMm) keeps the lock', () => {
    const l = new DragLock();
    l.set(3, 0);
    expect(l.check([me, hero(me.x + 1500)], me, 0, 100)).toBe(3);
    expect(l.check([me, hero(me.x + 6000)], me, 0, 200)).toBe(3);
    expect(l.check([me, hero(me.x + LOCK.rangeMm - 10)], me, 0, 300)).toBe(3);
  });

  it('breaks past LOCK.rangeMm, on death, and when the player dies', () => {
    const a = new DragLock();
    a.set(3, 0);
    expect(a.check([me, hero(me.x + LOCK.rangeMm + 10)], me, 0, 10)).toBeNull();
    expect(a.id).toBeNull();
    const b = new DragLock();
    b.set(3, 0);
    expect(b.check([me, { ...hero(), state: 'dead' }], me, 0, 10)).toBeNull();
    expect(b.id).toBeNull();
    const c = new DragLock();
    c.set(3, 0);
    expect(c.check([hero()], { ...me, state: 'dead' }, 0, 10)).toBeNull();
    expect(c.id).toBeNull();
  });

  it('a target lost from sight keeps the lock for lostGraceMs (null meanwhile) and re-locks when seen', () => {
    const l = new DragLock();
    l.set(3, 0);
    expect(l.check([me], me, 0, 500)).toBeNull();
    expect(l.id).toBe(3);
    expect(l.check([me, hero()], me, 0, 500 + ATK_SELECT.lostGraceMs - 100)).toBe(3);
    // lost again for longer than the grace: let go
    expect(l.check([me], me, 0, 3000)).toBeNull();
    expect(l.check([me], me, 0, 3000 + ATK_SELECT.lostGraceMs + 1)).toBeNull();
    expect(l.id).toBeNull();
  });

  it('a joystick held away for awayMs lets go; a short or interrupted pull does not', () => {
    const l = new DragLock();
    l.set(3, 0);
    expect(l.away(100, true)).toBe(false);
    expect(l.away(100 + ATK_SELECT.awayMs - 50, true)).toBe(false);
    expect(l.away(100 + ATK_SELECT.awayMs - 10, false)).toBe(false); // turned back: the count restarts
    expect(l.away(1000, true)).toBe(false);
    expect(l.id).toBe(3);
    expect(l.away(1000 + ATK_SELECT.awayMs, true)).toBe(true);
    expect(l.id).toBeNull();
  });
});

// ---- the real TouchControls (the same rig as stick-yield-touch.test.ts) ----

const ME = { x: 24000, y: 29000 };

function rig(extra: Unit[]) {
  vi.advanceTimersByTime(1000);
  const units: Unit[] = [u(0, 'hero', 0, ME.x, ME.y), ...extra];
  const sent: Command[] = [];
  const cds = [0, 0, 0, 0, 0];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'clem', trick: 'pounce', cooldowns: () => cds, level: () => 5, nowMs: () => performance.now() };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const sim = { x: ME.x, y: ME.y, tick: 100 };
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, atkAim: null as unknown, attackRange: false, lock: null as number | null, me: () => ({ hero: 'clem', yaw: 0 }), recentre() {}, denyRing() {} };
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
  const stickUp = () => window.dispatchEvent(ev('pointerup', 1, 150, 400));
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
  const attacks = () => sent.filter((c) => c.op === Op.Attack).map((c) => (c as { id: number }).id);
  /** Hold ATK, drag toward sim angle `a`, release there. */
  const dragLock = (a: number) => {
    atkDown();
    atkDrag(a);
    wait(50);
    atkDrag(a);
    atkUp();
  };
  return { t, units, view, sent, stick, stickUp, atkDown, atkDrag, atkUp, wait, attacks, dragLock };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('touch: drag-lock on the Attack button', () => {
  it('a quick tap is unchanged: one Attack on the auto pick, no lock', () => {
    const r = rig([u(20, 'minion', 1, ME.x + 1200, ME.y)]);
    r.atkDown();
    r.atkUp();
    expect(r.attacks()).toEqual([20]);
    expect(r.t.dragLock.id).toBeNull();
    r.wait(1000);
    expect(r.t.lockOrders).toBe(0);
  });

  it('a drag toward a hero behind the wave locks the hero, attacks it, and the lock outlives LOCK.ms', () => {
    const r = rig([u(20, 'minion', 1, ME.x + 1500, ME.y), u(21, 'minion', 1, ME.x + 2500, ME.y + 300), u(3, 'hero', 1, ME.x + 8000, ME.y + 200)]);
    r.dragLock(0);
    expect(r.attacks().at(-1)).toBe(3);
    expect(r.t.dragLock.id).toBe(3);
    expect(r.t.atkSel.kind).toBe('hero');
    r.wait(LOCK.ms + 1500);
    expect(r.t.dragLock.id).toBe(3);
    expect(r.t.attackLockId()).toBe(3);
    // quick casts take the drag-locked hero too
    expect(r.t.lockedId()).toBe(3);
    // a later tap attacks the locked hero, not the nearer minion
    r.atkDown();
    r.atkUp();
    expect(r.attacks().at(-1)).toBe(3);
  });

  it('the drag shows a line on the field while it points, and clears it on release', () => {
    const r = rig([u(3, 'hero', 1, ME.x + 6000, ME.y)]);
    r.atkDown();
    r.atkDrag(0);
    r.wait(50);
    const aim = r.view.atkAim as { x: number; z: number; ok: boolean; reachM: number } | null;
    expect(aim?.ok).toBe(true);
    expect(aim?.x).toBeCloseTo((ME.x + 6000) / 1000);
    expect(aim?.reachM).toBeCloseTo(LOCK.rangeMm / 1000);
    r.atkUp();
    expect(r.view.atkAim).toBeNull();
  });

  it('dragging back into the button cancels and clears an existing lock', () => {
    const r = rig([u(3, 'hero', 1, ME.x + 6000, ME.y)]);
    r.dragLock(0);
    expect(r.t.dragLock.id).toBe(3);
    r.atkDown();
    r.atkDrag(0);
    r.wait(50);
    r.atkDrag(0, 5); // back on the centre
    r.wait(20);
    r.atkUp(900, 600);
    expect(r.t.atkSel.why).toBe('centre');
    expect(r.t.dragLock.id).toBeNull();
  });

  it('a drag pointing at nothing cancels (no lock, no new Attack)', () => {
    const r = rig([u(3, 'hero', 1, ME.x + 6000, ME.y)]);
    r.atkDown();
    const before = r.attacks().length;
    r.atkDrag(Math.PI);
    r.wait(50);
    r.atkDrag(Math.PI);
    r.atkUp();
    expect(r.attacks().length).toBe(before);
    expect(r.t.atkSel.why).toBe('none');
    expect(r.t.dragLock.id).toBeNull();
  });

  it('a stick held away from the locked unit lets it go; held toward it keeps it', () => {
    const r = rig([u(3, 'hero', 1, ME.x + 6000, ME.y)]);
    r.dragLock(0);
    r.stick(0);
    r.wait(800);
    expect(r.t.dragLock.id).toBe(3);
    r.stickUp();
    r.stick(Math.PI);
    r.wait(ATK_SELECT.awayMs + 200);
    expect(r.t.dragLock.id).toBeNull();
  });

  it('a standing hero re-sends the Attack on its lock in reach, but never under an untanked enemy tower', () => {
    const r = rig([u(3, 'hero', 1, ME.x + 1500, ME.y)]);
    r.dragLock(0);
    r.wait(1200);
    expect(r.t.lockOrders).toBeGreaterThan(1);
    expect(r.attacks().at(-1)).toBe(3);
    const t2 = rig([u(3, 'hero', 1, ME.x + 1500, ME.y), u(50, 'tower', 1, ME.x + 4500, ME.y)]);
    t2.dragLock(0);
    expect(t2.t.dragLock.id).toBe(3);
    t2.wait(1200);
    expect(t2.t.lockOrders).toBe(0);
  });
});
