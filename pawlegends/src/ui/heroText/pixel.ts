/**
 * Pixel's player-facing copy (sim v11; docs/plans/moba/CATS-V11.md §2.2 "heroText"), read by ../heroText.ts
 * HERO_TEXT. Epithet in the spec: "Gadget Kitten" (HeroText has no epithet field; `title` is the name the HUD shows).
 */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Pixel',
  role: 'Marksman',
  side: 'Cat',
  blurb: 'Shoots from a cardboard robot she built herself.',
  passive: { name: 'Cardboard Plating', text: 'Her box soaks damage and refills when she’s left alone.' },
  abilities: [
    { name: 'Cap Cannon', text: 'A bottle-cap shot that stops on the first dog and reveals it.', icon: 'capCannon' },
    { name: 'Laser Pointer', text: 'Hold a beam that turns with you. Dogs on it are hurt and slowed more and more.', icon: 'laser' },
    { name: 'Duck and Cover', text: 'Hide in the box: you can’t move but take far less damage. Melee attackers are slowed.', icon: 'duck' },
    { name: 'BOXBOT MK II', text: 'The box grows legs: shield, speed and exploding shots.', icon: 'boxbot' },
  ],
  talents: {
    'long-shot': 'Cap Cannon reaches further.',
    spotlight: 'Cap Cannon reveals for longer.',
    overclock: 'Laser Pointer lasts longer.',
    'hot-dot': 'Laser Pointer slows more.',
    'double-tape': 'BOXBOT MK II shields more.',
    'big-boom': 'BOXBOT MK II’s shots explode wider.',
  },
};
