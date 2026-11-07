/** Chili's ability icons (sim v14), spread into ../icons.ts: 48 × 48 drawings tinted by `currentColor`. Tiny Zoomies reuses `zoomies`. */
export const ICONS = {
  // Yap Yap Yap: three sound-wave crescents
  yap: '<g stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"><path d="M12 14 Q18 24 12 34"/><path d="M22 10 Q30 24 22 38"/><path d="M32 6 Q42 24 32 42"/></g>',
  // Purse Mode: a handbag with a handle
  purse: '<path d="M8 20 H40 L36 42 H12 Z" fill="currentColor"/><path d="M16 20 C16 8 32 8 32 20" stroke="currentColor" stroke-width="4" fill="none"/><path d="M8 26 H40" stroke="#0004" stroke-width="2.5"/>',
  // BIG DOG ENERGY: a small paw and a huge paw
  bigdog: '<ellipse cx="30" cy="31" rx="12" ry="10" fill="currentColor"/><g fill="currentColor"><circle cx="17" cy="18" r="5"/><circle cx="26" cy="11" r="5"/><circle cx="36" cy="11" r="5"/><circle cx="44" cy="19" r="4.5"/></g><ellipse cx="8" cy="40" rx="4" ry="3" fill="currentColor" opacity=".6"/>',
} as const;
