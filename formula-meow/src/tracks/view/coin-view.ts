/**
 * Fish coins (tracks lane view, render only): one InstancedMesh for every coin on the track. Coins spin and bob,
 * shrink away while picked (the sim's 10 s respawn timer in `RaceState.coins`) and pop back in, and a pickup throws
 * a burst of gold sparks off the kart (a spin or a leap that drops coins throws a bigger one).
 */
import { DynamicDrawUsage, InstancedMesh, Object3D, type Group } from 'three';
import type { RaceEvent, RaceState } from '../../types';
import type { BuiltTrack } from '../../core/track/build';
import { GeoBuilder } from '../../core/render/geo';
import { toonMaterial } from '../../core/render/toon';

const GOLD = 0xffc93c;
const GOLD_DARK = 0xd9902a;
const _o = new Object3D();

/** A coin: a thick gold disc with a fish on both faces (low-poly, about 120 triangles). */
function coinGeometry() {
  const g = new GeoBuilder();
  g.cyl(0.55, 0.55, 0.14, 14, GOLD, { rx: Math.PI / 2 }, { vary: 0.02 });
  g.torus(0.52, 0.05, GOLD_DARK, {}, { vary: 0 }, 4, 14);
  for (const s of [-1, 1]) {
    // fish body and tail, slightly proud of each face
    g.sphere(0.22, GOLD_DARK, { z: 0.075 * s, x: 0.04, sx: 1.3, sy: 0.75, sz: 0.25 }, { vary: 0 }, 8, 5);
    g.cone(0.14, 0.18, 3, GOLD_DARK, { z: 0.075 * s, x: -0.3, rz: Math.PI / 2, sz: 0.4 }, { vary: 0 });
    g.sphere(0.04, 0x3a2a12, { z: 0.11 * s, x: 0.17, y: 0.04 }, { vary: 0 }, 4, 3);
  }
  return g.build();
}

export class CoinView {
  private readonly mesh: InstancedMesh | null;
  private time = 0;

  constructor(
    group: Group,
    private readonly track: BuiltTrack,
  ) {
    const n = track.coins.length;
    if (!n) {
      this.mesh = null;
      return;
    }
    this.mesh = new InstancedMesh(coinGeometry(), toonMaterial({ vertexColors: true, emissive: 0x6b4a10 }), n);
    this.mesh.name = 'coins';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }

  update(st: RaceState, dt: number): void {
    const m = this.mesh;
    if (!m) return;
    this.time += dt;
    const coins = this.track.coins;
    for (let c = 0; c < coins.length; c++) {
      const p = coins[c];
      const left = st.coins[c] ?? 0;
      // gone while the respawn timer runs; the last 0.3 s it grows back
      const sc = left === 0 ? 1 : left < 18 ? 1 - left / 18 : 0;
      _o.position.set(p.x, p.y + 0.15 + Math.sin(this.time * 2.6 + c * 0.9) * 0.12, p.z);
      _o.rotation.set(0, this.time * 2.8 + c * 0.5, 0);
      _o.scale.setScalar(sc);
      _o.updateMatrix();
      m.setMatrixAt(c, _o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /** Sparks for pickups and drops (`burst` is the race view's spark burst at a kart). */
  onEvent(e: RaceEvent, burst: (kart: number, color: number, n: number, speed?: number) => void): void {
    if (e.type === 'coin') burst(e.kart, GOLD, 10, 4);
    else if (e.type === 'coinLoss') burst(e.kart, GOLD, 8 * (e.a ?? 1), 7);
  }
}
