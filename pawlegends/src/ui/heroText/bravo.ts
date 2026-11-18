/** Bravo's player-facing copy (sim v14; docs/plans/moba/DOGS-V13.md §1.3 "heroText"), read by ../heroText.ts HERO_TEXT. */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Bravo',
  role: 'Tank',
  side: 'Dog',
  blurb: 'A pug who lives for the drama. Slows cats, owns the stage, fakes his own death.',
  passive: { name: 'Dramatic Flop', text: 'About to drop low? He plays dead: nothing can hit him, and he heals.' },
  abilities: [
    { name: 'Crocodile Tears', text: 'A tear so sad the cat it hits can barely move.', icon: 'tear' },
    { name: 'Center Stage', text: 'Drop a spotlight. In it you take less damage, and cats are slowed.', icon: 'spotlight' },
    { name: 'Stage Dive', text: 'Leap into the crowd and slow the cats you land on.', icon: 'stagedive' },
    { name: 'ENCORE!', text: 'Take a bow: every cat nearby has to walk up to you.', icon: 'encore' },
  ],
  talents: {
    'ugly-crying': 'Crocodile Tears slows for longer.',
    'method-actor': 'Playing dead heals more.',
    'big-spotlight': 'Center Stage is bigger.',
    'crowd-surf': 'Stage Dive lands in a bigger ring.',
    'standing-ovation': 'Cats walk to you for longer.',
    'second-encore': 'ENCORE! reaches further.',
  },
};
