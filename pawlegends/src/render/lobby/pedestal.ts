/**
 * Lobby pedestal: a two-tier stand (a dark base and a cream top disc), a paw-rune ring drawn once on a 256² canvas
 * that turns slowly in the element tint, and on Med and High an additive light cone around the hero. The top of the
 * upper disc is y = 0 (the hero's feet), as with the old single cylinder.
 *
 * Render only.
 */
import * as THREE from 'three';

const WHITE = new THREE.Color(0xffffff);

/** Radius (m) of the lower base: the framing keeps its front rim in view. */
export const PEDESTAL_R = 1.95;
/** Lowest point (m) of the pedestal. */
export const PEDESTAL_BOTTOM = -0.52;

/** A paw print (four toes and a pad) centred on (x, y), `s` across, rotated by `a`. */
function paw(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.ellipse(0, s * 0.12, s * 0.26, s * 0.21, 0, 0, Math.PI * 2);
  for (const [tx, ty] of [
    [-0.27, -0.12],
    [-0.1, -0.28],
    [0.1, -0.28],
    [0.27, -0.12],
  ]) {
    g.moveTo(tx * s + s * 0.09, ty * s);
    g.ellipse(tx * s, ty * s, s * 0.09, s * 0.11, 0, 0, Math.PI * 2);
  }
  g.fill();
  g.restore();
}

/** The rune ring texture: white on transparent (tinted by the material). Null without a DOM canvas (tests). */
function runeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const m = 128;
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(m, m, 122, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(m, m, 96, 0, Math.PI * 2);
  g.stroke();
  // paws between the two circles, with small diamonds in the gaps
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    paw(g, m + Math.cos(a) * 109, m + Math.sin(a) * 109, 17, a + Math.PI / 2);
    const b = a + Math.PI / n;
    g.save();
    g.translate(m + Math.cos(b) * 109, m + Math.sin(b) * 109);
    g.rotate(b);
    g.fillRect(-2.5, -2.5, 5, 5);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

const CONE_VERT = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  vH = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uAlpha;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  // bright at the floor, gone at the top; soft at the silhouette edges
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = (1.0 - vH) * (1.0 - vH) * edge * uAlpha;
  gl_FragColor = vec4(uTint * a, a);
  #include <colorspace_fragment>
}`;

export interface Pedestal {
  readonly group: THREE.Group;
  setTint(hex: number): void;
  /** The light cone (Med and High). */
  setCone(on: boolean): void;
  update(dt: number, frozen: boolean): void;
  /** A pulse of the rune ring (an equip). */
  pulse(): void;
  dispose(): void;
}

export function createPedestal(): Pedestal {
  const group = new THREE.Group();
  group.name = 'lobby-pedestal';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  // lower base: v6 logo plum stone (one-style pass: a step lighter so it reads as a solid piece in the midday key art)
  const baseMat = keep(new THREE.MeshLambertMaterial({ color: 0x633077 }));
  const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(PEDESTAL_R - 0.05, PEDESTAL_R, 0.3, 40)), baseMat);
  base.position.y = PEDESTAL_BOTTOM + 0.15;
  base.receiveShadow = true;
  group.add(base);
  const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(PEDESTAL_R - 0.05, 0.035, 6, 56)), keep(new THREE.MeshBasicMaterial({ color: 0xf7bc3c })));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = PEDESTAL_BOTTOM + 0.3;
  group.add(lip);
  // upper disc: cream, where the hero stands (its top at y = 0)
  const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 1.58, 0.22, 40)), keep(new THREE.MeshLambertMaterial({ color: 0xfff3e3 })));
  top.position.y = -0.11;
  top.receiveShadow = true;
  group.add(top);
  const trimMat = keep(new THREE.MeshBasicMaterial({ color: 0xff3d7f }));
  const trim = new THREE.Mesh(keep(new THREE.TorusGeometry(1.53, 0.045, 6, 56)), trimMat);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = -0.005;
  group.add(trim);
  // the rune ring lies on the lower base's top face, around the upper disc
  const tex = runeTexture();
  if (tex) keep(tex);
  const runeMat = keep(
    new THREE.MeshBasicMaterial({ color: 0xff9f6b, map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const rune = new THREE.Mesh(keep(new THREE.CircleGeometry(PEDESTAL_R - 0.08, 48)), runeMat);
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = PEDESTAL_BOTTOM + 0.305;
  rune.visible = !!tex;
  group.add(rune);
  // light cone (Med/High): open cylinder, additive, fading upward
  const coneU = { uTint: { value: new THREE.Color(0xff9f6b) }, uAlpha: { value: 0.4 } };
  const coneMat = keep(
    new THREE.ShaderMaterial({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, uniforms: coneU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
  );
  const cone = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.95, 1.45, 4.2, 32, 1, true)), coneMat);
  cone.position.y = 2.1;
  cone.renderOrder = 2;
  group.add(cone);

  const tint = new THREE.Color(0xff9f6b);
  const cur = new THREE.Color(0xff9f6b);
  let pulse = 0;
  return {
    group,
    setTint(hex) {
      tint.setHex(hex);
    },
    setCone(on) {
      cone.visible = on;
    },
    pulse() {
      pulse = 1;
    },
    update(dt, frozen) {
      cur.lerp(tint, Math.min(1, dt * 3));
      runeMat.color.copy(cur);
      coneU.uTint.value.copy(cur).lerp(WHITE, 0.55);
      trimMat.color.copy(cur).lerp(WHITE, 0.15);
      if (!frozen) rune.rotation.z += dt * 0.12;
      pulse = Math.max(0, pulse - dt * 1.6);
      runeMat.opacity = 0.75 + pulse * 0.25;
      coneU.uAlpha.value = 0.2 + pulse * 0.6;
      rune.scale.setScalar(1 + pulse * 0.04);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
