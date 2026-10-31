/** Stilts's ability icons (sim v11), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. */
export const ICONS = {
  // High Leap: a tall dashed arc from a crouch to a landing burst
  leap: '<path d="M7 40 Q20 -2 38 34" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="5 4"/><circle cx="7" cy="40" r="4" fill="currentColor"/><path d="M30 40 L34 34 L38 40 L42 34 M38 34 V28" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="38" cy="42" rx="9" ry="3" fill="currentColor" opacity=".45"/>',
  // Ear Swivel: two tall tufted ears with sound arcs either side
  ears: '<path d="M14 42 L17 8 L24 30 L31 8 L34 42 Z" fill="currentColor"/><path d="M16 6 L17 1 L18 6 M30 6 L31 1 L32 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M8 18 Q4 24 8 30 M4 13 Q0 24 4 35 M40 18 Q44 24 40 30 M44 13 Q48 24 44 35" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
  // Swat-Swat: two claw rakes, the second fainter (it lands a beat later)
  swat: '<g stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M8 34 C16 26 24 16 32 6"/><path d="M13 38 C21 30 29 20 37 10"/><path d="M18 42 C26 34 34 24 42 14"/></g><g stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".5"><path d="M6 20 C14 22 20 26 26 32"/><path d="M8 13 C16 15 23 19 30 25"/></g>',
  // Zoomies: a paw print racing ahead of its speed lines
  zoomies: '<g fill="currentColor"><ellipse cx="33" cy="28" rx="7" ry="6"/><circle cx="26" cy="18" r="3"/><circle cx="32" cy="15" r="3"/><circle cx="39" cy="17" r="3"/><circle cx="42" cy="24" r="2.6"/></g><path d="M4 18 H18 M2 26 H20 M6 34 H22" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>',
} as const;
