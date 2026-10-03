/**
 * Night ambience in the world (plan G7 "Light and presence"): point lights at emissive tiles,
 * seeded fireflies (40 / 20 / 8 by tier) and a pre-rendered vignette. No global grade.
 *
 * Reduced motion keeps the fireflies where they are and the lights steady.
 *
 * Only type imports from Phaser.
 */
import { createRng } from "./rng";
import { ensureFirefly, ensureVignette } from "./textures";
import type { RenderTier } from "./tier";

const BLEND_ADD = 1;

export const FIREFLY_COUNT: Record<RenderTier, number> = { HIGH: 40, MID: 20, LOW: 8 };
/** Point lights per scene; the renderer culls the ones off camera. */
export const LIGHT_CAP: Record<RenderTier, number> = { HIGH: 64, MID: 32, LOW: 12 };

/** Depths: above the decoration layer (10) and the cats (4), below in-world UI text. */
export const LIGHT_DEPTH = 11;
export const FIREFLY_DEPTH = 12;
export const VIGNETTE_DEPTH = 900;

type LayerLike = Pick<Phaser.Tilemaps.TilemapLayer, "forEachTile">;

/** World centres of the tiles whose index is emissive, in layer order, at most `cap`. */
export function emissiveSpots(layers: readonly (LayerLike | null | undefined)[], emissive: readonly number[], cap: number) {
  const wanted = new Set(emissive);
  const spots: { x: number; y: number }[] = [];
  layers.forEach((layer) => {
    layer?.forEachTile((tile) => {
      if (spots.length >= cap || !wanted.has(tile.index)) return;
      spots.push({ x: tile.getCenterX(), y: tile.getTop() + 6 });
    });
  });
  return spots;
}

export function addLights(
  scene: Phaser.Scene,
  spots: readonly { x: number; y: number }[],
  color: number,
  reducedMotion: boolean,
): Phaser.GameObjects.PointLight[] {
  const factory = scene.add as unknown as { pointlight?: Phaser.GameObjects.GameObjectFactory["pointlight"] };
  if (typeof factory.pointlight !== "function" || !scene.sys.game.renderer || !("gl" in scene.sys.game.renderer)) return [];
  return spots.map((spot, i) => {
    const light = scene.add.pointlight(spot.x, spot.y, color, 44, 0.09, 0.08).setDepth(LIGHT_DEPTH);
    if (!reducedMotion) {
      scene.tweens.add({
        targets: light,
        intensity: { from: 0.07, to: 0.11 },
        duration: 900 + ((i * 137) % 500),
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }
    return light;
  });
}

export interface Fireflies {
  readonly count: number;
  destroy(): void;
}

/**
 * Motes that drift over the visible world. Each has a seeded place in the view (u, v), a sway
 * and a pulse; they wrap around the view with a slight parallax, so the view is never empty.
 */
export function addFireflies(
  scene: Phaser.Scene,
  options: { tier: RenderTier; colors: [number, number]; seed: string; reducedMotion: boolean },
): Fireflies {
  const rng = createRng(`${options.seed}:fireflies`);
  const key = ensureFirefly(scene);
  const motes = Array.from({ length: FIREFLY_COUNT[options.tier] }, (_, i) => ({
    u: rng.next(),
    v: rng.float(0.06, 0.55),
    sway: rng.float(6, 18),
    period: rng.float(2600, 5200),
    phase: rng.float(0, Math.PI * 2),
    image: scene.add
      .image(0, 0, key)
      .setDepth(FIREFLY_DEPTH)
      .setBlendMode(BLEND_ADD)
      .setTint(options.colors[i % 2]),
  }));
  let start = -1;

  const place = (time: number) => {
    const view = scene.cameras.main.worldView;
    if (!view.width || !view.height) return;
    if (start < 0) start = time;
    const t = options.reducedMotion ? 0 : time - start;
    motes.forEach((mote) => {
      const w = (t / mote.period) * Math.PI * 2 + mote.phase;
      const drift = options.reducedMotion ? 0 : view.x * -0.15;
      const raw = mote.u * view.width + drift + Math.sin(w) * mote.sway;
      const x = view.x + (((raw % view.width) + view.width) % view.width);
      const y = view.y + mote.v * view.height + Math.cos(w * 0.7) * mote.sway * 0.6;
      mote.image.setPosition(Math.round(x), Math.round(y));
      mote.image.setAlpha(options.reducedMotion ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(w * 1.7)));
    });
  };
  const onRender = () => place(scene.time.now);
  scene.events.on("prerender", onRender);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off("prerender", onRender);
    motes.forEach((mote) => mote.image.destroy());
  };
  scene.events.once("shutdown", destroy);
  return { count: motes.length, destroy };
}

/** The vignette, stretched over the camera view every frame (screen-fixed, follows resizes). */
export function addVignette(scene: Phaser.Scene): { destroy(): void } {
  const image = scene.add.image(0, 0, ensureVignette(scene)).setScrollFactor(0).setDepth(VIGNETTE_DEPTH);
  const fit = () => {
    const camera = scene.cameras.main;
    image.setPosition(camera.width / 2, camera.height / 2);
    image.setDisplaySize(camera.width / camera.zoom + 2, camera.height / camera.zoom + 2);
  };
  fit();
  scene.events.on("prerender", fit);
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off("prerender", fit);
    image.destroy();
  };
  scene.events.once("shutdown", destroy);
  return { destroy };
}
