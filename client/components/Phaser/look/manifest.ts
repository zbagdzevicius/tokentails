/**
 * The look manifest and the `lookVersion` flag (plan G7 "Look presets", decision #51).
 *
 * `public/look/manifest.json` is written by the art pipeline (task 6d, `scripts/art/build.mjs`)
 * and read here by name. No remote config exists, so the flag is:
 *
 *   1. the per-device override in localStorage (`tt-look-version`, or 6d's documented
 *      `tt.lookVersion`; look/settings.ts), else
 *   2. `lookVersion` in the manifest: set it to "v0" in the static file to roll every web player
 *      back without a rebuild, else
 *   3. the `lookVersion` of the last manifest this device read (`tt-look-version-last`), so a
 *      failed fetch after a rollback does not put the player back on v1, else
 *   4. `DEFAULT_LOOK_VERSION`.
 *
 * The manifest (schemaVersion 1, see docs/plans/alignment-log/6d.md) has, among others:
 *
 *   presets   { "home" | "shelter" | "cupid" | "purrsuit/<family>":
 *               { v0: { tileset }, v1: { tileset, plates, background, poster, extraTilesets } } }
 *   tilesets  { "base/spring-night-v1.png": { margin, spacing, ... } }
 *   plates    { "hub-night": { layers: [{ name, file, scrollFactor, anchor, order }] } }
 *   purrsuitFamilies  { "base/construct.png": "purrsuit/construct" }
 *   backdrop  { layer: "decorations", gids: [104], scenes: [...] }   tiles v1 hides so the
 *             plates show (the water fill painted over the whole hub view)
 *
 * Anything missing or malformed is dropped; a scene then keeps its v0 art for that piece (and
 * v1 draws procedural plates, look/procedural.ts). Paths are site-relative: the files ship in
 * `public/`; the CDN upload is a deferred manual step.
 *
 * Pure module: no Phaser import (Jest, SSR).
 */
import {
  getLastLookVersion,
  getLookVersionOverride,
  isLookVersion,
  rememberLookVersion,
  type LookVersion,
} from "./settings";

export type { LookVersion };

export const LOOK_MANIFEST_URL = "/look/manifest.json";

/**
 * The manifest URL for a Phaser loader (which has no `cache: "no-cache"`): cache-busted per
 * minute so an HTTP-cached copy cannot hold back a rollback for longer than that.
 */
export function lookManifestLoaderUrl(now: number = Date.now()): string {
  return `${LOOK_MANIFEST_URL}?v=${Math.floor(now / 60000)}`;
}
/** Phaser JSON cache key of the manifest. */
export const LOOK_MANIFEST_KEY = "tt-look-manifest";
/** Used when neither an override nor a manifest says otherwise. The night look is the product. */
export const DEFAULT_LOOK_VERSION: LookVersion = "v1";

export const PLATE_LAYERS = ["far", "mid", "near", "fog"] as const;
export type PlateLayer = (typeof PLATE_LAYERS)[number];

export interface TileSkin {
  url: string;
  margin?: number;
  spacing?: number;
  /** Tile gids that emit light (lamps, candles). */
  emissive?: number[];
}

export interface PlateLayerSpec {
  name: PlateLayer;
  url: string;
  /** Horizontal parallax, 0 (fixed) to 1 (moves with the world). */
  scrollFactor: number;
  anchor: "top" | "bottom";
  order: number;
}

export interface PlateSet {
  layers: PlateLayerSpec[];
}

export interface SceneLook {
  /** Night tile skin name (a key of `tiles`). */
  tileSkin?: string;
  plates?: string;
  /** Flat CSS colour behind the canvas until boot. */
  background?: string;
  poster?: string;
  /** Extra tilesets by name (`shelter-signs`), as skin names. */
  extra: Record<string, string>;
}

export interface LookManifest {
  lookVersion?: LookVersion;
  /** Skin name (`spring-night`) -> sheet. */
  tiles: Record<string, TileSkin>;
  plates: Record<string, PlateSet>;
  /** Scene id (`home`, `purrsuit/construct`) -> its v1 look. */
  scenes: Record<string, SceneLook>;
  /** `base/construct.png` -> `purrsuit/construct`. */
  families: Record<string, string>;
  /** Tiles v1 hides in one layer of the listed scenes. */
  backdrop: { layer: string; gids: number[]; scenes: string[] } | null;
}

export const emptyManifest = (): LookManifest => ({
  tiles: {},
  plates: {},
  scenes: {},
  families: {},
  backdrop: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A site-relative or http(s) URL; anything else (javascript:, data:, //host) is dropped. */
export function lookAssetUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > 512) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.includes("..")) return null;
  return url.startsWith("/") ? url : `/${url}`;
}

/** `base/spring-night-v1.png` -> `spring-night`; `shelter/signs-night-v1.png` -> `signs-night`. */
export function skinNameFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.[a-z0-9]+$/i, "").replace(/-v\d+$/i, "");
}

const smallInt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 64 ? value : undefined;

const gidList = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n) && n > 0) : [];

const color = (value: unknown): string | undefined =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;

function parseSkin(path: string, entry: unknown): TileSkin | null {
  const url = lookAssetUrl(isRecord(entry) && typeof entry.url === "string" ? entry.url : path);
  if (!url) return null;
  const skin: TileSkin = { url };
  if (isRecord(entry)) {
    const margin = smallInt(entry.margin);
    const spacing = smallInt(entry.spacing);
    if (margin !== undefined) skin.margin = margin;
    if (spacing !== undefined) skin.spacing = spacing;
    const emissive = gidList(entry.emissive);
    if (emissive.length) skin.emissive = emissive;
  }
  return skin;
}

function parsePlateSet(entry: unknown): PlateSet | null {
  if (!isRecord(entry) || !Array.isArray(entry.layers)) return null;
  const layers: PlateLayerSpec[] = [];
  entry.layers.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const name = raw.name;
    if (typeof name !== "string" || !(PLATE_LAYERS as readonly string[]).includes(name)) return;
    const url = lookAssetUrl(raw.file ?? raw.url);
    if (!url) return;
    const sf = typeof raw.scrollFactor === "number" && raw.scrollFactor >= 0 && raw.scrollFactor <= 1 ? raw.scrollFactor : 0.2;
    layers.push({
      name: name as PlateLayer,
      url,
      scrollFactor: sf,
      anchor: raw.anchor === "top" ? "top" : "bottom",
      order: typeof raw.order === "number" ? raw.order : index,
    });
  });
  layers.sort((a, b) => a.order - b.order);
  return layers.length ? { layers } : null;
}

/** Tolerant parse: junk entries are dropped, never thrown. */
export function parseLookManifest(raw: unknown): LookManifest {
  const manifest = emptyManifest();
  if (!isRecord(raw)) return manifest;
  if (isLookVersion(raw.lookVersion)) manifest.lookVersion = raw.lookVersion;

  if (isRecord(raw.tilesets)) {
    for (const [path, entry] of Object.entries(raw.tilesets)) {
      const skin = parseSkin(path, entry);
      if (skin) manifest.tiles[skinNameFromPath(path)] = skin;
    }
  }
  if (isRecord(raw.plates)) {
    for (const [name, entry] of Object.entries(raw.plates)) {
      const set = parsePlateSet(entry);
      if (set) manifest.plates[name] = set;
    }
  }
  if (isRecord(raw.presets)) {
    for (const [id, entry] of Object.entries(raw.presets)) {
      const v1 = isRecord(entry) && isRecord(entry.v1) ? entry.v1 : null;
      if (!v1) continue;
      const look: SceneLook = { extra: {} };
      if (typeof v1.tileset === "string") {
        const name = skinNameFromPath(v1.tileset);
        if (!manifest.tiles[name]) {
          const skin = parseSkin(v1.tileset, null);
          if (skin) manifest.tiles[name] = skin;
        }
        if (manifest.tiles[name]) look.tileSkin = name;
      }
      if (typeof v1.plates === "string" && manifest.plates[v1.plates]) look.plates = v1.plates;
      const background = color(v1.background);
      if (background) look.background = background;
      const poster = lookAssetUrl(v1.poster);
      if (poster) look.poster = poster;
      if (isRecord(v1.extraTilesets)) {
        for (const [extraName, path] of Object.entries(v1.extraTilesets)) {
          if (typeof path !== "string") continue;
          const skinName = skinNameFromPath(path);
          if (!manifest.tiles[skinName]) {
            const skin = parseSkin(path, null);
            if (skin) manifest.tiles[skinName] = skin;
          }
          if (manifest.tiles[skinName]) look.extra[extraName] = skinName;
        }
      }
      manifest.scenes[id] = look;
    }
  }
  if (isRecord(raw.purrsuitFamilies)) {
    for (const [sheet, id] of Object.entries(raw.purrsuitFamilies)) {
      if (typeof id === "string") manifest.families[sheet] = id;
    }
  }
  if (isRecord(raw.backdrop) && typeof raw.backdrop.layer === "string") {
    const gids = gidList(raw.backdrop.gids);
    const scenes = Array.isArray(raw.backdrop.scenes)
      ? raw.backdrop.scenes.filter((s): s is string => typeof s === "string")
      : [];
    if (gids.length) manifest.backdrop = { layer: raw.backdrop.layer, gids, scenes };
  }
  return manifest;
}

/** Override, then manifest, then the last manifest this device read, then the default. */
export function resolveLookVersion(
  manifest: Pick<LookManifest, "lookVersion"> | null | undefined,
  override: LookVersion | null = getLookVersionOverride(),
  last: LookVersion | null = getLastLookVersion(),
): LookVersion {
  if (override) return override;
  if (manifest?.lookVersion) return manifest.lookVersion;
  if (last) return last;
  return DEFAULT_LOOK_VERSION;
}

/** `base/spring.png` -> `spring`. */
export function sheetFamily(sheetPath: string): string {
  const file = sheetPath.split("/").pop() ?? sheetPath;
  return file.replace(/\.[a-z0-9]+$/i, "");
}

export const nightSkinName = (sheetPath: string) => `${sheetFamily(sheetPath)}-night`;

/* ---------------------------------------------------------------------------------------------
 * Loading. The browser fetch is shared by the React side (posters) and the scenes; a scene that
 * preloads before it settled queues the manifest on its own loader (worldLook.ts).
 * ------------------------------------------------------------------------------------------- */

let cached: LookManifest | null = null;
let pending: Promise<LookManifest> | null = null;

/** The manifest if it already arrived (fetch or a scene's loader), else null. */
export function getCachedLookManifest(): LookManifest | null {
  return cached;
}

/** Stores a manifest read elsewhere (a scene's JSON loader). */
export function setCachedLookManifest(raw: unknown): LookManifest {
  cached = parseLookManifest(raw);
  if (cached.lookVersion) rememberLookVersion(cached.lookVersion);
  return cached;
}

/**
 * Fetches once per page. On any failure it resolves to an empty manifest: no night skins or
 * manifest plates, and the version falls to the last one this device read, then the default
 * (v1, which then draws the procedural plates and washed v0 tiles).
 */
export function fetchLookManifest(fetcher: typeof fetch | undefined = globalThis.fetch): Promise<LookManifest> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  if (typeof fetcher !== "function") return Promise.resolve(emptyManifest());
  pending = fetcher(LOOK_MANIFEST_URL, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => (json ? setCachedLookManifest(json) : emptyManifest()))
    .catch(() => emptyManifest())
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Tests only. */
export function resetLookManifestCache(): void {
  cached = null;
  pending = null;
}
