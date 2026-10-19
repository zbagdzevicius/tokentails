// Copied from bad-cat/src/render/geo.ts at 4889ed41 (copy, never import; adapted for formula-meow).
/**
 * Procedural low-poly geometry builder: adds primitives (box, cylinder, cone, sphere, ring) with a
 * transform and a flat vertex colour, then merges them into ONE non-indexed BufferGeometry with flat
 * normals. Everything that shares the toon material (room, props, human parts) is built this way, so
 * a whole piece of furniture or a prop is a single draw call. Pure three.js maths: works in Node.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

export interface Xf {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export interface AddOpts {
  /** Darken vertices near this world height (baked ambient occlusion); undefined = off. */
  aoFloor?: number;
  /** Strength of the AO darkening (0..1), default 0.22. */
  aoStrength?: number;
  /** Per-triangle brightness jitter (hand-painted look), default 0.035. */
  vary?: number;
  /** Fur mask for cat parts: 1 = patterned fur, 0 = fixed vertex colour. */
  fur?: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export function xfMatrix(t: Xf | Matrix4 | undefined): Matrix4 {
  if (!t) return _m.identity();
  if (t instanceof Matrix4) return t;
  _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  return _m.compose(_p, _q, _s);
}

/** Small deterministic hash -> 0..1 (render-only jitter). */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export class GeoBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private fur: number[] = [];
  private tri = 0;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Add any geometry (it is converted to non-indexed and transformed). */
  add(geo: BufferGeometry, color: number, t?: Xf | Matrix4, o: AddOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = xfMatrix(t);
    const p = g.getAttribute('position');
    _c.setHex(color);
    const vary = o.vary ?? 0.035;
    const ao = o.aoFloor ?? 0;
    const aoK = o.aoStrength ?? 0.22;
    const fur = o.fur ?? 0;
    const v = new Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      if (i % 3 === 0) this.tri++;
      let k = 1 + (hash01(this.tri * 7 + 3) - 0.5) * 2 * vary;
      if (o.aoFloor !== undefined) {
        const h = Math.max(0, Math.min(1, (v.y - ao) / 0.35));
        k *= 1 - aoK * (1 - h);
      }
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
      this.fur.push(fur);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: number, t?: Xf, o?: AddOpts): this {
    return this.add(new BoxGeometry(w, h, d), color, t, o);
  }

  /** Box whose bottom sits at t.y (handy for furniture). */
  boxUp(w: number, h: number, d: number, color: number, t: Xf = {}, o?: AddOpts): this {
    const g = new BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, color, t, o);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, color: number, t?: Xf, o?: AddOpts): this {
    return this.add(new CylinderGeometry(rTop, rBot, h, seg), color, t, o);
  }

  /** Cylinder whose bottom sits at t.y. */
  cylUp(rTop: number, rBot: number, h: number, seg: number, color: number, t: Xf = {}, o?: AddOpts): this {
    const g = new CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    return this.add(g, color, t, o);
  }

  cone(r: number, h: number, seg: number, color: number, t?: Xf, o?: AddOpts): this {
    return this.add(new ConeGeometry(r, h, seg), color, t, o);
  }

  sphere(r: number, color: number, t?: Xf, o?: AddOpts, wSeg = 7, hSeg = 5): this {
    return this.add(new SphereGeometry(r, wSeg, hSeg), color, t, o);
  }

  ico(r: number, color: number, t?: Xf, o?: AddOpts, detail = 0): this {
    return this.add(new IcosahedronGeometry(r, detail), color, t, o);
  }

  torus(r: number, tube: number, color: number, t?: Xf, o?: AddOpts, radial = 4, tubular = 10): this {
    return this.add(new TorusGeometry(r, tube, radial, tubular), color, t, o);
  }

  /** Horizontal quad (y up). */
  quad(w: number, d: number, color: number, t: Xf = {}, o?: AddOpts): this {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, t, o);
  }

  /** Merge into one geometry with flat normals. `withFur` adds the aFur attribute (cat parts). */
  build(withFur = false): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    if (withFur) g.setAttribute('aFur', new BufferAttribute(new Float32Array(this.fur), 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
