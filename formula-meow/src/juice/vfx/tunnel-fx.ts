/**
 * Tunnel light streaks (iteration 3, juice lane; SETPIECES.md section 9). Inside a tunnel, pulses of neon light race
 * along the arch toward and past the camera, faster the faster you drive (they run at 1.8× your speed relative to
 * you), stretched with speed: the "warp tunnel" feel. They are spread portal to portal over the tunnel you are in, so
 * a short tunnel (Kitchen's is 14 m) is as busy as a long one. One InstancedMesh (one draw call, and only while the player is
 * inside a tunnel); streaks never leave the tunnel's footprint. Reduced motion: hidden (the engine's static strips and
 * rings stay). Render-only: reads the race, never writes the sim.
 *
 * Iteration 4 (F2, feel lane; playtest: on a phone the streaks covered about two thirds of the Shelter cat-flap
 * tunnel): on a screen narrower than `TUNNEL_FX.narrowPx` the streaks run at half opacity on the walls only (not the
 * arch's crown, `facetsNarrow`), and everywhere a streak fades out within `nearFade` m of the camera (in the shader, per
 * pixel, so a streak racing past the lens never fills the screen). The road stays the brightest thing on screen.
 */
import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import type { RaceState } from '../../types';
import type { BuiltTrack } from '../../core/track/build';
import type { Theme } from '../../core/track/themes';
import { STUNT } from '../../tuning';

/** The numbers (tests read them). */
export const TUNNEL_FX = {
  streaks: 32,
  /** streaks are spread over the tunnel the player is in (portal to portal, however short it is), and wrap round it */
  /** speed of a pulse along the strip, as a share of the player's speed, toward the player */
  flow: 0.8,
  /** arch positions (facet index 0..8 like the engine's shell) and the inset from it (m) */
  facets: [1.4, 3.2, 4.8, 6.6] as readonly number[],
  inset: 0.35,
  /** length = base + speed × stretch (m) */
  base: 0.8,
  stretch: 0.28,
  /** iteration 4: below this CSS width (px) the phone look applies */
  narrowPx: 600,
  /** phone look: opacity scale and the wall-only arch positions (low on both walls, nothing on the crown) */
  narrowOpacity: 0.5,
  facetsNarrow: [0.9, 1.7, 6.3, 7.1] as readonly number[],
  /** a streak fades to nothing this close to the camera (m), on a phone; `nearFadeWide` on a wide screen */
  nearFade: 4,
  nearFadeWide: 2,
} as const;

/** True when the page is narrower than `TUNNEL_FX.narrowPx` (the phone look). */
export function narrowScreen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < TUNNEL_FX.narrowPx;
}

const _o = new Object3D();
const _c = new Color();

export class TunnelFx {
  readonly mesh: InstancedMesh;
  private readonly off: Float32Array;
  private readonly row: Uint8Array;
  private fade = 0;
  /** 0.4 … 1 from the quality tier: fewer streaks on the low tier */
  density = 1;
  /** the phone look (half opacity, walls only, 4 m near fade); null = from the window width every frame */
  narrow: boolean | null = null;
  /** the near fade distance the shader uses (m) */
  private readonly near = { value: TUNNEL_FX.nearFadeWide as number };

  constructor(
    private readonly scene: Scene,
    private readonly track: BuiltTrack,
    private readonly theme: Theme,
  ) {
    const n = TUNNEL_FX.streaks;
    const g = new BoxGeometry(0.32, 0.32, 1);
    g.translate(0, 0, -0.5); // the streak trails behind its head (toward the player)
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    // fade each pixel by its distance from the camera (view depth): nothing within ~0.5 m, full from `near`
    const near = this.near;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFmNear = near;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vFmDepth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFmDepth = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFmNear;\nvarying float vFmDepth;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep(0.5, uFmNear, vFmDepth);\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'fm-tunnel-near';
    this.mesh = new InstancedMesh(g, mat, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'fm-tunnel-streaks';
    this.mesh.visible = false;
    this.mesh.count = 0;
    // phase 0..1 along the tunnel (0 = entry portal), spread with a golden-ratio jitter so the rows never pulse in step
    this.off = new Float32Array(n);
    this.row = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.off[i] = (i * 0.618034) % 1;
      this.row[i] = i % TUNNEL_FX.facets.length;
    }
    scene.add(this.mesh);
  }

  /** How many streaks drew last frame (tests, QA). */
  get drawn(): number {
    return this.mesh.visible ? this.mesh.count : 0;
  }

  /**
   * One frame. `inside` 0..1 is the camera's tunnel blend (so the streaks fade in at the portal), `speed` the player's
   * speed (m/s), `calm` reduced motion.
   */
  update(st: RaceState, me: number, inside: number, speed: number, dt: number, calm: boolean): void {
    const t = this.track;
    const k = st.karts[me];
    const want = calm || !t.pieces.length ? 0 : inside;
    this.fade += (want - this.fade) * Math.min(1, dt * 6);
    if (this.fade < 0.02 || !k || k.branch !== -1 || k.si < 0 || k.si >= t.n) {
      this.mesh.visible = false;
      return;
    }
    const pc = this.tunnelOf(k.si);
    if (!pc) {
      this.mesh.visible = false;
      return;
    }
    const n = Math.max(8, Math.round(TUNNEL_FX.streaks * this.density));
    const span = Math.max(1, (pc.i1 - pc.i0 + t.n) % t.n);
    // the pulses run back toward the player along the arch: phase falls at `flow` × speed over the tunnel's length
    const flow = (speed * TUNNEL_FX.flow * dt) / Math.max(1, span * t.step);
    // never longer than half the tunnel (a short tunnel keeps its streaks between the portals)
    const len = Math.min(TUNNEL_FX.base + speed * TUNNEL_FX.stretch, Math.max(TUNNEL_FX.base, span * t.step * 0.5));
    const H = STUNT.tunnel.ceiling;
    const narrow = this.narrow ?? narrowScreen();
    const facets = narrow ? TUNNEL_FX.facetsNarrow : TUNNEL_FX.facets;
    this.near.value = narrow ? TUNNEL_FX.nearFade : TUNNEL_FX.nearFadeWide;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      let o = this.off[i] - flow;
      if (o < 0) o += 1;
      this.off[i] = o;
      const j = (pc.i0 + Math.round(o * span)) % t.n;
      if (!t.tunnelMask[j]) continue;
      const f = facets[this.row[i]];
      const W = Math.max(t.wallL[j], t.wallR[j]) + 0.9 - TUNNEL_FX.inset;
      const th = Math.PI * (f / 8);
      const lat = -Math.cos(th) * W;
      const h = 0.6 + Math.sin(th) * (H - 0.6 - TUNNEL_FX.inset);
      _o.position.set(t.px[j] - t.tz[j] * lat, t.py[j] + h, t.pz[j] + t.tx[j] * lat);
      // pointing forward along the road: the streak's tail reaches back toward the player
      _o.rotation.set(0, Math.atan2(t.tx[j], t.tz[j]), 0);
      _o.scale.set(1, 1, len);
      _o.updateMatrix();
      this.mesh.setMatrixAt(drawn, _o.matrix);
      this.mesh.setColorAt(drawn, _c.setHex(this.colorOf(i)));
      drawn++;
    }
    this.mesh.count = drawn;
    this.mesh.visible = drawn > 0;
    (this.mesh.material as MeshBasicMaterial).opacity = Math.min(1, this.fade) * (narrow ? TUNNEL_FX.narrowOpacity : 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** The tunnel piece around main sample `si` (null when none). */
  private tunnelOf(si: number): { i0: number; i1: number } | null {
    const t = this.track;
    for (const pc of t.pieces) {
      if (pc.kind !== 'tunnel') continue;
      if ((si - pc.i0 + t.n) % t.n <= (pc.i1 - pc.i0 + t.n) % t.n) return pc;
    }
    return null;
  }

  /** Streak colour: the theme's two neons by row, every third one white-hot. */
  private colorOf(i: number): number {
    return i % 3 === 2 ? 0xffffff : this.row[i] < 2 ? this.theme.neonB || 0x2cf6f3 : this.theme.neonA || 0xff3ea5;
  }

  /** Out of the scene now (a torn-down race); `dispose` frees the GPU side later. */
  detach(): void {
    this.scene.remove(this.mesh);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
