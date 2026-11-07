/** Domino's ability icons (sim v15, first pass), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  spot: '<circle cx="28" cy="20" r="12" fill="currentColor"/><circle cx="28" cy="20" r="12" stroke="#fff8" stroke-width="2" fill="none"/><path d="M4 40 L16 30" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".7"/>',
  splatter: '<path d="M24 8 Q30 16 38 12 Q34 22 42 28 Q32 30 32 40 Q24 34 16 40 Q16 30 6 28 Q14 22 10 12 Q18 16 24 8 Z" fill="currentColor"/>',
  shake: '<circle cx="24" cy="24" r="9" fill="currentColor"/><g stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"><path d="M8 14 Q4 24 8 34"/><path d="M40 14 Q44 24 40 34"/></g><g fill="currentColor" opacity=".7"><circle cx="10" cy="6" r="2.5"/><circle cx="38" cy="6" r="2.5"/><circle cx="24" cy="42" r="2.5"/></g>',
  dots: '<g fill="currentColor"><circle cx="8" cy="36" r="5"/><circle cx="22" cy="12" r="5"/><circle cx="40" cy="30" r="5"/></g><path d="M8 36 L22 12 L40 30" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="3 3"/>',
} as const;
