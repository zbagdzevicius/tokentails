// @vitest-environment happy-dom
/**
 * MAP-GAPS A2-A11, A18-A21, A24 (UI only): the minimap's hero marks, colours, inset, pings, ghosts, landmarks and
 * flip. A recording 2D context stands in for the canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { Minimap, heroDrawOrder, heroInitial, type MinimapHost } from '../../src/ui/minimap';
import type { ViewEntity, ViewFrame } from '../../src/render/interp';

export type Call = [string | symbol, ...unknown[]];
export function fakeCtx(calls: Call[]): CanvasRenderingContext2D {
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

export let calls: Call[] = [];
beforeEach(() => {
  calls = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx(calls) as never);
});
afterEach(() => vi.restoreAllMocks());

export function host(over: Partial<MinimapHost> = {}): MinimapHost {
  return { lookAt: () => {}, moveTo: () => {}, viewQuad: () => null, mySlot: () => 0, myTeam: () => 0, ...over };
}

export function ent(p: Partial<ViewEntity> & { id: number; kind: ViewEntity['kind'] }): ViewEntity {
  return { team: 0, slot: 0, x: p.fx ?? 0, y: p.fy ?? 0, hp: 100, maxHp: 100, shield: 0, state: 'idle', facing: 0, buffs: 0, fx: 0, fy: 0, yaw: 0, speed: 0, ...p } as ViewEntity;
}

export function frame(entities: ViewEntity[], tick = 100): ViewFrame {
  return {
    tick,
    latest: { team: 0, clock: { tick, seconds: tick / 30, phase: 'early', nextPhaseIn: 0 }, score: { kills: [0, 0], towers: [0, 0] }, entities, projectiles: [], zones: [], events: [] },
    entities,
    byId: new Map(entities.map((e) => [e.id, e])),
    projectiles: [],
    zones: [],
  } as unknown as ViewFrame;
}

/** Draw twice (the minimap draws every other call). */
export function draw(m: Minimap, f: ViewFrame | null): void {
  m.draw(f);
  m.draw(f);
}

describe('MAP-GAPS A3 hero marks', () => {
  it('draws the player last', () => {
    const order = heroDrawOrder([{ id: 0 }, { id: 4 }, { id: 1 }, { id: 3 }], 1).map((h) => h.id);
    expect(order).toEqual([0, 3, 4, 1]);
  });

  it('gives every hero on a team a distinct initial', () => {
    for (let i = 0; i < HERO_IDS.length; i++) {
      for (let j = i + 1; j < HERO_IDS.length; j++) {
        for (let k = j + 1; k < HERO_IDS.length; k++) {
          const team = [HERO_IDS[i], HERO_IDS[j], HERO_IDS[k]];
          const t = team.map((h) => heroInitial(h, team));
          expect(new Set(t).size, team.join(',')).toBe(3);
        }
      }
    }
    expect(heroInitial('clem', ['clem', 'sage'])).toBe('C');
  });

  it('marks every live hero, the player last', () => {
    const m = new Minimap(document.body, host({ mySlot: () => 1 }));
    draw(m, frame([ent({ id: 0, kind: 'hero', hero: 'clem', fx: 3000, fy: 30000 }), ent({ id: 1, kind: 'hero', hero: 'sage', fx: 3000, fy: 32000 }), ent({ id: 3, kind: 'hero', hero: 'brutus', team: 1, fx: 97000, fy: 30000 })]));
    expect(m.heroesDrawn).toHaveLength(3);
    expect(m.heroesDrawn.at(-1)).toMatch(/^sage:/);
  });
});

describe('MAP-GAPS A4 colour-blind safety', () => {
  it('outlines every unit mark with ΔE ≥ 30 against grass, lane, river and the neutral hue under deuteranopia and protanopia', async () => {
    const { deltaE } = await import('./cvd');
    const { MM_OUTLINE, MM_GROUND } = await import('../../src/ui/minimap');
    for (const v of ['deut', 'prot'] as const) {
      for (const bg of [MM_GROUND.grass, MM_GROUND.lane, MM_GROUND.river, '#f0c27a']) expect(deltaE(MM_OUTLINE, bg, v), `${v} ${bg}`).toBeGreaterThanOrEqual(30);
    }
  });

  it('keeps ally and enemy apart under deuteranopia and protanopia (colour-blind colours too)', async () => {
    const { deltaE } = await import('./cvd');
    const { minimapRelation } = await import('../../src/ui/minimap');
    for (const cvd of [false, true]) {
      const r = minimapRelation(cvd);
      for (const v of ['deut', 'prot'] as const) expect(deltaE(r.ally, r.enemy, v), `${cvd} ${v}`).toBeGreaterThanOrEqual(30);
    }
    expect(minimapRelation(true).enemy).toBe('#ff8a00');
  });

  it('draws enemy minions as diamonds and ally minions as squares', () => {
    const m = new Minimap(document.body, host());
    draw(m, frame([ent({ id: 6, kind: 'minion', team: 0, fx: 20000, fy: 30000 }), ent({ id: 7, kind: 'minion', team: 1, fx: 70000, fy: 30000 }), ent({ id: 8, kind: 'minion', team: 1, fx: 72000, fy: 30000 })]));
    expect(m.minionsDrawn).toEqual({ square: 1, diamond: 2, dot: 0 });
  });
});

describe('MAP-GAPS A6 edge inset', () => {
  it('draws the self mark at the fountain spawn whole inside the canvas, at every minimap size', async () => {
    const { minimapMapping, MM_PAD } = await import('../../src/ui/minimap');
    for (const [w, h, touch] of [
      [160, 96, true],
      [176, 106, true],
      [131, 79, true],
      [196, 118, false],
      [235, 142, false],
    ] as const) {
      const m = minimapMapping(w, h);
      const r = (touch ? w / 36 : (8 * w) / 196) * 1.15 + 1.4;
      for (const [x, y] of [
        [3000, 32000],
        [3000, 28000],
        [97000, 32000],
      ]) {
        expect(m.X(x) - r, `${w} ${x}`).toBeGreaterThanOrEqual(0);
        expect(m.X(x) + r).toBeLessThanOrEqual(w);
        expect(m.Y(y) - r).toBeGreaterThanOrEqual(0);
      }
      expect(m.X(0)).toBe(MM_PAD);
      expect(m.Y(0)).toBe(h - MM_PAD);
    }
  });

  it('round-trips toMap(X(x)) and clamps the view quad into the inset', async () => {
    const { minimapMapping } = await import('../../src/ui/minimap');
    for (const flip of [false, true]) {
      const m = minimapMapping(176, 106, 6, flip);
      for (const [x, y] of [
        [0, 0],
        [3000, 32000],
        [50000, 30000],
        [100000, 60000],
      ]) {
        const p = m.inv(m.X(x), m.Y(y));
        expect(p.xMm).toBeCloseTo(x, 3);
        expect(p.yMm).toBeCloseTo(y, 3);
      }
      expect(m.clamp(-20, 500)).toEqual([6, 100]);
    }
  });
});

describe('MAP-GAPS A7 bush, forest and rock', () => {
  it('keeps a bush apart from the forest and the rocks under deuteranopia (ΔE ≥ 25)', async () => {
    const { deltaE } = await import('./cvd');
    const { MM_GROUND } = await import('../../src/ui/minimap');
    expect(MM_GROUND.bush).toBe('#5fae4a');
    for (const v of ['deut', 'prot'] as const) {
      expect(deltaE(MM_GROUND.bush, MM_GROUND.forest, v)).toBeGreaterThanOrEqual(25);
      expect(deltaE(MM_GROUND.bush, MM_GROUND.wall, v)).toBeGreaterThanOrEqual(25);
      // the bush edge is what sets it off the grass
      expect(deltaE(MM_GROUND.bushEdge, MM_GROUND.grass, v)).toBeGreaterThanOrEqual(25);
    }
  });
});

describe('MAP-GAPS A8 Pudding leaves the self gold', () => {
  it('draws Pudding and its countdown in the objective hue, gold only for the player', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/ui/minimap.ts', 'utf8');
    expect(src).not.toMatch(/#ffd34d/i);
    expect(src.match(/RELATION_CSS\.self/g)).toHaveLength(1);
    const { MM_OBJECTIVE } = await import('../../src/ui/minimap');
    const m = new Minimap(document.body, host());
    m.timers = () => [{ key: 'pudding', x: 50000, y: 30000, left: 300, total: 900 }];
    draw(m, frame([ent({ id: 30, kind: 'pudding', team: 2, fx: 50000, fy: 30000 })]));
    const fills = calls.filter((c) => c[0] === 'set:fillStyle' || c[0] === 'set:strokeStyle').map((c) => c[1]);
    expect(fills).toContain(MM_OBJECTIVE);
    expect(fills).not.toContain('#ffd34d');
  });
});
