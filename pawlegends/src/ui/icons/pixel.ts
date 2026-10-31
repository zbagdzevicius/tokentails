/** Pixel's ability icons (sim v11), spread into ../icons.ts: a 48×48 box, `currentColor` with dark cut-outs. */
export const ICONS = {
  /** Cap Cannon: a stubby tube firing a crimped bottle cap. */
  capCannon:
    '<path d="M6 38 L20 24 L27 31 L13 45 Z" fill="currentColor"/><circle cx="33" cy="15" r="9" fill="currentColor"/><circle cx="33" cy="15" r="4.5" fill="#0005"/><g stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M33 3V1M43 9L45 7M45 18H47M23 9L21 7"/></g><path d="M22 26 L25 23" stroke="#0005" stroke-width="2"/>',
  /** Laser Pointer: a pointer pen, its beam and the dot. */
  laser:
    '<path d="M4 42 L14 32 L18 36 L8 46 Z" fill="currentColor"/><path d="M16 34 L38 12" stroke="currentColor" stroke-width="3" stroke-dasharray="5 3"/><circle cx="40" cy="10" r="6" fill="currentColor"/><circle cx="40" cy="10" r="2.5" fill="#0005"/>',
  /** Duck and Cover: a shut box with two ear tips peeking over the flaps. */
  duck:
    '<path d="M16 16 L20 8 L24 16 Z M24 16 L28 8 L32 16 Z" fill="currentColor"/><path d="M6 20 H42 V42 H6 Z" fill="currentColor"/><path d="M6 20 L24 26 L42 20" stroke="#0005" stroke-width="2.5" fill="none"/><path d="M22 26 V42" stroke="#0004" stroke-width="5"/>',
  /** BOXBOT MK II: the box on robot legs, arms out, antenna up. */
  boxbot:
    '<path d="M24 4 V10" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="4" r="3" fill="currentColor"/><path d="M12 10 H36 V30 H12 Z" fill="currentColor"/><circle cx="19" cy="18" r="3" fill="#0005"/><circle cx="29" cy="18" r="3" fill="#0005"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M17 30 V44 M31 30 V44 M12 20 H4 V12 M36 20 H44 V12"/></g>',
} as const;
