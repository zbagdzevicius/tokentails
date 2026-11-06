/** Nugget's player-facing copy (sim v13; docs/plans/moba/DOGS-V13.md §1.1 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Nugget',
  role: 'Support',
  side: 'Dog',
  blurb: 'A loaf with legs. Herds cats, rushes to friends and heals by splooting.',
  passive: { name: 'Treat Pouch', text: 'Every few seconds his next hit tosses a treat to the most hurt friend.' },
  abilities: [
    { name: 'Frisbee', text: 'Throw a frisbee that flies through every cat in its path.', icon: 'frisbee' },
    { name: 'Best Friend', text: 'Run to a friend and shield you both, with a burst of speed.', icon: 'bestfriend' },
    { name: 'Sploot', text: 'Flop flat: tougher, and nearby friends heal.', icon: 'sploot' },
    { name: 'Herding Time', text: 'Herd every cat nearby into one spot, then speed your team in.', icon: 'herd' },
  ],
  talents: {
    'long-throw': 'Frisbee flies further.',
    'big-pouch': 'Treat Pouch heals more.',
    'very-good-boy': 'Best Friend shields more.',
    'long-sploot': 'The Sploot lasts longer and heals more.',
    'border-collie-energy': 'Herding Time herds cats further.',
    'zoomie-squad': 'Herding Time speeds your team up more.',
  },
};
