/** Rocket's player-facing copy (sim v15; docs/plans/moba/DOGS-V15.md §1 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Rocket',
  role: 'Marksman',
  side: 'Dog',
  blurb: 'Fastest dog on the island. Hits hardest from far away, then needs a snooze.',
  passive: { name: 'Sighthound', text: 'Your attacks hit harder on cats far away.' },
  abilities: [
    { name: 'Lure Shot', text: 'A long dart that flies past minions and stops at the first cat.', icon: 'lure' },
    { name: 'Photo Finish', text: 'Dash. Your next attack hits hard.', icon: 'photofinish' },
    { name: 'SQUIRREL!', text: "Throw a squeaky toy. Cats near it can't help chasing it.", icon: 'squirrel' },
    { name: 'ZOOM… ZZZ', text: 'Sprint through cats; nothing can hit you. Then flop over for a snooze.', icon: 'sprint' },
  ],
  talents: {
    'long-legs': 'Lure Shot flies further.',
    'eagle-eye': 'Sighthound works from closer.',
    'false-start': 'Photo Finish dashes further.',
    squeakier: 'SQUIRREL! pulls cats from further away.',
    'power-nap': 'The snooze heals you.',
    clocked: 'Cats you sprint through take more from your attacks for longer.',
  },
};
