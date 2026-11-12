/** Mode crests (docs/plans/moba/HOME-MODES.md §5): one small SVG emblem per mode, used on the Mode Select tiles and
 * on Home's mode pill and Events list. 0 KB of art. Pure. */
export function crestSvg(id: string): string {
  const p: Record<string, string> = {
    blitz: '<path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="currentColor"/>',
    skirmish: '<path d="M5 5l9 9M19 5l-9 9M7 15l-2 2 2 2 2-2M17 15l2 2-2 2-2-2" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    classic: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="currentColor"/>',
    coop: '<circle cx="8" cy="9" r="3" fill="currentColor"/><circle cx="16" cy="9" r="3" fill="currentColor"/><path d="M2 20c.5-4 3-6 6-6s5.5 2 6 6zM10 20c.5-4 3-6 6-6s5.5 2 6 6z" fill="currentColor"/>',
    ranked: '<path d="M4 7l4 4 4-7 4 7 4-4-2 12H6z" fill="currentColor"/>',
    cannon: '<circle cx="9" cy="14" r="6" fill="currentColor"/><path d="M13 10l6-6M17 2l4 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${p[id] ?? '<circle cx="12" cy="12" r="7" fill="currentColor"/>'}</svg>`;
}

