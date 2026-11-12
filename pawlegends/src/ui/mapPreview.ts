/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §16 step 9): the map preview on the loading veil of a 5v5 Classic match.
 * A small top-down card drawn from `mapInfo` (never from data/map.ts): forest, lanes, the river, the camps in their
 * colour key (red Prickle, blue Crow, green Beetle, grey Rat, a pond blue Frog), the two pits (rust Grizzlechop, pink
 * Pudding) and both bases, own base bottom left. Render only, no assets; one canvas, drawn once.
 */
import type { MapInfo } from '../sim/map/info';

/** The colour key (§11.2): the same reading on the minimap, the preview and the Low tier. */
export const PREVIEW_KEY = Object.freeze({
  forest: '#3f4a24',
  ground: '#a9a65c',
  lane: '#d6b07a',
  river: '#8fc3dc',
  prickle: '#e0533c',
  crow: '#6f8cff',
  beetle: '#7ed957',
  rat: '#a8a29a',
  toad: '#5fb0c8',
  grizzlechop: '#b5652e',
  pudding: '#ff7ac8',
  base0: '#ffe8b0',
  base1: '#d9b07a',
});

/** Draw `info` into a `px` square canvas (its CSS size: `px` / devicePixelRatio is up to the caller). */
export function drawMapPreview(info: MapInfo, px: number, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas');
  c.width = px;
  c.height = px;
  c.className = 'pl-map-preview';
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', `${info.name}: three lanes, a river and four jungle quadrants`);
  const g = c.getContext('2d');
  if (!g) return c;
  const k = px / info.nx;
  const X = (mm: number): number => (mm / info.width) * px;
  const Y = (mm: number): number => px - (mm / info.height) * px;
  g.fillStyle = PREVIEW_KEY.forest;
  g.fillRect(0, 0, px, px);
  g.fillStyle = PREVIEW_KEY.ground;
  for (let j = 0; j < info.ny; j++) {
    for (let i = 0; i < info.nx; i++) if (info.playable[j * info.nx + i] === 1) g.fillRect(i * k, px - (j + 1) * k, k + 0.5, k + 0.5);
  }
  // the river: the band across the diagonal
  g.save();
  g.strokeStyle = PREVIEW_KEY.river;
  g.globalAlpha = 0.85;
  g.lineWidth = (info.river.b / info.width) * px * 1.4;
  g.beginPath();
  g.moveTo(X(0), Y(info.height));
  g.lineTo(X(info.width), Y(0));
  g.stroke();
  g.restore();
  g.strokeStyle = PREVIEW_KEY.lane;
  g.lineWidth = Math.max(2, px / 48);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const l of info.lanes) {
    const [xs, ys] = l.path[0];
    g.beginPath();
    for (let i = 0; i < xs.length; i++) (i === 0 ? g.moveTo : g.lineTo).call(g, X(xs[i]), Y(ys[i]));
    g.stroke();
  }
  const dot = (x: number, y: number, r: number, fill: string): void => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(X(x), Y(y), r, 0, Math.PI * 2);
    g.fill();
  };
  for (const cp of info.camps) dot(cp.x, cp.y, cp.kind === 'prickle' || cp.kind === 'crow' ? px / 40 : px / 60, PREVIEW_KEY[cp.kind]);
  for (const o of info.objectives) {
    dot(o.x, o.y, px / 22, PREVIEW_KEY[o.kind]);
    g.strokeStyle = '#2b2118';
    g.lineWidth = 1;
    g.stroke();
  }
  for (const f of info.fountains) dot(f.x, f.y, px / 18, f.team === 0 ? PREVIEW_KEY.base0 : PREVIEW_KEY.base1);
  return c;
}
