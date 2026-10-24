// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3.5 review (render only; nothing under src/sim changes): a hero stood inside a siege
 * cart (the cart kept only the 1.0 m a cadet keeps, but it is ~1.5 m long), and a cadet stood in Sir Brutus's legs
 * because the minion clearance was measured from the hero's sim point, not from where its body is drawn.
 */
import { describe, expect, it } from 'vitest';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map((entities as { id: number }[]).map((e) => [e.id, e])) }) as unknown as ViewFrame;
const base = { team: 1, hp: 100, maxHp: 100, shield: 0, buffs: 0, yaw: 0, speed: 0, state: 'idle' };

describe('a siege cart is never drawn round a hero', () => {
  it('a cart 0.6 m from a hero is drawn at least SIEGE_CLEAR - 0.05 m from it, a cadet keeps MINION_CLEAR', async () => {
    const { MinionInstances, MINION_CLEAR, SIEGE_CLEAR, minionClear } = await import('../../src/render/views/minionInstances');
    expect(SIEGE_CLEAR).toBeGreaterThanOrEqual(1.7);
    expect(minionClear('siege')).toBe(SIEGE_CLEAR);
    expect(minionClear('melee')).toBe(MINION_CLEAR);
    const m = new MinionInstances();
    m.heroes = [{ x: 90, z: -30 }];
    const cart = { ...base, id: 200, kind: 'minion', variant: 'siege', team: 1, fx: 90600, fy: 30000 };
    const cadet = { ...base, id: 201, kind: 'minion', variant: 'melee', team: 1, fx: 89400, fy: 30000 };
    for (let i = 0; i < 4; i++) m.update(frame([cart, cadet]), 1 / 60, i / 60);
    const c = m.drawnAt.get(200) as { x: number; z: number };
    const k = m.drawnAt.get(201) as { x: number; z: number };
    expect(Math.hypot(c.x - 90, c.z + 30)).toBeGreaterThanOrEqual(SIEGE_CLEAR - 0.05);
    expect(Math.hypot(k.x - 90, k.z + 30)).toBeGreaterThanOrEqual(MINION_CLEAR - 0.05);
    expect(Math.hypot(k.x - 90, k.z + 30)).toBeLessThan(SIEGE_CLEAR - 0.3);
  });
});

describe('the minion clearance follows the drawn hero body', () => {
  it('HeroView.drawnAt reports the pushed-apart body position, which differs from the sim point in a pile', async () => {
    const { HeroView } = await import('../../src/render/views/heroView');
    const v = new HeroView();
    const a = { ...base, id: 0, kind: 'hero', hero: 'brutus', team: 1, fx: 90000, fy: 30000, state: 'idle' };
    const b = { ...base, id: 1, kind: 'hero', hero: 'clem', team: 0, fx: 90100, fy: 30000, state: 'idle' };
    const f = frame([a, b]);
    for (let i = 0; i < 30; i++) v.update(f, 1 / 60);
    const pa = v.drawnAt(0) as { x: number; z: number };
    const pb = v.drawnAt(1) as { x: number; z: number };
    expect(pa).toBeTruthy();
    expect(v.drawnAt(99)).toBeNull();
    // the two bodies 0.1 m apart in the sim are drawn further apart than that
    expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThan(0.3);
  });
});

describe('a minion in front of or behind a hero is drawn clear of the hero on screen', () => {
  it('the clearance is DEPTH_CLEAR_K longer along world z (the gameplay camera depth) than sideways', async () => {
    const { MinionInstances, MINION_CLEAR, DEPTH_CLEAR_K, clearOf } = await import('../../src/render/views/minionInstances');
    expect(DEPTH_CLEAR_K).toBeGreaterThanOrEqual(1.4);
    const o = { x: 0, z: 0 };
    // sideways at the clearance: unchanged; in depth at the same distance: pushed out to the ellipse
    expect(clearOf(MINION_CLEAR, 0, 0, 0, MINION_CLEAR, o)).toEqual({ x: MINION_CLEAR, z: 0 });
    clearOf(0, MINION_CLEAR, 0, 0, MINION_CLEAR, o);
    expect(o.z).toBeCloseTo(MINION_CLEAR * DEPTH_CLEAR_K, 5);
    // a cadet 0.9 m south of a hero (in front of it on screen) is drawn at least 1.4 m from it after a few frames
    const m = new MinionInstances();
    m.heroes = [{ x: 90, z: -30 }];
    const cadet = { ...base, id: 202, kind: 'minion', variant: 'melee', team: 1, fx: 90000, fy: 29100 };
    for (let i = 0; i < 4; i++) m.update(frame([cadet]), 1 / 60, i / 60);
    const k = m.drawnAt.get(202) as { x: number; z: number };
    expect(Math.abs(k.z + 30)).toBeGreaterThanOrEqual(MINION_CLEAR * DEPTH_CLEAR_K - 0.05);
  });
});

describe('a minion squeezed between a hero and a structure is drawn clear of both', () => {
  it('it slides round the structure edge instead of being pushed back into the hero', async () => {
    const { MinionInstances, MINION_CLEAR } = await import('../../src/render/views/minionInstances');
    const m = new MinionInstances();
    // a tower footprint (r 2.6 m) at x 93, a hero 3.2 m west of its centre, a cadet between them
    m.blocks = [{ x: 93, z: -30, r: 2.6 }];
    m.heroes = [{ x: 89.8, z: -30.05 }];
    const cadet = { ...base, id: 203, kind: 'minion', variant: 'melee', team: 1, fx: 90500, fy: 30000 };
    let worst = 1e9;
    for (let i = 0; i < 30; i++) {
      m.update(frame([cadet]), 1 / 60, i / 60);
      const k = m.drawnAt.get(203) as { x: number; z: number };
      if (i >= 5) worst = Math.min(worst, Math.hypot(k.x - 89.8, k.z + 30.05));
      expect(Math.hypot(k.x - 93, k.z + 30)).toBeGreaterThanOrEqual(2.6 + 0.35 - 0.05);
    }
    expect(worst).toBeGreaterThanOrEqual(MINION_CLEAR - 0.05);
  });
});
