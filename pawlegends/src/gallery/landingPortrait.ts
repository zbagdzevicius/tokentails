/**
 * DEV ONLY: the landing roster portrait (client/public/pawlegends/landing/portrait-<hero>.<hash>.webp, 420 × 574,
 * transparent). `npm run dev` → /landing-portrait.html?hero=nugget; tools/landing-portraits.mjs captures every hero
 * it is given (`coat=` dresses it). The hero in its idle pose, a little turned, on a pale pink disc, lit like the lobby turntable.
 * Never part of `build` / `build:client` (vite builds index.html only).
 */
import * as THREE from 'three';
import { HERO_IDS } from '../data/heroes';
import type { HeroId } from '../data/heroes/types';
import { lobbyHero } from '../render/views/heroView';

const W = 420;
const H = 574;
const q = new URLSearchParams(location.search);
const hero = (HERO_IDS.includes(q.get('hero') as HeroId) ? q.get('hero') : 'brutus') as HeroId;
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const turn = num('turn', 0.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
(document.getElementById('app') as HTMLElement).appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a3f6e, 1.9));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(4, 8, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff9fc0, 1.5);
rim.position.set(-5, 4, -6);
scene.add(rim);

// the pale pink disc the cat and dog portraits stand on (white centre, pink rim, fading out)
function discTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, 'rgba(255,246,248,0.95)');
  grad.addColorStop(0.62, 'rgba(255,228,236,0.9)');
  grad.addColorStop(0.86, 'rgba(250,170,196,0.9)');
  grad.addColorStop(0.93, 'rgba(236,98,140,0.85)');
  grad.addColorStop(1, 'rgba(236,98,140,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false }));
disc.rotation.x = -Math.PI / 2;
disc.position.y = 0.005;
scene.add(disc);

// `coat=<coat item id>`: the hero in that coat (gaps2 coats-models: the Epic and Legendary coat parts)
const coat = q.get('coat');
const h = lobbyHero(hero, 0, coat ? { coat, chroma: null } : null, { outline: true });
h.object.rotation.y = -Math.PI * 0.5 + turn;
scene.add(h.object);
h.object.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(h.ch.mesh);
const top = box.max.y;
const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
disc.scale.setScalar(Math.max(1.6, wide * 1.05) * num('disc', 0.85));

const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
// frame the drawn body: its top near the top edge, the feet a little above the bottom edge
const mid = top * 0.5;
const half = top * num('half', 0.68);
const dist = half / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
cam.position.set(0, mid + dist * num('elev', 0.22), dist);
cam.lookAt(0, mid * num('look', 0.9), 0);
renderer.render(scene, cam);

(window as unknown as { __portrait: { ready: boolean; png: () => string } }).__portrait = {
  ready: true,
  png: () => renderer.domElement.toDataURL('image/png'),
};
