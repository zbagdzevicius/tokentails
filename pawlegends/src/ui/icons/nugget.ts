/** Nugget's ability icons (sim v13), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  // Frisbee: a flying disc with a rim and speed lines
  frisbee: '<ellipse cx="28" cy="24" rx="15" ry="7" fill="currentColor"/><ellipse cx="28" cy="22" rx="9" ry="3.5" fill="#0003"/><path d="M3 20 H11 M5 28 H12" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>',
  // Best Friend: two hearts, the small one tucked behind the big one
  bestfriend: '<path d="M28 40 C14 30 10 22 16 15 C21 10 27 13 28 18 C29 13 35 10 40 15 C46 22 42 30 28 40 Z" fill="currentColor"/><path d="M14 30 C6 24 4 19 8 15 C11 12 14 14 15 17" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>',
  // Sploot: a flat loaf with both back legs straight out behind
  sploot: '<ellipse cx="22" cy="30" rx="15" ry="7" fill="currentColor"/><circle cx="37" cy="25" r="6" fill="currentColor"/><path d="M8 32 H2 M9 36 H3" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M38 19 L40 12 L43 19 Z" fill="currentColor"/>',
  // Herding Time: arrows from round the ring pointing into the middle
  herd: '<circle cx="24" cy="24" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M4 24 H14 M10 19 L15 24 L10 29"/><path d="M44 24 H34 M38 19 L33 24 L38 29"/><path d="M24 4 V14 M19 10 L24 15 L29 10"/><path d="M24 44 V34 M19 38 L24 33 L29 38"/></g>',
} as const;
