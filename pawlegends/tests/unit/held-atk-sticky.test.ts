// @vitest-environment happy-dom
/**
 * V20-CHASE.md I2 (Wild Rift: an attack order keeps its champion until it dies, becomes untargetable or a new command is
 * given), on the real TouchControls: ATK held on an enemy hero kiting to its tower, or through a wave with a minion the
 * next basic kills, keeps attacking that hero: the repeat never switches away while the hero is within the lock-break
 * distance, no stick Move is sent while the stick points at it, and a repeat that finds nothing keeps the order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputHost } from '../../src/input/desktop';
import { Orders, type OrderEnv } from '../../src/input/orders';
import type { Unit } from '../../src/input/targeting';
import { stickyAttackTarget } from '../../src/input/touch/assist';
import { STICK, TouchControls } from '../../src/input/touch/touchControls';
import { simToScreen } from '../../src/render/coords';
import { Op, type Command } from '../../src/sim/api';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });
const ME = { x: 24000, y: 29000 };

function rig(units: Unit[]) {
  vi.advanceTimersByTime(1000);
  const sent: Command[] = [];
  const cds = [0, 0, 0, 0, 0];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero: 'clem', trick: 'pounce', cooldowns: () => cds, level: () => 5, nowMs: () => performance.now() };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const me = units[0];
  const sim = { x: me.x, y: me.y, tick: 100 };
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero: 'clem', yaw: 0 }), recentre() {}, denyRing() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {}, simMe: () => ({ ...sim, x: me.x, y: me.y }) } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  orders.update();
  const ev = (type: string, id: number, x: number, y: number) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
  const dir = (a: number) => {
    const v = simToScreen(Math.cos(a), Math.sin(a));
    const l = Math.hypot(v.x, v.y);
    return { x: v.x / l, y: -v.y / l };
  };
  const stick = (a: number) => {
    canvas.dispatchEvent(ev('pointerdown', 1, 150, 400));
    const d = dir(a);
    window.dispatchEvent(ev('pointermove', 1, 150 + d.x * STICK.radius, 400 + d.y * STICK.radius));
  };
  const atkDown = () => (t.root.querySelector('[data-b="attack"]') as HTMLElement).dispatchEvent(ev('pointerdown', 2, 900, 600));
  const tick = (ms: number, each?: () => void) => {
    for (let k = 0; k < ms; k += 16) {
      each?.();
      vi.advanceTimersByTime(16);
      orders.update();
      t.update(cds, [1, 1, 1, 1, 1], 5);
    }
  };
  const moves = () => sent.filter((c) => c.op === Op.Move).length;
  const attacks = () => sent.filter((c) => c.op === Op.Attack).map((c) => (c as { id: number }).id);
  return { t, sent, stick, atkDown, tick, moves, attacks };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('V20 I2: the held ATK keeps its hero', () => {
  it('a hero walking off past the range with a killable minion in reach: every repeat stays on the hero', () => {
    const me = unit(0, 'hero', 0, ME.x, ME.y);
    const foe = unit(3, 'hero', 1, ME.x + 2400, ME.y);
    const minion = unit(20, 'minion', 1, ME.x + 300, ME.y + 2000, 1);
    const r = rig([me, foe, minion]);
    r.stick(0);
    r.tick(100);
    r.atkDown();
    expect(r.attacks()).toEqual([3]);
    const before = r.moves();
    // the hero drifts out to range + 900 mm (inside clem's lock break, range + 1 m) and back, over 3 s
    r.tick(3000, () => {
      foe.x = ME.x + 2400 + 900 * Math.abs(Math.sin(performance.now() / 500));
    });
    expect(new Set(r.attacks())).toEqual(new Set([3]));
    expect(r.moves()).toBe(before);
  });

  it('a hero kiting into its untanked tower: the held ATK keeps it (no tower guard steals the chase)', () => {
    const me = unit(0, 'hero', 0, ME.x, ME.y);
    const foe = unit(3, 'hero', 1, ME.x + 2600, ME.y);
    const tower = unit(40, 'tower', 1, ME.x + 9000, ME.y);
    const r = rig([me, foe, tower]);
    r.stick(0);
    r.tick(100);
    r.atkDown();
    r.tick(2000);
    expect(new Set(r.attacks())).toEqual(new Set([3]));
  });

  it('stickyAttackTarget: kept within the lock break (edge to edge), dropped past it, dead or not a hero', () => {
    const me = unit(0, 'hero', 0, 0, 0);
    const range = 1600;
    const near = unit(3, 'hero', 1, range + 1000 + 1000 - 10, 0);
    expect(stickyAttackTarget([me, near], me, 0, range, 3)).toBe(3);
    const far = unit(3, 'hero', 1, range + 1000 + 1000 + 10, 0);
    expect(stickyAttackTarget([me, far], me, 0, range, 3)).toBeNull();
    expect(stickyAttackTarget([me, { ...near, state: 'dead' }], me, 0, range, 3)).toBeNull();
    expect(stickyAttackTarget([me, unit(20, 'minion', 1, 1000, 0)], me, 0, range, 20)).toBeNull();
  });
});
