/** Domino's player-facing copy (sim v15; docs/plans/moba/DOGS-V15.md §1 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Domino',
  role: 'Mage',
  side: 'Dog',
  blurb: 'Throws his own spots at cats. Then connects the dots.',
  passive: { name: 'Spot On', text: 'Your skills stick spots on cats. Spotted cats take more from you.' },
  abilities: [
    { name: 'Spot Shot', text: 'Flick a spot at the first thing in line.', icon: 'spot' },
    { name: 'Splatter', text: 'Splash a patch of ink that slows cats.', icon: 'splatter' },
    { name: 'Big Shake', text: 'Shake it all off: cats nearby are knocked away.', icon: 'shake' },
    { name: 'CONNECT THE DOTS!', text: 'Join every spotted cat with a starry line. More spots, bigger hit, longer hold.', icon: 'dots' },
  ],
  talents: {
    'big-spots': 'Spot Shot is wider.',
    'polka-dots': 'One more Spot fits on a cat.',
    'splash-zone': 'Splatter splashes wider.',
    'good-shake': 'Big Shake pushes further.',
    'dot-to-dot-pro': 'CONNECT THE DOTS! reaches further.',
    'tight-knot': 'Each Spot holds cats for longer.',
  },
};
