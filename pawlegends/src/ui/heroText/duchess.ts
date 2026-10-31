/**
 * Duchess's player-facing copy (sim v11; docs/plans/moba/CATS-V11.md §2.3 "heroText"), read by ../heroText.ts
 * HERO_TEXT. Epithet in the spec: "The Diva" (HeroText has no epithet field; `title` is the name the HUD shows).
 */
import type { HeroText } from '../heroText';

export const TEXT: HeroText = {
  title: 'Duchess',
  role: 'Mage',
  side: 'Cat',
  blurb: 'Floats about on her cushion. Three snubs and a dog can’t move.',
  passive: { name: 'Utter Disdain', text: 'Ability hits add Disdain. At 3, the dog is Snubbed: stunned and hurt.' },
  abilities: [
    { name: 'Fluff Puff', text: 'A big slow fluffball that rolls through everyone.', icon: 'fluffPuff' },
    { name: 'Not Amused', text: 'Glare in a cone; they slow down.', icon: 'glare' },
    { name: 'Cushion Glide', text: 'Glide away and leave a cloud of shed fur.', icon: 'cushion' },
    { name: 'Royal Decree', text: 'Everyone near her is hurt, slowed and nearly Snubbed.', icon: 'decree' },
  ],
  talents: {
    'double-fluff': 'Fluff Puff is wider.',
    'grand-glare': 'Not Amused is wider.',
    'cloud-nine': 'The fur cloud lasts longer.',
    'shedding-season': 'The fur cloud is bigger.',
    'imperial-decree': 'Royal Decree reaches further.',
    'utterly-unamused': 'Snubs stun longer.',
  },
};
