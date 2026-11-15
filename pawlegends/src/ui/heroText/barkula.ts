/** Barkula's player-facing copy (sim v31; docs/plans/moba/ROSTER-V31.md §2.3), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Barkula',
  role: 'Mage',
  side: 'Dog',
  blurb: 'A Doberman count in a tall-collared cape. He fights up close and drinks the fight to stay in it.',
  passive: { name: 'Night Thirst', text: 'Your spells heal you for part of the damage they deal, most of all on cats.' },
  abilities: [
    { name: 'Bat Bite', text: 'Send a bat flying. It bites the first thing in the way.', icon: 'batbite' },
    { name: 'Bat Swarm', text: 'Bats circle you for a while, biting the cats close by. You run faster.', icon: 'batswarm' },
    { name: 'Mist Form', text: 'Turn to mist for a moment: nothing can touch you, you run fast and shake off slows.', icon: 'mist' },
    { name: 'RED MOON', text: 'Mark and slow the cats around you. Marked cats still near you when it ends are bitten, and you drink.', icon: 'redmoon' },
  ],
  talents: {
    fangs: 'Night Thirst heals more from cats.',
    'night-flight': 'Bat Bite flies further.',
    'big-swarm': 'Bat Swarm reaches further.',
    'thick-fog': 'Mist Form lasts longer.',
    'full-moon': 'RED MOON marks cats further away.',
    'old-count': 'RED MOON heals you more.',
  },
};
