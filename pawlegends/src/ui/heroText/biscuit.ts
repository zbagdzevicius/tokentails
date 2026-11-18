/** Biscuit's player-facing copy (sim v29; docs/plans/moba/ROSTER-V29.md §2.3), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Biscuit',
  role: 'Support',
  side: 'Dog',
  blurb: 'A golden retriever who plays fetch with cats. Reels them in on his leash and guards his friends.',
  passive: { name: 'Good Boy', text: 'Every few seconds, your next attack on a cat stuns it and shields you and a teammate.' },
  abilities: [
    { name: 'Fetch!', text: 'Throw your ball on a leash. The first cat it hits is stunned and pulled to you.', icon: 'fetch' },
    { name: 'Tail Wag', text: 'Hit cats close to you and knock them back.', icon: 'tailwag' },
    { name: 'Stubborn', text: 'Shake off stuns and slows. For a moment they can’t land, and you take less damage.', icon: 'stubborn' },
    { name: 'WALKIES!', text: 'Pull nearby cats toward you, hurt them and slow them. You get a shield.', icon: 'walkies' },
  ],
  talents: {
    'long-leash': 'Fetch! flies further.',
    'big-wag': 'Tail Wag knocks cats further.',
    'tough-pup': 'Stubborn lasts longer.',
    'best-boy': 'Good Boy shields more.',
    'extendable-leash': 'WALKIES! reaches further.',
    'long-walk': 'WALKIES! slows for longer.',
  },
};
