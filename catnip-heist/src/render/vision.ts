/**
 * Guard vision cones: translucent fans on the floor that show EXACTLY what the sim can see.
 *
 * The sim spots a cat when the cat's point is inside the integer 90-degree cone (radius
 * visionTiles, |cross| <= dot around the 4-way facing) AND the tile-to-tile line of sight from the
 * guard's tile to the cat's tile is clear. So the seen region is
 *   cone  ∩  union { tile T : lineOfSight(guardTile, T) }
 * and that is what we draw: every candidate tile passing the sim's own lineOfSight is clipped
 * (convex polygon clipping) against the two cone edges and the vision disc, then triangulated.
 * The cone uses the sim position and the sim facing of the current tick (no smoothing), so the
 * picture never disagrees with the rules.
 *
 * All cones live in ONE dynamic mesh (one draw call) with RGBA vertex colours: a faint centre
 * fading to a brighter outer rim.
 */
import * as THREE from 'three';

/** Half-angle of the cone (matches the sim: 45 deg). */
export const CONE_HALF = Math.PI / 4;
/** Segments of the polygon that approximates the vision disc when clipping. */
const DISC_SEGMENTS = 48;
/** Max vertices a single clipped tile polygon can have (4 + 2 cone edges + disc edges crossed). */
const MAX_POLY = 24;

export type BlockFn = (tx: number, ty: number) => boolean;

/**
 * Distance (in tiles) from (ox, oz) along (dx, dz) (unit) to the first blocking tile, capped at max.
 * World x = tile x, world z = tile y. (Kept as a utility; cones no longer ray-march.)
 */
export function marchRay(ox: number, oz: number, dx: number, dz: number, max: number, blocked: BlockFn): number {
  let tx = Math.floor(ox);
  let tz = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - ox : ox - tx) * tDeltaX : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? tz + 1 - oz : oz - tz) * tDeltaZ : Infinity;
  for (let i = 0; i < 64; i++) {
    let t: number;
    if (tMaxX < tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      tz += stepZ;
    }
    if (t >= max) return max;
    if (blocked(tx, tz)) return t;
  }
  return max;
}

/**
 * Sight predicate as the sim evaluates it: can a guard standing on tile (gx, gy) see a cat on tile
 * (tx, ty)? Must include "a cat could stand there" (walls/boxes/closed doors are false).
 */
export type SeesTileFn = (gx: number, gy: number, tx: number, ty: number) => boolean;

export interface ConeInput {
  /** Guard position in world tile units (sim pos / SUBTILE). */
  x: number;
  z: number;
  /** Sim facing (components -1|0|1, 4-way). */
  fx: number;
  fz: number;
  radius: number;
  color: THREE.Color;
  /** Fill alpha (rim is brighter). */
  alpha: number;
  visible: boolean;
}

export type Poly = { n: number; x: Float64Array; z: Float64Array };

export function makePoly(): Poly {
  return { n: 0, x: new Float64Array(MAX_POLY), z: new Float64Array(MAX_POLY) };
}

/** Clip `src` against the half-plane a*x + b*z + c >= 0 into `dst` (Sutherland-Hodgman). */
function clipHalf(src: Poly, dst: Poly, a: number, b: number, c: number): void {
  dst.n = 0;
  const n = src.n;
  if (n === 0) return;
  let px = src.x[n - 1], pz = src.z[n - 1];
  let pd = a * px + b * pz + c;
  for (let i = 0; i < n; i++) {
    const qx = src.x[i], qz = src.z[i];
    const qd = a * qx + b * qz + c;
    if (qd >= 0) {
      if (pd < 0 && dst.n < MAX_POLY) {
        const t = pd / (pd - qd);
        dst.x[dst.n] = px + (qx - px) * t;
        dst.z[dst.n++] = pz + (qz - pz) * t;
      }
      if (dst.n < MAX_POLY) {
        dst.x[dst.n] = qx;
        dst.z[dst.n++] = qz;
      }
    } else if (pd >= 0 && dst.n < MAX_POLY) {
      const t = pd / (pd - qd);
      dst.x[dst.n] = px + (qx - px) * t;
      dst.z[dst.n++] = pz + (qz - pz) * t;
    }
    px = qx;
    pz = qz;
    pd = qd;
  }
}

/**
 * The part of tile (tx, tz) inside the cone (origin o, 4-way facing f, radius r), written into
 * `out` in coordinates relative to the origin. Returns the vertex count (0 = none).
 */
export function clipTileToCone(ox: number, oz: number, fx: number, fz: number, r: number, tx: number, tz: number, out: Poly, tmp: Poly): number {
  const x0 = tx - ox, z0 = tz - oz;
  // Quick reject: nearest point of the tile further than r.
  const nx = Math.max(x0, Math.min(0, x0 + 1));
  const nz = Math.max(z0, Math.min(0, z0 + 1));
  if (nx * nx + nz * nz > r * r) return 0;
  out.n = 4;
  out.x[0] = x0; out.z[0] = z0;
  out.x[1] = x0 + 1; out.z[1] = z0;
  out.x[2] = x0 + 1; out.z[2] = z0 + 1;
  out.x[3] = x0; out.z[3] = z0 + 1;
  // Sim cone: dot = dx*fx + dz*fz, cross = dx*fz - dz*fx, inside iff |cross| <= dot.
  // dot - cross >= 0 and dot + cross >= 0.
  clipHalf(out, tmp, fx - fz, fz + fx, 0);
  clipHalf(tmp, out, fx + fz, fz - fx, 0);
  if (out.n < 3 || polyArea(out) < 1e-6) return 0;
  // Disc: only if some vertex is outside the radius.
  let far = false;
  for (let i = 0; i < out.n; i++) if (out.x[i] * out.x[i] + out.z[i] * out.z[i] > r * r) far = true;
  if (!far) return out.n;
  // Circumscribed-polygon edges: the inscribed-circle radius equals r, so the region never
  // shrinks inside the true disc (a sliver outside it of < 0.2% of r is acceptable).
  const R = r;
  let a = out, b = tmp;
  for (let k = 0; k < DISC_SEGMENTS; k++) {
    const ang = (k * 2 * Math.PI) / DISC_SEGMENTS;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    // Only edges facing into the cone's quadrant matter; skip those pointing backwards.
    if (cx * fx + cz * fz < -0.2) continue;
    clipHalf(a, b, -cx, -cz, R);
    const t = a;
    a = b;
    b = t;
    if (a.n < 3) return 0;
  }
  if (a !== out) {
    out.n = a.n;
    for (let i = 0; i < a.n; i++) {
      out.x[i] = a.x[i];
      out.z[i] = a.z[i];
    }
  }
  return polyArea(out) > 1e-6 ? out.n : 0;
}

/** Absolute area of a polygon (shoelace). */
function polyArea(p: Poly): number {
  let s = 0;
  for (let i = 0, j = p.n - 1; i < p.n; j = i++) s += p.x[j] * p.z[i] - p.x[i] * p.z[j];
  return Math.abs(s) / 2;
}

const CONE_VERT = /* glsl */ `
  attribute vec4 color;
  attribute vec4 aO;
  attribute vec2 aR;
  varying vec4 vColor;
  varying vec4 vO;
  varying vec2 vR;
  varying vec2 vW;
  void main() {
    vColor = color;
    vO = aO;
    vR = aR;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const CONE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHdr;
  varying vec4 vColor;
  varying vec4 vO;
  varying vec2 vR;
  varying vec2 vW;
  void main() {
    vec2 d = vW - vO.xy;
    vec2 f = normalize(vO.zw);
    float along = dot(d, f);
    float across = d.x * f.y - d.y * f.x;
    float dist = length(d);
    float r = vR.x;
    float nd = clamp(dist / r, 0.0, 1.0);
    // Angle across the 90 degree fan, -1..1.
    float ang = atan(across, max(along, 1e-4)) / 0.7853982;
    float fill = vColor.a * mix(0.55, 1.0, smoothstep(0.0, 0.9, nd));
    // Soft fade at the very apex so the cone grows out of the dog.
    fill *= smoothstep(0.0, 0.35, dist);
    // Radar bands every tile, drifting outwards.
    float band = smoothstep(0.08, 0.0, abs(fract(dist - uTime * 0.6) - 0.5) - 0.42);
    fill += vColor.a * 0.35 * band * nd;
    // Rim at the vision radius and along both edges.
    float rim = smoothstep(r - 0.2, r - 0.03, dist) * (1.0 - smoothstep(r - 0.03, r, dist) * 0.5) + smoothstep(0.93, 1.0, abs(ang)) * 0.35 * smoothstep(0.3, 1.0, nd);
    // Sweep line going back and forth across the fan.
    float sw = sin(uTime * 1.7 + vR.y) ;
    float sweep = smoothstep(0.09, 0.0, abs(ang - sw)) * smoothstep(0.1, 0.5, nd);
    float glow = clamp(rim, 0.0, 1.0) * 0.7 + sweep * 0.55;
    vec3 col = vColor.rgb * (1.0 + glow * (uHdr - 1.0) * 0.55);
    float a = clamp(fill + glow * 0.4, 0.0, 0.9);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

export class VisionCones {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly org: Float32Array;
  private readonly rad: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly maxVerts: number;
  private readonly polyA = makePoly();
  private readonly polyB = makePoly();

  /** `maxRadius`: the largest guard vision radius in tiles (sizes the vertex buffer). */
  constructor(maxGuards: number, maxRadius = 8) {
    const guards = Math.max(1, maxGuards);
    const span = 2 * Math.ceil(Math.max(1, maxRadius)) + 2;
    // A quarter disc of tiles (~span^2 / 3 with margin), each up to MAX_POLY - 2 triangles.
    this.maxVerts = guards * Math.ceil((span * span) / 2) * 3 * 10;
    this.pos = new Float32Array(this.maxVerts * 3);
    this.col = new Float32Array(this.maxVerts * 4);
    this.org = new Float32Array(this.maxVerts * 4);
    this.rad = new Float32Array(this.maxVerts * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aO', new THREE.BufferAttribute(this.org, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aR', new THREE.BufferAttribute(this.rad, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: { uTime: { value: 0 }, uHdr: { value: 1 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.position.y = 0.025;
    this.mesh.name = 'vision-cones';
  }

  /** Animation time and HDR boost for the rim / sweep glow (1 = no boost, e.g. low tier). */
  setTime(time: number, hdr = 1): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uHdr.value = hdr;
  }

  update(cones: ConeInput[], sees: SeesTileFn): void {
    let v = 0;
    const P = this.pos;
    const C = this.col;
    const O = this.org;
    const R = this.rad;
    const cap = this.maxVerts;
    const A = this.polyA;
    const B = this.polyB;
    for (let g = 0; g < cones.length; g++) {
      const k = cones[g];
      if (!k.visible || k.radius <= 0 || (k.fx === 0 && k.fz === 0)) continue;
      const r = k.radius;
      const gx = Math.floor(k.x), gz = Math.floor(k.z);
      const ri = Math.ceil(r) + 1;
      const cr = k.color.r, cg = k.color.g, cb = k.color.b;
      for (let tz = gz - ri; tz <= gz + ri; tz++) {
        for (let tx = gx - ri; tx <= gx + ri; tx++) {
          const n = clipTileToCone(k.x, k.z, k.fx, k.fz, r, tx, tz, A, B);
          if (n < 3) continue;
          if (!sees(gx, gz, tx, tz)) continue;
          if (v + (n - 2) * 3 > cap) break;
          for (let i = 1; i < n - 1; i++) {
            // Tiles are wound clockwise seen from above; emit counter-clockwise (front faces up).
            for (let q = 0; q < 3; q++) {
              const j = q === 0 ? 0 : q === 1 ? i + 1 : i;
              P[v * 3] = k.x + A.x[j];
              P[v * 3 + 1] = 0;
              P[v * 3 + 2] = k.z + A.z[j];
              C[v * 4] = cr;
              C[v * 4 + 1] = cg;
              C[v * 4 + 2] = cb;
              C[v * 4 + 3] = k.alpha;
              O[v * 4] = k.x;
              O[v * 4 + 1] = k.z;
              O[v * 4 + 2] = k.fx;
              O[v * 4 + 3] = k.fz;
              R[v * 2] = r;
              R[v * 2 + 1] = g * 2.1;
              v++;
            }
          }
        }
      }
    }
    this.geo.setDrawRange(0, v);
    for (const name of ['position', 'color', 'aO', 'aR']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
