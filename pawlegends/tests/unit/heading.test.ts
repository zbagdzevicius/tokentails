// @vitest-environment happy-dom
/**
 * Heading casts (founder: "flash must go where we are heading, on touch, no friction"; audit CF-03). A tap on Pounce
 * (and Live Wire, Tumble and the escape dashes) goes the FULL distance along the held joystick, else the hero's
 * movement, else its facing; never at an enemy, never the old 0.6 × range. With the joystick held the press fires.
 * The sim is not changed: these tests run the real sim to check that the client's command lands the full blink and
 * that the client's landing estimate (the ghost marker) matches the sim's wall clip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { aimFor, trickAim } from '../../src/input/abilities';
import type { InputHost } from '../../src/input/desktop';
import { HEADING_OVERSHOOT_MM, headingAngle, headingPoint, landing, MotionHeading } from '../../src/input/heading';
import { Orders, type OrderEnv } from '../../src/input/orders';
import { cursorCast, type Unit } from '../../src/input/targeting';
import { STICK, TouchControls } from '../../src/input/touch/touchControls';
import { HUMAN_SLOT, Op, type Command, type HeroId } from '../../src/sim/api';
import { blink, dash } from '../../src/sim/effects';
import { iatan2 } from '../../src/sim/fixed';
import { createMatch, fillPicks, step } from '../../src/sim/index';
import { TOWER_SPOTS, CORE, mirrorX } from '../../src/data/map';
import type { MatchHandle } from '../../src/sim/state';

const POUNCE = trickAim('pounce');
const R = POUNCE.range;
const unit = (id: number, kind: Unit['kind'], team: number, x: number, y: number, state: Unit['state'] = 'idle'): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state });
const ang = (p: { x: number; y: number }, o: { x: number; y: number }): number => Math.atan2(p.y - o.y, p.x - o.x);
const turn = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

describe('heading aim point (pure)', () => {
  const me = { x: 24000, y: 29000 };
  it('the joystick wins, then the movement, then a move order still being walked, then the facing', () => {
    expect(headingAngle(me, { stick: 1, motion: 2, moveGoal: { x: 0, y: 0 }, facing: 3 })).toBe(1);
    expect(headingAngle(me, { stick: null, motion: 2, moveGoal: { x: 0, y: 0 }, facing: 3 })).toBe(2);
    expect(headingAngle(me, { stick: null, motion: null, moveGoal: { x: 24000, y: 35000 }, facing: 3 })).toBeCloseTo(Math.PI / 2);
    expect(headingAngle(me, { stick: null, motion: null, moveGoal: null, facing: 3 })).toBe(3);
  });
  it('the command point is the full range plus the overshoot along the heading (never 0.6 × range)', () => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const p = headingPoint(POUNCE, me, a);
      expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeCloseTo(R + HEADING_OVERSHOOT_MM, 0);
      expect(turn(ang(p, me), a)).toBeLessThan(1e-6);
    }
  });
  it('near the map edge the point stays on the same ray (the command clamps x and y to the map)', () => {
    const edge = { x: 1500, y: 30000 };
    const a = Math.PI * 0.9;
    const p = headingPoint(POUNCE, edge, a);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(turn(ang(p, edge), a)).toBeLessThan(1e-6);
  });
  it('movement is read from the drawn track; a jump (a blink) starts the window again', () => {
    const m = new MotionHeading();
    expect(m.angle(0)).toBeNull();
    for (let t = 0; t <= 200; t += 16) m.sample(10000 - t * 3, 10000, t);
    expect(m.angle(200)).toBeCloseTo(Math.PI);
    // standing still: no movement heading
    const s = new MotionHeading();
    for (let t = 0; t <= 200; t += 16) s.sample(10000, 10000, t);
    expect(s.angle(200)).toBeNull();
    // a blink: the 4 m jump is not read as a run
    m.sample(20000, 10000, 216);
    expect(m.angle(216)).toBeNull();
  });
});

/** A fresh sim match after the gates open, with the human hero moved to (x, y). */
function simAt(x: number, y: number, hero: HeroId = 'clem'): MatchHandle {
  const { picks, tricks } = fillPicks(7, hero, 'pounce');
  const m = createMatch({ seed: 7, picks, tricks, difficulty: 'easy' }) as MatchHandle;
  for (let i = 0; i < 100; i++) step(m, []);
  place(m, x, y);
  return m;
}
function place(m: MatchHandle, x: number, y: number): void {
  const w = m.world;
  w.x[HUMAN_SLOT] = x;
  w.y[HUMAN_SLOT] = y;
  w.moveX[HUMAN_SLOT] = x;
  w.moveY[HUMAN_SLOT] = y;
  w.pathLen[HUMAN_SLOT] = 0;
}

describe('heading casts against the real sim (the sim is unchanged)', () => {
  it('a tap blinks the full 4 m from where the sim has the hero, even when the drawn hero trails it while running', () => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const m = simAt(24000, 29000);
      const w = m.world;
      // the drawn (interpolated) hero trails the sim by ~0.35 m along the run
      const drawn = { x: 24000 - Math.cos(a) * 350, y: 29000 - Math.sin(a) * 350 };
      const p = headingPoint(POUNCE, drawn, a);
      step(m, [{ op: Op.Trick, x: Math.round(p.x), y: Math.round(p.y) }]);
      const d = Math.hypot(w.x[HUMAN_SLOT] - 24000, w.y[HUMAN_SLOT] - 29000);
      expect(d).toBeGreaterThan(TRICKS.pounce.blink - 150);
      expect(d).toBeLessThanOrEqual(TRICKS.pounce.blink + 150);
      expect(turn(Math.atan2(w.y[HUMAN_SLOT] - 29000, w.x[HUMAN_SLOT] - 24000), a)).toBeLessThan(0.06);
    }
  });
  it('the ghost marker lands where the sim does, walls and map edge included (sampled across the map)', () => {
    const m = simAt(24000, 29000);
    const w = m.world;
    const structures = [CORE, ...TOWER_SPOTS].flatMap((s) => [s, { x: mirrorX(s.x), y: s.y }]);
    let near = 0;
    let checked = 0;
    for (let x = 2000; x < 98000; x += 3700) {
      for (let y = 2000; y < 58000; y += 3100) {
        if (structures.some((s) => Math.hypot(s.x - x, s.y - y) < 12000)) continue;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + 0.1;
          place(m, x, y);
          const p = headingPoint(POUNCE, { x, y }, a);
          blink(m, HUMAN_SLOT, Math.round(p.x), Math.round(p.y), TRICKS.pounce.blink);
          const l = landing(POUNCE, { x, y }, a);
          const err = Math.hypot(l.x - w.x[HUMAN_SLOT], l.y - w.y[HUMAN_SLOT]);
          expect(err, `from ${x},${y} at ${a.toFixed(2)}`).toBeLessThanOrEqual(1);
          if (Math.hypot(w.x[HUMAN_SLOT] - x, w.y[HUMAN_SLOT] - y) < TRICKS.pounce.blink - 300) near++;
          checked++;
        }
      }
    }
    // the sample really crosses walls and edges
    expect(checked).toBeGreaterThan(200);
    expect(near).toBeGreaterThan(10);
  });
  it('the Tumble marker ends where the sim dash ends (dash reads the angle of the command point, stops at walls)', () => {
    const TUMBLE = aimFor('clem', 2);
    const m = simAt(24000, 29000);
    const w = m.world;
    // the client's walls have no structures (the sim's grid has the standing towers and cores)
    const structures = [CORE, ...TOWER_SPOTS].flatMap((s) => [s, { x: mirrorX(s.x), y: s.y }]);
    let checked = 0;
    for (let x = 2000; x < 98000; x += 5300) {
      for (let y = 2000; y < 58000; y += 4100) {
        if (structures.some((s) => Math.hypot(s.x - x, s.y - y) < 12000)) continue;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + 0.2;
          place(m, x, y);
          const p = headingPoint(TUMBLE, { x, y }, a);
          const px = Math.max(0, Math.min(100000, Math.round(p.x)));
          const py = Math.max(0, Math.min(60000, Math.round(p.y)));
          dash(m, HUMAN_SLOT, iatan2(py - y, px - x), TUMBLE.range);
          const l = landing(TUMBLE, { x, y }, a);
          expect(Math.hypot(l.x - w.fmX[HUMAN_SLOT], l.y - w.fmY[HUMAN_SLOT]), `from ${x},${y}`).toBeLessThanOrEqual(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('next to a wall: a blink into the wall stops at the last free point, like the sim', () => {
    // the base wall west of x = 1 m: blink west from 2 m
    const m = simAt(2500, 30000);
    const w = m.world;
    const p = headingPoint(POUNCE, { x: 2500, y: 30000 }, Math.PI);
    step(m, [{ op: Op.Trick, x: Math.round(p.x), y: Math.round(p.y) }]);
    const l = landing(POUNCE, { x: 2500, y: 30000 }, Math.PI);
    expect(Math.hypot(l.x - w.x[HUMAN_SLOT], l.y - w.y[HUMAN_SLOT])).toBeLessThan(300);
    expect(w.x[HUMAN_SLOT]).toBeGreaterThan(0);
    expect(Math.abs(w.y[HUMAN_SLOT] - 30000)).toBeLessThan(50);
  });
});

function rig(hero: HeroId = 'clem', o: { yaw?: number; units?: Unit[] } = {}) {
  const units: Unit[] = o.units ?? [unit(0, 'hero', 0, 24000, 29000)];
  const sent: Command[] = [];
  let now = 0;
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => [0, 0, 0, 0, 0], level: () => 5, nowMs: () => now };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero, yaw: o.yaw ?? 0 }), recentre() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {} } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  const btn = (b: string) => t.root.querySelector(`[data-b="${b}"]`) as HTMLElement;
  const ev = (type: string, id: number, x: number, y: number) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
  const down = (b: string, id: number, x = 900, y = 600) => btn(b).dispatchEvent(ev('pointerdown', id, x, y));
  const move = (id: number, x: number, y: number) => window.dispatchEvent(ev('pointermove', id, x, y));
  const up = (id: number, x = 900, y = 600) => window.dispatchEvent(ev('pointerup', id, x, y));
  /** Hold the joystick (pointer 1) at `a` rad (sim convention: screen up is +y). */
  const stick = (a: number) => {
    canvas.dispatchEvent(ev('pointerdown', 1, 150, 400));
    move(1, 150 + Math.cos(a) * STICK.radius, 400 - Math.sin(a) * STICK.radius);
  };
  const tick = (ms = 16) => {
    now += ms;
    t.update([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], 5);
  };
  const tricks = () => sent.filter((c) => c.op === Op.Trick) as Extract<Command, { op: typeof Op.Trick }>[];
  const casts = () => sent.filter((c) => c.op === Op.Cast) as Extract<Command, { op: typeof Op.Cast }>[];
  return { t, view, sent, units, down, move, up, stick, tick, tricks, casts, orders };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('touch: a tap on Pounce', () => {
  const me = { x: 24000, y: 29000 };
  it('joystick held: the PRESS blinks the full range along the stick, in all 8 directions; the release sends nothing more', () => {
    vi.useFakeTimers();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const r = rig();
      r.stick(a);
      const before = r.tricks().length;
      r.down('trick', 5);
      expect(r.tricks().length).toBe(before + 1);
      const c = r.tricks().at(-1)!;
      expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
      expect(turn(ang(c, me), a)).toBeLessThan(0.01);
      expect(r.t.heads.press).toBe(1);
      // the ghost marker shows the landing (4 m away), then goes within GHOST_MS
      const g = r.view.aim as { x: number; z: number };
      expect(Math.hypot(g.x * 1000 - me.x, -g.z * 1000 - me.y)).toBeCloseTo(R, -2);
      r.up(5);
      expect(r.tricks().length).toBe(before + 1);
      vi.advanceTimersByTime(200);
      r.tick(200);
      expect(r.view.aim).toBeNull();
      r.t.dispose();
    }
    vi.useRealTimers();
  });
  it('never toward an enemy hero, never a shortened point', () => {
    const r = rig('clem', { units: [unit(0, 'hero', 0, 24000, 29000), unit(4, 'hero', 1, 24000, 31000)] });
    r.stick(0);
    r.down('trick', 5);
    const c = r.tricks().at(-1)!;
    expect(c.y).toBe(29000);
    expect(c.x - me.x).toBeGreaterThan(R);
    r.t.dispose();
  });
  it('no joystick, the hero walking: the release blinks along its movement', () => {
    const r = rig('clem', { yaw: 0 });
    // the hero walks south-west (its facing still says east)
    for (let i = 0; i < 12; i++) {
      r.units[0] = { ...r.units[0], x: r.units[0].x - 40, y: r.units[0].y - 40, state: 'moving' };
      r.tick();
    }
    const at = { x: r.units[0].x, y: r.units[0].y };
    r.down('trick', 5);
    expect(r.tricks().length).toBe(0);
    r.up(5);
    const c = r.tricks().at(-1)!;
    expect(turn(ang(c, at), (-3 * Math.PI) / 4)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeGreaterThan(R);
    expect(r.t.heads.release).toBe(1);
    r.t.dispose();
  });
  it('standing still: along the facing, at the full range', () => {
    const r = rig('clem', { yaw: Math.PI / 2 });
    r.tick();
    r.down('trick', 5);
    r.up(5);
    const c = r.tricks().at(-1)!;
    expect(turn(ang(c, me), Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
    r.t.dispose();
  });
  it('a short drag under the smart zone is a tap; a longer drag picks the direction, always the full range', () => {
    const r = rig('clem', { yaw: 0 });
    r.down('trick', 5, 900, 600);
    r.move(5, 920, 600);
    r.up(5, 910, 600);
    expect(turn(ang(r.tricks().at(-1)!, me), 0)).toBeLessThan(0.01);
    r.t.dispose();
    // drag 40 px up (CF-03: a drag toward the screen edge used to reach only part of the range)
    const d = rig('clem', { yaw: 0 });
    d.down('trick', 6, 900, 600);
    for (let i = 1; i <= 4; i++) d.move(6, 900, 600 - i * 10);
    d.up(6, 900, 560);
    const c = d.tricks().at(-1)!;
    expect(turn(ang(c, me), Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
    d.t.dispose();
  });
  it('the cast is a plain trick order at once (no walk-in), then the run goes on from the landing, not back', () => {
    const r = rig();
    r.stick(Math.PI);
    const n = r.sent.length;
    r.down('trick', 5);
    const after = r.sent.slice(n);
    expect(after[0].op).toBe(Op.Trick);
    // the joystick's next move starts at the landing (4 m west) and runs on west: never a move back east of it
    const moves = after.filter((c) => c.op === Op.Move) as Extract<Command, { op: typeof Op.Move }>[];
    expect(moves).toHaveLength(1);
    expect(moves[0].x).toBeLessThan(me.x - R);
    // (the stick slides along a wall near the landing, like a held stick does: slideAngle)
    expect(Math.abs(moves[0].y - me.y)).toBeLessThan(2000);
    // the drawn hero still stands at the old spot for a few frames: the stick sends nothing that pulls it back
    for (let i = 0; i < 5; i++) r.tick();
    expect(r.sent.slice(n).filter((c) => c.op === Op.Move)).toHaveLength(1);
    // once it is drawn at the landing, the stick steers again
    r.units[0] = { ...r.units[0], x: me.x - R, state: 'moving' };
    r.tick(200);
    r.tick(200);
    expect(r.tricks()).toHaveLength(1);
    r.t.dispose();
  });
});

describe('touch: the other heading skills (Live Wire, Tumble)', () => {
  const me = { x: 24000, y: 29000 };
  it('Avietė E (Live Wire) and Clem E (Tumble) fire on the press along the joystick, full range', () => {
    for (const hero of ['aviete', 'clem'] as const) {
      const r = rig(hero);
      r.stick(Math.PI / 4);
      r.down('e', 5);
      const c = r.casts().at(-1)!;
      expect(c.slot).toBe(2);
      expect(turn(ang(c, me), Math.PI / 4)).toBeLessThan(0.01);
      expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(aimFor(hero, 2).range);
      r.t.dispose();
    }
  });
  it('damage skills keep the smart cast (Clem Q at the enemy hero, on the release)', () => {
    const r = rig('clem', { units: [unit(0, 'hero', 0, 24000, 29000), unit(4, 'hero', 1, 24000, 31000)] });
    r.stick(0);
    r.down('q', 5);
    expect(r.casts()).toHaveLength(0);
    r.up(5);
    expect(r.casts().at(-1)).toMatchObject({ slot: 0, x: 24000, y: 31000 });
    r.t.dispose();
  });
});

describe('desktop: Pounce on its key', () => {
  const me = unit(0, 'hero', 0, 10000, 10000);
  it('goes the full range toward the cursor, near or far (it was the cursor point, or range − 5 mm)', () => {
    for (const cursor of [{ x: 11000, y: 10500 }, { x: 30000, y: 10000 }, { x: 10000, y: 9000 }]) {
      const c = cursorCast(POUNCE, me, cursor, null, [me], 0, true)!;
      expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
      expect(turn(ang(c, me), ang(cursor, me))).toBeLessThan(1e-6);
    }
  });
});
