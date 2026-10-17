/** Player-facing hero copy (POC.md §6). English only in the POC. Numbers live in src/data; this is words. */
import type { HeroId, TrickId } from '../sim/api';

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

export const DIFFICULTY_TEXT = Object.freeze({ easy: 'Easy bots', normal: 'Normal bots' });
