/** Ranger's ability icons (sim v31), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  tracer: '<circle cx="36" cy="14" r="8" fill="currentColor"/><path d="M30 20 Q34 14 40 12" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/><path d="M4 42 L28 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 3" opacity=".6"/>',
  warnbark: '<path d="M6 24 L22 14 L22 34 Z" fill="currentColor"/><path d="M28 14 Q34 24 28 34 M34 8 Q44 24 34 40" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  bushdive: '<path d="M6 40 Q8 26 18 28 Q20 16 30 22 Q38 16 42 28 Q46 34 42 40 Z" fill="currentColor"/><path d="M24 4 L24 16 M18 10 L24 16 L30 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
  longshot: '<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 4 V14 M24 34 V44 M4 24 H14 M34 24 H44" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="4" fill="currentColor"/>',
} as const;
