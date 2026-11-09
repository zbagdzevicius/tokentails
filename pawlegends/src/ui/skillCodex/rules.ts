/**
 * The counter-play rules the skill cards lean on (docs/plans/moba/V17.md §3), in words with the numbers read from the
 * data: Steadfast (data/effects.ts CC_DR), telegraphed hard CC, Purr-ify (data/tricks.ts) and Pounce.
 */
import { CC_DR } from '../../data/effects';
import { TRICKS } from '../../data/tricks';
import { sec } from '../heroText';

/** One rule: a short title and a line. */
export interface CounterRule {
  title: string;
  text: string;
}

/** The rules, in the order a "How fights work" panel lists them. */
export function COUNTERPLAY_RULES(): CounterRule[] {
  return [
    {
      title: 'Steadfast',
      text: `After ${sec(CC_DR.cap)} of stuns, roots, fears, charms or knockbacks within ${sec(CC_DR.window)}, a hero shrugs off crowd control for ${sec(CC_DR.immune)}. Slows don't count.`,
    },
    {
      title: 'Read the wind-up',
      text: 'Skill stuns, fears, charms and pulls wind up for at least 0.3 s and show where they land. Step out while they wind up.',
    },
    {
      title: 'Purr-ify / Shake Off',
      text: `Clears crowd control, even mid-stun, then ${sec(TRICKS.purrify.immune)} of immunity: cast it on a big ultimate's wind-up and it misses. It also breaks Sir Brutus's ring.`,
    },
    {
      title: 'Pounce',
      text: `A ${Math.round(TRICKS.pounce.blink / 100) / 10} m blink that dodges skill shots and leaves Sir Brutus's ring.`,
    },
  ];
}
