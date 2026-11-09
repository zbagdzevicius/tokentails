/**
 * One champion's own sound and motif layer (docs/plans/moba/CHAMP-IDENTITY.md §2, §5). Each hero has its own file
 * (audio/champ/<hero>.ts) registered in audio/champ/index.ts, so per-hero work never shares a file. Data only, plus an
 * optional motif painter typed structurally (no three.js import here). Render and audio read it; the sim never does.
 *
 * What the framework does with it:
 *  - every Q/W/E cast: the nature cast layer (data/identity.ts NATURE) + this `motif` ping in the hero's timbre;
 *  - R: the nature cast layer + the hero's ult voice (IDENTITY[hero].voice.ult);
 *  - each hit: the nature impact layer; basics also the (thinned) basic voice;
 *  - VFX: the nature effect (render/fx/natureFx.ts) + the motif particles in the hero's colour pair.
 * `skills` overrides any of those per skill and phase.
 */
import type { HeroId } from '../../data/heroes/types';
import type { SkillKey, Zzfx } from '../../render/identity';

export type SkillPhase = 'cast' | 'impact' | 'travel';

/** A sound for one skill phase: a key of this hero's `sounds`, or an existing PL_SFX / PPK name. */
export interface SkillSound {
  sound: string;
  rate?: number;
  /** Wanted volume (still capped by the layer's MIX.volCap). */
  vol?: number;
  /** true: play instead of the nature layer; false/absent: on top of it (as the champion layer). */
  replace?: boolean;
}

/** Per-skill override: a sound per phase, or `false` to mute that phase's nature layer (the hero's script plays its own). */
export type SkillSoundOverride = Partial<Record<SkillPhase, SkillSound | false>>;

/** A position (m) and an optional flat direction. */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** The particle calls a motif painter may use (render/fx/Particles.js burst / single / ring options). */
export interface MotifPainter {
  burst(pos: P3, o: Record<string, unknown>): void;
  single(pos: P3, o: Record<string, unknown>): void;
  ring(pos: P3, o: Record<string, unknown>): void;
  /** Particles.js SHAPE ids by name. */
  readonly shape: Readonly<Record<string, number>>;
  /** The hero's colour pair. */
  readonly colors: { primary: number; secondary: number };
}

export interface ChampFx {
  /** Motif particles per cast (default 6; the quality budget scales it). */
  motifCount?: number;
  /** Add a small motif burst on casts the hero's own skill FX script draws (default true). */
  ownedMotif?: boolean;
  /**
   * Draw the motif yourself (a new sprite, a crest stamp...): `n` is the budgeted particle count. Return true when
   * drawn; false falls back to the default IDENTITY motif shape in the colour pair.
   */
  paint?(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean;
}

export interface ChampAudio {
  hero: HeroId;
  /** Signature ping in the hero's timbre (≤ 0.3 s), layered on every non-ult skill cast at the motif cap. Null: none. */
  motif: Zzfx | null;
  /** The motif ping's playback rate per skill (a little melody: Q, W, E). */
  motifRate?: Partial<Record<SkillKey, number>>;
  /** Extra sounds, baked as `c:<hero>:<name>` and named in `skills` by their key. */
  sounds?: Readonly<Record<string, Zzfx>>;
  skills?: Partial<Record<SkillKey, SkillSoundOverride>>;
  fx?: ChampFx;
}
