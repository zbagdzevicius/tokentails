// Cosmetic trail FX (Wardrobe 'fx' slot): particles left behind Mochi's tail tip through the shared core/fx pool
// (one draw call; LOW quality already drops every other spawn, so LOW gets half the rate). Gentle with reduced
// motion: half the rate, slow drifts. No allocation per frame: everything spawns from scalars.
import * as THREE from 'three';
import { spawnParticle } from '../core/fx';
import { prefs } from '../core/state';

export type TrailFxId = 'none' | 'sparkles' | 'hearts' | 'rainbow' | 'bubbles' | 'leaves' | string;

/** 'run' = behind the running cat (speed > 5), 'ambient' = a slow halo around a resting cat (the Wardrobe preview) */
export type TrailMode = 'run' | 'ambient';

const RATE: Record<string, number> = { sparkles: 30, hearts: 8, rainbow: 0, bubbles: 11, leaves: 10 };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class TrailEmitter {
  private acc = 0;
  private dist = 0;
  private lastX = NaN;
  private lastZ = 0;

  reset(): void {
    this.acc = 0;
    this.dist = 0;
    this.lastX = NaN;
  }

  /**
   * tip: tail tip (world); fwd/up/right: the cat's world basis; speed u/s. colors: the item palette.
   * Call once per rendered frame with the scaled frame dt.
   */
  step(id: TrailFxId, colors: readonly number[], dt: number, t: number, tip: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, right: THREE.Vector3, _speed: number, mode: TrailMode): void {
    if (dt <= 0 || id === 'none' || !colors.length) return;
    const gentle = prefs.reducedMotion;
    const amb = mode === 'ambient';
    const calm = gentle ? 0.5 : 1;
    if (id === 'rainbow') {
      // a ribbon: a column of rainbow bands laid down every 0.28 u travelled (ambient: slow loops round her)
      if (amb) {
        this.acc += dt * 9 * calm;
        while (this.acc >= 1) {
          this.acc -= 1;
          const a = t * 1.6;
          const r = 0.75;
          for (let b = 0; b < colors.length; b++) {
            const y = 0.5 + b * 0.06;
            spawnParticle(tip.x + Math.cos(a) * r, tip.y + y - 0.2, tip.z + Math.sin(a) * r, 0, 0.05, 0, 1.4, 0.11, colors[b], 0, 0.9);
          }
        }
        return;
      }
      if (Number.isNaN(this.lastX)) {
        this.lastX = tip.x;
        this.lastZ = tip.z;
      }
      const dx = tip.x - this.lastX;
      const dz = tip.z - this.lastZ;
      this.lastX = tip.x;
      this.lastZ = tip.z;
      this.dist += Math.min(4, Math.sqrt(dx * dx + dz * dz));
      const step = gentle ? 0.5 : 0.28;
      let n = 0;
      while (this.dist >= step && n++ < 8) {
        this.dist -= step;
        const wob = gentle ? 0 : Math.sin(t * 7) * 0.04;
        for (let b = 0; b < colors.length; b++) {
          const off = (b - (colors.length - 1) / 2) * 0.055 + wob;
          spawnParticle(tip.x + up.x * off, tip.y + up.y * off, tip.z + up.z * off, up.x * 0.15, up.y * 0.15, up.z * 0.15, gentle ? 0.24 : 0.3, 0.13, colors[b], 0, 0.95);
        }
      }
      return;
    }
    const rate = (RATE[id] ?? 0) * calm * (amb ? 0.45 : 1);
    if (rate <= 0) return;
    this.acc += dt * rate;
    let n = 0;
    while (this.acc >= 1 && n++ < 6) {
      this.acc -= 1;
      // spawn point: behind the tip (run) or round her (ambient)
      let px = tip.x - fwd.x * 0.15;
      let py = tip.y - fwd.y * 0.15;
      let pz = tip.z - fwd.z * 0.15;
      if (amb) {
        const a = Math.random() * Math.PI * 2;
        const r = rnd(0.45, 0.85);
        px = tip.x + Math.cos(a) * r;
        pz = tip.z + Math.sin(a) * r;
        py = tip.y + rnd(-0.2, 0.6);
      }
      const k = gentle ? 0.45 : 1;
      switch (id) {
        case 'sparkles': {
          const c = colors[(Math.random() * colors.length) | 0];
          spawnParticle(px + rnd(-0.12, 0.12), py + rnd(-0.08, 0.12), pz + rnd(-0.12, 0.12), rnd(-0.4, 0.4) * k, rnd(0.2, 0.9) * k, rnd(-0.4, 0.4) * k, rnd(0.35, 0.6), rnd(0.06, 0.13), c, -0.4, 1);
          break;
        }
        case 'hearts': {
          // three discs make a little heart: two lobes on top, a point below (in the cat's right/up plane)
          const s = rnd(0.07, 0.1);
          const vx = rnd(-0.2, 0.2) * k;
          const vy = rnd(0.5, 0.9) * k;
          const c = colors[(Math.random() * 2) | 0];
          const life = rnd(0.7, 1.0);
          for (let i = -1; i <= 1; i += 2) spawnParticle(px + right.x * i * s * 0.42, py + s * 0.25, pz + right.z * i * s * 0.42, vx, vy, 0, life, s, c, -0.3, 1);
          spawnParticle(px, py - s * 0.18, pz, vx, vy, 0, life, s * 0.85, c, -0.3, 1);
          break;
        }
        case 'bubbles': {
          const s = rnd(0.1, 0.2);
          const vx = rnd(-0.3, 0.3) * k;
          const vz = rnd(-0.3, 0.3) * k;
          const vy = rnd(0.6, 1.1) * k;
          const life = rnd(0.9, 1.3);
          spawnParticle(px, py, pz, vx, vy, vz, life, s, colors[(Math.random() * 2) | 0], -0.6, 0.55);
          spawnParticle(px - right.x * s * 0.2, py + s * 0.22, pz - right.z * s * 0.2, vx, vy, vz, life, s * 0.28, colors[2] ?? 0xffffff, -0.6, 0.95);
          break;
        }
        case 'leaves': {
          const c = colors[(Math.random() * colors.length) | 0];
          spawnParticle(px, py + 0.1, pz, rnd(-1.1, 1.1) * k, rnd(0.4, 1.0) * k, rnd(-1.1, 1.1) * k, rnd(0.9, 1.3), rnd(0.1, 0.16), c, gentle ? 0.8 : 2.2, 1);
          break;
        }
      }
    }
  }
}
