// Renderer, scene, camera, lights and quality tiers. FROZEN. Themes (world-art) recolour the sky, fog and lights.
import * as THREE from 'three';
import { events } from './events';
import type { Quality, QualityMode } from './types';

export const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0xbfe6ff, 120, 480);
export const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1500);

export const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a4a, 1.3);
scene.add(hemi);
/** core keeps the sun (and its shadow box) centred on the player; themes set colour, intensity and sunDir */
export const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
/** direction the light comes FROM (normalised by core) */
export const sunDir = new THREE.Vector3(0.45, 0.8, -0.35);
sun.shadow.mapSize.setScalar(2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let mode: QualityMode = 'auto';
let quality: Quality = isTouch ? 'low' : 'high';
function applyQuality(): void {
  const high = quality === 'high';
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = high;
  sun.castShadow = high;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
  });
}
applyQuality();

/** 'auto' = start from the device default (phones LOW) and downgrade once if the frame rate stays under 45. */
export function setQualityMode(m: QualityMode): void {
  mode = m;
  const q: Quality = m === 'auto' ? (isTouch ? 'low' : 'high') : m;
  setQuality(q);
}
export const getQualityMode = () => mode;
export const getQuality = () => quality;
/** low: no shadows, pixel ratio 1, lanes thin out scenery. high: the full look. Emits qualityChange. */
export function setQuality(q: Quality): void {
  if (q === quality) return;
  quality = q;
  applyQuality();
  events.emit('qualityChange', { quality: q });
}

// ---- auto downgrade (called by the loop every rendered frame while playing) ----
let acc = 0;
let frames = 0;
let slowWindows = 0;
export function sampleFps(dt: number): void {
  if (mode !== 'auto' || quality === 'low') return;
  acc += dt;
  frames++;
  if (acc < 2) return;
  const fps = frames / acc;
  acc = 0;
  frames = 0;
  slowWindows = fps < 45 ? slowWindows + 1 : 0;
  if (slowWindows >= 2) {
    slowWindows = 0;
    setQuality('low');
  }
}
export function resetFpsSampler(): void {
  acc = 0;
  frames = 0;
  slowWindows = 0;
}
