/**
 * Card scaling contract. CardWrapper is a CSS size container (`container-type: inline-size`),
 * and every size inside a card (type, icons, radii, borders, gaps) is written in `cqw`, so a card
 * of any width is an exact scale model of the full card. The full card is 400 px wide, so a size
 * of N px on it is `N / 4` cqw (12 px -> 3cqw, 28 px -> 7cqw).
 *
 * Never size card content with px, rem (`rem:`), vw or breakpoints: the same card renders at
 * 144 px in My Pets and at 400 px in the card modal on the same screen.
 */
export const CARD_REFERENCE_WIDTH = 400;

/** `px` on the 400 px reference card as a `cqw` length string, for inline styles. */
export const cardPx = (px: number): string =>
  `${Number(((px / CARD_REFERENCE_WIDTH) * 100).toFixed(4))}cqw`;
