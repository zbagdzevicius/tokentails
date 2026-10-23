// @vitest-environment happy-dom
/**
 * perf-1: a match must free its GPU resources on dispose. GameView owns its Particles and Shockwaves and disposes
 * them (clear() only hid them in the shared scene), and StructureView frees the rubble geometry it built.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Particles } from '../../src/render/fx/Particles.js';
import { Shockwaves } from '../../src/render/fx/Shockwaves.js';
import { StructureView } from '../../src/render/views/towerView';

const here = path.dirname(fileURLToPath(import.meta.url));

function trackDisposed(geos: THREE.BufferGeometry[]): Set<THREE.BufferGeometry> {
  const done = new Set<THREE.BufferGeometry>();
  for (const g of geos) g.addEventListener('dispose', () => done.add(g));
  return done;
}

function geometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const out = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g) out.add(g);
  });
  return [...out];
}

describe('perf-1: rematch GPU leak', () => {
  it('Particles and Shockwaves dispose leaves the shared scene empty and frees every geometry', () => {
    const scene = new THREE.Scene();
    const particles = new Particles({ rng: Math.random, groundY: () => 0 });
    particles.attach(scene);
    const shock = new Shockwaves(null, { particles, groundY: () => 0, rng: Math.random });
    shock.init(scene);
    const geos = geometries(scene);
    expect(geos.length).toBeGreaterThanOrEqual(12);
    const done = trackDisposed(geos);
    shock.dispose();
    particles.dispose();
    expect(scene.children.length).toBe(0);
    expect(done.size).toBe(geos.length);
  });

  it('StructureView.dispose frees rubble geometry and drops the rubble meshes', () => {
    const view = new StructureView();
    (view as unknown as { addRubble(x: number, z: number, r: number): void }).addRubble(0, 0, 1.4);
    (view as unknown as { addRubble(x: number, z: number, r: number): void }).addRubble(5, 5, 2.4);
    const rubble = (view as unknown as { rubble: THREE.Mesh[] }).rubble;
    const geos = [...new Set(rubble.map((m) => m.geometry))];
    expect(geos.length).toBe(2);
    const done = trackDisposed(geos);
    view.dispose();
    expect(done.size).toBe(2);
    expect(rubble.length).toBe(0);
    expect(view.group.children.some((c) => geos.includes((c as THREE.Mesh).geometry))).toBe(false);
  });

  it('GameView.dispose disposes (not clears) its particles and shockwaves', () => {
    const src = fs.readFileSync(path.join(here, '../../src/render/gameView.ts'), 'utf8');
    const body = src.slice(src.indexOf('  dispose(): void {'), src.indexOf('/** Aim spec'));
    expect(body).toContain('this.particles.dispose();');
    expect(body).toContain('this.shock.dispose();');
    expect(body).not.toContain('this.particles.clear();');
    expect(body).not.toContain('this.shock.clear();');
  });
});
