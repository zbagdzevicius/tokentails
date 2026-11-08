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
import { setOutlineViewport } from './chars/charMaterial';
import { tierSettings, type QualityTier, type TierSettings } from './quality';

/**
 * Feel pass B1: the match camera's distance, pitch, FOV and the hero's screen spot come from camera/frame.ts (a fixed,
 * MLBB-style framing). `gr.zoom` is only the Camera height setting (1 Normal, 1.12 High, camera/height.ts).
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
  setTier(tier: QualityTier): void;
  resize(): void;
  render(): void;
  dispose(): void;
}

export function createRenderer(container: HTMLElement, tier: QualityTier): GameRenderer {
  installToon();
  const settings0 = tierSettings(tier);
  const renderer = new THREE.WebGLRenderer({ antialias: settings0.antialias, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(RENDER.background ?? '#F6E4C0');
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x7a8f6a, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
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
    setTier(t) {
      gr.settings = tierSettings(t);
      // MAP-GAPS A23: the shadow map size per tier (a new size reallocates the map)
      if (sun.shadow.mapSize.x !== gr.settings.shadowMap) {
        sun.shadow.mapSize.set(gr.settings.shadowMap, gr.settings.shadowMap);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gr.settings.maxDpr));
      renderer.shadowMap.enabled = gr.settings.shadows;
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
      setOutlineViewport(renderer.domElement.width, renderer.domElement.height);
      if (gr.place) {
        camera.clearViewOffset();
        gr.place(camera);
        camera.updateProjectionMatrix();
        renderer.render(gr.active, camera);
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
      renderer.render(gr.active, camera);
    },
    dispose() {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  gr.setTier(tier);
  return gr;
}
