/**
 * Spell sounds (founder ask, Nov 18: "spells (like flash) lack in-game sound"): the Paw Tricks (the summoner spells:
 * Pounce is the Flash, Snack the heal, Hiss the fear, Purr-ify the cleanse) and the Nap (recall) each get their own
 * short procedural sounds instead of a borrowed generic one. Hero Q/W/E/R keep the champion identity layers
 * (audio/skillSfx.ts). Render only; never feeds the sim.
 *
 * Every play goes through the identity mix (Sfx.playLayer, audio/identityMix.ts): the sfx bus and its volume, the
 * same-sound window, the voice caps with stealing (a teamfight of Pounces never stacks into a wall), the relation gain
 * (the player's own a little forward, allies back) and the distance falloff and pan. An enemy that is not seen makes
 * no sound (`spellAudible`): the sim already drops events from hidden units (sim/index.ts eventFor), and the render
 * checks again against the current snapshot, so a sound never gives away a hero in brush, fog or stealth.
 *
 * Baked names `sp:<sound>`.
 */
import type { HeroId } from '../data/heroes/types';
import { TRICKS, TRICK_IDS, type TrickId } from '../data/tricks';
import { heroSwingRate } from './hitMix';
import { mixPriority, type MixRelation } from './identityMix';
import { sfx } from './sfx';

// zzfx 1.4 order: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//   pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
/** The spell sound library (synth only, no recordings; each ≤ 0.5 s). */
export const SPELL_DEFS = Object.freeze({
  /** Pounce leaves: an airy rising whoosh (high-passed noise sweeping up). */
  blinkOut: [0.5, 0, 420, 0.008, 0.04, 0.12, 4, 1, 18, 0, 0, 0, 0, 1.4, 0, 0, 0, 0.6, 0.02, 0, 1800],
  /** Pounce lands: a bright sparkle (a fast up-arpeggio with a short echo). */
  blinkIn: [0.45, 0, 1400, 0.002, 0.05, 0.16, 0, 1, 0, 0, 700, 0.04, 0.05, 0, 0, 0, 0.03, 0.7, 0.01, 0.3, 0],
  /** Snack: a quick crunch (gritty noise bursts). */
  snackCrunch: [0.55, 0, 600, 0.002, 0.03, 0.06, 4, 1, -3, 0, 0, 0, 0.035, 2, 0, 0.2, 0, 0.6, 0.02, 0.4, 1200],
  /** Snack: the heal chime (a warm two-note rise). */
  healChime: [0.45, 0, 660, 0.01, 0.1, 0.22, 0, 1, 0, 0, 330, 0.08, 0, 0, 0, 0, 0.05, 0.8, 0.03, 0, 0],
  /** Hiss: a cat's hiss (bright noise, falling a little). */
  hiss: [0.4, 0, 2600, 0.02, 0.16, 0.12, 4, 1, -2, 0, 0, 0, 0, 3, 0, 0, 0, 0.7, 0.03, 0.15, 3000],
  /** Hiss: the fear ring's low whump. */
  fearThud: [0.7, 0, 90, 0.004, 0.06, 0.2, 0, 1.6, -2, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.6, 0.03, 0, -900],
  /** Purr-ify: a rising shimmer (the crowd control shaken off). */
  cleanse: [0.4, 0, 520, 0.01, 0.12, 0.2, 1, 1, 2, 0, 260, 0.05, 0.06, 0, 0, 0, 0.04, 0.75, 0.02, 0.2, 0],
  /** Purr-ify: the immunity's shield hum (a purring low tone). */
  shieldHum: [0.35, 0, 180, 0.03, 0.16, 0.14, 1, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0.8, 0.04, 0.5, -1400],
  /** Nap starts: a soft two-note lullaby falling. */
  napStart: [0.4, 0, 784, 0.03, 0.12, 0.22, 0, 1, 0, 0, -196, 0.12, 0, 0, 0, 0, 0.05, 0.7, 0.04, 0.2, 0],
  /** Nap broken (moved, hit, crowd-controlled): a soft deflating pfft. */
  napCancel: [0.45, 0, 320, 0.008, 0.03, 0.09, 4, 1, -1, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.6, 0.02, 0, -1300],
} satisfies Record<string, number[]>);

export type SpellSound = keyof typeof SPELL_DEFS;
export const spellSound = (s: SpellSound): string => `sp:${s}`;

/** Everything that plays a spell sound: the four Paw Tricks and the Nap. */
export type SpellId = TrickId | 'nap';
export const SPELL_IDS: readonly SpellId[] = Object.freeze([...TRICK_IDS, 'nap'] as SpellId[]);

/** Where a layer plays: at the caster, or where the spell lands (Pounce's landing spot). */
export type SpellWhere = 'src' | 'dest';
export interface SpellLayer {
  sound: SpellSound;
  where: SpellWhere;
  /** Wanted level (zzfx volume) before the cast layer cap and the relation gain. */
  vol: number;
}
export type SpellPhase = 'cast' | 'cancel';

/** What each spell plays on its cast (and the Nap when broken). */
export const SPELL_SFX: Readonly<Record<SpellId, Readonly<Partial<Record<SpellPhase, readonly SpellLayer[]>>>>> = Object.freeze({
  pounce: { cast: [{ sound: 'blinkOut', where: 'src', vol: 0.55 }, { sound: 'blinkIn', where: 'dest', vol: 0.45 }] },
  snack: { cast: [{ sound: 'snackCrunch', where: 'src', vol: 0.5 }, { sound: 'healChime', where: 'src', vol: 0.45 }] },
  hiss: { cast: [{ sound: 'hiss', where: 'src', vol: 0.5 }, { sound: 'fearThud', where: 'src', vol: 0.5 }] },
  purrify: { cast: [{ sound: 'cleanse', where: 'src', vol: 0.45 }, { sound: 'shieldHum', where: 'src', vol: 0.35 }] },
  nap: { cast: [{ sound: 'napStart', where: 'src', vol: 0.4 }], cancel: [{ sound: 'napCancel', where: 'src', vol: 0.4 }] },
});

/** A spell's layers for a phase (empty when it has none). Pure. */
export function planSpellSfx(id: SpellId, phase: SpellPhase = 'cast'): readonly SpellLayer[] {
  return SPELL_SFX[id]?.[phase] ?? [];
}

/**
 * May this spell be heard? The player's own always; anyone else's only while the player's team sees the caster
 * (`visible` false = hidden in brush, fog or stealth: silent, so a sound never leaks a position). Pure.
 */
export function spellAudible(relation: MixRelation, visible: boolean | undefined): boolean {
  return relation === 'mine' || visible !== false;
}

/** Pounce's landing spot (m, render coords): toward the aim point, at most the blink range. Pure. */
export function pounceLanding(from: { x: number; z: number }, aim: { x: number; z: number }): { x: number; z: number } {
  const dx = aim.x - from.x;
  const dz = aim.z - from.z;
  const d = Math.hypot(dx, dz);
  const max = TRICKS.pounce.blink / 1000;
  if (d <= max || d < 1e-6) return { x: aim.x, z: aim.z };
  return { x: from.x + (dx / d) * max, z: from.z + (dz / d) * max };
}

export interface SpellSfxCtx {
  /** The caster (m, render coords). */
  at: { x: number; z: number };
  /** Where the spell lands (Pounce), else the caster. */
  dest?: { x: number; z: number };
  relation: MixRelation;
  /** The caster is in the current snapshot (seen now); false = hidden from the player's team. */
  visible?: boolean;
  /** The caster's hero (a per-hero pitch, the per-hero voice cap). */
  hero?: HeroId;
}

let registered = false;
/** Hand the spell sounds to the Sfx bake (once; idempotent). */
export function registerSpellSfx(): void {
  if (registered) return;
  registered = true;
  const defs: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(SPELL_DEFS)) defs[spellSound(k as SpellSound)] = v;
  sfx.registerDefs(defs);
}

/** Layers started so far (tests, the listening page). */
export const spellPlays: string[] = [];

/**
 * Play a spell phase through the identity mix: each layer at the caster (or the landing spot), the player's own
 * unpanned and a little forward, others' by distance; nothing for a caster the player's team does not see. Returns how
 * many layers started.
 */
export function playSpellSfx(id: SpellId, phase: SpellPhase, ctx: SpellSfxCtx): number {
  registerSpellSfx();
  if (!spellAudible(ctx.relation, ctx.visible)) return 0;
  const mine = ctx.relation === 'mine';
  const rate = ctx.hero ? heroSwingRate(ctx.hero) : 1;
  const priority = mixPriority({ relation: ctx.relation });
  let n = 0;
  for (const l of planSpellSfx(id, phase)) {
    const name = spellSound(l.sound);
    // the player's own: the caster layer centred (the camera follows them), the landing panned toward its side
    const pos = l.where === 'dest' ? (ctx.dest ?? ctx.at) : ctx.at;
    const at = mine && l.where === 'src' ? undefined : pos;
    const ok = sfx.playLayer({ name, layer: 'cast', hero: ctx.hero, nature: `spell:${id}`, priority, relation: ctx.relation, vol: l.vol, rate, at });
    if (ok) {
      n++;
      spellPlays.push(name);
      if (spellPlays.length > 40) spellPlays.shift();
    }
  }
  return n;
}

// the spell sounds join the bake as soon as this module loads (before the unlock when imported early)
registerSpellSfx();
