// @vitest-environment happy-dom
/**
 * PERF-IOS §8 Track A: the minimap draws a busy lane fight in ≤ 60 Canvas 2D calls (cached unit sprites, one
 * structures layer), repaints the structures layer only when a structure or a cleared bush changes, and skips the
 * redraw while the frame is still (a paused match).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Minimap, type MinimapHost } from '../../src/ui/minimap';
import type { ViewEntity, ViewFrame } from '../../src/render/interp';

type Call = [string | symbol, ...unknown[]];
function fakeCtx(calls: Call[]): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  return new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : (...a: unknown[]) => calls.push([k, ...a])),
    set: (t, k, v) => {
      t[k] = v;
      calls.push([`set:${String(k)}`, v]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
const host = (): MinimapHost => ({ peekHold: () => {}, peekEnd: () => {}, moveTo: () => {}, viewQuad: () => null, mySlot: () => 0, myTeam: () => 0 });
const ent = (p: Partial<ViewEntity> & { id: number; kind: ViewEntity['kind'] }): ViewEntity =>
  ({ team: 0, slot: 0, x: p.fx ?? 0, y: p.fy ?? 0, hp: 100, maxHp: 100, shield: 0, state: 'idle', facing: 0, buffs: 0, fx: 0, fy: 0, yaw: 0, speed: 0, ...p }) as ViewEntity;
const frame = (entities: ViewEntity[], tick = 100): ViewFrame =>
  ({
    tick,
    latest: { team: 0, clock: { tick, seconds: tick / 30, phase: 'early', nextPhaseIn: 0 }, score: { kills: [0, 0], towers: [0, 0] }, entities, projectiles: [], zones: [], events: [] },
    entities,
    byId: new Map(entities.map((e) => [e.id, e])),
    projectiles: [],
    zones: [],
  }) as unknown as ViewFrame;

let calls: Call[] = [];
beforeEach(() => {
  calls = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx(calls) as never);
});
afterEach(() => vi.restoreAllMocks());

function fight(tick: number): ViewFrame {
  const es: ViewEntity[] = [];
  for (let i = 0; i < 6; i++) es.push(ent({ id: i, kind: 'hero', hero: (['clem', 'lambo', 'sage', 'duchess', 'domino', 'aviete'] as const)[i], team: (i < 3 ? 0 : 1) as 0 | 1, fx: 40000 + i * 3000 + tick, fy: 30000 }));
  for (let i = 0; i < 32; i++) es.push(ent({ id: 100 + i, kind: 'minion', team: (i % 2) as 0 | 1, fx: 30000 + i * 1000 + tick, fy: 20000 + (i % 5) * 900 }));
  for (let i = 0; i < 18; i++) es.push(ent({ id: 200 + i, kind: 'tower', team: (i % 2) as 0 | 1, fx: 10000 + i * 5000, fy: 50000 - i * 2000, hp: 4000, maxHp: 4000 }));
  es.push(ent({ id: 300, kind: 'core', team: 0, fx: 8000, fy: 8000 }), ent({ id: 301, kind: 'core', team: 1, fx: 92000, fy: 52000 }));
  return frame(es, tick);
}

const drawCalls = (): number => calls.filter((c) => typeof c[0] === 'string' && !c[0].startsWith('set:')).length;

describe('minimap redraw cost', () => {
  it('a 6-hero, 32-minion, 20-structure frame costs ≤ 60 calls once its sprites exist', () => {
    const m = new Minimap(document.body, host());
    m.markDirty();
    m.draw(fight(0));
    calls.length = 0;
    m.markDirty();
    m.draw(fight(30));
    expect(m.minionsDrawn.square + m.minionsDrawn.diamond).toBe(32);
    expect(m.heroesDrawn).toHaveLength(6);
    expect(drawCalls()).toBeLessThanOrEqual(60);
  });

  it('the structures layer repaints only when a structure changes', () => {
    const m = new Minimap(document.body, host());
    m.markDirty();
    m.draw(fight(0));
    const p = m.layerPaints;
    m.markDirty();
    m.draw(fight(30));
    expect(m.layerPaints).toBe(p);
    const f = fight(60);
    (f.byId.get(205) as ViewEntity).state = 'dead';
    m.markDirty();
    m.draw(f);
    expect(m.layerPaints).toBe(p + 1);
    expect(m.fallenDrawn).toBe(1);
  });

  it('a still frame (paused) is not redrawn; a moving one is', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const m = new Minimap(document.body, host());
    m.markDirty();
    m.draw(fight(0));
    const f = fight(0);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(200);
      m.draw(f);
    }
    expect(m.stillSkips).toBe(5);
    vi.advanceTimersByTime(200);
    calls.length = 0;
    m.draw(fight(1));
    expect(drawCalls()).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
