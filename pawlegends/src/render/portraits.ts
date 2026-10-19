/**
 * Hero portraits for the pick cards, the HUD and the store cards (POC.md §6.9 runtime models): each hero (and each
 * look that needs one: the store SKUs, the player's equipped look) rendered once, head and shoulders, by the game's
 * own renderer into a small offscreen target, and kept as a data URL. No asset files, no extra canvas or context.
 * Render side only.
 */
import * as THREE from 'three';
import type { HeroId } from '../sim/api';
import { HERO_IDS } from '../data/heroes';
import { lookKey, type Look } from './cosmetics';
import type { GameRenderer } from './renderer';
import { lobbyHero } from './views/heroView';

const SIZE = 128;
const HEROES: readonly HeroId[] = HERO_IDS;
const cache = new Map<string, string>();
const keyOf = (hero: HeroId, look: Look | null | undefined): string => `${hero}|${lookKey(look)}`;

/** What each store SKU's card shows (its headline look on Clem). */
export const SKU_LOOK: Readonly<Record<'pl_starter' | 'pl_founder' | 'pl_founder_legend' | 'pl_founder_legend_upgrade', Look>> = Object.freeze({
  pl_starter: { coat: 'skin.clem.pink_bow', chroma: null },
  pl_founder: { coat: 'coat.founder.clem', chroma: null },
  pl_founder_legend: { coat: 'skin.clem.dawnblade', chroma: null },
  pl_founder_legend_upgrade: { coat: 'skin.clem.dawnblade', chroma: null },
});

/**
 * The portrait of `hero` in `look` (a PNG data URL); falls back to the default look, and is null before
 * `bakePortraits` ran or where WebGL read-back failed.
 */
export const portraitUrl = (hero: HeroId, look?: Look | null): string | null => cache.get(keyOf(hero, look)) ?? cache.get(keyOf(hero, null)) ?? null;

/** Render one hero portrait in a look (no-op when cached). Never throws. */
export function bakePortrait(gr: GameRenderer, hero: HeroId, look: Look | null): void {
  if (cache.has(keyOf(hero, look))) return;
  bake(gr, [[hero, look]]);
}

/** Render every hero's default portrait and the store looks once. Safe to call again (no-op); never throws. */
export function bakePortraits(gr: GameRenderer): void {
  const jobs: [HeroId, Look | null][] = [...HEROES.map((h) => [h, null] as [HeroId, Look | null]), ...Object.values(SKU_LOOK).map((l) => ['clem', l] as [HeroId, Look | null])];
  bake(
    gr,
    jobs.filter(([h, l]) => !cache.has(keyOf(h, l))),
  );
}

function bake(gr: GameRenderer, jobs: readonly [HeroId, Look | null][]): void {
  if (!jobs.length || typeof document === 'undefined') return;
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
    for (const [hero, look] of jobs) {
      const h = lobbyHero(hero, 0, look, { outline: false });
      // Facing the camera, a little turned; frame the head (upright chibi: the head is the top ~45% of the height).
      h.object.rotation.y = -Math.PI * 0.5 + 0.45;
      scene.add(h.object);
      h.object.updateMatrixWorld(true);
      const head = new THREE.Vector3().setFromMatrixPosition(h.ch.rig.bone('head').matrixWorld);
      const height = h.ch.height;
      // the head bone sits at the neck; the face centre is ~0.17 H above it
      const face = new THREE.Vector3(head.x, head.y + height * 0.17, head.z);
      const dist = (height * 0.36) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(face.x + dist * 0.18, face.y + height * 0.06, dist);
      cam.lookAt(face);
      r.setRenderTarget(target);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
      scene.remove(h.object);
      h.dispose();
      if (!ctx) continue;
      const img = ctx.createImageData(SIZE, SIZE);
      // WebGL rows run bottom-up.
      for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      ctx.putImageData(img, 0, 0);
      cache.set(keyOf(hero, look), canvas.toDataURL('image/png'));
    }
  } catch {
    // No read-back (a lost context): the letter placeholders stay.
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevClear);
    target.dispose();
  }
}
