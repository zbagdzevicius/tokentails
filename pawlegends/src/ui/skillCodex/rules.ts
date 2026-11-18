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
      text: `Stopped for ${sec(CC_DR.cap)} within ${sec(CC_DR.window)}? You turn Steadfast: stuns, roots, scares, charms, pushes and pulls can't land for ${sec(CC_DR.immune)}. Slows still work.`,
    },
    {
      title: 'Read the wind-up',
      text: 'Ability stuns, scares, charms and pulls wind up for at least 0.3 s and show where they land. Step out before they hit.',
    },
    {
      title: 'Purr-ify / Shake Off',
      text: `Breaks you free, even while stunned, and nothing can stop you for ${sec(TRICKS.purrify.immune)}. Use it as a big ultimate winds up and it misses. It also breaks Sir Brutus's ring.`,
    },
    {
      title: 'Pounce',
      text: `A ${Math.round(TRICKS.pounce.blink / 100) / 10} m blink that dodges aimed abilities and gets you out of Sir Brutus's ring.`,
    },
  ];
}
