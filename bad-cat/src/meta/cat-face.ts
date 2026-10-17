/**
 * The player's cat as a flat mugshot face (review round 1: the Rap Sheet showed a 🐈‍⬛ emoji, not the player's cat).
 * Pure SVG string from the CatSpec colours (RGB565), ears (fold) and eye colour; no DOM, no three.js.
 */
import { EYE_COLORS, rgb888, type CatSpec } from '../types';

const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;

export function catFaceSvg(cat: Pick<CatSpec, 'base' | 'secondary' | 'eyes' | 'ears' | 'pattern'>, size = 120): string {
  const base = hex(rgb888(cat.base | 0));
  const sec = hex(rgb888(cat.secondary | 0));
  const eye = hex(EYE_COLORS[cat.eyes | 0] ?? 0x8bc34a);
  const fold = cat.ears === 'fold';
  const ears = fold
    ? `<path d="M22 44 Q26 22 46 30 Z" fill="${base}"/><path d="M98 44 Q94 22 74 30 Z" fill="${base}"/>`
    : `<path d="M20 52 L28 10 L52 34 Z" fill="${base}"/><path d="M100 52 L92 10 L68 34 Z" fill="${base}"/><path d="M27 42 L31 20 L44 34 Z" fill="#f4a6b8"/><path d="M93 42 L89 20 L76 34 Z" fill="#f4a6b8"/>`;
  const marking = cat.pattern === 'solid' ? '' : `<path d="M60 30 Q50 52 60 70 Q70 52 60 30 Z" fill="${sec}" opacity="0.9"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110" width="${size}" height="${Math.round(size * 0.92)}" role="img" aria-hidden="true">` +
    ears +
    `<ellipse cx="60" cy="62" rx="44" ry="40" fill="${base}"/>` +
    marking +
    `<ellipse cx="42" cy="58" rx="9" ry="10" fill="${eye}"/><ellipse cx="78" cy="58" rx="9" ry="10" fill="${eye}"/>` +
    `<ellipse cx="42" cy="59" rx="3" ry="8" fill="#1d1420"/><ellipse cx="78" cy="59" rx="3" ry="8" fill="#1d1420"/>` +
    `<path d="M55 74 L65 74 L60 80 Z" fill="#e57399"/>` +
    `<path d="M60 80 Q54 88 48 84 M60 80 Q66 88 72 84" stroke="#1d1420" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M30 76 L8 72 M30 82 L8 86 M90 76 L112 72 M90 82 L112 86" stroke="#1d1420" stroke-width="2" stroke-linecap="round" opacity="0.6"/>` +
    `</svg>`
  );
}
