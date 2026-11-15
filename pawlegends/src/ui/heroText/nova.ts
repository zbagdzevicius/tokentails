/** Nova's player-facing copy (sim v31; docs/plans/moba/ROSTER-V31.md §2.1), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Nova',
  role: 'Mage',
  side: 'Cat',
  blurb: 'A stargazer with a brass telescope. She drops stars on dogs from far, far away.',
  passive: { name: 'Starlight', text: 'Your hits on a dog far away from you deal more damage.' },
  abilities: [
    { name: 'Starfall', text: 'Call a star down on a spot. It lands a moment later, hurting and slowing dogs.', icon: 'starfall' },
    { name: 'Shooting Star', text: 'A long star that flies through everything and lights up the dogs it hits.', icon: 'shootingstar' },
    { name: 'Moon Hop', text: 'Hop away. A moonbeam where you stood slows the dogs that follow.', icon: 'moonhop' },
    { name: 'METEOR SHOWER', text: 'From very far away, rain meteors on a big circle, one after another.', icon: 'meteor' },
  ],
  talents: {
    'big-dipper': 'Starfall hits a bigger circle.',
    'far-sight': 'Starlight starts closer.',
    'tail-light': 'Shooting Star lights dogs up for longer.',
    'moon-boots': 'Moon Hop goes further.',
    meteorite: 'METEOR SHOWER drops one more meteor.',
    starstruck: 'METEOR SHOWER slows more.',
  },
};
