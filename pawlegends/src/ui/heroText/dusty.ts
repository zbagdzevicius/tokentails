/** Dusty's player-facing copy (sim v31; docs/plans/moba/ROSTER-V31.md §2.2), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Dusty',
  role: 'Marksman',
  side: 'Cat',
  blurb: 'A cowgirl with a four-cork popgun. Every fourth cork is a big one.',
  passive: { name: 'Four Corks', text: 'Every fourth shot is a Big Cork: it hits much harder and slows, then you reload.' },
  abilities: [
    { name: 'Trick Shot', text: 'Shoot a cork at an enemy. It bounces to the nearest other enemy, a dog first.', icon: 'trickshot' },
    { name: 'Lasso', text: 'After a short swing, rope the first dog in a line: it’s hurt and can’t walk.', icon: 'lasso' },
    { name: 'Quick Draw', text: 'Dash. Your next shot is a Big Cork, ready to fire at once.', icon: 'quickdraw' },
    { name: 'HIGH NOON', text: 'Plant your boots and fire big corks down a line, one after another. The last hits hardest.', icon: 'highnoon' },
  ],
  talents: {
    'fast-hands': 'You reload faster after a Big Cork.',
    'lucky-bounce': 'Trick Shot bounces harder.',
    'long-rope': 'Lasso reaches further.',
    spurs: 'Quick Draw dashes further.',
    'one-more': 'HIGH NOON fires one more cork.',
    'dead-eye': 'HIGH NOON\'s last cork hits even harder.',
  },
};
