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
 * All cones live in ONE dynamic mesh (one draw call): a faint centre fading to a brighter outer
 * rim. A cone is re-clipped only when its sim inputs (position, facing, radius, doors) change, and
 * only the used part of the vertex buffer is uploaded.
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

/**
 * Per-guard constants (origin + facing, radius + sweep phase, colour + alpha) are uniform arrays
 * indexed by a per-vertex guard id, so the vertex buffer holds only positions and ids and changes
 * only when a cone's shape changes (a sim tick moved or turned a guard, or a door changed), not
 * every animation frame (the ALERT pulse, the colour of the mode).
 */
const CONE_VERT = /* glsl */ `
  attribute float aG;
  uniform vec4 uCol[CONE_N];
  uniform vec4 uO[CONE_N];
  uniform vec2 uR[CONE_N];
  varying vec4 vColor;
  varying vec4 vO;
  varying vec2 vR;
  varying vec2 vW;
  void main() {
    int i = int(aG + 0.5);
    vColor = uCol[i];
    vO = uO[i];
    vR = uR[i];
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
    #ifdef XRAY
    // Behind walls: a flatter copy so a cone hidden by tall walls still reads (playtest: from the
    // heist-08 hall the yard sentry's cone behind the wall was too faint to time a crossing).
    a = clamp(fill * 0.8 + rim * 0.6, 0.0, 0.65);
    #endif
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

/** Cone shape inputs cached per guard: x, z, fx, fz, radius, visible. */
const KEY_LEN = 6;

export class VisionCones {
  readonly mesh: THREE.Mesh;
  /** The same cones drawn only where walls hide the floor (depth test inverted), fainter. */
  readonly xray: THREE.Mesh;
  private readonly xrayMat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly gid: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly maxVerts: number;
  private readonly guards: number;
  /** Vertex capacity of one guard's cone. */
  private readonly perGuard: number;
  private readonly polyA = makePoly();
  private readonly polyB = makePoly();
  /** Per-guard clipped triangles (x, z pairs in world units) and their vertex counts. */
  private readonly tris: Float32Array[] = [];
  private readonly counts: Int32Array;
  private readonly keys: Float64Array;
  private blockKey: unknown = undefined;
  private readonly uCol: THREE.Vector4[] = [];
  private readonly uO: THREE.Vector4[] = [];
  private readonly uR: THREE.Vector2[] = [];
  /** Cone rebuilds so far (a guard's shape changed); tests and perf probes read it. */
  rebuilds = 0;

  /** `maxRadius`: the largest guard vision radius in tiles (sizes the vertex buffer). */
  constructor(maxGuards: number, maxRadius = 8) {
    const guards = Math.max(1, maxGuards);
    this.guards = guards;
    const span = 2 * Math.ceil(Math.max(1, maxRadius)) + 2;
    // A quarter disc of tiles (~span^2 / 3 with margin), each up to MAX_POLY - 2 triangles.
    this.perGuard = Math.ceil((span * span) / 2) * 3 * 10;
    this.maxVerts = guards * this.perGuard;
    this.pos = new Float32Array(this.maxVerts * 3);
    this.gid = new Float32Array(this.maxVerts);
    for (let g = 0; g < guards; g++) {
      this.tris.push(new Float32Array(this.perGuard * 2));
      this.uCol.push(new THREE.Vector4());
      this.uO.push(new THREE.Vector4(0, 0, 1, 0));
      this.uR.push(new THREE.Vector2(1, g * 2.1));
    }
    this.counts = new Int32Array(guards);
    this.keys = new Float64Array(guards * KEY_LEN).fill(NaN);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aG', new THREE.BufferAttribute(this.gid, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      defines: { CONE_N: guards },
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: { uTime: { value: 0 }, uHdr: { value: 1 }, uCol: { value: this.uCol }, uO: { value: this.uO }, uR: { value: this.uR } },
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
    this.xrayMat = new THREE.ShaderMaterial({
      defines: { CONE_N: guards, XRAY: 1 },
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: this.mat.uniforms,
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
    });
    this.xray = new THREE.Mesh(this.geo, this.xrayMat);
    this.xray.frustumCulled = false;
    this.xray.renderOrder = 3;
    this.xray.name = 'vision-cones-xray';
    this.mesh.add(this.xray);
  }

  /** Animation time and HDR boost for the rim / sweep glow (1 = no boost, e.g. low tier). */
  setTime(time: number, hdr = 1): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uHdr.value = hdr;
  }

  /** Vertices drawn (3 per triangle). */
  get vertexCount(): number {
    return this.geo.drawRange.count;
  }

  /**
   * Rebuild the cones whose shape inputs changed. `blockKey` identifies what `sees` depends on
   * besides the level (e.g. which doors are open): when it changes every cone is rebuilt. Omit it
   * to rebuild every cone on every call.
   */
  update(cones: ConeInput[], sees: SeesTileFn, blockKey?: unknown): void {
    const all = blockKey === undefined || blockKey !== this.blockKey;
    this.blockKey = blockKey;
    const K = this.keys;
    let dirty = false;
    const n = Math.min(cones.length, this.guards);
    for (let g = 0; g < this.guards; g++) {
      const k = g < n ? cones[g] : null;
      const on = !!k && k.visible && k.radius > 0 && (k.fx !== 0 || k.fz !== 0);
      if (k) {
        // Per-frame look: colour, alpha (the ALERT pulse), origin and radius for the shader.
        this.uCol[g].set(k.color.r, k.color.g, k.color.b, k.alpha);
        this.uO[g].set(k.x, k.z, k.fx, k.fz);
        this.uR[g].x = k.radius;
      }
      const o = g * KEY_LEN;
      const vis = on ? 1 : 0;
      if (!all && K[o + 5] === vis && (!on || (K[o] === k!.x && K[o + 1] === k!.z && K[o + 2] === k!.fx && K[o + 3] === k!.fz && K[o + 4] === k!.radius))) continue;
      K[o + 5] = vis;
      if (on) {
        K[o] = k!.x;
        K[o + 1] = k!.z;
        K[o + 2] = k!.fx;
        K[o + 3] = k!.fz;
        K[o + 4] = k!.radius;
        this.counts[g] = this.build(k!, sees, this.tris[g]);
      } else this.counts[g] = 0;
      dirty = true;
    }
    if (!dirty) return;
    this.rebuilds++;
    // Pack the cached cones back to back (one draw call) and upload only the used range.
    const P = this.pos;
    const G = this.gid;
    let v = 0;
    for (let g = 0; g < this.guards; g++) {
      const c = this.counts[g];
      const T = this.tris[g];
      for (let i = 0; i < c; i++, v++) {
        P[v * 3] = T[i * 2];
        P[v * 3 + 1] = 0;
        P[v * 3 + 2] = T[i * 2 + 1];
        G[v] = g;
      }
    }
    this.geo.setDrawRange(0, v);
    if (v > 0) {
      const pa = this.geo.attributes.position as THREE.BufferAttribute;
      const ga = this.geo.attributes.aG as THREE.BufferAttribute;
      pa.clearUpdateRanges();
      pa.addUpdateRange(0, v * 3);
      pa.needsUpdate = true;
      ga.clearUpdateRanges();
      ga.addUpdateRange(0, v);
      ga.needsUpdate = true;
    }
  }

  /** Clip every candidate tile around one guard into `out` (x, z pairs); returns the vertex count. */
  private build(k: ConeInput, sees: SeesTileFn, out: Float32Array): number {
    const A = this.polyA;
    const B = this.polyB;
    const cap = this.perGuard;
    const r = k.radius;
    const gx = Math.floor(k.x), gz = Math.floor(k.z);
    const ri = Math.ceil(r) + 1;
    let v = 0;
    for (let tz = gz - ri; tz <= gz + ri; tz++) {
      for (let tx = gx - ri; tx <= gx + ri; tx++) {
        const n = clipTileToCone(k.x, k.z, k.fx, k.fz, r, tx, tz, A, B);
        if (n < 3) continue;
        if (!sees(gx, gz, tx, tz)) continue;
        if (v + (n - 2) * 3 > cap) break;
        for (let i = 1; i < n - 1; i++) {
          // Tiles are wound clockwise seen from above; emit counter-clockwise (front faces up).
          out[v * 2] = k.x + A.x[0];
          out[v * 2 + 1] = k.z + A.z[0];
          v++;
          out[v * 2] = k.x + A.x[i + 1];
          out[v * 2 + 1] = k.z + A.z[i + 1];
          v++;
          out[v * 2] = k.x + A.x[i];
          out[v * 2 + 1] = k.z + A.z[i];
          v++;
        }
      }
    }
    return v;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.xrayMat.dispose();
  }
}
