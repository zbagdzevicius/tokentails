/**
 * The shared skin-effect kit (docs/plans/moba/CARD-SKINS.md §3, §6): one profile per hero, `rung × element × motif`,
 * so every card skin AND every store or pass coat gets a full effect set with no bespoke art. Render only: the sim,
 * the replay record and the backend verifier never import this file (tests/unit/determinism.test.ts,
 * tests/unit/effect-kit.test.ts).
 *
 * Where a profile comes from (first hit wins):
 * - a card skin (a real Token Tails cat): its rung (the cat's tier for a tier-counting origin, or bond, whichever is
 *   higher); Awakened = a Legendary-tier cat with bond 30 (`CatSkin.awakened`), stepping up at hero levels 4, 7, 10;
 * - a store or pass coat (render/skins/coatRung.ts): a FIXED rung from its price band, from server entitlements only,
 *   never from bond, never Awakened.
 *
 * What the parts do:
 * - rung: which effects are on (Rare tints, Epic motifs and the tinted identity layer, Legendary paw bursts, foil,
 *   multi-kill card and the purr layer);
 * - element: the motif SHAPE (FIRE embers, ICE snow stars, ...) and the secondary colour;
 * - motif (the fur pattern): the emission RHYTHM (tabby stripes, spots scattered, points at the tips, tuxedo two-tone,
 *   calico three colours, solid one ring).
 *
 * Colours on another player's hero are made team-safe once, when the profile is resolved (`trimForTeam`: never gold,
 * never within 25° of the opposing team's hue), so the emitter draws them as they are. Nothing here allocates per call:
 * the emitter's option object and vector are preallocated, and profiles are reused per hero slot.
 */
import * as THREE from 'three';
import type { CatTier, Element } from '../../meta/roster';
import { ELEMENT_COLOR, type Coat } from '../cosmetics';
import { FADE, GROW, SHAPE } from '../fx/Particles.js';
import { hsl, hslToHex, mixHex } from './classify';
import { rungAtLeast, trimForTeam } from './registry';
import type { CatSkin } from './skinStore';

/** The emission rhythm, from the fur pattern. */
export type Motif = 'ring' | 'stripes' | 'dots' | 'tips' | 'twotone' | 'tri';
export type FurPattern = NonNullable<Coat['pattern']>;

export const MOTIF_OF_PATTERN: Readonly<Record<FurPattern, Motif>> = Object.freeze({
  solid: 'ring',
  tabby: 'stripes',
  spots: 'dots',
  points: 'tips',
  tuxedo: 'twotone',
  calico: 'tri',
});

export const motifOf = (pattern: FurPattern | undefined | null): Motif => (pattern ? MOTIF_OF_PATTERN[pattern] : 'ring');

/** Each element's motif shape (our own sticker shapes in render/fx/Particles.js). */
export const ELEMENT_SHAPE: Readonly<Record<Element, number>> = Object.freeze({
  FIRE: SHAPE.SPARK,
  ICE: SHAPE.SHARD,
  ELECTRIC: SHAPE.STAR4,
  WIND: SHAPE.FEATHER,
  DARK: SHAPE.SOFT,
  WATER: SHAPE.DROPLET,
  GRASS: SHAPE.HEART,
  SAND: SHAPE.PUFF,
  FAIRY: SHAPE.STAR5,
  STELLAR: SHAPE.STAR8,
});

/** Awakened steps (hero level): stage 1 at the ultimate unlock, 2 and 3 later. */
export const AWAKEN_LEVELS: readonly number[] = Object.freeze([4, 7, 10]);
/** A plain Legendary's fur foil (render/chars/charMaterial.ts FOIL_STRENGTH; copied to keep this file light). */
export const LEGENDARY_FOIL = 0.15;
/**
 * Fur foil per Awakened stage. Every stage is above a plain Legendary (LEGENDARY_FOIL), so an Awakened skin reads as
 * its own look from the first second of a match, not only from hero level 7.
 */
export const AWAKEN_FOIL: readonly number[] = Object.freeze([0.18, 0.2, 0.24, 0.3]);
/** The card-frame words per Awakened stage (ui/cards/frame.ts). */
export const AWAKEN_WORD: readonly string[] = Object.freeze(['Awakened', 'Kitten', 'Brave', 'Legend']);
export { AWAKEN_BOND } from './registry';

/** Live particles one hero's skin effects may hold at once, by rung (CARD-SKINS.md §4). */
export const HERO_FX_CAP: Readonly<Record<CatTier, number>> = Object.freeze({ COMMON: 0, RARE: 8, EPIC: 16, LEGENDARY: 24 });

export type Stage = 0 | 1 | 2 | 3;
export const stageOf = (level: number): Stage => (level >= AWAKEN_LEVELS[2] ? 3 : level >= AWAKEN_LEVELS[1] ? 2 : level >= AWAKEN_LEVELS[0] ? 1 : 0);

/** What a hero's skin (card or coat) adds this frame. Reused per slot (heroView `cardOut`). */
export interface SkinFxProfile {
  /** Hero slot (per-hero caps and pacing). */
  id: number;
  rung: CatTier;
  element: Element;
  motif: Motif;
  /** The coat glow, team-safe for another player's hero. */
  tint: number;
  /** The coat accent (or the card variant's accent), team-safe. */
  accent: number;
  /** The element colour (halfway to cream), team-safe. */
  elementTint: number;
  /** The kit's cream highlight, team-safe (pure cream reads as a hue at full saturation, so it is trimmed too). */
  cream: number;
  /** Cards only: a Legendary-tier cat with bond 30. Never true for a coat. */
  awakened: boolean;
  /** Awakened stage from the hero level (0 when not awakened). */
  stage: Stage;
  source: 'card' | 'coat';
  /** The cat's or coat's name. */
  name: string;
  self: boolean;
  team: 0 | 1;
  /** This viewer's relation to the hero (true: ally, false: enemy, null: unknown, e.g. the lobby): trimForTeam. */
  mate: boolean | null;
  /** Sparkles, motifs, bursts may draw (tints always may): tierFx caps (setting, Low, team fight, stealth). */
  extras: boolean;
  /** Low quality: reduced counts, no hit motif, no foil. */
  low: boolean;
}

export const emptyProfile = (): SkinFxProfile => ({ id: 0, rung: 'COMMON', element: 'STELLAR', motif: 'ring', tint: 0xffffff, accent: 0xffffff, elementTint: 0xffffff, cream: 0xfff3dc, awakened: false, stage: 0, source: 'card', name: '', self: false, team: 0, mate: null, extras: false, low: false });

const CREAM = 0xfff3dc;

/** A coat colour as a number ('#rrggbb' strings too). */
export const hexNum = (c: number | string): number => (typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16) || 0);

/**
 * The coat's glow colour: the most colourful of the coat's colours (base, light, deep, patch, the accent), lifted to a
 * lightness that glows under additive blending. A grey coat gives a silver tint.
 */
export function glowOf(colors: readonly (number | string)[]): number {
  let best = hexNum(colors[0]);
  let score = -1;
  for (let i = 0; i < colors.length; i++) {
    const o = hexNum(colors[i]);
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

/** A colour drawn on hero `p`: as is on your own hero, team-safe (and relation-safe when `mate` is known) on anyone else's. */
export const safe = (c: number, self: boolean, team: 0 | 1, mate: boolean | null = null): number => (self ? c : trimForTeam(c, team, mate ?? undefined));

/** Fill the shared colour fields of `o` (tint, accent, element tint) for `self` / `team`. */
function paint(o: SkinFxProfile, glow: number, accent: number): void {
  o.tint = safe(glow, o.self, o.team, o.mate);
  o.accent = safe(accent, o.self, o.team, o.mate);
  o.cream = safe(CREAM, o.self, o.team, o.mate);
  o.elementTint = safe(mixHex(ELEMENT_COLOR[o.element], CREAM, o.element === 'STELLAR' ? 0.2 : 0.35), o.self, o.team, o.mate);
}

/** A card skin's profile (null below Rare). `level`: the hero's level (Awakened stage). */
export function profileFromCard(skin: CatSkin | null, id: number, self: boolean, team: 0 | 1, extras: boolean, low: boolean, level: number, out?: SkinFxProfile, mate: boolean | null = null): SkinFxProfile | null {
  if (!skin || !rungAtLeast(skin.rung, 'RARE')) return null;
  const o = out ?? emptyProfile();
  o.id = id;
  o.rung = skin.rung;
  o.element = skin.element;
  o.motif = motifOf(skin.coat.pattern as FurPattern);
  o.awakened = skin.awakened === true && skin.rung === 'LEGENDARY';
  o.stage = o.awakened ? stageOf(level) : 0;
  o.source = 'card';
  o.name = skin.name;
  o.self = self;
  o.team = team;
  o.mate = mate;
  o.extras = extras;
  o.low = low;
  const c = skin.coat;
  const glow = glowOf(c.patch !== undefined ? [c.base, c.light, c.deep, c.cream, c.patch, ...(skin.accent !== undefined ? [skin.accent] : [])] : skin.accent !== undefined ? [c.base, c.light, c.deep, c.cream, skin.accent] : [c.base, c.light, c.deep, c.cream]);
  paint(o, glow, skin.accent ?? glow);
  return o;
}

/** A coat's profile from its fixed rung (null below Rare). Never Awakened: coats never read bond. */
export function profileFromCoatSpec(coat: Coat, name: string, rung: CatTier, element: Element, id: number, self: boolean, team: 0 | 1, extras: boolean, low: boolean, out?: SkinFxProfile, mate: boolean | null = null, sig: { glow: number; accent: number } | null = null): SkinFxProfile | null {
  if (!rungAtLeast(rung, 'RARE')) return null;
  const o = out ?? emptyProfile();
  o.id = id;
  o.rung = rung;
  o.element = element;
  o.motif = motifOf(coat.pattern);
  o.awakened = false;
  o.stage = 0;
  o.source = 'coat';
  o.name = name;
  o.self = self;
  o.team = team;
  o.mate = mate;
  o.extras = extras;
  o.low = low;
  // an Epic or Legendary coat's signature colours from its painted art (skins/coatVfx.ts), else the palette's glow
  if (sig) paint(o, sig.glow, sig.accent);
  else paint(o, glowOf(coat.patch !== undefined ? [coat.base, coat.light, coat.dark, coat.accent, coat.patch] : [coat.base, coat.light, coat.dark, coat.accent]), coat.accent);
  return o;
}

/** The fur foil strength for a profile (0 on Low, below Legendary, or without extras). */
export function foilOf(p: SkinFxProfile | null): number {
  if (!p || p.low || !p.extras || p.rung !== 'LEGENDARY') return 0;
  return p.awakened ? AWAKEN_FOIL[p.stage] : LEGENDARY_FOIL;
}

/** The foil colour: the element (lightened), team-safe (another hero's never gold). */
export const foilColor = (p: SkinFxProfile): number => mixHex(p.elementTint, 0xffffff, 0.25);

/** The n-th motif colour of the rhythm (twotone: cream and coat; tri: coat, element, accent; else coat and element). */
export function motifColor(p: SkinFxProfile, i: number): number {
  switch (p.motif) {
    case 'twotone':
      return i % 2 === 0 ? p.tint : p.cream;
    case 'tri':
      return i % 3 === 0 ? p.tint : i % 3 === 1 ? p.elementTint : p.accent;
    case 'tips':
      return i % 2 === 0 ? p.elementTint : p.tint;
    default:
      return i % 2 === 0 ? p.tint : p.elementTint;
  }
}

// ------------------------------------------------------------------------------------------------ the motif emitter

/** The particle API the kit draws through (render/fx/Particles.js). */
export interface KitParticles {
  add: { count: number; limit: number };
  alpha: { count: number; limit: number };
  single(pos: THREE.Vector3, o: Record<string, unknown>): void;
}

/** Unit offsets of the rhythm's n-th sprite (x, y in the emission plane), inside the unit circle. */
export function rhythmOffset(motif: Motif, i: number, n: number, out: { x: number; y: number }): void {
  switch (motif) {
    case 'stripes': {
      // three short stripes: rows of up to 3
      const row = Math.floor(i / 3);
      const rows = Math.max(1, Math.ceil(n / 3));
      out.x = ((i % 3) - 1) * 0.42;
      out.y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * 0.8;
      return;
    }
    case 'dots': {
      // scattered, fixed golden-angle spiral (no RNG: the same every time)
      const a = i * 2.39996;
      const r = 0.25 + 0.6 * Math.sqrt((i + 0.5) / Math.max(1, n));
      out.x = Math.cos(a) * Math.min(0.85, r);
      out.y = Math.sin(a) * Math.min(0.85, r);
      return;
    }
    case 'tips': {
      // the four points (ears, paws): compass tips
      const a = (i % 4) * (Math.PI / 2) + Math.PI / 4;
      out.x = Math.cos(a) * 0.8;
      out.y = Math.sin(a) * 0.8;
      return;
    }
    default: {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.3;
      out.x = Math.cos(a) * 0.7;
      out.y = Math.sin(a) * 0.7;
    }
  }
}

const _o = { x: 0, y: 0 };

/**
 * Draws a profile's motif: `n` element-shaped sprites in the fur pattern's rhythm, inside radius `r` (sprite size
 * included), upright (facing the camera) or flat on the ground. Preallocated: one option object and one vector.
 */
export class MotifEmitter {
  /** Sprites started so far (tests). */
  emitted = 0;
  readonly opts: Record<string, unknown> = { shape: SHAPE.STAR8, color: 0xffffff, intensity: 1.8, size0: 0.2, size1: 0.1, life: 0.4, grow: GROW.OUT, fade: FADE.LINEAR, rot: 0, spin: 0, alpha: 0.95, vx: 0, vy: 0, vz: 0, additive: true };
  readonly at = new THREE.Vector3();

  emit(particles: KitParticles, p: SkinFxProfile, x: number, y: number, z: number, n: number, r: number, life: number, flat = false, rise = 0.6): number {
    const size = Math.min(0.32, r * 0.45);
    const reach = Math.max(0, r - size / 2);
    const s = this.opts;
    s.shape = ELEMENT_SHAPE[p.element];
    s.intensity = p.element === 'DARK' ? 1.1 : 1.8;
    s.alpha = p.element === 'DARK' ? 0.7 : 0.95;
    s.size0 = size;
    s.size1 = size * 0.4;
    s.life = life;
    s.grow = GROW.OUT;
    s.fade = FADE.LINEAR;
    s.spin = p.element === 'ELECTRIC' ? 6 : 1.5;
    for (let i = 0; i < n; i++) {
      rhythmOffset(p.motif, i, n, _o);
      if (flat) this.at.set(x + _o.x * reach, Math.max(y, size * 0.5 + 0.05), z + _o.y * reach);
      else this.at.set(x + _o.x * reach, y + _o.y * reach, z);
      s.color = motifColor(p, i);
      s.rot = i * 0.7;
      s.vx = _o.x * 0.3;
      s.vy = rise;
      s.vz = flat ? _o.y * 0.3 : 0;
      particles.single(this.at, s);
    }
    this.emitted += n;
    return n;
  }

  /** One sprite of `shape` (the paw stamp, the recall card glyph). `rise`: upward drift (m/s; 0 keeps it in place). */
  glyph(particles: KitParticles, shape: number, color: number, x: number, y: number, z: number, size: number, life: number, spin = 0, grow: number = GROW.OUT, rise = 0.4): void {
    const s = this.opts;
    s.shape = shape;
    s.color = color;
    s.intensity = 2;
    s.alpha = 0.95;
    s.size0 = size;
    s.size1 = size * 0.7;
    s.life = life;
    s.grow = grow;
    s.fade = FADE.HOLD;
    s.rot = 0;
    s.spin = spin;
    s.vx = 0;
    s.vy = rise;
    s.vz = 0;
    this.at.set(x, y, z);
    particles.single(this.at, s);
    this.emitted++;
  }
}

/** Per-hero live particle accounting shared by CardVfx and TierFx (expiry per pooled slot, owner per slot). */
export class LiveBudget {
  private readonly expiry: Float64Array;
  private readonly owner: Int8Array;
  constructor(readonly max: number) {
    this.expiry = new Float64Array(max);
    this.owner = new Int8Array(max).fill(-1);
  }
  alive(time: number, id = -1): number {
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this.expiry[i] > time && (id < 0 || this.owner[i] === id)) n++;
    return n;
  }
  /** Room for `n` more: under the total and (with `id` and `rung`) under that hero's cap. */
  room(time: number, n: number, id = -1, rung: CatTier | null = null): boolean {
    if (this.alive(time) + n > this.max) return false;
    if (id >= 0 && rung) return this.alive(time, id) + n <= HERO_FX_CAP[rung];
    return true;
  }
  claim(time: number, n: number, life: number, id = -1): void {
    let k = 0;
    for (let i = 0; i < this.max && k < n; i++) {
      if (this.expiry[i] <= time) {
        this.expiry[i] = time + life;
        this.owner[i] = id;
        k++;
      }
    }
  }
}
