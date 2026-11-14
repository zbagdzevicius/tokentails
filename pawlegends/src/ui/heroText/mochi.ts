/** Mochi's player-facing copy (sim v29; docs/plans/moba/ROSTER-V29.md §2.1), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Mochi',
  role: 'Support',
  side: 'Cat',
  blurb: 'A round ragdoll with a pillow. Shields her friends, speeds them up and sings the dogs to sleep.',
  passive: { name: 'Warm Lap', text: 'Your shields are stronger on a friend below half health.' },
  abilities: [
    { name: 'Pillow Toss', text: 'Throw a pillow that slows the first dog it hits and shields your most hurt friend.', icon: 'pillow' },
    { name: 'Cuddle Bubble', text: 'Shield a friend (or yourself) and make them attack faster.', icon: 'bubble' },
    { name: 'Purr Wave', text: 'You and nearby friends run faster. Shake off slows.', icon: 'purrwave' },
    { name: 'LULLABY', text: 'Heal nearby friends. Nearby dogs get drowsy, and the ones still near you fall asleep.', icon: 'lullaby' },
  ],
  talents: {
    'feather-pillow': 'Pillow Toss flies further.',
    'big-hug': 'Cuddle Bubble shields more.',
    'purr-motor': 'Purr Wave gives more speed.',
    'comfy-lap': 'Warm Lap shields even more.',
    'deep-sleep': 'LULLABY sleep lasts longer.',
    'group-nap': 'LULLABY heals friends further away.',
  },
};
