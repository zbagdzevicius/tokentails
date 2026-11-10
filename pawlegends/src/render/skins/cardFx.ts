/**
 * Wave C (C4) + CARD-SKINS.md: skin-tier ability effects, from the rung of the card skin (registry.ts `rung`) or the
 * store / pass coat (render/skins/coatRung.ts, fixed by price band) a hero wears, through the shared kit
 * (render/skins/effectKit.ts: rung × element × fur-pattern motif). Strictly
 * cosmetic: this file reads only the skin store, the snapshot and the events. It never changes a stat, a cooldown, a
 * hitbox or a sim input, and the sim and the backend verifier never import it (tests/unit/card-fx.test.ts plays a
 * match with and without a card equipped and compares the replay hash).
 *
 * | Rung      | Adds (on top of the C3 effects every hero has)                                                   |
 * |-----------|--------------------------------------------------------------------------------------------------|
 * | Common    | nothing: the default effects                                                                     |
 * | Rare      | the coat-palette tint on the hero's projectile trails, dash streaks, melee slashes and hit sparks  |
 * | Epic      | + a sparkle at every ability cast, 1 element motif inside the impact flash on ability hits, a      |
 * |           |   4-sprite takedown stamp in the fur pattern's rhythm (the footfall glint stays in tierFx.ts)      |
 * | Legendary | + a 1-sprite paw-print impact burst, a takedown flourish, the ultimate's paw-print wave (6 PAW     |
 * |           |   sprites, was 30 SOFT dots), and the multi-kill card above the killer (the killer's screen only) |
 * | Awakened  | Legendary card + bond 30: stage 2 adds the element motif to the ultimate's paw wave               |
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
import { SHAPE } from '../fx/Particles.js';
import { mixHex } from './classify';
import { glowOf, LiveBudget, MotifEmitter, profileFromCard, type SkinFxProfile } from './effectKit';
import { rungAtLeast, trimForTeam } from './registry';
import type { CatSkin } from './skinStore';

/** How far a Rare+ tint pulls the default colour toward the coat glow. */
export const CARD_TINT_MIX = 0.5;
/** Live C4 particles at most, all heroes together (CARD-SKINS.md §4: unchanged). */
export const CARD_MAX = 60;
/** Skip the extras while a pool is over this share of its limit (as tierFx). */
export const CARD_POOL_SKIP = 0.8;
/** One paw-print burst per hero per this many seconds on basic attacks (ability and big hits always stamp). */
export const PAW_GAP = 0.25;
/** Kills within this many sim ticks chain into a multi-kill (render/announcer.ts WINDOW.multikill). */
export const MULTI_WINDOW = 240;
/** Takedown stamp sprites (Low: half). */
export const STAMP_N = 4;
const CREAM = 0xfff3dc;

/**
 * What a hero's card skin or coat adds this frame (null: Common, none, or the setting hides it). The kit's profile
 * (render/skins/effectKit.ts SkinFxProfile); kept under its Wave C name for the callers.
 */
export type CardFx = SkinFxProfile;

/** The coat's glow colour (effectKit.ts glowOf over base, light, deep, cream, patch and the variant accent). */
export function coatGlow(skin: Pick<CatSkin, 'coat' | 'accent'>): number {
  const c = skin.coat;
  return glowOf([c.base, c.light, c.deep, c.cream, ...(c.patch !== undefined ? [c.patch] : []), ...(skin.accent !== undefined ? [skin.accent] : [])]);
}

/** The tint a hero's card gives: the coat glow; another player's hero never gold and never the enemy's hue. */
export function cardTint(skin: Pick<CatSkin, 'coat' | 'accent'>, self: boolean, team: 0 | 1): number {
  const g = coatGlow(skin);
  return self ? g : trimForTeam(g, team);
}

/** Fill `out` (reused per slot) for a hero wearing card `skin`; null for a Common or missing card. */
export function cardFxFor(skin: CatSkin | null, self: boolean, team: 0 | 1, extras: boolean, out?: CardFx, id = 0, low = false, level = 1): CardFx | null {
  return profileFromCard(skin, id, self, team, extras, low, level, out);
}

/**
 * A default effect colour with the skin's tint (Rare+). Colour only: the caller keeps every size and shape. On another
 * player's hero the team rule applies to the colour that is drawn, not only to the tint: two colours that are each
 * outside the opposing team's 25° band can blend into it, so the mix goes through trimForTeam (never gold, never the
 * opposing hue).
 */
export function tinted(base: number, fx: CardFx | null | undefined, mix = CARD_TINT_MIX): number {
  if (!fx || !rungAtLeast(fx.rung, 'RARE')) return base;
  const c = mixHex(base, fx.tint, mix);
  return fx.self ? c : trimForTeam(c, fx.team);
}

export const hasSparkle = (fx: CardFx | null | undefined): boolean => !!fx && fx.extras && rungAtLeast(fx.rung, 'EPIC');
export const hasSignature = (fx: CardFx | null | undefined): boolean => !!fx && fx.extras && fx.rung === 'LEGENDARY';

// ------------------------------------------------------------------------------------------------ copy

const RUNG_WORD: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });
const RUNG_EFFECT: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'look', RARE: 'tint', EPIC: 'sparkle', LEGENDARY: 'burst' });

/** The tier word ("Epic"). */
export const rungWord = (r: CatTier): string => RUNG_WORD[r];

/** The collection and preview line: "Legendary card: Ficus burst" (Common: "Common card: Pickles look"). */
export function cardFxLine(rung: CatTier, name: string, source: 'card' | 'coat' = 'card'): string {
  return `${RUNG_WORD[rung]} ${source}: ${name} ${RUNG_EFFECT[rung]}`;
}

/** What the rung adds, one sentence. Looks only, never a number or a power word. */
export function cardFxDetail(rung: CatTier, awakened = false): string {
  switch (rung) {
    case 'RARE':
      return 'Trails, ribbons and hits take the coat colour, and a pattern ring circles the recall nap.';
    case 'EPIC':
      return 'Coat-colour trails and skill effects, a sparkle on every cast, element motifs on ability hits, a takedown stamp in the coat pattern and a tinted ghost.';
    case 'LEGENDARY':
      return awakened
        ? 'Awakened: everything Legendary has, and the foil and the ultimate paw wave grow as your champion levels up (Kitten, Brave, Legend).'
        : 'Everything Epic has, plus paw-print hit bursts, an element foil, a card glyph on recall, a multi-kill card and a purr.';
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

/** Paw sprites in the ultimate's wave (each one SHAPE.PAW sprite; the wave was 6 prints of 5 dots). */
export const WAVE_PAWS = 6;

const _a = new THREE.Vector3();

export class CardVfx {
  /** Particles started so far (tests). */
  emitted = 0;
  private time = 0;
  private readonly live = new LiveBudget(CARD_MAX);
  private readonly kit = new MotifEmitter();
  private readonly lastPaw = new Float64Array(16).fill(-9);
  /** The player's own multi-kill chain (sim ticks). */
  private multiN = 0;
  private multiLast = -1e9;
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

  /** Living C4 particles (all heroes, or hero slot `id`). */
  alive(id = -1): number {
    return this.live.alive(this.time, id);
  }

  private room(n: number, fx: CardFx): boolean {
    const p = this.particles;
    if (p.add.count > p.add.limit * CARD_POOL_SKIP || p.alpha.count > p.alpha.limit * CARD_POOL_SKIP) return false;
    return this.live.room(this.time, n, fx.id, fx.rung);
  }

  private claim(n: number, life: number, fx: CardFx): void {
    this.live.claim(this.time, n, life, fx.id);
    this.emitted += n;
  }

  /** One paw-print sprite (SHAPE.PAW) of `size` (m) at (x, y, z). */
  private paw(x: number, y: number, z: number, size: number, color: number, life: number, spin = 0): void {
    this.kit.glyph(this.particles, SHAPE.PAW, color, x, y, z, size, life, spin);
  }

  /** Epic+: a few small stars twinkle up around the caster (inside its hero ring). Low (own hero): 4. */
  castSparkle(x: number, z: number, fx: CardFx | null): boolean {
    if (!hasSparkle(fx)) return false;
    const f = fx as CardFx;
    const n = f.low ? 4 : 6;
    if (!this.room(n, f)) return false;
    _a.set(x, 0.5, z);
    this.sparkle.n = n;
    this.sparkle.color = mixHex(f.tint, 0xffffff, 0.3);
    this.particles.ring(_a, this.sparkle);
    this.claim(n, 0.45, f);
    return true;
  }

  /**
   * Legendary: a paw-print burst on a hit, one SHAPE.PAW sprite inside the default impact flash (flashSize = its
   * size0). Basic hits stamp at most once per PAW_GAP per hero; ability and big hits always do.
   */
  impactBurst(pos: THREE.Vector3, src: number, flashSize: number, fx: CardFx | null, always: boolean): boolean {
    if (!hasSignature(fx)) return false;
    const f = fx as CardFx;
    const slot = src & 15;
    if (!always && this.time - this.lastPaw[slot] < PAW_GAP) return false;
    if (!this.room(1, f)) return false;
    this.lastPaw[slot] = this.time;
    this.paw(pos.x, pos.y, pos.z + 0.05, flashSize * 0.9, f.tint, 0.22);
    this.claim(1, 0.22, f);
    return true;
  }

  /** Epic+: one element motif sprite inside the default impact flash on an ability hit (none on Low). */
  hitMotif(pos: THREE.Vector3, flashSize: number, fx: CardFx | null): boolean {
    if (!hasSparkle(fx)) return false;
    const f = fx as CardFx;
    if (f.low || !this.room(1, f)) return false;
    this.kit.emit(this.particles, f, pos.x, pos.y, pos.z + 0.04, 1, flashSize * 0.5, 0.3, false, 0.3);
    this.claim(1, 0.3, f);
    return true;
  }

  /**
   * Epic+: a takedown stamp over the fallen hero, STAMP_N motif sprites in the coat pattern's rhythm (Low: half).
   * Legendary adds the flourish (a ring of 3 cream and 3 coat stars, was 10) and one paw print: 11 sprites, so a
   * takedown, a cast sparkle, a paw hit and the ultimate's wave fit one hero's Legendary cap (24) together.
   */
  takedown(x: number, z: number, fx: CardFx | null): boolean {
    if (!hasSparkle(fx)) return false;
    const f = fx as CardFx;
    const stamp = f.low ? STAMP_N / 2 : STAMP_N;
    const leg = f.rung === 'LEGENDARY';
    const n = stamp + (leg ? 7 : 0);
    if (!this.room(n, f)) return false;
    this.kit.emit(this.particles, f, x, 1.6, z, stamp, 0.9, 0.7);
    if (leg) {
      _a.set(x, 1.2, z);
      this.flourish.color = f.cream;
      this.flourish.n = 3;
      this.particles.ring(_a, this.flourish);
      this.flourish.color = f.tint;
      this.particles.ring(_a, this.flourish);
      this.paw(x, 2.2, z, 0.7, f.tint, 0.6);
    }
    this.claim(n, 0.8, f);
    return true;
  }

  /**
   * Legendary, the killer's own screen only: a multi-kill card above the killer, one step per kill past the first
   * (1 PAW + 6 STAR8 each), when kills chain within MULTI_WINDOW ticks. Call it for every hero takedown the player
   * scores (`tick` = the death's sim tick); returns the steps drawn.
   */
  multiKill(x: number, z: number, tick: number, fx: CardFx | null): number {
    this.multiN = tick - this.multiLast <= MULTI_WINDOW ? this.multiN + 1 : 1;
    this.multiLast = tick;
    if (!hasSignature(fx) || !(fx as CardFx).self || this.multiN < 2) return 0;
    const f = fx as CardFx;
    const steps = Math.min(3, this.multiN - 1);
    let drawn = 0;
    for (let i = 0; i < steps; i++) {
      if (!this.room(7, f)) break;
      const y = 2.6 + i * 0.45;
      this.paw(x, y, z, 0.55 + i * 0.08, i % 2 === 0 ? f.tint : f.cream, 0.8, (i - 1) * 2);
      _a.set(x, y, z);
      this.flourish.n = 6;
      this.flourish.color = f.elementTint;
      this.particles.ring(_a, this.flourish);
      this.claim(7, 0.8, f);
      drawn++;
    }
    return drawn;
  }

  /**
   * Legendary: the ultimate's signature, a coat-colour wave at 80 % of the ultimate wave's radius with six paw prints
   * stamped around it. Awakened stage 2+: plus six element motifs on the ground inside it. Never past `r1` (the default
   * wave), so the threat area reads the same.
   */
  signature(x: number, z: number, r1: number, fx: CardFx | null): boolean {
    if (!hasSignature(fx)) return false;
    const f = fx as CardFx;
    const motifs = f.awakened && f.stage >= 2 && !f.low ? 6 : 0;
    if (!this.room(WAVE_PAWS + motifs, f)) return false;
    const c = f.tint;
    const r = r1 * 0.8;
    _a.set(x, 0, z);
    this.wave.r1 = r;
    this.wave.color = '#' + c.toString(16).padStart(6, '0');
    this.shock?.start(_a, this.wave);
    const size = Math.min(0.9, 0.35 + r * 0.08);
    for (let i = 0; i < WAVE_PAWS; i++) {
      const a = (i / WAVE_PAWS) * Math.PI * 2 + 0.3;
      this.paw(x + Math.cos(a) * r * 0.75, 0.12, z - Math.sin(a) * r * 0.75, size, c, 0.55);
    }
    if (motifs) this.kit.emit(this.particles, f, x, 0.15, z, motifs, r * 0.5, 0.55, true, 0.8);
    this.claim(WAVE_PAWS + motifs, 0.55, f);
    return true;
  }
}

