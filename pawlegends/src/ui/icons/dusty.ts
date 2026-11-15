/** Dusty's ability icons (sim v31), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  trickshot: '<rect x="6" y="20" width="10" height="8" rx="2" fill="currentColor"/><path d="M16 24 L30 14 L42 30" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="4 3" stroke-linecap="round"/><circle cx="30" cy="14" r="4" fill="currentColor"/><circle cx="42" cy="30" r="4" fill="currentColor"/>',
  lasso: '<ellipse cx="30" cy="16" rx="13" ry="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M20 22 Q12 32 6 44" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>',
  quickdraw: '<path d="M10 30 H30 L36 24 H44" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="10" y="30" width="7" height="10" rx="2" fill="currentColor"/><path d="M4 18 H16 M2 24 H12" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5"/>',
  highnoon: '<circle cx="24" cy="14" r="8" fill="currentColor"/><path d="M24 2 V0 M10 14 H6 M42 14 H38 M14 4 L12 2 M34 4 L36 2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M8 40 Q24 30 40 40 L40 44 L8 44 Z" fill="currentColor" opacity=".6"/>',
} as const;
