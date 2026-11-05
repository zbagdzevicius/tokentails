/**
 * Match lifecycle sprites (render only): one instanced, camera-facing quad pool drawn from a small canvas atlas of cute
 * glyphs (ghost cat, ghost dog, paw print, Zzz, pillow, halo, padlock, digits, heart, bone, star, yarn, fish, sparkle).
 * One draw call for every sprite on screen; no allocation per frame. Two ways in:
 * - `spawn()`: a short-lived sprite that moves, grows and fades on its own (souls, Zzz, paw prints);
 * - `put()`: an immediate sprite for this frame only (the gate padlocks and their digits, the spawn pad paw).
 */
import * as THREE from 'three';

/** Atlas cells (4 × 4, 64 px each). */
export const GLYPH = Object.freeze({
  ghostCat: 0,
  ghostDog: 1,
  paw: 2,
  zzz: 3,
  pillow: 4,
  halo: 5,
  lock: 6,
  one: 7,
  two: 8,
  three: 9,
  heart: 10,
  bone: 11,
  star: 12,
  yarn: 13,
  fish: 14,
  sparkle: 15,
});
export type Glyph = (typeof GLYPH)[keyof typeof GLYPH];

/** The digit glyph for 1..3 (else -1). */
export function digitGlyph(n: number): number {
  return n === 1 ? GLYPH.one : n === 2 ? GLYPH.two : n === 3 ? GLYPH.three : -1;
}

/** How a transient sprite moves (all optional). */
export interface SpriteSpawn {
  x: number;
  y: number;
  z: number;
  glyph: number;
  color?: number;
  /** Size (m) at birth and at death. */
  size0: number;
  size1?: number;
  life: number;
  delay?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Side-to-side sway (m) and its rate (Hz). */
  sway?: number;
  swayHz?: number;
  /** Rotation (rad) and spin (rad/s). */
  rot?: number;
  spin?: number;
  /** Peak alpha. */
  alpha?: number;
  /** 0: fade out over the last 40%; 1: pop (grow with overshoot, then fade); 2: fade in and out. */
  curve?: 0 | 1 | 2;
}

const CAP = 64;
const IMMEDIATE = 24;
/** Floats per transient sprite. */
const S = 20;
const INK = '#3a2433';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iPar;   // size (m), cell, alpha, rotation
attribute vec3 iCol;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  float cs = cos(iPar.w), sn = sin(iPar.w);
  mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * iPar.x;
  gl_Position = projectionMatrix * mv;
  float cx = mod(iPar.y, 4.0);
  float cy = floor(iPar.y / 4.0 + 0.001);
  vUv = (vec2(cx, 3.0 - cy) + uv) * 0.25;
  vA = iPar.z;
  vCol = iCol;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * vCol, a);
}`;

/** The glyph atlas, painted once (white fills with an ink outline, so a tint colours the fill only). */
export function paintAtlas(ctx: CanvasRenderingContext2D): void {
  const C = 64;
  ctx.clearRect(0, 0, C * 4, C * 4);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const cell = (i: number, draw: () => void): void => {
    ctx.save();
    ctx.translate((i % 4) * C, Math.floor(i / 4) * C);
    ctx.beginPath();
    ctx.rect(0, 0, C, C);
    ctx.clip();
    draw();
    ctx.restore();
  };
  const ink = (w = 5): void => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fill();
  };
  const ghost = (dog: boolean): void => {
    ctx.beginPath();
    ctx.moveTo(14, 54);
    ctx.lineTo(14, 30);
    ctx.bezierCurveTo(14, 14, 50, 14, 50, 30);
    ctx.lineTo(50, 54);
    // the wavy hem
    for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(50 - k * 9 - 4.5, 47 + (k % 2) * 4, 50 - (k + 1) * 9, 54);
    ctx.closePath();
    ink();
    // ears
    ctx.beginPath();
    if (dog) {
      ctx.ellipse(13, 30, 5, 11, 0.35, 0, Math.PI * 2);
      ink(4);
      ctx.beginPath();
      ctx.ellipse(51, 30, 5, 11, -0.35, 0, Math.PI * 2);
      ink(4);
    } else {
      ctx.moveTo(17, 24);
      ctx.lineTo(19, 9);
      ctx.lineTo(29, 19);
      ctx.moveTo(47, 24);
      ctx.lineTo(45, 9);
      ctx.lineTo(35, 19);
      ink(4);
    }
    // closed happy eyes and a tiny mouth
    ctx.beginPath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.arc(25, 33, 4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(43, 33);
    ctx.arc(39, 33, 4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(29, 40);
    ctx.quadraticCurveTo(32, 43, 35, 40);
    ctx.stroke();
    if (dog) {
      ctx.beginPath();
      ctx.fillStyle = INK;
      ctx.ellipse(32, 37, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const paw = (cx: number, cy: number, s: number): void => {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2);
    ink(4 * s);
    for (const [dx, dy] of [
      [-13, -6],
      [-5, -13],
      [5, -13],
      [13, -6],
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * s, cy + dy * s, 4.5 * s, 5.5 * s, 0, 0, Math.PI * 2);
      ink(4 * s);
    }
  };
  const text = (t: string, size: number): void => {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.strokeText(t, 32, 35);
    ctx.fillStyle = '#fff';
    ctx.fillText(t, 32, 35);
  };
  const star = (cx: number, cy: number, r0: number, r1: number, n: number): void => {
    ctx.beginPath();
    for (let k = 0; k < n * 2; k++) {
      const r = k % 2 ? r1 : r0;
      const a = -Math.PI / 2 + (k * Math.PI) / n;
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  };
  cell(GLYPH.ghostCat, () => ghost(false));
  cell(GLYPH.ghostDog, () => ghost(true));
  cell(GLYPH.paw, () => paw(32, 34, 1.3));
  cell(GLYPH.zzz, () => text('Z', 50));
  cell(GLYPH.pillow, () => {
    ctx.beginPath();
    ctx.moveTo(10, 18);
    ctx.quadraticCurveTo(32, 26, 54, 18);
    ctx.quadraticCurveTo(48, 32, 54, 46);
    ctx.quadraticCurveTo(32, 38, 10, 46);
    ctx.quadraticCurveTo(16, 32, 10, 18);
    ctx.closePath();
    ink();
  });
  cell(GLYPH.halo, () => {
    ctx.beginPath();
    ctx.ellipse(32, 32, 24, 9, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.stroke();
  });
  cell(GLYPH.lock, () => {
    ctx.beginPath();
    ctx.arc(32, 26, 12, Math.PI, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(13, 26, 38, 30, 7);
    ink();
    ctx.save();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(32, 45, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const dx of [-6, -2, 2, 6]) {
      ctx.beginPath();
      ctx.arc(32 + dx, 37 + Math.abs(dx) / 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  cell(GLYPH.one, () => text('1', 54));
  cell(GLYPH.two, () => text('2', 54));
  cell(GLYPH.three, () => text('3', 54));
  cell(GLYPH.heart, () => {
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(4, 34, 12, 8, 32, 22);
    ctx.bezierCurveTo(52, 8, 60, 34, 32, 54);
    ctx.closePath();
    ink();
  });
  cell(GLYPH.bone, () => {
    ctx.beginPath();
    ctx.roundRect(16, 27, 32, 10, 4);
    for (const [x, y] of [
      [14, 25],
      [14, 39],
      [50, 25],
      [50, 39],
    ]) {
      ctx.moveTo(x + 7, y);
      ctx.arc(x, y, 7, 0, Math.PI * 2);
    }
    ink();
  });
  cell(GLYPH.star, () => {
    star(32, 34, 25, 11, 5);
    ink();
  });
  cell(GLYPH.yarn, () => {
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ink();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (const k of [-10, 0, 10]) {
      ctx.beginPath();
      ctx.ellipse(32 + k * 0.4, 32, 20 - Math.abs(k), 9, 0.7 + k * 0.05, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  cell(GLYPH.fish, () => {
    ctx.beginPath();
    ctx.ellipse(28, 32, 17, 11, 0, 0, Math.PI * 2);
    ctx.moveTo(43, 32);
    ctx.lineTo(57, 21);
    ctx.lineTo(57, 43);
    ctx.closePath();
    ink();
    ctx.beginPath();
    ctx.fillStyle = INK;
    ctx.arc(20, 29, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  cell(GLYPH.sparkle, () => {
    star(32, 32, 28, 6, 4);
    ink(4);
  });
}

/** Raw 0..1 channels of a hex colour (no colour management: the atlas is drawn in display values). */
export function hexRgb(hex: number, out: [number, number, number]): [number, number, number] {
  out[0] = ((hex >> 16) & 255) / 255;
  out[1] = ((hex >> 8) & 255) / 255;
  out[2] = (hex & 255) / 255;
  return out;
}

const _rgb: [number, number, number] = [1, 1, 1];

export class LifeSprites {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly tex: THREE.Texture | null;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aPar: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  /** Transient sprite state, S floats each: x y z vx vy vz age life delay s0 s1 cell r g b alpha sway swayHz rot spin. */
  private readonly st = new Float32Array(CAP * S);
  private readonly curve = new Uint8Array(CAP);
  private n = 0;
  private imm = 0;
  /** Count scale for the quality tier / reduce motion (1 = all). */
  budget = 1;

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const total = CAP + IMMEDIATE;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    for (const a of [this.aPos, this.aPar, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iPar', this.aPar);
    g.setAttribute('iCol', this.aCol);
    g.instanceCount = 0;
    this.geo = g;
    this.tex = makeAtlas();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: this.tex } },
      transparent: true,
      depthWrite: false,
      // glyphs read over trees and bodies (a soul under the canopy, a pillow inside a hero was lost)
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'lifecycle-sprites';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  /** Live transient sprites (tests, telemetry). */
  get live(): number {
    return this.n;
  }

  /** A short-lived sprite. Returns false when the pool is full. */
  spawn(o: SpriteSpawn): boolean {
    if (this.n >= CAP) return false;
    const b = this.n++ * S;
    const s = this.st;
    s[b] = o.x;
    s[b + 1] = o.y;
    s[b + 2] = o.z;
    s[b + 3] = o.vx ?? 0;
    s[b + 4] = o.vy ?? 0;
    s[b + 5] = o.vz ?? 0;
    s[b + 6] = 0;
    s[b + 7] = Math.max(0.05, o.life);
    s[b + 8] = o.delay ?? 0;
    s[b + 9] = o.size0;
    s[b + 10] = o.size1 ?? o.size0;
    s[b + 11] = o.glyph;
    hexRgb(o.color ?? 0xffffff, _rgb);
    s[b + 12] = _rgb[0];
    s[b + 13] = _rgb[1];
    s[b + 14] = _rgb[2];
    s[b + 15] = o.alpha ?? 1;
    s[b + 16] = o.sway ?? 0;
    s[b + 17] = o.swayHz ?? 1;
    s[b + 18] = o.rot ?? 0;
    s[b + 19] = o.spin ?? 0;
    this.curve[this.n - 1] = o.curve ?? 0;
    return true;
  }

  /** Start the frame's immediate sprites (call before `put`). */
  begin(): void {
    this.imm = 0;
  }

  /** An immediate sprite for this frame only. */
  put(x: number, y: number, z: number, size: number, glyph: number, color = 0xffffff, alpha = 1, rot = 0): void {
    if (this.imm >= IMMEDIATE || alpha <= 0.01 || size <= 0) return;
    const i = CAP + this.imm++;
    this.aPos.setXYZ(i, x, y, z);
    this.aPar.setXYZW(i, size, glyph, alpha, rot);
    hexRgb(color, _rgb);
    this.aCol.setXYZ(i, _rgb[0], _rgb[1], _rgb[2]);
  }

  /** Advance the transient sprites and pack every sprite into the instance buffer. */
  update(dt: number): void {
    const s = this.st;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const b = i * S;
      s[b + 6] += dt;
      const t = s[b + 6] - s[b + 8];
      if (t >= s[b + 7]) continue;
      // compact in place (keeps spawn order)
      if (w !== i) {
        s.copyWithin(w * S, b, b + S);
        this.curve[w] = this.curve[i];
      }
      w++;
    }
    this.n = w;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const b = i * S;
      const t = s[b + 6] - s[b + 8];
      if (t < 0) continue;
      s[b] += s[b + 3] * dt;
      s[b + 1] += s[b + 4] * dt;
      s[b + 2] += s[b + 5] * dt;
      const u = t / s[b + 7];
      const c = this.curve[i];
      let size = s[b + 9] + (s[b + 10] - s[b + 9]) * u;
      let a = s[b + 15];
      if (c === 1) {
        const pop = Math.min(1, t / 0.18);
        size *= pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
        a *= 1 - Math.max(0, (u - 0.6) / 0.4);
      } else if (c === 2) a *= Math.min(1, u / 0.2, (1 - u) / 0.35);
      else a *= 1 - Math.max(0, (u - 0.6) / 0.4);
      const sway = s[b + 16] * Math.sin(t * s[b + 17] * Math.PI * 2);
      this.aPos.setXYZ(k, s[b] + sway, s[b + 1], s[b + 2]);
      this.aPar.setXYZW(k, Math.max(0, size), s[b + 11], Math.max(0, a), s[b + 18] + s[b + 19] * t);
      this.aCol.setXYZ(k, s[b + 12], s[b + 13], s[b + 14]);
      k++;
    }
    // the immediate sprites sit at CAP..; move them down behind the live transient ones
    for (let j = 0; j < this.imm; j++) {
      const from = CAP + j;
      const to = k + j;
      if (from === to) continue;
      this.aPos.setXYZ(to, this.aPos.getX(from), this.aPos.getY(from), this.aPos.getZ(from));
      this.aPar.setXYZW(to, this.aPar.getX(from), this.aPar.getY(from), this.aPar.getZ(from), this.aPar.getW(from));
      this.aCol.setXYZ(to, this.aCol.getX(from), this.aCol.getY(from), this.aCol.getZ(from));
    }
    const count = k + this.imm;
    this.geo.instanceCount = count;
    this.mesh.visible = count > 0 && this.tex !== null;
    if (count > 0) this.aPos.needsUpdate = this.aPar.needsUpdate = this.aCol.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.imm = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.tex?.dispose();
  }
}

function makeAtlas(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    paintAtlas(ctx);
    const t = new THREE.CanvasTexture(c);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 1;
    return t;
  } catch {
    return null;
  }
}
