/**
 * VoxelBuilder: accumulates axis-aligned boxes (with per-face baked shading) into ONE merged,
 * vertex-coloured BufferGeometry, so a whole garden of props is a single draw call.
 */
import * as THREE from 'three';

/** Face bits. */
export const PX = 1, NX = 2, PY = 4, NY = 8, PZ = 16, NZ = 32;
export const ALL_BUT_BOTTOM = PX | NX | PY | PZ | NZ;

/** Baked shade per face (multiplies the colour; lights add on top). */
const SHADE = { px: 0.84, nx: 0.72, py: 1.06, ny: 0.55, pz: 0.92, nz: 0.7 };

export class VoxelBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private nor: number[] = [];
  private idx: number[] = [];
  private tmp = new THREE.Color();

  get triangles(): number {
    return this.idx.length / 3;
  }

  /** Box from (x0,y0,z0) to (x1,y1,z1) in world units. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.ColorRepresentation, faces = ALL_BUT_BOTTOM, topColor?: THREE.ColorRepresentation): this {
    const c = this.tmp.set(color);
    const r = c.r, g = c.g, b = c.b;
    let tr = r, tg = g, tb = b;
    if (topColor !== undefined) {
      const t = new THREE.Color(topColor);
      tr = t.r;
      tg = t.g;
      tb = t.b;
    }
    if (faces & PY) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], tr * SHADE.py, tg * SHADE.py, tb * SHADE.py);
    if (faces & NY) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], r * SHADE.ny, g * SHADE.ny, b * SHADE.ny);
    if (faces & PZ) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], r * SHADE.pz, g * SHADE.pz, b * SHADE.pz);
    if (faces & NZ) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], r * SHADE.nz, g * SHADE.nz, b * SHADE.nz);
    if (faces & PX) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], r * SHADE.px, g * SHADE.px, b * SHADE.px);
    if (faces & NX) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], r * SHADE.nx, g * SHADE.nx, b * SHADE.nx);
    return this;
  }

  /** Box by centre (x, z), base y, half sizes and height. */
  block(cx: number, y: number, cz: number, hx: number, h: number, hz: number, color: THREE.ColorRepresentation, faces = ALL_BUT_BOTTOM, topColor?: THREE.ColorRepresentation): this {
    return this.box(cx - hx, y, cz - hz, cx + hx, y + h, cz + hz, color, faces, topColor);
  }

  /** Flat horizontal quad (top face only) at height y. */
  tile(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.ColorRepresentation): this {
    const c = this.tmp.set(color);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], c.r, c.g, c.b);
    return this;
  }

  private quad(a: number[], b: number[], c: number[], d: number[], n: number[], r: number, g: number, bl: number) {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) {
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(r, g, bl);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Small deterministic PRNG for layout (mulberry32). */
export function layoutRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
