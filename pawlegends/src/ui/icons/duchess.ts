/** Duchess's ability icons (sim v11), spread into ../icons.ts (48×48, currentColor, like the rest of the set). */
export const ICONS = {
  /** Fluff Puff: a fat cloud ball rolling right, with two speed tufts behind it. */
  fluffPuff: '<g fill="currentColor"><circle cx="28" cy="24" r="10"/><circle cx="20" cy="18" r="7"/><circle cx="34" cy="15" r="6"/><circle cx="37" cy="27" r="7"/><circle cx="25" cy="33" r="7"/><circle cx="18" cy="28" r="6"/></g><path d="M4 18 H12 M2 26 H11 M5 34 H13" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>',
  /** Not Amused: a half-lidded eye glaring into a wedge. */
  glare: '<path d="M14 24 L46 8 V40 Z" fill="currentColor" opacity=".45"/><path d="M2 24 Q12 14 22 24 Q12 30 2 24 Z" fill="currentColor"/><path d="M2 21 Q12 12 22 21" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="13" cy="24" r="3" fill="#0006"/>',
  /** Cushion Glide: a tasselled cushion with glide lines and a puff of fur behind. */
  cushion: '<path d="M14 26 C14 20 44 20 44 26 C44 33 14 33 14 26 Z" fill="currentColor"/><path d="M14 27 L11 34 M44 27 L47 34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M2 20 H10 M4 28 H10" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/><g fill="currentColor" opacity=".5"><circle cx="6" cy="38" r="4"/><circle cx="12" cy="40" r="3"/></g>',
  /** Royal Decree: a crown over a ring wave. */
  decree: '<path d="M10 26 L8 10 L17 18 L24 6 L31 18 L40 10 L38 26 Z" fill="currentColor"/><circle cx="24" cy="6" r="2.5" fill="currentColor"/><path d="M4 36 Q24 48 44 36" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M10 32 Q24 40 38 32" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".6"/>',
} as const;
