/**
 * Raised ground (render only): every nav cell the static grid blocks (the forest, the jungle walls, the outer rim) and
 * the ground past the map edge stand on one raised block, RAISE.h tall, with a cap, a light rim along its top edge and
 * darker sides, so where a hero cannot walk reads as a wall at a glance. The outline runs along the cell edges
 * (marching squares on the cell centres, corners cut at 45°): every blocked cell centre is raised, no walkable cell
 * centre is, and a walkable cell is touched only in a corner triangle (1/8 of it) where the cliff turns. `low` keeps a zone at ground level (the river and its banks, each
 * fountain plaza where it runs past the map edge).
 *
 * Two merged meshes: the sides (they write depth, so they hide what stands behind them) and the caps, drawn after the
 * other opaque meshes without writing depth, so the ground decals (telegraphs, range rings, rings under the heroes)
 * still show over a cap and nothing on the walkable ground is ever covered by one. The sides and the caps cut away
 * round the sight line to every hero (like the canopy cut), so a hero behind a block stays in view.
 */
import * as THREE from 'three';

export const RAISE = Object.freeze({
  /** Cap height (m): above the knee of a hero, under a bush's top. */
  h: 0.85,
  /** Sight-line cut (m): full inside `inner`, none past `outer`; only above `minY` (m). */
  inner: 0.75,
  outer: 1.25,
  minY: 0.12,
});

/** The sampled raise mask: one sample per nav cell centre, `pad` cells past each map edge. */
export interface RaiseGrid {
  nx: number;
  ny: number;
  /** Cell size (m). */
  cell: number;
  pad: number;
  /** (nx + 2 pad) × (ny + 2 pad), row major from (−pad, −pad). */
  raised: Uint8Array;
}

/**
 * `blocked(i, j)`: the static nav cell (0 ≤ i < nx, 0 ≤ j < ny) blocks a hero. Past the map edge every sample is
 * raised. `low(x, y)` (m): keep that sample at ground level whatever it is.
 */
export function raiseGrid(nx: number, ny: number, cell: number, pad: number, blocked: (i: number, j: number) => boolean, low: (x: number, y: number) => boolean): RaiseGrid {
  const sx = nx + 2 * pad;
  const sy = ny + 2 * pad;
  const raised = new Uint8Array(sx * sy);
  for (let J = 0; J < sy; J++) {
    const j = J - pad;
    for (let I = 0; I < sx; I++) {
      const i = I - pad;
      const inside = i >= 0 && j >= 0 && i < nx && j < ny;
      const on = inside ? blocked(i, j) : true;
      if (on && !low((i + 0.5) * cell, (j + 0.5) * cell)) raised[J * sx + I] = 1;
    }
  }
  return { nx, ny, cell, pad, raised };
}

/** Is the sample of cell (i, j) raised (cells past the padded edge are not)? */
export function sampleRaised(g: RaiseGrid, i: number, j: number): boolean {
  const I = i + g.pad;
  const J = j + g.pad;
  const sx = g.nx + 2 * g.pad;
  if (I < 0 || J < 0 || I >= sx || J >= g.ny + 2 * g.pad) return false;
  return g.raised[J * sx + I] === 1;
}

type P2 = readonly [number, number];
// unit square corners and edge midpoints (x right, y up), plus the centre
const BL: P2 = [0, 0];
const BR: P2 = [1, 0];
const TR: P2 = [1, 1];
const TL: P2 = [0, 1];
const B: P2 = [0.5, 0];
const R: P2 = [1, 0.5];
const T: P2 = [0.5, 1];
const L: P2 = [0, 0.5];

/**
 * The raised polygons (counter-clockwise, unit square) of a dual square by its corners' case (bit 0 bottom-left,
 * 1 bottom-right, 2 top-right, 3 top-left): marching squares through the edge midpoints, so a staircase of cells
 * reads as a straight 45° cliff. A low corner among raised ones loses a triangle of its quarter (at most 1/8 of that
 * walkable cell, in its corner, never its centre); the saddles keep the two raised corners apart.
 */
const CASES: readonly (readonly (readonly P2[])[])[] = [
  [],
  [[BL, B, L]],
  [[B, BR, R]],
  [[BL, BR, R, L]],
  [[R, TR, T]],
  [
    [BL, B, L],
    [R, TR, T],
  ],
  [[B, BR, TR, T]],
  [[BL, BR, TR, T, L]],
  [[L, T, TL]],
  [[BL, B, T, TL]],
  [
    [B, BR, R],
    [L, T, TL],
  ],
  [[BL, BR, R, T, TL]],
  [[L, R, TR, TL]],
  [[BL, B, R, TR, TL]],
  [[B, BR, TR, TL, L]],
  [[BL, BR, TR, TL]],
];

const isCorner = (p: P2): boolean => (p[0] === 0 || p[0] === 1) && (p[1] === 0 || p[1] === 1);

function caseAt(g: RaiseGrid, i: number, j: number): number {
  return (sampleRaised(g, i, j) ? 1 : 0) | (sampleRaised(g, i + 1, j) ? 2 : 0) | (sampleRaised(g, i + 1, j + 1) ? 4 : 0) | (sampleRaised(g, i, j + 1) ? 8 : 0);
}

function inPoly(x: number, y: number, poly: readonly P2[]): boolean {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a];
    const [xb, yb] = poly[b];
    if (ya > y !== yb > y && x < xa + ((xb - xa) * (y - ya)) / (yb - ya)) inside = !inside;
  }
  return inside;
}

/** Is the ground at (x, y) m raised (inside a cap)? */
export function raisedAt(g: RaiseGrid, x: number, y: number): boolean {
  const u = x / g.cell - 0.5;
  const v = y / g.cell - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const polys = CASES[caseAt(g, i, j)];
  if (polys.length === 0) return false;
  if (polys.length === 1 && polys[0].length === 4 && polys[0] === CASES[15][0]) return true;
  for (const p of polys) if (inPoly(u - i, v - j, p)) return true;
  return false;
}

/** The height (m) of the ground at (x, y): RAISE.h on a cap, 0 elsewhere (where to stand a tree or a rock). */
export const groundAt = (g: RaiseGrid, x: number, y: number): number => (raisedAt(g, x, y) ? RAISE.h : 0);

/** Colours of the block (hex): the cap, its rim (along the top edge), the sides at the top and at the foot. */
export interface RaiseColors {
  cap: number;
  rim: number;
  side: number;
  foot: number;
}

/** The two geometries (three.js axes: x = map x, z = −map y), and their sizes for the tests. */
export interface RaiseGeometry {
  caps: THREE.BufferGeometry;
  sides: THREE.BufferGeometry;
  /** Wall segments (each a side quad). */
  segments: number;
}

/** UV tile (m) on the caps (a tileable grass map can follow the ground's). */
export function buildRaise(g: RaiseGrid, col: RaiseColors, uvTile = 12.8): RaiseGeometry {
  const h = RAISE.h;
  const c = g.cell;
  const cp: number[] = [];
  const cc: number[] = [];
  const cu: number[] = [];
  const sp: number[] = [];
  const sn: number[] = [];
  const sc: number[] = [];
  const su: number[] = [];
  const cap = new THREE.Color(col.cap);
  const rim = new THREE.Color(col.rim);
  const side = new THREE.Color(col.side);
  const foot = new THREE.Color(col.foot);
  const capV = (x: number, y: number, k: THREE.Color): void => {
    cp.push(x, h, -y);
    cc.push(k.r, k.g, k.b);
    cu.push(x / uvTile, y / uvTile);
  };
  let segments = 0;
  const x0 = -g.pad;
  const y0 = -g.pad;
  const x1 = g.nx + g.pad - 1;
  const y1 = g.ny + g.pad - 1;
  for (let j = y0; j < y1; j++) {
    let run = -1;
    const flush = (end: number): void => {
      if (run < 0) return;
      // a run of full squares: one quad (cell centres (run, j) … (end, j + 1))
      const ax = (run + 0.5) * c;
      const bx = (end + 1.5) * c;
      const ay = (j + 0.5) * c;
      const by = (j + 1.5) * c;
      capV(ax, ay, cap);
      capV(bx, ay, cap);
      capV(bx, by, cap);
      capV(ax, ay, cap);
      capV(bx, by, cap);
      capV(ax, by, cap);
      run = -1;
    };
    for (let i = x0; i < x1; i++) {
      const k = caseAt(g, i, j);
      if (k === 15) {
        if (run < 0) run = i;
        continue;
      }
      flush(i - 1);
      if (k === 0) continue;
      const ox = (i + 0.5) * c;
      const oy = (j + 0.5) * c;
      for (const poly of CASES[k]) {
        const at = (p: P2): [number, number] => [ox + p[0] * c, oy + p[1] * c];
        // the cap: a fan from the first point (every case polygon is convex)
        const v0 = at(poly[0]);
        for (let n = 1; n + 1 < poly.length; n++) {
          const va = at(poly[n]);
          const vb = at(poly[n + 1]);
          capV(v0[0], v0[1], isCorner(poly[0]) ? cap : rim);
          capV(va[0], va[1], isCorner(poly[n]) ? cap : rim);
          capV(vb[0], vb[1], isCorner(poly[n + 1]) ? cap : rim);
        }
        // the sides: every edge between two non-corner points (the outline), outward to its right
        for (let n = 0; n < poly.length; n++) {
          const p = poly[n];
          const q = poly[(n + 1) % poly.length];
          if (isCorner(p) || isCorner(q)) continue;
          const [px, py] = at(p);
          const [qx, qy] = at(q);
          const dx = qx - px;
          const dy = qy - py;
          const len = Math.hypot(dx, dy);
          const nx = dy / len;
          const nz = dx / len;
          const quad: [number, number, number, THREE.Color, number][] = [
            [px, 0, -py, foot, 0],
            [qx, 0, -qy, foot, len],
            [qx, h, -qy, side, len],
            [px, 0, -py, foot, 0],
            [qx, h, -qy, side, len],
            [px, h, -py, side, 0],
          ];
          for (const [x, y, z, k2, u] of quad) {
            sp.push(x, y, z);
            sn.push(nx, 0, nz);
            sc.push(k2.r, k2.g, k2.b);
            su.push((px + qx) / 2 / uvTile + u / uvTile, y / uvTile);
          }
          segments++;
        }
      }
    }
    flush(x1 - 1);
  }
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  const up = new Float32Array(cp.length);
  for (let n = 1; n < up.length; n += 3) up[n] = 1;
  caps.setAttribute('normal', new THREE.BufferAttribute(up, 3));
  caps.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  caps.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
  caps.computeBoundingSphere();
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sides.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  sides.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  sides.computeBoundingSphere();
  return { caps, sides, segments };
}

/** The canopy-cut uniforms the map views share (the lens and every live hero's sight point). */
export interface SightUniforms {
  uLens: { value: THREE.Vector3 };
  uSee: { value: THREE.Vector4[] };
}

/**
 * Cut the block away round each sight line (camera → hero), above RAISE.minY, with the canopy's ordered dither; and
 * past the map rectangle (W × H m), darken like the outer grass. Chains onto the material's own onBeforeCompile.
 */
export function raiseMaterial(mat: THREE.MeshLambertMaterial, u: SightUniforms, slots: number, W: number, H: number, key: string): THREE.MeshLambertMaterial {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRW;\nuniform vec3 uLens;\nuniform vec4 uSee[${slots}];`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  if (vRW.y > ${RAISE.minY.toFixed(2)}) {
    float cut = 0.0;
    for (int i = 0; i < ${slots}; i++) {
      if (uSee[i].w < 0.5) continue;
      vec3 ab = uSee[i].xyz - uLens;
      float t = clamp(dot(vRW - uLens, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
      if (t < 0.98) cut = max(cut, 1.0 - smoothstep(${RAISE.inner.toFixed(2)}, ${RAISE.outer.toFixed(2)}, length(vRW - (uLens + ab * t))));
    }
    float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (cut > th) discard;
  }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  vec2 ro = max(vec2(-vRW.x, vRW.x - ${W.toFixed(1)}), 0.0);
  vec2 rp = max(vec2(vRW.z, -vRW.z - ${H.toFixed(1)}), 0.0);
  gl_FragColor.rgb *= 1.0 - 0.22 * smoothstep(4.0, 40.0, length(vec2(max(ro.x, ro.y), max(rp.x, rp.y))));`,
      );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** The two meshes: sides (depth-writing, cast shadows) and caps (no depth write, drawn after the opaque scenery). */
export function raiseMeshes(geo: RaiseGeometry, capMat: THREE.Material, sideMat: THREE.Material): { caps: THREE.Mesh; sides: THREE.Mesh } {
  capMat.depthWrite = false;
  const caps = new THREE.Mesh(geo.caps, capMat);
  caps.name = 'raised-caps';
  caps.renderOrder = 1;
  caps.receiveShadow = true;
  caps.matrixAutoUpdate = false;
  const sides = new THREE.Mesh(geo.sides, sideMat);
  sides.name = 'raised-sides';
  sides.receiveShadow = true;
  sides.matrixAutoUpdate = false;
  return { caps, sides };
}
