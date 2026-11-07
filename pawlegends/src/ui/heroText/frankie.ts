/** Frankie's player-facing copy (sim v15; docs/plans/moba/DOGS-V15.md §1 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Frankie',
  role: 'Assassin',
  side: 'Dog',
  blurb: 'A sausage dog dressed as a hot dog. Digs, rolls, and stretches across half the map.',
  passive: { name: 'Ketchup and Mustard', text: 'Hit a cat with a skill and a bite in a row for extra damage.' },
  abilities: [
    { name: 'Weenie Roll', text: 'Roll into the first cat and knock it back.', icon: 'weenieroll' },
    { name: 'Dig', text: 'Dig under the fight and pop up under the cats, stunning them.', icon: 'dig' },
    { name: 'Bun Hop', text: 'Hop away and shake off slows.', icon: 'bunhop' },
    { name: 'FOOTLONG!', text: 'Stretch super long. Grab the first cat you reach and snap to it.', icon: 'footlong' },
  ],
  talents: {
    'extra-relish': 'The Combo hits harder.',
    'buttered-bun': 'Bun Hop gives more speed.',
    'deep-dig': 'Dig reaches further.',
    'big-pop': 'Dig pops up wider.',
    'six-foot-sub': 'FOOTLONG! stretches further.',
    'mustard-everywhere': 'FOOTLONG! stuns for longer.',
  },
};
