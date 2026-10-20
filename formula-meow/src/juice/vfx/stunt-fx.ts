/**
 * Set-piece VFX (iteration 3, juice lane; SETPIECES.md section 9). Spends no draw calls of its own: everything goes
 * through the race view's shared spark pool (`RaceView.emit` / `burst`) and the kart FX's shockwave rings.
 * - wall ride: a spark trail where the wheels bite the curl, thrown back along the lane (only near the player)
 * - loop: a pink and cyan ring at the entry, a burst in the boost colour at the exit
 * - jump: sparks off the lip; on a clean landing a dust ring, a dust puff, a gold boost burst and a little confetti puff
 * - net: a soft cushion puff
 * Reduced motion: no wall sparks and no confetti; the rings and the dust stay (they are what tells you it landed).
 * Render-only randomness; reads the race, never writes the sim.
 */
import { Surface, type RaceEvent, type RaceState } from '../../types';
import type { KartSnap, RaceView } from '../../core/render/race-view';
import type { KartFx } from './kart-fx';

const RAINBOW = [0xff3b5c, 0xff9f1c, 0xffe14d, 0x3bd16f, 0x3aa8ff, 0x9b5de5];
const SPARK = [0xffe14d, 0xffb03a, 0xfff3dc];
const DUST = 0xf3e3c3;
/** effects only for karts within this distance of the player (m) */
const NEAR = 45;

export class StuntFx {
  private readonly snap: KartSnap = { x: 0, y: 0, z: 0, heading: 0 };
  /** fractional sparks carried between frames, per kart */
  private readonly carry: number[];
  /** 0.4 … 1 from the quality tier */
  density = 1;
  /** sparks thrown this race (QA, tests) */
  sparks = 0;

  constructor(
    private readonly view: RaceView,
    private readonly kfx: KartFx | null,
  ) {
    this.carry = new Array(view.karts.length).fill(0);
  }

  private near(st: RaceState, i: number, me: number): boolean {
    const a = st.karts[i];
    const b = st.karts[me];
    return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < NEAR;
  }

  onEvent(e: RaceEvent, st: RaceState, me: number, calm: boolean): void {
    const i = e.kart;
    if (i < 0 || i >= this.view.karts.length || !this.near(st, i, me)) return;
    const s = this.view.lerpKart(i, 1, this.snap);
    const a = e.a ?? 0;
    switch (e.type) {
      case 'stuntEnter':
        if (a === 0) {
          this.kfx?.ring(i, 0xff3ea5, 3);
          this.kfx?.ring(i, 0x2cf6f3, 2.2);
        } else if (a === 2) this.view.burst(s.x, s.y + 0.4, s.z, SPARK[0], 10, 5);
        break;
      case 'stuntExit':
        if (a === 0 && e.b === 1) {
          this.kfx?.ring(i, 0x2cf6f3, 3.2);
          this.view.burst(s.x, s.y + 0.6, s.z, 0xff3ea5, 14, 6);
        }
        break;
      case 'stuntLand':
        // the dust ring and puff of the touchdown, then the boost burst
        this.kfx?.ring(i, DUST, 3.6);
        this.view.burst(s.x, s.y + 0.2, s.z, DUST, 16, 4);
        this.view.burst(s.x, s.y + 0.7, s.z, 0xffc93c, 12, 7);
        if (!calm) for (let n = 0; n < 10; n++) this.view.burst(s.x, s.y + 1.2, s.z, RAINBOW[n % RAINBOW.length], 1, 5);
        break;
      case 'netCatch':
        this.view.burst(s.x, s.y + 0.5, s.z, 0xffffff, 18, 3);
        this.kfx?.ring(i, 0xfff3dc, 2.4);
        break;
    }
  }

  /** Wall-ride sparks, every frame. */
  update(st: RaceState, alpha: number, dt: number, me: number, calm: boolean): void {
    if (calm) return;
    for (let i = 0; i < st.karts.length && i < this.view.karts.length; i++) {
      const k = st.karts[i];
      if (k.surface !== Surface.WallRide || k.air || k.respawnTicks > 0 || !this.near(st, i, me)) {
        this.carry[i] = 0;
        continue;
      }
      const speed = Math.hypot(k.vx, k.vz);
      if (speed < 8) continue;
      const s = this.view.lerpKart(i, alpha, this.snap);
      if (s.b !== 1) continue;
      // the side toward the curl's top: right = forward × up, signed by which side the lane is on
      const fx = s.fx!;
      const fy = s.fy!;
      const fz = s.fz!;
      const ux = s.ux!;
      const uy = s.uy!;
      const uz = s.uz!;
      let rx = fy * uz - fz * uy;
      let ry = fz * ux - fx * uz;
      let rz = fx * uy - fy * ux;
      const side = k.d > 0 ? 1 : -1;
      rx *= side;
      ry *= side;
      rz *= side;
      // ~ 40 sparks a second at top speed on the player (fewer for rivals and on low tiers)
      const rate = (i === me ? 40 : 14) * Math.min(1.3, speed / 28) * this.density;
      this.carry[i] += rate * dt;
      while (this.carry[i] >= 1) {
        this.carry[i] -= 1;
        const back = 0.9 + Math.random() * 0.3;
        const px = s.x - fx * back + rx * 0.75;
        const py = s.y - fy * back + ry * 0.75 + 0.1;
        const pz = s.z - fz * back + rz * 0.75;
        const kick = 2 + Math.random() * 3;
        this.view.emit(px, py, pz, -fx * kick + ux * 2.2 + (Math.random() - 0.5) * 2, -fy * kick + uy * 2.2 + Math.random() * 1.5, -fz * kick + uz * 2.2 + (Math.random() - 0.5) * 2, SPARK[(Math.random() * SPARK.length) | 0]);
        this.sparks++;
      }
    }
  }
}
