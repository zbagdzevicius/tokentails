/**
 * Stilts's player-facing copy (sim v11; docs/plans/moba/CATS-V11.md §2.4 "heroText"), read by ../heroText.ts
 * HERO_TEXT. Epithet in the spec: "The Zoomer" (HeroText has no epithet field; `title` is the name the HUD shows).
 */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Stilts',
  role: 'Assassin',
  side: 'Cat',
  blurb: 'All legs and ears. Runs to build Stride, then pounces.',
  passive: { name: 'Long Stride', text: 'Walking fills Stride; at full, she pounces on her target.' },
  abilities: [
    { name: 'High Leap', text: 'A high leap; land on a dog to fill Stride.', icon: 'leap' },
    { name: 'Ear Swivel', text: 'Hear everything nearby: reveals hidden dogs and speeds up her swipes.', icon: 'ears' },
    { name: 'Swat-Swat', text: 'Two quick swats; the second slows.', icon: 'swat' },
    { name: 'Zoomies', text: 'Super speed and every attack is a pounce.', icon: 'zoomies' },
  ],
  talents: {
    'pounce-power': 'Pounces hit harder.',
    'quick-stride': 'Walking fills Stride faster.',
    'big-ears': 'Ear Swivel hears further.',
    twitchy: 'Ear Swivel speeds up her swipes more.',
    'extra-zoomies': 'Zoomies lasts longer.',
    'sky-high': 'Zoomies pounces reach further.',
  },
};
