/**
 * Small textures the look runtime draws once per game (plan G7 "Light and presence"): the halo
 * and contact shadow under each cat, the firefly mote and the pre-rendered vignette. Drawn on
 * canvas textures, so there is no file to load and no render-target filter at run time.
 *
 * Only type imports from Phaser.
 */

export const HALO_KEY = "look-halo";
export const SHADOW_KEY = "look-shadow";
export const FIREFLY_KEY = "look-firefly";
export const VIGNETTE_KEY = "look-vignette";

type Gradient = Pick<CanvasGradient, "addColorStop">;

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  linear = true,
): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return "__WHITE";
  draw(texture.getContext());
  texture.refresh();
  // Gradients are not pixel art: LINEAR (Phaser.Textures.FilterMode.LINEAR = 0) under pixelArt.
  if (linear) texture.setFilter(0);
  return key;
}

const stops = (gradient: Gradient, list: Array<[number, string]>) =>
  list.forEach(([at, color]) => gradient.addColorStop(at, color));

/** White radial glow, tinted per cat; drawn additively. */
export function ensureHalo(scene: Phaser.Scene): string {
  return canvasTexture(scene, HALO_KEY, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops(g, [
      [0, "rgba(255,255,255,0.55)"],
      [0.45, "rgba(255,255,255,0.22)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** A soft dark ellipse at the cat's feet. */
export function ensureShadow(scene: Phaser.Scene): string {
  return canvasTexture(scene, SHADOW_KEY, 32, 8, (ctx) => {
    ctx.save();
    ctx.scale(1, 0.25);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    stops(g, [
      [0, "rgba(7,5,26,0.85)"],
      [0.7, "rgba(7,5,26,0.5)"],
      [1, "rgba(7,5,26,0)"],
    ]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    ctx.restore();
  });
}

/** A 3 x 3 mote: a bright pixel core with a dim cross (one art pixel of glow each side). */
export function ensureFirefly(scene: Phaser.Scene): string {
  return canvasTexture(scene, FIREFLY_KEY, 3, 3, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(1, 0, 1, 3);
    ctx.fillRect(0, 1, 3, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1, 1, 1, 1);
  }, false);
}

/** Night-950 at the corners, clear in the middle; stretched over the view. */
export function ensureVignette(scene: Phaser.Scene): string {
  return canvasTexture(scene, VIGNETTE_KEY, 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 70, 128, 128, 182);
    stops(g, [
      [0, "rgba(7,5,26,0)"],
      [0.6, "rgba(7,5,26,0.18)"],
      [1, "rgba(7,5,26,0.55)"],
    ]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}
