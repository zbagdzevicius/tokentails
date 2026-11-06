/** Marshmallow's player-facing copy (sim v13; docs/plans/moba/DOGS-V13.md §1.2 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Marshmallow',
  role: 'Mage',
  side: 'Dog',
  blurb: 'Pure smile. Snow on the ground, and cats who stay get frozen.',
  passive: { name: 'Fresh Snow', text: 'In her own snow she runs faster and her hits slow.' },
  abilities: [
    { name: 'Snowball', text: 'A snowball that slows the first thing it hits.', icon: 'snowball' },
    { name: 'Snow Patch', text: 'Drop a patch of snow that hurts and slows cats.', icon: 'snowpatch' },
    { name: 'Belly Slide', text: 'Slide away on your belly, faster and shielded.', icon: 'slide' },
    { name: 'SNOW DAY!', text: 'A blizzard. Cats still inside when it ends freeze solid.', icon: 'blizzard' },
  ],
  talents: {
    'packed-snow': 'Snowball hits harder.',
    'fresh-powder': 'Fresh Snow makes her faster.',
    'big-patch': 'Snow Patch is bigger.',
    'warm-belly': 'Belly Slide shields more.',
    'snow-week': 'SNOW DAY! lasts longer.',
    'deep-freeze': 'Frozen cats stay frozen longer.',
  },
};
