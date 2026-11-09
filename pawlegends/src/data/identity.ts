/**
 * Champion identity (docs/plans/moba/CHAMP-IDENTITY.md): what every skill SOUNDS and LOOKS like, so a player can tell
 * by ear and eye what a skill does (its nature) and whose it is (the champion's trait).
 *
 * Two layers, always played together:
 *  1. NATURE: what the skill does (slash, fire, guard, ...). One sound family and one VFX grammar per nature, shared
 *     by every hero, so "an ice skill" always crunches and sheds shards whoever casts it.
 *  2. TRAIT: who cast it. Each hero has one signature motif (sun rays, yarn feathers, frisbees, Zzz...), a colour
 *     pair, a timbre (kalimba, kazoo, tuba...) and a short synth voice for the basic attack and the ultimate. The motif
 *     rides on top of the nature effect in every one of the hero's skills.
 *
 * Data only: render and audio read it, the sim never does (it changes no number). Sounds are zzfx 1.4 parameter
 * arrays in the order audio/sfxDefs.js documents; `reuse` names an existing PL_SFX sound that already is this voice.
 * Colours are 0xRRGGBB. Particle shapes are names of render/fx/Particles.js SHAPE; `sprite` is the intended art when
 * the shape is a stand-in.
 */
import type { HeroId } from './heroes/types';

/** zzfx 1.4: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump,
 * pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]. */
export type Zzfx = readonly number[];

/** render/fx/Particles.js SHAPE names. */
export type ParticleShape =
  | 'SOFT'
  | 'PUFF'
  | 'STAR4'
  | 'STAR5'
  | 'RING'
  | 'SPARK'
  | 'HEART'
  | 'FEATHER'
  | 'DROPLET'
  | 'SHARD'
  | 'STAR8'
  | 'FISH'
  | 'CONFETTI'
  | 'PLUS'
  | 'ZED'
  | 'PAW'
  | 'NOTE'
  | 'EXCLAIM'
  | 'BONE';

export type Nature =
  | 'slash'
  | 'impact'
  | 'projectile'
  | 'fire'
  | 'frost'
  | 'splash'
  | 'arcane'
  | 'shadow'
  | 'electric'
  | 'sonic'
  | 'heal'
  | 'guard'
  | 'mobility'
  | 'empower';

export const NATURES: readonly Nature[] = Object.freeze([
  'slash',
  'impact',
  'projectile',
  'fire',
  'frost',
  'splash',
  'arcane',
  'shadow',
  'electric',
  'sonic',
  'heal',
  'guard',
  'mobility',
  'empower',
] as Nature[]);

export interface NatureVfx {
  /** Main particle shape of the nature (the hero's motif is added on top). */
  shape: ParticleShape;
  /** How the particles move. */
  motion: string;
  /** Cast-to-fade timing. */
  timing: string;
  /** Ground mark or mesh it leaves (render/anim/types.ts MeshFxKind / LingerGlyph), if any. */
  mark?: string;
}

export interface NatureRecipe {
  label: string;
  /** What the nature tells the player the skill does. */
  reads: string;
  /** On the cast frame. */
  cast: Zzfx;
  /** Loop under a travelling projectile, field or channel (null: none). One per projectile, MIX.travelMax at once. */
  travel: Zzfx | null;
  /** On each hit / landing / block / heal received. */
  impact: Zzfx;
  vfx: NatureVfx;
}

/** The 14 skill natures. Short sounds: cast ≤ 0.3 s, impact ≤ 0.35 s, travel ≤ 0.45 s (MIX.maxSeconds). */
export const NATURE: Readonly<Record<Nature, NatureRecipe>> = Object.freeze({
  slash: {
    label: 'Slash',
    reads: 'Melee claw, swipe or bite: a cone or line right in front.',
    cast: [0.4, 0, 300, 0.005, 0.02, 0.08, 4, 1, 8, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.5, 0.02, 0, 2600],
    travel: null,
    impact: [0.45, 0, 180, 0, 0.02, 0.08, 4, 2, -6, 0, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.02, 0, -2400],
    vfx: { shape: 'SPARK', motion: 'crescent sweeps across the exact cone, stretched sparks fly outward along it', timing: '0.18 s sweep, 0.12 s fade', mark: 'crescent + scratches' },
  },
  impact: {
    label: 'Impact',
    reads: 'Slam, landing, bump or knockback: weight hitting the ground.',
    cast: [0.5, 0, 80, 0.005, 0.05, 0.2, 0, 2, -1, 0, 0, 0, 0, 0.6, 0, 0.15, 0, 0.6, 0.04, 0, -900],
    travel: null,
    impact: [0.5, 0, 55, 0.004, 0.06, 0.22, 4, 1, -1, 0, 0, 0, 0, 0.9, 0, 0.2, 0, 0.6, 0.05, 0, -700],
    vfx: { shape: 'PUFF', motion: 'one ground shockwave ring at the true radius, dust puffs kick outward and settle', timing: '0.25 s ring, 0.5 s dust', mark: 'ring + crater' },
  },
  projectile: {
    label: 'Projectile',
    reads: 'A thrown or shot object: dodge the line.',
    cast: [0.4, 0, 900, 0.003, 0.02, 0.07, 1, 1, -18, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
    travel: [0.18, 0, 260, 0.02, 0.18, 0.08, 1, 1, 0, 0, 0, 0, 0.05, 0.3, 0, 0, 0, 0.5, 0.02, 0.3, -1500],
    impact: [0.45, 0, 420, 0, 0.02, 0.08, 4, 1.5, -4, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.6, 0.02, 0, -2000],
    vfx: { shape: 'SOFT', motion: 'bright core with a motif trail dropped every 0.05 s; a small star burst on hit', timing: 'true flight time, 0.2 s hit pop' },
  },
  fire: {
    label: 'Fire',
    reads: 'Burn and area denial: do not stand in it.',
    cast: [0.5, 0, 140, 0.03, 0.06, 0.16, 4, 1, 3, 0, 0, 0, 0, 1.4, 0, 0, 0, 0.6, 0.04, 0, -1400],
    travel: [0.2, 0, 400, 0.01, 0.25, 0.1, 4, 1, 0, 0, 0, 0, 0.04, 1.8, 0, 0.1, 0, 0.5, 0.02, 0.5, 1200],
    impact: [0.45, 0, 600, 0.002, 0.05, 0.2, 4, 1, -2, 0, 0, 0, 0, 2, 0, 0, 0, 0.5, 0.03, 0, 2000],
    vfx: { shape: 'SPARK', motion: 'embers rise and flicker (negative gravity, jitter), a heat-glow disc under the area', timing: '0.3 s flare, embers 0.6 s', mark: 'scorch' },
  },
  frost: {
    label: 'Frost',
    reads: 'Cold: slows, and staying in it freezes.',
    cast: [0.4, 0, 1800, 0.002, 0.03, 0.18, 0, 1, 0, 0, 600, 0.03, 0, 0, 0, 0, 0.04, 0.7, 0.01, 0, 0],
    travel: [0.15, 0, 2400, 0.03, 0.2, 0.1, 0, 1, 0, 0, 0, 0, 0.03, 0, 20, 0, 0, 0.5, 0.02, 0.6, 0],
    impact: [0.45, 0, 700, 0, 0.02, 0.12, 4, 1, -3, 0, 0, 0, 0, 0.9, 0, 0.05, 0, 0.5, 0.02, 0, 3000],
    vfx: { shape: 'SHARD', motion: 'ice shards spray and drift down slowly; frost creeps out as a pale ring', timing: '0.4 s spray, frost 0.8 s', mark: 'frost ring' },
  },
  splash: {
    label: 'Splash',
    reads: 'Water, tears, ink, goo: a wet slow or a splat area.',
    cast: [0.4, 0, 350, 0.005, 0.04, 0.1, 0, 1.6, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
    travel: null,
    impact: [0.5, 0, 220, 0.003, 0.04, 0.18, 4, 1, -2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0.5, 0.04, 0, -1200],
    vfx: { shape: 'DROPLET', motion: 'droplets arc out under gravity and bounce once; a puddle spreads to the true radius', timing: '0.35 s arc, puddle 0.6 s', mark: 'puddle' },
  },
  arcane: {
    label: 'Arcane',
    reads: 'Starry or fairy magic: charms, marks, beams, traps.',
    cast: [0.35, 0, 1200, 0.01, 0.06, 0.17, 0, 1, 0, 0, 600, 0.05, 0.05, 0, 0, 0, 0.03, 0.7, 0.02, 0.1, 0],
    travel: [0.15, 0, 1600, 0.02, 0.2, 0.1, 0, 1, 0, 0, 400, 0.05, 0.05, 0, 0, 0, 0, 0.5, 0.02, 0.4, 0],
    impact: [0.45, 0, 990, 0.003, 0.05, 0.22, 0, 1, 0, 0, 330, 0.05, 0, 0, 0, 0, 0.04, 0.75, 0.02, 0.1, 0],
    vfx: { shape: 'STAR4', motion: 'stars twinkle (FADE.TWINKLE) and orbit the target, then converge on hit', timing: '0.5 s twinkle', mark: 'glow' },
  },
  shadow: {
    label: 'Shadow',
    reads: 'Stealth, fear, marks: something sneaky or scary.',
    cast: [0.4, 0, 200, 0.04, 0.06, 0.15, 4, 1, -1, 0, 0, 0, 0, 1.6, 0, 0, 0, 0.5, 0.04, 0, -900],
    travel: null,
    impact: [0.5, 0, 120, 0.002, 0.04, 0.2, 2, 1.5, -3, 0, -30, 0.05, 0, 0.5, 6, 0, 0, 0.6, 0.03, 0, -1200],
    vfx: { shape: 'SOFT', motion: 'dark smoke implodes toward the point (pulls in, not out); the hero dims for a beat', timing: '0.35 s implode', mark: 'none (stealth stays clean)' },
  },
  electric: {
    label: 'Electric',
    reads: 'Instant shock: blinks, beams, burst stuns.',
    cast: [0.4, 0, 1400, 0, 0.03, 0.08, 5, 1, -30, 0, 0, 0, 0.02, 0.6, 0, 0.2, 0, 0.6, 0.01, 0, 0],
    travel: [0.15, 0, 120, 0.01, 0.2, 0.05, 5, 1, 0, 0, 0, 0, 0.01, 0.3, 0, 0.3, 0, 0.5, 0.02, 0.5, 0],
    impact: [0.5, 0, 2000, 0, 0.02, 0.1, 4, 1, -40, 0, 0, 0, 0, 1.5, 0, 0.3, 0, 0.5, 0.01, 0, 1000],
    vfx: { shape: 'SPARK', motion: 'zig-zag bolt between two points, sparks jitter in place, a one-frame white flash', timing: '0.12 s bolt, 0.25 s afterglow', mark: 'crackLine' },
  },
  sonic: {
    label: 'Sonic',
    reads: 'Voice, bark, laugh, horn: fear, charm, herd, reveal.',
    cast: [0.4, 0, 330, 0.02, 0.1, 0.12, 0, 1, 2, 0, 0, 0, 0, 0, 5, 0, 0, 0.75, 0.03, 0.2, 0],
    travel: null,
    impact: [0.4, 0, 200, 0.002, 0.03, 0.14, 1, 1, -3, 0, 0, 0, 0, 0.3, 0, 0, 0.05, 0.6, 0.02, 0, -1600],
    vfx: { shape: 'RING', motion: 'concentric arcs ripple out along the real cone or ring, glyph words pop (NOTE / EXCLAIM)', timing: '3 ripples over 0.4 s', mark: 'arc' },
  },
  heal: {
    label: 'Heal',
    reads: 'Restores HP to friends.',
    cast: [0.35, 0, 520, 0.03, 0.06, 0.13, 0, 1, 4, 0, 260, 0.08, 0, 0, 0, 0, 0.04, 0.7, 0.03, 0.15, 0],
    travel: null,
    impact: [0.35, 0, 784, 0.01, 0.05, 0.2, 0, 1, 0, 0, 392, 0.06, 0, 0, 0, 0, 0.05, 0.7, 0.02, 0, 0],
    vfx: { shape: 'PLUS', motion: 'soft green-tinted plus marks spiral up from the receiver', timing: '0.8 s rise' },
  },
  guard: {
    label: 'Guard',
    reads: 'Shield or damage reduction: hitting it now is wasted.',
    cast: [0.45, 0, 420, 0.005, 0.05, 0.12, 0, 1.6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
    travel: null,
    impact: [0.45, 0, 1100, 0, 0.02, 0.2, 3, 1, -1, 0, 500, 0.02, 0, 0.2, 0, 0, 0.03, 0.6, 0.01, 0, 0],
    vfx: { shape: 'SHARD', motion: 'a dome or wall rises with a hex shimmer; each blocked hit flashes the face; it shatters into shards when it ends early', timing: '0.2 s rise, held for the real duration', mark: 'dome / wall' },
  },
  mobility: {
    label: 'Mobility',
    reads: 'Dash, blink, hop, leap: the hero is moving NOW.',
    cast: [0.4, 0, 320, 0.02, 0.05, 0.12, 4, 1, 12, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.04, 0, 3000],
    travel: null,
    impact: [0.4, 0, 110, 0.002, 0.03, 0.12, 0, 2, -2, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0.02, 0, -1000],
    vfx: { shape: 'PUFF', motion: 'speed lines along the real path, 3 motif afterimages, dust puff at take-off and landing', timing: '0.25 s', mark: 'trail' },
  },
  empower: {
    label: 'Empower',
    reads: 'A self buff or transformation: this hero is stronger for a while.',
    cast: [0.45, 0, 262, 0.02, 0.1, 0.11, 2, 1, 6, 0, 131, 0.05, 0.05, 0, 4, 0, 0.02, 0.65, 0.04, 0.2, -2600],
    travel: null,
    impact: [0.3, 0, 880, 0.005, 0.03, 0.12, 0, 1, -4, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02, 0, 0],
    vfx: { shape: 'STAR4', motion: 'a pillar of light on cast, then 3 motif particles orbit the body for the whole buff; a pip when it ends', timing: '0.6 s pillar, orbit for the duration', mark: 'pillar + glow' },
  },
});

export type SkillKey = 'basic' | 'passive' | 'q' | 'w' | 'e' | 'r';
export const SKILL_KEYS: readonly SkillKey[] = Object.freeze(['basic', 'passive', 'q', 'w', 'e', 'r'] as SkillKey[]);

export interface SkillIdentity {
  name: string;
  nature: Nature;
  /** How the hero's motif shows in this skill, on top of the nature effect. */
  motif: string;
}

export interface Voice {
  /** Existing PL_SFX sound that already is this voice (audio/sfx.ts), when one exists. */
  reuse?: string;
  zzfx: Zzfx;
}

export interface ChampIdentity {
  hero: HeroId;
  /** The one memorable signature, in a few words. */
  trait: string;
  /** Motif particle (a Particles.js SHAPE stand-in) and the intended sprite. */
  motif: { shape: ParticleShape; sprite: string };
  /** Signature colour pair: primary fills motif and projectile cores, secondary the sparkle and trail. Rims stay the relation colour. */
  colors: { primary: number; secondary: number };
  /** Instrument family every one of the hero's motif sounds uses. */
  timbre: string;
  /** Basic attack: a tiny voice (≤ 0.2 s) on each basic. Ult: the signature (≤ 1 s) on the cast. */
  voice: { basic: Voice; ult: Voice };
  skills: Readonly<Record<SkillKey, SkillIdentity>>;
}

const id = (c: ChampIdentity): ChampIdentity => c;

export const IDENTITY: Readonly<Record<HeroId, ChampIdentity>> = Object.freeze({
  clem: id({
    hero: 'clem',
    trait: 'Sunrise knight: every hit throws golden-hour sun rays',
    motif: { shape: 'STAR8', sprite: 'little sunburst with 8 rays' },
    colors: { primary: 0xff9f6b, secondary: 0xffe9a8 },
    timbre: 'kalimba pluck (bright triangle)',
    voice: {
      basic: { zzfx: [0.35, 0, 880, 0.002, 0.02, 0.12, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, 0] },
      ult: { zzfx: [0.55, 0, 523, 0.01, 0.15, 0.4, 1, 1, 0, 0, 262, 0.08, 0.08, 0, 0, 0, 0.06, 0.7, 0.03, 0, 0] },
    },
    skills: {
      basic: { name: 'Paw swipe', nature: 'slash', motif: 'one sunburst blinks at the claw tip' },
      passive: { name: 'Valor', nature: 'empower', motif: 'sun rays fill a ring above her head; at 100 the ring glows like a rising sun' },
      q: { name: 'Paw Combo', nature: 'slash', motif: 'crescents leave sun-ray streaks; the 3rd hit bursts a full sunburst' },
      w: { name: 'The Stand', nature: 'guard', motif: 'the wall is a sun disc; a reflected shot leaves a ray' },
      e: { name: 'Tumble', nature: 'mobility', motif: 'afterimages are tiny suns' },
      r: { name: 'Golden Hour', nature: 'empower', motif: 'a sunset sky tint; every 3rd-hit wave is a moving sun-ray fan' },
    },
  }),
  sage: id({
    hero: 'sage',
    trait: 'Moon archer: feathers and crescent moons',
    motif: { shape: 'FEATHER', sprite: 'mint arrow feather + thin crescent moon' },
    colors: { primary: 0x5fe6c0, secondary: 0xe8f0ff },
    timbre: 'wooden flute (sine with vibrato)',
    voice: {
      basic: { zzfx: [0.3, 0, 1046, 0.01, 0.03, 0.08, 0, 1, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0.7, 0.01, 0.1, 0] },
      ult: { zzfx: [0.5, 0, 392, 0.06, 0.3, 0.3, 0, 1, 1.2, 0, 196, 0.25, 0, 0, 6, 0, 0.05, 0.8, 0.05, 0.15, 0] },
    },
    skills: {
      basic: { name: 'Arrow', nature: 'projectile', motif: 'a single feather spins off the arrow on release' },
      passive: { name: 'Steady Paw', nature: 'projectile', motif: 'the 4th arrow trails a line of feathers through every target' },
      q: { name: 'Volley', nature: 'projectile', motif: '5 arrows, each with a feather tail; hits puff feathers' },
      w: { name: 'Sun Snare', nature: 'arcane', motif: 'the trap is a small crescent moon on the ground; triggered, it closes like a moon phase' },
      e: { name: 'Hop Back', nature: 'mobility', motif: 'feathers drift down where she stood' },
      r: { name: 'Moonshot', nature: 'arcane', motif: 'a full moon rises behind her in the wind-up; the line is a moonbeam edged with crescents' },
    },
  }),
  brutus: id({
    hero: 'brutus',
    trait: 'Sand knight: heraldic crest stamps and anvil clangs',
    motif: { shape: 'STAR5', sprite: 'tiny shield crest with a chevron' },
    colors: { primary: 0xd6a36a, secondary: 0xc8ced6 },
    timbre: 'anvil and armour clank (metallic)',
    voice: {
      basic: { zzfx: [0.4, 0, 660, 0, 0.02, 0.14, 3, 1, 0, 0, 700, 0.01, 0, 0.2, 0, 0, 0, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.6, 0, 196, 0.01, 0.25, 0.4, 2, 1, 0, 0, 98, 0.12, 0.12, 0, 0, 0, 0.06, 0.75, 0.04, 0, -2200] },
    },
    skills: {
      basic: { name: 'Shield bash', nature: 'impact', motif: 'a crest stamp flashes on the target' },
      passive: { name: 'Honour', nature: 'guard', motif: 'the Honour shield wears his crest, which fills with sand as it grows' },
      q: { name: 'Shield Slam', nature: 'impact', motif: 'the ring is stamped with crests around its edge' },
      w: { name: 'Front Guard', nature: 'guard', motif: 'the frontal wall is a giant steel crest; blocked shots clang off it' },
      e: { name: 'Pug Charge', nature: 'mobility', motif: 'a sand plume and a crest stamp where he hits' },
      r: { name: "Champion's Challenge", nature: 'sonic', motif: 'a horn call; the ring is a jousting circle of crests, the tether a banner ribbon' },
    },
  }),
  cacklejaw: id({
    hero: 'cacklejaw',
    trait: 'Cackling shadow: lime grin crescents and "hee hee"',
    motif: { shape: 'SPARK', sprite: 'lime grin crescent (a toothy smile)' },
    colors: { primary: 0x3a2a5a, secondary: 0xb8f040 },
    timbre: 'kazoo cackle (buzzy saw with tremolo)',
    voice: {
      basic: { zzfx: [0.35, 0, 700, 0.005, 0.03, 0.05, 2, 1, 4, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.7, 0.02, 0, -2800] },
      ult: { zzfx: [0.55, 0, 600, 0.01, 0.35, 0.15, 2, 1, 2, 0, 0, 0, 0.07, 0.4, 10, 0, 0, 0.75, 0.03, 0.6, -3000] },
    },
    skills: {
      basic: { name: 'Claw', nature: 'slash', motif: 'a lime grin flashes on the slash' },
      passive: { name: 'Pack Flank', nature: 'shadow', motif: 'a flank hit adds a grin glyph behind the victim' },
      q: { name: 'Jeer Slash', nature: 'slash', motif: 'the dash line leaves a row of grinning crescents' },
      w: { name: 'Gloat', nature: 'sonic', motif: 'the cone ripples with "hee" glyphs in lime' },
      e: { name: 'Bush Slink', nature: 'shadow', motif: 'only a faint lime grin hangs where he vanished (owner and allies see it)' },
      r: { name: 'Pack Hunt', nature: 'shadow', motif: 'the mark is a big grin over the victim; the dash leaves grin afterimages' },
    },
  }),
  lambo: id({
    hero: 'lambo',
    trait: 'Cuddly tank: twinkling string lights and tuna',
    motif: { shape: 'SOFT', sprite: 'amber string-light bulb on a cord' },
    colors: { primary: 0xa8b0bc, secondary: 0xffb347 },
    timbre: 'music box (high sine with echo)',
    voice: {
      basic: { zzfx: [0.3, 0, 1568, 0.002, 0.02, 0.13, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.03, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.5, 0, 1047, 0.005, 0.2, 0.4, 0, 1, 0, 0, 523, 0.07, 0.07, 0, 0, 0, 0.08, 0.7, 0.02, 0.1, 0] },
    },
    skills: {
      basic: { name: 'Paw bop', nature: 'impact', motif: 'one bulb blinks on the hit' },
      passive: { name: 'Brave With Friends', nature: 'guard', motif: 'a short cord of lights links him to the nearby ally' },
      q: { name: 'Tuna Toss', nature: 'splash', motif: 'the tuna can trails tiny lit bulbs; the splat has a fish shape' },
      w: { name: 'Big Hug', nature: 'guard', motif: 'the shields are wrapped in a ring of glowing bulbs' },
      e: { name: 'Belly Flop', nature: 'impact', motif: 'the landing ring flashes a circle of bulbs' },
      r: { name: 'Tangled Lights', nature: 'electric', motif: 'string lights lasso every pulled hero and blink as they root' },
    },
  }),
  aviete: id({
    hero: 'aviete',
    trait: 'Raspberry static: sparks that end in raspberry dots',
    motif: { shape: 'SPARK', sprite: 'zig-zag spark ending in a raspberry drupelet cluster' },
    colors: { primary: 0xc83a8c, secondary: 0xfff3a6 },
    timbre: 'theremin buzz and static (square, bit-crushed)',
    voice: {
      basic: { zzfx: [0.35, 0, 1200, 0, 0.02, 0.06, 5, 1, -20, 0, 0, 0, 0, 0.5, 0, 0.2, 0, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.6, 0, 300, 0.01, 0.2, 0.25, 5, 1, 30, 0, 0, 0, 0.03, 0.8, 0, 0.3, 0, 0.7, 0.03, 0.4, 0] },
    },
    skills: {
      basic: { name: 'Static claw', nature: 'electric', motif: 'a raspberry spark pops on each hit' },
      passive: { name: 'Shy, Then Shiny', nature: 'electric', motif: 'charged: raspberry dots crackle around her paws' },
      q: { name: 'Spark Swipe', nature: 'electric', motif: 'the cone edge is a raspberry-tipped zig-zag' },
      w: { name: 'Shiny Coat', nature: 'empower', motif: 'her coat fills with raspberry sparkle over the 0.5 s charge' },
      e: { name: 'Live Wire', nature: 'mobility', motif: 'a raspberry dot marks the return point; the blink is a spark line' },
      r: { name: 'Short Circuit', nature: 'electric', motif: 'a bolt from the sky splits into raspberry spark clusters on the slowed heroes' },
    },
  }),
  bengas: id({
    hero: 'bengas',
    trait: 'Diva chef: toast crumbs and camellia petals',
    motif: { shape: 'SHARD', sprite: 'golden toast slice / crumbs; camellia petal on movement' },
    colors: { primary: 0xb01838, secondary: 0xe0a050 },
    timbre: 'castanet clack and sizzle',
    voice: {
      basic: { zzfx: [0.35, 0, 1800, 0, 0.01, 0.04, 4, 1, 0, 0, 0, 0, 0, 0.4, 0, 0, 0, 0.5, 0.01, 0, 4000] },
      ult: { zzfx: [0.55, 0, 150, 0.05, 0.3, 0.4, 4, 1, 2, 0, 0, 0, 0.12, 1.6, 0, 0, 0.04, 0.6, 0.05, 0.5, -1800] },
    },
    skills: {
      basic: { name: 'Ember flick', nature: 'fire', motif: 'each shot is a glowing toast crumb' },
      passive: { name: 'Hot Toast', nature: 'fire', motif: 'a buttery glint and a crumb pop on the bonus hit' },
      q: { name: 'Burnt Toast', nature: 'fire', motif: 'a spinning slice of toast, smoking; the hit scatters crumbs' },
      w: { name: 'Striking Pose', nature: 'arcane', motif: 'a camera-flash star with camellia petals; stunned heroes get a camellia over their head' },
      e: { name: 'Camellia Hop', nature: 'mobility', motif: 'camellia petals swirl in the trail' },
      r: { name: 'Curtains Up!', nature: 'fire', motif: 'crimson curtains part over a ring of toast-gold flames; each pulse pops crumbs' },
    },
  }),
  gabe: id({
    hero: 'gabe',
    trait: 'Wind angel: heart balloons and white feathers',
    motif: { shape: 'HEART', sprite: 'pink heart balloon + white feather' },
    colors: { primary: 0xff5c9e, secondary: 0xfff4fa },
    timbre: 'wind chimes (high glassy sine, echo)',
    voice: {
      basic: { zzfx: [0.3, 0, 2093, 0.002, 0.02, 0.12, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.04, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.5, 0, 1319, 0.01, 0.25, 0.45, 0, 1, -0.5, 0, -220, 0.1, 0.1, 0, 3, 0, 0.06, 0.7, 0.03, 0.2, 0] },
    },
    skills: {
      basic: { name: 'Heart puff', nature: 'projectile', motif: 'a small heart on a breeze trail' },
      passive: { name: 'Heart Breeze', nature: 'heal', motif: 'the heal arrives as a heart on a feather' },
      q: { name: 'Heart Balloon', nature: 'heal', motif: 'a heart balloon floats in and pops into hearts (allies) and feathers (enemies)' },
      w: { name: 'Wing Wrap', nature: 'guard', motif: 'two feather wings fold around the shielded ally' },
      e: { name: 'Chase the Wind', nature: 'mobility', motif: 'a feather stream along the path, hearts on the hasted allies' },
      r: { name: 'Under Her Spell', nature: 'arcane', motif: 'a cone of hearts; charmed heroes float a heart over their heads' },
    },
  }),
  meatball: id({
    hero: 'meatball',
    trait: 'Sleepy bowler: bowling pins and Zzz',
    motif: { shape: 'ZED', sprite: 'white-and-basil bowling pin; Zzz letters' },
    colors: { primary: 0x5fb84a, secondary: 0x7a68ff },
    timbre: 'tuba oompah (low saw)',
    voice: {
      basic: { zzfx: [0.4, 0, 98, 0.01, 0.05, 0.1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02, 0, -800] },
      ult: { zzfx: [0.65, 0, 65, 0.02, 0.35, 0.35, 2, 1, 0, 0, 33, 0.15, 0.15, 0, 0, 0, 0, 0.75, 0.05, 0.2, -700] },
    },
    skills: {
      basic: { name: 'Belly bump', nature: 'impact', motif: 'a pin wobbles over the target' },
      passive: { name: 'Food Coma', nature: 'guard', motif: 'Zzz letters rise from the sleep shield' },
      q: { name: 'Bowling Roll', nature: 'impact', motif: 'knocked enemies spin like pins; a "strike" pin burst on 2+ heroes' },
      w: { name: 'Loaf Mode', nature: 'guard', motif: 'a sleepy loaf with Zzz; charmed heroes get a pin icon' },
      e: { name: 'Big Brother', nature: 'mobility', motif: 'pins scatter where he lands beside the ally' },
      r: { name: 'Unstoppable Chonk', nature: 'empower', motif: 'a ring of pins orbits him; every bump sends pins flying' },
    },
  }),
  pixel: id({
    hero: 'pixel',
    trait: 'Cardboard robot: 8-bit pixel squares',
    motif: { shape: 'CONFETTI', sprite: 'square LED pixel; cardboard tape strip' },
    colors: { primary: 0x3fd8e8, secondary: 0xc89a5e },
    timbre: 'chiptune square blips',
    voice: {
      basic: { zzfx: [0.3, 0, 1046, 0, 0.02, 0.04, 5, 1, 0, 0, 523, 0.02, 0, 0, 0, 0, 0, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.5, 0, 262, 0, 0.3, 0.2, 5, 1, 0, 0, 131, 0.05, 0.05, 0, 0, 0, 0, 0.6, 0.02, 0, 0] },
    },
    skills: {
      basic: { name: 'Pellet', nature: 'projectile', motif: 'a square pixel bullet; hits break into 4 pixels' },
      passive: { name: 'Cardboard Plating', nature: 'guard', motif: 'the plate is taped cardboard; it breaks into cardboard pixels' },
      q: { name: 'Cap Cannon', nature: 'projectile', motif: 'a bottle cap trailing pixel squares; a pixel "!" over the revealed hero' },
      w: { name: 'Laser Pointer', nature: 'electric', motif: 'the beam is pixel-stepped; each pulse drops pixels' },
      e: { name: 'Duck and Cover', nature: 'guard', motif: 'the box flaps shut with a pixel "loading" ring' },
      r: { name: 'BOXBOT MK II', nature: 'empower', motif: 'pixels assemble the bot suit; splash hits pop pixel bursts' },
    },
  }),
  duchess: id({
    hero: 'duchess',
    trait: 'Royal Persian: tiny gold crowns and fluff',
    motif: { shape: 'STAR5', sprite: 'tiny gold crown; grey fluff wisp' },
    colors: { primary: 0x7a28d0, secondary: 0xffcf4a },
    timbre: 'harpsichord flick (filtered saw)',
    voice: {
      basic: { zzfx: [0.3, 0, 740, 0, 0.02, 0.1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01, 0, -3500] },
      ult: { zzfx: [0.55, 0, 370, 0.005, 0.3, 0.4, 2, 1, 0, 0, 185, 0.1, 0.1, 0, 0, 0, 0.05, 0.7, 0.03, 0, -3000] },
    },
    skills: {
      basic: { name: 'Disdainful glare', nature: 'shadow', motif: 'a plum bolt with a crown glint' },
      passive: { name: 'Utter Disdain', nature: 'shadow', motif: 'Disdain stacks show as 1-3 tiny crowns; the Snub drops a crown on the head' },
      q: { name: 'Fluff Puff', nature: 'projectile', motif: 'a fluff ball with a crown on top' },
      w: { name: 'Not Amused', nature: 'shadow', motif: 'a cone of plum glare edged with crown points' },
      e: { name: 'Cushion Glide', nature: 'mobility', motif: 'a velvet cushion trail; the fluff cloud carries gold specks' },
      r: { name: 'Royal Decree', nature: 'sonic', motif: 'a scroll unrolls; a ring of crowns rings out' },
    },
  }),
  stilts: id({
    hero: 'stilts',
    trait: 'Savannah sprinter: long paw-print tracks',
    motif: { shape: 'PAW', sprite: 'long terracotta paw print' },
    colors: { primary: 0xb85a30, secondary: 0xe9d3a8 },
    timbre: 'bongo slap (tan-wave drum)',
    voice: {
      basic: { zzfx: [0.4, 0, 330, 0, 0.02, 0.08, 3, 1, -6, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.6, 0.01, 0, 0] },
      ult: { zzfx: [0.55, 0, 440, 0, 0.2, 0.15, 3, 1, -4, 0, 0, 0, 0.06, 0.1, 0, 0, 0, 0.7, 0.02, 0, 0] },
    },
    skills: {
      basic: { name: 'Swat', nature: 'slash', motif: 'a paw print stamps on the target' },
      passive: { name: 'Long Stride', nature: 'empower', motif: 'paw prints appear behind her, brighter as Stride fills' },
      q: { name: 'High Leap', nature: 'mobility', motif: 'a big paw print stamps the landing spot' },
      w: { name: 'Ear Swivel', nature: 'sonic', motif: 'a sonar ripple of paw prints shows each revealed hero' },
      e: { name: 'Swat-Swat', nature: 'slash', motif: 'two paw prints, left then right' },
      r: { name: 'Zoomies', nature: 'empower', motif: 'a running track of glowing prints follows her for the whole buff' },
    },
  }),
  nugget: id({
    hero: 'nugget',
    trait: 'Good-boy corgi: frisbees and bone treats',
    motif: { shape: 'BONE', sprite: 'pink frisbee ring; bone treat' },
    colors: { primary: 0xe0782e, secondary: 0xffb3e0 },
    timbre: 'rubber squeak and double bork',
    voice: {
      basic: { reuse: 'nuggetSqueak', zzfx: [0.3, 0, 1500, 0.01, 0.05, 0.08, 1, 1.4, 6, 0, 300, 0.03, 0, 0, 9, 0, 0, 0.85, 0.02, 0, 0] },
      ult: { reuse: 'nuggetBork', zzfx: [0.5, 0, 720, 0.004, 0.03, 0.06, 1, 1.6, -7, 0, 0, 0, 0.1, 0.25, 0, 0, 0, 0.8, 0.02, 0, -3200] },
    },
    skills: {
      basic: { name: 'Treat toss', nature: 'projectile', motif: 'a tiny bone treat' },
      passive: { name: 'Treat Pouch', nature: 'heal', motif: 'a bone treat arcs to the healed ally' },
      q: { name: 'Frisbee', nature: 'projectile', motif: 'a spinning pink frisbee ring' },
      w: { name: 'Best Friend', nature: 'guard', motif: 'a frisbee-ring shield around the ally' },
      e: { name: 'Sploot', nature: 'heal', motif: 'bone treats bounce up around the sploot' },
      r: { name: 'Herding Time', nature: 'sonic', motif: 'bark rings with bone glyphs; herded cats leave paw scuffs' },
    },
  }),
  marshmallow: id({
    hero: 'marshmallow',
    trait: 'Snow puppy: marshmallow snow puffs and flakes',
    motif: { shape: 'PUFF', sprite: 'round snow puff; six-point flake' },
    colors: { primary: 0xf6fbff, secondary: 0x9fe8ff },
    timbre: 'sleigh bells (shimmering high sine)',
    voice: {
      basic: { zzfx: [0.3, 0, 2637, 0.002, 0.03, 0.12, 0, 1, 0, 0, 0, 0, 0.02, 0, 40, 0, 0, 0.6, 0.01, 0.6, 0] },
      ult: { reuse: 'marshAwoo', zzfx: [0.45, 0, 520, 0.05, 0.2, 0.16, 0, 1, 2.6, 0, 300, 0.2, 0, 0, 6, 0, 0, 0.8, 0.04, 0.15, 0] },
    },
    skills: {
      basic: { name: 'Snow puff', nature: 'frost', motif: 'a snow puff that bursts into flakes' },
      passive: { name: 'Fresh Snow', nature: 'frost', motif: 'puffs kick up from her paws while she is on her snow' },
      q: { name: 'Snowball', nature: 'frost', motif: 'a rolling puff that grows a little in flight' },
      w: { name: 'Snow Patch', nature: 'frost', motif: 'puffs fall onto the patch' },
      e: { name: 'Belly Slide', nature: 'mobility', motif: 'a sled track of puffs; the shield is a snow shell' },
      r: { name: 'SNOW DAY!', nature: 'frost', motif: 'a puff blizzard; Frozen heroes become little snow-puff statues' },
    },
  }),
  bravo: id({
    hero: 'bravo',
    trait: 'Drama pug: spotlights, tears and bows',
    motif: { shape: 'DROPLET', sprite: 'aqua tear drop; cream spotlight cone' },
    colors: { primary: 0xb07cff, secondary: 0xfff4dc },
    timbre: 'brass trumpet (saw fanfare)',
    voice: {
      basic: { zzfx: [0.35, 0, 523, 0.005, 0.03, 0.06, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, -2800] },
      ult: { reuse: 'bravoBow', zzfx: [0.5, 0, 392, 0.01, 0.12, 0.3, 2, 1, 0, 0, 196, 0.1, 0.1, 0, 0, 0, 0.05, 0.75, 0.03, 0, -2600] },
    },
    skills: {
      basic: { name: 'Head bonk', nature: 'impact', motif: 'a tiny spotlight blink on the bonk' },
      passive: { name: 'Dramatic Flop', nature: 'heal', motif: 'a spotlight snaps on, fake tears, a single rose' },
      q: { name: 'Crocodile Tears', nature: 'splash', motif: 'a big tear drop; the splash makes a puddle of tears' },
      w: { name: 'Center Stage', nature: 'guard', motif: 'the 3 m spotlight cone from above' },
      e: { name: 'Stage Dive', nature: 'impact', motif: 'he dives out of a spotlight; the landing ring has stage-board planks' },
      r: { name: 'ENCORE!', nature: 'sonic', motif: 'a spotlight on him, confetti and a bow; charmed heroes get a small spotlight' },
    },
  }),
  chili: id({
    hero: 'chili',
    trait: 'Tiny rage: chili peppers and anger "!"',
    motif: { shape: 'EXCLAIM', sprite: 'little chili pepper with a green stem; anger mark' },
    colors: { primary: 0xff6a2a, secondary: 0x6cd04a },
    timbre: 'high square yap',
    voice: {
      basic: { reuse: 'chiliYap', zzfx: [0.3, 0, 1250, 0.003, 0.02, 0.05, 5, 1, -14, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.01, 0, 0] },
      ult: { reuse: 'chiliBigBark', zzfx: [0.7, 0, 150, 0.005, 0.07, 0.2, 2, 2, -2, 0, 0, 0, 0, 0.4, 0, 0.1, 0, 0.7, 0.04, 0, -1200] },
    },
    skills: {
      basic: { name: 'Static nip', nature: 'electric', motif: 'a tiny pepper spark on each shot' },
      passive: { name: 'Small Dog Syndrome', nature: 'empower', motif: 'one anger "!" per Rage pops over his head, 5 = a pepper crown' },
      q: { name: 'Yap Yap Yap', nature: 'sonic', motif: 'each yap is a pepper-shaped sound bubble' },
      w: { name: 'Tiny Zoomies', nature: 'mobility', motif: 'pepper afterimages' },
      e: { name: 'Purse Mode', nature: 'guard', motif: 'a pink handbag snaps shut; peppers puff out on exit' },
      r: { name: 'BIG DOG ENERGY', nature: 'empower', motif: 'he grows in a burst of peppers; splash hits flash "!"' },
    },
  }),
  howler: id({
    hero: 'howler',
    trait: 'Loud husky: echo rings and "AWOO" letters',
    motif: { shape: 'RING', sprite: 'white echo arc; "AWOO" word glyph' },
    colors: { primary: 0x6e7fa8, secondary: 0xe8fff4 },
    timbre: 'synth howl (sliding sine)',
    voice: {
      basic: { zzfx: [0.35, 0, 420, 0.01, 0.04, 0.06, 0, 1, 3, 0, 0, 0, 0, 0, 4, 0, 0, 0.75, 0.01, 0, 0] },
      ult: { reuse: 'howlerScream', zzfx: [0.7, 0, 900, 0.02, 0.6, 0.28, 2, 1.5, -3, 0, 0, 0, 0, 1.4, 0, 0.05, 0, 0.8, 0.05, 0.15, -3600] },
    },
    skills: {
      basic: { name: 'Bite', nature: 'slash', motif: 'one small echo arc on the bite' },
      passive: { name: 'Zoomie Brain', nature: 'empower', motif: 'the charged basic leaves a double echo' },
      q: { name: 'AWOO', nature: 'sonic', motif: 'echo arcs fill the cone with an "AWOO" word' },
      w: { name: 'Derp Dash', nature: 'mobility', motif: 'his tongue-out face echoes along the path' },
      e: { name: 'Talk Back', nature: 'guard', motif: 'grumble "woo-woo" bubbles; each fear pops an echo ring' },
      r: { name: 'THE SCREAM', nature: 'sonic', motif: 'the inhale sucks echo rings in, the scream blasts them out' },
    },
  }),
  rocket: id({
    hero: 'rocket',
    trait: 'Race greyhound: checkered flags and speed streaks',
    motif: { shape: 'CONFETTI', sprite: 'green-and-white checker flag square' },
    colors: { primary: 0x1e8f4e, secondary: 0xffffff },
    timbre: 'race whistle and start beeps',
    voice: {
      basic: { zzfx: [0.3, 0, 1760, 0, 0.03, 0.03, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, -4000] },
      ult: { zzfx: [0.5, 0, 880, 0, 0.3, 0.06, 5, 1, 0, 0, 0, 0, 0.12, 0, 0, 0, 0, 0.6, 0.02, 0.8, 0] },
    },
    skills: {
      basic: { name: 'Dart', nature: 'projectile', motif: 'a white streak with a checker spark' },
      passive: { name: 'Sighthound', nature: 'empower', motif: 'a long shot trails checker squares' },
      q: { name: 'Lure Shot', nature: 'projectile', motif: 'the lure wears a mini flag; the revealed hero gets a lap number' },
      w: { name: 'Photo Finish', nature: 'mobility', motif: 'a camera flash and a finish line under his feet' },
      e: { name: 'SQUIRREL!', nature: 'sonic', motif: 'a squeaky squirrel lands on a checker square' },
      r: { name: 'ZOOM… ZZZ', nature: 'mobility', motif: 'start beeps, then a checkered streak; the nap shows Zzz on a flag' },
    },
  }),
  frankie: id({
    hero: 'frankie',
    trait: 'Hot dog: ketchup and mustard squiggles',
    motif: { shape: 'DROPLET', sprite: 'ketchup-red and mustard-yellow zig-zag squiggle' },
    colors: { primary: 0xe8b020, secondary: 0xe8302a },
    timbre: 'slide whistle and cork pop',
    voice: {
      basic: { reuse: 'frankieYip', zzfx: [0.35, 0, 900, 0.003, 0.03, 0.06, 1, 1.5, -10, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.8, 0.02, 0, -2500] },
      ult: { reuse: 'frankieStretch', zzfx: [0.45, 0, 400, 0.02, 0.4, 0.15, 0, 1, 8, 0.3, 0, 0, 0, 0, 3, 0, 0, 0.85, 0.05, 0.1, 0] },
    },
    skills: {
      basic: { name: 'Weenie nip', nature: 'slash', motif: 'a mustard squiggle on the bite' },
      passive: { name: 'Ketchup and Mustard', nature: 'splash', motif: 'one squiggle of each colour crosses into an X on a Combo' },
      q: { name: 'Weenie Roll', nature: 'impact', motif: 'a ketchup-mustard spiral trail' },
      w: { name: 'Dig', nature: 'impact', motif: 'he pops up out of a squiggle of mustard' },
      e: { name: 'Bun Hop', nature: 'mobility', motif: 'bun crumbs and a mustard zig-zag' },
      r: { name: 'FOOTLONG!', nature: 'fire', motif: 'a sizzling sausage stretch striped with ketchup and mustard' },
    },
  }),
  domino: id({
    hero: 'domino',
    trait: 'Starry dalmatian: black spots joined by star lines',
    motif: { shape: 'SOFT', sprite: 'ink-black spot; thin star-dotted line' },
    colors: { primary: 0x1e1a2a, secondary: 0xd8c8ff },
    timbre: 'marimba boop (short sine)',
    voice: {
      basic: { reuse: 'dominoBoop', zzfx: [0.35, 0, 520, 0.005, 0.03, 0.08, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.02, 0, 0] },
      ult: { reuse: 'dominoDraw', zzfx: [0.45, 0, 700, 0.02, 0.25, 0.3, 4, 1, 3, 0, 600, 0.25, 0, 0.8, 0, 0, 0, 0.6, 0.05, 0, 2000] },
    },
    skills: {
      basic: { name: 'Ink blot', nature: 'splash', motif: 'a black spot splat' },
      passive: { name: 'Spot On', nature: 'arcane', motif: 'the Spots (1-3) stick on the cat with a star glint each' },
      q: { name: 'Spot Shot', nature: 'projectile', motif: 'a black spot with a star sparkle' },
      w: { name: 'Splatter', nature: 'splash', motif: 'a splash of spots' },
      e: { name: 'Big Shake', nature: 'impact', motif: 'spots shake off him in a ring' },
      r: { name: 'CONNECT THE DOTS!', nature: 'arcane', motif: 'star lines draw from spot to spot, nearest first' },
    },
  }),
});

/** Ability slot index (0..3 = q, w, e, r) to its key. */
const SLOT: readonly SkillKey[] = ['q', 'w', 'e', 'r'];

/** The nature of a hero's skill: slot 0..3 (Q/W/E/R), 'basic' or 'passive'. Pure. */
export function natureOf(hero: HeroId, skill: SkillKey | number): Nature {
  const key = typeof skill === 'number' ? SLOT[skill] : skill;
  return IDENTITY[hero].skills[key ?? 'basic'].nature;
}

/**
 * Mix rules: a 10-hero teamfight must stay readable and never fatigue. The player hears their own hero, the CC aimed
 * at them and every ultimate; everyone else is thinned.
 */
export const MIX = Object.freeze({
  /** Longest a sound may be, by layer (s). */
  maxSeconds: { cast: 0.3, impact: 0.35, travel: 0.45, basicVoice: 0.2, ultVoice: 1.0 },
  /** Base volume caps by layer (before distance and the host's sfx volume). */
  volCap: { cast: 0.5, impact: 0.5, travel: 0.2, motif: 0.3, basicVoice: 0.4, ultVoice: 0.75 },
  /** The same sound (name) again within this many ms is dropped (Sfx.play already does 40 ms for every sound). */
  sameSoundMs: { cast: 60, impact: 50, travel: 120, basicVoice: 120, ultVoice: 400 },
  /** Most voices at once: all, per nature, per hero. A new one over a cap steals the oldest of lower priority. */
  maxVoices: 14,
  maxPerNature: 3,
  maxPerHero: 2,
  /** Most travel loops at once (closest projectiles win). */
  travelMax: 4,
  /** Priority (high wins the voice steal): the player's ult, any ult, CC aimed at the player, the player's hero, enemies, allies, minions. */
  priority: { myUlt: 7, ult: 6, ccAtMe: 5, mine: 4, enemy: 3, ally: 2, minion: 1 },
  /** Relation gain: allies sit back, enemies are full, the player's own hero a little forward. */
  relationGain: { mine: 1.1, enemy: 1, ally: 0.7 },
  /** Other heroes' basic-attack voices: only within this distance (m), and only every Nth basic. */
  basicVoiceRange: 10,
  basicVoiceEvery: 3,
  /** When this many voices play, every new one is scaled by duckGain (a soft bus limiter). */
  duckAt: 8,
  duckGain: 0.6,
});
