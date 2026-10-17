/**
 * Room Maker overlay (GDD 6.4): grid lines on every cell's top surface, the hover cell, red bad cells (unreachable
 * target, blocked spawn), gold Must-Wreck rings and the spawn paw. Two draw calls: the grid lines (built once per
 * room) and one dynamic mesh for everything else (rebuilt only when the overlay changes).
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Color,
} from 'three';
import type { EditorOverlay, PlayableRoom as Play } from '../../types';
import { CELL_M } from '../../types';
import { cellX, cellZ, levelY } from '../space';

const HOVER = 0xfff3c4;
const BAD = 0xff4d4d;
const GOLD = 0xffc93c;
const PAW = 0xfffaf2;
/** The human's view cone while marking targets. */
const LOOK = 0x9fd3ff;
/** The Roomba's road and the human's spot while placing props (round 2: a tap there was refused unexplained). */
const ROAD = 0x8fd694;
const HUMAN = 0xff9f7a;

/** Grid line segments over every cell's top surface (pure; exported for tests). */
export function gridLines(levels: ArrayLike<number>, w: number, d: number): Float32Array {
  const out: number[] = [];
  const h = CELL_M / 2;
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const y = levelY(levels[z * w + x] ?? 0) + 0.006;
      const cx = cellX(x, w);
      const cz = cellZ(z, d);
      const c = [
        [cx - h, cz - h],
        [cx + h, cz - h],
        [cx + h, cz + h],
        [cx - h, cz + h],
      ];
      for (let i = 0; i < 4; i++) {
        const a = c[i];
        const b = c[(i + 1) % 4];
        out.push(a[0], y, a[1], b[0], y, b[1]);
      }
    }
  return Float32Array.from(out);
}

export class EditorOverlayView {
  readonly group = new Group();
  private lines: LineSegments;
  private dyn: Mesh;
  private dynMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private key = '';

  constructor(private readonly play: Play) {
    const sh = play.shell;
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(gridLines(sh.levels, sh.width, sh.depth), 3));
    this.lines = new LineSegments(lg, new LineBasicMaterial({ color: 0xfffaf2, transparent: true, opacity: 0.35, depthWrite: false }));
    this.lines.name = 'editor-grid';
    this.lines.renderOrder = 4;
    this.dyn = new Mesh(new BufferGeometry(), this.dynMat);
    this.dyn.name = 'editor-overlay';
    this.dyn.renderOrder = 4;
    this.dyn.frustumCulled = false;
    this.group.add(this.lines, this.dyn);
    this.group.visible = false;
  }

  /** null hides. `props` gives the target rings' cells (x, z, level) by prop index. */
  set(o: EditorOverlay | null, props: readonly { x: number; z: number; level: number }[]): void {
    this.group.visible = !!o;
    if (!o) return;
    this.lines.visible = o.grid;
    const key = JSON.stringify([o.hover ?? null, o.bad ?? [], o.look ?? [], o.road ?? [], o.human ?? [], o.targets ?? [], o.spawn ?? null, (o.targets ?? []).map((i) => props[i] ?? null)]);
    if (key === this.key) return;
    this.key = key;
    this.rebuild(o, props);
  }

  private rebuild(o: EditorOverlay, props: readonly { x: number; z: number; level: number }[]): void {
    const sh = this.play.shell;
    const W = sh.width;
    const D = sh.depth;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    const add = (geo: BufferGeometry, m: Matrix4, color: number): void => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const p = g.getAttribute('position');
      c.setHex(color);
      const v = [0, 0, 0];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const e = m.elements;
        v[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
        v[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        v[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        pos.push(v[0], v[1], v[2]);
        col.push(c.r, c.g, c.b);
      }
      if (g !== geo) g.dispose();
      geo.dispose();
    };
    const at = (x: number, z: number, lift = 0.01): Matrix4 => {
      const lv = sh.levels[z * W + x] ?? 0;
      return new Matrix4().makeTranslation(cellX(x, W), levelY(lv) + lift, cellZ(z, D)).multiply(new Matrix4().makeRotationX(-Math.PI / 2));
    };
    const quad = (): BufferGeometry => {
      const g = new BufferGeometry();
      const h = CELL_M / 2 - 0.015;
      g.setAttribute('position', new BufferAttribute(Float32Array.from([-h, -h, 0, h, -h, 0, h, h, 0, -h, -h, 0, h, h, 0, -h, h, 0]), 3));
      return g;
    };
    const badSet = new Set(o.bad ?? []);
    for (const [cells, color] of [
      [o.road ?? [], ROAD],
      [o.human ?? [], HUMAN],
    ] as const) {
      for (const i of cells) {
        if (badSet.has(i)) continue;
        const x = i % W;
        const z = (i - x) / W;
        if (z >= 0 && z < D) add(quad(), at(x, z, 0.0105), color);
      }
    }
    for (const i of o.look ?? []) {
      if (badSet.has(i)) continue;
      const x = i % W;
      const z = (i - x) / W;
      if (z >= 0 && z < D) add(quad(), at(x, z, 0.011), LOOK);
    }
    for (const i of o.bad ?? []) {
      const x = i % W;
      const z = (i - x) / W;
      if (z >= 0 && z < D) add(quad(), at(x, z, 0.012), BAD);
    }
    if (o.hover && o.hover.x >= 0 && o.hover.z >= 0 && o.hover.x < W && o.hover.z < D) add(quad(), at(o.hover.x, o.hover.z, 0.014), HOVER);
    for (const pi of o.targets ?? []) {
      const p = props[pi];
      if (!p) continue;
      const m = new Matrix4().makeTranslation(cellX(p.x, W), levelY(p.level) + 0.016, cellZ(p.z, D)).multiply(new Matrix4().makeRotationX(-Math.PI / 2));
      add(new RingGeometry(0.15, 0.19, 24), m, GOLD);
    }
    if (o.spawn) {
      // a paw: the pad and four toe beans
      const m = at(o.spawn.x, o.spawn.z, 0.018);
      add(new CircleGeometry(0.07, 14), m.clone().multiply(new Matrix4().makeTranslation(0, -0.03, 0)), PAW);
      for (const [dx, dy] of [
        [-0.075, 0.045],
        [-0.028, 0.085],
        [0.028, 0.085],
        [0.075, 0.045],
      ])
        add(new CircleGeometry(0.03, 10), m.clone().multiply(new Matrix4().makeTranslation(dx, dy, 0)), PAW);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    g.setAttribute('color', new BufferAttribute(Float32Array.from(col), 3));
    this.dyn.geometry.dispose();
    this.dyn.geometry = g;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
    this.dyn.geometry.dispose();
    this.dynMat.dispose();
  }
}

