// Top-down trail minimap (TRAILS lane): the built Track's centre line, coloured per block, gaps dotted, rivers blue,
// cloud canyons white, start and finish flags, and a little Mochi dot that runs the course. Canvas 2D only.
// mapData() and mapFrame() are pure (node-importable); drawMap() needs a CanvasRenderingContext2D.
import { newFrame, type Track } from '../core/track';
import type { SegmentKind } from '../core/types';
import type { BlockRange } from './build';

export interface MapData {
  /** projected points, 0..1 in both axes of a box of `aspect` (shape kept, centred) */
  xs: Float32Array;
  ys: Float32Array;
  /** block index per point (-1 = start / end straight) */
  block: Int16Array;
  kind: SegmentKind[];
  n: number;
  /** the box's aspect (w / h) */
  aspect: number;
}

const KIND_STEP = 3;

/**
 * Sample the track every few u up to `end` and project it top-down, turned so the course fills a box of `aspect`
 * (w / h) as well as it can, start on the left.
 */
export function mapData(track: Track, ranges: readonly BlockRange[], end = track.length, aspect = 1, step = KIND_STEP): MapData {
  const n = Math.max(2, Math.floor(end / step) + 1);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const block = new Int16Array(n);
  const kind: SegmentKind[] = new Array(n);
  const f = newFrame();
  let bi = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.min(end, i * step);
    track.sample(s, f);
    xs[i] = -f.pos.x;
    ys[i] = -f.pos.z;
    while (bi < ranges.length && s >= ranges[bi].s1) bi++;
    block[i] = bi < ranges.length && s >= ranges[bi].s0 ? bi : -1;
    kind[i] = track.kindAt(s);
  }
  // the turn that fits the box best (every 7.5 degrees)
  const A = Math.max(0.2, Math.min(5, aspect || 1));
  let best = 0;
  let bestScale = -1;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += 2) {
      const x = xs[i] * c - ys[i] * sn;
      const y = xs[i] * sn + ys[i] * c;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const sc = Math.min(A / Math.max(1, x1 - x0), 1 / Math.max(1, y1 - y0));
    if (sc > bestScale * 1.02) {
      bestScale = sc;
      best = a;
    }
  }
  // start on the left
  {
    const c = Math.cos(best);
    const sn = Math.sin(best);
    if (xs[0] * c - ys[0] * sn > xs[n - 1] * c - ys[n - 1] * sn) best += Math.PI;
  }
  const c = Math.cos(best);
  const sn = Math.sin(best);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i] * c - ys[i] * sn;
    const y = xs[i] * sn + ys[i] * c;
    xs[i] = x;
    ys[i] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const boxW = w / h > A ? w : h * A;
  const boxH = boxW / A;
  for (let i = 0; i < n; i++) {
    xs[i] = (xs[i] - minX + (boxW - w) / 2) / boxW;
    ys[i] = (ys[i] - minY + (boxH - h) / 2) / boxH;
  }
  return { xs, ys, block, kind, n, aspect: A };
}

/** where the data box sits on a w x h canvas: X = ox + xs * sx, Y = oy + ys * sy (module-level, no allocation) */
export const frame = { ox: 0, oy: 0, sx: 1, sy: 1, size: 1 };
export function mapFrame(d: MapData, w: number, h: number, pad = Math.min(w, h) * 0.1): typeof frame {
  const sy = Math.max(1, Math.min((w - pad * 2) / d.aspect, h - pad * 2));
  frame.sx = sy * d.aspect;
  frame.sy = sy;
  frame.ox = (w - frame.sx) / 2;
  frame.oy = (h - sy) / 2;
  frame.size = Math.min(frame.sx, sy);
  return frame;
}

export interface MapStyle {
  colors: readonly string[];
  /** highlighted block (-1 = none) */
  sel: number;
  /** blocks with a validation problem */
  bad?: ReadonlySet<number>;
  /** 0..1 along the course: the runner dot (< 0 = none) */
  dot?: number;
  pad?: number;
}

/** Fit the unit square into w x h (keeping the aspect) and draw. */
export function drawMap(c: CanvasRenderingContext2D, w: number, h: number, d: MapData, st: MapStyle): void {
  const fr = mapFrame(d, w, h, st.pad);
  const { ox, oy, sx, sy } = fr;
  const X = (i: number) => ox + d.xs[i] * sx;
  const Y = (i: number) => oy + d.ys[i] * sy;
  const lw = Math.max(3, Math.min(w, h) / 34);
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // ink outline under the whole course
  c.strokeStyle = '#2a1c14';
  c.lineWidth = lw + 4;
  c.beginPath();
  for (let i = 0; i < d.n; i++) (i ? c.lineTo : c.moveTo).call(c, X(i), Y(i));
  c.stroke();
  // selected block glow
  if (st.sel >= 0) {
    c.strokeStyle = 'rgba(255,247,234,.95)';
    c.lineWidth = lw + 10;
    c.beginPath();
    let on = false;
    for (let i = 0; i < d.n; i++) {
      if (d.block[i] === st.sel) {
        (on ? c.lineTo : c.moveTo).call(c, X(i), Y(i));
        on = true;
      }
    }
    if (on) c.stroke();
  }
  // per-block colours, run by run
  let i0 = 0;
  while (i0 < d.n - 1) {
    const b = d.block[i0];
    const k = d.kind[i0];
    let i1 = i0 + 1;
    while (i1 < d.n - 1 && d.block[i1] === b && d.kind[i1] === k) i1++;
    const base = b >= 0 ? (st.colors[b] ?? '#fff7ea') : '#efe2c8';
    c.lineWidth = lw;
    c.setLineDash([]);
    if (k === 'gap') {
      c.strokeStyle = '#2a1c14';
      c.lineWidth = lw + 4;
      c.setLineDash([1, lw * 1.6]);
    } else if (k === 'river') c.strokeStyle = '#4cc3ff';
    else if (k === 'cloud') {
      c.strokeStyle = '#ffffff';
      c.setLineDash([lw * 1.4, lw]);
    } else c.strokeStyle = st.bad?.has(b) ? '#ff2f4f' : base;
    c.beginPath();
    c.moveTo(X(i0), Y(i0));
    for (let i = i0 + 1; i <= i1; i++) c.lineTo(X(i), Y(i));
    c.stroke();
    i0 = i1;
  }
  c.setLineDash([]);
  // start flag (green) and finish (chequered)
  const flag = (x: number, y: number, finish: boolean) => {
    const r = Math.max(6, lw * 1.5);
    c.fillStyle = finish ? '#fff7ea' : '#7ccf5a';
    c.strokeStyle = '#2a1c14';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (finish) {
      c.fillStyle = '#2a1c14';
      const q = r * 0.55;
      c.fillRect(x - q, y - q, q, q);
      c.fillRect(x, y, q, q);
    }
  };
  flag(X(0), Y(0), false);
  flag(X(d.n - 1), Y(d.n - 1), true);
  // the runner dot
  if (st.dot !== undefined && st.dot >= 0) {
    const f = Math.min(d.n - 1.001, st.dot * (d.n - 1));
    const a = Math.floor(f);
    const t = f - a;
    const x = X(a) + (X(a + 1) - X(a)) * t;
    const y = Y(a) + (Y(a + 1) - Y(a)) * t;
    c.fillStyle = '#ff8a2a';
    c.strokeStyle = '#2a1c14';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(x, y, Math.max(5, lw * 1.25), 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}
