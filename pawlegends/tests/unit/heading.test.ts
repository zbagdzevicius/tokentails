// @vitest-environment happy-dom
/**
 * Heading casts (founder: "flash must go where we are heading, on touch, no friction"; audit CF-03). A tap on Pounce
 * (and Live Wire, Tumble and the escape dashes) goes the FULL distance along the held joystick, else the hero's
 * movement, else its facing; never at an enemy, never the old 0.6 × range. With the joystick held the press fires.
 * The sim is not changed: these tests run the real sim to check that the client's command lands the full blink and
 * that the client's landing estimate (the ghost marker) matches the sim's wall clip.
 */
import { cameraYaw } from '../../src/render/coords';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRICKS } from '../../src/data/tricks';
import { aimFor, trickAim } from '../../src/input/abilities';
import type { InputHost } from '../../src/input/desktop';
import { HEADING_OVERSHOOT_MM, headingAngle, headingPoint, landing, MotionHeading } from '../../src/input/heading';
import { HOLD_BEHIND_CAST_MS, Orders, type OrderEnv } from '../../src/input/orders';
import { cursorCast, type Unit } from '../../src/input/targeting';
import { BLINK_GUARD_MS, STICK, TouchControls } from '../../src/input/touch/touchControls';
import { HUMAN_SLOT, Op, type Command, type HeroId, type SimEvent } from '../../src/sim/api';
import { blink, dash } from '../../src/sim/effects';
import { iatan2 } from '../../src/sim/fixed';
import { createMatch, fillPicks, step } from '../../src/sim/index';
import { quantize } from '../../src/sim/commands';
import { TOWER_SPOTS, CORE, mirrorX } from '../../src/data/map';
import type { MatchHandle } from '../../src/sim/state';

const POUNCE = trickAim('pounce');
/** A command point as the sim reads it: kept on the map (Orders), then quantised (sim/commands.ts). */
const cmdPoint = (p: { x: number; y: number }) =>
  quantize({ op: Op.Trick, x: Math.max(0, Math.min(100000, Math.round(p.x))), y: Math.max(0, Math.min(60000, Math.round(p.y))) }) as { x: number; y: number };
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
  it('near the map edge: a landing on the map keeps the ray; a landing off the map slides along the edge like a drag', () => {
    // the overshoot crosses the edge, the 4 m landing does not: the point stops at the edge on the same ray
    const near = { x: 5000, y: 30000 };
    const a = Math.PI * 0.95;
    const p = headingPoint(POUNCE, near, a);
    expect(p.x).toBeGreaterThanOrEqual(-1e-6);
    expect(turn(ang(p, near), a)).toBeLessThan(1e-6);
    // 1 m from the bottom edge at 45° down-left: the landing would be off the map. Like a drag, the command's clamp
    // bends the point and the hero slides along the edge almost the full distance (it used to stop after 1.4 m)
    const low = { x: 50000, y: 1000 };
    const l = landing(POUNCE, low, (-3 * Math.PI) / 4);
    expect(Math.hypot(l.x - low.x, l.y - low.y)).toBeGreaterThan(R - 300);
    expect(l.x).toBeLessThan(low.x - 3000);
  });
  it('the joystick, else the movement, else the way the hero last walked (not a facing turned by an attack)', () => {
    const me = { x: 24000, y: 29000 };
    expect(headingAngle(me, { stick: null, motion: null, moveGoal: null, lastMotion: -2, facing: 1 })).toBe(-2);
    expect(headingAngle(me, { stick: null, motion: null, moveGoal: null, lastMotion: null, facing: 1 })).toBe(1);
    // the drawn track keeps the last direction once the hero stands; a blink is a direction too; clear() forgets
    const m = new MotionHeading();
    for (let t = 0; t <= 200; t += 16) m.sample(10000, 10000 + t * 3, t);
    for (let t = 216; t <= 800; t += 16) m.sample(10000, 10600, t);
    expect(m.angle(800)).toBeNull();
    expect(m.last()).toBeCloseTo(Math.PI / 2);
    m.sample(6000, 10600, 816);
    expect(m.last()).toBeCloseTo(Math.PI);
    m.clear();
    expect(m.last()).toBeNull();
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
          const p = cmdPoint(headingPoint(POUNCE, { x, y }, a));
          blink(m, HUMAN_SLOT, p.x, p.y, TRICKS.pounce.blink);
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
          const p = cmdPoint(headingPoint(TUMBLE, { x, y }, a));
          dash(m, HUMAN_SLOT, iatan2(p.y - y, p.x - x), TUMBLE.range);
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
  it('at the map edge the ghost lands where the sim does (the command clamp bends the point, as for a drag)', () => {
    for (const [x, y, a] of [
      [50000, 1000, (-3 * Math.PI) / 4],
      [50000, 59000, Math.PI / 4],
      [30000, 1500, -Math.PI / 3],
    ]) {
      const m = simAt(x, y);
      const w = m.world;
      const p = headingPoint(POUNCE, { x, y }, a);
      step(m, [{ op: Op.Trick, x: Math.max(0, Math.min(100000, Math.round(p.x))), y: Math.max(0, Math.min(60000, Math.round(p.y))) }]);
      const l = landing(POUNCE, { x, y }, a);
      expect(Math.hypot(l.x - w.x[HUMAN_SLOT], l.y - w.y[HUMAN_SLOT]), `from ${x},${y}`).toBeLessThanOrEqual(1);
    }
  });
});

interface RigOpts {
  yaw?: number;
  units?: Unit[];
  cooldowns?: number[];
}

/**
 * A TouchControls on the real Orders (fake timers: performance.now drives both). `sim` is the own hero in the newest
 * snapshot (InputHost.simMe); `simCast` hands the input a raw own cast event, as the host does before the render clock.
 */
function rig(hero: HeroId = 'clem', o: RigOpts = {}) {
  // fake timers start the clock at 0: move on so the stick's throttle (STICK.everyMs since 0) does not hold the first move
  vi.advanceTimersByTime(1000);
  const units: Unit[] = o.units ?? [unit(0, 'hero', 0, 24000, 29000)];
  const sent: Command[] = [];
  const cds = o.cooldowns ?? [0, 0, 0, 0, 0];
  const env: OrderEnv = { send: (c) => sent.push(c), units: () => units, meId: 0, hero, trick: 'pounce', cooldowns: () => cds, level: () => 5, nowMs: () => performance.now() };
  const orders = new Orders(env);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const sim = { x: units[0].x, y: units[0].y, tick: 100 };
  const view = { myTeam: 0, mySlot: 0, aim: null as unknown, attackRange: false, lock: null, me: () => ({ hero, yaw: o.yaw ?? 0 }), recentre() {} };
  const host = { canvas, view, orders, enabled: () => true, units: () => units, onScoreboard() {}, onMenu() {}, onTalent: () => false, onActivity() {}, marker() {}, simMe: () => sim } as unknown as InputHost;
  const t = new TouchControls(host, document.body);
  t.enable(true);
  // the frame loop has run before (the cast buffer's stalled-frame pause measures from its last frame)
  orders.update();
  const btn = (b: string) => t.root.querySelector(`[data-b="${b}"]`) as HTMLElement;
  const ev = (type: string, id: number, x: number, y: number) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
  const down = (b: string, id: number, x = 900, y = 600) => btn(b).dispatchEvent(ev('pointerdown', id, x, y));
  const move = (id: number, x: number, y: number) => window.dispatchEvent(ev('pointermove', id, x, y));
  const up = (id: number, x = 900, y = 600) => window.dispatchEvent(ev('pointerup', id, x, y));
  /**
   * Hold the joystick (pointer 1) so the hero heads `a` rad in the sim. Feel pass B2: the view is diagonal, so the
   * thumb goes where that map direction shows on screen (the sim angle minus the camera yaw).
   */
  const stick = (a0: number) => {
    const a = a0 - cameraYaw();
    canvas.dispatchEvent(ev('pointerdown', 1, 150, 400));
    move(1, 150 + Math.cos(a) * STICK.radius, 400 - Math.sin(a) * STICK.radius);
  };
  /** Swing the held joystick to `a`. */
  const steer = (a0: number) => {
    const a = a0 - cameraYaw();
    move(1, 150 + Math.cos(a) * STICK.radius, 400 - Math.sin(a) * STICK.radius);
  };
  const tick = (ms = 16) => {
    vi.advanceTimersByTime(ms);
    orders.update();
    t.update(cds, [1, 1, 1, 1, 1], 5);
  };
  /** `ms` of 16 ms frames (one long tick reads as a stalled frame, which pauses the cast buffer's clocks). */
  const wait = (ms: number) => {
    for (let k = 0; k < ms; k += 16) tick(16);
  };
  /** The sim took a cast of `slot` at `at` (the raw event), and the next snapshot has the hero at (x, y). */
  const simCast = (slot: 0 | 1 | 2 | 3 | 4, at: number, x?: number, y?: number) => {
    const e: SimEvent = { type: 'cast', tick: at, src: 0, slot, x: 0, y: 0, target: -1 };
    orders.applied(e);
    t.onSimEvent(e);
    if (x !== undefined && y !== undefined) {
      sim.x = x;
      sim.y = y;
      sim.tick = at;
    }
  };
  const tricks = () => sent.filter((c) => c.op === Op.Trick) as Extract<Command, { op: typeof Op.Trick }>[];
  const casts = () => sent.filter((c) => c.op === Op.Cast) as Extract<Command, { op: typeof Op.Cast }>[];
  const moves = () => sent.filter((c) => c.op === Op.Move) as Extract<Command, { op: typeof Op.Move }>[];
  const aim = () => view.aim as { x: number; z: number } | null;
  return { t, view, sent, units, sim, down, move, up, stick, steer, tick, wait, simCast, tricks, casts, moves, aim, orders };
}

const aimMm = (g: { x: number; z: number }) => ({ x: g.x * 1000, y: -g.z * 1000 });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('touch: a tap on Pounce fires on the PRESS, the full range where the player is heading', () => {
  const me = { x: 24000, y: 29000 };
  it('joystick held: along the stick, in all 8 directions; the release sends nothing more; the ghost goes within GHOST_MS', () => {
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
      expect(r.t.heads).toEqual({ press: 1, fired: 1 });
      // the ghost marker shows the landing (4 m away) at once, then goes within GHOST_MS
      expect(Math.hypot(aimMm(r.aim()!).x - me.x, aimMm(r.aim()!).y - me.y)).toBeCloseTo(R, -2);
      r.up(5);
      expect(r.tricks().length).toBe(before + 1);
      r.simCast(4, 101);
      r.tick(200);
      expect(r.view.aim).toBeNull();
      r.t.dispose();
    }
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
  it('no joystick, the hero walking: the press (not the release) blinks along its movement', () => {
    const r = rig('clem', { yaw: 0 });
    // the hero walks south-west (its facing still says east)
    for (let i = 0; i < 12; i++) {
      r.units[0] = { ...r.units[0], x: r.units[0].x - 40, y: r.units[0].y - 40, state: 'moving' };
      r.sim.x = r.units[0].x;
      r.sim.y = r.units[0].y;
      r.tick();
    }
    const at = { x: r.units[0].x, y: r.units[0].y };
    r.down('trick', 5);
    expect(r.tricks()).toHaveLength(1);
    const c = r.tricks()[0];
    expect(turn(ang(c, at), (-3 * Math.PI) / 4)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeGreaterThan(R);
    r.up(5);
    expect(r.tricks()).toHaveLength(1);
    r.t.dispose();
  });
  it('standing after a walk: the way it last walked, even when an attack turned the facing to the enemy', () => {
    // walked north, stopped, then hit an enemy to the east (the facing says east)
    const r = rig('clem', { yaw: 0 });
    for (let i = 0; i < 12; i++) {
      r.units[0] = { ...r.units[0], y: r.units[0].y + 50, state: 'moving' };
      r.tick();
    }
    r.units[0] = { ...r.units[0], state: 'idle' };
    for (let i = 0; i < 30; i++) r.tick();
    const at = { x: r.units[0].x, y: r.units[0].y };
    r.sim.x = at.x;
    r.sim.y = at.y;
    r.down('trick', 5);
    const c = r.tricks().at(-1)!;
    expect(turn(ang(c, at), Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeGreaterThan(R);
    r.t.dispose();
  });
  it('never walked (just spawned): along the facing, at the full range', () => {
    const r = rig('clem', { yaw: Math.PI / 2 });
    r.tick();
    r.down('trick', 5);
    const c = r.tricks().at(-1)!;
    expect(turn(ang(c, me), Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
    r.t.dispose();
  });
  it('a drag after the press changes nothing: no second cast, no aim step, no cancel', () => {
    const r = rig('clem', { yaw: 0 });
    r.down('trick', 5, 900, 600);
    for (let i = 1; i <= 8; i++) r.move(5, 900, 600 - i * 15);
    r.up(5, 900, 480);
    expect(r.tricks()).toHaveLength(1);
    expect(turn(ang(r.tricks()[0], me), 0)).toBeLessThan(0.01);
    expect(document.querySelector('.pl-cancel.on')).toBeNull();
    r.t.dispose();
  });
  it('the cast goes from where the sim has the hero (the drawn hero trails it), so the full 4 m is measured from there', () => {
    const r = rig();
    r.sim.x = me.x + 500;
    r.stick(0);
    r.down('trick', 5);
    const c = r.tricks().at(-1)!;
    expect(c.x - (me.x + 500)).toBeGreaterThan(R);
    expect(Math.hypot(aimMm(r.aim()!).x - (me.x + 500 + R), aimMm(r.aim()!).y - me.y)).toBeLessThan(5);
    r.t.dispose();
  });
});

describe('touch: the run goes on from the landing (joystick held)', () => {
  const me = { x: 24000, y: 29000 };
  it('a trick order at once, then a move on from the landing; never a move back toward the old spot', () => {
    const r = rig();
    r.stick(Math.PI);
    const n = r.sent.length;
    r.down('trick', 5);
    const after = r.sent.slice(n);
    expect(after[0].op).toBe(Op.Trick);
    const moves = after.filter((c) => c.op === Op.Move) as Extract<Command, { op: typeof Op.Move }>[];
    expect(moves).toHaveLength(1);
    expect(moves[0].x).toBeLessThan(me.x - R);
    // the drawn and the sim hero still stand at the old spot: the stick sends nothing that pulls it back
    const k = r.moves().length;
    for (let i = 0; i < 5; i++) r.tick();
    for (const m of r.moves().slice(k - 1)) expect(m.x).toBeLessThan(me.x - R);
    r.t.dispose();
  });
  it('turning the stick while the blink lands steers at once, from the landing (it used to be ignored for 600 ms)', () => {
    const r = rig();
    r.stick(Math.PI);
    r.down('trick', 5);
    const n = r.moves().length;
    r.tick(120);
    r.steer(Math.PI / 2);
    r.tick();
    const m = r.moves().slice(n);
    expect(m.length).toBeGreaterThan(0);
    const last = m.at(-1)!;
    // north of the landing (4 m west), not north of the old spot
    expect(last.y).toBeGreaterThan(me.y + 1000);
    expect(Math.abs(last.x - (me.x - R))).toBeLessThan(400);
    r.t.dispose();
  });
  it('once the sim shows the cast, the stick steers from where the sim has the hero (a wrong guess is dropped at once)', () => {
    const r = rig();
    r.stick(Math.PI);
    r.down('trick', 5);
    // the sim landed it 1.5 m short of the client guess (an arena tether the client cannot see)
    r.simCast(4, 101, me.x - 2500, me.y);
    r.tick(120);
    const last = r.moves().at(-1)!;
    expect(last.x).toBeGreaterThan(me.x - 2500 - STICK.aheadMm - 300);
    expect(last.x).toBeLessThan(me.x - 2500 - STICK.aheadMm + 300);
    r.t.dispose();
  });
  it('a refused cast (never shown by the sim): the run-on ends and the stick walks again from the real spot, no freeze', () => {
    const r = rig();
    r.stick(Math.PI);
    r.down('trick', 5);
    const n = r.moves().length;
    // no event comes: Orders gives the cast up after its confirm window and the buffer runs out
    for (let i = 0; i < 40 && r.orders.castState(4) !== null; i++) r.tick(30);
    expect(r.orders.castState(4)).toBeNull();
    r.tick(120);
    const m = r.moves().slice(n);
    expect(m.length).toBeGreaterThan(0);
    // 2 m west of where the hero still stands (not of a landing that never happened)
    expect(Math.abs(m.at(-1)!.x - (me.x - STICK.aheadMm))).toBeLessThan(300);
    r.t.dispose();
  });
  it('the run-on never outlasts BLINK_GUARD_MS', () => {
    const r = rig();
    r.stick(Math.PI);
    r.down('trick', 5);
    r.tick(BLINK_GUARD_MS + 50);
    r.tick(120);
    expect(Math.abs(r.moves().at(-1)!.x - (me.x - STICK.aheadMm))).toBeLessThan(300);
    r.t.dispose();
  });
  it('a press the cast buffer keeps (hero busy): the ghost and the run-on come when it really goes', () => {
    const r = rig();
    r.stick(Math.PI);
    r.units[0] = { ...r.units[0], state: 'casting' };
    r.down('trick', 5);
    expect(r.tricks()).toHaveLength(0);
    expect(r.orders.castState(4)).toBe('buffered');
    expect(r.view.aim).toBeNull();
    expect(r.t.heads).toEqual({ press: 1, fired: 0 });
    r.units[0] = { ...r.units[0], state: 'moving' };
    r.tick();
    expect(r.tricks()).toHaveLength(1);
    expect(r.t.heads.fired).toBe(1);
    expect(r.view.aim).not.toBeNull();
    expect(r.moves().at(-1)!.x).toBeLessThan(me.x - R);
    r.t.dispose();
  });
  it('a stick that stands still although held (its move was dropped) sends its move again', () => {
    const r = rig();
    r.stick(0);
    const n = r.moves().length;
    expect(n).toBe(1);
    r.units[0] = { ...r.units[0], state: 'idle' };
    r.tick(STICK.stallMs + 20);
    expect(r.moves().length).toBe(n + 1);
    r.t.dispose();
  });
});

describe('the stick let go at the moment of the press: the Stop never eats the flash', () => {
  it('Orders holds a Stop behind a cast the sim has not shown, and sends it once the raw event shows it', () => {
    const r = rig();
    r.stick(0);
    r.down('trick', 5);
    r.up(1, 150 + STICK.radius, 400);
    const ops = r.sent.map((c) => c.op);
    expect(ops.slice(-2)).toEqual([Op.Trick, Op.Move]);
    expect(ops).not.toContain(Op.Stop);
    r.tick();
    expect(r.sent.map((c) => c.op)).not.toContain(Op.Stop);
    r.simCast(4, 101);
    expect(r.sent.at(-1)!.op).toBe(Op.Stop);
    r.t.dispose();
  });
  it('a held Stop goes after HOLD_BEHIND_CAST_MS at most; a newer move replaces it', () => {
    const r = rig();
    r.down('trick', 5);
    r.orders.stop();
    r.orders.attack(4);
    expect(r.sent.some((c) => c.op === Op.Stop || c.op === Op.Attack)).toBe(false);
    r.tick(HOLD_BEHIND_CAST_MS + 20);
    // the newest held order (the attack) goes; the stop it replaced does not
    expect(r.sent.filter((c) => c.op === Op.Attack)).toHaveLength(1);
    expect(r.sent.filter((c) => c.op === Op.Stop)).toHaveLength(0);
    const q = rig();
    q.down('trick', 6);
    q.orders.stop();
    q.orders.move(20000, 29000);
    q.simCast(4, 101);
    q.tick();
    expect(q.sent.filter((c) => c.op === Op.Stop)).toHaveLength(0);
    r.t.dispose();
    q.t.dispose();
  });
  it('a cast the raw events showed is never sent twice, even when the render clock is slow to confirm it', () => {
    const r = rig();
    r.down('trick', 5);
    r.simCast(4, 101);
    for (let i = 0; i < 20; i++) r.tick(50);
    expect(r.tricks()).toHaveLength(1);
    expect(r.orders.buffers.retried).toBe(0);
    r.t.dispose();
  });
  it('with nothing in flight a Stop goes at once', () => {
    const r = rig();
    r.orders.stop();
    expect(r.sent.at(-1)!.op).toBe(Op.Stop);
    r.t.dispose();
  });
});

describe('touch: the other heading skills', () => {
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
  it('Live Wire return: the ghost is where she cast it from, the run goes on from there, the stick is not held up', () => {
    const r = rig('aviete');
    r.stick(0);
    r.down('e', 5);
    r.up(5);
    const out = aimMm(r.aim()!);
    expect(out.x - me.x).toBeGreaterThan(4000);
    // the sim took it: she is 4.5 m east now; the return window opens from where she was (the snapshot before)
    r.simCast(2, 101);
    r.sim.x = me.x + 4500;
    r.sim.tick = 101;
    r.units[0] = { ...r.units[0], x: me.x + 4500 };
    r.wait(200);
    // the second press is the return: back to the start, not 4.5 m further east
    r.down('e', 6);
    const back = aimMm(r.aim()!);
    expect(Math.hypot(back.x - me.x, back.y - me.y)).toBeLessThan(5);
    // the run goes on east from the return point, not from a made-up landing 9 m east
    const m = r.moves().at(-1)!;
    expect(Math.abs(m.x - (me.x + STICK.aheadMm))).toBeLessThan(300);
    // once the sim shows the return, the window is closed: the next E (after its cooldown) goes ahead again
    r.simCast(2, 120, me.x, me.y);
    r.units[0] = { ...r.units[0], x: me.x };
    r.wait(200);
    r.up(6);
    r.down('e', 7);
    expect(aimMm(r.aim()!).x - me.x).toBeGreaterThan(4000);
    r.t.dispose();
  });
  it('the Live Wire window closes after its return ticks', () => {
    const r = rig('aviete');
    r.stick(0);
    r.down('e', 5);
    r.up(5);
    r.simCast(2, 101, me.x + 4500, me.y);
    r.units[0] = { ...r.units[0], x: me.x + 4500 };
    r.wait(2100);
    r.down('e', 6);
    expect(aimMm(r.aim()!).x - (me.x + 4500)).toBeGreaterThan(4000);
    r.t.dispose();
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
  it('no cursor on the ground, or the cursor on the hero: along the facing, not +x', () => {
    for (const cursor of [null, { x: 10000, y: 10000 }]) {
      const c = cursorCast(POUNCE, me, cursor, null, [me], 0, true, Math.PI / 2)!;
      expect(turn(ang(c, me), Math.PI / 2)).toBeLessThan(1e-6);
      expect(Math.hypot(c.x - me.x, c.y - me.y)).toBeGreaterThan(R);
    }
  });
  it('Live Wire keeps its cursor-placed blink on desktop (a short blink just past a thin wall)', () => {
    const wire = aimFor('aviete', 2);
    expect(cursorCast(wire, me, { x: 12000, y: 10000 }, null, [me], 0, true)).toEqual({ x: 12000, y: 10000, id: 0xff });
    const far = cursorCast(wire, me, { x: 30000, y: 10000 }, null, [me], 0, true)!;
    expect(far.x - me.x).toBeLessThanOrEqual(wire.range);
    expect(far.x - me.x).toBeGreaterThan(wire.range - 50);
  });
});
