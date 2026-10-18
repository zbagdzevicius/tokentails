/**
 * three.js renderer, lights and the iso camera (lifted PPK IsoRig maths + toon lighting). Quality tiers per
 * render/quality.ts. Render side only.
 */
import * as THREE from 'three';
import { isoPitch, isoPosition } from './camera/IsoRig.js';
import { CAMERA_YAW } from './coords';
import { RENDER } from './ppk/core/config.js';
import { installToon } from './toon.js';
import { setOutlineViewport } from './chars/charMaterial';
import { tierSettings, type QualityTier, type TierSettings } from './quality';

/** Camera distance (m) at zoom 1. */
export const MOBA_DIST = 27;
/**
 * Camera distance factor on short landscape screens (phones, ≤ 480 CSS px tall): 0.87 in round 0 (~15% closer);
 * round 1 ("units are small, I couldn't tell Cacklejaw from my own Clem") moved it to 0.75, ~16% closer again.
 */
export const SHORT_LANDSCAPE_ZOOM = 0.75;
export const isShortLandscape = (w: number, h: number): boolean => h <= 480 && w / Math.max(1, h) >= 1.6;

/** Radians below IsoRig's pitch: a MOBA reads better a little more side-on (heroes, not hats). */
export const MOBA_PITCH_DROP = 0.16;

export interface GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Ground point the camera looks at (metres, three.js coordinates). */
  focus: THREE.Vector3;
  /** Zoom factor for IsoRig (clamped by CAMERA.iso.zoom). */
  zoom: number;
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

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 300);
  const focus = new THREE.Vector3(10, 0, -30);
  const pos = { x: 0, y: 0, z: 0 };
  let near = 1;

  const gr: GameRenderer = {
    renderer,
    scene,
    camera,
    focus,
    zoom: 1,
    settings: settings0,
    preRender: null,
    active: scene,
    place: null,
    setTier(t) {
      gr.settings = tierSettings(t);
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
      near = isShortLandscape(w, h) ? SHORT_LANDSCAPE_ZOOM : 1;
    },
    render() {
      setOutlineViewport(renderer.domElement.width, renderer.domElement.height);
      // PPK frames one knight at 9–18 m; a MOBA needs the lane in view, so the distance is MOBA_DIST × zoom and the
      // pitch follows IsoRig's distance curve (58° at the far end).
      if (gr.place) {
        gr.place(camera);
        camera.updateProjectionMatrix();
        renderer.render(gr.active, camera);
        return;
      }
      const d = MOBA_DIST * gr.zoom * near;
      isoPosition(focus, CAMERA_YAW, Math.max(0.8, isoPitch(d) - MOBA_PITCH_DROP), d, pos);
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(focus);
      camera.updateProjectionMatrix();
      sun.target.position.copy(focus);
      sun.position.set(focus.x - 20, 40, focus.z + 25);
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
