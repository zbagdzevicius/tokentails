// @vitest-environment happy-dom
/**
 * The touch Attack button's claw-slash medallion (founder ask Nov 13): the art is decoration inside the same button
 * (data-b, aria-label and the label span first are kept), a press that orders an attack plays `swing`, an own hit plays
 * `hit` (a big one `crit`) at most every 120 ms, and a unit in reach sets `armed`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { TouchControls } from '../../src/input/touch/touchControls';
import type { Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state: 'idle' });

function rig(units: Unit[]) {
  const sent: Command[] = [];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'clem', trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => 0 };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, atkPreviewFar: false, me: () => ({ hero: 'clem', yaw: 0 }), recentre() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  const atk = t.root.querySelector('[data-b="attack"]') as HTMLElement;
  const down = (id: number) => atk.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: 500, clientY: 300, pointerType: 'touch', bubbles: true }));
  const up = (id: number) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, clientX: 500, clientY: 300, pointerType: 'touch' }));
  const tick = () => t.update([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], 5);
  return { t, atk, down, up, tick, sent };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('touch Attack button art', () => {
  it('keeps data-b, aria-label and the label span first; the art is aria-hidden', () => {
    const { t, atk } = rig([unit(0, 'hero', 0, 20000, 10000)]);
    expect(atk.getAttribute('data-b')).toBe('attack');
    expect(atk.getAttribute('aria-label')).toBe('Attack');
    expect(atk.firstElementChild?.tagName).toBe('SPAN');
    expect(atk.querySelector('span')?.textContent).toBe('ATK');
    const svg = atk.querySelector('svg.atk-art');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelectorAll('.claws path').length).toBe(3);
    t.dispose();
  });

  it('hitPulse adds hit (or crit) and drops it after its beat, at most every 120 ms', () => {
    vi.useFakeTimers();
    const { t, atk } = rig([unit(0, 'hero', 0, 20000, 10000)]);
    t.hitPulse(false);
    expect(atk.classList.contains('hit')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(atk.classList.contains('hit')).toBe(false);
    t.hitPulse(true);
    expect(atk.classList.contains('crit')).toBe(true);
    vi.advanceTimersByTime(330);
    expect(atk.classList.contains('crit')).toBe(false);
    t.dispose();
  });

  it('a press that orders an attack swings; a unit in reach arms the button', () => {
    vi.useFakeTimers();
    const r = rig([unit(0, 'hero', 0, 20000, 10000), unit(7, 'minion', 1, 20800, 10000)]);
    vi.advanceTimersByTime(200);
    r.tick();
    expect(r.atk.classList.contains('armed')).toBe(true);
    r.down(1);
    r.up(1);
    expect(r.sent.length).toBeGreaterThan(0);
    expect(r.atk.classList.contains('swing')).toBe(true);
    vi.advanceTimersByTime(240);
    expect(r.atk.classList.contains('swing')).toBe(false);
    r.t.dispose();
  });
});
