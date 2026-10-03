/**
 * The per-scene look runtime (plan G7, task 6e). Home, Shelter, Purrsuit and Cupid Cat use it
 * in three calls:
 *
 *   preload()   preloadWorldLook(scene, { kind, sheet })
 *               queues the look manifest (once per game) and, for v1, the preset's night tile
 *               skin and plates by name;
 *   create()    const look = beginWorldLook(scene, { kind, sheet })
 *               look.tilesetKey(baseKey)   texture for addTilesetImage (night skin in v1)
 *               look.dress({ layers, tilemapKey })   camera rig, backdrop, lights, fireflies,
 *                                                     vignette (v1), integer zoom (both)
 *   spawn       look.follow(sprite), look.attachCat(sprite, { player })
 *
 * v0 is the look as shipped before G7 (CSS backdrop, day tiles), with the integer-zoom camera
 * rig of F10/G7 in both versions. The version comes from look/manifest.ts (override, manifest,
 * default). Gameplay never reads anything from here: positions, physics, timers and saves are
 * the same in v0 and v1 (world-look.spec.ts posts the same `/live` payload under both).
 *
 * Only type imports from Phaser.
 */
import { addFireflies, addLights, addVignette, emissiveSpots, LIGHT_CAP, type Fireflies } from "./ambience";
import { installBackdrop, plateTextureKey, type Backdrop } from "./backdrop";
import { installCameraRig, type CameraRig } from "./cameraRig";
import { captureSeed } from "./capture";
import {
  getCachedLookManifest,
  LOOK_MANIFEST_KEY,
  emptyManifest,
  lookAssetUrl,
  lookManifestLoaderUrl,
  resolveLookVersion,
  setCachedLookManifest,
  type LookManifest,
  type LookVersion,
  type PlateSet,
  type TileSkin,
} from "./manifest";
import { HubMap } from "@/components/Phaser/map";
import { attachPresence, type Presence } from "./presence";
import { hexToInt, lookPreset, type LookPreset, type SceneKind } from "./presets";
import { RENDER_TIER } from "./registry";
import { isReducedMotion } from "./settings";
import type { RenderTier } from "./tier";
import { computeWorldBounds, majorSurfaces, type TiledMapLike } from "./worldBounds";

export interface WorldLookOptions {
  kind: SceneKind;
  /** The v0 tile sheet path (a `Map` value), which names the Purrsuit family. */
  sheet: string;
}

/** Texture key of a night tile skin. */
export const nightTilesKey = (skin: string) => `look-tiles-${skin}`;

/** The manifest from the game's JSON cache or the page fetch, if either has it. */
function knownManifest(scene: Phaser.Scene): LookManifest | null {
  const cached = getCachedLookManifest();
  if (cached) return cached;
  if (scene.cache.json.exists(LOOK_MANIFEST_KEY)) return setCachedLookManifest(scene.cache.json.get(LOOK_MANIFEST_KEY));
  return null;
}

export interface ResolvedLook {
  preset: LookPreset;
  /** Manifest scene id. */
  id: string;
  tileSkin: string | null;
  skin: TileSkin | null;
  plateSet: string;
  plates: PlateSet | null;
  /** Extra tileset name -> skin name (Shelter signs). */
  extra: Record<string, string>;
  /** Gids to hide in one layer under v1 (the hub water fill), if this scene is listed. */
  hide: { layer: string; gids: number[] } | null;
}

/**
 * Home and the Shelter know their night sheet without the manifest (`HubMap.v1`, same indices
 * and spacing as `HubMap.v0`): used when a manifest does not list the hub skin.
 */
function hubSkinFallback(kind: SceneKind): TileSkin | null {
  if (kind !== "home" && kind !== "shelter") return null;
  const url = lookAssetUrl(HubMap.v1);
  return url ? { url, margin: 1, spacing: 2 } : null;
}

/** The scene's preset with the manifest's names applied. */
export function resolveSceneLook(manifest: LookManifest, options: WorldLookOptions): ResolvedLook {
  const preset = lookPreset(options.kind, options.sheet);
  const id = options.kind === "purrsuit" ? manifest.families[options.sheet] ?? preset.id : preset.id;
  const scene = manifest.scenes[id];
  const tileSkin = scene?.tileSkin ?? preset.tileSkin;
  const skin = tileSkin ? manifest.tiles[tileSkin] ?? hubSkinFallback(options.kind) : null;
  const plateSet = scene?.plates ?? preset.name;
  const backdrop = manifest.backdrop;
  return {
    preset,
    id,
    tileSkin: skin ? tileSkin : null,
    skin,
    plateSet,
    plates: manifest.plates[plateSet] ?? null,
    extra: scene?.extra ?? {},
    hide: backdrop && backdrop.scenes.includes(id) ? { layer: backdrop.layer, gids: backdrop.gids } : null,
  };
}

/** Queues the v1 files of a scene (no-op in v0, or for names the manifest does not list). */
function queueLookFiles(scene: Phaser.Scene, manifest: LookManifest, options: WorldLookOptions) {
  if (resolveLookVersion(manifest) !== "v1") return;
  const look = resolveSceneLook(manifest, options);
  const queue = (key: string, url: string) => {
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  };
  if (look.tileSkin && look.skin) queue(nightTilesKey(look.tileSkin), look.skin.url);
  Object.values(look.extra).forEach((skinName) => {
    const skin = manifest.tiles[skinName];
    if (skin) queue(nightTilesKey(skinName), skin.url);
  });
  look.plates?.layers.forEach((layer) => queue(plateTextureKey(look.plateSet, layer.name), layer.url));
}

/**
 * In `preload()`. When the manifest is not known yet it is queued on the scene's loader and the
 * preset's files are added from its `filecomplete` (Phaser loads files added then in the same
 * pass). A missing manifest leaves only the v0 files: v1 then draws procedural plates.
 */
export function preloadWorldLook(scene: Phaser.Scene, options: WorldLookOptions): void {
  const manifest = knownManifest(scene);
  if (manifest) {
    queueLookFiles(scene, manifest, options);
    return;
  }
  scene.load.once(`filecomplete-json-${LOOK_MANIFEST_KEY}`, (_key: string, _type: string, data: unknown) => {
    queueLookFiles(scene, setCachedLookManifest(data), options);
  });
  // Cache-busted per minute: an HTTP-cached manifest must not hold back a rollback (#51).
  scene.load.json(LOOK_MANIFEST_KEY, lookManifestLoaderUrl());
}

/**
 * In `preload()`, in place of `load.image(key, v0Url)` for a scene's base tile sheet. When the
 * manifest is already known, says v1 and lists the scene's night skin, the v0 sheet is not
 * downloaded at all (Home and the Shelter used to fetch both); if the night skin then fails to
 * load, the v0 sheet is queued in the same loader pass so the tileset never lacks a texture.
 * Otherwise the v0 sheet loads as before.
 */
export function preloadBaseSheet(scene: Phaser.Scene, key: string, v0Url: string, options: WorldLookOptions): void {
  if (scene.textures.exists(key)) return;
  const manifest = knownManifest(scene);
  const look = manifest && resolveLookVersion(manifest) === "v1" ? resolveSceneLook(manifest, options) : null;
  if (!look?.tileSkin || !look.skin) {
    scene.load.image(key, v0Url);
    return;
  }
  const night = nightTilesKey(look.tileSkin);
  if (scene.textures.exists(night)) return;
  const onError = (file: { key?: string }) => {
    if (file?.key !== night) return;
    scene.load.off("loaderror", onError);
    if (!scene.textures.exists(key)) scene.load.image(key, v0Url);
  };
  scene.load.on("loaderror", onError);
  scene.load.once("complete", () => scene.load.off("loaderror", onError));
}

export interface DressOptions {
  /** Every tile layer, front ones included (lights scan them; wash tints them). */
  layers: Array<Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer | null | undefined>;
  /** Cache key of the Tiled JSON (bounds and ground line). */
  tilemapKey: string;
  /** Layers that define the walkable ground (default: all). */
  groundLayers?: string[];
}

export interface LookState {
  version: LookVersion;
  /** Manifest scene id (`home`, `purrsuit/construct`). */
  preset: string;
  plateSet: string;
  tier: RenderTier;
  zoom: number;
  tiles: "v0" | "night" | "wash";
  /** The tile-layer tint in use (wash or nightTint), or null. */
  tileTint: string | null;
  backdrop: boolean;
  plates: string[];
  /** Manifest plates skipped for a straight crop edge (drawn procedurally instead). */
  platesRejected: string[];
  lights: number;
  fireflies: number;
  halos: number;
  glow: boolean;
  reducedMotion: boolean;
}

export interface WorldLook {
  readonly version: LookVersion;
  readonly preset: LookPreset;
  readonly rig: CameraRig | null;
  tilesetKey(baseKey: string): string;
  /** Texture for an extra tileset (`shelter-signs`): its night skin in v1 when listed. */
  extraTilesetKey(name: string, baseKey: string): string;
  dress(options: DressOptions): void;
  follow(sprite: Phaser.GameObjects.Sprite): void;
  /** Halo and shadow under a cat (v1), destroyed with the sprite. */
  attachCat(sprite: Phaser.GameObjects.Sprite, options?: { player?: boolean }): void;
  state(): LookState;
}

const looks = new WeakMap<object, WorldLook>();

/** The look a scene began, if any (TutorialManager's zoom steps go through its rig). */
export function getWorldLook(scene: object): WorldLook | undefined {
  return looks.get(scene);
}

export function beginWorldLook(scene: Phaser.Scene, options: WorldLookOptions): WorldLook {
  const manifest = knownManifest(scene) ?? emptyManifest();
  const version = resolveLookVersion(manifest);
  const resolved = resolveSceneLook(manifest, options);
  const { preset } = resolved;
  const tierValue = scene.registry.get(RENDER_TIER);
  const tier: RenderTier = tierValue === "LOW" || tierValue === "HIGH" ? tierValue : "MID";
  const reducedMotion = isReducedMotion();
  const seed = captureSeed() ?? `tt-look:${preset.name}`;
  const v1 = version === "v1";

  let rig: CameraRig | null = null;
  let tiles: LookState["tiles"] = "v0";
  let backdrop: Backdrop | null = null;
  let lights = 0;
  let fireflies: Fireflies | null = null;
  const presences = new Set<Presence>();
  let glow = false;
  let tinted: string | null = null;

  const look: WorldLook = {
    version,
    preset,
    get rig() {
      return rig;
    },
    tilesetKey(baseKey) {
      if (!v1 || !resolved.tileSkin) return baseKey;
      const night = nightTilesKey(resolved.tileSkin);
      if (scene.textures.exists(night)) {
        tiles = "night";
        return night;
      }
      return baseKey;
    },
    extraTilesetKey(name, baseKey) {
      const skin = resolved.extra[name];
      if (!v1 || !skin) return baseKey;
      const night = nightTilesKey(skin);
      return scene.textures.exists(night) ? night : baseKey;
    },
    dress({ layers, tilemapKey, groundLayers }) {
      const raw = scene.cache.tilemap.get(tilemapKey)?.data as TiledMapLike | undefined;
      const world = raw ? computeWorldBounds(raw) : null;
      rig?.destroy();
      rig = installCameraRig(scene, { preset: preset.zoom, world, reducedMotion });
      if (!v1) return;

      // Per tile layer, never a screen grade: the v0 tiles get the wash when no night skin
      // loaded; a night skin gets the preset's nightTint where it still reads too bright.
      const tint = tiles === "night" ? preset.nightTint : preset.tileWash;
      if (tiles !== "night") tiles = "wash";
      if (tint) {
        const value = hexToInt(tint);
        layers.forEach((layer) => (layer as Phaser.Tilemaps.TilemapLayer | null)?.setTint?.(value));
        tinted = tint;
      }
      // The full-view water fill would cover the plates: hide those tiles (drawing only; no
      // layer that collides is touched, and the tile data stays as it is).
      if (resolved.hide) {
        const { layer: name, gids } = resolved.hide;
        const wanted = new Set(gids);
        layers.forEach((layer) => {
          const tilemapLayer = layer as Phaser.Tilemaps.TilemapLayer | null | undefined;
          if (!tilemapLayer || tilemapLayer.layer?.name !== name) return;
          tilemapLayer.forEachTile((tile) => {
            if (wanted.has(tile.index)) tile.setVisible(false);
          });
        });
      }
      const horizons = raw ? majorSurfaces(raw, groundLayers ? { layers: groundLayers } : {}) : [];
      backdrop = installBackdrop(scene, {
        preset,
        plates: resolved.plates,
        plateSet: resolved.plateSet,
        horizons,
        reducedMotion,
        seed,
      });
      const spots = emissiveSpots(
        layers as Phaser.Tilemaps.TilemapLayer[],
        resolved.skin?.emissive ?? preset.emissive,
        LIGHT_CAP[tier],
      );
      lights = addLights(scene, spots, hexToInt(preset.light), reducedMotion).length;
      fireflies = addFireflies(scene, {
        tier,
        colors: [hexToInt(preset.fireflies[0]), hexToInt(preset.fireflies[1])],
        seed,
        reducedMotion,
      });
      addVignette(scene);
    },
    follow(sprite) {
      if (rig) rig.follow(sprite);
      else scene.cameras.main.startFollow(sprite, true, 0.12, 0.12);
    },
    attachCat(sprite, { player = false } = {}) {
      if (!v1 || !sprite?.active) return;
      const presence = attachPresence(scene, sprite as Parameters<typeof attachPresence>[1], { color: hexToInt(preset.halo), tier, player });
      if (presence.glow) glow = true;
      presences.add(presence);
      sprite.once("destroy", () => presences.delete(presence));
    },
    state() {
      return {
        version,
        preset: resolved.id,
        tier,
        zoom: scene.cameras.main.zoom,
        tiles,
        tileTint: tinted,
        backdrop: !!backdrop,
        plateSet: resolved.plateSet,
        plates: backdrop?.fromManifest.slice() ?? [],
        platesRejected: backdrop?.rejected.slice() ?? [],
        lights,
        fireflies: fireflies?.count ?? 0,
        halos: presences.size,
        glow,
        reducedMotion,
      };
    },
  };
  looks.set(scene, look);
  // Read by e2e (world-look.spec.ts) and the capture driver.
  (scene as unknown as { lookState?: () => LookState }).lookState = () => look.state();
  scene.events.once("shutdown", () => {
    presences.forEach((presence) => presence.destroy());
    presences.clear();
  });
  return look;
}
