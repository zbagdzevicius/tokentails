/**
 * FUN-PROGRESSION-V12 lane C (controls and feel, client only): the cast buffer (C2), the Attack button's last-hit
 * priority (C5), the lane magnet's limits (C8), the idle auto-attack edge to edge (C13), the own-hero lag (C6) and the
 * phone haptics (C11c).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAST_BUFFER, Orders, type OrderEnv } from '../../src/input/orders';
import { attackPriority, LAST_HIT_REACH, BODY_MM, type Unit } from '../../src/input/targeting';
import { ASSIST, autoAttackTarget, laneMagnet, magnetOn } from '../../src/input/touch/assist';
import { basicRange, minionHitEstimate } from '../../src/input/abilities';
import { HAPTIC, haptic, hapticPattern, resetHaptics } from '../../src/ui/haptics';
import { FREEZE_CAP_MS, Juice, KICK_MIN } from '../../src/render/juice';
import { INTERP_LAG, SELF_LAG, SnapBuffer } from '../../src/render/interp';
import { Op, type Command, type Snapshot } from '../../src/sim/api';
import { TICK_HZ } from '../../src/data/timeline';

const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100, maxHp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp, state: 'idle' });

function rig(hero: 'clem' | 'sage' | 'brutus' = 'clem', cds: number[] = [0, 0, 0, 0, 0]) {
  const sent: Command[] = [];
  const denied: number[] = [];
  let t = 0;
  const me = unit(0, 'hero', 0, 10000, 10000);
  const units: Unit[] = [me, unit(4, 'hero', 1, 30000, 10000)];
  const env: OrderEnv = {
    send: (c) => sent.push(c),
    units: () => units,
    meId: 0,
    hero,
    trick: 'pounce',
    cooldowns: () => cds,
    level: () => 5,
    nowMs: () => t,
    onDeny: (s) => denied.push(s),
  };
  const o = new Orders(env);
  const run = (ms: number, step = 16): void => {
    for (let k = 0; k < ms; k += step) {
      t += step;
      o.update();
    }
  };
  return { o, sent, denied, me, cds, run, now: () => t };
}

const casts = (sent: Command[]): number[] => sent.filter((c) => c.op === Op.Cast).map((c) => (c as { slot: number }).slot);

describe('C2 cast buffer', () => {
  it('E then W 60 ms apart: both are sent (W waits out the dash), none denied', () => {
    const r = rig('clem');
    expect(r.o.cast(2, 14000, 10000)).toBe(true);
    r.run(60);
    expect(r.o.cast(1, 10000, 10000)).toBe(true);
    expect(casts(r.sent)).toEqual([2]);
    // E's cast event arrives: the dash (4 m at EFFECTS.dashSpeed) keeps the hero busy, W stays in the buffer
    r.o.onEvent({ type: 'cast', tick: 3, src: 0, slot: 2, x: 14000, y: 10000, target: -1 });
    r.run(100);
    expect(casts(r.sent)).toEqual([2]);
    r.run(200);
    expect(casts(r.sent)).toEqual([2, 1]);
    expect(r.denied).toEqual([]);
  });

  it('a press while winding up goes when the windup ends', () => {
    const r = rig('sage');
    r.me.state = 'casting';
    r.o.cast(0, 12000, 10000);
    expect(casts(r.sent)).toEqual([]);
    expect(r.o.queued).toBe(0);
    r.run(100);
    r.me.state = 'idle';
    r.run(20);
    expect(casts(r.sent)).toEqual([0]);
  });

  it('a press 3 ticks before the cooldown ends is kept and sent when it ends', () => {
    const r = rig('clem', [CAST_BUFFER.nearReadyTicks, 0, 0, 0, 0]);
    expect(r.o.canQueue(0)).toBe(true);
    expect(r.o.cast(0, 12000, 10000)).toBe(true);
    r.run(50);
    expect(casts(r.sent)).toEqual([]);
    r.cds[0] = 0;
    r.run(20);
    expect(casts(r.sent)).toEqual([0]);
  });

  it('a press further from ready is refused at once; one that never frees up is denied after 400 ms', () => {
    const r = rig('clem', [CAST_BUFFER.nearReadyTicks + 1, 0, 0, 0, 0]);
    expect(r.o.canQueue(0)).toBe(false);
    expect(r.o.cast(0, 12000, 10000)).toBe(false);
    const q = rig('clem', [2, 0, 0, 0, 0]);
    q.o.cast(0, 12000, 10000);
    q.run(CAST_BUFFER.ms - 32);
    expect(q.denied).toEqual([]);
    q.run(64);
    expect(q.denied).toEqual([0]);
    expect(casts(q.sent)).toEqual([]);
  });

  it('a sent cast the sim did not take is tried again inside its window, then given up', () => {
    const r = rig('clem');
    r.o.cast(1, 10000, 10000);
    r.run(CAST_BUFFER.ms + 200);
    const n = casts(r.sent).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(4);
  });

  it('a double tap of the same skill is one cast and no deny', () => {
    const r = rig('clem');
    r.o.cast(0, 12000, 10000);
    r.o.cast(0, 12000, 10000);
    r.o.onEvent({ type: 'cast', tick: 1, src: 0, slot: 0, x: 12000, y: 10000, target: -1 });
    r.cds[0] = 90;
    r.run(500);
    expect(casts(r.sent)).toEqual([0]);
    expect(r.denied).toEqual([]);
  });
});

describe('C5 Attack button: last hits first, never a walk into nothing', () => {
  const me = unit(0, 'hero', 0, 10000, 10000);
  it('prefers the minion the next basic kills, within attack range + 1 m', () => {
    const range = basicRange('clem');
    const edge = (d: number): number => 10000 + d + BODY_MM.minion;
    const low = unit(20, 'minion', 1, edge(range), 10000, 40, 300);
    const killable = unit(21, 'minion', 1, edge(range + LAST_HIT_REACH - 100), 10000, 50, 300);
    const kill = (u: Unit): number => (u.id === 21 || u.hp <= 30 ? 999 : 30);
    expect(attackPriority([me, low, killable], me, 0, range, 7000, 'heroes', kill)).toBe(21);
    // no damage estimate: the lowest-HP minion, as before
    expect(attackPriority([me, low, killable], me, 0, range, 7000, 'heroes')).toBe(20);
    // an enemy hero in range still comes first
    const hero = unit(4, 'hero', 1, 10000 + range, 10000);
    expect(attackPriority([me, low, killable, hero], me, 0, range, 7000, 'heroes', kill)).toBe(4);
  });
  it('nothing within reach: null (the button sends nothing)', () => {
    expect(attackPriority([me, unit(20, 'minion', 1, 30000, 10000)], me, 0, basicRange('clem'), 7000, 'heroes')).toBeNull();
  });
  it('estimates a basic on a minion after armour and Toys', () => {
    const melee = { kind: 'minion', maxHp: 300 };
    const a0 = minionHitEstimate('clem', 1, 0, melee);
    expect(a0).toBeGreaterThan(40);
    expect(a0).toBeLessThan(58);
    expect(minionHitEstimate('clem', 1, 1, melee)).toBeGreaterThan(a0);
    expect(minionHitEstimate('clem', 5, 0, melee)).toBeGreaterThan(a0);
    expect(minionHitEstimate('clem', 1, 0, { kind: 'minion', maxHp: 700 })).toBeLessThan(a0);
  });
});

describe('C8 lane magnet, C13 idle auto-attack', () => {
  it('snaps within 8° only, at full tilt only, never with an enemy hero within 8 m', () => {
    const lane = Math.atan2(3000, 28000);
    expect(laneMagnet(30000, 51000, lane + (7 * Math.PI) / 180)).toBeCloseTo(lane, 5);
    const off = lane + (12 * Math.PI) / 180;
    expect(laneMagnet(30000, 51000, off)).toBe(off);
    expect(ASSIST.magnetArc).toBeCloseTo((8 * Math.PI) / 180, 9);
    const me = unit(0, 'hero', 0, 30000, 51000);
    expect(magnetOn(0.95, me, [me], 0)).toBe(true);
    expect(magnetOn(0.85, me, [me], 0)).toBe(false);
    expect(magnetOn(1, me, [me, unit(4, 'hero', 1, 37000, 51000)], 0)).toBe(false);
    expect(magnetOn(1, me, [me, unit(4, 'hero', 1, 39000, 51000)], 0)).toBe(true);
    expect(magnetOn(1, me, [me, unit(1, 'hero', 0, 31000, 51000)], 0)).toBe(true);
  });
  it('the idle auto-attack measures edge to edge', () => {
    const me = unit(0, 'hero', 0, 10000, 10000);
    const m = unit(20, 'minion', 1, 10000 + 1800 + BODY_MM.minion - 10, 10000);
    expect(autoAttackTarget([me, m], me, 0, 1800)).toBe(20);
    expect(autoAttackTarget([me, { ...m, x: m.x + 50 }], me, 0, 1800)).toBeNull();
  });
});

describe('C11 feel', () => {
  afterEach(() => resetHaptics());
  it('haptic durations, and nothing without vibrate or off touch', () => {
    expect(HAPTIC).toMatchObject({ cast: 8, lastHit: 10, takedown: 15, levelUp: 12, cc: 25 });
    expect(hapticPattern('toy')).toEqual([10, 40, 10]);
    const vibrate = vi.fn(() => true);
    expect(haptic('cast', { vibrate }, true, 1000)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(8);
    expect(haptic('toy', { vibrate }, true, 2000)).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([10, 40, 10]);
    expect(haptic('cast', {}, true, 3000)).toBe(false);
    expect(haptic('cast', undefined, true, 4000)).toBe(false);
    expect(haptic('cast', { vibrate }, false, 5000)).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(2);
    const throws = { vibrate: () => { throw new Error('no'); } };
    expect(haptic('cc', throws, true, 6000)).toBe(false);
  });
  it('global freezes are capped at 3 frames and small shakes are dropped', () => {
    const j = new Juice(null as unknown as HTMLElement);
    j.hitstop(120);
    let frozen = 0;
    for (let k = 0; k < 20; k++) if (j.timeScale(1 / 60) === 0) frozen++;
    expect(frozen).toBeLessThanOrEqual(Math.ceil(FREEZE_CAP_MS / (1000 / 60)));
    expect(KICK_MIN).toBe(0.2);
  });
});

describe('C6 own hero lag', () => {
  const snap = (tick: number, x: number): Snapshot =>
    ({
      clock: { tick, phase: 'play' },
      entities: [
        { id: 0, kind: 'hero', team: 0, slot: 0, x, y: 0, hp: 1, maxHp: 1, shield: 0, state: 'moving', facing: 0, buffs: 0 },
        { id: 1, kind: 'hero', team: 1, slot: 1, x, y: 0, hp: 1, maxHp: 1, shield: 0, state: 'moving', facing: 0, buffs: 0 },
      ],
      projectiles: [],
      zones: [],
    }) as unknown as Snapshot;
  it('the own hero is drawn SELF_LAG behind the newest snapshot, the rest INTERP_LAG', () => {
    const b = new SnapBuffer();
    b.selfId = 0;
    let f = null;
    for (let t = 0; t <= 90; t++) {
      b.push(snap(t, t * 100));
      f = b.advance(1 / TICK_HZ);
    }
    expect(f).not.toBeNull();
    const me = f!.byId.get(0)!;
    const other = f!.byId.get(1)!;
    // the shared clock settles INTERP_LAG behind; the own hero sits (INTERP_LAG − SELF_LAG) ticks ahead of it
    expect(9000 - other.fx).toBeGreaterThan((INTERP_LAG - 0.4) * 100);
    expect(me.fx - other.fx).toBeCloseTo((INTERP_LAG - SELF_LAG) * 100, -1);
  });
});

describe('C5 in the sim: Attack on a minion at 10% HP pays a last hit within 1.5 s', () => {
  it('the Attack pick takes the weak minion, and the basic that kills it is a lastHit Fish event', async () => {
    const { createMatch, step } = await import('../../src/sim/index');
    const { G } = await import('../../src/sim/world');
    const { putMinion } = await import('./sim-helpers');
    const { place } = await import('./heroes/kit-helpers');
    const m = createMatch({ seed: 7, picks: ['clem', 'sage', 'brutus', 'lambo', 'cacklejaw', 'bengas'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'normal' });
    const w = m.world;
    w.globals[G.Tick] = 300;
    w.globals[G.BotsOff] = 1;
    for (let id = 1; id < 6; id++) place(m, id, 50000 + (id < 3 ? -30000 : 30000), 30000 + id * 3000, 0);
    place(m, 0, 50000, 30000, 0);
    const range = basicRange('clem');
    const full = putMinion(m, 1, 50000 + range, 30000);
    const weak = putMinion(m, 1, 50000 + range + 600, 30500);
    w.hp[weak] = Math.floor(w.maxHp[weak] / 10);
    // the units as the client sees them
    const units: Unit[] = [0, full, weak].map((id) => ({ id, kind: id === 0 ? 'hero' : 'minion', team: w.team[id], x: w.x[id], y: w.y[id], hp: w.hp[id], maxHp: w.maxHp[id], state: 'idle' }));
    const pick = attackPriority(units, units[0], 0, range, 7000, 'heroes', (u) => minionHitEstimate('clem', w.level[0], 0, u));
    expect(pick).toBe(weak);
    let paid = -1;
    for (let t = 0; t < 45 && paid < 0; t++) {
      step(m, t === 0 ? [{ op: Op.Attack, id: weak }] : []);
      if (m.events.some((e) => e.type === 'fish' && e.id === 0 && e.reason === 'lastHit')) paid = t;
    }
    expect(paid).toBeGreaterThanOrEqual(0);
    expect(paid).toBeLessThan(45);
  });
});
