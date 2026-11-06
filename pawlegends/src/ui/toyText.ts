/**
 * Lane F (docs/FUN-PROGRESSION-V12.md F2, F3): the words for Toys and level-ups. Client only: the sim knows a Toy
 * tier as a number (data/toys.ts) and a level as a number; this module names them for the top rail, the scoreboard
 * and the results screen. Pure, no DOM.
 *
 * Naming rule (spec "Toys, not Treats"): "Treat" already names the meta Treat Track (meta/treats.ts) and "Fish Snack"
 * is a map pickup, so in-match items are Toys and the currency is Fish. No text here may contain the word "Treat"
 * (toy-text.test.ts checks every line).
 */
import type { HeroId } from '../sim/api';
import { HEROES, HERO_HP_BP } from '../data/heroes';
import type { HeroRole } from '../data/heroes/types';
import { TOY_COST, TOY_PASSIVE, TOY_PASSIVE_TIER, TOY_TIER, TOY_TIERS, type ToyStats } from '../data/toys';
import { RANK_LEVELS } from '../data/heroes/growth';
import { XP } from '../data/xp';

/** One Toy line per role: what a hero of that role buys (tier I to IV). At most 11 characters (phone rail). */
export const TOY_NAME: Readonly<Record<HeroRole, string>> = Object.freeze({
  fighter: 'Chew Rope',
  marksman: 'Red Dot',
  tank: 'Comfy Bed',
  assassin: 'Feather',
  mage: 'Yarn Ball',
  support: 'Bell Collar',
});

export const ROMAN: readonly string[] = Object.freeze(['', 'I', 'II', 'III', 'IV']);

/** The tier-3 passive in words, from TOY_PASSIVE's numbers. */
export function toyPassiveText(role: HeroRole): string {
  const p = TOY_PASSIVE;
  const pct = (bp: number): string => `${Math.round(bp / 100)}%`;
  switch (role) {
    case 'fighter':
      return `basics heal ${pct(p.fighterLifestealBp)} of hero damage`;
    case 'marksman':
      return `+${pct(p.marksmanFarBp)} basics on far heroes`;
    case 'tank':
      return `−${pct(p.tankReduceBp)} damage from heroes`;
    case 'assassin':
      return `+${pct(p.assassinExecuteBp)} damage to weak heroes`;
    case 'mage':
      return `+${pct(p.mageAbilityBp)} ability damage to heroes`;
    case 'support':
      return `+${pct(p.supportBp)} heals and shields`;
  }
}

/** HP one Toy HP level adds for this hero (data/toys.ts: hpLevels × the hero's HP per level). */
const hpPerLevel = (hero: HeroId): number => Math.round((HEROES[hero].base.hpPerLevel * HERO_HP_BP) / 10000);

/** The stat parts of one tier, in a fixed order ("+8% damage", "+60 HP", "+3% atk speed", "+4% speed"). */
export function toyParts(hero: HeroId, s: Readonly<ToyStats>): string[] {
  const out: string[] = [];
  if (s.dmgBp > 0) out.push(`+${Math.round(s.dmgBp / 100)}% damage`);
  if (s.hpLevels > 0) out.push(`+${s.hpLevels * hpPerLevel(hero)} HP`);
  if (s.asBp > 0) out.push(`+${Math.round(s.asBp / 100)}% atk speed`);
  if (s.speedBp > 0) out.push(`+${Math.round(s.speedBp / 100)}% speed`);
  return out;
}

/** "Yarn Ball II" (tier 1..4). */
export function toyName(hero: HeroId, tier: number): string {
  const t = Math.max(1, Math.min(TOY_TIERS, tier | 0));
  return `${TOY_NAME[HEROES[hero].role]} ${ROMAN[t]}`;
}

export interface ToyToast {
  /** Phone line (≤ 28 characters): "Yarn Ball II — +8% damage". */
  title: string;
  /** Desktop second part: every stat, and the role passive at tier 3. */
  sub: string;
  /** The tier's name alone ("Yarn Ball II"). */
  name: string;
  /** Its first stat ("+8% damage"). */
  head: string;
}

/** The rail toast for the own hero buying `tier` (1..4). */
export function toyToast(hero: HeroId, tier: number): ToyToast {
  const t = Math.max(1, Math.min(TOY_TIERS, tier | 0));
  const role = HEROES[hero].role;
  const parts = toyParts(hero, TOY_TIER[role][t - 1]);
  const name = toyName(hero, t);
  const head = parts[0] ?? '';
  const extra = t === TOY_PASSIVE_TIER ? [`new: ${toyPassiveText(role)}`] : [];
  const sub = [...parts, ...extra].join(' · ') + (t === TOY_TIERS ? ' · fully geared' : '');
  return { title: head ? `${name} — ${head}` : name, sub, name, head };
}

/** Enemy line at their last tier only (spec F2): "Rex is fully geared up". */
export const gearedLine = (name: string): string => `${name} is fully geared up`;

/** Cumulative Fish a hero needs for tier `tier` (1..4): 500, 1200, 2000, 3000. */
export function toyCumulative(tier: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(TOY_TIERS, tier); i++) sum += TOY_COST[i];
  return sum;
}

/**
 * The Fish chip's ring (F1): how far the unspent `fish` is toward the next Toy (0..1), and the cost of that step.
 * At the last tier the ring is full and `next` is 0.
 */
export function fishProgress(fish: number, toy: number): { frac: number; next: number } {
  if (toy >= TOY_TIERS) return { frac: 1, next: 0 };
  const next = TOY_COST[Math.max(0, toy)] ?? 0;
  return { frac: next > 0 ? Math.max(0, Math.min(1, fish / next)) : 1, next };
}

/** "2:11" from match ticks (30 Hz); "–" for −1 (never). */
export function mmss(ticks: number): string {
  if (!(ticks >= 0)) return '–';
  const s = Math.floor(ticks / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------------------------------------- level text (F3)

/**
 * What a level brings (F3), from the rank and talent tables: "Ultimate unlocked!", "Q W E rank 3" (touch: "Skills
 * rank 3"), "pick a talent", "Ultimate rank 2"; the top level adds "max level". Pure.
 */
export function levelWhat(level: number, touch = false): string {
  const bits: string[] = [];
  const basic = RANK_LEVELS.basic.indexOf(level);
  if (basic >= 1) bits.push(`${touch ? 'Skills' : 'Q W E'} rank ${basic + 1}`);
  const ult = RANK_LEVELS.ultimate.indexOf(level);
  if (ult === 0) bits.push('Ultimate unlocked!');
  else if (ult > 0) bits.push(`Ultimate rank ${ult + 1}`);
  if (XP.talentLevels.includes(level)) bits.push('pick a talent');
  // phones keep the line under 28 characters: the max-level note is desktop only
  if (level >= XP.maxLevel && !touch) bits.push('max level');
  return bits.join(' · ');
}

/** The rail line for a level-up: "Level 4 — Ultimate unlocked!" (just "Level N" when the level brings nothing). */
export function levelLine(level: number, touch = false): string {
  const what = levelWhat(level, touch);
  return what ? `Level ${level} — ${what}` : `Level ${level}`;
}
