/**
 * Wave C (C4): card-tier ability effects, from the rung of the card skin a hero wears (registry.ts `rung`). Strictly
 * cosmetic: this file reads only the skin store, the snapshot and the events. It never changes a stat, a cooldown, a
 * hitbox or a sim input, and the sim and the backend verifier never import it (tests/unit/card-fx.test.ts plays a
 * match with and without a card equipped and compares the replay hash).
 *
 * | Rung      | Adds (on top of the C3 effects every hero has)                                                   |
 * |-----------|--------------------------------------------------------------------------------------------------|
 * | Common    | nothing: the default effects                                                                     |
 * | Rare      | the coat-palette tint on the hero's projectile trails, dash streaks, melee slashes and hit sparks  |
 * | Epic      | + a sparkle at every ability cast; the footfall glint stays in tierFx.ts                          |
 * | Legendary | + a paw-print impact burst, a takedown flourish and the ultimate's paw-print shockwave           |
 *
 * Readability rules:
 * - A tint changes colour only. Shapes, sizes, counts and timings are the default ones, so a carded hero's trail or
 *   hit reads exactly as large as anyone else's. The extras are small accents inside the default footprint: the paw
 *   burst fits inside the default impact flash, and the paw-print wave never passes the ultimate's own wave radius.
 * - Gold only on the player's own hero: on another hero the drawn colour (the default mixed with the tint, not only the
 *   tint) is never in the gold "you" family and never within 25° of the opposing team's hue (registry.ts
 *   `trimForTeam`). The enemy ultimate keeps its red danger wave; the card only adds paw prints inside it.
 * - Everyone sees them (All, the default), as the Skin effects setting allows (Mine only / Off). Tints are free and
 *   always on; the extras follow tierFx's caps: another hero's only on Med / High and not in a team fight, none from a
 *   stealthed hero, skipped while either particle pool is over 80 % full, and at most CARD_MAX live particles.
 * - Pooled: option objects are preallocated, nothing here allocates per frame.
 */
import * as THREE from 'three';
import type { CatTier } from '../../meta/roster';
import { FADE, GROW, SHAPE } from '../fx/Particles.js';
import { hsl, hslToHex, mixHex } from './classify';
import { rungAtLeast, trimForTeam } from './registry';
import type { CatSkin } from './skinStore';

/** How far a Rare+ tint pulls the default colour toward the coat glow. */
export const CARD_TINT_MIX = 0.5;
/** Live C4 particles at most (the paw-print wave is the biggest: 6 paws of 5 sprites). */
export const CARD_MAX = 60;
/** Skip the extras while a pool is over this share of its limit (as tierFx). */
export const CARD_POOL_SKIP = 0.8;
/** One paw-print burst per hero per this many seconds on basic attacks (ability and big hits always stamp). */
export const PAW_GAP = 0.25;
const CREAM = 0xfff3dc;

/** What a hero's card adds this frame (null: Common, no card, or the setting hides it). */
export interface CardFx {
  rung: CatTier;
  /** The cat's name. */
  name: string;
  /** The coat glow colour, team-safe for another player's hero. */
  tint: number;
  self: boolean;
  /** The hero's team: the drawn colour (default mixed with the tint) is kept off the opposing team's hue. */
  team: 0 | 1;
  /** Sparkles, bursts, flourishes and the signature may draw (tints always may). */
  extras: boolean;
}

/** A coat colour as a number ('#rrggbb' strings too). */
const hexNum = (c: number | string): number => (typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16) || 0);

/**
 * The coat's glow colour: the most colourful of the coat's colours (base, light, deep, patch, the variant accent),
 * lifted to a lightness that glows under additive blending. A grey coat gives a silver tint.
 */
export function coatGlow(skin: Pick<CatSkin, 'coat' | 'accent'>): number {
  const c = skin.coat;
  const options = [c.base, c.light, c.deep, c.cream, ...(c.patch !== undefined ? [c.patch] : []), ...(skin.accent !== undefined ? [skin.accent] : [])].map(hexNum);
  let best = options[0];
  let score = -1;
  for (const o of options) {
    const [, s, l] = hsl(o);
    const k = s * (1 - Math.abs(l - 0.5));
    if (k > score) {
      score = k;
      best = o;
    }
  }
  const [h, s, l] = hsl(best);
  return hslToHex(h, Math.min(1, s < 0.12 ? s : Math.max(0.55, s)), Math.min(0.78, Math.max(0.62, l)));
}

/** The tint a hero's card gives: the coat glow; another player's hero never gold and never the enemy's hue. */
export function cardTint(skin: Pick<CatSkin, 'coat' | 'accent'>, self: boolean, team: 0 | 1): number {
  const g = coatGlow(skin);
  return self ? g : trimForTeam(g, team);
}

/** Fill `out` (reused per slot) for a hero wearing `skin`; null for a Common or missing card. */
export function cardFxFor(skin: CatSkin | null, self: boolean, team: 0 | 1, extras: boolean, out?: CardFx): CardFx | null {
  if (!skin || !rungAtLeast(skin.rung, 'RARE')) return null;
  const o = out ?? ({} as CardFx);
  o.rung = skin.rung;
  o.name = skin.name;
  o.tint = cardTint(skin, self, team);
  o.self = self;
  o.team = team;
  o.extras = extras;
  return o;
}

/**
 * A default effect colour with the card's tint (Rare+). Colour only: the caller keeps every size and shape. On another
 * player's hero the team rule applies to the colour that is drawn, not only to the tint: two colours that are each
 * outside the opposing team's 25° band can blend into it, so the mix goes through trimForTeam (never gold, never the
 * opposing hue).
 */
export function tinted(base: number, fx: CardFx | null | undefined): number {
  if (!fx || !rungAtLeast(fx.rung, 'RARE')) return base;
  const c = mixHex(base, fx.tint, CARD_TINT_MIX);
  return fx.self ? c : trimForTeam(c, fx.team);
}

export const hasSparkle = (fx: CardFx | null | undefined): boolean => !!fx && fx.extras && rungAtLeast(fx.rung, 'EPIC');
export const hasSignature = (fx: CardFx | null | undefined): boolean => !!fx && fx.extras && fx.rung === 'LEGENDARY';

// ------------------------------------------------------------------------------------------------ copy

const RUNG_WORD: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });
const RUNG_EFFECT: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'look', RARE: 'tint', EPIC: 'sparkle', LEGENDARY: 'burst' });

/** The collection and preview line: "Legendary card: Ficus burst" (Common: "Common card: Pickles look"). */
export function cardFxLine(rung: CatTier, name: string): string {
  return `${RUNG_WORD[rung]} card: ${name} ${RUNG_EFFECT[rung]}`;
}

/** What the rung adds, one sentence. Looks only, never a number or a power word. */
export function cardFxDetail(rung: CatTier): string {
  switch (rung) {
    case 'RARE':
      return 'Trails and hits take the coat colour.';
    case 'EPIC':
      return 'Coat-colour trails and hits, a sparkle on every cast and a glint on footfalls.';
    case 'LEGENDARY':
      return 'Coat-colour trails and hits, cast sparkles, paw-print hit bursts, a takedown flourish and a paw-print wave on the ultimate.';
    default:
      return 'The default effects. Bond 3 adds the coat-colour tint.';
  }
}

// ------------------------------------------------------------------------------------------------ drawing

/** The particle and shockwave API CardVfx uses (render/fx/Particles.js, Shockwaves.js). */
export interface CardParticles {
  add: { count: number; limit: number };
  alpha: { count: number; limit: number };
  burst(pos: THREE.Vector3, o: Record<string, unknown>): void;
  ring(pos: THREE.Vector3, o: Record<string, unknown>): void;
  single(pos: THREE.Vector3, o: Record<string, unknown>): void;
}
export interface CardShock {
  start(pos: THREE.Vector3, o: Record<string, unknown>): unknown;
}

/** Paw print: the pad and four toes (unit offsets in the print's plane, and each sprite's share of the size). */
export const PAW: readonly (readonly [number, number, number])[] = Object.freeze([
  [0, -0.12, 0.5],
  [-0.3, 0.2, 0.24],
  [-0.1, 0.36, 0.24],
  [0.1, 0.36, 0.24],
  [0.3, 0.2, 0.24],
] as const);

const _a = new THREE.Vector3();

export class CardVfx {
  /** Particles started so far (tests). */
  emitted = 0;
  private time = 0;
  private readonly expiry = new Float64Array(CARD_MAX);
  private readonly lastPaw = new Float64Array(16).fill(-9);
  private readonly s: Record<string, unknown> = { shape: SHAPE.SOFT, color: 0xffffff, intensity: 1.8, size0: 0.2, size1: 0.05, life: 0.3, grow: GROW.OUT, fade: FADE.LINEAR, rot: 0, spin: 0, alpha: 1, vx: 0, vy: 0, vz: 0, additive: true };
  private readonly sparkle: Record<string, unknown> = { additive: true, n: 6, exact: true, shape: SHAPE.STAR4, color: 0xffffff, intensity: 2, size: [0.1, 0.16], sizeEnd: 0.3, life: [0.3, 0.45], speed: [0.6, 1.2], up: 1.8, drag: 2, r0: 0.45, alpha: 0.9 };
  private readonly flourish: Record<string, unknown> = { additive: true, n: 10, exact: true, shape: SHAPE.STAR8, color: CREAM, intensity: 2, size: [0.16, 0.24], sizeEnd: 0.5, life: [0.55, 0.8], speed: [1, 1.8], up: 2.6, drag: 1.6, r0: 0.5, alpha: 0.95 };
  private readonly wave: Record<string, unknown> = { r1: 3, dur: 0.5, color: '#ffffff', height: 0.35, intensity: 1.2 };

  constructor(
    private readonly particles: CardParticles,
    private readonly shock: CardShock | null,
  ) {}

  tick(dt: number): void {
    this.time += dt;
  }

  /** Living C4 particles. */
  alive(): number {
    let n = 0;
    for (let i = 0; i < CARD_MAX; i++) if (this.expiry[i] > this.time) n++;
    return n;
  }

  private room(n: number): boolean {
    const p = this.particles;
    if (p.add.count > p.add.limit * CARD_POOL_SKIP || p.alpha.count > p.alpha.limit * CARD_POOL_SKIP) return false;
    return this.alive() + n <= CARD_MAX;
  }

  private claim(n: number, life: number): void {
    let k = 0;
    for (let i = 0; i < CARD_MAX && k < n; i++) {
      if (this.expiry[i] <= this.time) {
        this.expiry[i] = this.time + life;
        k++;
      }
    }
    this.emitted += n;
  }

  /** One paw print of `size` (m) at `pos`: upright (impacts) or flat on the ground facing `yaw` (the wave). */
  private paw(x: number, y: number, z: number, size: number, color: number, life: number, flat: boolean, yaw = 0): void {
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const s = this.s;
    for (const [px, py, k] of PAW) {
      if (flat) _a.set(x + (py * ca - px * sa) * size, y, z - (py * sa + px * ca) * size);
      else _a.set(x + px * size, y + py * size, z);
      s.shape = SHAPE.SOFT;
      s.color = k > 0.3 ? color : mixHex(color, 0xffffff, 0.35);
      s.intensity = 2;
      s.size0 = size * k * 0.9;
      s.size1 = size * k * 0.55;
      s.life = life;
      s.grow = GROW.OUT;
      s.fade = FADE.HOLD;
      s.alpha = 0.95;
      this.particles.single(_a, s);
    }
  }

  /** Epic+: a few small stars twinkle up around the caster (inside its hero ring). */
  castSparkle(x: number, z: number, fx: CardFx | null): boolean {
    if (!hasSparkle(fx) || !this.room(6)) return false;
    _a.set(x, 0.5, z);
    this.sparkle.color = mixHex((fx as CardFx).tint, 0xffffff, 0.3);
    this.particles.ring(_a, this.sparkle);
    this.claim(6, 0.45);
    return true;
  }

  /**
   * Legendary: a paw-print burst on a hit, inside the default impact flash (flashSize = its size0). Basic hits stamp at
   * most once per PAW_GAP per hero; ability and big hits always do.
   */
  impactBurst(pos: THREE.Vector3, src: number, flashSize: number, fx: CardFx | null, always: boolean): boolean {
    if (!hasSignature(fx)) return false;
    const slot = src & 15;
    if (!always && this.time - this.lastPaw[slot] < PAW_GAP) return false;
    if (!this.room(PAW.length)) return false;
    this.lastPaw[slot] = this.time;
    this.paw(pos.x, pos.y, pos.z + 0.05, flashSize * 0.8, (fx as CardFx).tint, 0.2, false);
    this.claim(PAW.length, 0.2);
    return true;
  }

  /** Legendary: a takedown flourish over the fallen hero, a ring of cream and coat stars and one paw print. */
  takedown(x: number, z: number, fx: CardFx | null): boolean {
    if (!hasSignature(fx) || !this.room(10 + PAW.length)) return false;
    _a.set(x, 1.2, z);
    this.flourish.color = CREAM;
    this.flourish.n = 5;
    this.particles.ring(_a, this.flourish);
    this.flourish.color = (fx as CardFx).tint;
    this.particles.ring(_a, this.flourish);
    this.paw(x, 2.2, z, 0.7, (fx as CardFx).tint, 0.6, false);
    this.claim(10 + PAW.length, 0.8);
    return true;
  }

  /**
   * Legendary: the ultimate's signature, a coat-colour wave at 80 % of the ultimate wave's radius with six paw prints
   * stamped around it, toes out. Never past `r1` (the default wave), so the threat area reads the same.
   */
  signature(x: number, z: number, r1: number, fx: CardFx | null): boolean {
    if (!hasSignature(fx) || !this.room(6 * PAW.length)) return false;
    const c = (fx as CardFx).tint;
    const r = r1 * 0.8;
    _a.set(x, 0, z);
    this.wave.r1 = r;
    this.wave.color = '#' + c.toString(16).padStart(6, '0');
    this.shock?.start(_a, this.wave);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.paw(x + Math.cos(a) * r * 0.75, 0.09, z - Math.sin(a) * r * 0.75, Math.min(0.9, 0.35 + r * 0.08), c, 0.55, true, a);
    }
    this.claim(6 * PAW.length, 0.55);
    return true;
  }
}
