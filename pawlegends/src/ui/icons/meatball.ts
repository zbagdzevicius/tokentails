/** Meatball's ability icons (sim v11), spread into ../icons.ts: our own drawings, tinted by CSS `currentColor`. */
export const ICONS = {
  /** Bowling Roll: a curled-up ball (a tabby stripe swirl) rolling right, speed lines behind it. */
  roll: '<circle cx="28" cy="26" r="14" fill="currentColor"/><path d="M20 22 Q28 14 36 22 M19 30 Q28 24 36 32" stroke="#0005" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M4 18 H12 M2 26 H10 M4 34 H12" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/><path d="M8 42 H44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>',
  /** Loaf Mode: a cat loaf (ears up, paws tucked) with a little Zzz. */
  loaf: '<path d="M5 40 C5 26 12 20 24 20 C36 20 43 26 43 40 Z" fill="currentColor"/><path d="M13 23 L15 14 L21 20 Z M35 23 L33 14 L27 20 Z" fill="currentColor"/><path d="M15 31 Q18 33 21 31 M27 31 Q30 33 33 31" stroke="#0005" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M33 4 H41 L33 11 H41" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round"/>',
  /** Big Brother: a big round cat shielding a small one behind his arm. */
  bodyguard: '<circle cx="30" cy="28" r="14" fill="currentColor"/><path d="M22 18 L24 10 L29 15 Z M38 18 L36 10 L31 15 Z" fill="currentColor"/><path d="M14 18 C8 18 4 22 4 30 C4 38 10 42 16 42" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="11" cy="31" r="5" fill="currentColor" opacity=".55"/>',
  /** Unstoppable Chonk: a huge ball with impact bursts flying off it. */
  chonk: '<circle cx="24" cy="27" r="16" fill="currentColor"/><path d="M15 22 Q24 14 33 22" stroke="#0005" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M4 10 L11 16 M44 10 L37 16 M24 1 V8 M2 28 H7 M46 28 H41" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>',
} as const;
