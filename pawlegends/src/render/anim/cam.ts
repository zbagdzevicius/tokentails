/**
 * FightCam (ANIM-SPEC §8, feel pass B1). The fight meter counts heroes within 10 m of the player whose team took or
 * dealt hero damage in the last 2 s; at 4 or more the fight flag is on (it feeds tierFx.teamFight), held 1.5 s after
 * the count drops. Feel pass B1 (docs/plans/moba/FEEL-PASS.md): the camera is fixed, so the fight no longer pulls the
 * camera back or leans it toward the fight, and the own "punch" is no zoom: it is a short darkening vignette
 * (`onPunch`, a CSS overlay that never moves the camera), skipped under reduce motion.
 * Shake tiers go through Juice.kick (the shake setting and the reduce-motion caps apply), only the strongest tier in
 * each 100 ms counts.
 */
import type { FightCamLike, JuiceLike } from './types';

export const FIGHT = Object.freeze({ radius: 10, recent: 2, heroes: 4, hold: 1.5 });
/** The own punch vignette: how long (ms) and how dark (share of black at its peak). */
export const PUNCH_VIGNETTE = Object.freeze({ ms: 150, dark: 0.1 });
/** Shake tier kicks T0..T4. */
export const SHAKE_TIER: readonly number[] = Object.freeze([0, 0.06, 0.14, 0.28, 0.45]);

export interface FightHero {
  x: number;
  z: number;
  team: number;
  dead: boolean;
}

export class FightCam implements FightCamLike {
  /** Whether the fight flag is on. */
  fight = false;
  private holdT = 0;
  private time = 0;
  /** Last hero-damage time per team (render s). */
  readonly lastDamage = new Float64Array(3).fill(-99);
  private tierWin = -1;
  private tierAt = -1;
  reduced = false;
  portrait = false;
  /** Own punches shown (tests). */
  punches = 0;
  /** The view's vignette (gameView): called with PUNCH_VIGNETTE on an own punch. */
  onPunch: ((ms: number, dark: number) => void) | null = null;

  constructor(private readonly juice: JuiceLike | null) {}

  /** A hero of `team` took or dealt hero damage now. */
  damage(team: number): void {
    if (team >= 0 && team < 3) this.lastDamage[team] = this.time;
  }

  /** Per frame: heroes (positions m), the player's position, dt. */
  update(dt: number, heroes: readonly FightHero[], n: number, meX: number, meZ: number, hasMe: boolean): void {
    this.time += dt;
    let count = 0;
    if (hasMe)
      for (let i = 0; i < n; i++) {
        const h = heroes[i];
        if (h.dead || h.team > 1) continue;
        if (this.time - this.lastDamage[h.team] > FIGHT.recent) continue;
        const dx = h.x - meX;
        const dz = h.z - meZ;
        if (dx * dx + dz * dz <= FIGHT.radius * FIGHT.radius) count++;
      }
    if (count >= FIGHT.heroes) {
      this.fight = true;
      this.holdT = FIGHT.hold;
    } else if (this.holdT > 0) this.holdT -= dt;
    else this.fight = false;
  }

  /** The own punch: a short darkening vignette (the camera never zooms). `k` is kept for the clip cue's strength. */
  punch(k: number): void {
    if (this.reduced || !(k > 0)) return;
    this.punches++;
    this.onPunch?.(PUNCH_VIGNETTE.ms, PUNCH_VIGNETTE.dark);
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
