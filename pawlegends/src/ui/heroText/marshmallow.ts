/** Marshmallow's player-facing copy (sim v14; docs/plans/moba/DOGS-V13.md §1.2 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Marshmallow',
  role: 'Mage',
  side: 'Dog',
  blurb: 'Pure smile. Snow on the ground, and cats who stay get frozen.',
  passive: { name: 'Fresh Snow', text: 'In your own snow you run faster and your attacks slow.' },
  abilities: [
    { name: 'Snowball', text: 'A snowball that slows the first thing it hits.', icon: 'snowball' },
    { name: 'Snow Patch', text: 'Drop a patch of snow that hurts and slows cats.', icon: 'snowpatch' },
    { name: 'Belly Slide', text: 'Slide away on your belly, then run faster with a shield.', icon: 'slide' },
    { name: 'SNOW DAY!', text: 'A blizzard. Cats still inside when it ends are frozen in place.', icon: 'blizzard' },
  ],
  talents: {
    'packed-snow': 'Snowball hits harder.',
    'fresh-powder': 'Fresh Snow makes you faster.',
    'big-patch': 'Snow Patch is bigger.',
    'warm-belly': 'Belly Slide shields more.',
    'snow-week': 'SNOW DAY! lasts longer.',
    'deep-freeze': 'Frozen cats stay frozen longer.',
  },
};
