/**
 * Glyph billboards (feel lane): one camera-facing InstancedMesh drawing small icons from a procedural canvas atlas
 * (no downloaded assets). Used for the cosmetic trails (sparkle, fish bones, hearts, paw prints, rainbow), the
 * catnip spiral eyes, the Laser Dot's red dot on a passed windscreen, and little "!" / note pops. One draw call.
 *
 * Two kinds of instances share the buffer: particles (`spawn`, with velocity and a life) and stickers (`stick`,
 * drawn for one frame only: call it every frame while the effect lasts).
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';

/** Atlas cells (4 × 2). */
export const Glyph = {
  Sparkle: 0,
  FishBone: 1,
  Heart: 2,
  Paw: 3,
  Rainbow: 4,
  Spiral: 5,
  Dot: 6,
  Bang: 7,
} as const;
export type Glyph = (typeof Glyph)[keyof typeof Glyph];

/** Trail id (content/ids.ts TRAIL_IDS: 1 sparkle, 2 fish bones, 3 hearts, 4 paw prints, 5 rainbow) → glyph. */
export const TRAIL_GLYPH: readonly Glyph[] = [Glyph.Sparkle, Glyph.Sparkle, Glyph.FishBone, Glyph.Heart, Glyph.Paw, Glyph.Rainbow];

const CELL = 64;

function drawAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 2;
  const g = c.getContext('2d');
  if (!g) return c;
  const at = (i: number) => [(i % 4) * CELL + CELL / 2, Math.floor(i / 4) * CELL + CELL / 2] as const;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // white glyphs (tinted by the instance colour) with a dark rim for readability on bright tracks
  const ink = (fn: () => void, rim = 7) => {
    g.strokeStyle = 'rgba(30,18,40,0.85)';
    g.lineWidth = rim;
    g.fillStyle = '#ffffff';
    fn();
  };
  // 0 sparkle: a four-point star
  {
    const [x, y] = at(0);
    ink(() => {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 7 : 26;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
      g.fill();
    });
  }
  // 1 fish bones: spine, ribs, head and tail
  {
    const [x, y] = at(1);
    const draw = (w: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x - 18, y);
      g.lineTo(x + 14, y);
      for (let i = 0; i < 4; i++) {
        const rx = x - 10 + i * 7;
        g.moveTo(rx, y - 10);
        g.lineTo(rx, y + 10);
      }
      g.moveTo(x - 18, y);
      g.lineTo(x - 27, y - 9);
      g.moveTo(x - 18, y);
      g.lineTo(x - 27, y + 9);
      g.stroke();
      g.beginPath();
      g.arc(x + 19, y, 7, 0, Math.PI * 2);
      g.stroke();
    };
    draw(9, 'rgba(30,18,40,0.85)');
    draw(4, '#ffffff');
  }
  // 2 heart
  {
    const [x, y] = at(2);
    ink(() => {
      g.beginPath();
      g.moveTo(x, y + 20);
      g.bezierCurveTo(x - 30, y, x - 18, y - 24, x, y - 9);
      g.bezierCurveTo(x + 18, y - 24, x + 30, y, x, y + 20);
      g.closePath();
      g.stroke();
      g.fill();
    });
  }
  // 3 paw print
  {
    const [x, y] = at(3);
    ink(() => {
      const blob = (bx: number, by: number, rx: number, ry: number) => {
        g.beginPath();
        g.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
        g.stroke();
        g.fill();
      };
      blob(x, y + 8, 14, 11);
      blob(x - 15, y - 6, 5.5, 7);
      blob(x - 5, y - 15, 5.5, 7);
      blob(x + 5, y - 15, 5.5, 7);
      blob(x + 15, y - 6, 5.5, 7);
    }, 5);
  }
  // 4 rainbow: concentric arcs in colour (not tinted)
  {
    const [x, y] = at(4);
    const cols = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3bd16f', '#3aa8ff', '#9b5de5'];
    cols.forEach((col, i) => {
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x, y + 14, 27 - i * 4, Math.PI, 0);
      g.stroke();
    });
  }
  // 5 spiral (dizzy / catnip eyes)
  {
    const [x, y] = at(5);
    const sp = (w: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      for (let t = 0; t < 1; t += 0.01) {
        const a = t * Math.PI * 6;
        const r = 2 + t * 24;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke();
    };
    sp(9, 'rgba(30,18,40,0.9)');
    sp(4, '#ffffff');
  }
  // 6 soft dot (laser dot, glows)
  {
    const [x, y] = at(6);
    const gr = g.createRadialGradient(x, y, 0, x, y, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - 32, y - 32, 64, 64);
  }
  // 7 bang "!"
  {
    const [x, y] = at(7);
    ink(() => {
      g.beginPath();
      g.roundRect?.(x - 6, y - 26, 12, 34, 6);
      if (!g.roundRect) g.rect(x - 6, y - 26, 12, 34);
      g.stroke();
      g.fill();
      g.beginPath();
      g.arc(x, y + 19, 6, 0, Math.PI * 2);
      g.stroke();
      g.fill();
    });
  }
  return c;
}

const VS = /* glsl */ `
attribute vec3 aGlyph; // cell, alpha, roll
varying vec2 vUv; varying vec3 vC; varying float vA;
void main(){
  vC = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
  #endif
  vA = aGlyph.y;
  float cell = aGlyph.x;
  vec2 uv = uv;
  vUv = vec2((mod(cell, 4.0) + uv.x) / 4.0, (1.0 - floor(cell / 4.0) - 1.0 + uv.y) / 2.0 + 0.5);
  vec4 c = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  float s = length(instanceMatrix[0].xyz);
  // never fill the lens: glyphs fade out within a few metres of the camera
  vA *= smoothstep(2.0, 5.0, -c.z);
  float cr = cos(aGlyph.z); float sr = sin(aGlyph.z);
  vec2 p = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
  c.xy += p * s;
  gl_Position = projectionMatrix * c;
}`;
const FS = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vC; varying float vA;
void main(){
  vec4 t = texture2D(uMap, vUv);
  if (t.a * vA < 0.02) discard;
  gl_FragColor = vec4(t.rgb * vC, t.a * vA);
}`;

const _m = new Matrix4();
const _c = new Color();

export class Glyphs {
  readonly mesh: InstancedMesh;
  private readonly tex: CanvasTexture | null;
  private readonly cap: number;
  private readonly attr: Float32Array;
  private readonly attrBuf: InstancedBufferAttribute;
  // particles
  private readonly pPos: Float32Array;
  private readonly pVel: Float32Array;
  private readonly pLife: Float32Array;
  private readonly pMax: Float32Array;
  private readonly pSize: Float32Array;
  private readonly pCell: Uint8Array;
  private readonly pCol: Uint32Array;
  private readonly pSpin: Float32Array;
  private readonly pCount: number;
  private pNext = 0;
  /** stickers drawn this frame */
  private stickN = 0;
  private readonly sticks: Array<{ x: number; y: number; z: number; size: number; cell: number; color: number; alpha: number; roll: number }> = [];
  private time = 0;

  constructor(
    private readonly scene: Scene,
    capacity = 220,
    additive = false,
  ) {
    this.cap = capacity;
    this.pCount = capacity - 40;
    const canvas = drawAtlas();
    this.tex = canvas ? new CanvasTexture(canvas) : null;
    if (this.tex) {
      this.tex.colorSpace = SRGBColorSpace;
      this.tex.minFilter = LinearFilter;
      this.tex.generateMipmaps = false;
    }
    const geo = new PlaneGeometry(1, 1);
    this.attr = new Float32Array(capacity * 3);
    this.attrBuf = new InstancedBufferAttribute(this.attr, 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    geo.setAttribute('aGlyph', this.attrBuf);
    const mat = new ShaderMaterial({
      uniforms: { uMap: { value: this.tex } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.count = 0;
    this.pPos = new Float32Array(this.pCount * 3);
    this.pVel = new Float32Array(this.pCount * 3);
    this.pLife = new Float32Array(this.pCount);
    this.pMax = new Float32Array(this.pCount).fill(1);
    this.pSize = new Float32Array(this.pCount);
    this.pCell = new Uint8Array(this.pCount);
    this.pCol = new Uint32Array(this.pCount);
    this.pSpin = new Float32Array(this.pCount);
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, cell: number, color: number, size: number, life: number, spin = 0): void {
    const p = this.pNext;
    this.pNext = (p + 1) % this.pCount;
    this.pPos[p * 3] = x;
    this.pPos[p * 3 + 1] = y;
    this.pPos[p * 3 + 2] = z;
    this.pVel[p * 3] = vx;
    this.pVel[p * 3 + 1] = vy;
    this.pVel[p * 3 + 2] = vz;
    this.pLife[p] = life;
    this.pMax[p] = life;
    this.pSize[p] = size;
    this.pCell[p] = cell;
    this.pCol[p] = color;
    this.pSpin[p] = spin;
  }

  /** Draw a glyph for this frame only. */
  stick(x: number, y: number, z: number, cell: number, color: number, size: number, alpha = 1, roll = 0): void {
    if (this.stickN >= this.cap - this.pCount) return;
    const s = this.sticks[this.stickN] ?? (this.sticks[this.stickN] = { x: 0, y: 0, z: 0, size: 0, cell: 0, color: 0, alpha: 0, roll: 0 });
    s.x = x;
    s.y = y;
    s.z = z;
    s.size = size;
    s.cell = cell;
    s.color = color;
    s.alpha = alpha;
    s.roll = roll;
    this.stickN++;
  }

  /** Write instance `n` (B58: a method, not a closure made every frame). */
  private put(n: number, x: number, y: number, z: number, size: number, cell: number, color: number, alpha: number, roll: number): number {
    _m.makeScale(size, size, size).setPosition(x, y, z);
    this.mesh.setMatrixAt(n, _m);
    this.mesh.setColorAt(n, _c.setHex(color));
    this.attr[n * 3] = cell;
    this.attr[n * 3 + 1] = alpha;
    this.attr[n * 3 + 2] = roll;
    return n + 1;
  }

  /** Advance particles and upload everything (call once per frame, after the stickers for the frame). */
  update(dt: number): void {
    this.time += dt;
    let n = 0;
    for (let i = 0; i < this.stickN; i++) {
      const s = this.sticks[i];
      n = this.put(n, s.x, s.y, s.z, s.size, s.cell, s.color, s.alpha, s.roll);
    }
    this.stickN = 0;
    for (let p = 0; p < this.pCount; p++) {
      if (this.pLife[p] <= 0) continue;
      this.pLife[p] -= dt;
      if (this.pLife[p] <= 0) continue;
      const i3 = p * 3;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      const u = this.pLife[p] / this.pMax[p]; // 1 → 0
      const pop = Math.min(1, (1 - u) * 8); // scale in quickly
      n = this.put(n, this.pPos[i3], this.pPos[i3 + 1], this.pPos[i3 + 2], this.pSize[p] * pop * (0.6 + 0.4 * u), this.pCell[p], this.pCol[p], Math.min(1, u * 1.6), this.pSpin[p] * this.time);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0 && !!this.tex;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.attrBuf.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.tex?.dispose();
    this.mesh.dispose();
  }
}
