/** Nova's ability icons (sim v31), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  starfall: '<path d="M30 4 L33 13 L42 13 L35 19 L38 28 L30 22 L22 28 L25 19 L18 13 L27 13 Z" fill="currentColor"/><ellipse cx="24" cy="40" rx="16" ry="5" fill="none" stroke="currentColor" stroke-width="3" opacity=".6"/><path d="M28 26 L25 36" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>',
  shootingstar: '<path d="M4 40 L30 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".5"/><path d="M36 6 L38 13 L45 14 L39 18 L41 25 L35 21 L29 25 L31 18 L25 14 L32 13 Z" fill="currentColor"/>',
  moonhop: '<path d="M28 6 A16 16 0 1 0 42 30 A12 12 0 1 1 28 6 Z" fill="currentColor"/><path d="M6 40 Q14 30 22 40" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>',
  meteor: '<circle cx="30" cy="30" r="9" fill="currentColor"/><path d="M6 6 L24 24 M14 4 L28 18 M4 14 L18 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"/><ellipse cx="30" cy="42" rx="14" ry="4" fill="currentColor" opacity=".35"/>',
} as const;
