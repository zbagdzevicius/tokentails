/**
 * The night backdrop: a scene under the gameplay scene with its own camera (plan G7 "Parallax
 * plates on a backdrop camera").
 *
 * The backdrop scene draws, in screen space:
 *   sky   discrete bands of the preset's ramp, stars and (moonlit presets) a crescent moon;
 *   far, mid, near, fog  horizontally tiling plates at native art resolution, each scaled by the
 *         world camera's integer zoom so an art pixel of a plate is the size of a tile's; a
 *         plate scrolls with the world camera at its parallax factor and sits on the map's
 *         dominant ground line, and a strip of its own colour fills below it.
 * Plates come from the look manifest (task 6d) when the preset lists them and they loaded, else
 * from look/procedural.ts.
 *
 * It is a separate scene so its display list never mixes with gameplay (nothing to ignore, no
 * render target, one draw per plate). It is added with a unique key, sent to the back, follows
 * the gameplay scene's main camera every frame, and is removed when that scene shuts down.
 * Reduced motion freezes the horizontal parallax at the first frame; the vertical placement
 * keeps following the camera 1:1, so the plates stay on the ground line.
 *
 * A manifest plate whose alpha has a straight crop edge inside it (look/plateCheck.ts) would
 * show as a hard-edged block mid-screen: that layer is drawn procedurally instead (`rejected`).
 * A preset may tint the manifest plates (`plateTint`) and add a warm horizon glow behind the mid
 * plates (`horizonGlow`, the Shelter's dusk, #49); both stay inside the backdrop scene.
 *
 * Only type imports from Phaser: the scene is created from a plain config object.
 */
import type { LookPreset } from "./presets";
import { hexToInt } from "./presets";
import type { PlateLayer, PlateLayerSpec, PlateSet } from "./manifest";
import { imageHasStraightCrop } from "./plateCheck";
import { horizonFor } from "./worldBounds";
import { drawPlate, PLATE_HEIGHTS, PLATE_WIDTH, skyBands, starField, type ProceduralLayer } from "./procedural";

/** Horizontal and vertical parallax factors per plate (1 = moves with the world). */
export const PARALLAX: Record<PlateLayer, { x: number; y: number }> = {
  far: { x: 0.12, y: 0.25 },
  mid: { x: 0.25, y: 0.45 },
  fog: { x: 0.35, y: 0.5 },
  near: { x: 0.5, y: 0.65 },
};

/** Draw order, back to front. */
const ORDER: PlateLayer[] = ["far", "mid", "fog", "near"];

/** How far below the ground line a plate's bottom sits, in art px (hidden behind the tiles). */
const SINK = 6;

/** Texture key of a plate loaded from the manifest (lookLoader queues it). */
export const plateTextureKey = (preset: string, layer: PlateLayer) => `look-plate-${preset}-${layer}`;
const proceduralKey = (preset: string, layer: PlateLayer) => `look-plate-proc-${preset}-${layer}`;

export interface BackdropOptions {
  preset: LookPreset;
  /** The manifest's plate set for this scene (its files were queued in preload) and its name. */
  plates?: PlateSet | null;
  plateSet: string;
  /**
   * World y of the map's main floors, top to bottom (worldBounds.majorSurfaces). The horizon is
   * the floor under the view's centre (Home has an upper floor and the ground); empty puts it a
   * quarter view below the centre.
   */
  horizons: number[];
  reducedMotion: boolean;
  seed: string;
}

export interface Backdrop {
  readonly key: string;
  /** Plate layers drawn from manifest files (the rest are procedural). */
  readonly fromManifest: PlateLayer[];
  /** Manifest layers skipped for a straight crop edge (drawn procedurally). */
  readonly rejected: PlateLayer[];
  destroy(): void;
}

let counter = 0;

type TileSpriteLike = Phaser.GameObjects.TileSprite;

/** A `PLATE_WIDTH x height` canvas texture with the procedural plate, created once per preset. */
function ensureProceduralPlate(scene: Phaser.Scene, preset: LookPreset, layer: ProceduralLayer, seed: string): string {
  const key = proceduralKey(preset.name, layer);
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, PLATE_WIDTH, PLATE_HEIGHTS[layer]);
  if (!texture) return "__WHITE";
  const ctx = texture.getContext();
  drawPlate(ctx, layer, preset, seed);
  texture.refresh();
  return key;
}

export function installBackdrop(target: Phaser.Scene, options: BackdropOptions): Backdrop {
  counter += 1;
  const key = `LookBackdrop-${target.sys.settings.key}-${counter}`;
  const { preset, seed } = options;
  const fromManifest: PlateLayer[] = [];
  const rejected: PlateLayer[] = [];
  let removed = false;

  /** The manifest layer when its file loaded, else null (procedural). */
  const manifestLayer = (scene: Phaser.Scene, layer: PlateLayer): PlateLayerSpec | null => {
    const spec = options.plates?.layers.find((entry) => entry.name === layer);
    const key = plateTextureKey(options.plateSet, layer);
    if (!spec || !scene.textures.exists(key)) return null;
    if (imageHasStraightCrop(scene.textures.get(key).getSourceImage() as HTMLImageElement)) {
      if (!rejected.includes(layer)) rejected.push(layer);
      return null;
    }
    if (!fromManifest.includes(layer)) fromManifest.push(layer);
    return spec;
  };

  const bands = skyBands(preset);
  const stars = starField(preset, seed);

  target.scene.add(
    key,
    {
      key,
      create(this: Phaser.Scene) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the Scene Phaser built from this config
        const self = this;
        const sky = self.add.graphics();
        let glow: Phaser.GameObjects.Image | null = null;
        const plates = ORDER.map((layer) => {
          if (layer === "mid" && preset.horizonGlow) glow = self.add.image(0, 0, ensureGlow(self, preset)).setOrigin(0, 0);
          const spec = manifestLayer(self, layer);
          const texture = spec ? plateTextureKey(options.plateSet, layer) : ensureProceduralPlate(self, preset, layer, seed);
          const fill = self.add.rectangle(0, 0, 1, 1, hexToInt(layerColor(preset, layer))).setOrigin(0, 0);
          // Manifest plates are full-height compositions (opaque far sky): no fill strip.
          fill.setVisible(!spec && layer !== "fog");
          const source = self.textures.get(texture).getSourceImage() as { width?: number; height?: number };
          const sprite = self.add.tileSprite(0, 0, source.width || PLATE_WIDTH, source.height || PLATE_HEIGHTS[layer], texture);
          sprite.setOrigin(0, spec ? 0 : 1);
          if (spec && preset.plateTint && layer !== "fog") sprite.setTint(hexToInt(preset.plateTint));
          return { layer, spec, sprite: sprite as TileSpriteLike, fill, height: sprite.height };
        });
        self.cameras.main.setRoundPixels(true);

        let lastW = -1;
        let lastH = -1;
        let lastK = -1;
        let frozenX: number | null = null;

        const drawSky = (W: number, H: number, k: number, horizon: number) => {
          sky.clear();
          const bandH = Math.max(k, Math.ceil(Math.max(1, horizon) / bands.length / k) * k);
          bands.forEach((color, i) => {
            sky.fillStyle(hexToInt(color), 1);
            const y = i * bandH;
            const h = i === bands.length - 1 ? Math.max(bandH, H - y) : bandH;
            sky.fillRect(0, y, W, h);
          });
          stars.forEach((star) => {
            sky.fillStyle(0xfcecbb, star.alpha);
            const s = star.size * Math.max(1, Math.floor(k / 2));
            sky.fillRect(Math.round(star.u * W), Math.round(star.v * horizon), s, s);
          });
          if (preset.moon) {
            const r = 9 * k;
            const cx = Math.round(W * 0.78);
            const cy = Math.round(Math.min(horizon * 0.3, H * 0.22));
            // Halo, disc, then the shadow that makes the crescent; drawn in k-sized rows.
            sky.fillStyle(0xf0c5fd, 0.08);
            sky.fillCircle(cx, cy, r * 2.2);
            sky.fillStyle(0xfcecbb, 1);
            for (let dy = -r; dy <= r; dy += k) {
              const half = Math.floor(Math.sqrt(r * r - dy * dy) / k) * k;
              sky.fillRect(cx - half, cy + dy, half * 2, k);
            }
            sky.fillStyle(hexToInt(bands[1] ?? preset.sky[0]), 1);
            const sx = cx + Math.round(r * 0.45);
            for (let dy = -r; dy <= r; dy += k) {
              const half = Math.floor(Math.sqrt(r * r - dy * dy) / k) * k;
              sky.fillRect(sx - half, cy + dy - k, half * 2, k);
            }
          }
        };

        self.events.on("update", () => {
          if (removed || !(target.sys.isActive() || target.sys.isPaused())) return;
          const main = target.cameras?.main;
          if (!main) return;
          const W = self.scale.width;
          const H = self.scale.height;
          const k = Math.max(1, Math.round(main.zoom));
          // Reduced motion: the horizontal parallax freezes; vertically the plates keep tracking
          // the camera 1:1 (no parallax) so they never come off the ground line.
          const mid = {
            midX: options.reducedMotion ? (frozenX ??= main.midPoint.x) : main.midPoint.x,
            midY: main.midPoint.y,
          };
          const horizonWorld = horizonFor(options.horizons, mid.midY, 32) ?? mid.midY + main.height / main.zoom / 4;
          const groundScreen = H / 2 + (horizonWorld - mid.midY) * main.zoom;
          if (W !== lastW || H !== lastH || k !== lastK) {
            drawSky(W, H, k, Math.max(H * 0.4, Math.min(H, groundScreen)));
            lastW = W;
            lastH = H;
            lastK = k;
          }
          if (glow) {
            // From a third of the view down to the ground line (or the view's foot).
            const top = Math.round(H / 3);
            const foot = Math.round(Math.max(top + k, Math.min(H, groundScreen)));
            (glow as Phaser.GameObjects.Image).setPosition(0, top).setDisplaySize(W, foot - top);
          }
          plates.forEach(({ layer, spec, sprite, fill, height }) => {
            if (spec) {
              // Native art scaled by a whole factor: the world's zoom, or more if that leaves the
              // view uncovered; anchored to the top or bottom edge as the art pipeline says.
              const s = Math.max(k, Math.ceil(H / height));
              sprite.setScale(s);
              sprite.width = Math.ceil(W / s) + 2;
              sprite.setPosition(0, spec.anchor === "top" ? 0 : H - height * s);
              sprite.tilePositionX = Math.round((mid.midX * spec.scrollFactor * main.zoom) / s);
              return;
            }
            const f = PARALLAX[layer];
            const bottomWorld = horizonWorld + SINK;
            const fy = options.reducedMotion ? 1 : f.y;
            let bottom = H / 2 + (bottomWorld - mid.midY) * main.zoom * fy;
            if (layer === "fog") bottom -= Math.round(height * 0.35) * k;
            bottom = Math.round(bottom / k) * k;
            sprite.setScale(k);
            sprite.width = Math.ceil(W / k) + 2;
            sprite.setPosition(0, bottom);
            sprite.tilePositionX = Math.round(mid.midX * f.x);
            if (fill.visible) {
              fill.setPosition(0, bottom);
              fill.setSize(W, Math.max(0, H - bottom));
            }
          });
        });
      },
    },
    true,
  );
  target.scene.sendToBack(key);

  const destroy = () => {
    if (removed) return;
    removed = true;
    try {
      target.scene.remove(key);
    } catch {
      // The game is going away.
    }
  };
  target.events.once("shutdown", destroy);
  target.events.once("destroy", destroy);
  return { key, fromManifest, rejected, destroy };
}

function layerColor(preset: LookPreset, layer: PlateLayer): string {
  if (layer === "far") return preset.hills[0];
  if (layer === "mid") return preset.hills[1];
  if (layer === "near") return preset.hills[2];
  return preset.fog;
}

/** A vertical glow, clear at the top and the preset's horizon colour at the foot (LINEAR). */
function ensureGlow(scene: Phaser.Scene, preset: LookPreset): string {
  const key = `look-glow-${preset.name}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 3, 120); // non-power-of-two: CLAMP wrap, no bleed from the foot
  if (!texture) return "__WHITE";
  const ctx = texture.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 120);
  const { r, g: gg, b } = rgb(preset.horizonGlow ?? preset.fog);
  const alpha = preset.horizonGlowAlpha ?? 0.45;
  g.addColorStop(0, `rgba(${r},${gg},${b},0)`);
  g.addColorStop(0.65, `rgba(${r},${gg},${b},${(alpha * 0.45).toFixed(3)})`);
  g.addColorStop(1, `rgba(${r},${gg},${b},${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 3, 120);
  texture.refresh();
  // A gradient, not pixel art: LINEAR (Phaser.Textures.FilterMode.LINEAR = 0) under pixelArt.
  texture.setFilter(0);
  return key;
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const value = hexToInt(hex);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
