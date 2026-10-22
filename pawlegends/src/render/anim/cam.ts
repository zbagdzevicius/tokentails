/**
 * FightCam (ANIM-SPEC §8): fights feel big. The fight meter counts heroes within 10 m of the player whose team took
 * or dealt hero damage in the last 2 s; at 4 or more the camera pulls back 2 m (1.5 m in portrait), easing in over
 * 0.8 s, holding 1.5 s after the count drops and easing out over 1.2 s. The same flag feeds tierFx.teamFight. While
 * the fight is on, the camera also leans toward the fight's centre (the fighters' mean position, at most 2.5 m and
 * 35% of the way from the player), so both sides of a 3v3 stay framed.
 * Shake tiers go through Juice.kick (the shake setting and the reduce-motion caps apply), only the strongest tier in
 * each 100 ms counts. The own camera punch (a short zoom-in) is skipped under reduce motion.
 */
import type { FightCamLike, JuiceLike } from './types';

export const FIGHT = Object.freeze({ radius: 10, recent: 2, heroes: 4, extra: 2, extraPortrait: 1.5, easeIn: 0.8, hold: 1.5, easeOut: 1.2, lean: 0.35, leanMax: 2.5 });
/** Shake tier kicks T0..T4. */
export const SHAKE_TIER: readonly number[] = Object.freeze([0, 0.06, 0.14, 0.28, 0.45]);

export interface FightHero {
  x: number;
  z: number;
  team: number;
  dead: boolean;
}

export class FightCam implements FightCamLike {
  /** Current extra distance (m) and whether the fight flag is on. */
  extra = 0;
  fight = false;
  private holdT = 0;
  private time = 0;
  /** Last hero-damage time per team (render s). */
  readonly lastDamage = new Float64Array(3).fill(-99);
  private tierWin = -1;
  private tierAt = -1;
  /** Zoom punch (share of the distance, negative = in) and its clock. */
  private punchK = 0;
  private punchT = 1;
  reduced = false;
  portrait = false;
  /** Camera lean toward the fight's centre (m, ground x / z), eased; 0 outside fights. */
  leanX = 0;
  leanZ = 0;

  constructor(private readonly juice: JuiceLike | null) {}

  /** A hero of `team` took or dealt hero damage now. */
  damage(team: number): void {
    if (team >= 0 && team < 3) this.lastDamage[team] = this.time;
  }

  /** Per frame: heroes (positions m), the player's position, dt. */
  update(dt: number, heroes: readonly FightHero[], n: number, meX: number, meZ: number, hasMe: boolean): void {
    this.time += dt;
    let count = 0;
    let sx = 0;
    let sz = 0;
    if (hasMe)
      for (let i = 0; i < n; i++) {
        const h = heroes[i];
        if (h.dead || h.team > 1) continue;
        if (this.time - this.lastDamage[h.team] > FIGHT.recent) continue;
        const dx = h.x - meX;
        const dz = h.z - meZ;
        if (dx * dx + dz * dz <= FIGHT.radius * FIGHT.radius) {
          count++;
          sx += dx;
          sz += dz;
        }
      }
    if (count >= FIGHT.heroes) {
      this.fight = true;
      this.holdT = FIGHT.hold;
    } else if (this.holdT > 0) this.holdT -= dt;
    else this.fight = false;
    const want = this.fight ? (this.portrait ? FIGHT.extraPortrait : FIGHT.extra) : 0;
    const rate = (this.fight ? FIGHT.extra / FIGHT.easeIn : FIGHT.extra / FIGHT.easeOut) * dt;
    this.extra += Math.max(-rate, Math.min(rate, want - this.extra));
    // lean toward the fight's centre (none under reduce motion: the camera stays on the player)
    let lx = 0;
    let lz = 0;
    if (this.fight && count > 0 && !this.reduced) {
      lx = (sx / count) * FIGHT.lean;
      lz = (sz / count) * FIGHT.lean;
      const l = Math.hypot(lx, lz);
      if (l > FIGHT.leanMax) {
        lx *= FIGHT.leanMax / l;
        lz *= FIGHT.leanMax / l;
      }
    }
    const k = Math.min(1, dt * (this.fight ? 2.5 : 1.5));
    this.leanX += (lx - this.leanX) * k;
    this.leanZ += (lz - this.leanZ) * k;
    this.punchT = Math.min(1, this.punchT + dt / 0.5);
  }

  /** The zoom factor the punch adds (1 = none): −k over 100 ms, back over 400 ms. */
  punchScale(): number {
    if (this.punchT >= 1 || this.punchK === 0) return 1;
    const t = this.punchT * 0.5;
    const k = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.4;
    return 1 + this.punchK * Math.max(0, k);
  }

  punch(k: number): void {
    if (this.reduced) return;
    this.punchK = -Math.abs(k);
    this.punchT = 0;
  }

  /** Shake tier (only the strongest per 100 ms window counts). */
  tier(t: 0 | 1 | 2 | 3 | 4): void {
    if (t <= 0 || !this.juice) return;
    const win = Math.floor(this.time * 10);
    if (win === this.tierWin && t <= this.tierAt) return;
    const prev = win === this.tierWin ? SHAKE_TIER[this.tierAt] : 0;
    this.tierWin = win;
    this.tierAt = t;
    this.juice.kick(SHAKE_TIER[t] - prev);
  }
}
