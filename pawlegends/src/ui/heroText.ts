/** Player-facing hero copy (POC.md §6). English only in the POC. Numbers live in src/data; this is words. */
import type { HeroId, TrickId } from '../sim/api';
import { BRANCH_TALENT, HERO_IDS, HEROES, type AbilitySlot } from '../data/heroes';
import { abilityRank, kitNumbers, maxRank } from '../sim/heroes/talents';
import { TRICKS } from '../data/tricks';
import { uiName } from '../data/heroes/shelter';

export interface AbilityText {
  name: string;
  text: string;
  icon: IconId;
}

export type IconId =
  | 'sword' | 'shield' | 'dash' | 'sun' | 'arrows' | 'trap' | 'moon' | 'ring' | 'charge' | 'crown' | 'slash' | 'fear' | 'stealth' | 'hunt' | 'blink' | 'heart' | 'hiss' | 'purr' | 'nap' | 'paw'
  // sim v9 shelter champions
  | 'tuna' | 'hug' | 'flop' | 'lights' | 'spark' | 'coat' | 'wire' | 'circuit' | 'toast' | 'pose' | 'camellia' | 'curtains' | 'balloon' | 'wings' | 'wind' | 'spell'
  // sim v10 level-6 shape branches (GAPS B6)
  | 'lance' | 'dome';

export interface HeroText {
  title: string;
  role: string;
  side: 'Cat' | 'Dog';
  blurb: string;
  /** Sim v9 shelter champions: a line in the card's voice (its rescue story's joke, no health details). */
  flavour?: string;
  passive: { name: string; text: string };
  abilities: [AbilityText, AbilityText, AbilityText, AbilityText];
  /** Talent descriptions by talent id. */
  talents: Record<string, string>;
  /**
   * Sim v10 (GAPS B6): the ability the level-6 shape branch (data/heroes BRANCH_TALENT) turns slot `slot` into. The
   * ability bar swaps to it once the branch is taken.
   */
  branch?: AbilityText & { slot: 0 | 1 | 2 | 3 };
}

export const HERO_TEXT: Readonly<Record<HeroId, HeroText>> = Object.freeze({
  clem: {
    title: 'Clem',
    role: 'Fighter',
    side: 'Cat',
    blurb: 'A brave little knight who swings first and asks later.',
    passive: { name: 'Valor', text: 'Hits build Valor. At full Valor your next ability hits 50% harder.' },
    abilities: [
      { name: 'Paw Combo', text: 'Swipe in a cone. Recast twice; the third swipe knocks back.', icon: 'sword' },
      { name: 'The Stand', text: 'Block 80% of damage from the front. Parry a projectile in the first moment.', icon: 'shield' },
      { name: 'Tumble', text: 'Dash 4 m and dodge everything for a blink.', icon: 'dash' },
      { name: 'Golden Hour', text: 'Attack faster for 6 s. Every third swing sends a wave of light.', icon: 'sun' },
    ],
    talents: {
      'pounce-finish': 'The third Paw Combo stuns instead of knocking back.',
      'long-swipe': 'Paw Combo reaches 3 m.',
      'second-wind': 'A takedown resets Tumble.',
      'steady-stand': 'The Stand lasts longer.',
      'golden-afternoon': 'Golden Hour lasts 2 s longer.',
      'sunlit-mend': 'Heal from damage dealt during Golden Hour.',
    },
  },
  sage: {
    title: 'Sage',
    role: 'Marksman',
    side: 'Cat',
    blurb: 'Calm, patient and never out of arrows.',
    passive: { name: 'Steady Paw', text: 'Every 4th shot pierces through a whole line.' },
    abilities: [
      { name: 'Volley', text: 'Fire a fan of arrows.', icon: 'arrows' },
      { name: 'Sun Snare', text: 'Hide a trap that roots the first enemy to step on it.', icon: 'trap' },
      { name: 'Hop Back', text: 'Leap away from your aim.', icon: 'dash' },
      { name: 'Moonshot', text: 'After a short wind-up, a huge arrow flies across the map.', icon: 'moon' },
    ],
    talents: {
      'wide-volley': 'Volley fires 7 arrows.',
      'sticky-arrows': 'Volley slows.',
      'twin-snares': 'Keep 3 traps; roots last longer.',
      'piercing-shot': 'Volley becomes one long arrow that flies through everything in its line.',
      'full-moon': 'Moonshot recharges faster.',
      'moon-mark': 'Moonshot outlines its target for 4 s.',
    },
    branch: { slot: 0, name: 'Piercing Shot', text: 'One long arrow that flies through every enemy in its line.', icon: 'lance' },
  },
  brutus: {
    title: 'Sir Brutus',
    role: 'Tank',
    side: 'Dog',
    blurb: 'A pug of honour. Stands in front so friends do not have to.',
    passive: { name: 'Honour', text: 'Taking hits from heroes builds a shield.' },
    abilities: [
      { name: 'Shield Slam', text: 'Slam the ground around you and slow enemies.', icon: 'ring' },
      { name: 'Front Guard', text: 'Raise a shield that blocks projectiles for you and friends behind you.', icon: 'shield' },
      { name: 'Pug Charge', text: 'Charge forward; the first hero hit is knocked back and stunned.', icon: 'charge' },
      { name: 'Champion’s Challenge', text: 'Challenge a hero: neither of you can leave the ring.', icon: 'crown' },
    ],
    talents: {
      'heavy-slam': 'Shield Slam slows more.',
      'wide-slam': 'Shield Slam is wider.',
      bulwark: 'Front Guard lasts longer.',
      'guard-post': 'Front Guard becomes a dome around you that blocks enemy shots for every friend inside. You stand still while it lasts and take less damage.',
      'arena-of-honour': 'The challenge ring lasts 4 s.',
      'rally-howl': 'Friends in the ring run faster.',
    },
    branch: { slot: 1, name: 'Guard Post', text: 'Plant a dome that blocks enemy shots for friends inside. You stand still and take less damage while it lasts.', icon: 'dome' },
  },
  cacklejaw: {
    title: 'Cacklejaw',
    role: 'Assassin',
    side: 'Dog',
    blurb: 'Giggles in the bushes. Then pounces.',
    passive: { name: 'Pack Flank', text: 'Hit harder from behind or next to a friend.' },
    abilities: [
      { name: 'Jeer Slash', text: 'Dash through enemies. Hit a hero to dash again.', icon: 'slash' },
      { name: 'Gloat', text: 'Laugh in a cone. Enemies run away in fright.', icon: 'fear' },
      { name: 'Bush Slink', text: 'Vanish and run faster. Lasts longer in bushes.', icon: 'stealth' },
      { name: 'Pack Hunt', text: 'Leap at the weakest nearby enemy hero.', icon: 'hunt' },
    ],
    talents: {
      'long-jeer': 'Jeer Slash dashes further.',
      'cruel-jeer': 'The second Jeer Slash slows.',
      smug: 'Gloat recharges faster.',
      'wide-gloat': 'Gloat is wider.',
      'feeding-frenzy': 'Pack Hunt can reset twice.',
      ambush: 'The first hit out of stealth deals 40% more.',
    },
  },
  lambo: {
    title: 'Lambo',
    role: 'Tank',
    side: 'Cat',
    blurb: 'Big, soft and seven kilos of brave when friends are near.',
    flavour: 'Sought the stars, found tuna cans. Now he cooks for the whole galaxy.',
    passive: { name: 'Brave With Friends', text: 'Takes 10% less damage near an allied hero.' },
    abilities: [
      { name: 'Tuna Toss', text: 'Throw a tuna can. The first enemy hit is slowed.', icon: 'tuna' },
      { name: 'Big Hug', text: 'Shield yourself (7% of your max HP) and the nearest friend (4.5%).', icon: 'hug' },
      { name: 'Belly Flop', text: 'Hop and land on enemies to stun them.', icon: 'flop' },
      { name: 'Tangled Lights', text: 'Pull nearby enemy heroes in and tie them up.', icon: 'lights' },
    ],
    talents: {
      'long-toss': 'Tuna Toss flies further.',
      'extra-crispy-tuna': 'Tuna Toss slows more.',
      'bigger-hug': 'Big Hug gives your friend a bigger shield.',
      'flop-further': 'Belly Flop hops further.',
      'fairy-light-finale': 'Tangled Lights holds longer.',
      'wide-tangle': 'Tangled Lights reaches further.',
    },
  },
  aviete: {
    // NFD (data/heroes/shelter.ts `uiName`): Fredoka draws e + the combining dot, it has no precomposed ė
    title: uiName('Avietė'),
    role: 'Assassin',
    side: 'Cat',
    blurb: 'Hides in cozy corners, then steps out to show off that shiny coat.',
    flavour: 'Charged with energy, she danced and short-circuited the toaster.',
    passive: { name: 'Shy, Then Shiny', text: 'After 1 s in a bush, her next hit on a hero stuns.' },
    abilities: [
      { name: 'Spark Swipe', text: 'Swipe in a wide arc in front of you.', icon: 'spark' },
      { name: 'Shiny Coat', text: 'Charge up now and run faster. While the charge is locked out: speed only.', icon: 'coat' },
      { name: 'Live Wire', text: 'Blink. Cast again within 2 s to blink back.', icon: 'wire' },
      { name: 'Short Circuit', text: 'Blink to an enemy hero, hit it and slow everyone near.', icon: 'circuit' },
    ],
    talents: {
      'wide-swipe': 'Spark Swipe is wider.',
      'live-spark': 'The charged stun lasts longer.',
      'long-wire': 'Live Wire blinks further.',
      'quick-shine': 'Shiny Coat recharges faster.',
      encore: 'Short Circuit recharges faster.',
      'blinding-shine': 'Short Circuit slows more.',
    },
  },
  bengas: {
    title: 'Bengas',
    role: 'Mage',
    side: 'Cat',
    blurb: 'Turns heads wherever he goes. Burns whatever he toasts.',
    flavour: 'Set the curtains ablaze. He only wanted to burn the toast.',
    passive: { name: 'Hot Toast', text: 'Hits stunned, rooted, charmed or slowed heroes 15% harder.' },
    abilities: [
      { name: 'Burnt Toast', text: 'Fling toast. It hits the first enemy in the way.', icon: 'toast' },
      { name: 'Striking Pose', text: 'Strike a pose. Heroes looking at you are stunned, the rest slowed.', icon: 'pose' },
      { name: 'Camellia Hop', text: 'Hop away and run faster for a moment.', icon: 'camellia' },
      { name: 'Curtains Up!', text: 'Set a stage on fire. Enemies in it burn and slow down.', icon: 'curtains' },
    ],
    talents: {
      'extra-crispy': 'Burnt Toast is wider.',
      'burnt-edges': 'Burnt Toast slows.',
      showstopper: 'Striking Pose stuns longer.',
      'long-hop': 'Camellia Hop goes further.',
      'encore-performance': 'Curtains Up! burns longer.',
      'wide-stage': 'Curtains Up! is wider.',
    },
  },
  gabe: {
    title: uiName('Gabė'),
    role: 'Support',
    side: 'Cat',
    blurb: 'One look from those blue eyes and you’re under her spell.',
    flavour: 'Chased the wind. It was only a balloon escaping.',
    passive: { name: 'Heart Breeze', text: 'Basic hits on heroes heal the weakest nearby friend.' },
    abilities: [
      { name: 'Heart Balloon', text: 'Lob a balloon. It pops: enemies take damage, friends heal.', icon: 'balloon' },
      { name: 'Wing Wrap', text: 'Shield a friend near the aim, or yourself, and speed them up.', icon: 'wings' },
      { name: 'Chase the Wind', text: 'Dash. Friends you pass run faster.', icon: 'wind' },
      { name: 'Under Her Spell', text: 'Enemy heroes in front of you walk to you and cannot act.', icon: 'spell' },
    ],
    talents: {
      'big-balloon': 'Heart Balloon is bigger.',
      'kind-breeze': 'Heart Breeze heals more.',
      'feather-fort': 'Wing Wrap shields more.',
      tailwind: 'Chase the Wind’s speed lasts longer.',
      'long-glance': 'Under Her Spell reaches further.',
      smitten: 'Under Her Spell lasts longer.',
    },
  },
});

export const TRICK_TEXT: Readonly<Record<TrickId, AbilityText>> = Object.freeze({
  pounce: { name: 'Pounce', text: 'Blink 4 m.', icon: 'blink' },
  snack: { name: 'Snack Break', text: 'Heal a quarter of your health over 2 s.', icon: 'heart' },
  hiss: { name: 'Hiss', text: 'Scare enemies around you for 1 s.', icon: 'hiss' },
  purrify: { name: 'Purr-ify', text: 'Shake off stuns, roots, slows, scares and charms, even mid-stun, then ignore them for 0.5 s.', icon: 'purr' },
});

/** Sim v10 (GAPS B5): the Paw Trick hint under the trick chips, by role ('' when none). */
export function trickHint(role: string): string {
  return role === 'Tank' ? 'Tank → Purr-ify: you take the stuns, so shake them off.' : '';
}

export const DIFFICULTY_TEXT = Object.freeze({ easy: 'Easy bots', normal: 'Normal bots', hard: 'Hard bots' });

/**
 * What each bots chip means (playtest round 1: "Hard is mostly hidden stat edges, a veteran will call it rigged").
 * Sim v7 Hard has no stat edge over Normal; sim v8 Hard allies play at Hard too, and the per-hero tuning (HeroData.pvp)
 * shows in the Numbers chip instead of a species line here (round 2: "the pick screen shows cat players a handicap").
 */
export const DIFFICULTY_HINT: Readonly<Partial<Record<string, string>>> = Object.freeze({
  easy: 'Easy: slow bots that rarely use abilities.',
  normal: 'Normal: bots defend their base and push when they lead.',
  hard: 'Hard: you and five Hard bots. They focus the weakest hero, dive after a stun and punish anyone under their tower.',
});

const sec = (ticks: number): string => `${Math.round(ticks / 3) / 10} s`;
const metres = (mm: number): string => `${Math.round(mm / 100) / 10} m`;

type Nums = Readonly<Record<string, number | undefined>>;

const dmgOf = (a: Nums): number | undefined => a.dmg ?? a.waveDmg ?? a.boltDmg ?? a.arrowDmg;
const perOf = (a: Nums): number | undefined => a.dmgPerLevel ?? a.waveDmgPerLevel ?? a.boltDmgPerLevel ?? a.arrowDmgPerLevel;
const rankDmgOf = (r: Nums | undefined): number | undefined => (r ? (r.dmg ?? r.waveDmg) : undefined);

/** Level at which the ultimate unlocks (data/xp.ts XP.ultimateLevel). */
const ULT_UNLOCK = 4;

/** Reach and the main timer of an ability, shared by both forms below. */
function reachAndTimer(a: Nums, parts: string[]): void {
  const reach = a.range ?? a.dash ?? a.blink ?? a.radius ?? a.leap;
  if (reach !== undefined) parts.push(metres(reach));
  const dur = a.stun ?? a.root ?? a.fear ?? a.duration;
  if (dur !== undefined && dur > 0) parts.push(`${a.stun ? 'stun' : a.root ? 'root' : a.fear ? 'fear' : 'lasts'} ${sec(dur)}`);
}

/**
 * Without `level` (the pick screen): the data numbers with their growth, "6 s cooldown · 70 (+6/lvl, +18 a rank) dmg ·
 * 2.4 m" (playtest round 1: "no numbers anywhere"). Wave C (C2): with `level` (the HUD tooltip), the numbers the sim
 * uses right now at that level, rank and talent `choices` (per tier −1, 0 or 1): "5.5 s cooldown · 106 dmg · 2.4 m ·
 * rank 2/4".
 */
export function abilityNumbers(hero: HeroId, slot: number, level?: number, choices?: readonly number[]): string {
  const key = ('qwer'[slot] ?? 'q') as AbilitySlot;
  if (level === undefined) {
    const a = HEROES[hero].abilities[key] as Nums;
    const parts = [`${sec(a.cooldown ?? 0)} cooldown`];
    const dmg = dmgOf(a);
    const per = perOf(a);
    const rk = rankDmgOf(HEROES[hero].ranks[key]);
    const grow = [per ? `+${per}/lvl` : '', rk ? `+${rk} a rank` : ''].filter(Boolean).join(', ');
    if (dmg !== undefined) parts.push(`${dmg}${grow ? ` (${grow})` : ''} dmg`);
    reachAndTimer(a, parts);
    return parts.join(' · ');
  }
  const a = kitNumbers(HERO_IDS.indexOf(hero), level, choices)[key] as Nums;
  const parts = [`${sec(a.cooldown ?? 0)} cooldown`];
  const dmg = dmgOf(a);
  if (dmg !== undefined) parts.push(`${dmg + (perOf(a) ?? 0) * (Math.max(1, level) - 1)} dmg`);
  reachAndTimer(a, parts);
  const rank = abilityRank(level, slot);
  parts.push(rank > 0 ? `rank ${rank}/${maxRank(slot)}` : `unlocks at level ${ULT_UNLOCK}`);
  return parts.join(' · ');
}

/**
 * Sim v10 (GAPS B6): the numbers of the level-6 shape branch's ability ("7 s cooldown · 95 (+14/lvl) dmg · 9 m"), or ''.
 * Wave C: with `level`, the numbers at that level ("7 s cooldown · 137 dmg · 9 m").
 */
export function branchNumbers(hero: HeroId, level?: number): string {
  const b = HERO_TEXT[hero].branch;
  const id = BRANCH_TALENT[hero];
  const tIndex = id ? HEROES[hero].talents[1].findIndex((t) => t.id === id) : -1;
  if (!b || tIndex < 0) return '';
  const key = ('qwer'[b.slot] ?? 'q') as AbilitySlot;
  const a = kitNumbers(HERO_IDS.indexOf(hero), level ?? 1, [-1, tIndex, -1])[key] as Nums;
  const parts = [`${sec(a.cooldown ?? 0)} cooldown`];
  if (a.post) {
    parts.push(`${metres(a.postRadius ?? 0)} dome`, `lasts ${sec(a.postDuration ?? 0)}`);
    if (a.postReduceBp) parts.push(`${a.postReduceBp / 100}% less damage`);
    return parts.join(' · ');
  }
  if (a.dmg !== undefined) {
    parts.push(level === undefined ? `${a.dmg}${a.dmgPerLevel ? ` (+${a.dmgPerLevel}/lvl)` : ''} dmg` : `${a.dmg + (a.dmgPerLevel ?? 0) * (level - 1)} dmg`);
  }
  if (a.range !== undefined) parts.push(metres(a.range));
  return parts.join(' · ');
}

/** One rank delta in words: "+18 dmg", "−0.5 s cooldown". */
function rankDelta(key: string, d: number): string {
  if (key === 'cooldown') return `${d < 0 ? '−' : '+'}${sec(Math.abs(d))} cooldown`;
  const word = key === 'waveDmg' ? 'wave dmg' : key;
  return `${d < 0 ? '−' : '+'}${Math.abs(d)} ${word}`;
}

/** Order the rank deltas are listed in (fixed, so the toast reads the same every time). */
const RANK_TEXT_ORDER = ['dmg', 'waveDmg', 'heal', 'shield', 'cooldown'];

/**
 * Wave C (C2): the abilities that rank up at `level` (rank 2 and above; the ultimate's unlock has its own pulse), with
 * their line for the level-up toast: "Volley rank 2: +15 dmg". The deltas are the sim's own numbers (`kitNumbers` at
 * `level` minus `level − 1` with the talent `choices`), so a talent that sets a number outright (Piercing Shot's
 * damage, Full Moon's cooldown) leaves out the rank gain it overrides, and a rank that changes nothing gives no line.
 */
export function rankUpSlots(hero: HeroId, level: number, choices: readonly number[] = []): { slot: number; line: string }[] {
  const out: { slot: number; line: string }[] = [];
  const idx = HERO_IDS.indexOf(hero);
  if (level < 2) return out;
  const now = kitNumbers(idx, level, choices) as unknown as Record<string, Nums>;
  const was = kitNumbers(idx, level - 1, choices) as unknown as Record<string, Nums>;
  for (let slot = 0; slot < 4; slot++) {
    const rank = abilityRank(level, slot);
    if (rank < 2 || rank === abilityRank(level - 1, slot)) continue;
    const key = 'qwer'[slot] ?? 'q';
    const bits: string[] = [];
    for (const k of RANK_TEXT_ORDER) {
      const a = was[key][k];
      const b = now[key][k];
      if (a === undefined || b === undefined || a === b) continue;
      bits.push(rankDelta(k, b - a));
    }
    if (bits.length) out.push({ slot, line: `${HERO_TEXT[hero].abilities[slot].name} rank ${rank}: ${bits.join(', ')}` });
  }
  return out;
}

/** The toast lines of `rankUpSlots`. Empty when nothing ranks up at that level, or no rank changes a number. */
export function rankUpLines(hero: HeroId, level: number, choices: readonly number[] = []): string[] {
  return rankUpSlots(hero, level, choices).map((r) => r.line);
}

/** Wave C (C2): rank pips markup for the HUD and touch buttons, `rank` of `max` filled. */
export function rankPips(rank: number, max: number): string {
  let h = '';
  for (let r = 1; r <= max; r++) h += `<b${r <= rank ? ' class="on"' : ''}></b>`;
  return h;
}

/** A number of `key` in words for the talent card ("3.5 s", "4 m", "20%"). */
function numberText(key: string, v: number): string {
  if (/Bp$/.test(key)) return `${v / 100}%`;
  if (/^(cooldown|duration|stun|root|fear|charm|slow|haste|arm|windup|recastWindow|hold|lockout|postDuration|immune|reveal|untargetable|brushLinger)$/.test(key)) return sec(v);
  if (/^(range|dash|blink|radius|width|leap|postRadius|pierceRange|knockback|pull)$/.test(key)) return metres(v);
  if (key === 'speed') return `${Math.round(v / 100) / 10} m/s`;
  return String(v);
}

/** Words for a talent-changed number ("cooldown", "slow"). */
function keyText(key: string): string {
  return key
    .replace(/Bp$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase();
}

/**
 * Wave C (C2): what talent `choice` of `tier` changes at `level`, from the sim's own numbers with the talents already
 * `chosen`: "Volley arrows 5 → 7". Bespoke talents (no number change) give ''.
 */
export function talentNumbers(hero: HeroId, tier: number, choice: number, level: number, chosen: readonly number[] = []): string {
  const t = HEROES[hero].talents[tier]?.[choice];
  if (!t?.mods) return '';
  const idx = HERO_IDS.indexOf(hero);
  const before = [chosen[0] ?? -1, chosen[1] ?? -1, chosen[2] ?? -1];
  before[tier] = -1;
  const after = before.slice();
  after[tier] = choice;
  const k0 = kitNumbers(idx, level, before) as unknown as Record<string, Nums>;
  const k1 = kitNumbers(idx, level, after) as unknown as Record<string, Nums>;
  const parts: string[] = [];
  for (const slot of ['q', 'w', 'e', 'r', 'passive'] as const) {
    const m = t.mods[slot];
    if (!m) continue;
    const name = slot === 'passive' ? HERO_TEXT[hero].passive.name : HERO_TEXT[hero].abilities['qwer'.indexOf(slot)].name;
    for (const key of Object.keys(m)) {
      // switches (the shape branches' `lance`, `post`) and per-level growth are not numbers a player compares
      if (key === 'lance' || key === 'post' || /PerLevel$/.test(key)) continue;
      // damage, heal and shield read at this level (base + per level), as the sim deals them
      const grow = (k: Record<string, Nums>): number => (/^(dmg|waveDmg|heal|shield)$/.test(key) ? (k[slot][`${key}PerLevel`] ?? 0) * (Math.max(1, level) - 1) : 0);
      const was0 = k0[slot][key];
      const now0 = k1[slot][key];
      const was = was0 === undefined ? undefined : was0 + grow(k0);
      const now = now0 === undefined ? undefined : now0 + grow(k1);
      if (now === undefined || was === now) continue;
      parts.push(`${name} ${keyText(key)} ${was === undefined ? '' : `${numberText(key, was)} → `}${numberText(key, now)}`);
    }
  }
  return parts.join(' · ');
}

/** Sim v8 per-hero tuning (HeroData.pvp) in words, or '' when the hero has none: "Hero fights (Normal, Hard): deals 13% more · takes 8.5% less". */
export function pvpNumbers(hero: HeroId): string {
  const { dmgBp, takenBp } = HEROES[hero].pvp;
  const pct = (bp: number): string => `${Math.round(Math.abs(bp - 10000) / 10) / 10}%`;
  const parts: string[] = [];
  if (dmgBp !== 10000) parts.push(`deals ${pct(dmgBp)} ${dmgBp > 10000 ? 'more' : 'less'}`);
  if (takenBp !== 10000) parts.push(`takes ${pct(takenBp)} ${takenBp > 10000 ? 'more' : 'less'}`);
  return parts.length ? `Hero fights (Normal, Hard): ${parts.join(' · ')}` : '';
}

/** "60 s cooldown · 4 m" for a Paw Trick. */
export function trickNumbers(t: TrickId): string {
  const d = TRICKS[t] as Readonly<Record<string, number>>;
  const parts = [`${sec(d.cooldown)} cooldown`];
  if (d.blink) parts.push(metres(d.blink));
  if (d.radius) parts.push(metres(d.radius));
  if (d.healBp) parts.push(`heals ${d.healBp / 100}%`);
  if (d.immune) parts.push(`immune ${sec(d.immune)}`);
  return parts.join(' · ');
}

/** Talent subtitles, 2 to 5 words, for small landscape screens (the full line is cut off there: round 0). */
export const TALENT_SHORT: Readonly<Record<string, string>> = Object.freeze({
  'pounce-finish': 'Stun on 3rd swipe',
  'long-swipe': 'Longer swipe',
  'second-wind': 'Takedown resets Tumble',
  'steady-stand': 'Longer Stand',
  'golden-afternoon': 'Longer Golden Hour',
  'sunlit-mend': 'Heal in Golden Hour',
  'wide-volley': '7 arrows',
  'sticky-arrows': 'Volley slows',
  'twin-snares': '3 traps, longer roots',
  'piercing-shot': 'One piercing arrow',
  'full-moon': 'Faster Moonshot',
  'moon-mark': 'Moonshot outlines target',
  'heavy-slam': 'Slam slows more',
  'wide-slam': 'Wider Slam',
  bulwark: 'Longer Front Guard',
  'guard-post': 'Shot-blocking dome',
  'arena-of-honour': 'Ring lasts 4 s',
  'rally-howl': 'Friends run faster',
  'long-jeer': 'Longer Jeer dash',
  'cruel-jeer': 'Second Jeer slows',
  smug: 'Faster Gloat',
  'wide-gloat': 'Wider Gloat',
  'feeding-frenzy': 'Pack Hunt resets twice',
  ambush: '+40% out of stealth',
});

/**
 * Display names per slot (sim v5 species teams: a hero twice in one team, the second is "Clem 2"). Round 1: the
 * scoreboard, kill feed, nameplates and results all use this, so two "Sir Brutus" rows never read the same.
 */
export function slotNames(picks: readonly HeroId[], seed?: number, humanSlot = 0): string[] {
  if (seed === undefined) {
    return picks.map((h, s) => {
      const t = HERO_TEXT[h]?.title ?? 'A hero';
      const twin = picks.slice(0, s).some((p, i) => p === h && (i < 3) === (s < 3));
      return twin ? `${t} 2` : t;
    });
  }
  // Round 2 ("three matches show the same faces: Clem 2, Cacklejaw 2, Sir Brutus 2"): every bot gets a persona name
  // from the match seed ("Biscuit the Clem"), never twice in one match; the human keeps the hero's title.
  const used = new Set<string>();
  return picks.map((h, s) => {
    const t = HERO_TEXT[h]?.title ?? 'A hero';
    if (s === humanSlot) return t;
    const pool = HEROES[h]?.side === 'dog' ? DOG_NAMES : CAT_NAMES;
    let k = (Math.imul((seed >>> 0) ^ (s * 0x9e3779b1), 0x85ebca6b) >>> 0) % pool.length;
    while (used.has(pool[k])) k = (k + 1) % pool.length;
    used.add(pool[k]);
    return `${pool[k]} the ${t.replace('Sir ', '')}`;
  });
}

/** Bot persona names (round 2), by side. Generic pet names, not any real Token Tails cat. */
export const CAT_NAMES: readonly string[] = Object.freeze(['Biscuit', 'Pepper', 'Noodle', 'Tofu', 'Marmalade', 'Socks', 'Pickle', 'Waffle', 'Nutmeg', 'Button']);
export const DOG_NAMES: readonly string[] = Object.freeze(['Rex', 'Bruno', 'Duke', 'Bean', 'Rocky', 'Muffin', 'Gravy', 'Tank', 'Chomp', 'Bolt']);
