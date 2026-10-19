/**
 * Finish confetti (GDD 11: "finish confetti (paw shapes)"): paw prints and ribbon bits in the Token Tails palette,
 * fired from both lower corners and raining from the top. One InstancedMesh parented to the camera (one draw call,
 * and it is in the recorded clip). Render-only randomness.
 */
import { BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry, type PerspectiveCamera } from 'three';

const MAX = 160;
const PALETTE = [0xff3ea5, 0x2cf6f3, 0xffd27a, 0xfff3dc, 0xff9f7a, 0x7dff6a, 0xb07fd8];
const _o = new Object3D();
const _c = new Color();

function confettiGeometry(): BufferGeometry {
  // half the instances read as paws: one geometry = a paw (pad + 4 toes); ribbons are the same mesh squashed thin
  const parts: BufferGeometry[] = [];
  const pad = new Shape();
  pad.absellipse(0, -0.02, 0.1, 0.085, 0, Math.PI * 2, false, 0);
  parts.push(new ShapeGeometry(pad, 6));
  for (const [x, y] of [
    [-0.095, 0.085],
    [-0.035, 0.13],
    [0.035, 0.13],
    [0.095, 0.085],
  ]) {
    const t = new Shape();
    t.absellipse(x, y, 0.03, 0.037, 0, Math.PI * 2, false, 0);
    parts.push(new ShapeGeometry(t, 5));
  }
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return out;
}

export class Confetti {
  private readonly mesh: InstancedMesh;
  private readonly p = new Float32Array(MAX * 3);
  private readonly v = new Float32Array(MAX * 3);
  private readonly rot = new Float32Array(MAX * 3);
  private readonly spin = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private next = 0;
  private active = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.mesh = new InstancedMesh(confettiGeometry(), new MeshBasicMaterial({ side: DoubleSide, toneMapped: false, depthTest: false, depthWrite: false, transparent: true }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.count = 0;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** Fire a burst. `big` = a win (both cannons plus the rain). `scale` (0.4..1) follows the quality tier. */
  fire(big: boolean, scale = 1): void {
    const n = Math.round((big ? MAX : 90) * scale);
    const aspect = this.camera.aspect;
    for (let i = 0; i < n; i++) {
      const j = this.next;
      this.next = (j + 1) % MAX;
      const z = -3 - Math.random() * 2.5;
      const halfH = Math.tan(((this.camera.fov / 2) * Math.PI) / 180) * -z;
      const halfW = halfH * aspect;
      const mode = big && i % 3 === 2 ? 2 : i % 2; // 0 left cannon, 1 right cannon, 2 rain
      if (mode === 2) {
        this.p.set([(Math.random() * 2 - 1) * halfW, halfH * (1.05 + Math.random() * 0.6), z], j * 3);
        this.v.set([(Math.random() - 0.5) * 0.6, -0.4 - Math.random() * 0.6, 0], j * 3);
      } else {
        const side = mode === 0 ? -1 : 1;
        this.p.set([side * halfW * 0.98, -halfH * 0.95, z], j * 3);
        const sp = halfH * (2.4 + Math.random() * 1.5);
        const a = (Math.PI / 2) * (0.62 + Math.random() * 0.3);
        this.v.set([-side * Math.cos(a) * sp * 0.75, Math.sin(a) * sp, (Math.random() - 0.5) * 0.5], j * 3);
      }
      this.rot.set([Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3], j * 3);
      this.spin.set([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6], j * 3);
      this.life[j] = 2.6 + Math.random() * 1.4;
      this.kind[j] = Math.random() < 0.55 ? 0 : 1;
      this.mesh.setColorAt(j, _c.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.active = MAX;
  }

  update(dt: number): void {
    if (this.active <= 0) {
      this.mesh.visible = false;
      return;
    }
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        _o.scale.setScalar(0);
      } else {
        this.life[i] -= dt;
        alive++;
        const k = i * 3;
        // gravity with air drag and a flutter
        this.v[k + 1] -= 2.6 * dt;
        this.v[k] *= 1 - 1.4 * dt;
        this.v[k + 1] *= 1 - 1.1 * dt;
        this.p[k] += (this.v[k] + Math.sin(this.rot[k] * 2) * 0.25) * dt;
        this.p[k + 1] += this.v[k + 1] * dt;
        this.p[k + 2] += this.v[k + 2] * dt;
        for (let a = 0; a < 3; a++) this.rot[k + a] += this.spin[k + a] * dt;
        _o.position.set(this.p[k], this.p[k + 1], this.p[k + 2]);
        _o.rotation.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
        const fade = Math.min(1, this.life[i] / 0.4);
        if (this.kind[i] === 0) _o.scale.setScalar(fade);
        else _o.scale.set(0.35 * fade, 1.3 * fade, fade);
      }
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    this.mesh.count = MAX;
    this.mesh.visible = alive > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) this.active = 0;
  }

  clear(): void {
    this.life.fill(0);
    this.active = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
