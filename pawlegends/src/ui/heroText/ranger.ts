/** Ranger's player-facing copy (sim v31; docs/plans/moba/ROSTER-V31.md §2.4), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Ranger',
  role: 'Marksman',
  side: 'Dog',
  blurb: 'A beagle park ranger with a tennis-ball launcher. He hides in plain sight and snipes from far away.',
  passive: { name: 'Camouflage', text: 'A few seconds without fighting hides you until you hit. Your first shot from hiding hits harder.' },
  abilities: [
    { name: 'Tracer Ball', text: 'A long shot that flies past minions, hits the first cat and reveals it.', icon: 'tracer' },
    { name: 'Warning Bark', text: 'Bark at the cats in front of you: they are knocked back and slowed.', icon: 'warnbark' },
    { name: 'Bush Dive', text: 'Dive and hide for a moment. Your next shot hits harder, as if from hiding.', icon: 'bushdive' },
    { name: 'LONG SHOT', text: 'From far away, settle and fire balls that home in on one cat. It can’t hide until you stop.', icon: 'longshot' },
  ],
  talents: {
    'good-nose': 'Tracer Ball reveals cats for longer.',
    patience: 'Camouflage hides you sooner.',
    'big-bark': 'Warning Bark knocks cats further.',
    'deep-bush': 'Bush Dive hides you for longer.',
    'fourth-ball': 'LONG SHOT fires one more ball.',
    scope: 'LONG SHOT reaches further.',
  },
};
