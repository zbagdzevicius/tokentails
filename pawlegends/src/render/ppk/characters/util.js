// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/util.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// Shared helpers for the characters area. No DOM / WebGL access at import time (node --test safe).
import * as THREE from 'three';
import { assetUrl as coreAssetUrl } from '../stubs/core/Assets.js';

/** Seeded PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential damping toward a target. */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Tiny critically-damped spring for secondary motion (tech.md §11.2). */
export class Spring {
  constructor(k = 120, c = 2 * Math.sqrt(k)) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, dt) {
    const h = Math.min(dt, 1 / 30);
    this.v += (this.k * (target - this.x) - this.c * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }
  reset(x = 0) { this.x = x; this.v = 0; }
}

/** Value noise in 3D (cheap, deterministic) for coat patterns. Returns [0, 1]. */
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (i, j, k) => {
    let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise3(x * f, y * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/** sRGB hex/string → linear THREE.Color (ColorManagement handles the conversion). Cached. */
const _colorCache = new Map();
export function col(c) {
  if (c && c.isColor) return c;
  let v = _colorCache.get(c);
  if (!v) { v = new THREE.Color(c); _colorCache.set(c, v); }
  return v;
}
/** Linear rgb array from a colour input. */
export function rgb(c) { if (Array.isArray(c)) return c; const k = col(c); return [k.r, k.g, k.b]; }
/** Mix two linear rgb arrays. */
export function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

/** 2D canvas (DOM or OffscreenCanvas). Returns null when neither exists (node tests). */
export function canvas2d(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

let _resolve = coreAssetUrl;
/** Route asset URLs through the game's resolver (runtime.initCharacters passes ctx.assets.url). */
export function setAssetResolver(fn) { _resolve = typeof fn === 'function' ? fn : coreAssetUrl; }
/**
 * Character mesh detail (QUALITY.charDetail; GAME_DESIGN §18 Low budget): a 0..1 factor on the tessellation of cats
 * built from now on (armour, body, head fur, tail). 1 = full detail; Low uses ~0.55 (the lite tier's density). Read at
 * build time: a quality change applies to cats built after it (runtime.initCharacters / E.QUALITY write it).
 */
let _charDetail = 1;
export function setCharDetail(k) { _charDetail = Number.isFinite(k) ? clamp(k, 0.3, 1) : 1; }
export function charDetail() { return _charDetail; }
/** Scale a segment count by a detail factor (never below `min`; 1 = unchanged). */
export function segScale(n, k = _charDetail, min = 5) { return k >= 1 ? n : Math.max(Math.min(min, n), Math.round(n * k)); }
/** Asset URL under public/assets (tech.md §2: BASE_URL + 'assets/...'; CONTRIBUTING §9: via core's resolver). */
export function assetUrl(p) { return _resolve(p); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Compose a matrix from [x,y,z], [rx,ry,rz] (XYZ euler), scale (number | [x,y,z]). */
export function mat(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ') {
  _e.set(rot[0], rot[1], rot[2], order); _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
}

/**
 * Geometry collector: merges many primitive pieces into ONE indexed BufferGeometry with custom attributes.
 * Each piece can bake a transform, a vertex colour (constant or function), per-vertex material params
 * `rmse` = (roughness, metalness, sheen, emissive), fur params, and rigid/smooth skin weights.
 */
export class GeoBuilder {
  /** @param {{skinned?: boolean, fur?: boolean}} opts */
  constructor({ skinned = false, fur = false } = {}) {
    this.skinned = skinned; this.fur = fur;
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.rmse = []; this.furA = []; this.comb = []; this.si = []; this.sw = []; this.idx = [];
    this.count = 0;
  }
  /**
   * @param {THREE.BufferGeometry} geo
   * @param {object} o
   * @param {THREE.Matrix4} [o.matrix]
   * @param {*} [o.color] colour | (p, n, lp) => [r,g,b] (linear)
   * @param {number[]|Function} [o.rmse] [rough, metal, sheen, emissive]
   * @param {number[]|Function} [o.fur] [mask, lenMul]
   * @param {number} [o.bone] rigid bone index
   * @param {Function} [o.skin] (p) => [i0, i1, i2, i3, w0, w1, w2, w3]
   * @param {Function} [o.uvFn] (p, lp, n) => [u, v]
   * @param {boolean} [o.flip] reverse winding (for mirrored matrices)
   */
  add(geo, o = {}) {
    const g = geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const m = o.matrix || null;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const flip = o.flip ?? (m ? m.determinant() < 0 : false);
    const base = this.count;
    const v = new THREE.Vector3(), n = new THREE.Vector3(), lp = new THREE.Vector3();
    const keep = o.keepColors && g.attributes.color;
    const CA = keep ? g.attributes.color : null, RA = keep ? g.attributes.rmse : null;
    if (keep) { o = { ...o, color: (v, nn, l, i) => [CA.getX(i), CA.getY(i), CA.getZ(i)], rmse: RA ? (v, nn, l, i) => [RA.getX(i), RA.getY(i), RA.getZ(i), RA.getW(i)] : [0.8, 0, 0, 0] }; }
    const cConst = (o.color !== undefined && typeof o.color !== 'function') ? (Array.isArray(o.color) ? o.color : rgb(o.color)) : null;
    const rConst = Array.isArray(o.rmse) ? o.rmse : (o.rmse ? null : [0.8, 0, 0, 0]);
    const fConst = Array.isArray(o.fur) ? o.fur : (o.fur ? null : [0, 0]);
    for (let i = 0; i < P.count; i++) {
      lp.fromBufferAttribute(P, i); v.copy(lp);
      if (N) n.fromBufferAttribute(N, i); else n.set(0, 1, 0);
      if (m) { v.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
      this.pos.push(v.x, v.y, v.z); this.nrm.push(n.x, n.y, n.z);
      if (o.uvFn) { const uv = o.uvFn(v, lp, n); this.uv.push(uv[0], uv[1]); } else if (U) this.uv.push(U.getX(i), U.getY(i)); else this.uv.push(0, 0);
      const c = cConst || (o.color ? o.color(v, n, lp, i) : [1, 1, 1]);
      this.col.push(c[0], c[1], c[2]);
      const r = rConst || o.rmse(v, n, lp, i); this.rmse.push(r[0], r[1], r[2], r[3]);
      if (this.fur) {
        const f = fConst || o.fur(v, n, lp, i); this.furA.push(f[0], f[1]);
        const cb = Array.isArray(o.comb) ? o.comb : o.comb ? o.comb(v, n, lp, i) : [0, -0.55, -1];
        this.comb.push(cb[0], cb[1], cb[2]);
      }
      if (this.skinned) {
        if (o.skin) { const s = o.skin(v, lp, i); this.si.push(s[0], s[1], s[2], s[3]); this.sw.push(s[4], s[5], s[6], s[7]); }
        else { this.si.push(o.bone ?? 0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
      }
    }
    if (g.index) {
      const I = g.index.array;
      for (let i = 0; i < I.length; i += 3) {
        if (flip) this.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]);
        else this.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
      }
    } else {
      for (let i = 0; i + 2 < P.count; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    this.count += P.count;
    return this;
  }
  get empty() { return this.count === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('rmse', new THREE.Float32BufferAttribute(this.rmse, 4));
    if (this.fur) { g.setAttribute('fur', new THREE.Float32BufferAttribute(this.furA, 2)); g.setAttribute('comb', new THREE.Float32BufferAttribute(this.comb, 3)); }
    if (this.skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    const IndexArr = this.count > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new THREE.BufferAttribute(new IndexArr(this.idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/**
 * Cone with a rounded tip (art.md §2.2 ears: "tip rounded by lerping the top ring"), built as a lathe:
 * straight flank from the base radius up to `tipFrac` of the height, then an elliptical cap.
 * Base at y = 0, tip at y = h.
 */
export function roundedCone(r0, h, radial = 24, tipR = 0.3, tipFrac = 0.8) {
  const pts = [new THREE.Vector2(0.0001, 0)];
  const rc = r0 * tipR, yc = h * tipFrac;
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(THREE.MathUtils.lerp(r0, rc, t), yc * t)); }
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, rc * Math.cos(a)), yc + (h - yc) * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, radial);
}

/**
 * Cupped cat ear (art.md §2.2; review: "flat cardboard wedges"): a rounded cone, flattened front-to-back, whose front
 * is pressed into a hollow so the ear has a thick rounded rim and a concave inner bowl. Lathe seam at the back.
 * Returns the geometry plus per-vertex `front` (cos of the angle to +Z: 1 = middle of the bowl, < 0 = back of the
 * ear), `t` (0 base .. 1 tip) and `cup` (0 on the rim .. 1 deep in the bowl) for colouring and fur masks.
 * @param {number} r0 base radius  @param {number} h height  @param {{depth?: number, cup?: number, radial?: number, rows?: number}} [o]
 */
export function earGeometry(r0, h, o = {}) {
  const depth = o.depth ?? 0.6, cupK = o.cup ?? 0.78, radial = o.radial ?? 28, rows = o.rows ?? 14;
  const pts = [];
  const tipR = 0.2, yc = h * 0.82, rc = r0 * tipR;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    pts.push(new THREE.Vector2(THREE.MathUtils.lerp(r0, rc, Math.pow(t, 0.92)) * (1 + 0.06 * Math.sin(Math.PI * t)), yc * t));
  }
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, rc * Math.cos(a)), yc + (h - yc) * Math.sin(a))); }
  const g = new THREE.LatheGeometry(pts, radial, Math.PI);   // phiStart = PI: the seam sits at the back (-Z)
  const P = g.attributes.position, n = P.count;
  const front = new Float32Array(n), tArr = new Float32Array(n), cup = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const r = Math.hypot(x, z) || 1e-6, c = z / r;          // c = cos(angle from +Z)
    const t = clamp(y / h, 0, 1);
    // the bowl: the front middle is pushed back behind the ear's axis; the rim (|angle| ~ 60°) stays proud.
    // It shallows toward the tip and the base (where it meets the head).
    const bowl = c > 0 ? Math.pow(c, 3) : 0;
    const k = cupK * smoothstep(0.0, 0.18, t) * (1 - smoothstep(0.72, 0.97, t));
    P.setZ(i, r * (depth * c - k * bowl));
    front[i] = c; tArr[i] = t; cup[i] = bowl * (k / Math.max(cupK, 1e-6));
  }
  g.computeVertexNormals();
  return { geo: g, front, t: tArr, cup };
}

/** Pinch the inner end of a loop shape along x (art.md §2.6 bow loops). */
export function pinchX(geo, width, minScale = 0.4) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = smoothstep(0, 1, Math.abs(x) / width) * (1 - minScale) + minScale;
    p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * (0.5 + 0.5 * k));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Character quality switches read when a cat is BUILT (runtime.initCharacters maps core's QUALITY preset onto them):
 * `tufts` = QUALITY.charTufts (Low: no tuft cards), `outline` = QUALITY.outline ('hero' | 'heroCompanionsEngaged' |
 * 'all'), `playLod` = in-game cats build the play-LOD set (ART §6.4; tools / tests default to the full set).
 */
export const CHAR_Q = { tufts: true, outline: 'hero', playLod: false };
/** @param {{ tufts?: boolean, outline?: string, playLod?: boolean }} o */
export function setCharQuality(o = {}) {
  if (typeof o.tufts === 'boolean') CHAR_Q.tufts = o.tufts;
  if (typeof o.outline === 'string') CHAR_Q.outline = o.outline;
  if (typeof o.playLod === 'boolean') CHAR_Q.playLod = o.playLod;
}
