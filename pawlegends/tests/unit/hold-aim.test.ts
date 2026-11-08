// @vitest-environment happy-dom
/**
 * Feel pass B4 (docs/plans/moba/FEEL-PASS.md): hold-to-aim and quick cast on touch. A quick tap still quick-casts at
 * the auto-target; holding shows the aim and the cancel bubble after 180 ms; a drag past 18 px aims (full range at
 * 100 px), a release casts there; resting the thumb on the 72 px bubble 150 px above the button for 120 ms cancels;
 * sliding back onto the button casts like a tap (the smart-cast centre, playtest #1). R aims the same once unlocked.
 * The Attack button takes an enemy hero within range + 1.5 m first and skips a Howler arguing back (his E).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { attackPriority, HERO_REACH_MM, type Unit } from '../../src/input/targeting';
import { CANCEL_BUBBLE, cancelBubbleAt, DRAG_FULL_PX, DRAG_PX, HOLD_PREVIEW_MS, TouchControls } from '../../src/input/touch/touchControls';
import { lockBreakMm, TargetLock } from '../../src/input/touch/assist';
import { screenToSim, setViewTeam } from '../../src/render/coords';
import { Op, type Command, type HeroId } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });

let clock = 1000;
vi.spyOn(performance, 'now').mockImplementation(() => clock);

function rig(hero: HeroId, extra: Unit[] = [], level = 5) {
  const units: Unit[] = [unit(0, 'hero', 0, 20000, 10000), ...extra];
  const sent: Command[] = [];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => level, nowMs: () => clock };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const byId = new Map<number, { hero?: HeroId; team: number }>([[0, { hero, team: 0 }]]);
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, frame: { byId }, me: () => ({ hero, yaw: 0, level }), recentre() {}, gr: { camera: null }, juice: { push() {} }, denyRing() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  t.update([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], level);
  return { t, sent, units, view, byId };
}

const down = (r: ReturnType<typeof rig>, b: string, x: number, y: number, id = 5) =>
  (r.t.root.querySelector(`[data-b="${b}"]`) as HTMLElement).dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true }));
const move = (x: number, y: number, id = 5) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }));
const up = (x: number, y: number, id = 5) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }));
const casts = (r: ReturnType<typeof rig>) => r.sent.filter((c) => c.op === Op.Cast) as { slot: number; x: number; y: number; id: number }[];
const tick = (r: ReturnType<typeof rig>, ms: number) => {
  clock += ms;
  r.t.update([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], 5);
};

afterEach(() => {
  document.body.innerHTML = '';
  setViewTeam(0);
});

describe('feel pass B4: hold to aim', () => {
  it('the tuned constants: 18 px drag, full range at 100 px, preview after 180 ms, a 72 px bubble 150 px up', () => {
    expect(DRAG_PX).toBe(18);
    expect(DRAG_FULL_PX).toBe(100);
    expect(HOLD_PREVIEW_MS).toBe(180);
    expect(CANCEL_BUBBLE).toEqual({ d: 72, above: 150, inset: 12 });
    // clamped 12 px inside the screen
    expect(cancelBubbleAt(700, 330, 844, 390)).toEqual({ x: 700, y: 180 });
    expect(cancelBubbleAt(820, 100, 844, 390)).toEqual({ x: 844 - 48, y: 48 });
  });

  it('a quick tap quick-casts at the auto-target (a nearby enemy hero)', () => {
    const r = rig('sage', [unit(3, 'hero', 1, 24000, 10000)]);
    down(r, 'q', 600, 330);
    up(600, 330);
    const c = casts(r);
    expect(c.length).toBe(1);
    expect(c[0].slot).toBe(0);
    // aimed at the enemy (east of the hero)
    expect(c[0].x).toBeGreaterThan(20000);
  });

  it('a release that moved 18 px or less still casts at the auto-target', () => {
    const r = rig('sage', [unit(3, 'hero', 1, 24000, 10000)]);
    down(r, 'q', 600, 330);
    move(600, 314); // 16 px up: not a drag
    up(600, 314);
    const c = casts(r);
    expect(c.length).toBe(1);
    expect(c[0].x).toBeGreaterThan(20000);
    expect(Math.abs(c[0].y - 10000)).toBeLessThan(600);
  });

  it('holding shows the aim and the cancel bubble after 180 ms; the release casts', () => {
    const r = rig('sage', [unit(3, 'hero', 1, 24000, 10000)]);
    down(r, 'q', 600, 330);
    tick(r, 100);
    expect(r.view.aim).toBeNull();
    tick(r, 100);
    expect(r.view.aim).not.toBeNull();
    expect(r.t.root.querySelector('.pl-cancel')!.classList.contains('on')).toBe(true);
    up(600, 330);
    expect(casts(r).length).toBe(1);
    expect(r.t.root.querySelector('.pl-cancel')!.classList.contains('on')).toBe(false);
  });

  for (const team of [0, 1] as const)
    it(`team ${team}: a drag aims where the thumb points on screen (up-right stays up-right), the release casts there`, () => {
      setViewTeam(team);
      const r = rig('gabe');
      down(r, 'q', 600, 330);
      move(670, 260); // 70 px right, 70 px up
      expect(r.view.aim).not.toBeNull();
      up(670, 260);
      const c = casts(r);
      expect(c.length).toBe(1);
      const d = screenToSim(1, 1);
      const a = Math.atan2(c[0].y - 10000, c[0].x - 20000);
      expect(a).toBeCloseTo(Math.atan2(d.y, d.x), 2);
    });

  it('resting the thumb on the bubble (150 px above the button) for 120 ms cancels: no cast', () => {
    const r = rig('gabe');
    down(r, 'q', 600, 330);
    move(600, 290); // a drag starts: the bubble shows at (600, 180)
    move(600, 180);
    tick(r, 60);
    expect(r.t.root.querySelector('.pl-cancel')!.classList.contains('arming')).toBe(true);
    tick(r, 80);
    expect(r.t.root.querySelector('.pl-cancel')!.classList.contains('hot')).toBe(true);
    up(600, 180);
    expect(casts(r).length).toBe(0);
  });

  it('a fast drag through the bubble does not cancel (the 120 ms rest)', () => {
    const r = rig('gabe');
    down(r, 'q', 600, 330);
    move(600, 290);
    move(600, 180);
    tick(r, 40);
    move(640, 300);
    up(640, 300);
    expect(casts(r).length).toBe(1);
  });

  it('sliding back onto the button casts like a tap (the smart-cast centre)', () => {
    const r = rig('sage', [unit(3, 'hero', 1, 24000, 10000)]);
    down(r, 'q', 600, 330);
    move(540, 300);
    move(605, 332);
    up(605, 332);
    const c = casts(r);
    expect(c.length).toBe(1);
    expect(c[0].x).toBeGreaterThan(20000);
  });

  it('R, once unlocked, holds, drags and casts the same way', () => {
    const r = rig('sage', [], 5);
    const btn = r.t.root.querySelector('[data-b="r"]') as HTMLElement;
    expect(btn.classList.contains('locked')).toBe(false);
    down(r, 'r', 560, 230);
    tick(r, 200);
    expect(r.view.aim).not.toBeNull();
    move(620, 230);
    up(620, 230);
    const c = casts(r);
    expect(c.length).toBe(1);
    expect(c[0].slot).toBe(3);
  });
});

describe('feel pass B4: the Attack button', () => {
  it('takes an enemy hero within range + 1.5 m over a minion in range', () => {
    const me = unit(0, 'hero', 0, 20000, 10000);
    const range = 1700;
    const hero = unit(3, 'hero', 1, 20000 + 500 + range + HERO_REACH_MM - 200, 10000);
    const minion = unit(20, 'minion', 1, 21500, 10000, 30);
    expect(attackPriority([me, hero, minion], me, 0, range)).toBe(3);
    // past that, the minion in range wins
    const far = unit(3, 'hero', 1, 20000 + 500 + range + HERO_REACH_MM + 400, 10000);
    expect(attackPriority([me, far, minion], me, 0, range)).toBe(20);
  });

  it('skips an enemy Howler while his Talk Back (E) is up, as the bots do', () => {
    const r = rig('clem', [unit(3, 'hero', 1, 21500, 10000), unit(20, 'minion', 1, 21200, 10500, 90)]);
    r.byId.set(3, { hero: 'howler', team: 1 });
    r.t.onSimEvent({ type: 'cast', src: 3, slot: 2, tick: 100 } as never);
    down(r, 'attack', 760, 300);
    expect((r.t.lastPick?.id ?? null)).toBe(20);
    up(760, 300);
    // a second later (Talk Back is 1 s) he is a target again
    clock += 1100;
    down(r, 'attack', 760, 300, 6);
    expect(r.t.lastPick?.id).toBe(3);
    up(760, 300, 6);
  });

  it('a lock breaks once the locked hero, having been in reach, gets range + 1 m (melee) / + 2 m (ranged) away', () => {
    const me = unit(0, 'hero', 0, 20000, 10000);
    const foe = unit(3, 'hero', 1, 22000, 10000);
    const l = new TargetLock();
    l.set(3, 0);
    const melee = lockBreakMm(1800);
    expect(melee).toBe(2800);
    expect(lockBreakMm(5500)).toBe(7500);
    expect(l.check([me, foe], me, 0, 10, melee)).toBe(3);
    foe.x = 20000 + melee + 200;
    expect(l.check([me, foe], me, 0, 20, melee)).toBeNull();
    // a lock set from afar holds while the player closes in
    const l2 = new TargetLock();
    l2.set(3, 0);
    foe.x = 27000;
    expect(l2.check([me, foe], me, 0, 10, melee)).toBe(3);
  });
});
