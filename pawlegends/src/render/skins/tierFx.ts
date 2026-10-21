/**
 * Card skin rarity effects in a match (GDD §7.2), one readable addition per rung, owned by the HeroView:
 *
 * | Rung      | Adds                                                                                       |
 * |-----------|--------------------------------------------------------------------------------------------|
 * | Common    | (the recolour and the chest gem: geometry, render/chars/specs.ts)                         |
 * | Rare      | (element trim: geometry)                                                                   |
 * | Epic      | footfall glints: one STAR8 per footfall (≥ 0.3 s apart), ankle height, alpha ≤ 0.35       |
 * | Legendary | fur foil (`uFoil`, Med / High only) and one cream + element STAR8 ring when a Nap recall lands |
 *
 * Never: ground auras (the shared 8-slot aura layer carries Avietė's charge and the charm glow, gameplay signals),
 * a new trail (the Zoomies tell), halos, gold on anyone but the player's own hero (yellow means "you"). Wave C (C4)
 * card-tier ability effects (render/skins/cardFx.ts) tint the existing trails and hits (colour only) and add the cast
 * sparkle and the Legendary paw prints; they use this file's caps (`mode`, `low`, `teamFight`).
 *
 * Who: the player's own hero always; others on Med / High only and never during a team fight (≥ 4 living heroes
 * within 12 m of the camera focus); on Low, glints for the own hero only and no foil. A stealthed hero emits nothing
 * and has no foil. Cosmetics are skipped while either particle pool is over 80 % of its limit, and at most 40
 * cosmetic particles live at once. Everything is preallocated: `update` allocates nothing.
 */
import * as THREE from 'three';
import type { CatTier, Element } from '../../meta/roster';
import { ELEMENT_COLOR } from '../cosmetics';
import { FOIL_STRENGTH } from '../chars/charMaterial';
import { mixHex } from './classify';
import { isGoldFamily, rungAtLeast } from './registry';

export type SkinFxMode = 'all' | 'mine' | 'off';

export const COSMETIC_MAX = 40;
export const POOL_SKIP = 0.8;
export const TEAM_FIGHT_HEROES = 4;
export const TEAM_FIGHT_RADIUS = 12;
export const GLINT_GAP = 0.3;
const CREAM = 0xfff3dc;
const STAR8 = 10;

/** The particle API TierFx uses (render/fx/Particles.js). */
export interface FxParticles {
  add: { count: number; limit: number };
  alpha: { count: number; limit: number };
  burst(pos: THREE.Vector3, o: Record<string, unknown>): void;
  ring(pos: THREE.Vector3, o: Record<string, unknown>): void;
}

/** The yellow "this is you" family (shared with the card-skin trim guard). */
export { isGoldFamily };

/** The glint colour: element halfway to cream; for another player's hero never in the gold family. */
export function glintColor(element: Element, self: boolean): number {
  let c = mixHex(ELEMENT_COLOR[element], CREAM, 0.5);
  if (!self && isGoldFamily(c)) c = mixHex(c, 0xffffff, 0.7);
  return c;
}

export interface FxHero {
  id: number;
  x: number;
  z: number;
  rung: CatTier;
  element: Element;
  self: boolean;
  moving: boolean;
  stealth: boolean;
  dead: boolean;
  napping: boolean;
  /** Gait phase (radians, render/chars/motion.ts): a footfall every π. */
  phase: number;
}

interface Track {
  step: number;
  lastGlint: number;
  x: number;
  z: number;
  napped: boolean;
  seen: boolean;
}

export class TierFx {
  mode: SkinFxMode = 'all';
  /** Low quality (or the FPS governor dropped to Low): own-hero glints only, no foil. */
  low = false;
  private time = 0;
  private fight = false;
  private readonly expiry = new Float64Array(COSMETIC_MAX);
  private readonly tracks = new Map<number, Track>();
  private readonly at = new THREE.Vector3();
  private readonly glintOpts: Record<string, unknown> = { additive: true, n: 1, exact: true, shape: STAR8, color: 0xffffff, alpha: 0.35, intensity: 1, size: [0.08, 0.12], life: [0.4, 0.4], speed: [0.1, 0.3], up: 0.4, jitter: 0.12 };
  private readonly ringOpts: Record<string, unknown> = { additive: true, n: 8, shape: STAR8, color: CREAM, alpha: 0.6, size: [0.14, 0.2], life: [0.5, 0.7], speed: [1.2, 1.8], r0: 0.4, up: 0.6, sizeEnd: 1 };
  /** Emits so far (tests). */
  emitted = 0;

  constructor(private readonly particles: FxParticles | null) {}

  /** Start a frame: the clock and the team-fight test (living hero positions near the camera focus). */
  begin(dt: number, focusX: number, focusZ: number, heroes: readonly { x: number; z: number; dead: boolean }[]): void {
    this.time += dt;
    let n = 0;
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (h.dead) continue;
      const dx = h.x - focusX;
      const dz = h.z - focusZ;
      if (dx * dx + dz * dz <= TEAM_FIGHT_RADIUS * TEAM_FIGHT_RADIUS) n++;
    }
    this.fight = n >= TEAM_FIGHT_HEROES;
    for (const t of this.tracks.values()) t.seen = false;
  }

  get teamFight(): boolean {
    return this.fight;
  }

  /** Living cosmetic particles. */
  alive(): number {
    let n = 0;
    for (let i = 0; i < COSMETIC_MAX; i++) if (this.expiry[i] > this.time) n++;
    return n;
  }

  private room(): boolean {
    const p = this.particles;
    if (!p) return false;
    if (p.add.count > p.add.limit * POOL_SKIP || p.alpha.count > p.alpha.limit * POOL_SKIP) return false;
    return this.alive() < COSMETIC_MAX;
  }

  private claim(n: number, life: number): void {
    let k = 0;
    for (let i = 0; i < COSMETIC_MAX && k < n; i++) {
      if (this.expiry[i] <= this.time) {
        this.expiry[i] = this.time + life;
        k++;
      }
    }
    this.emitted += n;
  }

  /** May this hero show cosmetics at all this frame? */
  private allowed(h: FxHero): boolean {
    if (this.mode === 'off' || h.stealth || h.dead) return false;
    if (h.self) return true;
    if (this.mode === 'mine' || this.low) return false;
    return !this.fight;
  }

  /**
   * One hero this frame. Returns the foil strength for its material (0 unless Legendary, allowed and not Low). Emits
   * the Epic+ footfall glints and the Legendary recall flourish.
   */
  hero(h: FxHero): number {
    let t = this.tracks.get(h.id);
    if (!t) {
      t = { step: Math.floor(h.phase / Math.PI), lastGlint: -1, x: h.x, z: h.z, napped: false, seen: true };
      this.tracks.set(h.id, t);
    }
    t.seen = true;
    const ok = this.allowed(h);
    const step = Math.floor(h.phase / Math.PI);
    if (ok && rungAtLeast(h.rung, 'EPIC') && h.moving && step !== t.step && this.time - t.lastGlint >= GLINT_GAP && this.room()) {
      t.lastGlint = this.time;
      const side = step % 2 === 0 ? 0.18 : -0.18;
      this.at.set(h.x + side, 0.15, h.z + side * 0.5);
      this.glintOpts.color = glintColor(h.element, h.self);
      this.particles?.burst(this.at, this.glintOpts);
      this.claim(1, 0.4);
    }
    t.step = step;
    // the Nap recall lands: a jump of more than 8 m right after napping
    const jumped = (h.x - t.x) * (h.x - t.x) + (h.z - t.z) * (h.z - t.z) > 64;
    if (ok && rungAtLeast(h.rung, 'LEGENDARY') && jumped && t.napped && this.room()) {
      this.at.set(h.x, 0.2, h.z);
      this.ringOpts.color = CREAM;
      this.particles?.ring(this.at, this.ringOpts);
      this.ringOpts.color = h.self ? ELEMENT_COLOR[h.element] : glintColor(h.element, false);
      this.particles?.ring(this.at, this.ringOpts);
      this.claim(16, 0.7);
    }
    t.x = h.x;
    t.z = h.z;
    t.napped = h.napping;
    return ok && !this.low && rungAtLeast(h.rung, 'LEGENDARY') ? FOIL_STRENGTH : 0;
  }

  end(): void {
    for (const [id, t] of this.tracks) if (!t.seen) this.tracks.delete(id);
  }
}
