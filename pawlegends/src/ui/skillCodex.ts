/**
 * Skill codex: the learnable skill cards of every hero (passive, basic attack, Q W E R) for the pick screen's skill
 * preview and the collection, in the spirit of a MOBA ability tooltip but short enough for a phone. Each card has the
 * skill's name and icon, one line on what it does, the facts with real numbers, tags, a tip and a counter.
 *
 * Words come from ui/heroText.ts (names, icons, the default one-liners) and ./skillCodex/{cats,dogs}.ts (tags, tips,
 * counters, bespoke facts). Numbers are never written down here: they are read from `kitNumbers` (src/data merged with
 * the sim's ranks and talents) when a card is built, so a data change shows on the next build with no text edit.
 *
 * Without a level (the pick screen) a card shows the level-1 numbers with their growth: "70 (+6/lvl, +18 a rank)".
 * With a level (and talent choices) it shows what the sim uses at that level.
 */
import type { HeroId } from '../sim/api';
import { GROWTH_FLOOR, HERO_IDS, HEROES, ROLE_GROWTH, type AbilitySlot } from '../data/heroes';
import { TICK_HZ } from '../data/timeline';
import { XP } from '../data/xp';
import { abilityRank, kitNumbers, maxRank } from '../sim/heroes/talents';
import { isRangedHero } from '../input/abilities';
import { HERO_TEXT, metres, type IconId } from './heroText';
import { AUTO, SKILL_SLOTS, type FactCtx, type HeroWords, type Line, type NumSlot, type SkillFact, type SkillSlot, type SkillTag, type SkillWords } from './skillCodex/facts';
import { CAT_WORDS } from './skillCodex/cats';
import { DOG_WORDS } from './skillCodex/dogs';

export { HARD_CC_TAGS, SKILL_SLOTS, TAG_TEXT, type SkillFact, type SkillSlot, type SkillTag } from './skillCodex/facts';

/** One card of the skill preview. */
export interface SkillCard {
  slot: SkillSlot;
  /** The button it sits on: "Q" … "R", or '' (passive, basic attack). */
  key: string;
  /** "Passive", "Basic attack", "Skill 1" … "Ultimate". */
  kind: string;
  name: string;
  /** The ability's icon (ui/icons.ts); undefined for the passive and the basic attack. */
  icon?: IconId;
  /** One line: what it does. */
  what: string;
  facts: SkillFact[];
  /** Effect tags from the data, then the shape tags from the words; no repeats, fixed order. */
  tags: SkillTag[];
  /** How to use it. */
  tip: string;
  /** How to play against it. */
  counter: string;
  /** With a level: the ability's rank now and its top rank (Q W E R); 0 = not learned yet. */
  rank?: number;
  maxRank?: number;
  /** The level it unlocks at (the ultimate), else undefined. */
  unlocks?: number;
}

/** A hero's whole codex: its six cards in preview order. */
export interface HeroCodex {
  hero: HeroId;
  title: string;
  role: string;
  side: 'Cat' | 'Dog';
  /** Melee or ranged basic attack. */
  attack: 'Melee' | 'Ranged';
  cards: SkillCard[];
}

export interface CodexOptions {
  /** The hero's level (1–10); leave it out on the pick screen to see level-1 numbers with their growth. */
  level?: number;
  /** Talent picks per tier (−1 none, 0 or 1), as the sim stores them. */
  choices?: readonly number[];
}

/** Every hero's words, by id. */
export const SKILL_WORDS: Readonly<Record<HeroId, HeroWords>> = Object.freeze({ ...CAT_WORDS, ...DOG_WORDS } as Record<HeroId, HeroWords>);

const KIND: Readonly<Record<SkillSlot, string>> = Object.freeze({
  passive: 'Passive',
  basic: 'Basic attack',
  q: 'Skill 1',
  w: 'Skill 2',
  e: 'Skill 3',
  r: 'Ultimate',
});

/** Effect tags in the order they show, before the shape tags. */
const TAG_ORDER: readonly SkillTag[] = [
  'damage', 'stun', 'root', 'fear', 'charm', 'knockback', 'pull', 'slow', 'heal', 'shield', 'tough', 'cc-immune', 'cleanse', 'untargetable',
  'stealth', 'reveal', 'mobility', 'speed', 'windup', 'skillshot', 'targeted', 'auto-target', 'area', 'cone', 'line', 'zone', 'channel', 'recast',
  'self', 'ally', 'on-hit',
];

/** Data keys that mean a tag when their number is above 0. */
const KEY_TAGS: readonly (readonly [string, SkillTag])[] = [
  ['dmg', 'damage'], ['waveDmg', 'damage'], ['stun', 'stun'], ['root', 'root'], ['freeze', 'root'], ['fear', 'fear'], ['lure', 'charm'],
  ['charm', 'charm'], ['knockback', 'knockback'], ['push', 'knockback'], ['pull', 'pull'], ['slowBp', 'slow'], ['slowMaxBp', 'slow'],
  ['heal', 'heal'], ['healBp', 'heal'], ['shield', 'shield'], ['shieldBp', 'shield'], ['selfBp', 'shield'], ['reduceBp', 'tough'],
  ['immune', 'cc-immune'], ['reveal', 'reveal'], ['hasteBp', 'speed'], ['speedBp', 'speed'], ['dash', 'mobility'], ['blink', 'mobility'],
  ['untargetable', 'untargetable'],
];

/** A telegraph players can read: a wind-up of at least 0.3 s (V17.md §3.2 rule). */
const TELEGRAPH_TICKS = 9;

function ctxOf(hero: HeroId, opts: CodexOptions): FactCtx {
  const level = opts.level === undefined ? undefined : Math.min(XP.maxLevel, Math.max(1, Math.floor(opts.level)));
  const lv = level ?? 1;
  const kit = kitNumbers(HERO_IDS.indexOf(hero), lv, opts.choices ?? []);
  return {
    hero,
    level,
    lv,
    kit,
    base: HEROES[hero].base,
    n: (slot: NumSlot, key: string) => {
      const v = (kit[slot] as Readonly<Record<string, number | undefined>>)[key];
      return v === undefined ? Number.NaN : v;
    },
  };
}

const say = (l: Line | undefined, c: FactCtx): string => (l === undefined ? '' : typeof l === 'function' ? l(c) : l);

/** The generic facts of ability `slot` (data order of AUTO), then the word file's own. */
function abilityFacts(c: FactCtx, slot: AbilitySlot, w: SkillWords): SkillFact[] {
  const nums = c.kit[slot] as Readonly<Record<string, number | undefined>>;
  const skip = new Set(w.skip ?? []);
  const out: SkillFact[] = [];
  for (const [key, build] of AUTO) {
    if (nums[key] === undefined || skip.has(key)) continue;
    const f = build(slot)(c);
    if (!f) continue;
    out.push(w.labels?.[key] ? { ...f, label: w.labels[key] } : f);
  }
  for (const fn of w.facts ?? []) {
    const f = fn(c);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Ticks between basic attacks at `level` before buffs: the role's level attack speed with its floor, as the sim reads
 * them (the same sum as ui/slotTip.ts `attackRows`, which sits in the desktop-only tooltip chunk).
 */
function attackEveryAt(hero: HeroId, level: number): number {
  const h = HEROES[hero];
  const b = h.base;
  const bp = (b.attackSpeedPerLevelBp ?? ROLE_GROWTH[h.role].attackSpeedPerLevelBp) * (Math.max(1, level) - 1);
  return bp <= 0 ? b.attackEvery : Math.max(Math.min(b.attackEvery, GROWTH_FLOOR.attackEveryMin), Math.floor((b.attackEvery * 10000) / (10000 + bp)));
}

/** The basic attack's facts: reach, damage and swings a second, from the sim's numbers. */
function basicFacts(c: FactCtx, w: SkillWords): SkillFact[] {
  const b = c.base;
  const every = attackEveryAt(c.hero, c.lv);
  const out: SkillFact[] = [
    { label: 'Range', value: metres(b.range), keys: ['base.range'], raw: b.range },
    {
      label: 'Damage',
      value: c.level === undefined ? `${b.attack} (+${b.attackPerLevel}/lvl)` : String(b.attack + b.attackPerLevel * (c.lv - 1)),
      keys: ['base.attack', 'base.attackPerLevel'],
      raw: b.attack,
    },
    { label: 'Attacks', value: `${(Math.round((TICK_HZ / every) * 100) / 100).toFixed(2)} a second`, keys: ['base.attackEvery'], raw: b.attackEvery },
  ];
  for (const fn of w.facts ?? []) {
    const f = fn(c);
    if (f) out.push(f);
  }
  return out;
}

function tagsOf(c: FactCtx, slot: SkillSlot, w: SkillWords): SkillTag[] {
  const set = new Set<SkillTag>(w.tags);
  if (slot !== 'passive' && slot !== 'basic') {
    const nums = c.kit[slot] as Readonly<Record<string, number | undefined>>;
    // a skipped key is not what it looks like (a charm's walk speed in `slowBp` is not a slow)
    const skip = new Set(w.skip ?? []);
    for (const [key, tag] of KEY_TAGS) if (!skip.has(key) && (nums[key] ?? 0) > 0) set.add(tag);
    if ((nums.windup ?? 0) >= TELEGRAPH_TICKS) set.add('windup');
  }
  return TAG_ORDER.filter((t) => set.has(t));
}

/** One card of `hero`. */
export function skillCard(hero: HeroId, slot: SkillSlot, opts: CodexOptions = {}): SkillCard {
  const c = ctxOf(hero, opts);
  const text = HERO_TEXT[hero];
  const w = SKILL_WORDS[hero][slot];
  const i = slot === 'passive' || slot === 'basic' ? -1 : 'qwer'.indexOf(slot);
  const ab = i >= 0 ? text.abilities[i] : undefined;
  const name = slot === 'passive' ? text.passive.name : slot === 'basic' ? 'Basic attack' : (ab?.name ?? '');
  const what = say(w.what, c) || (slot === 'passive' ? text.passive.text : (ab?.text ?? ''));
  const facts = slot === 'basic' ? basicFacts(c, w) : slot === 'passive' ? (w.facts ?? []).map((f) => f(c)).filter((f): f is SkillFact => !!f) : abilityFacts(c, slot, w);
  const card: SkillCard = {
    slot,
    key: i >= 0 ? 'QWER'[i] : '',
    kind: KIND[slot],
    name,
    what,
    facts,
    tags: tagsOf(c, slot, w),
    tip: say(w.tip, c),
    counter: say(w.counter, c),
  };
  if (ab) card.icon = ab.icon;
  if (i >= 0 && c.level !== undefined) {
    card.rank = abilityRank(c.level, i);
    card.maxRank = maxRank(i);
  }
  if (slot === 'r') card.unlocks = XP.ultimateLevel;
  return card;
}

/** `hero`'s six cards in preview order (passive, basic attack, Q, W, E, R). */
export function heroCodex(hero: HeroId, opts: CodexOptions = {}): HeroCodex {
  const text = HERO_TEXT[hero];
  return {
    hero,
    title: text.title,
    role: text.role,
    side: text.side,
    attack: isRangedHero(hero) ? 'Ranged' : 'Melee',
    cards: SKILL_SLOTS.map((s) => skillCard(hero, s, opts)),
  };
}

/** A card's facts as "Label value" lines, for a compact list or a screen reader ("Stun 0.5 s"). */
export function factLines(card: SkillCard, withMinor = false): string[] {
  return card.facts.filter((f) => withMinor || !f.minor).map((f) => `${f.label} ${f.value}`);
}

/** The counter-play rules every card leans on (Steadfast, telegraphs, Purr-ify), read from the data. */
export { COUNTERPLAY_RULES } from './skillCodex/rules';
