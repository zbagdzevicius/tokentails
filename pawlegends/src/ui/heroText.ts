/** Player-facing hero copy (POC.md §6). English only in the POC. Numbers live in src/data; this is words. */
import type { HeroId, TrickId } from '../sim/api';
import { HEROES, type AbilitySlot } from '../data/heroes';
import { TRICKS } from '../data/tricks';

export interface AbilityText {
  name: string;
  text: string;
  icon: IconId;
}

export type IconId = 'sword' | 'shield' | 'dash' | 'sun' | 'arrows' | 'trap' | 'moon' | 'ring' | 'charge' | 'crown' | 'slash' | 'fear' | 'stealth' | 'hunt' | 'blink' | 'heart' | 'hiss' | 'nap' | 'paw';

export interface HeroText {
  title: string;
  role: string;
  side: 'Cat' | 'Dog';
  blurb: string;
  passive: { name: string; text: string };
  abilities: [AbilityText, AbilityText, AbilityText, AbilityText];
  /** Talent descriptions by talent id. */
  talents: Record<string, string>;
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
      'quick-hop': 'Hop Back recharges faster.',
      'full-moon': 'Moonshot recharges faster.',
      'moon-mark': 'Moonshot outlines its target for 4 s.',
    },
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
      'long-charge': 'Pug Charge goes further.',
      'arena-of-honour': 'The challenge ring lasts 4 s.',
      'rally-howl': 'Friends in the ring run faster.',
    },
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
});

export const TRICK_TEXT: Readonly<Record<TrickId, AbilityText>> = Object.freeze({
  pounce: { name: 'Pounce', text: 'Blink 4 m.', icon: 'blink' },
  snack: { name: 'Snack Break', text: 'Heal a quarter of your health over 2 s.', icon: 'heart' },
  hiss: { name: 'Hiss', text: 'Scare enemies around you for 1 s.', icon: 'hiss' },
});

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

/** "6 s · 70 dmg (+12/lvl) · 2.4 m" from src/data (playtest round 1: "no numbers anywhere"). */
export function abilityNumbers(hero: HeroId, slot: number): string {
  const a = HEROES[hero].abilities[('qwer'[slot] ?? 'q') as AbilitySlot];
  const parts = [`${sec(a.cooldown)} cooldown`];
  const dmg = a.dmg ?? a.waveDmg ?? a.boltDmg ?? a.arrowDmg;
  const per = a.dmgPerLevel ?? a.waveDmgPerLevel ?? a.boltDmgPerLevel ?? a.arrowDmgPerLevel;
  if (dmg !== undefined) parts.push(`${dmg}${per ? ` (+${per}/lvl)` : ''} dmg`);
  const reach = a.range ?? a.dash ?? a.blink ?? a.radius ?? a.leap;
  if (reach !== undefined) parts.push(metres(reach));
  const dur = a.stun ?? a.root ?? a.fear ?? a.duration;
  if (dur !== undefined && dur > 0) parts.push(`${a.stun ? 'stun' : a.root ? 'root' : a.fear ? 'fear' : 'lasts'} ${sec(dur)}`);
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
  'quick-hop': 'Faster Hop Back',
  'full-moon': 'Faster Moonshot',
  'moon-mark': 'Moonshot outlines target',
  'heavy-slam': 'Slam slows more',
  'wide-slam': 'Wider Slam',
  bulwark: 'Longer Front Guard',
  'long-charge': 'Longer Pug Charge',
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
