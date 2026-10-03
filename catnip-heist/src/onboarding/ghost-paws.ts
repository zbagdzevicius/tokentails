/**
 * Ghost paws (plan G10 "Heist"): translucent pixel paw prints on the floor along a route leg, with
 * a pulse that walks along them, and small rings where the plan presses ACT or MEOW, swaps cats or
 * reaches the leg's goal. One instanced mesh for the prints and one for the rings, so the hint
 * costs two draw calls.
 *
 * Draw only: it reads nothing from the sim and never moves a cat.
 */
import * as THREE from 'three';
import { MAX_PRINTS, type PawPrint, type RouteMark, type RouteMarkKind } from './route';

const MAX_MARKS = 12;
/** Height above the floor (just over the active-cat ring at 0.03). */
const FLOOR_Y = 0.045;
const PRINT_SIZE = 0.56;
/** Phones and touch screens: the floor is smaller on screen, so the prints are bigger and stronger. */
const PRINT_SIZE_LARGE = 0.7;
const PRINT_OPACITY = 0.85;
const PRINT_OPACITY_LARGE = 0.95;
const LARGE_QUERY = '(pointer: coarse), (max-width: 600px), (max-height: 480px)';

function wantLargePrints(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(LARGE_QUERY).matches;
  } catch {
    return false;
  }
}
const MARK_SIZE = 0.9;
/** Prints per second the pulse travels. */
const PULSE_SPEED = 9;
const FADE_S = 0.35;

// Colours above 1 are HDR: the renderer's bloom pass (threshold about 1) makes the pulse and the
// marks glow; on the low tier (no post chain) they simply clamp to full brightness.
const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
const PRINT_COLOR = hdr('#ffd979', 1.25);
const PULSE_COLOR = hdr('#fff3c4', 2.6);
const MARK_COLORS: Record<RouteMarkKind, THREE.Color> = {
  act: hdr('#ffcc55', 1.8),
  meow: hdr('#ff7aa2', 1.8),
  swap: hdr('#c79bf2', 1.8),
  goal: hdr('#ffcc55', 1.8),
};

/** Pixel paw print (main pad and four toes) on an 18x18 grid, toes towards -V. */
const PAW_ROWS = [
  '..................',
  '.......#...#......',
  '......###.###.....',
  '..#...###.###..#..',
  '.###..###.###.###.',
  '.###..........###.',
  '.###...####...###.',
  '......######......',
  '.....########.....',
  '....##########....',
  '....##########....',
  '....##########....',
  '....##########....',
  '.....###..###.....',
  '......#....#......',
  '..................',
];

/**
 * White paw with a one-pixel dark rim (the instance colour tints the white; the rim stays dark), so
 * the print reads on light and dark floors alike.
 */
function pawTexture(): THREE.Texture {
  const w = PAW_ROWS[0].length;
  const hgt = PAW_ROWS.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = w;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, w);
  const off = Math.floor((w - hgt) / 2);
  const on = (x: number, y: number) => y >= 0 && y < hgt && x >= 0 && x < w && PAW_ROWS[y][x] === '#';
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + off) * w + x) * 4;
      if (on(x, y)) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) {
        img.data[i] = 42;
        img.data[i + 1] = 15;
        img.data[i + 2] = 31;
        img.data[i + 3] = 150;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 32x32 pixel ring for the action marks. */
function ringTexture(): THREE.Texture {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const a = d > 10.5 && d < 14.5 ? 255 : d <= 10.5 && d > 9 ? 90 : 0;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class GhostPaws {
  readonly group = new THREE.Group();
  private readonly prints: THREE.InstancedMesh;
  private readonly marks: THREE.InstancedMesh;
  private readonly printMat: THREE.MeshBasicMaterial;
  private readonly markMat: THREE.MeshBasicMaterial;
  private readonly textures: THREE.Texture[];
  private readonly geo: THREE.PlaneGeometry;
  private path: PawPrint[] = [];
  private markList: RouteMark[] = [];
  private fade = 0;
  private fadeGoal = 0;
  private time = 0;
  private readonly reduced: boolean;
  private large = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly col = new THREE.Color();

  constructor(opts: { reducedMotion?: boolean } = {}) {
    this.reduced = !!opts.reducedMotion;
    this.group.name = 'ghost-paws';
    this.geo = new THREE.PlaneGeometry(1, 1);
    const paw = pawTexture();
    const ring = ringTexture();
    this.textures = [paw, ring];
    const mat = (map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, alphaTest: 0.05 });
    this.printMat = mat(paw);
    // Normal blending, not additive: the dark rim stays, so the gold prints read on light floor
    // tiles too (additive washed them out to pale smudges on phones).
    this.markMat = mat(ring);
    this.prints = new THREE.InstancedMesh(this.geo, this.printMat, MAX_PRINTS);
    this.marks = new THREE.InstancedMesh(this.geo, this.markMat, MAX_MARKS);
    for (const mesh of [this.prints, this.marks]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, PRINT_COLOR);
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  /** True while prints are on screen (or fading out). */
  get visible(): boolean {
    return this.group.visible;
  }

  /** Number of prints currently drawn (QA and tests). */
  get printCount(): number {
    return this.fadeGoal > 0 ? this.path.length : 0;
  }

  show(prints: readonly PawPrint[], marks: readonly RouteMark[]): void {
    this.large = wantLargePrints();
    this.path = prints.slice(0, MAX_PRINTS);
    this.markList = marks.slice(0, MAX_MARKS);
    this.prints.count = this.path.length;
    this.marks.count = this.markList.length;
    this.fadeGoal = 1;
    if (!this.group.visible) {
      this.time = 0;
      this.fade = this.reduced ? 1 : 0;
    }
    this.group.visible = this.path.length > 0 || this.markList.length > 0;
    this.layout();
  }

  hide(): void {
    this.fadeGoal = 0;
    if (this.reduced) {
      this.fade = 0;
      this.group.visible = false;
    }
  }

  /** Per rendered frame: fade and pulse. */
  update(dt: number): void {
    if (!this.group.visible) return;
    const step = Math.min(0.1, Math.max(0, dt));
    this.time += step;
    if (this.fade !== this.fadeGoal) {
      const d = step / FADE_S;
      this.fade = this.fadeGoal > this.fade ? Math.min(this.fadeGoal, this.fade + d) : Math.max(this.fadeGoal, this.fade - d);
    }
    if (this.fade <= 0 && this.fadeGoal === 0) {
      this.group.visible = false;
      return;
    }
    this.printMat.opacity = (this.large ? PRINT_OPACITY_LARGE : PRINT_OPACITY) * this.fade;
    this.markMat.opacity = 0.85 * this.fade;
    this.layout();
  }

  private layout(): void {
    const n = this.path.length;
    // The pulse runs from the cat to the end of the leg, then pauses briefly and starts again.
    const head = this.reduced ? -10 : (this.time * PULSE_SPEED) % (n + 8);
    for (let i = 0; i < n; i++) {
      const p = this.path[i];
      const k = this.reduced ? 0 : Math.exp(-((i - head) ** 2) / 3);
      // Prints far along the leg fade a little, so the next few steps read first.
      const far = 1 - Math.min(0.35, (i / Math.max(1, n)) * 0.35);
      this.q.setFromAxisAngle(this.up, p.rot).multiply(this.flat);
      this.pos.set(p.x, FLOOR_Y, p.z);
      const s = (this.large ? PRINT_SIZE_LARGE : PRINT_SIZE) * (1 + 0.22 * k);
      this.scl.set(s, s, s);
      this.m.compose(this.pos, this.q, this.scl);
      this.prints.setMatrixAt(i, this.m);
      this.col.copy(PRINT_COLOR).lerp(PULSE_COLOR, k).multiplyScalar(far + (1 - far) * k);
      this.prints.setColorAt(i, this.col);
    }
    for (let i = 0; i < this.markList.length; i++) {
      const mk = this.markList[i];
      const beat = this.reduced ? 0 : 0.5 + 0.5 * Math.sin(this.time * 5 + i);
      this.q.copy(this.flat);
      this.pos.set(mk.x, FLOOR_Y + 0.005, mk.z);
      const s = MARK_SIZE * (0.92 + 0.12 * beat);
      this.scl.set(s, s, s);
      this.m.compose(this.pos, this.q, this.scl);
      this.marks.setMatrixAt(i, this.m);
      this.marks.setColorAt(i, MARK_COLORS[mk.kind]);
    }
    this.prints.instanceMatrix.needsUpdate = true;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.prints.dispose();
    this.marks.dispose();
    this.geo.dispose();
    this.printMat.dispose();
    this.markMat.dispose();
    for (const t of this.textures) t.dispose();
  }
}
