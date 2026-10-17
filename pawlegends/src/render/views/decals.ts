/**
 * Ground decals: canvas-drawn ring and disc textures, and an instanced flat-quad layer (one draw call per layer)
 * for unit rings, zones and similar marks. Render only.
 */
import * as THREE from 'three';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let ringTex: THREE.Texture | null = null;
let discTex: THREE.Texture | null = null;
let dashTex: THREE.Texture | null = null;

/** A crisp ring with a soft inner glow (unit selection rings). */
export function ringTexture(): THREE.Texture {
  ringTex ??= canvasTexture(128, (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c, s * 0.28, c, c, s * 0.46);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#fff';
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(c, c, s * 0.42, 0, Math.PI * 2);
    g.stroke();
  });
  return ringTex;
}

/** A soft filled disc with a bright rim (zones, traps, range previews). */
export function discTexture(): THREE.Texture {
  discTex ??= canvasTexture(128, (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, s * 0.5);
    grd.addColorStop(0, 'rgba(255,255,255,0.18)');
    grd.addColorStop(0.82, 'rgba(255,255,255,0.32)');
    grd.addColorStop(0.9, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.97, 'rgba(255,255,255,0.4)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  return discTex;
}

/** A dashed ring (tower range). */
export function dashRingTexture(): THREE.Texture {
  dashTex ??= canvasTexture(256, (g, s) => {
    const c = s / 2;
    g.strokeStyle = '#fff';
    g.lineWidth = s * 0.018;
    g.setLineDash([s * 0.05, s * 0.035]);
    g.beginPath();
    g.arc(c, c, s * 0.48, 0, Math.PI * 2);
    g.stroke();
    const grd = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.48);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0.16)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(c, c, s * 0.48, 0, Math.PI * 2);
    g.fill();
  });
  return dashTex;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const UP_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/** An instanced flat-quad layer: call begin(), add() per mark, end() once per frame. */
export class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor(tex: THREE.Texture, capacity: number, opts: { additive?: boolean; y?: number; renderOrder?: number; name?: string } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 2;
    this.mesh.name = opts.name ?? 'decals';
    this.y = opts.y ?? 0.04;
  }

  private readonly y: number;

  begin(): void {
    this.n = 0;
  }

  /** A mark centred at (x, z) metres, `size` metres across, rotated `yaw` around Y, coloured (×alpha via colour). */
  add(x: number, z: number, size: number, color: number, alpha = 1, yaw = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    _q.setFromAxisAngle(_p.set(0, 1, 0), yaw).multiply(UP_Q);
    _m.compose(_p.set(x, this.y, z), _q, _s.set(size, size, 1));
    this.mesh.setMatrixAt(this.n, _m);
    _c.setHex(color).multiplyScalar(alpha);
    this.mesh.setColorAt(this.n, _c);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
