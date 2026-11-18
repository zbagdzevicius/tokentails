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
  passive: { name: 'Long Stride', text: 'Walking fills Stride. At full Stride, your next attack is a pounce.' },
  abilities: [
    { name: 'High Leap', text: 'Leap high. Land on a dog to fill Stride.', icon: 'leap' },
    { name: 'Ear Swivel', text: 'Reveal hidden dogs nearby and attack faster.', icon: 'ears' },
    { name: 'Swat-Swat', text: 'Two quick swats. The second slows.', icon: 'swat' },
    { name: 'Zoomies', text: 'Run much faster, and every attack is a pounce.', icon: 'zoomies' },
  ],
  talents: {
    'pounce-power': 'Pounces hit harder.',
    'quick-stride': 'Walking fills Stride faster.',
    'big-ears': 'Ear Swivel reaches further.',
    twitchy: 'Ear Swivel adds more attack speed.',
    'extra-zoomies': 'Zoomies lasts longer.',
    'sky-high': 'Pounces reach further in Zoomies.',
  },
};
