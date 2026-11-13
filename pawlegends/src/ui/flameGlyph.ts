/**
 * V21-FUN §4.2: the small flame glyph on a burning tower's minimap square and overhead bar (original art: a two-tone
 * teardrop flame with a dark outline). Canvas 2D, drawn centred on (cx, cy), `s` px tall.
 */
/** v6 palette: flame #FF8A1E, bolt #FFE14A, a night outline. */
export const FLAME_CSS = Object.freeze({ outer: '#ff8a1e', inner: '#ffe14a', outline: '#12091f', pulse: '#ff8a1e' });

function flamePath(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const w = s * 0.62;
  const top = cy - s / 2;
  const bot = cy + s / 2;
  g.beginPath();
  g.moveTo(cx, top);
  g.bezierCurveTo(cx + w * 0.15, top + s * 0.28, cx + w * 0.62, top + s * 0.38, cx + w * 0.5, bot - s * 0.28);
  g.bezierCurveTo(cx + w * 0.45, bot - s * 0.05, cx + w * 0.18, bot, cx, bot);
  g.bezierCurveTo(cx - w * 0.18, bot, cx - w * 0.45, bot - s * 0.05, cx - w * 0.5, bot - s * 0.28);
  g.bezierCurveTo(cx - w * 0.6, top + s * 0.45, cx - w * 0.1, top + s * 0.35, cx, top);
  g.closePath();
}

export function drawFlame(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  flamePath(g, cx, cy, s + 2);
  g.fillStyle = FLAME_CSS.outline;
  g.fill();
  flamePath(g, cx, cy, s);
  g.fillStyle = FLAME_CSS.outer;
  g.fill();
  flamePath(g, cx, cy + s * 0.18, s * 0.55);
  g.fillStyle = FLAME_CSS.inner;
  g.fill();
}
