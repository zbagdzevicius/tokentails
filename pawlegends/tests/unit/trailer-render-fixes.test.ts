// @vitest-environment happy-dom
/**
 * Render bugs found in the trailer v2 review (render only; the sim is untouched): off-screen damage numbers hidden,
 * a core under attack never x-rayed, cats rose / dogs blue whichever side the human picks, heroes and minions drawn
 * apart, falling cores clear of minions, smaller faceted debris, rubble off the lane, combo / XP pops that replace or
 * merge, the timer's duplicate countdown dropped, capped shockwaves, the gate line only on walkable ground and rocks
 * only where nobody walks.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { onScreenAnchor } from '../../src/render/fx/DamageNumbers.js';
import { normalizeShock, SHOCK_MAX_INTENSITY } from '../../src/render/fx/Shockwaves.js';
import { DEBRIS, RUBBLE, STRUCT_ANIM, StructureView, xrayOpacity } from '../../src/render/views/towerView';
import { MINION_BAR_CSS, RELATION, RELATION_CSS, TEAM, dressTeam, setSideSwap, setTeam0Dogs, sidesSwapped } from '../../src/render/palette';
import { RIM } from '../../src/render/anim/fxkit/readability';
import { SEPARATION, separate } from '../../src/render/views/heroView';
import { inClearZone } from '../../src/render/views/minionInstances';
import { phaseLineShown } from '../../src/ui/hud';
import { Juice, XP_MERGE_MS } from '../../src/render/juice';
import { gateSpans, rockClear } from '../../src/render/views/mapView';
import { MAP } from '../../src/data/map';
import { onPlayfield } from '../../src/sim/map/grid';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map() }) as unknown as ViewFrame;

describe('damage numbers off screen', () => {
  it('an anchor outside the viewport (plus the margin) is hidden, not pinned to the border', () => {
    expect(onScreenAnchor(640, 360, 1280, 720)).toBe(true);
    expect(onScreenAnchor(-10, 360, 1280, 720)).toBe(true);
    expect(onScreenAnchor(-200, 360, 1280, 720)).toBe(false);
    expect(onScreenAnchor(640, 900, 1280, 720)).toBe(false);
    expect(onScreenAnchor(1400, -100, 1280, 720)).toBe(false);
  });
});

describe('structure x-ray', () => {
  it('a tower fades over a hero; a core under attack or hurt stays solid', () => {
    expect(xrayOpacity('tower', true, 1, 99)).toBeLessThan(0.5);
    expect(xrayOpacity('core', true, 1, 99)).toBeLessThan(0.5);
    expect(xrayOpacity('core', true, 1, 1)).toBe(1);
    expect(xrayOpacity('core', true, 0.3, 99)).toBe(1);
    expect(xrayOpacity('core', false, 1, 99)).toBe(1);
  });
});

describe('cats vs dogs colours', () => {
  afterEach(() => {
    setSideSwap(false);
    setTeam0Dogs(false);
  });

  it('a dog-picking human: ally takes the dog blue, enemy the cat rose, and it switches back', () => {
    const ally = RELATION.ally;
    const enemy = RELATION.enemy;
    expect(ally).toBe(TEAM[0].main);
    setSideSwap(true);
    expect(sidesSwapped()).toBe(true);
    expect(RELATION.ally).toBe(enemy);
    expect(RELATION.enemy).toBe(ally);
    expect(RIM.ally).toBe(enemy);
    expect(RELATION_CSS.ally).toBe('#7a9cff');
    expect(MINION_BAR_CSS.enemy).toBe('#ffb8c9');
    expect(document.documentElement.dataset.sides).toBe('dogs');
    setSideSwap(false);
    expect(RELATION.ally).toBe(ally);
    expect(RIM.ally).toBe(ally);
    expect(document.documentElement.style.getPropertyValue('--ally')).toBe('');
  });

  it('team cloth follows the species', () => {
    expect([dressTeam(0), dressTeam(1)]).toEqual([0, 1]);
    setTeam0Dogs(true);
    expect([dressTeam(0), dressTeam(1)]).toEqual([1, 0]);
  });
});

describe('visual push-apart', () => {
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

  it('two heroes on one spot are drawn apart; far ones are untouched; the offset is capped', () => {
    const pts = [{ x: 10, z: 10 }, { x: 10.2, z: 10 }, { x: 30, z: 30 }];
    const o = separate(pts);
    const a = { x: pts[0].x + o[0].x, z: pts[0].z + o[0].z };
    const b = { x: pts[1].x + o[1].x, z: pts[1].z + o[1].z };
    expect(dist(a, b)).toBeGreaterThanOrEqual(SEPARATION.min - 1e-6);
    expect(o[2]).toEqual({ x: 0, z: 0 });
    for (const v of o) expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(SEPARATION.cap + 1e-9);
  });

  it('three coincident heroes fan out (no two left on one spot)', () => {
    const o = separate([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(dist(o[i], o[j])).toBeGreaterThan(0.6);
  });

  it('minions are not drawn inside a falling core zone', () => {
    expect(inClearZone([{ x: 0, z: 0, r: 3 }], 1, 1)).toBe(true);
    expect(inClearZone([{ x: 0, z: 0, r: 3 }], 4, 0)).toBe(false);
  });
});

describe('structure falls', () => {
  const tower = { id: 46, kind: 'tower', team: 1, fx: 30000, fy: 20000, hp: 100, maxHp: 1000, buffs: 0, variant: 'outer', yaw: 0, speed: 0 };
  const core = { ...tower, id: 55, kind: 'core', variant: undefined };

  it('a falling core marks a minion-free zone while it falls', () => {
    const view = new StructureView();
    view.update(frame([core]), 1 / 60);
    expect(view.fallingCores([])).toEqual([]);
    view.fell(55);
    view.update(frame([]), 1 / 60);
    const z = view.fallingCores([]);
    expect(z.length).toBe(1);
    expect(z[0].r).toBeGreaterThanOrEqual(3);
    view.dispose();
  });

  it('fewer, smaller chunks than the old unit cubes', () => {
    expect(DEBRIS.core).toBeLessThanOrEqual(14);
    expect(DEBRIS.coreSize).toBeLessThan(0.75);
    expect(DEBRIS.life).toBeLessThanOrEqual(1);
  });

  // v3.9: the pile on the base sinks away too (the sim frees the base cells: heroes walked through it on the lane)
  it("a fallen tower's rubble line and the pile on its base sink away after their hold", () => {
    const view = new StructureView();
    const rubble = (): THREE.Mesh[] => (view as unknown as { rubble: THREE.Mesh[] }).rubble;
    view.update(frame([tower]), 1 / 60);
    view.fell(46);
    for (let t = 0; t < STRUCT_ANIM.fallTower + 0.1; t += 1 / 60) view.update(frame([]), 1 / 60);
    expect(rubble().length).toBe(14);
    for (let t = 0; t < RUBBLE.hold + RUBBLE.sink + 0.2; t += 1 / 30) view.update(frame([]), 1 / 30);
    expect(rubble().length).toBe(0);
    view.dispose();
  });
});

describe('HUD text', () => {
  it('the timer drops its countdown while the objective chip shows the same one', () => {
    expect(phaseLineShown('Gates open in 0:03', 'Gates open in 0:03')).toBe('');
    expect(phaseLineShown('Sudden Death in 1:22', 'Sudden Death in 1:22')).toBe('');
    expect(phaseLineShown('Sunset in 0:40', 'Your rats 0:18')).toBe('Sunset in 0:40');
    expect(phaseLineShown('Sunset in 0:40', null)).toBe('Sunset in 0:40');
  });

  it('a new combo pop replaces the last one; XP pops close together merge into one sum', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const j = new Juice(root);
    const layer = root.querySelector('.pl-pops') as HTMLElement;
    j.popReplace('combo', 'Combo x3', 100, 100, 'gold', true);
    j.popReplace('combo', 'Combo x4', 100, 100, 'gold', true);
    expect([...layer.children].map((c) => c.textContent)).toEqual(['Combo x4']);
    j.popXp(16, 100, 80);
    j.popXp(10, 100, 80);
    j.popXp(55, 100, 80);
    const xp = [...layer.children].filter((c) => c.textContent?.includes('XP'));
    expect(xp.map((c) => c.textContent)).toEqual(['+81 XP']);
    expect(XP_MERGE_MS).toBeGreaterThan(300);
    root.remove();
  });
});

describe('FX and scenery', () => {
  it('shockwave walls are capped below the white blow-out', () => {
    expect(normalizeShock({ intensity: 2.2 }).intensity).toBe(SHOCK_MAX_INTENSITY);
    expect(normalizeShock({}).intensity).toBeLessThanOrEqual(SHOCK_MAX_INTENSITY);
    expect(normalizeShock({ intensity: 0.5 }).intensity).toBe(0.5);
  });

  it('the gate line covers only walkable ground on the barrier line, never the whole map height', () => {
    const x = MAP.barrierX / 1000;
    const spans = gateSpans(x);
    expect(spans.length).toBeGreaterThan(0);
    const total = spans.reduce((a, [y0, y1]) => a + y1 - y0, 0);
    expect(total).toBeLessThan(MAP.height / 1000);
    for (const [y0, y1] of spans) expect(onPlayfield(Math.round(x * 1000), Math.round(((y0 + y1) / 2) * 1000))).toBe(true);
  });

  it('a rock is only placed where nobody can walk', () => {
    expect(rockClear(MAP.barrierX / 1000, gateSpans(MAP.barrierX / 1000)[0][0] + 0.5, 0.5)).toBe(false);
    expect(rockClear(-5, -5, 0.5)).toBe(true);
  });
});
