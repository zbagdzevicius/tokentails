/** Mochi's player-facing copy (sim v29; docs/plans/moba/ROSTER-V29.md §2.1), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Mochi',
  role: 'Support',
  side: 'Cat',
  blurb: 'A round ragdoll with a pillow. Shields her friends, speeds them up and sings the dogs to sleep.',
  passive: { name: 'Warm Lap', text: 'Your shields are stronger on a teammate below half health.' },
  abilities: [
    { name: 'Pillow Toss', text: 'Throw a pillow that slows the first dog it hits and shields your most hurt teammate.', icon: 'pillow' },
    { name: 'Cuddle Bubble', text: 'Shield a teammate (or yourself). They attack faster.', icon: 'bubble' },
    { name: 'Purr Wave', text: 'You and nearby teammates run faster. You shake off slows.', icon: 'purrwave' },
    { name: 'LULLABY', text: 'Heal nearby teammates. Nearby dogs get drowsy; the ones still close fall asleep.', icon: 'lullaby' },
  ],
  talents: {
    'feather-pillow': 'Pillow Toss flies further.',
    'big-hug': 'Cuddle Bubble shields more.',
    'purr-motor': 'Purr Wave gives more speed.',
    'comfy-lap': 'Warm Lap shields even more.',
    'deep-sleep': 'LULLABY sleep lasts longer.',
    'group-nap': 'LULLABY heals teammates further away.',
  },
};
