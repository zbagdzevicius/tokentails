// @vitest-environment happy-dom
/**
 * Touch: the Attack button reads the hero's basic range from hero data (every ranged hero, not only Sage), holding
 * Attack or a skill button shows the attack range ring, and a held skill button previews its range before the release
 * (a quick tap still smart-casts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aimFor, basicRange } from '../../src/input/abilities';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { TouchControls } from '../../src/input/touch/touchControls';
import { Op, type Command, type HeroId } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });

function rig(hero: HeroId) {
  const units: Unit[] = [unit(0, 'hero', 0, 20000, 10000)];
  const sent: Command[] = [];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => 0 };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero, yaw: 0 }), recentre() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  const btn = (b: string) => t.root.querySelector(`[data-b="${b}"]`) as HTMLElement;
  const down = (b: string, id: number) => btn(b).dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: 500, clientY: 300, pointerType: 'touch', bubbles: true }));
  const up = (id: number) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, clientX: 500, clientY: 300, pointerType: 'touch' }));
  const tick = () => t.update([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], 5);
  return { t, view, sent, down, up, tick, orders };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('touch Attack button and range rings', () => {
  it('the Attack button uses the hero data range for every hero (Pixel, Duchess, Bengas, Gabė are ranged)', () => {
    for (const hero of ['pixel', 'duchess', 'bengas', 'gabe', 'sage', 'clem'] as const) {
      const r = rig(hero);
      r.down('attack', 1);
      expect(r.t.lastPick?.range).toBe(basicRange(hero));
      r.up(1);
      r.t.dispose();
    }
  });
  it('holding Attack shows the attack range ring; letting go hides it', () => {
    const r = rig('pixel');
    r.down('attack', 1);
    expect(r.view.attackRange).toBe(true);
    r.tick();
    expect(r.view.attackRange).toBe(true);
    r.up(1);
    expect(r.view.attackRange).toBe(false);
    r.t.dispose();
  });
  it('a held skill button previews its range before the release; a quick tap still smart-casts', () => {
    vi.useFakeTimers();
    const r = rig('sage');
    r.down('w', 2);
    expect(r.view.attackRange).toBe(true);
    r.tick();
    expect(r.view.aim).toBeNull();
    vi.advanceTimersByTime(250);
    r.tick();
    expect(r.view.aim).toMatchObject({ spec: aimFor('sage', 1), valid: true });
    r.up(2);
    expect(r.view.aim).toBeNull();
    expect(r.view.attackRange).toBe(false);
    expect(r.sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 1 });
    // a quick tap: no preview, the cast still goes (once W's cast is seen: C2's buffer holds a cast behind an unseen one)
    r.orders.onEvent({ type: 'cast', tick: 1, src: 0, slot: 1, x: 0, y: 0, target: -1 });
    const n = r.sent.length;
    r.down('q', 3);
    r.up(3);
    expect(r.sent.length).toBe(n + 1);
    expect(r.sent.at(-1)).toMatchObject({ op: Op.Cast, slot: 0 });
    r.t.dispose();
  });
});
