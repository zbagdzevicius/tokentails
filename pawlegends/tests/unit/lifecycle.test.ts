// @vitest-environment happy-dom
/**
 * Match lifecycle feel (render/fx/lifecycle*): the start gate follows the sim's barrier tick, the respawn sequence
 * follows `respawnIn`, the fence keeps clear of the core, and the overlays build and tear down cleanly.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TIMELINE, TICK_HZ } from '../../src/data/timeline';
import { CORE, HERO_SPAWNS, MAP } from '../../src/data/map';
import { CORE_GAP_M, GATE_OPEN_TICKS, gateSegments, gateState, StartGate } from '../../src/render/fx/lifecycleGate';
import { backCount, IRIS_MIN_DEATH, irisAt, napProgress, RESPAWN_TICKS, spawnPoint } from '../../src/render/fx/lifecycle';
import { digitGlyph, GLYPH, LifeSprites } from '../../src/render/fx/lifecycleSprites';
import { LifeHud, livesLabel } from '../../src/render/fx/lifecycleHud';
import { Notify } from '../../src/ui/notify';

describe('start gate', () => {
  it('stands until the barrier tick, then opens over GATE_OPEN_TICKS', () => {
    expect(gateState(null)).toMatchObject({ up: true, open: 0, secs: 3 });
    expect(gateState(0)).toMatchObject({ up: true, open: 0, secs: 3 });
    expect(gateState(TIMELINE.barrierDrop - 1).secs).toBe(1);
    expect(gateState(TIMELINE.barrierDrop - TICK_HZ - 1).secs).toBe(2);
    const at = gateState(TIMELINE.barrierDrop);
    expect(at).toMatchObject({ up: true, open: 0, secs: 0 });
    expect(gateState(TIMELINE.barrierDrop + GATE_OPEN_TICKS / 2).open).toBeCloseTo(0.5);
    expect(gateState(TIMELINE.barrierDrop + GATE_OPEN_TICKS).up).toBe(false);
  });

  it('fences the walkable barrier line on both sides but leaves the core clear', () => {
    for (const x of [MAP.barrierX / 1000, (MAP.width - MAP.barrierX) / 1000]) {
      const segs = gateSegments(x);
      expect(segs.length).toBeGreaterThanOrEqual(2);
      const cy = CORE.y / 1000;
      for (const [a, b] of segs) expect(b <= cy - CORE_GAP_M + 1e-6 || a >= cy + CORE_GAP_M - 1e-6).toBe(true);
    }
    const g = new StartGate();
    expect(g.signs.length).toBe(gateSegments(MAP.barrierX / 1000).length * 2);
    g.update(gateState(TIMELINE.barrierDrop + GATE_OPEN_TICKS), 0, false);
    expect(g.group.visible).toBe(false);
    g.dispose();
  });
});

describe('respawn sequence', () => {
  it('spawn points mirror the sim spawns', () => {
    const o = { x: 0, z: 0 };
    expect(spawnPoint(0, 0, o)).toEqual({ x: HERO_SPAWNS[0].x / 1000, z: -HERO_SPAWNS[0].y / 1000 });
    expect(spawnPoint(4, 1, o)).toEqual({ x: (MAP.width - HERO_SPAWNS[1].x) / 1000, z: -HERO_SPAWNS[1].y / 1000 });
  });

  it('iris closes, shuts, then opens before the hero lands; the count shows the last three seconds', () => {
    expect(irisAt(RESPAWN_TICKS.close + 1)).toBe(0);
    expect(irisAt(RESPAWN_TICKS.shut)).toBe(1);
    expect(irisAt(RESPAWN_TICKS.open)).toBe(0);
    expect(irisAt(0)).toBe(0);
    // feel QA: a short knockout (level 1, ~3 s) gets no iris at all (the camera pans instead)
    expect(irisAt(RESPAWN_TICKS.shut, IRIS_MIN_DEATH - 1)).toBe(0);
    expect(irisAt(RESPAWN_TICKS.shut, IRIS_MIN_DEATH)).toBe(1);
    expect(backCount(91)).toBe(0);
    expect(backCount(90)).toBe(3);
    expect(backCount(1)).toBe(1);
    expect(backCount(0)).toBe(0);
    expect(napProgress(100, 160)).toBeCloseTo(0.5);
  });
});

describe('overlays and sprites', () => {
  it('lives label counts down and never goes negative', () => {
    expect(livesLabel(1, false)).toBe('8 of 9 lives left');
    expect(livesLabel(1, true)).toBe('8 of 9 bones left');
    expect(livesLabel(12, false)).toMatch(/Bonus/);
  });

  it('LifeHud builds its layers and removes them on dispose', () => {
    const root = document.createElement('div');
    const rail = new Notify(root);
    const hud = new LifeHud(root);
    // LoL pass (lane A): the gate countdown is the rail's resting line, the lives go to the respawn line
    hud.gate(2, 0.5);
    expect(rail.queue.restOf('gate')?.text).toBe('Gates open in 2');
    hud.dead(true, 1, false);
    expect(hud.livesText).toBe('8 of 9 lives');
    expect(root.querySelector('.pl-lc-dead.on')).not.toBeNull();
    hud.iris(1);
    expect(root.querySelector('.pl-lc-iris.on.shut')).not.toBeNull();
    // class driven, never a per-frame mask (perf QA)
    expect((root.querySelector('.pl-lc-iris') as HTMLElement).style.getPropertyValue('mask-image')).toBe('');
    hud.iris(0.5, true);
    expect(root.querySelector('.pl-lc-iris.on.open')).not.toBeNull();
    hud.iris(0);
    expect(root.querySelector('.pl-lc-iris.on')).toBeNull();
    hud.dispose();
    expect(rail.queue.restOf('gate')).toBeNull();
    rail.dispose();
    expect(root.children.length).toBe(0);
  });

  it('sprites pool: spawn, expire, and immediate sprites per frame', () => {
    const s = new LifeSprites();
    expect(digitGlyph(3)).toBe(GLYPH.three);
    expect(digitGlyph(4)).toBe(-1);
    s.spawn({ x: 0, y: 1, z: 0, glyph: GLYPH.paw, size0: 1, life: 0.5 });
    s.begin();
    s.put(0, 2, 0, 1, GLYPH.lock);
    s.update(0.1);
    expect(s.live).toBe(1);
    expect((s.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(2);
    s.begin();
    s.update(1);
    expect(s.live).toBe(0);
    expect((s.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0);
    s.dispose();
  });
});
