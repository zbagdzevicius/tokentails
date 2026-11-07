/** Rocket's player-facing copy (sim v15; docs/plans/moba/DOGS-V15.md §1 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Rocket',
  role: 'Marksman',
  side: 'Dog',
  blurb: 'Fastest dog on the island. Hits hardest from far away, then needs a nap.',
  passive: { name: 'Sighthound', text: 'His hits are stronger on cats far away.' },
  abilities: [
    { name: 'Lure Shot', text: 'A long dart that flies past minions and stops at the first cat.', icon: 'lure' },
    { name: 'Photo Finish', text: 'Dash, and your next hit is a big one.', icon: 'photofinish' },
    { name: 'SQUIRREL!', text: "Throw a squeaky toy. Cats near it can't help chasing it.", icon: 'squirrel' },
    { name: 'ZOOM… ZZZ', text: 'Sprint through the cats, untouchable. Then flop over for a nap.', icon: 'sprint' },
  ],
  talents: {
    'long-legs': 'Lure Shot flies further.',
    'eagle-eye': 'Sighthound starts closer.',
    'false-start': 'Photo Finish dashes further.',
    squeakier: 'SQUIRREL! pulls from further away.',
    'power-nap': 'The nap heals him.',
    clocked: 'Clocked cats stay marked for longer.',
  },
};
