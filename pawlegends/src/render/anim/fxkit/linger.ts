/**
 * Lingering ground glyphs (ANIM-SPEC §7): crack star, crack line, scorch, scratches, crater, petals. One instanced
 * pool on the FX shader's glyph branch (normal blending), desaturated after 200 ms. Never red, never ring-shaped, so a
 * glyph never reads as a zone. Count and life per tier (§10: 6 × 0.5 s, 16 × 1.2 s, 24 × 1.5 s).
 */
import * as THREE from 'three';
import { FX_KIND, fxMaterial, type FxUniforms } from './fxMaterial';
import { FxPool } from './meshFx';
import type { LingerGlyph, LingerLike } from '../types';

type Tier = 'low' | 'med' | 'high';
export const LINGER_TIER: Readonly<Record<Tier, { n: number; life: number }>> = Object.freeze({ low: { n: 6, life: 0.5 }, med: { n: 16, life: 1.2 }, high: { n: 24, life: 1.5 } });

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Desaturated warm red never reaches a glyph: anything redder than this is pulled toward orange. */
const safe = (c: number): number => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return r > 180 && g < 90 && b < 90 ? (r << 16) | (Math.max(g, 140) << 8) | b : c;
};

export class Linger implements LingerLike {
  readonly pool: FxPool;
  private readonly mat: THREE.ShaderMaterial;
  tier: Tier = 'med';
  private readonly spawnOpts = { x: 0, z: 0, sx: 1, life: 1, color: 0, rim: 0, rel: 'own' as const, p3: 1 };

  constructor(u: FxUniforms) {
    this.mat = fxMaterial(u, 'alpha');
    this.pool = new FxPool(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat, LINGER_TIER.high.n, 'fx-linger', 1);
  }

  get mesh(): THREE.InstancedMesh {
    return this.pool.mesh;
  }

  add(glyph: LingerGlyph, x: number, z: number, size: number, yaw: number, color: number): void {
    const T = LINGER_TIER[this.tier];
    if (this.pool.n >= T.n) return;
    _q.setFromAxisAngle(_up, yaw);
    _p.set(x, 0.035, z);
    _s.set(size * 2, 1, size * 2);
    _m.compose(_p, _q, _s);
    const o = this.spawnOpts;
    o.life = T.life;
    o.p3 = T.life;
    o.color = safe(color);
    this.pool.spawn(FX_KIND[glyph], _m, o, 0);
  }

  update(dt: number): void {
    this.pool.update(dt);
  }

  dispose(): void {
    this.pool.dispose();
    this.mat.dispose();
  }
}
