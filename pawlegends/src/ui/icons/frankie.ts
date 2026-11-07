/** Frankie's ability icons (sim v15, first pass), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  weenieroll: '<rect x="6" y="16" width="30" height="16" rx="8" fill="currentColor"/><path d="M10 24 Q16 20 22 24 Q28 28 34 24" stroke="#0006" stroke-width="2.5" fill="none"/><path d="M40 14 Q46 24 40 34" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
  dig: '<path d="M4 34 Q24 22 44 34 Z" fill="currentColor"/><g fill="currentColor" opacity=".7"><circle cx="12" cy="18" r="3"/><circle cx="24" cy="12" r="3"/><circle cx="36" cy="18" r="3"/></g><path d="M24 40 V44" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  bunhop: '<path d="M8 38 Q24 4 40 38" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="4 3"/><rect x="14" y="14" width="20" height="10" rx="5" fill="currentColor"/>',
  footlong: '<rect x="2" y="20" width="44" height="10" rx="5" fill="currentColor"/><path d="M6 25 Q12 21 18 25 Q24 29 30 25 Q36 21 42 25" stroke="#0006" stroke-width="2.5" fill="none"/><circle cx="42" cy="18" r="5" fill="currentColor"/>',
} as const;
