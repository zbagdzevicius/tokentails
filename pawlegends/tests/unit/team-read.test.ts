/**
 * Team readability (POC.md §6.8): from the iso camera (which sees surfaces that face up) every hero shows a large
 * patch of its team's main colour, whatever its species, and almost none of the other team's. Screenshots at Low on
 * 844×390 (2026-10-17) read clearly at these shares; the old thin sash measured ~5% (and a Woof Clem wore 9% rose).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { TEAM } from '../../src/render/palette';
import { heroGeometry } from '../../src/render/views/models';

const HEROES: HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];

/** Share of the up-facing area (face normal y > 0.35) coloured `hex`, 0..1. */
function upShare(g: THREE.BufferGeometry, hex: number): number {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new THREE.Color(hex);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  let all = 0;
  let hit = 0;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    d.fromBufferAttribute(pos, i + 2).sub(a);
    n.crossVectors(b, d);
    const area = n.length() / 2;
    if (area === 0 || n.y / (2 * area) <= 0.35) continue;
    all += area;
    const same = Math.abs(col.getX(i) - c.r) < 1e-4 && Math.abs(col.getY(i) - c.g) < 1e-4 && Math.abs(col.getZ(i) - c.b) < 1e-4;
    if (same) hit += area;
  }
  return all > 0 ? hit / all : 0;
}

describe('team colours on hero models (§6.8)', () => {
  for (const hero of HEROES) {
    for (const team of [0, 1] as const) {
      it(`${hero} on ${TEAM[team].name} wears its team colour where the camera sees it`, () => {
        const g = heroGeometry(hero, team);
        const mine = upShare(g, TEAM[team].main);
        const theirs = upShare(g, TEAM[(1 - team) as 0 | 1].main);
        console.log(`${hero} ${TEAM[team].name}: own ${(100 * mine).toFixed(1)}%, other ${(100 * theirs).toFixed(1)}%`);
        expect(mine).toBeGreaterThanOrEqual(0.15);
        expect(theirs).toBeLessThan(0.03);
        g.dispose();
      });
    }
  }
});
