/**
 * Meatball's player-facing copy (sim v11; docs/plans/moba/CATS-V11.md §2.1 "heroText"), read by ../heroText.ts
 * HERO_TEXT. Epithet in the spec: "The Bouncer" (HeroText has no epithet field; `title` is the name the HUD shows).
 */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Meatball',
  role: 'Tank',
  side: 'Cat',
  blurb: 'Rolls into dogs and bowls them off his friends.',
  passive: { name: 'Food Coma', text: 'When he drops low, he falls asleep under a big shield.' },
  abilities: [
    { name: 'Bowling Roll', text: 'Roll forward. Everything in the way is knocked aside.', icon: 'roll' },
    { name: 'Loaf Mode', text: 'Become a loaf: you can’t move but take less damage. Nearby dogs must walk to you.', icon: 'loaf' },
    { name: 'Big Brother', text: 'Jump to a teammate, shield them and push dogs off them.', icon: 'bodyguard' },
    { name: 'Unstoppable Chonk', text: 'Nothing can stop you. Bump into dogs to send them flying.', icon: 'chonk' },
  ],
  talents: {
    'hungry-roll': 'Bowling Roll goes further.',
    'heavy-roll': 'Bowling Roll slows more.',
    'long-loaf': 'Loaf Mode lasts longer.',
    protective: 'Big Brother shields more.',
    'extra-chonk': 'Unstoppable Chonk lasts longer.',
    'bowling-pin': 'Unstoppable Chonk sends dogs further.',
  },
};
