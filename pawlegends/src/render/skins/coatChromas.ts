/**
 * Coat chromas (gaps4 coats-tests; Wild Rift and Mobile Legends chromas): four recolours of every coat that has its
 * own palette (Treat Track, store, Legends Pass, effect coats). A chroma keeps the coat's pattern, model parts and
 * effects and dyes the fur: base, shade and patch take the chroma's hue at their own lightness, the light belly fur
 * keeps most of its own colour, and the accent takes the chroma's second colour.
 *
 * Earned only, never sold: wearing a coat in finished matches unlocks its chromas in a fixed order (1, 3, 6 and 10
 * matches). The counts live in the local profile (meta/profile.ts `coatPlays`); a chroma only recolours a coat the
 * player already owns, so a faked count never unlocks a sold look. The same in the web game and the apps (nothing is
 * bought).
 *
 * Data and pure colour maths only (no three.js), so the store and the Heroes browser read it cheaply. Render only:
 * the sim, the replay and the hash never see a chroma.
 */

export interface ChromaDef {
  key: string;
  name: string;
  /** The dye: base, shade and patch take its hue. */
  ink: number;
  /** The accent the chroma puts on (eyes, bows, gems that follow the coat accent). */
  accent: number;
  /** Finished matches wearing the coat that unlock it. */
  plays: number;
}

/** The four chromas every coat with a palette has, in unlock order. */
export const CHROMAS: readonly ChromaDef[] = Object.freeze([
  { key: 'rose', name: 'Rose', ink: 0xf06a9a, accent: 0xfff1a8, plays: 1 },
  { key: 'jade', name: 'Jade', ink: 0x2fae7e, accent: 0xffd34d, plays: 3 },
  { key: 'amethyst', name: 'Amethyst', ink: 0x8a5ad8, accent: 0x9fe8ff, plays: 6 },
  { key: 'gilded', name: 'Gilded', ink: 0xd9a628, accent: 0xff6f91, plays: 10 },
] as ChromaDef[]);

export const CHROMA_KEYS: readonly string[] = Object.freeze(CHROMAS.map((c) => c.key));
export const chromaDef = (key: string | null | undefined): ChromaDef | null => (key ? (CHROMAS.find((c) => c.key === key) ?? null) : null);
export const isChromaKey = (v: unknown): v is string => typeof v === 'string' && CHROMA_KEYS.includes(v);

/** The chromas a coat worn in `plays` finished matches has unlocked (keys, unlock order). */
export const chromasEarned = (plays: number): string[] => CHROMAS.filter((c) => plays >= c.plays).map((c) => c.key);

/** The next chroma to earn and the matches still to play for it (null: all four earned). */
export function nextChroma(plays: number): { def: ChromaDef; left: number } | null {
  const def = CHROMAS.find((c) => plays < c.plays);
  return def ? { def, left: def.plays - Math.max(0, plays) } : null;
}

// ------------------------------------------------------------------------------------------------ colour maths

function toHsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): number {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255);
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Dye one colour: the ink's hue at the colour's own lightness (kept inside `lo`..`hi` so a white or black coat still
 * shows the hue), with at least the ink's saturation × `sat`; `keep` of the original colour stays mixed in.
 */
export function dye(c: number, ink: number, keep = 0, sat = 0.8, lo = 0.14, hi = 0.82): number {
  const [h, s0] = toHsl(ink);
  const [, s, l] = toHsl(c);
  const out = fromHsl(h, clamp(Math.max(s, s0 * sat), 0, 1), clamp(l, lo, hi));
  if (keep <= 0) return out;
  const ch = (sh: number): number => Math.round(((c >> sh) & 255) * keep + ((out >> sh) & 255) * (1 - keep)) << sh;
  return ch(16) | ch(8) | ch(0);
}

/** A coat palette in chroma `key` (the palette unchanged for an unknown key). */
export function chromaPalette<T extends { base: number; light: number; dark: number; accent: number; patch?: number }>(coat: T, key: string | null | undefined): T {
  const d = chromaDef(key);
  if (!d) return coat;
  return {
    ...coat,
    base: dye(coat.base, d.ink),
    light: dye(coat.light, d.ink, 0.62, 0.5, 0.2, 0.95),
    dark: dye(coat.dark, d.ink, 0, 0.9, 0.08, 0.5),
    accent: d.accent,
    ...(coat.patch !== undefined ? { patch: dye(coat.patch, d.ink, 0.25, 0.9, 0.2, 0.72) } : {}),
  };
}

/** CSS hex of a colour (the swatches). */
export const cssHex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
