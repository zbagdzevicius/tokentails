/** Howler's player-facing copy (sim v14; docs/plans/moba/DOGS-V13.md §1.5 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Howler',
  role: 'Fighter',
  side: 'Dog',
  blurb: 'A husky with opinions. Every ability is a scream.',
  passive: { name: 'Zoomie Brain', text: 'After any ability, your next bite hits harder and slows.' },
  abilities: [
    { name: 'AWOO', text: 'Howl in a cone to hurt and slow cats.', icon: 'howl' },
    { name: 'Derp Dash', text: 'Charge through cats with zero plan.', icon: 'derpdash' },
    { name: 'Talk Back', text: 'Argue back: take less damage, and cats who hit you up close run off scared.', icon: 'talkback' },
    { name: 'THE SCREAM', text: 'A deep breath, then a scream that blows cats away.', icon: 'scream' },
  ],
  talents: {
    louder: 'AWOO reaches further.',
    'no-thoughts': 'Zoomie Brain bites even harder.',
    'sled-dog': 'Derp Dash goes further.',
    'last-word': 'Talk Back scares for longer.',
    echo: 'AWOO recharges faster.',
    'snow-spray': 'Derp Dash slows the cats it hits.',
  },
};
