// Hand-drawn glyphs for icons pixelarticons does not have (decision #63).
// Same format as pixelarticons.ts: path data on a 24x24 grid, filled with
// currentColor, one rectangle per run of pixels so they stay crisp at 24 px.

export const CUSTOM_ICONS = {
  // Speech bubble with a zigzag bolt, for "Share on Messenger".
  messenger: [
    "M6 2h12v2H6zM4 4h2v2H4zm14 0h2v2h-2zM2 6h2v10H2zm18 0h2v10h-2zM4 16h2v2H4zm14 0h2v2h-2zM8 18h10v2H8zM4 18h2v4H4zm2 2h2v2H6z",
    "M6 12h2v2H6zm2-2h4v2H8zm4 2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2z",
  ],
} as const satisfies Record<string, readonly string[]>;
