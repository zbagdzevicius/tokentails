/** Ziggy's player-facing copy (sim v29; docs/plans/moba/ROSTER-V29.md §2.2), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Ziggy',
  role: 'Fighter',
  side: 'Cat',
  blurb: 'A lightning Bengal who never runs in a straight line. Dashes three times, then becomes the storm.',
  passive: { name: 'Static Step', text: 'After a dash, your next attack deals extra damage.' },
  abilities: [
    { name: 'Zig', text: 'Dash and hit every dog you pass. Cast up to three times in a row.', icon: 'zig' },
    { name: 'Spark Swipe', text: 'Hit dogs close to you and stun them for a moment.', icon: 'sparkswipe' },
    { name: 'Tail Flick', text: 'Hop away and get a shield.', icon: 'tailflick' },
    { name: 'ZIGZAG STORM', text: 'Nothing can touch you as you strike dog after dog near you.', icon: 'storm' },
  ],
  talents: {
    'long-zig': 'Zig dashes further.',
    'live-wire': 'Static Step hits harder.',
    'thunder-paw': 'Spark Swipe stuns for longer.',
    'rubber-tail': 'Tail Flick shields more.',
    'storm-front': 'ZIGZAG STORM strikes one more time.',
    'eye-of-the-storm': 'ZIGZAG STORM reaches further.',
  },
};
