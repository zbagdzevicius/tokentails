/**
 * Skill sounds by nature and champion (docs/plans/moba/CHAMP-IDENTITY.md §1, §2, §4, §5): one call per skill phase
 * plays the NATURE layer (what the skill does: fire crackles, frost crunches) and the CHAMPION layer (whose it is: the
 * motif ping in the hero's timbre on Q/W/E, the ult voice on R, the thinned basic voice on basics), through the mix
 * rules in audio/identityMix.ts. Per-hero overrides live in audio/champ/<hero>.ts. Render only; never feeds the sim.
 *
 * Baked names: `n:<nature>:cast|impact|travel`, `v:<hero>:basic|ult` (aliases of existing PL_SFX voices where the
 * identity reuses one), `c:<hero>:motif` and `c:<hero>:<sound>` for a champion's own sounds.
 */
import type { HeroId } from '../data/heroes/types';
import { HERO_IDS } from '../data/heroes';
import { IDENTITY, MIX, NATURE, NATURES, type Nature, type SkillKey, type Zzfx } from '../data/identity';
import { CHAMP_AUDIO } from './champ';
import type { SkillPhase, SkillSound } from './champ/types';
import { mixPriority, type MixLayer, type MixRelation } from './identityMix';
import { PL_SFX, sfx } from './sfx';

export type { SkillPhase } from './champ/types';

/** Ability slot 0..3 → its key. */
export const SLOT_KEYS: readonly SkillKey[] = Object.freeze(['q', 'w', 'e', 'r'] as SkillKey[]);

/** A skill as a key, or an ability slot 0..3 (anything else reads as the basic). */
export function skillKey(skill: SkillKey | number): SkillKey {
  return typeof skill === 'number' ? (SLOT_KEYS[skill] ?? 'basic') : skill;
}

export const natureSound = (n: Nature, phase: SkillPhase): string => `n:${n}:${phase}`;
export const voiceSound = (h: HeroId, which: 'basic' | 'ult'): string => `v:${h}:${which}`;
export const champSound = (h: HeroId, name: string): string => `c:${h}:${name}`;

/** Every identity sound to bake, and the aliases onto existing PL_SFX voices. Pure. */
export function identityDefs(): { defs: Record<string, Zzfx>; aliases: Record<string, string> } {
  const defs: Record<string, Zzfx> = {};
  const aliases: Record<string, string> = {};
  for (const n of NATURES) {
    const r = NATURE[n];
    defs[natureSound(n, 'cast')] = r.cast;
    defs[natureSound(n, 'impact')] = r.impact;
    if (r.travel) defs[natureSound(n, 'travel')] = r.travel;
  }
  for (const h of HERO_IDS) {
    for (const w of ['basic', 'ult'] as const) {
      const v = IDENTITY[h].voice[w];
      if (v.reuse && v.reuse in PL_SFX) aliases[voiceSound(h, w)] = v.reuse;
      else defs[voiceSound(h, w)] = v.zzfx;
    }
    const c = CHAMP_AUDIO[h];
    if (c.motif) defs[champSound(h, 'motif')] = c.motif;
    for (const [k, z] of Object.entries(c.sounds ?? {})) defs[champSound(h, k)] = z;
  }
  return { defs, aliases };
}

/** One sound a skill phase plays. */
export interface PlannedSound {
  name: string;
  layer: MixLayer;
  nature: Nature;
  rate: number;
  /** Wanted level (zzfx volume), undefined = as baked. */
  vol?: number;
}

/** The sound a champion override names: its own `sounds` key, else an existing sound name. */
function overrideName(h: HeroId, s: SkillSound): string {
  return CHAMP_AUDIO[h].sounds?.[s.sound] ? champSound(h, s.sound) : s.sound;
}

const LAYER_OF: Readonly<Record<SkillPhase, MixLayer>> = Object.freeze({ cast: 'cast', impact: 'impact', travel: 'travel' });

/**
 * What a skill phase plays (pure): the nature layer unless the champion replaces or mutes it, then the champion
 * layer (an override sound, else the motif ping on Q/W/E/passive casts, the ult voice on R casts, the basic voice on
 * basic impacts when `basicVoice`).
 */
export function planSkillSfx(hero: HeroId, skill: SkillKey | number, phase: SkillPhase, basicVoice = false): PlannedSound[] {
  const key = skillKey(skill);
  const nature = IDENTITY[hero].skills[key].nature;
  const champ = CHAMP_AUDIO[hero];
  const ov = champ.skills?.[key]?.[phase];
  const out: PlannedSound[] = [];
  const layer = LAYER_OF[phase];
  const natureOk = phase !== 'travel' || NATURE[nature].travel !== null;
  if (ov !== false && !(ov && ov.replace) && natureOk) out.push({ name: natureSound(nature, phase), layer, nature, rate: 1 });
  if (ov) {
    out.push({ name: overrideName(hero, ov), layer: ov.replace ? layer : 'motif', nature, rate: ov.rate ?? 1, vol: ov.vol });
    if (ov.replace) return out;
  }
  if (phase === 'cast') {
    if (key === 'r') out.push({ name: voiceSound(hero, 'ult'), layer: 'ultVoice', nature, rate: 1 });
    else if (champ.motif && !ov) out.push({ name: champSound(hero, 'motif'), layer: 'motif', nature, rate: champ.motifRate?.[key] ?? 1, vol: MIX.volCap.motif });
  } else if (phase === 'impact' && key === 'basic' && basicVoice) {
    out.push({ name: voiceSound(hero, 'basic'), layer: 'basicVoice', nature, rate: 1 });
  }
  return out;
}

/** Other heroes' basic voices: only within MIX.basicVoiceRange m and on every MIX.basicVoiceEvery-th basic. Pure. */
export function basicVoiceAllowed(relation: MixRelation, distance: number, count: number): boolean {
  if (relation === 'mine') return true;
  return distance <= MIX.basicVoiceRange && count % MIX.basicVoiceEvery === 0;
}

export interface SkillSfxCtx {
  /** World position (m) for falloff and pan. */
  at?: { x: number; z: number };
  relation: MixRelation;
  /** The cast aims at the player (CC priority). */
  ccAtMe?: boolean;
  /** Caster entity id (basic-voice thinning counts per caster). */
  src?: number;
  /** Playback-rate multiplier on every layer. */
  rate?: number;
}

let registered = false;
/** Hand the identity sounds to the Sfx bake (once; idempotent). */
export function registerIdentitySfx(): void {
  if (registered) return;
  registered = true;
  const { defs, aliases } = identityDefs();
  sfx.registerDefs(defs, aliases);
}

const basics = new Map<number, number>();

/**
 * Play a hero's skill phase: nature layer + champion layer through the identity mix. `skill` is a key or an ability
 * slot 0..3; `phase` cast (on the cast frame), impact (each hit, landing, block, heal) or travel (under a projectile).
 */
export function playSkillSfx(hero: HeroId, skill: SkillKey | number, phase: SkillPhase, ctx: SkillSfxCtx): void {
  registerIdentitySfx();
  const key = skillKey(skill);
  let voice = false;
  if (phase === 'impact' && key === 'basic') {
    const n = ctx.src === undefined ? 0 : (basics.get(ctx.src) ?? -1) + 1;
    if (ctx.src !== undefined) basics.set(ctx.src, n);
    const d = ctx.at ? Math.hypot(ctx.at.x - sfx.ear.x, ctx.at.z - sfx.ear.z) : 0;
    voice = basicVoiceAllowed(ctx.relation, d, n);
  }
  const ult = phase === 'cast' && key === 'r';
  const priority = mixPriority({ relation: ctx.relation, ult, ccAtMe: ctx.ccAtMe });
  for (const p of planSkillSfx(hero, key, phase, voice)) {
    sfx.playLayer({ name: p.name, layer: p.layer, hero, nature: p.nature, priority, relation: ctx.relation, vol: p.vol, rate: p.rate * (ctx.rate ?? 1), at: ctx.at });
  }
}

/** Tests / leaving a match: forget the basic-voice counters. */
export function resetSkillSfx(): void {
  basics.clear();
}

// The identity sounds join the bake as soon as anything plays a skill (before the unlock when imported early).
registerIdentitySfx();
