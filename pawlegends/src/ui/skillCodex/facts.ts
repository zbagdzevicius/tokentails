/**
 * Skill codex building blocks (the pick screen's skill preview): the types, and the fact builders that turn a sim
 * number into a labelled line ("Stun", "0.5 s"). Every number is read from `kitNumbers` (src/data through the sim's own
 * rank and talent table) when the card is built, so the words never hold a copy that can drift from the data.
 *
 * The per-hero words (what a skill does, its tags, a tip and a counter) live in ./cats.ts and ./dogs.ts; ../skillCodex.ts
 * puts them together. This file imports neither, so the word files can import these builders without a cycle.
 */
import type { HeroId } from '../../sim/api';
import { HEROES, type AbilitySlot, type HeroBase } from '../../data/heroes';
import type { KitNumbers } from '../../sim/heroes/talents';
import { metres, sec } from '../heroText';

/** The six cards of a hero, in the order the preview pages through them. */
export type SkillSlot = 'passive' | 'basic' | AbilitySlot;
export const SKILL_SLOTS: readonly SkillSlot[] = Object.freeze(['passive', 'basic', 'q', 'w', 'e', 'r'] as SkillSlot[]);

/** Where a number comes from: the passive or an ability slot of `kitNumbers`. */
export type NumSlot = 'passive' | AbilitySlot;

/**
 * What a skill is, for the chips under its name. Effects (damage, the crowd control, heal, shield, mobility, speed,
 * wind-up) are added from the data by ../skillCodex.ts; the shape and targeting tags are written per skill.
 */
export type SkillTag =
  // effect
  | 'damage' | 'heal' | 'shield' | 'tough' | 'speed' | 'mobility' | 'stealth' | 'reveal' | 'untargetable' | 'cc-immune' | 'cleanse'
  // crowd control (stun, root, fear, charm, knockback and pull count toward Steadfast; slow does not)
  | 'stun' | 'root' | 'fear' | 'charm' | 'knockback' | 'pull' | 'slow'
  // shape and targeting
  | 'skillshot' | 'targeted' | 'auto-target' | 'area' | 'cone' | 'line' | 'zone' | 'self' | 'ally' | 'channel' | 'recast' | 'windup' | 'on-hit';

/** Chip words per tag (short, for a phone). */
export const TAG_TEXT: Readonly<Record<SkillTag, string>> = Object.freeze({
  damage: 'Damage',
  heal: 'Heal',
  shield: 'Shield',
  tough: 'Damage cut',
  speed: 'Speed up',
  mobility: 'Dash',
  stealth: 'Stealth',
  reveal: 'Reveal',
  untargetable: 'Untargetable',
  'cc-immune': 'CC immune',
  cleanse: 'Cleanse',
  stun: 'Stun',
  root: 'Root',
  fear: 'Fear',
  charm: 'Charm',
  knockback: 'Knockback',
  pull: 'Pull',
  slow: 'Slow',
  skillshot: 'Skill shot',
  targeted: 'Targeted',
  'auto-target': 'Auto-target',
  area: 'Area',
  cone: 'Cone',
  line: 'Line',
  zone: 'Zone',
  self: 'Self',
  ally: 'Ally',
  channel: 'Channel',
  recast: 'Recast',
  windup: 'Telegraphed',
  'on-hit': 'On hit',
});

/** Hard crowd control: what the Steadfast cap counts (data/effects.ts CC_DR; slows are not counted). */
export const HARD_CC_TAGS: readonly SkillTag[] = Object.freeze(['stun', 'root', 'fear', 'charm', 'knockback', 'pull'] as SkillTag[]);

/** One labelled number of a card: "Damage" · "70 (+6/lvl, +18 a rank)". */
export interface SkillFact {
  label: string;
  value: string;
  /** The data keys it reads (`slot.key`, e.g. "q.dmg", "passive.bonusBp"; "base.range" for the basic attack). */
  keys: readonly string[];
  /** The main number as the sim stores it (ticks, mm, bp, angle steps), before the per-level growth; NaN = missing. */
  raw: number;
  /** A detail most players can skip (travel speed, width): a small screen may leave it out. */
  minor?: boolean;
}

/** What a fact builder reads. */
export interface FactCtx {
  hero: HeroId;
  /** The level asked for, or undefined on the pick screen (level-1 numbers with their growth shown). */
  level: number | undefined;
  /** `level` or 1. */
  lv: number;
  kit: KitNumbers;
  base: HeroBase;
  /** Number `key` of `slot` as the sim uses it at this level (ranks and talents in), or NaN when the data has none. */
  n(slot: NumSlot, key: string): number;
}

export type FactFn = (c: FactCtx) => SkillFact | null;
/** A card line that may read the numbers ("Walk out of the 3 m cone"). */
export type Line = string | ((c: FactCtx) => string);

/** The words of one skill, per hero (./cats.ts, ./dogs.ts). */
export interface SkillWords {
  /** One line, what it does. Abilities and the passive default to ui/heroText.ts; the basic attack must set it. */
  what?: Line;
  /** Shape and targeting tags (the effect tags come from the data). */
  tags: SkillTag[];
  /** How to use it. */
  tip: Line;
  /** How to play against it (v17 counter-play: telegraphs, Steadfast, Purr-ify, the outplay tools). */
  counter: Line;
  /** Facts the generic list does not cover (bespoke numbers), shown after it. */
  facts?: FactFn[];
  /** Data keys of this ability the generic list should leave out (a custom fact says them better). */
  skip?: string[];
  /** Label overrides for generic facts, by data key ("dmg" → "Damage per arrow"). */
  labels?: Readonly<Record<string, string>>;
}

export interface HeroWords {
  passive: SkillWords;
  basic: SkillWords;
  q: SkillWords;
  w: SkillWords;
  e: SkillWords;
  r: SkillWords;
}

// ---- formatting --------------------------------------------------------------------------------------------------

/** Basis points as a percent ("25%"), one decimal at most. */
export const pct = (bp: number): string => `${Math.round(bp) / 100}%`;
/** A multiplier in basis points as a bonus ("12000" → "+20%"). */
export const bonus = (bp: number): string => `${bp >= 10000 ? '+' : '−'}${pct(Math.abs(bp - 10000))}`;
/** An angle in 1/4096 turns as degrees. */
export const degrees = (steps: number): string => `${Math.round((steps * 360) / 4096)}°`;
/** mm/s as m/s. */
export const mps = (v: number): string => `${Math.round(v / 100) / 10} m/s`;
export { metres, sec };

/** Rank deltas of ability `slot` (data/heroes `ranks`), or undefined for the passive. */
function rankDelta(hero: HeroId, slot: NumSlot, key: string): number | undefined {
  if (slot === 'passive') return undefined;
  return HEROES[hero].ranks[slot]?.[key];
}

/**
 * A number with its growth: on the pick screen "70 (+6/lvl, +18 a rank)", at a level the value the sim deals then
 * (the rank is already in `kitNumbers`; the per-level part is added as combat/abilities do).
 */
export function grown(c: FactCtx, slot: NumSlot, key: string, v: number, unit = ''): string {
  const per = c.n(slot, `${key}PerLevel`);
  const perLv = Number.isFinite(per) ? per : 0;
  if (c.level === undefined) {
    const rk = rankDelta(c.hero, slot, key);
    const grow = [perLv ? `+${perLv}/lvl` : '', rk ? `${rk > 0 ? '+' : '−'}${Math.abs(rk)} a rank` : ''].filter(Boolean).join(', ');
    return `${v}${unit}${grow ? ` (${grow})` : ''}`;
  }
  return `${v + perLv * (c.lv - 1)}${unit}`;
}

function fact(label: string, value: string, keys: string[], raw: number, minor?: boolean): SkillFact {
  return minor ? { label, value, keys, raw, minor } : { label, value, keys, raw };
}

/** A fact of one number; a missing number reads "?" with a NaN raw (the codex test catches it). */
function one(label: string, s: NumSlot, key: string, fmt: (v: number, c: FactCtx) => string, minor?: boolean): FactFn {
  return (c) => {
    const v = c.n(s, key);
    return fact(label, Number.isFinite(v) ? fmt(v, c) : '?', [`${s}.${key}`], v, minor);
  };
}

/** Fact builders for the word files and the generic list. Each reads the number when the card is built. */
export const F = Object.freeze({
  /** Ticks as seconds. */
  sec: (label: string, s: NumSlot, key: string, tail = '', minor?: boolean): FactFn => one(label, s, key, (v) => `${sec(v)}${tail}`, minor),
  /** mm as metres. */
  m: (label: string, s: NumSlot, key: string, tail = '', minor?: boolean): FactFn => one(label, s, key, (v) => `${metres(v)}${tail}`, minor),
  deg: (label: string, s: NumSlot, key: string): FactFn => one(label, s, key, (v) => degrees(v)),
  mps: (label: string, s: NumSlot, key: string, minor?: boolean): FactFn => one(label, s, key, (v) => mps(v), minor),
  /** Basis points as a share ("25%"), with an optional tail ("of max HP"). */
  pct: (label: string, s: NumSlot, key: string, tail = '', minor?: boolean): FactFn => one(label, s, key, (v) => `${pct(v)}${tail}`, minor),
  /** A multiplier in basis points ("+20%"). */
  bonus: (label: string, s: NumSlot, key: string, tail = ''): FactFn => one(label, s, key, (v) => `${bonus(v)}${tail}`),
  /** A cut in basis points ("−40%"). */
  less: (label: string, s: NumSlot, key: string): FactFn => one(label, s, key, (v) => `−${pct(v)}`),
  /** A plain count ("3"), with an optional unit. */
  n: (label: string, s: NumSlot, key: string, unit = ''): FactFn => one(label, s, key, (v) => `${v}${unit}`),
  /** A number with its per-level and per-rank growth. */
  grow: (label: string, s: NumSlot, key: string, unit = ''): FactFn => (c) => {
    const v = c.n(s, key);
    const f = fact(label, Number.isFinite(v) ? grown(c, s, key, v, unit) : '?', [`${s}.${key}`], v);
    return Number.isFinite(c.n(s, `${key}PerLevel`)) ? { ...f, keys: [...f.keys, `${s}.${key}PerLevel`] } : f;
  },
  /** Any formatting of one number; `also` names the other keys of the same slot the words read. */
  fmt: (label: string, s: NumSlot, key: string, fmt: (v: number, c: FactCtx) => string, also: readonly string[] = []): FactFn => (c) => {
    const f = one(label, s, key, fmt)(c) as SkillFact;
    return also.length ? { ...f, keys: [...f.keys, ...also.map((k) => `${s}.${k}`)] } : f;
  },
  /** A slow: "25% for 1.5 s" (nothing when the share is 0, as Derp Dash before its talent). */
  slow: (label: string, s: NumSlot, bpKey = 'slowBp', tKey = 'slow'): FactFn => (c) => {
    const bp = c.n(s, bpKey);
    if (bp === 0) return null;
    const t = c.n(s, tKey);
    const v = Number.isFinite(bp) ? `${pct(bp)}${Number.isFinite(t) && t > 0 ? ` for ${sec(t)}` : ''}` : '?';
    return fact(label, v, [`${s}.${bpKey}`, `${s}.${tKey}`], bp);
  },
  /** A speed-up: "+20% for 1 s" ("+35%" when it lasts the whole skill). */
  haste: (label: string, s: NumSlot, bpKey = 'hasteBp', tKey = 'haste'): FactFn => (c) => {
    const bp = c.n(s, bpKey);
    if (bp === 0) return null;
    const t = c.n(s, tKey);
    const v = Number.isFinite(bp) ? `+${pct(bp)}${Number.isFinite(t) && t > 0 ? ` for ${sec(t)}` : ''}` : '?';
    return fact(label, v, [`${s}.${bpKey}`, `${s}.${tKey}`], bp);
  },
  /** A fact that is words only (no number of its own). */
  text: (label: string, value: Line): FactFn => (c) => fact(label, typeof value === 'function' ? value(c) : value, [], 0),
});

/**
 * The generic fact list of an ability, in the order a card shows it: one builder per data key. A key not listed here
 * (an engine detail such as `pickRadius`) shows only through a word file's own fact, or not at all if it is in
 * `ENGINE_KEYS`; the codex test fails on a number that is neither.
 */
export const AUTO: readonly (readonly [string, (s: AbilitySlot) => FactFn])[] = Object.freeze([
  ['cooldown', (s) => (c) => {
    const v = c.n(s, 'cooldown');
    const rk = rankDelta(c.hero, s, 'cooldown');
    const grow = c.level === undefined && rk ? ` (${rk < 0 ? '−' : '+'}${sec(Math.abs(rk))} a rank)` : '';
    return fact('Cooldown', `${sec(v)}${grow}`, [`${s}.cooldown`], v);
  }],
  ['windup', (s) => F.sec('Wind-up', s, 'windup')],
  ['range', (s) => F.m('Range', s, 'range')],
  ['dash', (s) => F.m('Dash', s, 'dash')],
  ['blink', (s) => F.m('Blink', s, 'blink')],
  ['leap', (s) => F.m('Leap', s, 'leap')],
  ['radius', (s) => F.m('Radius', s, 'radius')],
  ['ringRadius', (s) => F.m('Ring radius', s, 'ringRadius')],
  ['arc', (s) => F.deg('Cone', s, 'arc')],
  ['dmg', (s) => F.grow('Damage', s, 'dmg')],
  ['waveDmg', (s) => F.grow('Wave damage', s, 'waveDmg')],
  ['heal', (s) => F.grow('Heal', s, 'heal')],
  ['shield', (s) => F.grow('Shield', s, 'shield')],
  ['shieldBp', (s) => F.pct('Shield', s, 'shieldBp', ' of max HP')],
  ['healBp', (s) => F.pct('Heal', s, 'healBp', ' of max HP')],
  ['stun', (s) => F.sec('Stun', s, 'stun')],
  ['root', (s) => F.sec('Root', s, 'root')],
  ['freeze', (s) => F.sec('Freeze (root)', s, 'freeze')],
  ['fear', (s) => F.sec('Fear', s, 'fear')],
  ['lure', (s) => F.sec('Lure', s, 'lure')],
  ['charm', (s) => F.sec('Charm', s, 'charm')],
  ['knockback', (s) => F.m('Knockback', s, 'knockback')],
  ['push', (s) => F.m('Knockback', s, 'push')],
  ['pull', (s) => F.m('Pull', s, 'pull')],
  ['slowBp', (s) => F.slow('Slow', s)],
  ['reduceBp', (s) => F.less('Damage taken', s, 'reduceBp')],
  ['hasteBp', (s) => F.haste('Move speed', s)],
  ['speedBp', (s) => F.haste('Move speed', s, 'speedBp')],
  ['attackSpeedBp', (s) => F.fmt('Attack speed', s, 'attackSpeedBp', (v) => `+${pct(v)}`)],
  ['bonusBp', (s) => F.bonus('Damage', s, 'bonusBp')],
  ['duration', (s) => F.sec('Lasts', s, 'duration')],
  ['ttl', (s) => F.sec('Lasts', s, 'ttl')],
  ['immune', (s) => F.sec('CC immune', s, 'immune')],
  ['reveal', (s) => F.sec('Reveals for', s, 'reveal')],
  ['untargetable', (s) => F.sec('Untargetable', s, 'untargetable')],
  ['recasts', (s) => F.n('Recasts', s, 'recasts')],
  ['recastWindow', (s) => F.sec('Recast within', s, 'recastWindow')],
  ['count', (s) => F.n('Shots', s, 'count')],
  ['arrows', (s) => F.n('Arrows', s, 'arrows')],
  ['arm', (s) => F.sec('Arms after', s, 'arm')],
  ['every', (s) => F.sec('Pulses every', s, 'every', '', true)],
  ['splash', (s) => F.m('Splash radius', s, 'splash')],
  ['splashBp', (s) => F.pct('Splash damage', s, 'splashBp')],
  ['splashMax', (s) => F.n('Splash targets', s, 'splashMax')],
  ['missingHpBp', (s) => F.pct('Bonus damage', s, 'missingHpBp', ' of missing HP')],
  ['minionBp', (s) => F.pct('Minions take', s, 'minionBp', '', true)],
  ['width', (s) => F.m('Width', s, 'width', '', true)],
  ['speed', (s) => F.mps('Travel speed', s, 'speed', true)],
]);

/** Ability keys that are engine details, not something a player reads (they never show and need no fact). */
export const ENGINE_KEYS: ReadonlySet<string> = new Set([
  'pickRadius', // how near the aim an ally must be to be picked
  'gap', // a stop-short distance (Best Friend, Big Brother); Swat-Swat and Yap Yap Yap say theirs in a fact
  'turn', // Laser Pointer's turn rate
  'towerMargin', // Herding Time never herds into its own tower
  'snapSpeed', // FOOTLONG!'s snap to the grabbed hero
  'waveSpeed', // Golden Hour's wave
  'waveWidth',
  'facingArc', // Striking Pose's facing check, said in its fact
  'meleeRange', // Duck and Cover's melee check
  'slip', // Pack Hunt's fizzle margin
  'touch', // the reach of a path hit
]);
