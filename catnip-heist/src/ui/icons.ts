/** Small inline SVG icons drawn on a 16px pixel grid (crisp, colour = currentColor). */

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor">${body}</svg>`;

export const ICONS = {
  soundOn: svg('<path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5h1v1h1v4h-1v1h-1v-1h1V6h-1z"/><path d="M13 3h1v1h1v8h-1v1h-1v-1h1V4h-1z"/>'),
  soundOff: svg('<path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M10 6h1v1h1V6h1v1h-1v2h1v1h-1V9h-1v1h-1V9h1V7h-1z"/>'),
  pause: svg('<path d="M4 3h3v10H4zM9 3h3v10H9z"/>'),
  eye: svg('<path d="M1 8h1V7h1V6h2V5h6v1h2v1h1v1h1v1h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1z" opacity=".35"/><path d="M6 6h4v1h1v2h-1v1H6V9H5V7h1z"/><path d="M7 7h1v1H7z" fill="#fff"/>'),
  clock: svg('<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2z" opacity=".35"/><path d="M7 4h2v4h3v2H7z"/>'),
  key: svg('<path d="M3 4h4v1h1v2h6v2h-1v2h-2V9H8v2H7v1H3v-1H2V5h1zm1 2v3h2V6z"/>'),
  back: svg('<path d="M7 3h2v2H7v1h7v4H7v1h2v2H7v-1H6v-1H5V9H4V7h1V6h1V5h1z"/>'),
  close: svg('<path d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1H10v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/>'),
  swap: svg('<path d="M4 2h2v2h7v2H6v2H4V7H3V6H2V4h1V3h1zM10 8h2v1h1v1h1v2h-1v1h-1v1h-2v-2H3v-2h7z"/>'),
  retry: svg('<path d="M7 1h2v2h2v1h1v1h1v2h1v4h-1v2h-1v1h-1v1H5v-1H4v-1H3v-2H2V8h2v3h1v1h1v1h4v-1h1v-1h1V7h-1V6h-1V5H9v2H8V6H7V5H6V4h1V3h1V2H7z"/>'),
  home: svg('<path d="M7 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2h-2v6H9v-4H7v4H3V9H1V7h1V6h1V5h1V4h1V3h1V2h1z"/>'),
  play: svg('<path d="M4 2h2v1h2v1h2v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H8v1H6v1H4z"/>'),
  star: svg('<path d="M7 1h2v3h1v1h4v2h-1v1h-1v1h1v4h-1v1h-1v-1H9v-1H7v1H5v1H4v-1H3V9h1V8H3V7H2V5h4V4h1z"/>'),
  paw: svg('<path d="M3 4h2v3H3zM6 2h2v3H6zM9 2h2v3H9zM12 4h2v3h-2zM6 7h5v1h1v2h1v3h-1v1H9v-1H8v1H5v-1H4v-3h1V8h1z"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ch-svg';
  s.innerHTML = ICONS[name];
  return s;
}
