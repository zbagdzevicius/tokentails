/**
 * Hero portraits for the pick cards and the HUD (POC.md §6.9 runtime models): each hero rendered once, head and
 * shoulders, by the game's own renderer into a small offscreen target, and kept as a data URL. No asset files, no
 * extra canvas or context. Render side only.
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import type { GameRenderer } from './renderer';
import { lobbyHero } from './views/heroView';

const SIZE = 128;
const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];
const cache = new Map<HeroId, string>();

/** The portrait of `hero` (a PNG data URL), or null before `bakePortraits` ran or where WebGL read-back failed. */
export const portraitUrl = (hero: HeroId): string | null => cache.get(hero) ?? null;

/** Render every hero's portrait once. Safe to call again (no-op); never throws. */
export function bakePortraits(gr: GameRenderer): void {
  if (cache.size === HEROES.length || typeof document === 'undefined') return;
  const r = gr.renderer;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a3f6e, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9fc0, 1.4);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const prevTarget = r.getRenderTarget();
  const prevClear = r.getClearAlpha();
  try {
    for (const hero of HEROES) {
      const h = lobbyHero(hero, 0, null);
      // Facing the camera, a little turned; frame the top half of the model (head and shoulders).
      h.mesh.rotation.y = -Math.PI * 0.5 + 0.45;
      scene.add(h.mesh);
      h.mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(h.mesh);
      const top = box.max.y;
      const height = Math.max(0.5, top - box.min.y);
      const look = new THREE.Vector3(0, top - height * 0.27, 0);
      const dist = (height * 0.34) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(look.x + dist * 0.2, look.y + height * 0.04, dist);
      cam.lookAt(look);
      r.setRenderTarget(target);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
      scene.remove(h.mesh);
      h.dispose();
      if (!ctx) continue;
      const img = ctx.createImageData(SIZE, SIZE);
      // WebGL rows run bottom-up.
      for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      ctx.putImageData(img, 0, 0);
      cache.set(hero, canvas.toDataURL('image/png'));
    }
  } catch {
    // No read-back (a lost context): the letter placeholders stay.
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevClear);
    target.dispose();
  }
}
