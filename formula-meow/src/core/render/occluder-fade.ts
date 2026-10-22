/**
 * Furniture that hides your kart fades (iteration 4, F14, Balloon Battle on the Rug). The arena's cover (the coffee
 * table, the sofa, the armchair, the cat tree, the plant pot: `BuiltTrack.blocks`) is drawn by the Rug dressing as one
 * merged mesh (`rug-props`, a lazy chunk). Each frame the camera → player sight line is tested against every block;
 * a block on that line fades to `OCCLUDER.alpha` (30 %) over `OCCLUDER.fadeS`, and back when the line clears.
 *
 * The fade is per pixel in that mesh's own shader (a uniform per block: centre, radius, alpha), so it stays one draw
 * call and the walls, shelves and floor never fade. The mesh moves to the transparent pass (drawn first in it, so
 * sparks and puffs still draw over it). Render only; reads the sim's block list, never writes it.
 */
import type { Material, Mesh, Object3D, Vector4 } from 'three';
import { Vector4 as V4 } from 'three';
import type { BuiltTrack } from '../track/build';

export const OCCLUDER = {
  /** a faded block's opacity */
  alpha: 0.3,
  /** seconds to fade out / back in */
  fadeS: 0.18,
  /** extra metres round a block's radius that still count as "in the way" (the sofa's arms, the chair's back) */
  pad: 1.4,
  /** fragments below this height never fade (the floor round a block) */
  floorY: 0.08,
  /** the shader's block slots */
  max: 8,
  /** the sight line ends this far above the kart (m): the cat's head, not the wheels */
  kartY: 1.1,
} as const;

/** The name the Rug dressing gives its merged prop mesh. */
export const RUG_PROPS = 'rug-props';

/**
 * True when the segment camera → target (x, z on the floor plane) passes within `r` of the block centre, between the
 * two ends (a block behind the camera or behind the kart never counts).
 */
export function blocksSight(cx: number, cz: number, tx: number, tz: number, bx: number, bz: number, r: number): boolean {
  const dx = tx - cx;
  const dz = tz - cz;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return false;
  const u = ((bx - cx) * dx + (bz - cz) * dz) / len2;
  if (u <= 0 || u >= 1) return false;
  const px = cx + dx * u - bx;
  const pz = cz + dz * u - bz;
  return px * px + pz * pz < r * r;
}

export class OccluderFade {
  /** the current alpha per block (1 = solid) */
  readonly alpha: Float32Array;
  private readonly uni: { value: Vector4[] };
  private mesh: Mesh | null = null;
  private readonly blocks: BuiltTrack['blocks'];

  constructor(private readonly root: Object3D, track: BuiltTrack) {
    this.blocks = track.blocks.slice(0, OCCLUDER.max);
    this.alpha = new Float32Array(this.blocks.length).fill(1);
    this.uni = { value: Array.from({ length: OCCLUDER.max }, () => new V4(0, 0, -1, 1)) };
    this.blocks.forEach((b, i) => this.uni.value[i].set(b.x, b.z, b.r + OCCLUDER.pad, 1));
  }

  /** How many blocks are faded below 0.99 right now (tests, QA). */
  get faded(): number {
    let n = 0;
    for (const a of this.alpha) if (a < 0.99) n++;
    return n;
  }

  /** True once the Rug's prop mesh has loaded and been patched. */
  get attached(): boolean {
    return this.mesh !== null;
  }

  /** One frame: the camera position and the player's shown position. `calm` (reduced motion) snaps instead of easing. */
  update(cam: { x: number; y: number; z: number }, kart: { x: number; y: number; z: number }, dt: number, calm = false): void {
    if (!this.blocks.length) return;
    if (!this.mesh) this.attach();
    const step = calm || OCCLUDER.fadeS <= 0 ? 1 : Math.min(1, dt / OCCLUDER.fadeS);
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const hide = blocksSight(cam.x, cam.z, kart.x, kart.z, b.x, b.z, b.r + OCCLUDER.pad * 0.5);
      const want = hide ? OCCLUDER.alpha : 1;
      const a = this.alpha[i];
      this.alpha[i] = a + Math.sign(want - a) * Math.min(Math.abs(want - a), step * (1 - OCCLUDER.alpha));
      this.uni.value[i].w = this.alpha[i];
    }
  }

  /** Find the dressing's mesh (it loads lazily) and give its material the per-block fade. */
  private attach(): void {
    const m = this.root.getObjectByName(RUG_PROPS) as Mesh | undefined;
    if (!m || !m.material || Array.isArray(m.material)) return;
    const mat = m.material as Material & { onBeforeCompile: Material['onBeforeCompile'] };
    const uni = this.uni;
    const n = OCCLUDER.max;
    mat.transparent = true;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFmBlocks = uni;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFmW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFmW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec4 uFmBlocks[${n}];\nvarying vec3 vFmW;`)
        .replace(
          '#include <opaque_fragment>',
          `if (vFmW.y > ${OCCLUDER.floorY.toFixed(2)}) {
            for (int i = 0; i < ${n}; i++) {
              vec4 b = uFmBlocks[i];
              if (b.z > 0.0 && b.w < 0.999 && distance(vFmW.xz, b.xy) < b.z) diffuseColor.a = min(diffuseColor.a, b.w);
            }
          }
          #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'fm-occluder-fade';
    mat.needsUpdate = true;
    // first in the transparent pass: particles and glyphs still draw over the furniture
    m.renderOrder = -0.5;
    this.mesh = m;
  }

  dispose(): void {
    this.mesh = null;
  }
}
