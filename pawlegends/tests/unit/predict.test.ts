/** Party play N5 (MULTIPLAYER.md §4.3): the cosmetic walker leads, holds instead of pulling back, and converges. */
import { describe, expect, it } from 'vitest';
import { Predictor, type Planner, type PredictInput } from '../../src/net/predict';

const DT = 1000 / 60;
const TICK = 1000 / 30;

type Cmd = { at: number; op: 'move'; x: number; y: number } | { at: number; op: 'stop' };

/**
 * A toy authoritative hero: it applies each command `trueLatency` ms after it was issued and walks the planner's path
 * at `v` mm/ms. The predictor sees each command at issue time and the authoritative position every frame.
 */
function run(opts: {
  cmds: Cmd[];
  until: number;
  v?: number;
  latency?: number;
  trueLatency?: number;
  plan?: Planner;
  input?: (t: number) => Partial<PredictInput>;
}) {
  const v = opts.v ?? 5;
  const L = opts.latency ?? 200;
  const TL = opts.trueLatency ?? L;
  const plan = opts.plan ?? ((_sx, _sy, tx, ty) => [{ x: tx, y: ty }]);
  const p = new Predictor(plan);
  const auth = { x: 0, y: 0, path: [] as { x: number; y: number }[] };
  const pending = opts.cmds.slice();
  const issued = opts.cmds.slice();
  const out: { t: number; ax: number; ay: number; dx: number; dy: number }[] = [];
  for (let t = 0; t <= opts.until; t += DT) {
    while (issued.length && issued[0].at <= t) {
      const c = issued.shift()!;
      if (c.op === 'move') p.move(c.x, c.y, t);
      else p.stop();
    }
    while (pending.length && pending[0].at + TL <= t) {
      const c = pending.shift()!;
      auth.path = c.op === 'move' ? plan(auth.x, auth.y, c.x, c.y) : [];
    }
    let step = v * DT;
    const moving = auth.path.length > 0;
    while (step > 0 && auth.path.length) {
      const w = auth.path[0];
      const d = Math.hypot(w.x - auth.x, w.y - auth.y);
      if (d <= step) {
        auth.x = w.x;
        auth.y = w.y;
        step -= d;
        auth.path.shift();
      } else {
        auth.x += ((w.x - auth.x) / d) * step;
        auth.y += ((w.y - auth.y) / d) * step;
        step = 0;
      }
    }
    const a: PredictInput = { x: auth.x, y: auth.y, locked: false, speed: v * TICK, moving, ...opts.input?.(t) };
    const o = p.offset(a, L, t);
    out.push({ t, ax: a.x, ay: a.y, dx: a.x + o.dx, dy: a.y + o.dy });
  }
  return { p, out };
}

const speeds = (out: { dx: number; dy: number }[]) => out.slice(1).map((f, i) => Math.hypot(f.dx - out[i].dx, f.dy - out[i].dy) / DT);

describe('Predictor', () => {
  it('starts walking on the next frame at the move speed, about one latency ahead', () => {
    const { out } = run({ cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }], until: 1000 });
    expect(out[1].dx).toBeGreaterThan(0);
    const late = out[out.length - 1];
    expect(late.dx - late.ax).toBeGreaterThan(5 * 200 * 0.9);
    expect(late.dx - late.ax).toBeLessThan(5 * 200 * 1.1);
  });

  it('a held joystick (a Move re-issued every turn ahead of the hero) walks at a steady speed', () => {
    const cmds: Cmd[] = [];
    for (let t = 0; t < 2000; t += 200 / 3) cmds.push({ at: t, op: 'move', x: t * 5 + 2500, y: 0 });
    const { out } = run({ cmds, until: 2000 });
    const vel = speeds(out).slice(2, -2);
    expect(Math.min(...vel)).toBeGreaterThan(5 * 0.9);
    expect(Math.max(...vel)).toBeLessThan(5 * 1.1);
  });

  it('releasing the stick (or any other command) holds the drawn hero: it never steps back', () => {
    for (const L of [150, 300]) {
      const { out } = run({ cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }, { at: 800, op: 'stop' }], until: 2000, latency: L });
      let back = 0;
      for (let i = 1; i < out.length; i++) back = Math.max(back, out[i - 1].dx - out[i].dx);
      expect(back).toBeLessThan(2);
      const end = out[out.length - 1];
      expect(Math.abs(end.dx - end.ax)).toBeLessThan(1);
    }
  });

  it('a wrong latency estimate converges without a backward slide on release', () => {
    const { out } = run({ cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }, { at: 1500, op: 'stop' }], until: 3000, latency: 150, trueLatency: 220 });
    let back = 0;
    for (let i = 1; i < out.length; i++) back = Math.max(back, out[i - 1].dx - out[i].dx);
    expect(back).toBeLessThan(10);
    const end = out[out.length - 1];
    expect(Math.abs(end.dx - end.ax)).toBeLessThan(1);
    // the walk itself never surged (after the release the drawn hero may step on to where the sim stops)
    expect(Math.max(...speeds(out.filter((f) => f.t < 1500)))).toBeLessThan(5 * 1.25);
  });

  it('walks the path: turns the corner and stops where the path stops, never past it', () => {
    // the goal (6000, 0) is unreachable: the path turns at (3000, 0) and ends at (3000, 2000)
    const plan: Planner = () => [
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 },
    ];
    const { out } = run({ cmds: [{ at: 0, op: 'move', x: 6000, y: 0 }], until: 2500, plan });
    expect(Math.max(...out.map((f) => f.dx))).toBeLessThanOrEqual(3000 + 1e-6);
    expect(Math.max(...out.map((f) => f.dy))).toBeLessThanOrEqual(2000 + 1e-6);
    const end = out[out.length - 1];
    expect(Math.hypot(end.dx - 3000, end.dy - 2000)).toBeLessThan(1);
  });

  it('a 90° turn while walking turns where the hero is drawn, at the move speed (no surge)', () => {
    const { out } = run({ cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }, { at: 600, op: 'move', x: 3000, y: 10_000 }], until: 1500 });
    expect(Math.max(...speeds(out))).toBeLessThan(5 * 1.25);
  });

  it('a blink (the authoritative hero jumps) is drawn at once, no slide back', () => {
    const { out } = run({
      cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }, { at: 500, op: 'stop' }],
      until: 1200,
      input: (t) => (t >= 900 ? { x: 6000, y: 0, moving: false } : {}),
    });
    const f = out.find((o) => o.t >= 900 + DT)!;
    expect(f.dx).toBeCloseTo(6000, 0);
    let back = 0;
    for (let i = 1; i < out.length; i++) back = Math.max(back, out[i - 1].dx - out[i].dx);
    expect(back).toBeLessThan(2);
  });

  it('no walking under crowd control; the lead decays', () => {
    const p = new Predictor();
    p.move(10_000, 0, 0);
    p.offset({ x: 0, y: 0, locked: false, speed: 150 }, 200, 0);
    let o = { dx: 0, dy: 0 };
    for (let t = DT; t < 300; t += DT) o = p.offset({ x: 0, y: 0, locked: false, speed: 150 }, 200, t);
    expect(o.dx).toBeGreaterThan(0);
    for (let t = 300; t < 800; t += DT) o = p.offset({ x: 0, y: 0, locked: true, speed: 150 }, 200, t);
    expect(Math.hypot(o.dx, o.dy)).toBeLessThan(1);
    expect(p.leading).toBe(false);
  });

  it('a Move the sim never started stops walking after the latency plus the stall grace and draws the sim', () => {
    const p = new Predictor();
    let o = { dx: 0, dy: 0 };
    p.offset({ x: 0, y: 0, locked: false, speed: 150, moving: false }, 200, 0);
    p.move(10_000, 0, 0);
    for (let t = DT; t < 1500; t += DT) o = p.offset({ x: 0, y: 0, locked: false, speed: 150, moving: false }, 200, t);
    expect(p.heading).toBeNull();
    expect(Math.hypot(o.dx, o.dy)).toBeLessThan(1);
  });

  it('holds at the gate line before the barrier drops', () => {
    const { out } = run({ cmds: [{ at: 0, op: 'move', x: 10_000, y: 0 }], until: 1500, input: () => ({ xLimit: [0, 2000] as const }) });
    expect(Math.max(...out.slice(0, 50).map((f) => f.dx))).toBeLessThanOrEqual(2000 + 1e-6);
  });
});
