/**
 * MAP-GAPS A10: ping glyphs for canvas drawing (the minimap bubble and the ground ping's sprite): the `pingText.ts`
 * icon of each kind, rasterised once per kind, colour and size from its SVG. Null until the image has decoded (the
 * first frame of a ping draws the ring alone). UI only.
 */
import { PING_KINDS, type PingKind } from '../data/pings';
import { iconSvg } from './icons';
import { PING_TEXT } from './pingText';

const cache = new Map<string, HTMLCanvasElement | null>();

/** The glyph of `kind` in `color`, `px` device pixels square, or null while it loads (or without a DOM). */
export function pingGlyph(kind: PingKind, px: number, color = '#fff3e3'): HTMLCanvasElement | null {
  const key = `${kind}|${px}|${color}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  cache.set(key, null);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(img, 0, 0, px, px);
    cache.set(key, c);
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(PING_TEXT[kind].icon, color))}`;
  return null;
}

/** The ping kind whose marker colour is `color` (pings that arrive with a colour only), or null. */
export function pingKindOfColor(color: string): PingKind | null {
  for (const k of PING_KINDS) if (PING_TEXT[k].color.toLowerCase() === color.toLowerCase()) return k;
  return null;
}
