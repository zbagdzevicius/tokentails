import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_LOOK_VERSION,
  fetchLookManifest,
  getCachedLookManifest,
  lookAssetUrl,
  lookManifestLoaderUrl,
  parseLookManifest,
  resetLookManifestCache,
  resolveLookVersion,
  skinNameFromPath,
} from "@/components/Phaser/look/manifest";
import { lookPreset } from "@/components/Phaser/look/presets";
import { getLastLookVersion } from "@/components/Phaser/look/settings";
import { resetMemorySettings } from "@/components/Phaser/look/storage";
import { resolveSceneLook } from "@/components/Phaser/look/worldLook";
import { CatnipChaosLevelMap, HubMap, Map as TileMap, PixelRescueLevelMap } from "@/components/Phaser/map";

// G7 "Look presets" (decisions #49, #50, #51): presets per scene, resolved by name through the
// look manifest that task 6d generates (public/look/manifest.json).

const PUBLIC = join(__dirname, "..", "public");
const raw = JSON.parse(readFileSync(join(PUBLIC, "look", "manifest.json"), "utf8"));
const manifest = parseLookManifest(raw);

describe("parseLookManifest on the generated manifest", () => {
  it("reads the version flag, tile skins, plate sets and scenes", () => {
    expect(manifest.lookVersion === "v0" || manifest.lookVersion === "v1").toBe(true);
    expect(manifest.tiles["spring-night"]).toMatchObject({ url: "/base/spring-night-v1.png", margin: 1, spacing: 2 });
    expect(manifest.tiles["valentine-night"]?.url).toBe("/base/valentine-night-v1.png");
    expect(manifest.plates["hub-night"].layers.map((l) => l.name)).toEqual(["far", "mid", "near", "fog"]);
    expect(manifest.scenes.home).toMatchObject({ tileSkin: "spring-night", plates: "hub-night" });
    expect(manifest.scenes.shelter).toMatchObject({ tileSkin: "spring-night", plates: "hub-dusk" });
    expect(manifest.scenes.shelter.extra["shelter-signs"]).toBe("signs-night");
    expect(manifest.backdrop?.gids).toEqual([104]);
  });

  it("every file it names exists in public/", () => {
    const files = [
      ...Object.values(manifest.tiles).map((skin) => skin.url),
      ...Object.values(manifest.plates).flatMap((set) => set.layers.map((layer) => layer.url)),
      ...Object.values(manifest.scenes).flatMap((scene) => (scene.poster ? [scene.poster] : [])),
    ];
    expect(files.length).toBeGreaterThan(20);
    files.forEach((url) => expect(() => readFileSync(join(PUBLIC, url))).not.toThrow());
  });
});

describe("scene presets", () => {
  it("Home and Shelter use the hub night skin; Home is moonlit night, Shelter dusk (#49)", () => {
    expect(HubMap.v0).toBe(TileMap.SPRING);
    expect(HubMap.v1).toBe(TileMap.SPRING_NIGHT);
    const home = resolveSceneLook(manifest, { kind: "home", sheet: HubMap.v0 });
    const shelter = resolveSceneLook(manifest, { kind: "shelter", sheet: HubMap.v0 });
    expect(home).toMatchObject({ id: "home", tileSkin: "spring-night", plateSet: "hub-night" });
    expect(shelter).toMatchObject({ id: "shelter", tileSkin: "spring-night", plateSet: "hub-dusk" });
    expect(home.preset.moon).toBe(true);
    expect(shelter.preset.sky[2]).toBe("#ee8a5c");
    expect(home.hide).toEqual({ layer: "decorations", gids: [104] });
    // Night is darker and cooler at Home; the Shelter's dusk is warmer, with a horizon glow.
    expect(home.preset.nightTint).toBeTruthy();
    expect(shelter.preset.nightTint).not.toBe(home.preset.nightTint);
    expect(shelter.preset.horizonGlow).toBe("#ee8a5c");
    expect(home.preset.horizonGlow).toBeUndefined();
  });

  it("Home and Shelter know their night sheet (HubMap.v1) when the manifest omits it", () => {
    const bare = parseLookManifest({ lookVersion: "v1" });
    expect(resolveSceneLook(bare, { kind: "home", sheet: HubMap.v0 })).toMatchObject({
      tileSkin: "spring-night",
      skin: { url: `/${HubMap.v1}`, margin: 1, spacing: 2 },
    });
    expect(resolveSceneLook(bare, { kind: "shelter", sheet: HubMap.v0 }).skin?.url).toBe(`/${HubMap.v1}`);
    expect(resolveSceneLook(bare, { kind: "cupid", sheet: PixelRescueLevelMap["1"] }).skin).toBeNull();
  });

  it("Cupid gets valentine-night; every Purrsuit level gets its own family, incl. ENDLESS (#50)", () => {
    const cupid = resolveSceneLook(manifest, { kind: "cupid", sheet: PixelRescueLevelMap["1"] });
    expect(cupid).toMatchObject({ id: "cupid", tileSkin: "valentine-night", plateSet: "cupid-night" });
    for (const [level, sheet] of Object.entries(CatnipChaosLevelMap)) {
      const look = resolveSceneLook(manifest, { kind: "purrsuit", sheet });
      expect(look.id).toMatch(/^purrsuit\//);
      expect(look.tileSkin).not.toBeNull();
      expect(look.plates?.layers.length).toBeGreaterThan(0);
      // Purrsuit spring chapters keep the spring family (not the hub preset).
      if (level.startsWith("2")) expect(look.id).toBe("purrsuit/spring");
    }
    expect(resolveSceneLook(manifest, { kind: "purrsuit", sheet: CatnipChaosLevelMap["01"] }).id).toBe("purrsuit/combined");
  });

  it("falls back to the preset's own names (and v0 art) with an empty manifest", () => {
    const look = resolveSceneLook(parseLookManifest(null), { kind: "purrsuit", sheet: "base/candy.png" });
    expect(look).toMatchObject({ id: "purrsuit/candy", tileSkin: null, plateSet: "purrsuit-candy", plates: null, hide: null });
    expect(lookPreset("purrsuit", "base/candy.png").zoom).toBe("platformer");
    expect(lookPreset("home").zoom).toBe("hub");
  });
});

describe("lookVersion flag (#51): override, then manifest, then last read, then default", () => {
  it("resolves in that order", () => {
    expect(resolveLookVersion({ lookVersion: "v0" }, "v1", null)).toBe("v1");
    expect(resolveLookVersion({ lookVersion: "v0" }, null, "v1")).toBe("v0");
    expect(resolveLookVersion({}, null, "v0")).toBe("v0");
    expect(resolveLookVersion({}, null, null)).toBe(DEFAULT_LOOK_VERSION);
    expect(resolveLookVersion(null, null, null)).toBe("v1");
  });

  it("a rolled-back device stays on v0 when a later fetch fails", async () => {
    resetLookManifestCache();
    resetMemorySettings();
    const v0 = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...raw, lookVersion: "v0" }) });
    await fetchLookManifest(v0 as unknown as typeof fetch);
    expect(getLastLookVersion()).toBe("v0");
    // Next page load: the manifest cannot be fetched.
    resetLookManifestCache();
    const failed = await fetchLookManifest(jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch);
    expect(failed.lookVersion).toBeUndefined();
    expect(resolveLookVersion(failed, null)).toBe("v0");
    resetLookManifestCache();
    resetMemorySettings();
  });

  it("the Phaser loader URL is cache-busted per minute (the loader has no no-cache)", () => {
    expect(lookManifestLoaderUrl(0)).toBe("/look/manifest.json?v=0");
    expect(lookManifestLoaderUrl(59_999)).toBe(lookManifestLoaderUrl(0));
    expect(lookManifestLoaderUrl(60_000)).toBe("/look/manifest.json?v=1");
  });

  it("a rollback is an edit of the static file", () => {
    expect(parseLookManifest({ ...raw, lookVersion: "v0" }).lookVersion).toBe("v0");
    expect(parseLookManifest({ ...raw, lookVersion: "v7" }).lookVersion).toBeUndefined();
  });
});

describe("hardening", () => {
  it("drops unsafe or junk URLs and entries", () => {
    expect(lookAssetUrl("javascript:alert(1)")).toBeNull();
    expect(lookAssetUrl("//evil.example/x.png")).toBeNull();
    expect(lookAssetUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(lookAssetUrl("../secrets.png")).toBeNull();
    expect(lookAssetUrl("base/a.png")).toBe("/base/a.png");
    expect(lookAssetUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
    const parsed = parseLookManifest({
      tilesets: { "javascript:x": {}, "base/x-night-v1.png": { margin: -1, spacing: 2 } },
      plates: { bad: { layers: [{ name: "sky", file: "a.png" }, "junk"] } },
      presets: { home: { v1: { tileset: 42, plates: "missing", background: "red" } } },
    });
    expect(Object.keys(parsed.tiles)).toEqual(["x-night"]);
    expect(parsed.tiles["x-night"]).toEqual({ url: "/base/x-night-v1.png", spacing: 2 });
    expect(parsed.plates).toEqual({});
    expect(parsed.scenes.home).toEqual({ extra: {} });
    expect(skinNameFromPath("shelter/signs-night-v1.png")).toBe("signs-night");
  });

  it("fetches once and survives a failing fetch", async () => {
    resetLookManifestCache();
    const failing = jest.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchLookManifest(failing as unknown as typeof fetch)).resolves.toMatchObject({ tiles: {} });
    expect(getCachedLookManifest()).toBeNull();
    const ok = jest.fn().mockResolvedValue({ ok: true, json: async () => raw });
    const [a, b] = await Promise.all([fetchLookManifest(ok as unknown as typeof fetch), fetchLookManifest(ok as unknown as typeof fetch)]);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(getCachedLookManifest()?.scenes.home.plates).toBe("hub-night");
    resetLookManifestCache();
  });
});
