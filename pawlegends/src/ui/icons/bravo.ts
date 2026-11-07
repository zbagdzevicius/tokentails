/** Bravo's ability icons (sim v14), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  // Crocodile Tears: one big tear drop
  tear: '<path d="M24 4 C24 4 10 22 10 30 C10 38 16 44 24 44 C32 44 38 38 38 30 C38 22 24 4 24 4 Z" fill="currentColor"/><path d="M18 30 C18 34 20 37 23 38" stroke="#fff6" stroke-width="3" fill="none" stroke-linecap="round"/>',
  // Center Stage: a spotlight cone onto a stage line
  spotlight: '<path d="M18 4 H30 L42 38 H6 Z" fill="currentColor" opacity=".55"/><rect x="16" y="2" width="16" height="6" rx="2" fill="currentColor"/><path d="M2 42 H46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  // Stage Dive: a leap arc onto a burst
  stagedive: '<path d="M6 36 Q18 0 36 30" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M36 36 L36 44 M28 38 L24 42 M44 38 L46 42"/></g>',
  // ENCORE!: a bowing star with a curtain line
  encore: '<path d="M24 6 L28 18 L41 18 L31 26 L35 39 L24 31 L13 39 L17 26 L7 18 L20 18 Z" fill="currentColor"/>',
} as const;
