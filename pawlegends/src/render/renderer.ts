/**
 * three.js renderer, lights and the iso camera (lifted PPK IsoRig maths + toon lighting). Quality tiers per
 * render/quality.ts. Render side only.
 */
import * as THREE from 'three';
import { isoPosition } from './camera/IsoRig.js';
import { FOV, PITCH, frameDist, isPhoneLandscape, viewOffsetX, viewOffsetY } from './camera/frame';
import { cameraYaw } from './coords';
import { RENDER } from './ppk/core/config.js';
import { installToon } from './toon.js';
import { LOBBY_OUTLINE_CSS_PX, MATCH_OUTLINE_PX, setOutlineViewport, setOutlineWidth } from './chars/charMaterial';
import { tierSettings, type QualityTier, type TierSettings } from './quality';
import { isPhone } from './perf/device';
import { dynRes } from './perf/governor';
import { shellPlatform } from '../app/platform';

/**
 * Feel pass B1: the match camera's distance, pitch, FOV and the hero's screen spot come from camera/frame.ts (a fixed,
 * MLBB-style framing). `gr.zoom` is only the Camera height setting (0.88 Close to 1.4 Max, camera/height.ts CAMERA_HEIGHTS).
 */
export const isShortLandscape = isPhoneLandscape;

/**
 * Feel pass B1: place `camera` for the match view: the fixed framing for a `w` × `h` CSS px viewport (frameDist ×
 * `zoom`, the Camera height step), the fixed pitch and FOV, the camera `yaw`, and the view offset that puts `focus`
 * at HERO_AT on screen. Returns the distance. Pure (no renderer), so tests project with it.
 */
export function placeMatchCamera(camera: THREE.PerspectiveCamera, focus: { x: number; y: number; z: number }, yaw: number, w: number, h: number, zoom = 1): number {
  const d = frameDist(w, h) * zoom;
  const pos = { x: 0, y: 0, z: 0 };
  isoPosition(focus, yaw, PITCH, d, pos);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(focus.x, focus.y, focus.z);
  camera.fov = FOV;
  camera.aspect = w / Math.max(1, h);
  camera.setViewOffset(w, h, viewOffsetX(w), viewOffsetY(h), w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return d;
}

/**
 * Sun shadow box (m): the half-size follows the ground the camera sees (the farthest view corner from the box centre
 * plus a margin for tall casters), in 2 m steps so the projection only rebuilds when the zoom really moved. Clamped:
 * a bigger box spreads the same 1024² map over more ground, so past SHADOW_BOX.max the far corners lose shadows
 * rather than every shadow going soft.
 */
export const SHADOW_BOX = Object.freeze({ min: 22, max: 46, margin: 3, step: 2, maxWide: 54, wideZoom: 1.5 });
export function shadowHalfFor(farthest: number, max: number = SHADOW_BOX.max): number {
  const h = Math.ceil((farthest + SHADOW_BOX.margin) / SHADOW_BOX.step) * SHADOW_BOX.step;
  return Math.min(max, Math.max(SHADOW_BOX.min, Number.isFinite(h) ? h : max));
}
/**
 * MAP-GAPS A23: the shadow box's cap for a zoom and tier: past zoom 1.5 (desktop, zoomed far out) Medium and High
 * stretch it to SHADOW_BOX.maxWide so the far ground corners keep their shadows (High has a 2048² map for it).
 */
export function shadowMaxFor(zoom: number, tier: QualityTier): number {
  return zoom > SHADOW_BOX.wideZoom && tier !== 'low' ? SHADOW_BOX.maxWide : SHADOW_BOX.max;
}

/**
 * PERF-IOS §8 Track A: the live WebGLRenderer (the one the match draws with), so the overhead plates
 * (ui/overhead.ts, render/overlay/) draw over the scene in the same frame without a second canvas. Null before the
 * first renderer and after dispose.
 */
let live: THREE.WebGLRenderer | null = null;
export const liveRenderer = (): THREE.WebGLRenderer | null => live;

/**
 * PERF-IOS §8 Track A: the overdraw view (`?overdraw=1`, a debug view, not a setting). Every fragment that passes the
 * depth test adds 1/51 to red (opaque draws keep writing depth, blended ones do not, as in the real frame), so
 * red × 51 is how many times a pixel was shaded this frame. Every 20th
 * frame the buffer is read back and `html[data-overdraw]` holds { avg, p95, max, over3, over6 } (over3 / over6: the
 * share of pixels drawn more than 3 / 6 times), for docs/plans/moba/benchmarks and the VFX caps.
 */
export const OVERDRAW_STEP = 51;
export function overdrawOn(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try {
    return new URLSearchParams(search).get('overdraw') === '1';
  } catch {
    return false;
  }
}

/** Overdraw stats from an RGBA readback (red = count × 5). Pure. */
export function overdrawStats(px: Uint8Array): { avg: number; p95: number; max: number; over3: number; over6: number } {
  const hist = new Uint32Array(OVERDRAW_STEP + 1);
  let n = 0;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const c = Math.min(OVERDRAW_STEP, Math.round(px[i] / (255 / OVERDRAW_STEP)));
    hist[c]++;
    sum += c;
    n++;
  }
  let acc = 0;
  let p95 = 0;
  let max = 0;
  let over3 = 0;
  let over6 = 0;
  for (let c = 0; c <= OVERDRAW_STEP; c++) {
    if (hist[c] === 0) continue;
    max = c;
    acc += hist[c];
    if (acc < 0.95 * n) p95 = c + 1;
    if (c > 3) over3 += hist[c];
    if (c > 6) over6 += hist[c];
  }
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return { avg: r(n ? sum / n : 0), p95: Math.min(p95, max), max, over3: r(n ? over3 / n : 0), over6: r(n ? over6 / n : 0) };
}

function overdrawMaterial(blended: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: `#include <common>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>
void main() {
  #include <batching_vertex>
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}`,
    fragmentShader: `void main() { gl_FragColor = vec4(${(1 / OVERDRAW_STEP).toFixed(6)}, 0.0, 0.0, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: !blended,
    transparent: blended,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export interface GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Ground point the camera looks at (metres, three.js coordinates). */
  focus: THREE.Vector3;
  /** Camera height factor (render/camera/height.ts): the distance is frameDist(viewport) × zoom. */
  zoom: number;
  /** The camera's distance to the focus (m) at the last draw. */
  dist: number;
  /** The sun's shadow box half-size (m) at the last draw: it grows with the visible ground (shadowHalf). */
  shadowHalf: number;
  settings: TierSettings;
  /** Called after the camera is placed and before the draw (camera shake). */
  preRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** The scene to draw (the match scene by default; the lobby swaps its own in). */
  active: THREE.Scene;
  /** When set, places the camera itself instead of the iso rig (lobby turntable). */
  place: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** The tier with this device's profile (phone or not) and governor step 0. */
  setTier(tier: QualityTier): void;
  /** PERF-IOS: apply full settings (tier + phone profile + governor step, render/quality.ts tierSettings). */
  apply(settings: TierSettings): void;
  /** The canvas's CSS size, cached on resize (reading clientWidth/Height every frame forced layout). */
  readonly cssW: number;
  readonly cssH: number;
  resize(): void;
  render(): void;
  dispose(): void;
}

/**
 * `overlay: false` (the champion browser's skill clips): this renderer never becomes the live one the overhead plates
 * draw with. A preview that took the slot and then disposed left it null, so every match after a Heroes or Preview
 * visit drew no health bars at all.
 */
export function createRenderer(container: HTMLElement, tier: QualityTier, opts: { overlay?: boolean } = {}): GameRenderer {
  installToon();
  const settings0 = tierSettings(tier, { phone: isPhone() });
  // PERF-IOS P3-4: the Mac app stays on the integrated GPU of a dual-GPU Mac (no effect on an iPhone)
  const renderer = new THREE.WebGLRenderer({ antialias: settings0.antialias, powerPreference: shellPlatform() === 'mac' ? 'default' : 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);
  if (opts.overlay !== false) live = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(RENDER.background ?? '#F6E4C0');
  // v6 Lightning Rivalry light mood: a cream sky, a plum-tinted bounce (the logo plum family) instead of the green one,
  // and a sun a touch warm, so the shade side of every model leans plum like the brand's display shadow. Same
  // intensities: tints only, no new lights.
  const hemi = new THREE.HemisphereLight(0xfff3e3, 0x7b7792, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff8ee, 2.2);
  sun.position.set(-20, 40, 25);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -30;
  sc.right = 30;
  sc.top = 30;
  sc.bottom = -30;
  scene.add(sun, sun.target);
  // the view's ground corners (NDC → ground plane), reused every frame
  const ndc = [new THREE.Vector3(-1, 1, 0.5), new THREE.Vector3(1, 1, 0.5), new THREE.Vector3(1, -1, 0.5), new THREE.Vector3(-1, -1, 0.5)];
  const ray = new THREE.Vector3();
  const corners = ndc.map(() => new THREE.Vector3());
  const boxAt = new THREE.Vector3();
  /** Fit the sun's shadow box to the visible ground: centred on the view's ground quad, sized to its farthest corner. */
  const fitShadow = (): void => {
    let n = 0;
    boxAt.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      ray.copy(ndc[i]).unproject(camera).sub(camera.position);
      if (ray.y >= -1e-4) continue;
      const t = -camera.position.y / ray.y;
      corners[n].set(camera.position.x + ray.x * t, 0, camera.position.z + ray.z * t);
      boxAt.add(corners[n++]);
    }
    if (n < 4) boxAt.copy(focus);
    else boxAt.multiplyScalar(0.25);
    let far = 0;
    for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(corners[i].x - boxAt.x, corners[i].z - boxAt.z));
    const half = shadowHalfFor(n < 4 ? Infinity : far, shadowMaxFor(gr.zoom, gr.settings.tier));
    if (half !== gr.shadowHalf) {
      gr.shadowHalf = half;
      sc.left = sc.bottom = -half;
      sc.right = sc.top = half;
      sc.updateProjectionMatrix();
    }
    sun.target.position.copy(boxAt);
    sun.position.set(boxAt.x - 20, 40, boxAt.z + 25);
  };

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 300);
  const focus = new THREE.Vector3(10, 0, -30);
  let vw = 1;
  let vh = 1;
  // PERF-IOS P2-2: on a phone the shadow map is redrawn every `shadowEvery` frames (renderer.shadowMap.autoUpdate off)
  let shadowFrame = 0;
  const overdraw = overdrawOn() ? { opaque: overdrawMaterial(false), blended: overdrawMaterial(true), n: 0, px: new Uint8Array(0), swapped: new Map<THREE.Mesh, THREE.Material | THREE.Material[]>() } : null;
  /** Draw `scene` (the overdraw view instead when it is on). */
  const draw = (scene: THREE.Scene): void => {
    if (!overdraw) {
      renderer.render(scene, camera);
      return;
    }
    const bg = scene.background;
    scene.background = null;
    const sw = overdraw.swapped;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      const mat = m.material;
      const t = Array.isArray(mat) ? mat.some((x) => x.transparent) : mat.transparent;
      sw.set(m, mat);
      m.material = t ? overdraw.blended : overdraw.opaque;
    });
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, camera);
    for (const [m, mat] of sw) m.material = mat;
    sw.clear();
    scene.background = bg;
    if (overdraw.n++ % 20 !== 0) return;
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (overdraw.px.length !== w * h * 4) overdraw.px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, overdraw.px);
    document.documentElement.dataset.overdraw = JSON.stringify(overdrawStats(overdraw.px));
  };
  // PERF-IOS §8 Track A: the dynamic-resolution scale applied to the drawing buffer (phones; render/perf/governor.ts)
  let dynApplied = 1;
  const pixelRatio = (): number => {
    dynApplied = gr.settings.phone ? dynRes.scale : 1;
    return Math.max(0.75, Math.min(window.devicePixelRatio || 1, gr.settings.maxDpr) * gr.settings.resScale * dynApplied);
  };

  const gr: GameRenderer = {
    renderer,
    scene,
    camera,
    focus,
    zoom: 1,
    dist: 21,
    shadowHalf: 30,
    settings: settings0,
    preRender: null,
    active: scene,
    place: null,
    get cssW() {
      return vw;
    },
    get cssH() {
      return vh;
    },
    setTier(t) {
      gr.apply(tierSettings(t, { phone: isPhone() }));
    },
    apply(next) {
      gr.settings = next;
      // MAP-GAPS A23: the shadow map size per tier (a new size reallocates the map)
      if (sun.shadow.mapSize.x !== gr.settings.shadowMap) {
        sun.shadow.mapSize.set(gr.settings.shadowMap, gr.settings.shadowMap);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      // PERF-IOS: the tier's DPR cap × the governor's resolution steps × the continuous scale, never under 0.75
      renderer.setPixelRatio(pixelRatio());
      renderer.shadowMap.enabled = gr.settings.shadows;
      renderer.shadowMap.autoUpdate = gr.settings.shadowEvery <= 1;
      renderer.shadowMap.needsUpdate = true;
      shadowFrame = 0;
      sun.castShadow = gr.settings.shadows;
      gr.resize();
    },
    resize() {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      vw = w;
      vh = h;
    },
    render() {
      if (gr.settings.phone && dynRes.scale !== dynApplied) {
        renderer.setPixelRatio(pixelRatio());
        gr.resize();
      }
      setOutlineViewport(renderer.domElement.width, renderer.domElement.height);
      // the lobby turntable (Home, pick, results) gets the key art's thick ink line; a match keeps its thin hull
      setOutlineWidth(gr.place ? LOBBY_OUTLINE_CSS_PX * renderer.getPixelRatio() : MATCH_OUTLINE_PX);
      if (gr.place) {
        camera.clearViewOffset();
        gr.place(camera);
        camera.updateProjectionMatrix();
        if (!renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = true;
        draw(gr.active);
        return;
      }
      // feel pass B1: a fixed framing: the distance fits the viewport (frameDist × the Camera height step), the pitch
      // and FOV never change, and the view offset puts the focus (the hero) at HERO_AT on screen
      gr.dist = placeMatchCamera(camera, focus, cameraYaw(), vw, vh, gr.zoom);
      if (gr.settings.shadows) fitShadow();
      else {
        sun.target.position.copy(focus);
        sun.position.set(focus.x - 20, 40, focus.z + 25);
      }
      gr.preRender?.(camera);
      if (gr.settings.shadows && !renderer.shadowMap.autoUpdate) {
        if (shadowFrame++ % gr.settings.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
      }
      draw(gr.active);
    },
    dispose() {
      if (live === renderer) live = null;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  gr.setTier(tier);
  return gr;
}
