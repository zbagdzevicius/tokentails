/**
 * Small overlays: blob shadows (one InstancedMesh of a radial gradient for the cat, humans and
 * ghosts; real-time shadow maps only on the high tier) and the human's thought bubble ("?" on
 * TELEGRAPH, "!" when the cat is seen, "..." during the event, a heart in the cuddle) as one sprite
 * whose canvas textures are drawn lazily in the browser.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  DataTexture,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { BubbleKind } from './human-rig';

function radialTexture(): DataTexture {
  const n = 64;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r);
      const i = (y * n + x) * 4;
      d[i] = 43;
      d[i + 1] = 29;
      d[i + 2] = 46;
      d[i + 3] = Math.round(255 * a * a * (3 - 2 * a) * 0.55);
    }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

export class BlobShadows {
  readonly mesh: InstancedMesh;
  private tex: DataTexture;
  constructor(max: number) {
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.tex = radialTexture();
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mesh = new InstancedMesh(g, mat, max);
    this.mesh.name = 'blob-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }
  set(i: number, x: number, y: number, z: number, sx: number, sz: number, yaw = 0): void {
    _q.setFromAxisAngle(_p.set(0, 1, 0), yaw);
    _m.compose(_p.set(x, y + 0.006, z), _q, _s.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide(i: number): void {
    this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.tex.dispose();
    this.mesh.dispose();
  }
}

function drawBubble(kind: Exclude<BubbleKind, null>): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, 128, 128);
    // soft bubble with a tail
    g.fillStyle = 'rgba(43,29,46,0.25)';
    g.beginPath();
    g.arc(66, 58, 50, 0, Math.PI * 2);
    g.fill();
    const grey = kind === '?g';
    g.fillStyle = kind === '!' || kind === '!?' ? '#ff4d4d' : grey ? '#e4ddd6' : '#fffaf2';
    g.strokeStyle = grey ? '#6d6470' : '#2b1d2e';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 54, 46, 0, Math.PI * 2);
    g.moveTo(52, 96);
    g.lineTo(46, 122);
    g.lineTo(74, 98);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = kind === '!' || kind === '!?' ? '#fffaf2' : kind === 'heart' ? '#ff7aa8' : grey ? '#8a8290' : '#ff9a3c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'heart') {
      g.beginPath();
      g.moveTo(64, 82);
      g.bezierCurveTo(20, 54, 40, 18, 64, 40);
      g.bezierCurveTo(88, 18, 108, 54, 64, 82);
      g.fill();
    } else if (kind === '...') {
      g.fillStyle = '#2b1d2e';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(40 + i * 24, 56, 8, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      const text = grey ? '?' : kind;
      g.font = `900 ${text.length > 1 ? 58 : 72}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      g.lineWidth = grey ? 5 : 8;
      g.strokeStyle = grey ? '#6d6470' : '#2b1d2e';
      g.strokeText(text, 64, 58);
      g.fillText(text, 64, 58);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}

/** World-anchored text label texture ("hm?", "YOU"). */
export function labelTexture(text: string, fill = '#ffd166'): Texture | null {
  return drawLabel(text, fill);
}

function drawLabel(text: string, fill = '#ffd166', width = 256): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = 96;
    const g = c.getContext('2d');
    if (!g) return null;
    g.font = '900 64px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = '#2b1d2e';
    g.strokeText(text, width / 2, 50, width - 16);
    g.fillStyle = fill;
    g.fillText(text, width / 2, 50, width - 16);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}

/**
 * The human's thought bubble. Screen-constant size (sizeAttenuation off): ~40 px on a phone, so the "?" reads
 * in the whole-room shot. On TELEGRAPH a world-space "hm?" floats above it.
 */
export class Bubble {
  readonly sprite: Sprite;
  /** "hm?" text above the bubble during the telegraph. */
  readonly label: Sprite;
  private mat: SpriteMaterial;
  private labelMat: SpriteMaterial;
  private tex = new Map<string, Texture | null>();
  private labelTex: Texture | null | undefined;
  /** The cuddle line ("BAD KITTY… come here", GDD 4.3), drawn on first use. */
  private sayTex: Texture | null | undefined;
  private kind: BubbleKind = null;
  private popT = 0;

  constructor() {
    this.mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.sprite = new Sprite(this.mat);
    this.sprite.name = 'bubble';
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    this.labelMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.label = new Sprite(this.labelMat);
    this.label.name = 'bubble-label';
    this.label.renderOrder = 10;
    this.label.visible = false;
    // anchored under its bottom edge, so it sits just above the bubble in screen space
    this.label.center.set(0.5, -1.0);
  }

  /**
   * Draw every bubble texture now and bind one, so the sprite programs (map on) compile during the briefing and
   * no canvas draw or texture upload lands mid-run (the first turn used to hitch). Returns the textures to upload.
   */
  prewarm(): Texture[] {
    const out: Texture[] = [];
    for (const k of ['?', '?g', '!', '!?', '...', 'heart'] as const) {
      if (!this.tex.has(k)) this.tex.set(k, drawBubble(k));
      const t = this.tex.get(k);
      if (t) out.push(t);
    }
    if (this.labelTex === undefined) this.labelTex = drawLabel('hm?');
    if (this.labelTex) {
      out.push(this.labelTex);
      this.labelMat.map = this.labelTex;
      this.labelMat.needsUpdate = true;
    }
    if (!this.mat.map) {
      this.mat.map = this.tex.get('?') ?? null;
      this.mat.needsUpdate = true;
    }
    return out;
  }

  /**
   * kind: what to show (null hides). at: anchor (world). opts.peak / opts.ticks: the pop overshoot and its length
   * (TELEGRAPH "?": 0 → 1.3 → 1.0 over 6 ticks). opts.dx: horizontal offset from the anchor (m).
   */
  update(kind: BubbleKind, at: Vector3, T: number, opts: { peak?: number; ticks?: number; dx?: number; size?: number; labelScale?: number } = {}): void {
    if (kind === 'say') {
      // speech line only (no thought bubble): the cuddle's "BAD KITTY… come here"
      if (this.kind !== 'say') {
        this.kind = 'say';
        this.popT = T;
        if (this.sayTex === undefined) this.sayTex = drawLabel('BAD KITTY… come here', '#fffaf2', 768);
        this.labelMat.map = this.sayTex;
        this.labelMat.needsUpdate = true;
      }
      this.sprite.visible = false;
      this.label.visible = !!this.sayTex;
      if (this.label.visible) {
        const lk = Math.max(0.01, popScale((T - this.popT) / 5, 1.15));
        this.label.scale.set(BUBBLE_SCREEN * 4.2 * lk, BUBBLE_SCREEN * 0.52 * lk, 1);
        this.label.position.set(at.x, at.y + Math.sin(T * 0.15) * 0.02, at.z);
      }
      return;
    }
    if (kind !== this.kind) {
      if (this.kind === 'say' && this.labelTex) {
        this.labelMat.map = this.labelTex;
        this.labelMat.needsUpdate = true;
      }
      this.kind = kind;
      this.popT = T;
      if (kind) {
        if (!this.tex.has(kind)) this.tex.set(kind, drawBubble(kind));
        this.mat.map = this.tex.get(kind) ?? null;
        this.mat.needsUpdate = true;
      }
    }
    if (!kind || !this.mat.map) {
      this.sprite.visible = false;
      this.label.visible = false;
      return;
    }
    this.sprite.visible = true;
    const k = popScale((T - this.popT) / (opts.ticks ?? 6), opts.peak ?? (kind === '?' ? 1.3 : 1.2));
    const sc = BUBBLE_SCREEN * (opts.size ?? 1) * Math.max(0.01, k) * (kind === '!' || kind === '!?' ? 1 + Math.sin(T * 0.6) * 0.06 : 1);
    this.sprite.scale.set(sc, sc, 1);
    this.sprite.position.set(at.x + (opts.dx ?? 0.12), at.y + Math.sin(T * 0.15) * 0.02, at.z);
    // "hm?" above the bubble
    const hm = kind === '?';
    if (hm && this.labelTex === undefined) {
      this.labelTex = drawLabel('hm?');
      this.labelMat.map = this.labelTex;
      this.labelMat.needsUpdate = true;
    }
    // labelScale 0: the "?" without its "hm?" (the LOOK's first beat; "hm?" belongs to the TELEGRAPH)
    this.label.visible = hm && !!this.labelTex && (opts.labelScale ?? 1) > 0;
    if (this.label.visible) {
      const lk = Math.max(0.01, k) * (opts.labelScale ?? 1);
      this.label.scale.set(BUBBLE_SCREEN * 1.5 * lk, BUBBLE_SCREEN * 0.56 * lk, 1);
      this.label.position.copy(this.sprite.position);
    }
  }

  reset(): void {
    this.kind = null;
    this.sprite.visible = false;
    this.label.visible = false;
  }

  dispose(): void {
    for (const [, t] of this.tex) t?.dispose();
    this.labelTex?.dispose();
    this.sayTex?.dispose();
    this.mat.dispose();
    this.labelMat.dispose();
  }
}

/** Pop curve: 0 → peak over the first half, peak → 1 over the second (u = 0..1 of the pop's length). */
export function popScale(u: number, peak: number): number {
  if (!(u > 0)) return 0.01;
  if (u >= 1) return 1;
  if (u < 0.5) return peak * Math.sin((u / 0.5) * (Math.PI / 2));
  const v = (u - 0.5) / 0.5;
  return peak + (1 - peak) * v * v * (3 - 2 * v);
}

/** Bubble height as a fraction of the viewport (sizeAttenuation off): ~40 px on an 844 px tall phone. */
export const BUBBLE_SCREEN = 0.05;

/** Suspicion meter above the human's head: a ring that fills amber, red from 50 (the Perfect Crime line). */
export class SuspicionRing {
  readonly sprite: Sprite;
  private mat: SpriteMaterial;
  private canvas: HTMLCanvasElement | null = null;
  private tex: CanvasTexture | null = null;
  private shown = -1;

  constructor() {
    this.mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.sprite = new Sprite(this.mat);
    this.sprite.name = 'suspicion-ring';
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    // left of the head anchor (the bubble sits to the right)
    this.sprite.center.set(1.25, 0.2);
  }

  /** Draw the ring once now (map bound before the briefing compile, no mid-run program switch). */
  prewarm(): Texture | null {
    if (typeof document === 'undefined') return null;
    if (this.shown < 0) {
      this.shown = 0;
      this.draw(0);
    }
    return this.tex;
  }

  /** pct 0..100; hidden when 0 and nobody is looking. */
  update(pct: number, at: Vector3, show: boolean, T: number): void {
    if (!show || typeof document === 'undefined') {
      this.sprite.visible = false;
      return;
    }
    const q = Math.max(0, Math.min(100, Math.round(pct / 2) * 2));
    if (q !== this.shown) {
      this.shown = q;
      this.draw(q);
    }
    if (!this.tex) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    const beat = q >= 75 ? 1 + Math.max(0, Math.sin(T * 0.7)) * 0.08 : 1;
    const sc = 0.04 * beat;
    this.sprite.scale.set(sc, sc, 1);
    this.sprite.position.copy(at);
  }

  private draw(q: number): void {
    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 96;
        this.canvas.height = 96;
      }
      const g = this.canvas.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, 96, 96);
      g.lineCap = 'round';
      g.beginPath();
      g.arc(48, 48, 34, 0, Math.PI * 2);
      g.fillStyle = 'rgba(43,29,46,0.75)';
      g.fill();
      g.lineWidth = 12;
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.stroke();
      if (q > 0) {
        g.beginPath();
        g.arc(48, 48, 34, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * q) / 100);
        g.strokeStyle = suspicionColor(q);
        g.stroke();
      }
      g.font = '900 34px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fffaf2';
      g.fillText('👁', 48, 50);
      if (!this.tex) {
        this.tex = new CanvasTexture(this.canvas);
        this.tex.colorSpace = SRGBColorSpace;
        this.mat.map = this.tex;
        this.mat.needsUpdate = true;
      } else this.tex.needsUpdate = true;
    } catch {
      /* decoration */
    }
  }

  reset(): void {
    this.sprite.visible = false;
  }

  dispose(): void {
    this.tex?.dispose();
    this.mat.dispose();
  }
}

/**
 * Round 3: how long the LOOK still lasts, as a ring above the human's head that shrinks from full to empty
 * (progress = timer / stateTicks). Butter, turning green in the last 0.3 s: the release is where the tension is.
 * Redrawn only when its 32-step value or colour changes (a 64 px canvas).
 */
export const LOOK_RING_STEPS = 32;
export const LOOK_RING_GREEN_TICKS = 9;
export class LookTimerRing {
  readonly sprite: Sprite;
  private mat: SpriteMaterial;
  private canvas: HTMLCanvasElement | null = null;
  private tex: CanvasTexture | null = null;
  private shown = '';

  constructor() {
    this.mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.sprite = new Sprite(this.mat);
    this.sprite.name = 'look-timer';
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    // centred above the head anchor (the suspicion ring sits left, the bubble right)
    this.sprite.center.set(0.5, -0.35);
  }

  prewarm(): Texture | null {
    if (typeof document === 'undefined') return null;
    if (!this.shown) this.draw(LOOK_RING_STEPS, false);
    return this.tex;
  }

  /** left: ticks left in the LOOK, total: its length; show false hides. */
  update(left: number, total: number, at: Vector3, show: boolean): void {
    if (!show || total <= 0 || typeof document === 'undefined') {
      this.sprite.visible = false;
      return;
    }
    const q = Math.max(0, Math.min(LOOK_RING_STEPS, Math.ceil((left / total) * LOOK_RING_STEPS)));
    const green = left <= LOOK_RING_GREEN_TICKS;
    this.draw(q, green);
    if (!this.tex) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    const sc = green ? 0.05 : 0.044;
    this.sprite.scale.set(sc, sc, 1);
    this.sprite.position.copy(at);
  }

  private draw(q: number, green: boolean): void {
    const key = `${q}:${green ? 1 : 0}`;
    if (key === this.shown) return;
    this.shown = key;
    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 64;
        this.canvas.height = 64;
      }
      const g = this.canvas.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, 64, 64);
      g.lineCap = 'round';
      g.beginPath();
      g.arc(32, 32, 22, 0, Math.PI * 2);
      g.fillStyle = 'rgba(43,29,46,0.6)';
      g.fill();
      g.lineWidth = 9;
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.stroke();
      if (q > 0) {
        g.beginPath();
        g.arc(32, 32, 22, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * q) / LOOK_RING_STEPS);
        g.strokeStyle = green ? '#7bd389' : '#ffd166';
        g.stroke();
      }
      if (!this.tex) {
        this.tex = new CanvasTexture(this.canvas);
        this.tex.colorSpace = SRGBColorSpace;
        this.mat.map = this.tex;
        this.mat.needsUpdate = true;
      } else this.tex.needsUpdate = true;
    } catch {
      /* decoration */
    }
  }

  reset(): void {
    this.sprite.visible = false;
  }

  dispose(): void {
    this.tex?.dispose();
    this.mat.dispose();
  }
}

/** Shared suspicion colours (HUD bar, ring): amber below 50, red from 50 (the Perfect Crime limit). */
export function suspicionColor(pct: number): string {
  return pct >= 50 ? '#ff4d4d' : '#ffb347';
}

/** White radial glow (impact flash). */
function glowTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,250,235,0.85)');
    gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}

/** A white impact flash at a break point: 4 ticks, additive, grows and fades (render only). */
export class ImpactFlash {
  readonly sprite: Sprite;
  private mat: SpriteMaterial;
  private tex: Texture | null = null;
  private t0 = -1;
  private size = 0.5;

  constructor() {
    this.mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending });
    this.sprite = new Sprite(this.mat);
    this.sprite.name = 'impact-flash';
    this.sprite.renderOrder = 9;
    this.sprite.visible = false;
  }

  /** Bind the texture now (briefing), so the program compiles before the run. */
  prewarm(): Texture | null {
    if (!this.tex) {
      this.tex = glowTexture();
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
    }
    return this.tex;
  }

  fire(at: Vector3, T: number, size: number): void {
    this.prewarm();
    this.t0 = T;
    this.size = size;
    this.sprite.position.copy(at);
  }

  update(T: number): void {
    const u = this.t0 < 0 ? 1 : (T - this.t0) / 4;
    if (u < 0 || u >= 1 || !this.tex) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    this.mat.opacity = 1 - u * u;
    const sc = this.size * (0.6 + 0.9 * u);
    this.sprite.scale.set(sc, sc, 1);
  }

  reset(): void {
    this.t0 = -1;
    this.sprite.visible = false;
  }

  dispose(): void {
    this.tex?.dispose();
    this.mat.dispose();
  }
}
