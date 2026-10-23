// Renderer, scene, camera and lights. FROZEN. world/theme.ts recolours the lights and sky per city.
import * as THREE from 'three';

export const isTouch = matchMedia('(pointer: coarse)').matches;
export const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
const SKY = 0xc9ccd1;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 180, 760);
export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 2000);

export const hemi = new THREE.HemisphereLight(0xe8eef5, 0x6b6258, 1.4);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 10, far: 600 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let quality: 'low' | 'high' = 'high';
/** low: no shadows, pixel ratio 1. high: the default look. */
export function setQuality(q: 'low' | 'high'): void {
  if (q === quality) return;
  quality = q;
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q === 'high';
  sun.castShadow = q === 'high';
  // materials must recompile for the shadow change
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
  });
}
export const getQuality = () => quality;
