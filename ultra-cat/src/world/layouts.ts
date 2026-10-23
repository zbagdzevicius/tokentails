// City layouts for every city except Meowhattan (downtown lives in city.ts, untouched). Owned by the CAMPAIGN lane.
// Build time only: allocations are fine here. Every layout keeps the street grid (streetAt(k) lines stay clear) so
// traffic, people and fish trucks work unchanged, stays under CAPS.segs / CAPS.trees, and puts the spawn on a street.
import * as THREE from 'three';
import { themeExtras, type ThemeExtras } from '../campaign/themes';
import { CAPS } from '../core/state';
import type { WorldDef } from '../core/types';
import { FLOOR, STYLE, type City, type Rect, type Style } from './city';
import { waterMaterial } from './props';

type Rnd = () => number;

interface Plan {
  x: number;
  z: number;
  hx: number;
  hz: number;
  count: number;
  value: number;
  style: Style;
  colors: number[]; // per floor, cycled
  lj: number; // lightness jitter
  setback: number;
  min: number; // floors kept when the segment budget squeezes heights
  after?: (bi: number) => void; // anchored props
}

/** Everything a layout needs while it builds. */
class Ctx {
  N: number;
  B: number;
  S: number;
  H: number;
  lot: number;
  x: ThemeExtras;
  plans: Plan[] = [];
  col = new THREE.Color();
  constructor(
    public c: City,
    public w: WorldDef,
    public rnd: Rnd,
  ) {
    this.N = w.n;
    this.B = w.block;
    this.S = w.street;
    this.H = c.half;
    this.lot = w.block - w.street;
    this.x = themeExtras(w.theme);
  }
  /** centre of lot i (0..N-1) */
  lc(i: number): number {
    return this.c.streetAt(i) + this.B / 2;
  }
  pick<T>(a: T[]): T {
    return a[Math.floor(this.rnd() * a.length) % a.length];
  }
  range(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }
  int(a: number, b: number): number {
    return Math.floor(a + this.rnd() * (b - a + 1));
  }
  value(mul = 1): number {
    return (this.w.valueBase + this.rnd() * this.w.valueRand) * mul;
  }
  /** centre factor 0..1 (1 in the middle of the city) */
  centre(x: number, z: number): number {
    return Math.max(0, 1 - Math.hypot(x, z) / (this.H * 1.2));
  }
  /** a tower height in floors from the world's height knobs */
  floors(x: number, z: number, mul = 1): number {
    const w = this.w;
    const tall = w.heightBase + this.rnd() * w.heightRand + this.centre(x, z) * (w.centreBoost + this.rnd() * w.centreRand);
    return Math.max(1, Math.round((tall * mul) / FLOOR));
  }
  plan(p: Partial<Plan> & Pick<Plan, 'x' | 'z' | 'hx' | 'hz' | 'count' | 'style' | 'colors'>): Plan {
    const full: Plan = { value: this.value(), lj: (this.rnd() - 0.5) * 0.08, setback: 999, min: 1, ...p };
    this.plans.push(full);
    return full;
  }
  tree(x: number, z: number, h: number, hex: number | null, widthMul = 0.55, base = 1): void {
    if (hex === null) this.col.setHSL(0.27 + this.rnd() * 0.06, 0.45, 0.32 + this.rnd() * 0.1);
    else this.col.setHex(hex).offsetHSL((this.rnd() - 0.5) * 0.03, 0, (this.rnd() - 0.5) * 0.08);
    this.c.addTree(x, z, h, this.col, base, widthMul);
  }
}

// ---------- shared pieces ----------
function groundPlane(k: Ctx, color: number, roughness = 1): void {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color, roughness }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  k.c.dyn.add(g);
}

/** Road centre dashes on every street line; skip(x, z) leaves out pieces (water, runway). */
function dashes(k: Ctx, color: number, glow: boolean, skip?: (x: number, z: number) => boolean): void {
  const d = k.c.decor;
  for (let i = 0; i <= k.N; i++) {
    const s = k.c.streetAt(i);
    for (let a = -k.H; a < k.H; a += 16) {
      const p = a + 4;
      if (!skip?.(s, p)) (glow ? d.glowBox : d.box).call(d, s, 0.05, p, 0.8, 0.1, 7, color);
      if (!skip?.(p, s)) (glow ? d.glowBox : d.box).call(d, p, 0.05, s, 7, 0.1, 0.8, color);
    }
  }
}

/** Emit planned buildings, squeezing heights if the city would overflow the segment pool. */
function emit(k: Ctx): void {
  const room = CAPS.segs - k.c.segs.n;
  let total = 0;
  for (const p of k.plans) total += p.count;
  const scale = total > room ? (room / total) * 0.995 : 1;
  for (const p of k.plans) {
    let count = p.count;
    if (scale < 1) count = Math.max(Math.min(p.min, p.count), Math.floor(p.count * scale));
    const setback = p.setback < 999 ? Math.max(1, Math.round(p.setback * (count / p.count))) : 999;
    const colors = p.colors;
    const lj = p.lj;
    const bi = k.c.addBuilding(p.x, p.z, p.hx, p.hz, count, p.value, p.style, (f, out) => out.setHex(colors[f % colors.length]).offsetHSL(0, 0, lj), setback);
    if (bi >= 0 && p.after) p.after(bi);
  }
  k.plans.length = 0;
}

/** Rotate a local (lx, lz) offset by yaw around (x, z). */
function rot(x: number, z: number, lx: number, lz: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

// ---------- props ----------
/** Gable roof (and maybe a chimney) on top of building bi. Falls with the top floor. */
function gableRoof(k: Ctx, bi: number, color: number, alongX: boolean, chimney: boolean): void {
  const b = k.c.buildings[bi];
  const y = b.count * FLOOR;
  const h = Math.min(9, Math.min(b.hx, b.hz) * 0.85);
  const P = k.c.props;
  if (!P.room('gable', 1)) return;
  P.begin(b.x, b.z, Math.max(b.hx, b.hz), 0, '', { anchor: b.first + b.count - 1 });
  const ox = alongX ? b.hz * 2 + 1.6 : b.hx * 2 + 1.6;
  const oz = alongX ? b.hx * 2 + 1.6 : b.hz * 2 + 1.6;
  P.part('gable', b.x, y + h / 2, b.z, ox, h, oz, color, alongX ? Math.PI / 2 : 0);
  if (chimney) P.part('box', b.x + (alongX ? b.hx * 0.45 : b.hx * 0.35), y + h * 0.55, b.z + (alongX ? b.hz * 0.3 : b.hz * 0.45), 2.4, h * 1.1, 2.4, 0x8a4a3a);
  P.end();
}

/** Arched hangar roof plus a big door on the front face. */
function hangarRoof(k: Ctx, bi: number, color: number, doorSide: 1 | -1): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  const y = b.count * FLOOR;
  const h = Math.min(16, b.hx * 0.55);
  if (P.room('arch', 1)) {
    P.begin(b.x, b.z, Math.max(b.hx, b.hz), 0, '', { anchor: b.first + b.count - 1 });
    P.part('arch', b.x, y + h / 2, b.z, b.hx * 2 + 1, h, b.hz * 2 + 1, color);
    P.end();
  }
  if (b.count >= 2 && P.room('box', 2)) {
    P.begin(b.x, b.z + doorSide * b.hz, 4, 0, '', { anchor: b.first + 1 });
    P.part('box', b.x, FLOOR - 0.5, b.z + doorSide * (b.hz + 0.35), b.hx * 1.4, FLOOR * 2 - 1.5, 0.7, 0x34352e);
    P.part('box', b.x, FLOOR * 2 - 0.6, b.z + doorSide * (b.hz + 0.5), b.hx * 1.5, 1.2, 1, 0xd8c27a);
    P.end();
  }
}

/** Neon sign slab on one face of building bi, spanning a few floors. Breaks off when those floors go. */
function neonSign(k: Ctx, bi: number, kMax: number): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  const top = Math.min(kMax, b.count) - 1;
  if (top < 2 || !P.room('glow', 4)) return;
  const hf = Math.min(top, k.int(2, 4));
  const k0 = Math.max(1, top - hf - k.int(0, Math.max(0, top - hf - 1)));
  const k1 = Math.min(top, k0 + hf - 1);
  const y0 = k0 * FLOOR + 1;
  const y1 = (k1 + 1) * FLOOR - 1;
  const h = y1 - y0;
  const face = k.int(0, 3);
  const onX = face < 2;
  const sgn = face % 2 === 0 ? 1 : -1;
  const w = Math.min(12, (onX ? b.hz : b.hx) * 1.5);
  const off = (k.rnd() - 0.5) * Math.max(0, (onX ? b.hz : b.hx) * 2 - w);
  const px = onX ? b.x + sgn * (b.hx + 1.2) : b.x + off;
  const pz = onX ? b.z + off : b.z + sgn * (b.hz + 1.2);
  const c1 = k.pick(k.x.signs);
  const c2 = k.pick(k.x.signs);
  P.begin(px, pz, w, 0.3, 'NEON ', { anchor: b.first + k1, kind: 'spark' });
  P.part('box', px, y0 + h / 2, pz, onX ? 1.2 : w + 1.2, h + 1.2, onX ? w + 1.2 : 1.2, 0x101018);
  // stacked glyph blocks so it reads as lettering
  const glyphs = Math.max(2, Math.min(4, Math.floor(h / 5)));
  const gh = h / glyphs;
  for (let i = 0; i < glyphs; i++) {
    const gw = w * (0.55 + k.rnd() * 0.35);
    const gy = y0 + gh * (i + 0.5);
    const o = sgn * 0.5;
    P.part('glow', onX ? px + o : px, gy, onX ? pz : pz + o, onX ? 0.6 : gw, gh * 0.7, onX ? gw : 0.6, i % 2 ? c2 : c1);
  }
  P.end();
}

/** Rooftop billboard on building bi. */
function billboard(k: Ctx, bi: number): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  if (!P.room('glow', 2) || !P.room('box', 2)) return;
  const y = b.count * FLOOR;
  const alongX = k.rnd() < 0.5;
  const w = (alongX ? b.hx : b.hz) * 1.7;
  P.begin(b.x, b.z, Math.max(b.hx, b.hz), 0.6, 'BILLBOARD ', { anchor: b.first + b.count - 1, kind: 'spark' });
  P.part('box', b.x, y + 2, b.z, alongX ? w * 0.6 : 1.2, 4, alongX ? 1.2 : w * 0.6, 0x15151c);
  P.part('glow', b.x, y + 8, b.z, alongX ? w : 1, 8, alongX ? 1 : w, k.pick(k.x.signs));
  P.end();
}

/** Thin antenna with a red tip on a tower roof. */
function antenna(k: Ctx, bi: number, shrink: number): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  if (!P.room('glow', 1)) return;
  const y = b.count * FLOOR;
  const h = k.range(10, 22);
  P.begin(b.x, b.z, 2, 0, '', { anchor: b.first + b.count - 1 });
  P.part('box', b.x + b.hx * 0.3 * shrink, y + h / 2, b.z, 0.9, h, 0.9, 0x8a8a96);
  P.part('glow', b.x + b.hx * 0.3 * shrink, y + h + 0.8, b.z, 1.8, 1.8, 1.8, 0xff3040);
  P.end();
}

/** Rotating radar dish on a lattice mast. */
function radarDish(k: Ctx, bi: number): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  if (!P.room('disc', 2)) return;
  const y = b.count * FLOOR;
  P.begin(b.x, b.z, 10, 2.5, 'RADAR ', { anchor: b.first + b.count - 1, spin: 1.1 + k.rnd() * 0.6 });
  P.part('disc', b.x, y + 1, b.z, 9, 2, 9, 0x6a6e66);
  P.part('box', b.x, y + 5, b.z, 1.6, 8, 1.6, 0x55584f);
  P.part('disc', b.x, y + 11, b.z, 26, 1.6, 26, 0xe8e6dc, 0, 1.05);
  P.part('box', b.x, y + 11, b.z, 1, 1, 12, 0x3a3a36, 0, 1.05);
  P.end();
}

/** Gantry crane on a quay deck; its boom reaches out over the water (+z). */
function crane(k: Ctx, x: number, z0: number, reach: number, color: number): void {
  const P = k.c.props;
  if (!P.room('box', 14)) return;
  const H = 48;
  P.begin(x, z0 + 9, 22, 4, 'CRANE ', { kind: 'spark' });
  for (const sx of [-12, 12]) for (const sz of [0, 18]) P.part('box', x + sx, H / 2, z0 + sz, 2.4, H, 2.4, color);
  P.part('box', x, H, z0, 27, 2.8, 2.8, color);
  P.part('box', x, H, z0 + 18, 27, 2.8, 2.8, color);
  for (const sx of [-12, 12]) P.part('box', x + sx, H * 0.42, z0 + 9, 1.6, 1.6, 18, color);
  P.part('box', x, H + 3.2, z0 + reach * 0.35, 4.4, 3.4, reach + 34, color);
  P.part('box', x, H - 1.5, z0 + 25, 6, 5, 6, 0xf2efe6);
  P.part('box', x, H + 3.5, z0 - 15, 8, 7, 8, 0x3f3f44);
  P.part('box', x, H - 12, z0 + reach * 0.85, 0.5, 26, 0.5, 0x222226);
  P.part('box', x, H - 26, z0 + reach * 0.85, 2.6, 2.6, 2.6, 0xf2c230);
  P.end();
}

/** A parked fighter jet (yaw 0 = nose toward +z). */
function fighter(k: Ctx, x: number, z: number, yaw: number): void {
  const P = k.c.props;
  if (!P.room('box', 12)) return;
  const grey = 0x8a9298;
  const p = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, c: number, dy = 0) => {
    const [wx, wz] = rot(x, z, lx, lz, yaw);
    P.part('box', wx, ly, wz, sx, sy, sz, c, yaw + dy);
  };
  P.begin(x, z, 12, 3, 'JET ', { kind: 'fire' });
  p(0, 3.6, 0, 3.4, 3.4, 22, grey);
  p(0, 3.6, 12.6, 2.2, 2.2, 4, 0x6a7076);
  p(0, 5.6, 5, 2, 1.6, 5.5, 0x24405e);
  p(-5.6, 3.1, -2, 9.5, 0.7, 8, grey, 0.32);
  p(5.6, 3.1, -2, 9.5, 0.7, 8, grey, -0.32);
  p(0, 7.4, -8.5, 0.6, 6.2, 4.2, 0x737b82);
  p(0, 3.8, -10, 9, 0.5, 3, grey);
  p(0, 3.6, -11.6, 2.4, 2.4, 1.2, 0x2a2a2a);
  p(0, 1, 6, 0.7, 2.6, 0.7, 0x333333);
  p(-3, 1, -2, 0.7, 2.6, 0.7, 0x333333);
  p(3, 1, -2, 0.7, 2.6, 0.7, 0x333333);
  P.end();
}

/** A big cargo plane (nose toward +x). */
function cargoPlane(k: Ctx, x: number, z: number): void {
  const P = k.c.props;
  if (!P.room('box', 14)) return;
  const c = 0x9aa08a;
  P.begin(x, z, 26, 8, 'CARGO JET ', { kind: 'fire' });
  P.part('box', x, 8, z, 48, 8, 8, c);
  P.part('box', x + 26, 7.5, z, 5, 6, 6, 0x7a806c);
  P.part('box', x + 22, 10.5, z, 4, 2, 6.4, 0x24405e);
  P.part('box', x + 2, 11.5, z, 10, 1.3, 58, c);
  P.part('box', x - 22, 16, z, 7, 13, 1.1, 0x7a806c);
  P.part('box', x - 23, 10, z, 5, 1, 22, c);
  for (const s of [-1, 1]) for (const d of [10, 20]) P.part('box', x + 3, 9.3, z + s * d, 7, 3, 3, 0x5a5e52);
  P.part('box', x + 14, 2, z, 1, 4, 1, 0x333333);
  P.part('box', x - 4, 2, z - 4, 1, 4, 1, 0x333333);
  P.part('box', x - 4, 2, z + 4, 1, 4, 1, 0x333333);
  P.end();
}

/** Water tower on stilts. Knock it over and the water goes everywhere (including on the cat). */
function waterTower(k: Ctx, x: number, z: number, color: number): void {
  const P = k.c.props;
  if (!P.room('box', 6) || !P.room('disc', 2)) return;
  P.begin(x, z, 10, 2.5, 'WATER TOWER ', { kind: 'splash' });
  for (const sx of [-5, 5]) for (const sz of [-5, 5]) P.part('box', x + sx, 13, z + sz, 1.2, 26, 1.2, 0x8a8a8a);
  P.part('disc', x, 31, z, 17, 11, 17, color);
  P.part('disc', x, 37.5, z, 12, 2, 12, 0xf2f2f2);
  P.end();
}

/** Fuel tank (cylinder). Burns when knocked over. */
function fuelTank(k: Ctx, x: number, z: number, d: number, h: number): void {
  const P = k.c.props;
  if (!P.room('disc', 2)) return;
  P.begin(x, z, d / 2 + 1, 1.5, 'FUEL ', { kind: 'fire' });
  P.part('disc', x, h / 2, z, d, h, d, 0xd8d4c4);
  P.part('disc', x, h * 0.55, z, d + 0.4, 1.4, d + 0.4, 0xc8322a);
  P.end();
}

/** Low hedge segment: trampled just by walking over it. */
function hedge(k: Ctx, x: number, z: number, len: number, alongX: boolean): void {
  const P = k.c.props;
  if (!P.room('box', 1)) return;
  P.begin(x, z, len / 2, 0.03, 'HEDGE ', { trample: true });
  P.part('box', x, 1.8, z, alongX ? len : 2.8, 3.4, alongX ? 2.8 : len, 0x3f7a32);
  P.end();
}

/** Playground: slide and swings in bright colours. */
function playground(k: Ctx, x: number, z: number): void {
  const P = k.c.props;
  if (!P.room('box', 9)) return;
  const a = k.x.accent;
  P.begin(x, z, 10, 0.5, 'PLAYGROUND ', { trample: true });
  P.part('box', x - 4, 3, z, 3, 6, 3, a[0]);
  P.part('box', x + 1, 3, z, 2.6, 0.5, 11, a[1], Math.PI / 2, 0.5);
  P.part('box', x - 4, 6.4, z, 3.6, 0.6, 3.6, a[2]);
  for (const s of [-1, 1]) P.part('box', x + s * 5, 3.5, z + 7, 0.6, 7, 0.6, a[3] ?? a[0]);
  P.part('box', x, 7, z + 7, 10.6, 0.6, 0.6, a[3] ?? a[0]);
  P.part('box', x - 2, 3, z + 7, 1.6, 0.4, 1, 0x333333);
  P.part('box', x + 2, 3, z + 7, 1.6, 0.4, 1, 0x333333);
  P.end();
}

// ---------- water ----------
function seaPlane(k: Ctx, z0: number): void {
  const mat = waterMaterial(k.x.water, k.x.foam);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2400), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.3, z0 + 1200);
  sea.receiveShadow = true;
  k.c.dyn.add(sea);
}

function pools(k: Ctx, list: Rect[]): void {
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), waterMaterial(k.x.water, k.x.foam), list.length);
  const m = new THREE.Matrix4();
  list.forEach((r, i) => {
    m.makeScale(r.x1 - r.x0, 1, r.z1 - r.z0).setPosition((r.x0 + r.x1) / 2, 1.22, (r.z0 + r.z1) / 2);
    mesh.setMatrixAt(i, m);
    k.c.decor.box((r.x0 + r.x1) / 2, 0.95, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 2.4, 0.3, r.z1 - r.z0 + 2.4, 0xf4f2ea);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  k.c.dyn.add(mesh);
}

// =====================================================================================================
// Catfish Wharf: the last row of blocks is harbour water crossed by wooden piers, ships moored in it,
// gantry cranes on the quay decks, a lighthouse. Land: long low warehouses and stacked container yards.
// =====================================================================================================
function buildDocks(k: Ctx): void {
  const { c, N, S, H, lot, x: X } = k;
  const th = k.w.theme;
  groundPlane(k, th.ground);
  const wr = N - 1; // the water row
  const zq = c.streetAt(wr) + S / 2; // where the quay ends and the water starts
  seaPlane(k, zq);
  c.terrain.waterName = 'EW, HARBOUR!';
  c.terrain.water.push({ x0: -3000, z0: zq, x1: 3000, z1: 3000 });
  // piers along every street line over the water, and the outer pier road
  for (let i = 0; i <= N; i++) {
    const sx = c.streetAt(i);
    const len = H + S / 2 - zq;
    c.decor.box(sx, 0.25, zq + len / 2, S, 0.4, len, X.wood);
    c.terrain.dry.push({ x0: sx - S / 2, z0: zq - 1, x1: sx + S / 2, z1: H + S / 2 });
    for (let p = zq + 16; p < H - 8; p += 36) for (const s of [-1, 1]) c.decor.box(sx + s * (S / 2 - 1), 0.9, p, 1.6, 1.0, 1.6, 0xd8c060);
  }
  c.decor.box(0, 0.25, H, 2 * H + S, 0.4, S, X.wood);
  c.terrain.dry.push({ x0: -H - S, z0: H - S / 2, x1: H + S, z1: H + S / 2 });
  const cont = X.containers;
  let lighthouse = false;
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const cx = k.lc(bx);
      const cz = k.lc(bz);
      if (bz === wr) {
        // ---- water lots ----
        const r = k.rnd();
        if (!lighthouse && bx === N - 1) {
          lighthouse = true;
          c.decor.disc(cx + 10, 0.4, cz + 10, 30, 0.8, 0x8a857a);
          c.terrain.dry.push({ x0: cx - 4, z0: cz - 4, x1: cx + 24, z1: cz + 24 });
          k.plan({
            x: cx + 10,
            z: cz + 10,
            hx: 5.5,
            hz: 5.5,
            count: 13,
            style: STYLE.stripe,
            colors: [0xf4f2ec, 0xf4f2ec, 0xc8322a],
            value: k.value(1.6),
            min: 8,
            after: (bi) => lighthouseLamp(k, bi),
          });
          continue;
        }
        // a quay deck with a crane on the land side of most water lots
        const deck = r < 0.75;
        if (deck) {
          const dz = 22;
          c.decor.box(cx, 0.25, zq + dz / 2, lot + 2, 0.4, dz, X.wood);
          c.terrain.dry.push({ x0: cx - lot / 2, z0: zq - 1, x1: cx + lot / 2, z1: zq + dz });
          crane(k, cx + k.range(-10, 10), zq + 2, 56, k.pick(X.accent));
        }
        if (r < 0.6 || !deck) ship(k, cx, cz + (deck ? 12 : 2), cont);
        else for (let i = 0; i < 3; i++) boat(k, cx + (i - 1) * 22, cz + 14 + k.range(-4, 4));
        continue;
      }
      // ---- land lots ----
      c.decor.box(cx, 0.4, cz, lot, 0.8, lot, th.sidewalk);
      const quay = bz === wr - 1;
      const r = k.rnd();
      if (!quay && r < k.w.parkChance) {
        c.decor.box(cx, 0.5, cz, lot - 6, 1, lot - 6, th.grass);
        for (let t = 0; t < 12; t++) k.tree(cx + (k.rnd() - 0.5) * (lot - 14), cz + (k.rnd() - 0.5) * (lot - 14), k.range(9, 15), null);
        continue;
      }
      if (quay ? r < 0.6 : r < 0.38) warehouses(k, cx, cz);
      else if (quay || r < 0.72) containerYard(k, cx, cz, cont);
      else if (r < 0.9) {
        // old brick offices and a cannery: the tall stuff (WANTED landmarks)
        for (const s of [-1, 1]) {
          const n = k.floors(cx, cz);
          k.plan({ x: cx + s * lot * 0.25, z: cz, hx: lot * 0.22, hz: lot * 0.42, count: Math.max(4, n), style: STYLE.office, colors: [k.pick(th.palette)], min: 4 });
        }
      } else {
        // fish market: a long shed with a pitched roof, crates out front
        const p = k.plan({ x: cx, z: cz - 6, hx: lot * 0.44, hz: lot * 0.3, count: 2, style: STYLE.house, colors: [0xd8e8ee, 0x3a7aa8] });
        p.after = (bi) => gableRoof(k, bi, 0x2a6a9a, true, false);
        for (let i = 0; i < 4; i++) k.plan({ x: cx - 24 + i * 16, z: cz + 28, hx: 5, hz: 4, count: 1, style: STYLE.container, colors: [k.pick(cont)] });
      }
    }
  }
  emit(k);
  dashes(k, th.dash, false, (_x, z) => z > zq - 2);
}

function lighthouseLamp(k: Ctx, bi: number): void {
  const b = k.c.buildings[bi];
  const P = k.c.props;
  const y = b.count * FLOOR;
  if (!P.room('glow', 3)) return;
  P.begin(b.x, b.z, 8, 2, 'LIGHTHOUSE ', { anchor: b.first + b.count - 1, spin: 1.4 });
  P.part('box', b.x, y + 0.6, b.z, 15, 1.2, 15, 0x2a2a2e);
  P.part('glow', b.x, y + 4, b.z, 7, 6, 7, 0xfff0a0);
  P.part('gable', b.x, y + 9, b.z, 9.5, 4, 9.5, 0xc8322a);
  P.part('glow', b.x, y + 4, b.z, 110, 0.9, 1.6, 0xfff6c8);
  P.end();
}

/** Long low warehouses with pitched roofs. */
function warehouses(k: Ctx, cx: number, cz: number): void {
  const { lot } = k;
  const th = k.w.theme;
  const two = k.rnd() < 0.55;
  const cells: [number, number, number, number][] = two
    ? [
        [cx, cz - lot / 4, lot / 2 - 3, lot / 4 - 3],
        [cx, cz + lot / 4, lot / 2 - 3, lot / 4 - 3],
      ]
    : [[cx, cz, lot / 2 - 3, lot / 2 - 6]];
  for (const [x, z, hx, hz] of cells) {
    const roof = k.pick(k.x.roofs);
    k.plan({ x, z, hx, hz, count: k.int(3, 4), style: STYLE.industrial, colors: [k.pick(th.palette)], min: 2, after: (bi) => gableRoof(k, bi, roof, true, false) });
  }
}

/** Rows of shipping container stacks, each box a different colour. */
function containerYard(k: Ctx, cx: number, cz: number, cont: number[]): void {
  const { lot } = k;
  k.c.decor.box(cx, 0.85, cz, lot - 4, 0.1, lot - 4, k.x.concrete);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      if (k.rnd() < 0.12) continue;
      const colors: number[] = [];
      const n = k.int(1, 5);
      for (let f = 0; f < n; f++) colors.push(k.pick(cont));
      k.plan({ x: cx + (i - 1) * 23, z: cz + (j - 0.5) * 32, hx: 5.6, hz: 13, count: n, style: STYLE.container, colors, value: k.value(0.9), lj: 0 });
    }
  }
}

/** A cargo ship moored along x: bridge at the stern, container bays, a bow. */
function ship(k: Ctx, cx: number, cz: number, cont: number[]): void {
  const hull = k.pick([0x9a2a22, 0x23324a, 0x2a2a2e, 0x2f5a3a]);
  const dir = k.rnd() < 0.5 ? 1 : -1;
  const hz = 8;
  k.plan({ x: cx - dir * 26, z: cz, hx: 6, hz, count: 4, style: STYLE.house, colors: [hull, 0xf2f0e8, 0xf2f0e8, 0xf2f0e8], value: k.value(1.3), min: 3 });
  for (let i = 0; i < 3; i++) {
    const colors = [hull];
    const n = k.int(2, 4);
    for (let f = 1; f < n; f++) colors.push(k.pick(cont));
    k.plan({ x: cx - dir * (12 - i * 12.5), z: cz, hx: 6, hz, count: n, style: STYLE.container, colors, value: k.value(1.2), lj: 0 });
  }
  k.plan({ x: cx + dir * 29, z: cz, hx: 5, hz: hz * 0.7, count: 1, style: STYLE.plain, colors: [hull], value: k.value(1.2) });
}

/** A little fishing boat with a cabin. */
function boat(k: Ctx, x: number, z: number): void {
  k.plan({ x, z, hx: 7, hz: 3.2, count: 1, style: STYLE.plain, colors: [k.pick([0xf2f0e8, 0x2a6fd9, 0xc8322a])], value: k.value(0.8) });
}

// =====================================================================================================
// Purrburbia: pastel houses with pitched roofs, several per lot with lawns between, hedges, back-yard pools,
// lots of trees, cul-de-sac parks with playgrounds, a church, a school and water towers.
// =====================================================================================================
function buildSuburbia(k: Ctx): void {
  const { c, N, lot } = k;
  const th = k.w.theme;
  groundPlane(k, th.ground);
  c.terrain.waterName = 'NOT THE POOL!';
  const poolRects: Rect[] = [];
  const mid = Math.floor(N / 2);
  let towers = 0;
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const cx = k.lc(bx);
      const cz = k.lc(bz);
      c.decor.box(cx, 0.4, cz, lot, 0.8, lot, th.sidewalk);
      c.decor.box(cx, 0.85, cz, lot - 7, 0.3, lot - 7, th.grass);
      // town centre: church and school
      if (bx === mid && bz === mid) {
        church(k, cx, cz);
        continue;
      }
      if (bx === mid + 1 && bz === mid - 1) {
        k.plan({ x: cx, z: cz - 8, hx: lot * 0.42, hz: lot * 0.24, count: 3, style: STYLE.office, colors: [0xc87a5a], value: k.value(1.2), min: 2, after: (bi) => gableRoof(k, bi, 0x5a5a5a, true, false) });
        k.c.decor.box(cx, 0.95, cz + 22, lot - 12, 0.15, 22, 0xc86a4a);
        playground(k, cx - 16, cz + 22);
        continue;
      }
      const r = k.rnd();
      if (r < k.w.parkChance) {
        // cul-de-sac park: a round lawn ringed with trees, a playground, a fountain or a water tower
        c.decor.disc(cx, 1.05, cz, lot - 10, 0.2, 0x8fd468);
        for (let t = 0; t < 14; t++) {
          const a = (t / 14) * Math.PI * 2;
          k.tree(cx + Math.cos(a) * (lot / 2 - 9), cz + Math.sin(a) * (lot / 2 - 9), k.range(10, 16), null, 0.7);
        }
        if (towers < 3 && k.rnd() < 0.6) {
          towers++;
          waterTower(k, cx + 8, cz - 6, k.pick([0x9fd0f0, 0xf0b0c0, 0xf2f2f2]));
        } else {
          c.decor.disc(cx + 8, 1.05, cz - 6, 15, 0.2, 0xd8d4c8);
          poolRects.push({ x0: cx + 3, z0: cz - 11, x1: cx + 13, z1: cz - 1 });
        }
        playground(k, cx - 12, cz + 10);
        continue;
      }
      houseLot(k, cx, cz, poolRects);
    }
  }
  // two more water towers if the parks did not get them
  for (; towers < 2; towers++) waterTower(k, k.lc(towers ? N - 1 : 0) + 24, k.lc(towers ? 0 : N - 1) - 24, 0x9fd0f0);
  emit(k);
  pools(k, poolRects);
  for (const r of poolRects) c.terrain.water.push(r);
  dashes(k, th.dash, false);
}

function houseLot(k: Ctx, cx: number, cz: number, poolRects: Rect[]): void {
  const { lot } = k;
  const th = k.w.theme;
  const q = lot / 4;
  const layout = k.rnd();
  const cells: [number, number][] =
    layout < 0.55
      ? [
          [-q, -q],
          [q, -q],
          [-q, q],
          [q, q],
        ]
      : layout < 0.8
        ? [
            [-q, -q],
            [q, -q],
            [0, q],
          ]
        : [
            [-q, 0],
            [q, 0],
          ];
  const used: [number, number, number, number][] = [];
  for (const [ox, oz] of cells) {
    if (k.rnd() < 0.1) continue; // an empty lawn
    const hx = k.range(7.5, cells.length === 2 ? 13 : 11);
    const hz = k.range(6.5, cells.length === 2 ? 14 : 10);
    const x = cx + ox + k.range(-2, 2);
    const z = cz + oz + k.range(-2, 2);
    const fr = k.rnd();
    const count = fr < 0.25 ? 2 : fr < 0.8 ? 3 : 4;
    const wall = k.pick(th.palette);
    const roof = k.pick(k.x.roofs);
    const alongX = hx > hz;
    const chimney = k.rnd() < 0.5;
    k.plan({ x, z, hx, hz, count, style: STYLE.house, colors: [wall], value: k.value(), after: (bi) => gableRoof(k, bi, roof, alongX, chimney), min: 2 });
    used.push([x, z, hx, hz]);
    // driveway to the nearest street
    const sz = oz < 0 ? -1 : 1;
    const dl = lot / 2 - Math.abs(oz) - hz + 2;
    if (dl > 2) k.c.decor.box(x + hx * 0.5, 1.02, z + sz * (hz + dl / 2), 6, 0.1, dl, 0xbdb8ac);
  }
  // trees in the gaps
  for (let t = 0; t < 6; t++) {
    const x = cx + (k.rnd() - 0.5) * (lot - 10);
    const z = cz + (k.rnd() - 0.5) * (lot - 10);
    if (used.some(([ux, uz, hx, hz]) => Math.abs(x - ux) < hx + 4 && Math.abs(z - uz) < hz + 4)) continue;
    k.tree(x, z, k.range(9, 15), null, 0.75);
  }
  // hedges on one or two edges
  const e = k.int(1, 2);
  for (let i = 0; i < e; i++) {
    const side = k.int(0, 3);
    const alongX = side < 2;
    const off = (side % 2 ? -1 : 1) * (lot / 2 - 4);
    for (const s of [-1, 1]) hedge(k, alongX ? cx + s * 19 : cx + off, alongX ? cz + off : cz + s * 19, 24, alongX);
  }
  // a back-yard pool now and then (cats hate this)
  if (k.rnd() < 0.35) {
    const px = cx + k.range(-6, 6);
    const pz = cz + k.range(-6, 6);
    const w = 7;
    const d = 4.5;
    if (!used.some(([ux, uz, hx, hz]) => Math.abs(px - ux) < hx + w + 1 && Math.abs(pz - uz) < hz + d + 1)) poolRects.push({ x0: px - w, z0: pz - d, x1: px + w, z1: pz + d });
  }
}

function church(k: Ctx, cx: number, cz: number): void {
  k.plan({ x: cx - 4, z: cz, hx: 12, hz: 22, count: 4, style: STYLE.house, colors: [0xf4f2ec], value: k.value(1.4), min: 3, after: (bi) => gableRoof(k, bi, 0x5a4a5a, false, false) });
  k.plan({
    x: cx - 4,
    z: cz - 27,
    hx: 5,
    hz: 5,
    count: 10,
    style: STYLE.stripe,
    colors: [0xf4f2ec],
    value: k.value(1.6),
    min: 6,
    after: (bi) => {
      const b = k.c.buildings[bi];
      const P = k.c.props;
      if (!P.room('gable', 1)) return;
      P.begin(b.x, b.z, 6, 0, '', { anchor: b.first + b.count - 1 });
      P.part('gable', b.x, b.count * FLOOR + 7, b.z, 11, 14, 11, 0x5a4a5a);
      P.part('box', b.x, b.count * FLOOR + 16, b.z, 0.8, 5, 0.8, 0xf2d23a);
      P.part('box', b.x, b.count * FLOOR + 16.5, b.z, 3.4, 0.8, 0.8, 0xf2d23a);
      P.end();
    },
  });
  k.c.decor.box(cx + 22, 1.0, cz, 18, 0.15, 60, 0xbdb8ac);
}

// =====================================================================================================
// Nekotown: the densest, tallest grid. Thin towers with setbacks, neon signs on the faces, rooftop
// billboards, antennas, glowing kerbs and pink road lines.
// =====================================================================================================
function buildNeon(k: Ctx): void {
  const { c, N, lot } = k;
  const th = k.w.theme;
  groundPlane(k, th.ground, 0.6);
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const cx = k.lc(bx);
      const cz = k.lc(bz);
      c.decor.box(cx, 0.4, cz, lot, 0.8, lot, th.sidewalk);
      // glowing kerbs
      const kc = (bx + bz) % 2 ? 0x3ef0ff : 0xff3ea0;
      for (const s of [-1, 1]) {
        c.decor.glowBox(cx + s * (lot / 2 - 0.4), 0.9, cz, 0.6, 0.2, lot, kc);
        c.decor.glowBox(cx, 0.9, cz + s * (lot / 2 - 0.4), lot, 0.2, 0.6, kc);
      }
      const r = k.rnd();
      if (r < k.w.parkChance && Math.hypot(cx, cz) > k.B) {
        // a shrine garden: cherry trees and a glowing gate
        c.decor.box(cx, 0.55, cz, lot - 6, 0.5, lot - 6, th.grass);
        for (let t = 0; t < 12; t++) k.tree(cx + (k.rnd() - 0.5) * (lot - 16), cz + (k.rnd() - 0.5) * (lot - 16), k.range(10, 16), 0xff9ad0, 0.8);
        torii(k, cx, cz);
        continue;
      }
      const split = r < 0.32 ? 9 : r < 0.82 ? 4 : 1;
      const cells: [number, number, number, number][] = [];
      if (split === 1) cells.push([cx, cz, lot / 2 - 6, lot / 2 - 6]);
      else {
        const n = split === 9 ? 3 : 2;
        const cw = lot / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cells.push([cx - lot / 2 + cw * (i + 0.5), cz - lot / 2 + cw * (j + 0.5), cw / 2 - 2.5, cw / 2 - 2.5]);
      }
      for (const [x, z, hx0, hz0] of cells) {
        const hx = hx0 * k.range(0.75, 1);
        const hz = hz0 * k.range(0.75, 1);
        const mega = split === 1;
        const count = Math.max(5, k.floors(x, z, mega ? 1.35 : split === 9 ? 0.85 : 1));
        const setback = count > 9 && k.rnd() < 0.7 ? Math.floor(count * k.range(0.5, 0.75)) : 999;
        const base = k.pick(th.palette);
        const sign = k.rnd() < (split === 9 ? 0.45 : 0.75);
        const bb = k.rnd() < 0.18;
        const ant = !bb && count > 14 && k.rnd() < 0.5;
        k.plan({
          x,
          z,
          hx,
          hz,
          count,
          style: STYLE.tower,
          colors: [base],
          setback,
          min: 4,
          value: k.value(),
          after: (bi) => {
            const b = k.c.buildings[bi];
            const sb = setback < 999 ? Math.max(1, Math.round(setback * (b.count / count))) : b.count;
            if (sign) neonSign(k, bi, sb);
            if (sign && (mega || k.rnd() < 0.3)) neonSign(k, bi, sb);
            if (bb && sb >= b.count) billboard(k, bi);
            if (ant) antenna(k, bi, sb < b.count ? 0.72 : 1);
          },
        });
      }
    }
  }
  emit(k);
  dashes(k, th.dash, true);
}

function torii(k: Ctx, x: number, z: number): void {
  const P = k.c.props;
  if (!P.room('glow', 4)) return;
  P.begin(x, z, 10, 1, 'GATE ', { kind: 'spark' });
  P.part('glow', x - 8, 8, z, 1.8, 16, 1.8, 0xff3e4a);
  P.part('glow', x + 8, 8, z, 1.8, 16, 1.8, 0xff3e4a);
  P.part('glow', x, 16.5, z, 24, 1.6, 2.4, 0xff3e4a);
  P.part('glow', x, 13, z, 19, 1, 1.4, 0xff3e4a);
  P.end();
}

// =====================================================================================================
// Fort Fluffington: a runway across one block row (parked jets on it), wide hangars with arched roofs,
// bunkers, barracks, radar masts with spinning dishes, fuel depots, a control tower and helipads.
// =====================================================================================================
function buildBase(k: Ctx): void {
  const { c, N, H, lot } = k;
  const th = k.w.theme;
  groundPlane(k, th.ground);
  const rw = N - 3; // runway row
  const rz = k.lc(rw);
  const rwW = lot + 4;
  // runway: asphalt over the crossing streets, piano keys, centre line, edge lines and lights
  c.decor.box(0, 0.07, rz, 2 * H + 80, 0.14, rwW, 0x36363a);
  for (let xx = -H + 20; xx < H - 20; xx += 34) c.decor.box(xx, 0.2, rz, 14, 0.06, 1.4, 0xf4f4f0);
  for (const s of [-1, 1]) {
    c.decor.box(0, 0.2, rz + s * (rwW / 2 - 3), 2 * H, 0.06, 1, 0xf4f4f0);
    for (let i = 0; i < 8; i++) c.decor.box(s * (H - 22), 0.2, rz - rwW / 2 + 8 + i * ((rwW - 16) / 7), 28, 0.06, 2.4, 0xf4f4f0);
    for (let xx = -H; xx <= H; xx += 30) c.decor.glowBox(xx, 0.6, rz + s * (rwW / 2 + 0.5), 1.2, 1.2, 1.2, xx % 60 ? 0xfff2c0 : 0x5aff8a);
  }
  // parked aircraft between the crossing streets
  const slots = [1, 3, 5, 7].filter((i) => i < N);
  slots.forEach((bx, i) => {
    const x = k.lc(bx);
    if (i === 1) cargoPlane(k, x, rz);
    else fighter(k, x + k.range(-8, 8), rz + k.range(-14, 14), k.rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  });
  const radarLots = new Set([`1,1`, `${N - 2},${Math.max(0, rw - 3)}`, `${Math.floor(N / 2)},${N - 1}`]);
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      if (bz === rw) continue;
      const cx = k.lc(bx);
      const cz = k.lc(bz);
      c.decor.box(cx, 0.4, cz, lot, 0.8, lot, th.sidewalk);
      const facing: 1 | -1 = bz === rw - 1 ? 1 : bz === rw + 1 ? -1 : k.rnd() < 0.5 ? 1 : -1;
      if (radarLots.has(`${bx},${bz}`)) {
        radar(k, cx, cz);
        continue;
      }
      if (bz === rw - 1 && bx === 2) {
        controlTower(k, cx, cz);
        continue;
      }
      const r = k.rnd();
      if (bz === rw - 1 || bz === rw + 1 || r < 0.3) hangar(k, cx, cz, facing);
      else if (r < 0.48) bunkers(k, cx, cz);
      else if (r < 0.68) barracks(k, cx, cz);
      else if (r < 0.8) depot(k, cx, cz);
      else if (r < 0.88) radar(k, cx, cz);
      else helipad(k, cx, cz);
    }
  }
  emit(k);
  dashes(k, th.dash, false, (_x, z) => Math.abs(z - rz) < rwW / 2 + 1);
}

function hangar(k: Ctx, cx: number, cz: number, facing: 1 | -1): void {
  const th = k.w.theme;
  const hx = k.range(28, 34);
  const hz = k.range(24, 30);
  const roof = k.pick(k.x.roofs);
  k.plan({ x: cx, z: cz, hx, hz, count: k.int(3, 4), style: STYLE.industrial, colors: [k.pick(th.palette)], value: k.value(1.1), min: 2, after: (bi) => hangarRoof(k, bi, roof, facing) });
}

function bunkers(k: Ctx, cx: number, cz: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (k.rnd() < 0.2) continue;
      k.plan({ x: cx + sx * 17, z: cz + sz * 17, hx: k.range(8, 11), hz: k.range(6, 9), count: 2, style: STYLE.bunker, colors: [k.pick([0x9c9888, 0x8a8676, 0xa8a090])], value: k.value(1.2) });
    }
  }
  // sandbag ring in the middle
  const P = k.c.props;
  if (P.room('box', 6)) {
    P.begin(cx, cz, 7, 0.05, 'SANDBAGS ', { trample: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      P.part('box', cx + Math.cos(a) * 6, 1.4, cz + Math.sin(a) * 6, 5, 2.8, 2.4, 0xb8a87a, -a);
    }
    P.end();
  }
}

function barracks(k: Ctx, cx: number, cz: number): void {
  for (const s of [-1, 1]) {
    const roof = k.pick(k.x.roofs);
    k.plan({ x: cx, z: cz + s * 18, hx: k.range(28, 33), hz: k.range(8, 11), count: k.int(2, 3), style: STYLE.house, colors: [k.pick([0xd8c89a, 0xc8b88a, 0xb8b08a])], value: k.value(), after: (bi) => gableRoof(k, bi, roof, true, false) });
  }
  // flag pole with a cat flag
  const P = k.c.props;
  if (P.room('box', 2)) {
    P.begin(cx + 28, cz, 3, 0.4, 'FLAG ', { trample: true });
    P.part('box', cx + 28, 11, cz, 0.6, 22, 0.6, 0xe8e8e8);
    P.part('box', cx + 28, 19.5, cz + 3.4, 0.3, 4, 6.4, 0xff8a2a);
    P.end();
  }
}

function depot(k: Ctx, cx: number, cz: number): void {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) fuelTank(k, cx + (i - 1) * 22, cz + (j - 0.5) * 30, 16, k.range(10, 15));
}

function radar(k: Ctx, cx: number, cz: number): void {
  k.plan({ x: cx, z: cz, hx: 3.6, hz: 3.6, count: k.int(8, 11), style: STYLE.plain, colors: [0x9a9e94], value: k.value(1.4), min: 6, after: (bi) => radarDish(k, bi) });
  k.plan({ x: cx + 22, z: cz + 18, hx: 9, hz: 7, count: 2, style: STYLE.bunker, colors: [0x9c9888], value: k.value() });
}

function controlTower(k: Ctx, cx: number, cz: number): void {
  k.plan({
    x: cx,
    z: cz + 10,
    hx: 6,
    hz: 6,
    count: 10,
    style: STYLE.office,
    colors: [0xd8d2c0],
    value: k.value(1.5),
    min: 6,
    after: (bi) => {
      const b = k.c.buildings[bi];
      const P = k.c.props;
      if (!P.room('box', 3)) return;
      const y = b.count * FLOOR;
      P.begin(b.x, b.z, 8, 2, 'TOWER CAB ', { anchor: b.first + b.count - 1 });
      P.part('box', b.x, y + 0.5, b.z, 16, 1, 16, 0x4a4a46);
      P.part('box', b.x, y + 4, b.z, 14, 6, 14, 0x3a6a8a);
      P.part('box', b.x, y + 7.6, b.z, 16, 1.2, 16, 0x4a4a46);
      P.end();
      antenna(k, bi, 1);
    },
  });
  k.plan({ x: cx, z: cz - 20, hx: 26, hz: 9, count: 2, style: STYLE.office, colors: [0xc8c2b0], value: k.value() });
}

function helipad(k: Ctx, cx: number, cz: number): void {
  const d = k.c.decor;
  d.disc(cx, 0.95, cz, 46, 0.2, 0x8a8a84);
  d.box(cx - 6, 1.1, cz, 2.4, 0.06, 16, 0xf4f4f0);
  d.box(cx + 6, 1.1, cz, 2.4, 0.06, 16, 0xf4f4f0);
  d.box(cx, 1.1, cz, 12, 0.06, 2.4, 0xf4f4f0);
}

// ---------- entry ----------
/** Build a non-downtown city into `c` (City.build has already cleared it). */
export function buildLayout(c: City, w: WorldDef, rnd: Rnd): void {
  const k = new Ctx(c, w, rnd);
  if (w.layout === 'docks') buildDocks(k);
  else if (w.layout === 'suburbia') buildSuburbia(k);
  else if (w.layout === 'neon') buildNeon(k);
  else buildBase(k);
  // start on the avenue, looking down it (always a street, always on land, away from the harbour)
  c.spawn = { x: c.streetAt(Math.min(4, w.n)), z: c.streetAt(1) + 20, heading: 0 };
}
