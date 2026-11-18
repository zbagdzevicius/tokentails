/** Player-facing hero copy (POC.md §6). English only in the POC. Numbers live in src/data; this is words. */
import type { HeroId, TrickId } from '../sim/api';
import { BRANCH_TALENT, HERO_IDS, HEROES, type AbilitySlot } from '../data/heroes';
import { abilityRank, kitNumbers, maxRank } from '../sim/heroes/talents';
import { TRICKS } from '../data/tricks';
import { TEXT as MEATBALL_TEXT } from './heroText/meatball';
import { TEXT as PIXEL_TEXT } from './heroText/pixel';
import { TEXT as DUCHESS_TEXT } from './heroText/duchess';
import { TEXT as STILTS_TEXT } from './heroText/stilts';
import { TEXT as NUGGET_TEXT } from './heroText/nugget';
import { TEXT as MARSHMALLOW_TEXT } from './heroText/marshmallow';
import { TEXT as BRAVO_TEXT } from './heroText/bravo';
import { TEXT as CHILI_TEXT } from './heroText/chili';
import { TEXT as HOWLER_TEXT } from './heroText/howler';
import { TEXT as ROCKET_TEXT } from './heroText/rocket';
import { TEXT as FRANKIE_TEXT } from './heroText/frankie';
import { TEXT as DOMINO_TEXT } from './heroText/domino';
import { TEXT as MOCHI_TEXT } from './heroText/mochi';
import { TEXT as ZIGGY_TEXT } from './heroText/ziggy';
import { TEXT as BISCUIT_TEXT } from './heroText/biscuit';
import { TEXT as CHAMP_TEXT } from './heroText/champ';
import { TEXT as NOVA_TEXT } from './heroText/nova';
import { TEXT as DUSTY_TEXT } from './heroText/dusty';
import { TEXT as BARKULA_TEXT } from './heroText/barkula';
import { TEXT as RANGER_TEXT } from './heroText/ranger';

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
  | 'lance' | 'dome'
  // sim v11 original cats (drawn in ./icons/<hero>.ts)
  | 'roll' | 'loaf' | 'bodyguard' | 'chonk' | 'capCannon' | 'laser' | 'duck' | 'boxbot' | 'fluffPuff' | 'glare' | 'cushion' | 'decree' | 'leap' | 'ears' | 'swat' | 'zoomies'
  // sim v14 original dogs (drawn in ./icons/<hero>.ts), and the bone of the pick screen's DOGS tab
  | 'frisbee' | 'bestfriend' | 'sploot' | 'herd' | 'snowball' | 'snowpatch' | 'slide' | 'blizzard' | 'tear' | 'spotlight' | 'stagedive' | 'encore'
  | 'yap' | 'purse' | 'bigdog' | 'howl' | 'derpdash' | 'talkback' | 'scream' | 'bone'
  // sim v15 dogs (drawn in ./icons/<hero>.ts)
  | 'lure' | 'photofinish' | 'squirrel' | 'sprint' | 'weenieroll' | 'dig' | 'bunhop' | 'footlong' | 'spot' | 'splatter' | 'shake' | 'dots'
  // sim v29 roster (drawn in ./icons/<hero>.ts)
  | 'pillow' | 'bubble' | 'purrwave' | 'lullaby' | 'zig' | 'sparkswipe' | 'tailflick' | 'storm' | 'fetch' | 'tailwag' | 'stubborn' | 'walkies'
  | 'haymaker' | 'ropeadope' | 'weave' | 'knockout'
  // sim v31 roster (drawn in ./icons/<hero>.ts)
  | 'starfall' | 'shootingstar' | 'moonhop' | 'meteor' | 'trickshot' | 'lasso' | 'quickdraw' | 'highnoon'
  | 'batbite' | 'batswarm' | 'mist' | 'redmoon' | 'tracer' | 'warnbark' | 'bushdive' | 'longshot';

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
      { name: 'Paw Combo', text: 'Swipe in a cone. Cast up to 3 times; the 3rd swipe knocks back.', icon: 'sword' },
      { name: 'The Stand', text: 'Block 80% of damage from the front. A shot that hits you right away bounces back.', icon: 'shield' },
      { name: 'Tumble', text: 'Dash 4 m. Nothing can hit you for a moment.', icon: 'dash' },
      { name: 'Golden Hour', text: 'Attack faster for 6 s. Every 3rd attack sends out a wave of light.', icon: 'sun' },
    ],
    talents: {
      'pounce-finish': 'The 3rd Paw Combo swipe stuns instead of knocking back.',
      'long-swipe': 'Paw Combo reaches 3 m.',
      'second-wind': 'A knockout or assist resets Tumble.',
      'steady-stand': 'The Stand lasts longer.',
      'golden-afternoon': 'Golden Hour lasts 2 s longer.',
      'sunlit-mend': 'Heal from the damage you deal in Golden Hour.',
    },
  },
  sage: {
    title: 'Sage',
    role: 'Marksman',
    side: 'Cat',
    blurb: 'Calm, patient and never out of arrows.',
    passive: { name: 'Steady Paw', text: 'Every 4th shot flies through a whole line.' },
    abilities: [
      { name: 'Volley', text: 'Fire a fan of arrows.', icon: 'arrows' },
      { name: 'Sun Snare', text: 'Hide a trap. The first enemy to step on it is rooted.', icon: 'trap' },
      { name: 'Hop Back', text: 'Leap away from where you aim.', icon: 'dash' },
      { name: 'Moonshot', text: 'After a short wind-up, a huge arrow flies across the map.', icon: 'moon' },
    ],
    talents: {
      'wide-volley': 'Volley fires 7 arrows.',
      'sticky-arrows': 'Volley slows.',
      'twin-snares': 'Keep 3 traps out. Roots last longer.',
      'piercing-shot': 'Volley becomes one long arrow that flies through everything in its line.',
      'full-moon': 'Moonshot recharges faster.',
      'moon-mark': 'Moonshot reveals the dog it hits for 4 s.',
    },
    branch: { slot: 0, name: 'Piercing Shot', text: 'One long arrow that flies through every enemy in its line.', icon: 'lance' },
  },
  brutus: {
    title: 'Sir Brutus',
    role: 'Tank',
    side: 'Dog',
    blurb: 'A pug of honour. Stands in front so his friends don’t have to.',
    passive: { name: 'Honour', text: 'Getting hit by cats builds you a shield.' },
    abilities: [
      { name: 'Shield Slam', text: 'Slam the ground around you to hurt and slow enemies.', icon: 'ring' },
      { name: 'Front Guard', text: 'Raise a shield that blocks shots for you and teammates behind you.', icon: 'shield' },
      { name: 'Pug Charge', text: 'Charge forward. The first cat you hit is knocked back and stunned.', icon: 'charge' },
      { name: 'Champion’s Challenge', text: 'Pick a cat. Neither of you can leave the ring.', icon: 'crown' },
    ],
    talents: {
      'heavy-slam': 'Shield Slam slows more.',
      'wide-slam': 'Shield Slam is wider.',
      bulwark: 'Front Guard lasts longer.',
      'guard-post': 'Front Guard becomes a dome around you that blocks shots for every teammate inside. You stand still while it lasts and take less damage.',
      'arena-of-honour': 'The ring lasts 3.5 s.',
      'rally-howl': 'Teammates in the ring run faster.',
    },
    branch: { slot: 1, name: 'Guard Post', text: 'Plant a dome that blocks shots for teammates inside. You stand still and take less damage while it lasts.', icon: 'dome' },
  },
  cacklejaw: {
    title: 'Cacklejaw',
    role: 'Assassin',
    side: 'Dog',
    blurb: 'Giggles in the bushes. Then pounces.',
    passive: { name: 'Pack Flank', text: 'Hit harder from behind, or when a teammate is near your target.' },
    abilities: [
      { name: 'Jeer Slash', text: 'Dash through enemies. Hit a cat to dash again.', icon: 'slash' },
      { name: 'Gloat', text: 'Laugh in a cone. Enemies in it run away scared.', icon: 'fear' },
      { name: 'Bush Slink', text: 'Turn invisible and run faster. Lasts longer in bushes.', icon: 'stealth' },
      { name: 'Pack Hunt', text: 'Leap at the weakest cat nearby.', icon: 'hunt' },
    ],
    talents: {
      'long-jeer': 'Jeer Slash dashes further.',
      'cruel-jeer': 'The second Jeer Slash slows.',
      smug: 'Gloat recharges faster.',
      'wide-gloat': 'Gloat is wider.',
      'feeding-frenzy': 'Pack Hunt can reset 2 times.',
      ambush: 'Your first hit out of hiding deals 40% more.',
    },
  },
  lambo: {
    title: 'Lambo',
    role: 'Tank',
    side: 'Cat',
    blurb: 'Big, soft and seven kilos of brave when friends are near.',
    flavour: 'Sought the stars, found tuna cans. Now he cooks for the whole galaxy.',
    passive: { name: 'Brave With Friends', text: 'Takes 10% less damage near a teammate.' },
    abilities: [
      { name: 'Tuna Toss', text: 'Throw a tuna can. The first enemy it hits is slowed.', icon: 'tuna' },
      { name: 'Big Hug', text: 'Shield yourself (7% of your max HP) and the nearest teammate (4.5%).', icon: 'hug' },
      { name: 'Belly Flop', text: 'Hop and land on enemies to stun them.', icon: 'flop' },
      { name: 'Tangled Lights', text: 'Pull nearby dogs in and root them.', icon: 'lights' },
    ],
    talents: {
      'long-toss': 'Tuna Toss flies further.',
      'extra-crispy-tuna': 'Tuna Toss slows more.',
      'bigger-hug': 'Big Hug gives your teammate a bigger shield.',
      'flop-further': 'Belly Flop hops further.',
      'fairy-light-finale': 'Tangled Lights roots for longer.',
      'wide-tangle': 'Tangled Lights reaches further.',
    },
  },
  aviete: {
    title: 'Raspberry',
    role: 'Assassin',
    side: 'Cat',
    blurb: 'Hides in cozy corners, then steps out to show off that shiny coat.',
    flavour: 'Charged with energy, she danced and short-circuited the toaster.',
    passive: { name: 'Shy, Then Shiny', text: 'After 1 s in a bush, her next hit on a dog stuns it.' },
    abilities: [
      { name: 'Spark Swipe', text: 'Swipe in a wide arc in front of you.', icon: 'spark' },
      { name: 'Shiny Coat', text: 'Run faster, then get charged. Soon after a charged hit, you only get the speed.', icon: 'coat' },
      { name: 'Live Wire', text: 'Blink. Cast again within 2 s to blink back.', icon: 'wire' },
      { name: 'Short Circuit', text: 'Blink to a dog, hit it and slow the dogs around it.', icon: 'circuit' },
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
    title: 'Bengal',
    role: 'Mage',
    side: 'Cat',
    blurb: 'Turns heads wherever he goes. Burns whatever he toasts.',
    flavour: 'Set the curtains ablaze. He only wanted to burn the toast.',
    passive: { name: 'Hot Toast', text: 'Hits stunned, rooted, scared, charmed or slowed dogs 15% harder.' },
    abilities: [
      { name: 'Burnt Toast', text: 'Fling toast. It hits the first enemy in the way.', icon: 'toast' },
      { name: 'Striking Pose', text: 'Strike a pose. Dogs facing you are stunned, the rest slowed.', icon: 'pose' },
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
    title: 'Gabby',
    role: 'Support',
    side: 'Cat',
    blurb: 'One look from those blue eyes and you’re under her spell.',
    flavour: 'Chased the wind. It was only a balloon escaping.',
    passive: { name: 'Heart Breeze', text: 'Your attacks on dogs heal the most hurt teammate nearby, or you.' },
    abilities: [
      { name: 'Heart Balloon', text: 'Lob a balloon. When it pops, enemies take damage and teammates heal.', icon: 'balloon' },
      { name: 'Wing Wrap', text: 'Shield and speed up the teammate nearest your aim, or yourself.', icon: 'wings' },
      { name: 'Chase the Wind', text: 'Dash. Teammates you pass run faster.', icon: 'wind' },
      { name: 'Under Her Spell', text: 'Dogs in front of you walk to you and can’t act.', icon: 'spell' },
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
  // sim v11 original cats: each hero's copy lives in ./heroText/<hero>.ts
  meatball: MEATBALL_TEXT,
  pixel: PIXEL_TEXT,
  duchess: DUCHESS_TEXT,
  stilts: STILTS_TEXT,
  nugget: NUGGET_TEXT,
  marshmallow: MARSHMALLOW_TEXT,
  bravo: BRAVO_TEXT,
  chili: CHILI_TEXT,
  howler: HOWLER_TEXT,
  rocket: ROCKET_TEXT,
  frankie: FRANKIE_TEXT,
  domino: DOMINO_TEXT,
  mochi: MOCHI_TEXT,
  ziggy: ZIGGY_TEXT,
  biscuit: BISCUIT_TEXT,
  champ: CHAMP_TEXT,
  nova: NOVA_TEXT,
  dusty: DUSTY_TEXT,
  barkula: BARKULA_TEXT,
  ranger: RANGER_TEXT,
});

export const TRICK_TEXT: Readonly<Record<TrickId, AbilityText>> = Object.freeze({
  pounce: { name: 'Pounce', text: 'Blink 4 m.', icon: 'blink' },
  snack: { name: 'Snack Break', text: 'Heal 25% of your health over 2 s.', icon: 'heart' },
  hiss: { name: 'Hiss', text: 'Scare enemies around you for 0.7 s.', icon: 'hiss' },
  purrify: { name: 'Purr-ify', text: 'Break free of stuns, roots, slows, scares and charms, even while stunned. They can’t land for 1 s.', icon: 'purr' },
});

/**
 * Sim v14: the dog side's names for the same Paw Tricks (QA 2026-11-06: a dog that hisses and purrs read as a cat).
 * Same numbers, same icons; only the words change.
 */
const DOG_TRICK_TEXT: Readonly<Partial<Record<TrickId, AbilityText>>> = Object.freeze({
  hiss: { name: 'Growl', text: 'Scare enemies around you for 0.7 s.', icon: 'hiss' },
  purrify: { name: 'Shake Off', text: 'Break free of stuns, roots, slows, scares and charms, even while stunned. They can’t land for 1 s.', icon: 'purr' },
});

/** A Paw Trick's words for `hero`'s side (a dog growls and shakes off; a cat hisses and purrs). */
export function trickText(trick: TrickId, hero?: HeroId): AbilityText {
  return (hero && HEROES[hero]?.side === 'dog' ? DOG_TRICK_TEXT[trick] : undefined) ?? TRICK_TEXT[trick];
}

/** Sim v10 (GAPS B5): the Paw Trick hint under the trick chips, by role ('' when none); sim v14: by side too. */
export function trickHint(role: string, side: 'cat' | 'dog' = 'cat'): string {
  if (role !== 'Tank') return '';
  return side === 'dog' ? 'Tank tip: Shake Off breaks you out of stuns.' : 'Tank tip: Purr-ify breaks you out of stuns.';
}

export const DIFFICULTY_TEXT = Object.freeze({ easy: 'Easy bots', normal: 'Normal bots', hard: 'Hard bots' });

/**
 * What each bots chip means (playtest round 1: "Hard is mostly hidden stat edges, a veteran will call it rigged").
 * Sim v7 Hard has no stat edge over Normal; sim v8 Hard allies play at Hard too, and the per-hero tuning (HeroData.pvp)
 * shows in the Numbers chip instead of a species line here (round 2: "the pick screen shows cat players a handicap").
 */
export const DIFFICULTY_HINT: Readonly<Partial<Record<string, string>>> = Object.freeze({
  easy: 'Easy: slow bots that rarely use abilities.',
  normal: 'Normal: bots defend their towers and push when ahead.',
  hard: 'Hard: you and 5 Hard bots. They gang up on the weakest champion, jump in after a stun and hit anyone under their tower.',
});

export const sec = (ticks: number): string => `${Math.round(ticks / 3) / 10} s`;
export const metres = (mm: number): string => `${Math.round(mm / 100) / 10} m`;

export type Nums = Readonly<Record<string, number | undefined>>;

const dmgOf = (a: Nums): number | undefined => a.dmg ?? a.waveDmg ?? a.boltDmg ?? a.arrowDmg;
const perOf = (a: Nums): number | undefined => a.dmgPerLevel ?? a.waveDmgPerLevel ?? a.boltDmgPerLevel ?? a.arrowDmgPerLevel;
const rankDmgOf = (r: Nums | undefined): number | undefined => (r ? (r.dmg ?? r.waveDmg) : undefined);

/** Level at which the ultimate unlocks (data/xp.ts XP.ultimateLevel). */
const ULT_UNLOCK = 4;

/**
 * Reach and the main timer of an ability, shared by both forms below. Sim v11: a splash radius counts as reach
 * (BOXBOT's exploding shots), a knockback distance reads "push 1.5 m" (Meatball), and a charm is a timer (Loaf Mode).
 */
function reachAndTimer(a: Nums, parts: string[]): void {
  const reach = a.range ?? a.dash ?? a.blink ?? a.radius ?? a.leap ?? a.splash;
  if (reach !== undefined) parts.push(metres(reach));
  if (a.push !== undefined && a.push > 0) parts.push(`push ${metres(a.push)}`);
  const dur = a.stun ?? a.root ?? a.fear ?? a.charm ?? a.duration;
  if (dur !== undefined && dur > 0) parts.push(`${a.stun ? 'stun' : a.root ? 'root' : a.fear ? 'scare' : a.charm ? 'charm' : 'lasts'} ${sec(dur)}`);
  // Sim v14 (the dogs): shots in a burst, shares of max HP, the freeze, the splash cap and a fading slow's tail.
  if (a.count !== undefined && a.count > 1) parts.push(`×${a.count}`);
  if (a.healBp !== undefined && a.healBp > 0) parts.push(`heal ${Math.round(a.healBp / 100)}% max HP`);
  if (a.shieldBp !== undefined && a.shieldBp > 0) parts.push(`shield ${Math.round(a.shieldBp / 100)}% max HP`);
  if (a.freeze !== undefined && a.freeze > 0) parts.push(`freeze ${sec(a.freeze)}`);
  if (a.splashMax !== undefined && a.splashMax > 0) parts.push(`splash up to ${a.splashMax}`);
  if (a.slowTail !== undefined && a.slowTail > 0) parts.push(`slow fades over ${sec(a.slowTail)}`);
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
  const word = key === 'waveDmg' ? 'light wave dmg' : key;
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
  if (/^(cooldown|duration|stun|root|fear|charm|slow|haste|arm|windup|recastWindow|hold|lockout|postDuration|immune|reveal|untargetable|brushLinger|ttl|clocked|nap|lure|rootPerDot)$/.test(key)) return sec(v);
  if (/^(range|dash|blink|radius|width|leap|postRadius|pierceRange|knockback|pull|push|splash|touch)$/.test(key)) return metres(v);
  if (key === 'speed') return `${Math.round(v / 100) / 10} m/s`;
  // an arc in 1/4096 turns as degrees (Grand Glare 910 → 1200 reads 80° → 105°)
  if (key === 'arc') return `${Math.round((v * 360) / 4096)}°`;
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

/** Sim v8 per-hero tuning (HeroData.pvp) in words, or '' when the hero has none: "Vs champions (Normal, Hard): deals 13% more · takes 8.5% less". */
export function pvpNumbers(hero: HeroId): string {
  const { dmgBp, takenBp } = HEROES[hero].pvp;
  const pct = (bp: number): string => `${Math.round(Math.abs(bp - 10000) / 10) / 10}%`;
  const parts: string[] = [];
  if (dmgBp !== 10000) parts.push(`deals ${pct(dmgBp)} ${dmgBp > 10000 ? 'more' : 'less'}`);
  if (takenBp !== 10000) parts.push(`takes ${pct(takenBp)} ${takenBp > 10000 ? 'more' : 'less'}`);
  return parts.length ? `Vs champions (Normal, Hard): ${parts.join(' · ')}` : '';
}

/** "60 s cooldown · 4 m" for a Paw Trick. */
export function trickNumbers(t: TrickId): string {
  const d = TRICKS[t] as Readonly<Record<string, number>>;
  const parts = [`${sec(d.cooldown)} cooldown`];
  if (d.blink) parts.push(metres(d.blink));
  if (d.radius) parts.push(metres(d.radius));
  if (d.healBp) parts.push(`heals ${d.healBp / 100}%`);
  if (d.immune) parts.push(`unstoppable ${sec(d.immune)}`);
  return parts.join(' · ');
}

/** Talent subtitles, 2 to 5 words, for small landscape screens (the full line is cut off there: round 0). */
export const TALENT_SHORT: Readonly<Record<string, string>> = Object.freeze({
  'pounce-finish': 'Stun on 3rd swipe',
  'long-swipe': 'Longer swipe',
  'second-wind': 'Knockout or assist resets Tumble',
  'steady-stand': 'Longer Stand',
  'golden-afternoon': 'Longer Golden Hour',
  'sunlit-mend': 'Heal in Golden Hour',
  'wide-volley': '7 arrows',
  'sticky-arrows': 'Volley slows',
  'twin-snares': '3 traps, longer roots',
  'piercing-shot': 'One piercing arrow',
  'full-moon': 'Faster Moonshot',
  'moon-mark': 'Moonshot reveals target',
  'heavy-slam': 'Slam slows more',
  'wide-slam': 'Wider Slam',
  bulwark: 'Longer Front Guard',
  'guard-post': 'Shot-blocking dome',
  'arena-of-honour': 'Ring lasts 3.5 s',
  'rally-howl': 'Teammates run faster',
  'long-jeer': 'Longer Jeer dash',
  'cruel-jeer': 'Second Jeer slows',
  smug: 'Faster Gloat',
  'wide-gloat': 'Wider Gloat',
  'feeding-frenzy': '2 Pack Hunt resets',
  ambush: '+40% out of hiding',
});

/**
 * Display names per slot (sim v5 species teams: a hero twice in one team, the second is "Clem 2"). Round 1: the
 * scoreboard, kill feed, nameplates and results all use this, so two "Sir Brutus" rows never read the same.
 */
export function slotNames(picks: readonly HeroId[], seed?: number, humanSlot = 0): string[] {
  if (seed === undefined) {
    return picks.map((h, s) => {
      const t = HERO_TEXT[h]?.title ?? 'A champion';
      const twin = picks.slice(0, s).some((p, i) => p === h && (i < 3) === (s < 3));
      return twin ? `${t} 2` : t;
    });
  }
  // Round 2 ("three matches show the same faces: Clem 2, Cacklejaw 2, Sir Brutus 2"): every bot gets a persona name
  // from the match seed ("Biscuit the Clem"), never twice in one match; the human keeps the hero's title.
  // The draw never depends on whose screen it is: slot 0 is skipped on every client (as in a solo match, where it is
  // the player), so two friends in one party name every bot the same. Before, each client skipped its own slot, and
  // the same bot read "Noodle" on one friend's screen and "Tofu" on the other's (2026-11-15 live co-op check)
  const used = new Set<string>();
  return picks.map((h, s) => {
    const t = HERO_TEXT[h]?.title ?? 'A champion';
    if (s === 0) return t;
    const pool = HEROES[h]?.side === 'dog' ? DOG_NAMES : CAT_NAMES;
    let k = (Math.imul((seed >>> 0) ^ (s * 0x9e3779b1), 0x85ebca6b) >>> 0) % pool.length;
    while (used.has(pool[k])) k = (k + 1) % pool.length;
    used.add(pool[k]);
    return `${pool[k]} the ${t.replace('Sir ', '')}`;
  }).map((n, s) => (s === humanSlot ? (HERO_TEXT[picks[s]]?.title ?? 'A champion') : n));
}

/** Bot persona names (round 2), by side. Generic pet names, not any real Token Tails cat. */
export const CAT_NAMES: readonly string[] = Object.freeze(['Biscuit', 'Pepper', 'Noodle', 'Tofu', 'Marmalade', 'Socks', 'Pickle', 'Waffle', 'Nutmeg', 'Button']);
export const DOG_NAMES: readonly string[] = Object.freeze(['Rex', 'Bruno', 'Duke', 'Bean', 'Rocky', 'Muffin', 'Gravy', 'Pretzel', 'Chomp', 'Bolt']);
