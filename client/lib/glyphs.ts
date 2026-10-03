// The display face (Passion One, `font-primary`) has no Lithuanian ogonek, caron-c or dot-above
// letters (Ą Č Ę Ė Į Ų Ū and their lowercase forms; Š and Ž are present). A name with one of them
// would mix in a thin system fallback for that letter ("ROŽINĖ", "PIESĖ"), so such a name is set
// whole in the body face (Nunito, which has them) at a heavy weight instead.

/** Letters `font-primary` cannot draw. Checked with fontTools against client/public/fonts. */
export const DISPLAY_MISSING_GLYPHS = /[ĄąČčĘęĖėĮįŲųŪū]/;

/** True when `text` has a letter the display face cannot draw. */
export const needsBodyFont = (text: string | null | undefined): boolean =>
  !!text && DISPLAY_MISSING_GLYPHS.test(text);

/**
 * The font classes for a name shown in a display role: `display` (default `font-primary`) when the
 * face can draw every letter, else the body face, extra-bold.
 */
export const nameFont = (text: string | null | undefined, display = "font-primary"): string =>
  needsBodyFont(text) ? "font-sans font-extrabold" : display;
