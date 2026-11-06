/** Marshmallow's ability icons (sim v13), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  // Snowball: a round snowball with a puff trail
  snowball: '<circle cx="30" cy="24" r="12" fill="currentColor"/><circle cx="26" cy="20" r="3" fill="#fff6"/><g fill="currentColor" opacity=".55"><circle cx="12" cy="24" r="4"/><circle cx="5" cy="24" r="2.5"/></g>',
  // Snow Patch: a flat disc with a flake on it
  snowpatch: '<ellipse cx="24" cy="34" rx="19" ry="8" fill="currentColor" opacity=".55"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 6 V26 M15 11 L33 21 M33 11 L15 21"/></g>',
  // Belly Slide: a round body sliding over speed lines
  slide: '<ellipse cx="30" cy="28" rx="13" ry="8" fill="currentColor"/><circle cx="40" cy="22" r="5" fill="currentColor"/><path d="M4 26 H14 M2 32 H12 M6 38 H18" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>',
  // SNOW DAY!: three falling flakes over a ring
  blizzard: '<circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="3" opacity=".6"/><g stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M16 10 V20 M11 15 H21 M33 16 V26 M28 21 H38 M20 28 V38 M15 33 H25"/></g>',
} as const;
