/**
 * Presence under every cat (plan G7 "Light and presence"): a contact shadow at the feet and a
 * soft halo behind the body, both plain sprites (no render-target filter, so MID pays two quads
 * per cat), plus a Glow filter on the player cat on HIGH only.
 *
 * The pair follows its cat on the scene's `prerender` (after physics moved it) and is destroyed
 * with it. The shadow fades while the cat is airborne.
 *
 * Only type imports from Phaser.
 */
import { ensureHalo, ensureShadow } from "./textures";
import type { RenderTier } from "./tier";

/** `Phaser.BlendModes.ADD`. */
const BLEND_ADD = 1;

export interface PresenceOptions {
  /** Halo colour (0xrrggbb). */
  color: number;
  tier: RenderTier;
  /** The player's cat: brighter halo, and Glow on HIGH. */
  player?: boolean;
}

export interface Presence {
  readonly halo: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly glow: boolean;
  destroy(): void;
}

type CatSprite = Phaser.GameObjects.Sprite & { body?: Phaser.Physics.Arcade.Body | null };

export function attachPresence(scene: Phaser.Scene, sprite: CatSprite, options: PresenceOptions): Presence {
  const depth = sprite.depth;
  const shadow = scene.add.image(sprite.x, sprite.y, ensureShadow(scene)).setDepth(depth - 0.2).setAlpha(0.55);
  const halo = scene.add
    .image(sprite.x, sprite.y, ensureHalo(scene))
    .setDepth(depth - 0.1)
    .setTint(options.color)
    .setBlendMode(BLEND_ADD)
    .setAlpha(options.player ? 0.55 : 0.35)
    .setScale(options.player ? 1.05 : 0.85);

  let glow = false;
  if (options.player && options.tier === "HIGH") {
    try {
      const target = sprite as unknown as {
        enableFilters?: () => { filters?: { internal?: { addGlow?: (...args: unknown[]) => unknown } } };
      };
      const filtered = target.enableFilters?.();
      if (filtered?.filters?.internal?.addGlow) {
        filtered.filters.internal.addGlow(options.color, 2, 0, 1, false, 6, 4);
        glow = true;
      }
    } catch {
      glow = false;
    }
  }

  const follow = () => {
    if (!sprite.active) return;
    const body = sprite.body;
    const feet = body ? body.bottom : sprite.y + sprite.displayHeight / 2;
    const airborne = !!body && !body.blocked.down && !body.touching.down;
    shadow.setPosition(Math.round(body ? body.center.x : sprite.x), Math.round(feet - 1));
    shadow.setAlpha(airborne ? 0.2 : 0.55);
    shadow.setVisible(sprite.visible);
    halo.setPosition(Math.round(sprite.x), Math.round(body ? body.center.y : sprite.y));
    halo.setVisible(sprite.visible);
    shadow.setDepth(sprite.depth - 0.2);
    halo.setDepth(sprite.depth - 0.1);
  };
  follow();

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off("prerender", follow);
    sprite.off?.("destroy", destroy);
    halo.destroy();
    shadow.destroy();
  };
  scene.events.on("prerender", follow);
  sprite.once("destroy", destroy);
  scene.events.once("shutdown", destroy);
  return { halo, shadow, glow, destroy };
}
