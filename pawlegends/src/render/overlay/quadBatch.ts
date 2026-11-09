/**
 * PERF-IOS §8 Track A: the overlay's quad batch. The overhead bars, names and arrows used to be a full-screen 2D canvas
 * cleared and redrawn every frame (0.75 Mpx rasterised on the CPU on iOS, 3,000–3,600 Canvas 2D calls a second). Now
 * every frame emits quads into one Float32Array (no allocation per frame) and render/overlay/glOverlay.ts draws them in
 * ONE WebGL draw over the scene, in emit order (painter's order inside one draw is kept by the GPU).
 *
 * Coordinates in are CSS px; the batch scales them by `k` (drawing-buffer px per CSS px) and snaps rects and stamps to
 * whole device pixels, so bars stay crisp and 1:1 stamps sample their atlas texels exactly. Three primitives:
 *   - rect: a solid rectangle (it samples the atlas's white block);
 *   - stamp: an atlas sprite (text, pills, crowns, glyphs: render/overlay/atlas.ts), centred, optionally scaled/rotated;
 *   - line / polyline: thick lines with mitred joins and a 1 px anti-aliased edge (fragment shader, `aux`).
 * Colours are premultiplied. Pure (no DOM, no GL), unit-tested in tests/unit/perf-overlay.test.ts.
 */

/** Floats per vertex: x, y (device px), u, v, r, g, b, a (premultiplied), d (signed px across a line), hw (half width, ≤ 0: no AA). */
export const VERT_FLOATS = 10;
export const QUAD_FLOATS = VERT_FLOATS * 4;
/** The most quads one frame can hold (6 heroes, ~40 minions, towers, rings: a busy fight is ~400). */
export const MAX_QUADS = 4096;

export type Rgba = readonly [number, number, number, number];

const colors = new Map<string, Rgba>();
const TRANSPARENT: Rgba = Object.freeze([0, 0, 0, 0]) as Rgba;

/** CSS colour → [r, g, b, a] 0..1 (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()). Cached; unknown strings are transparent. */
export function parseColor(css: string): Rgba {
  const hit = colors.get(css);
  if (hit) return hit;
  let out: Rgba = TRANSPARENT;
  const s = css.trim();
  if (s[0] === '#') {
    const h = s.slice(1);
    const full = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h;
    const n = (i: number): number => parseInt(full.slice(i, i + 2), 16) / 255;
    if (full.length === 6 || full.length === 8) out = [n(0), n(2), n(4), full.length === 8 ? n(6) : 1];
  } else {
    const m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && p.every((v) => Number.isFinite(v))) out = [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
    }
  }
  if (colors.size > 512) colors.clear();
  colors.set(css, out);
  return out;
}

/** An atlas region: texture coordinates (0..1) and its size in device px. */
export interface StampRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Size in device px (the region is drawn 1:1 at scale 1). */
  pw: number;
  ph: number;
}

export class QuadBatch {
  readonly data = new Float32Array(MAX_QUADS * QUAD_FLOATS);
  /** Quads emitted this frame. */
  count = 0;
  /** Quads dropped this frame (the batch was full). */
  dropped = 0;
  /** Device px per CSS px. */
  k = 1;
  /** Multiplies every emitted alpha (a plate under the HUD fades). */
  alpha = 1;
  /** The atlas's solid white texel (rects and lines sample it). */
  white: { u: number; v: number } = { u: 0, v: 0 };

  begin(k: number): void {
    this.k = k > 0 ? k : 1;
    this.count = 0;
    this.dropped = 0;
    this.alpha = 1;
  }

  private vert(o: number, x: number, y: number, u: number, v: number, c: Rgba, a: number, d: number, hw: number): void {
    const p = this.data;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = u;
    p[o + 3] = v;
    p[o + 4] = c[0] * a;
    p[o + 5] = c[1] * a;
    p[o + 6] = c[2] * a;
    p[o + 7] = a;
    p[o + 8] = d;
    p[o + 9] = hw;
  }

  /** The next quad's offset, or -1 when the batch is full. */
  private next(): number {
    if (this.count >= MAX_QUADS) {
      this.dropped++;
      return -1;
    }
    return this.count++ * QUAD_FLOATS;
  }

  /** A solid rectangle (CSS px), edges snapped to device px, at least 1 device px wide and tall. */
  rect(x: number, y: number, w: number, h: number, color: string | Rgba, alpha = 1): void {
    if (!(w > 0) || !(h > 0)) return;
    const c = typeof color === 'string' ? parseColor(color) : color;
    const a = c[3] * alpha * this.alpha;
    if (a <= 0.002) return;
    const k = this.k;
    const x0 = Math.round(x * k);
    const y0 = Math.round(y * k);
    const x1 = Math.max(x0 + 1, Math.round((x + w) * k));
    const y1 = Math.max(y0 + 1, Math.round((y + h) * k));
    const o = this.next();
    if (o < 0) return;
    const { u, v } = this.white;
    this.vert(o, x0, y0, u, v, c, a, 0, -1);
    this.vert(o + VERT_FLOATS, x1, y0, u, v, c, a, 0, -1);
    this.vert(o + VERT_FLOATS * 2, x1, y1, u, v, c, a, 0, -1);
    this.vert(o + VERT_FLOATS * 3, x0, y1, u, v, c, a, 0, -1);
  }

  /** A rectangle's outline `lw` CSS px wide, centred on the edge (Canvas strokeRect). */
  strokeRect(x: number, y: number, w: number, h: number, lw: number, color: string | Rgba, alpha = 1): void {
    const hl = lw / 2;
    this.rect(x - hl, y - hl, w + lw, lw, color, alpha);
    this.rect(x - hl, y + h - hl, w + lw, lw, color, alpha);
    this.rect(x - hl, y + hl, lw, h - lw, color, alpha);
    this.rect(x + w - hl, y + hl, lw, h - lw, color, alpha);
  }

  /**
   * An atlas stamp centred on (cx, cy) CSS px, `scale`d and turned by `rot` rad about its centre. Unscaled, unturned
   * stamps are snapped to whole device px (1:1 texels: text stays as crisp as the 2D canvas drew it).
   */
  stamp(s: StampRegion | null, cx: number, cy: number, scale = 1, rot = 0, alpha = 1, tint: Rgba = WHITE): void {
    if (!s) return;
    const a = alpha * this.alpha * tint[3];
    if (a <= 0.002) return;
    const o = this.next();
    if (o < 0) return;
    const k = this.k;
    const c: Rgba = tint;
    if (scale === 1 && rot === 0) {
      const x0 = Math.round(cx * k - s.pw / 2);
      const y0 = Math.round(cy * k - s.ph / 2);
      this.vert(o, x0, y0, s.u0, s.v0, c, a, 0, -1);
      this.vert(o + VERT_FLOATS, x0 + s.pw, y0, s.u1, s.v0, c, a, 0, -1);
      this.vert(o + VERT_FLOATS * 2, x0 + s.pw, y0 + s.ph, s.u1, s.v1, c, a, 0, -1);
      this.vert(o + VERT_FLOATS * 3, x0, y0 + s.ph, s.u0, s.v1, c, a, 0, -1);
      return;
    }
    const hw = (s.pw / 2) * scale;
    const hh = (s.ph / 2) * scale;
    const co = Math.cos(rot);
    const si = Math.sin(rot);
    const X = cx * k;
    const Y = cy * k;
    const put = (i: number, dx: number, dy: number, u: number, v: number): void => this.vert(o + VERT_FLOATS * i, X + dx * co - dy * si, Y + dx * si + dy * co, u, v, c, a, 0, -1);
    put(0, -hw, -hh, s.u0, s.v0);
    put(1, hw, -hh, s.u1, s.v0);
    put(2, hw, hh, s.u1, s.v1);
    put(3, -hw, hh, s.u0, s.v1);
  }

  /** One thick line segment (CSS px), butt caps, anti-aliased edges. */
  line(x0: number, y0: number, x1: number, y1: number, width: number, color: string | Rgba, alpha = 1): void {
    const P = this.pts;
    P[0] = x0;
    P[1] = y0;
    P[2] = x1;
    P[3] = y1;
    this.polyline(P, 2, false, width, color, alpha);
  }

  /** Scratch points for `line` and the callers' polylines (x, y pairs, CSS px). */
  readonly pts = new Float64Array(2 * 64);

  /**
   * A thick polyline through `n` points of `pts` (x, y pairs, CSS px), mitred joins (the mitre is capped at 3 × the
   * half width), closed when `closed`. Each segment is one quad; neighbours share their join edge, so a translucent
   * line does not double-blend at the joins.
   */
  polyline(pts: ArrayLike<number>, n: number, closed: boolean, width: number, color: string | Rgba, alpha = 1): void {
    if (n < 2 || !(width > 0)) return;
    const c = typeof color === 'string' ? parseColor(color) : color;
    const a = c[3] * alpha * this.alpha;
    if (a <= 0.002) return;
    const k = this.k;
    // half width in device px, +1 px of fringe for the anti-aliased edge
    const hw = Math.max(0.5, (width * k) / 2);
    const ext = hw + 1;
    const { u, v } = this.white;
    const segs = closed ? n : n - 1;
    // the offset (device px) at point i: the mitre of its two segments' normals
    const off = this.off;
    for (let i = 0; i < n; i++) {
      const ip = i === 0 ? (closed ? n - 1 : -1) : i - 1;
      const inx = i === n - 1 ? (closed ? 0 : -1) : i + 1;
      let nx = 0;
      let ny = 0;
      let cnt = 0;
      let n0x = 0;
      let n0y = 0;
      if (ip >= 0) {
        const dx = (pts[2 * i] - pts[2 * ip]) * k;
        const dy = (pts[2 * i + 1] - pts[2 * ip + 1]) * k;
        const l = Math.hypot(dx, dy) || 1;
        n0x = -dy / l;
        n0y = dx / l;
        nx += n0x;
        ny += n0y;
        cnt++;
      }
      if (inx >= 0) {
        const dx = (pts[2 * inx] - pts[2 * i]) * k;
        const dy = (pts[2 * inx + 1] - pts[2 * i + 1]) * k;
        const l = Math.hypot(dx, dy) || 1;
        const mx = -dy / l;
        const my = dx / l;
        if (!cnt) {
          n0x = mx;
          n0y = my;
        }
        nx += mx;
        ny += my;
        cnt++;
      }
      const l = Math.hypot(nx, ny);
      if (l < 1e-6) {
        nx = n0x;
        ny = n0y;
      } else {
        nx /= l;
        ny /= l;
      }
      // mitre length: 1 / cos(half the turn), capped
      const dot = nx * n0x + ny * n0y;
      const m = Math.min(3, 1 / Math.max(1 / 3, dot));
      off[2 * i] = nx * m;
      off[2 * i + 1] = ny * m;
    }
    for (let s = 0; s < segs; s++) {
      const i = s;
      const j = (s + 1) % n;
      const o = this.next();
      if (o < 0) return;
      const ax = pts[2 * i] * k;
      const ay = pts[2 * i + 1] * k;
      const bx = pts[2 * j] * k;
      const by = pts[2 * j + 1] * k;
      const oax = off[2 * i] * ext;
      const oay = off[2 * i + 1] * ext;
      const obx = off[2 * j] * ext;
      const oby = off[2 * j + 1] * ext;
      this.vert(o, ax + oax, ay + oay, u, v, c, a, ext, hw);
      this.vert(o + VERT_FLOATS, bx + obx, by + oby, u, v, c, a, ext, hw);
      this.vert(o + VERT_FLOATS * 2, bx - obx, by - oby, u, v, c, a, -ext, hw);
      this.vert(o + VERT_FLOATS * 3, ax - oax, ay - oay, u, v, c, a, -ext, hw);
    }
  }

  private readonly off = new Float64Array(2 * 64);
}

const WHITE: Rgba = Object.freeze([1, 1, 1, 1]) as Rgba;
