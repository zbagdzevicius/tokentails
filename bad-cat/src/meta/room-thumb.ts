/**
 * My rooms thumbnail (review round 1: the room card instead of a generic house emoji): a tiny top-down SVG of the
 * shell's levels and the room's props (Must-Wreck targets in red). Pure string building, no DOM.
 */
import type { RoomDef, ShellDef } from '../types';

const LEVEL_FILL = ['#f6e7d4', '#e7c9a4', '#c99b6d', '#8d6e63'];

export function roomThumbSvg(room: RoomDef, shell: ShellDef, size = 56): string {
  const W = shell.width;
  const D = shell.depth;
  const cell = Math.max(1, Math.floor(size / Math.max(W, D)));
  const w = W * cell;
  const d = D * cell;
  const parts: string[] = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const lv = shell.levels[z * W + x] ?? 0;
      if (lv > 0) parts.push(`<rect x="${x * cell}" y="${z * cell}" width="${cell}" height="${cell}" fill="${LEVEL_FILL[lv] ?? LEVEL_FILL[3]}"/>`);
    }
  const r = Math.max(1, cell * 0.36);
  for (const p of room.props) {
    if (p.x < 0 || p.z < 0 || p.x >= W || p.z >= D) continue;
    const fill = p.target ? '#e63946' : '#5b4b8a';
    parts.push(`<circle cx="${p.x * cell + cell / 2}" cy="${p.z * cell + cell / 2}" r="${p.target ? r * 1.3 : r}" fill="${fill}"/>`);
  }
  const hs = shell.humanSpot;
  parts.push(`<rect x="${hs.x * cell}" y="${hs.z * cell}" width="${cell}" height="${cell}" rx="${cell / 2}" fill="#2b1d2e"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${d}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(room.title || 'Room')} map"><rect width="${w}" height="${d}" fill="${LEVEL_FILL[0]}"/>${parts.join('')}</svg>`;
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
