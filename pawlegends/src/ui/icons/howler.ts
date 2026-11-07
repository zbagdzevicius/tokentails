/** Howler's ability icons (sim v14), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  // AWOO: a raised muzzle with sound arcs
  howl: '<path d="M8 42 L18 16 L28 12 L24 24 L30 42 Z" fill="currentColor"/><g stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"><path d="M32 8 Q38 12 36 20"/><path d="M36 2 Q46 10 42 22"/></g>',
  // Derp Dash: a dash arrow with a tongue flopping out
  derpdash: '<path d="M6 24 H34 M26 14 L38 24 L26 34" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 28 Q16 38 22 34" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>',
  // Talk Back: a speech bubble with a cartoon "!?"
  talkback: '<path d="M6 8 H42 V32 H20 L10 42 V32 H6 Z" fill="currentColor"/><path d="M20 14 V22 M20 26 V27 M28 15 Q32 14 32 18 Q32 21 28 22 V23 M28 27 V28" stroke="#0006" stroke-width="3" fill="none" stroke-linecap="round"/>',
  // THE SCREAM: a wide-open mouth and a cone of shock lines
  scream: '<ellipse cx="12" cy="24" rx="8" ry="11" fill="currentColor"/><g stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M24 14 Q30 24 24 34"/><path d="M32 8 Q40 24 32 40"/><path d="M40 4 Q48 24 40 44"/></g>',
} as const;
