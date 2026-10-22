/**
 * Kart headlights for the Night Wild Card (iteration 4, F11, render only). Every kart gets two warm lamp dots on its
 * nose and a soft teardrop of light on the road ahead of it. Two InstancedMeshes for the whole field (2 draw calls),
 * additive, no real lights (a SpotLight per kart would cost every lit pixel on a phone). The pools follow the kart's
 * own transform, so on a loop or a wall lane they lie on the surface the kart drives on; in the air and while the big
 * hand carries a kart they switch off. Never writes the sim.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  DataTexture,
  DynamicDrawUsage,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  type Object3D,
  type Scene,
} from 'three';

export const HEADLIGHTS = {
  /** the light pool on the road: length and width (m), starting this far ahead of the kart's centre */
  length: 9,
  width: 4.2,
  ahead: 1.1,
  /** lamp dots: lateral offset, height, forward offset (m), size */
  lampX: 0.42,
  lampY: 0.52,
  lampZ: 1.05,
  lampSize: 0.2,
  /** warm white */
  color: 0xffe2a8,
  /** pool brightness (additive) */
  poolOpacity: 0.32,
} as const;

/** A teardrop beam: bright and narrow at the lamp (v = 0), wide and fading at the far end (v = 1). Built in code. */
function beamTexture(): DataTexture {
  const W = 32;
  const H = 64;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    // the beam widens from 35 % of the texture at the lamp to the full width at the far end
    const half = 0.18 + 0.32 * Math.sqrt(v);
    const along = Math.pow(1 - v, 1.3) * Math.min(1, v * 8 + 0.25);
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5);
      const across = Math.max(0, 1 - Math.pow(u / half, 2));
      const a = Math.round(255 * along * across);
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a;
    }
  }
  const t = new DataTexture(d, W, H, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _local = new Matrix4();
const _m = new Matrix4();
const ZERO = new Matrix4().makeScale(0, 0, 0);

export class Headlights {
  readonly pools: InstancedMesh;
  readonly lamps: InstancedMesh;
  private readonly poolLocal: Matrix4;
  private readonly lampLocal: [Matrix4, Matrix4];

  constructor(
    private readonly scene: Scene,
    private readonly n: number,
  ) {
    const H = HEADLIGHTS;
    const pg = new PlaneGeometry(H.width, H.length);
    // lie flat, the lamp end (v = 0) at the kart, the far end ahead (+z)
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, 0, H.length / 2);
    const tex = beamTexture();
    // PlaneGeometry's v runs bottom (0) → top (1); after the rotation top is −z, so flip v to put v = 0 at the lamp
    const uv = pg.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const pm = new MeshBasicMaterial({ color: H.color, map: tex, transparent: true, opacity: H.poolOpacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
    this.pools = new InstancedMesh(pg, pm, n);
    this.pools.name = 'fm-headlight-pools';
    this.pools.renderOrder = 2;
    this.pools.frustumCulled = false;
    this.pools.instanceMatrix.setUsage(DynamicDrawUsage);
    const lg = new BoxGeometry(H.lampSize, H.lampSize * 0.7, 0.08);
    const lm = new MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false });
    this.lamps = new InstancedMesh(lg, lm, n * 2);
    this.lamps.name = 'fm-headlight-lamps';
    this.lamps.frustumCulled = false;
    this.lamps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.poolLocal = new Matrix4().makeTranslation(0, 0.07, H.ahead);
    this.lampLocal = [new Matrix4().makeTranslation(-H.lampX, H.lampY, H.lampZ), new Matrix4().makeTranslation(H.lampX, H.lampY, H.lampZ)];
    for (let i = 0; i < n; i++) {
      this.pools.setMatrixAt(i, ZERO);
      this.lamps.setMatrixAt(i * 2, ZERO);
      this.lamps.setMatrixAt(i * 2 + 1, ZERO);
    }
    scene.add(this.pools, this.lamps);
  }

  /**
   * Place kart `i`'s lights from its root (call after the kart view has been updated this frame). `pool` false keeps
   * the lamps lit but switches the road pool off (in the air, carried, faded out next to the lens).
   */
  place(i: number, root: Object3D, visible: boolean, pool: boolean): void {
    if (i >= this.n) return;
    if (!visible) {
      this.pools.setMatrixAt(i, ZERO);
      this.lamps.setMatrixAt(i * 2, ZERO);
      this.lamps.setMatrixAt(i * 2 + 1, ZERO);
    } else {
      root.updateMatrix();
      this.pools.setMatrixAt(i, pool ? _m.multiplyMatrices(root.matrix, this.poolLocal) : ZERO);
      for (let s = 0; s < 2; s++) this.lamps.setMatrixAt(i * 2 + s, _local.multiplyMatrices(root.matrix, this.lampLocal[s]));
    }
    this.pools.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.pools, this.lamps);
    for (const m of [this.pools, this.lamps]) {
      m.geometry.dispose();
      const mat = m.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      m.dispose();
    }
  }
}
