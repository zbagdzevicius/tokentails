/** Chili's player-facing copy (sim v13; docs/plans/moba/DOGS-V13.md §1.4 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Chili',
  role: 'Marksman',
  side: 'Dog',
  blurb: 'Tiny. Shaking. Furious. Gets faster the angrier he gets.',
  passive: { name: 'Small Dog Syndrome', text: 'Getting hit, and yapping at cats, builds Rage: more Rage, faster attacks.' },
  abilities: [
    { name: 'Yap Yap Yap', text: 'Three quick yaps in a line.', icon: 'yap' },
    { name: 'Tiny Zoomies', text: 'Dart away at full speed, and get angrier.', icon: 'zoomies' },
    { name: 'Purse Mode', text: 'Hide in a handbag: untouchable for a moment, then pop out and slow cats nearby.', icon: 'purse' },
    { name: 'BIG DOG ENERGY', text: 'Become a big dog. Max Rage, and every shot splashes.', icon: 'bigdog' },
  ],
  talents: {
    'extra-yap': 'Yap Yap Yap yaps four times.',
    'short-fuse': 'Each Rage adds more attack speed.',
    'designer-bag': 'Purse Mode heals more.',
    caffeinated: 'Tiny Zoomies adds 2 Rage.',
    'even-bigger': 'BIG DOG shots splash wider.',
    grudge: 'BIG DOG ENERGY lasts longer.',
  },
};
