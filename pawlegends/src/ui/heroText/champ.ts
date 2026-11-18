/** Champ's player-facing copy (sim v29; docs/plans/moba/ROSTER-V29.md §2.4), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Champ',
  role: 'Fighter',
  side: 'Dog',
  blurb: 'A boxer in boxing gloves. Jab, jab, cross, and a knockout that sends cats into walls.',
  passive: { name: 'One-Two', text: 'Every third attack on the same cat hits harder and slows it.' },
  abilities: [
    { name: 'Haymaker', text: 'Swing at every cat in front of you.', icon: 'haymaker' },
    { name: 'Rope-a-Dope', text: 'Cover up: take less damage, then heal back part of it.', icon: 'ropeadope' },
    { name: 'Bob and Weave', text: 'Dash in. Your next attack is a Cross.', icon: 'weave' },
    { name: 'KNOCKOUT!', text: 'A huge punch that hits a hurt cat harder and sends it flying. Hitting a wall stuns it.', icon: 'knockout' },
  ],
  talents: {
    southpaw: 'The Cross hits harder.',
    footwork: 'Bob and Weave dashes further.',
    'iron-chin': 'Rope-a-Dope blocks more damage.',
    'corner-man': 'Rope-a-Dope heals back more.',
    'title-belt': 'KNOCKOUT! sends cats further.',
    'ten-count': 'KNOCKOUT! stuns longer against a wall.',
  },
};
