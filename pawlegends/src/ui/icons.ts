/** Ability icons: small inline SVGs (our own drawings), tinted by CSS `currentColor`. */
import type { IconId } from './heroText';

const P: Record<IconId, string> = {
  sword: '<path d="M38 6 L42 10 L20 32 L16 28 Z" fill="currentColor"/><path d="M12 30 L22 40 M14 36 L8 42" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  shield: '<path d="M24 5 L40 11 V24 C40 34 33 40 24 43 C15 40 8 34 8 24 V11 Z" fill="currentColor"/><path d="M24 12 V36" stroke="#0003" stroke-width="3"/>',
  dash: '<path d="M10 24 H34 M26 14 L38 24 L26 34" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 16 H16 M6 32 H16" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>',
  sun: '<circle cx="24" cy="24" r="9" fill="currentColor"/><g stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M24 4V10M24 38V44M4 24H10M38 24H44M10 10L14 14M34 34L38 38M38 10L34 14M10 38L14 34"/></g>',
  arrows: '<g stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M8 38 L36 10 M14 42 L40 20 M6 30 L28 6"/></g><path d="M36 10 L30 10 L36 16 Z M40 20 L34 21 L39 26 Z M28 6 L22 7 L27 12 Z" fill="currentColor"/>',
  trap: '<circle cx="24" cy="26" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 18 L18 26 L22 18 L26 26 L30 18 L34 26" stroke="currentColor" stroke-width="3" fill="none"/>',
  moon: '<path d="M30 6 A18 18 0 1 0 42 32 A14 14 0 1 1 30 6 Z" fill="currentColor"/>',
  ring: '<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="24" cy="24" r="6" fill="currentColor"/>',
  charge: '<path d="M6 30 L26 30 L26 38 L42 24 L26 10 L26 18 L6 18 Z" fill="currentColor"/>',
  crown: '<path d="M8 36 L6 14 L16 22 L24 8 L32 22 L42 14 L40 36 Z" fill="currentColor"/>',
  slash: '<path d="M10 40 C20 30 30 18 40 8" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M8 28 C14 22 18 18 24 12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>',
  fear: '<circle cx="24" cy="24" r="17" fill="currentColor"/><circle cx="18" cy="20" r="3" fill="#0006"/><circle cx="30" cy="20" r="3" fill="#0006"/><path d="M15 29 Q24 37 33 29" stroke="#0006" stroke-width="3" fill="none"/>',
  stealth: '<path d="M4 24 Q24 6 44 24 Q24 42 4 24 Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M8 40 L40 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  hunt: '<path d="M24 6 L28 18 L40 18 L30 26 L34 38 L24 31 L14 38 L18 26 L8 18 L20 18 Z" fill="currentColor"/>',
  blink: '<circle cx="14" cy="30" r="6" fill="currentColor" opacity=".5"/><circle cx="34" cy="18" r="8" fill="currentColor"/><path d="M18 26 L28 20" stroke="currentColor" stroke-width="3" stroke-dasharray="3 3"/>',
  heart: '<path d="M24 41 C10 31 5 23 5 16 C5 10 10 6 15 6 C19 6 22 8 24 12 C26 8 29 6 33 6 C38 6 43 10 43 16 C43 23 38 31 24 41 Z" fill="currentColor"/>',
  hiss: '<path d="M8 24 Q16 12 24 24 T40 24" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8 34 Q16 22 24 34 T40 34" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>',
  nap: '<path d="M30 8 H40 L30 20 H40" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linejoin="round"/><path d="M12 22 H20 L12 32 H20" stroke="currentColor" stroke-width="3" fill="none"/><path d="M6 40 Q24 30 42 40" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>',
  paw: '<ellipse cx="24" cy="31" rx="10" ry="8" fill="currentColor"/><circle cx="12" cy="20" r="4.5" fill="currentColor"/><circle cx="20" cy="13" r="4.5" fill="currentColor"/><circle cx="28" cy="13" r="4.5" fill="currentColor"/><circle cx="36" cy="20" r="4.5" fill="currentColor"/>',
};

export function icon(id: IconId, cls = ''): string {
  return `<svg class="pl-icon ${cls}" viewBox="0 0 48 48" aria-hidden="true">${P[id] ?? P.paw}</svg>`;
}
