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

let boldTex: THREE.Texture | null = null;
let crossTex: THREE.Texture | null = null;

/** Ink band under a bright band: tinted by the instance colour, the band takes the colour and the ink stays dark. */
function boldRing(g: CanvasRenderingContext2D, s: number, r: number): void {
  const c = s / 2;
  g.strokeStyle = 'rgba(20,10,16,0.88)';
  g.lineWidth = s * 0.13;
  g.beginPath();
  g.arc(c, c, s * r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = s * 0.065;
  g.beginPath();
  g.arc(c, c, s * r, 0, Math.PI * 2);
  g.stroke();
}

/**
 * A thick high-contrast ring (the player's own ring, the hover ring, the move marker): a bright band on a dark ink
 * band, so it reads on sand, grass, river and under additive VFX.
 */
export function boldRingTexture(): THREE.Texture {
  boldTex ??= canvasTexture(128, (g, s) => boldRing(g, s, 0.4));
  return boldTex;
}

/** The attack order marker: the bold ring plus four inward ticks (reads as "attack" by shape, not only by red). */
export function crosshairTexture(): THREE.Texture {
  crossTex ??= canvasTexture(128, (g, s) => {
    boldRing(g, s, 0.4);
    const c = s / 2;
    g.lineCap = 'round';
    for (const [w, col] of [
      [s * 0.12, 'rgba(20,10,16,0.88)'],
      [s * 0.055, '#fff'],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        g.moveTo(c + Math.cos(a) * s * 0.42, c + Math.sin(a) * s * 0.42);
        g.lineTo(c + Math.cos(a) * s * 0.2, c + Math.sin(a) * s * 0.2);
      }
      g.stroke();
    }
  });
  return crossTex;
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

/**
 * Trailer v3.5 glare pass: the "additive" ground marks (level auras, hero chroma, zones, tower ranges, the self ping)
 * are drawn with a screen blend, dst + src * (1 - dst) on the premultiplied mark: on grass a mark glows as brightly as
 * an additive one did, but over pale ground (the sand paths, the river, the dog plaza) it can no longer sum to white:
 * additive rings were blown-out white rims round every hero and the Champion's Challenge circle in every trailer cut.
 */
export const SCREEN_BLEND = Object.freeze({
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneMinusDstColorFactor,
  blendDst: THREE.OneFactor,
  premultipliedAlpha: true,
});

/** An instanced flat-quad layer: call begin(), add() per mark, end() once per frame. */
export class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor(tex: THREE.Texture, capacity: number, opts: { additive?: boolean; y?: number; renderOrder?: number; name?: string; depthTest?: boolean } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      toneMapped: false,
      ...(opts.additive ? SCREEN_BLEND : { blending: THREE.NormalBlending }),
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
