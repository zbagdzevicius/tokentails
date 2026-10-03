import {
  catKeyId,
  escapeHtml,
  isLoadableSpriteUrl,
  npcTextureKey,
  playerCatTextureKey,
  shortHash,
} from "@/components/Phaser/look/textureKeys";
import {
  loadSpritesheets,
  rememberTextureSource,
  removeTexture,
  type LoaderSceneLike,
} from "@/components/Phaser/look/loadTextures";
import {
  blessingTypes,
  NpcSpawnCoalescer,
  planNpcBatch,
} from "@/components/shelter/objects/npcBatch";
// No Phaser runtime import behind this (Jest would fail to load it otherwise).
import { loadPlayerCatTextures } from "@/components/catbassadors/objects/playerCatTexture";

const CDN = "https://tokentails.fra1.cdn.digitaloceanspaces.com";

describe("id-keyed texture keys (F10, decision #39)", () => {
  const lunaA = { _id: "64b0000000000000000000a1", name: "Luna", spriteImg: `${CDN}/cats/a.png` };
  const lunaB = { _id: "64b0000000000000000000b2", name: "Luna", spriteImg: `${CDN}/cats/b.png` };

  it("two cats with the same name get distinct keys", () => {
    expect(npcTextureKey(lunaA)).not.toBe(npcTextureKey(lunaB));
    expect(playerCatTextureKey(lunaA)).not.toBe(playerCatTextureKey(lunaB));
    expect(npcTextureKey(lunaA)).toBe(`npc-64b0000000000000000000a1-${shortHash(lunaA.spriteImg)}`);
  });

  it("NPC keys carry the sprite hash too, so a re-sent cat with a new sheet is a new key (2e review)", () => {
    const reskinned = { ...lunaA, spriteImg: `${CDN}/cats/a-winter.png` };
    expect(npcTextureKey(reskinned)).not.toBe(npcTextureKey(lunaA));
    expect(npcTextureKey({ ...lunaA })).toBe(npcTextureKey(lunaA));
  });

  it("player keys carry the sprite hash, so a re-skin is a new key", () => {
    const reskinned = { ...lunaA, spriteImg: `${CDN}/cats/a-winter.png` };
    expect(playerCatTextureKey(lunaA)).toBe(`player-cat-${lunaA._id}-${shortHash(lunaA.spriteImg)}`);
    expect(playerCatTextureKey(reskinned)).not.toBe(playerCatTextureKey(lunaA));
    expect(playerCatTextureKey({ ...lunaA })).toBe(playerCatTextureKey(lunaA));
  });

  it("players and NPCs never share a key, and names never become keys", () => {
    expect(playerCatTextureKey(lunaA)).not.toBe(npcTextureKey(lunaA));
    const evil = { _id: "x", name: "tilemap", spriteImg: "a.png" };
    expect(npcTextureKey(evil)).not.toContain("tilemap");
  });

  it("falls back to a stable hash without an id and sanitises odd ids", () => {
    const noId = { name: "Scout", spriteImg: "s.png" };
    expect(catKeyId(noId)).toMatch(/^anon[0-9a-z]+$/);
    expect(catKeyId(noId)).toBe(catKeyId({ ...noId }));
    expect(catKeyId({ ...noId, name: "Other" })).not.toBe(catKeyId(noId));
    expect(catKeyId({ _id: "a b/c" })).toBe("a_b_c");
  });

  it("shortHash is stable", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });

  it.each([
    [`${CDN}/x.png`, true],
    ["catbassadors/base.png", true],
    ["/local.png", true],
    ["data:image/png;base64,AAAA", true],
    ["", false],
    ["undefined", false],
    [undefined, false],
    [null, false],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
  ])("isLoadableSpriteUrl(%p) = %p", (url, ok) => {
    expect(isLoadableSpriteUrl(url)).toBe(ok);
  });

  it("escapes names for the speech bubble HTML", () => {
    expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
  });
});

describe("planNpcBatch", () => {
  const cat = (id: string, overrides: Record<string, unknown> = {}) => ({
    _id: id,
    name: "Luna",
    spriteImg: `${CDN}/${id}.png`,
    type: "FIRE",
    ...overrides,
  });

  it("keys by id, skips unusable cats, and drops duplicates", () => {
    const plan = planNpcBatch(
      [
        { npc: cat("a"), type: "token-tails" },
        { npc: cat("b"), type: "rozine-pedute" },
        { npc: cat("a"), type: "token-tails" }, // repeated in the batch
        { npc: cat("c", { spriteImg: "" }), type: "token-tails" },
        { npc: cat("", {}), type: "token-tails" },
        null,
        { npc: cat("d"), type: "token-tails" }, // already on screen
      ],
      new Set(["d"]),
    );
    expect(plan.spawn.map((entry) => entry.textureKey)).toEqual([
      `npc-a-${shortHash(`${CDN}/a.png`)}`,
      `npc-b-${shortHash(`${CDN}/b.png`)}`,
    ]);
    expect(plan.spawn[1].type).toBe("rozine-pedute");
    expect(plan.skippedIds).toEqual(["c", "unknown", "unknown"]);
    expect(plan.duplicates).toBe(2);
  });

  it("survives a non-array (legacy or malformed storefront)", () => {
    expect(planNpcBatch(undefined).spawn).toEqual([]);
    expect(planNpcBatch({} as never).spawn).toEqual([]);
  });

  it("lists each blessing sheet once", () => {
    const plan = planNpcBatch([
      { npc: cat("a", { blessing: true, type: "FIRE" }), type: 1 },
      { npc: cat("b", { blessing: true, type: "FIRE" }), type: 1 },
      { npc: cat("c", { blessing: true, type: "WATER" }), type: 1 },
      { npc: cat("d", { blessing: false, type: "AIR" }), type: 1 },
    ]);
    expect(blessingTypes(plan.spawn).sort()).toEqual(["FIRE", "WATER"]);
  });
});

describe("NpcSpawnCoalescer (legacy NPC_SPAWN delegate)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("turns a synchronous burst into one batch", () => {
    const flush = jest.fn();
    const coalescer = new NpcSpawnCoalescer<number>(flush);
    [1, 2, 3].forEach((n) => coalescer.push(n));
    expect(flush).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([1, 2, 3]);
    coalescer.push(4);
    jest.runAllTimers();
    expect(flush).toHaveBeenLastCalledWith([4]);
  });

  it("drops everything after dispose", () => {
    const flush = jest.fn();
    const coalescer = new NpcSpawnCoalescer<number>(flush);
    coalescer.push(1);
    coalescer.dispose();
    coalescer.push(2);
    jest.runAllTimers();
    expect(flush).not.toHaveBeenCalled();
  });
});

/**
 * A loader that behaves like Phaser 4's on the points that matter: one pass at a time,
 * `keyExists` skips keys already in the texture manager or queued, files load asynchronously,
 * a URL containing "404" fails with `loaderror`, `complete` fires after the pass.
 */
function fakeScene() {
  const textures = new Set<string>();
  const anims = new Set<string>();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const onceListeners = new Map<string, Array<() => void>>();
  let queue: Array<{ key: string; url: string }> = [];
  let loading = false;
  const requested: string[] = [];
  const emit = (event: string, ...args: unknown[]) => {
    (listeners.get(event) || []).slice().forEach((fn) => fn(...args));
    const once = onceListeners.get(event) || [];
    onceListeners.set(event, []);
    once.forEach((fn) => fn());
  };
  const sceneEvents = new Map<string, Array<() => void>>();
  const scene = {
    textures: {
      exists: (key: string) => textures.has(key),
      remove: (key: string) => textures.delete(key),
    },
    anims: {
      exists: (key: string) => anims.has(key),
      remove: (key: string) => anims.delete(key),
    },
    sys: {
      events: {
        once: (event: string, fn: () => void) => sceneEvents.set(event, [...(sceneEvents.get(event) || []), fn]),
        off: () => {},
      },
    },
    load: {
      isLoading: () => loading,
      spritesheet: (key: string, url: string) => {
        if (textures.has(key) || queue.some((file) => file.key === key)) return;
        queue.push({ key, url });
      },
      start: () => {
        if (loading) return;
        if (!queue.length) {
          emit("complete");
          return;
        }
        loading = true;
        const files = queue;
        queue = [];
        setTimeout(() => {
          files.forEach((file) => {
            requested.push(file.url);
            if (file.url.includes("404")) {
              emit("loaderror", { key: file.key });
            } else {
              textures.add(file.key);
              emit("filecomplete", file.key, "spritesheet");
            }
          });
          loading = false;
          emit("complete");
        }, 5);
      },
      on: (event: string, fn: (...args: unknown[]) => void) => listeners.set(event, [...(listeners.get(event) || []), fn]),
      off: (event: string, fn: (...args: unknown[]) => void) =>
        listeners.set(event, (listeners.get(event) || []).filter((entry) => entry !== fn)),
      once: (event: string, fn: () => void) => onceListeners.set(event, [...(onceListeners.get(event) || []), fn]),
    },
  };
  return {
    scene: scene as unknown as LoaderSceneLike,
    textures,
    anims,
    requested,
    shutdown: () => (sceneEvents.get("shutdown") || []).forEach((fn) => fn()),
  };
}

const sheet = (key: string, url: string) => ({ key, url, frameWidth: 48, frameHeight: 48 });

describe("loadSpritesheets", () => {
  it("loads a batch in one pass and reports a 404 as failed, not as a texture", async () => {
    const { scene, textures } = fakeScene();
    const result = await loadSpritesheets(scene, [
      sheet("npc-a", `${CDN}/a.png`),
      sheet("npc-b", `${CDN}/404.png`),
      sheet("npc-a", `${CDN}/a.png`), // duplicate key
    ]);
    expect(result.loaded).toEqual(["npc-a"]);
    expect(result.failed).toEqual(["npc-b"]);
    expect(textures.has("npc-b")).toBe(false);
  });

  it("is not confused by a pass that another spawn already started", async () => {
    const { scene, requested } = fakeScene();
    // Another caller's pass is running (the old race: a `complete` without our file).
    scene.load.spritesheet("player", `${CDN}/player.png`, { frameWidth: 48, frameHeight: 48 });
    scene.load.start();
    const [first, second] = await Promise.all([
      loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]),
      loadSpritesheets(scene, [sheet("npc-b", `${CDN}/b.png`), sheet("npc-c", `${CDN}/404-c.png`)]),
    ]);
    expect(first).toEqual({ loaded: ["npc-a"], failed: [] });
    expect(second).toEqual({ loaded: ["npc-b"], failed: ["npc-c"] });
    expect(requested).toEqual([`${CDN}/player.png`, `${CDN}/a.png`, `${CDN}/b.png`, `${CDN}/404-c.png`]);
  });

  it("skips the request for a texture that is already there with the same URL", async () => {
    const { scene, requested } = fakeScene();
    await loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]);
    const again = await loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]);
    expect(again.loaded).toEqual(["npc-a"]);
    expect(requested).toHaveLength(1);
  });

  it("replaces a texture whose URL changed under the same key, with its animations", async () => {
    const { scene, requested, anims } = fakeScene();
    await loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]);
    anims.add("npc-a_RUNNING");
    const result = await loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a-v2.png`)], { animations: ["RUNNING"] });
    expect(result.loaded).toEqual(["npc-a"]);
    expect(requested).toEqual([`${CDN}/a.png`, `${CDN}/a-v2.png`]);
    expect(anims.has("npc-a_RUNNING")).toBe(false);
  });

  it("never removes a texture a live sprite still uses, even when its URL changed (2e review)", async () => {
    const { scene, textures, anims, requested } = fakeScene();
    await loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]);
    anims.add("npc-a_RUNNING");
    const removeSpy = jest.spyOn(scene.textures, "remove");
    const pending = loadSpritesheets(scene, [sheet("npc-a", `${CDN}/404-a.png`)], {
      animations: ["RUNNING"],
      isInUse: (key) => key === "npc-a",
    });
    // Before the load settles nothing is gone.
    expect(textures.has("npc-a")).toBe(true);
    expect(anims.has("npc-a_RUNNING")).toBe(true);
    await expect(pending).resolves.toEqual({ loaded: [], failed: ["npc-a"] });
    expect(removeSpy).not.toHaveBeenCalled();
    expect(textures.has("npc-a")).toBe(true);
    expect(anims.has("npc-a_RUNNING")).toBe(true);
    expect(requested).toEqual([`${CDN}/a.png`]);
  });

  it("a re-skinned NPC loads under a new key beside the drawn one, 404 or not", async () => {
    const { scene, textures } = fakeScene();
    const cat = { _id: "64b0000000000000000000a1", spriteImg: `${CDN}/a.png` };
    const oldKey = npcTextureKey(cat);
    await loadSpritesheets(scene, [sheet(oldKey, cat.spriteImg)]);
    const removeSpy = jest.spyOn(scene.textures, "remove");

    const broken = { ...cat, spriteImg: `${CDN}/404-a.png` };
    const failed = await loadSpritesheets(scene, [sheet(npcTextureKey(broken), broken.spriteImg)]);
    expect(failed.failed).toEqual([npcTextureKey(broken)]);
    expect(textures.has(oldKey)).toBe(true);

    const winter = { ...cat, spriteImg: `${CDN}/a-winter.png` };
    const loaded = await loadSpritesheets(scene, [sheet(npcTextureKey(winter), winter.spriteImg)]);
    expect(loaded.loaded).toEqual([npcTextureKey(winter)]);
    expect(textures.has(oldKey)).toBe(true);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("removeTexture drops the texture and its animations", () => {
    const { scene, textures, anims } = fakeScene();
    textures.add("player-cat-1-x");
    anims.add("player-cat-1-x_IDLE");
    anims.add("npc-2_IDLE");
    rememberTextureSource(scene, "player-cat-1-x", "u");
    removeTexture(scene, "player-cat-1-x", ["IDLE"]);
    expect(textures.has("player-cat-1-x")).toBe(false);
    expect(anims.has("player-cat-1-x_IDLE")).toBe(false);
    expect(anims.has("npc-2_IDLE")).toBe(true);
  });

  it("settles as failed when the scene shuts down mid-load", async () => {
    const { scene, shutdown } = fakeScene();
    const pending = loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)]);
    shutdown();
    await expect(pending).resolves.toEqual({ loaded: [], failed: ["npc-a"] });
  });

  it("times out a key that never settles", async () => {
    jest.useFakeTimers();
    try {
      const { scene } = fakeScene();
      (scene.load as { start: () => void }).start = () => {}; // never loads
      const pending = loadSpritesheets(scene, [sheet("npc-a", `${CDN}/a.png`)], { timeoutMs: 1000 });
      jest.advanceTimersByTime(1000);
      await expect(pending).resolves.toEqual({ loaded: [], failed: ["npc-a"] });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("loadPlayerCatTextures (re-skin, 2e review)", () => {
  const luna = { _id: "64b0000000000000000000a1", name: "Luna", spriteImg: `${CDN}/cats/a.png` };

  it("keeps the old skin until the new one is in, then retirePrevious removes it with its animations", async () => {
    const { scene, textures, anims } = fakeScene();
    const first = await loadPlayerCatTextures(scene, luna);
    expect(first.loaded).toBe(true);
    anims.add(`${first.key}_IDLE`);

    const winter = { ...luna, spriteImg: `${CDN}/cats/a-winter.png` };
    const second = await loadPlayerCatTextures(scene, winter);
    expect(second.loaded).toBe(true);
    expect(second.key).not.toBe(first.key);
    // Both exist until the caller has swapped sprites.
    expect(textures.has(first.key)).toBe(true);
    expect(textures.has(second.key)).toBe(true);

    second.retirePrevious();
    expect(textures.has(first.key)).toBe(false);
    expect(anims.has(`${first.key}_IDLE`)).toBe(false);
    expect(textures.has(second.key)).toBe(true);
    second.retirePrevious(); // idempotent
    expect(textures.has(second.key)).toBe(true);
  });

  it("a failed re-skin leaves the current texture alone and retirePrevious is a no-op", async () => {
    const { scene, textures } = fakeScene();
    const first = await loadPlayerCatTextures(scene, luna);
    const broken = await loadPlayerCatTextures(scene, { ...luna, spriteImg: `${CDN}/cats/404.png` });
    expect(broken.loaded).toBe(false);
    broken.retirePrevious();
    expect(textures.has(first.key)).toBe(true);

    // The next good skin still retires the one that was actually on screen.
    const next = await loadPlayerCatTextures(scene, { ...luna, spriteImg: `${CDN}/cats/a-2.png` });
    next.retirePrevious();
    expect(textures.has(first.key)).toBe(false);
  });

  it("does not remove a skin that a later pick switched back to", async () => {
    const { scene, textures } = fakeScene();
    const a = await loadPlayerCatTextures(scene, luna);
    const b = await loadPlayerCatTextures(scene, { ...luna, spriteImg: `${CDN}/cats/b.png` });
    const backToA = await loadPlayerCatTextures(scene, luna);
    b.retirePrevious(); // stale: a is current again
    expect(textures.has(a.key)).toBe(true);
    backToA.retirePrevious();
    expect(textures.has(b.key)).toBe(false);
  });

  it("same skin twice: nothing to retire", async () => {
    const { scene, textures } = fakeScene();
    const a = await loadPlayerCatTextures(scene, luna);
    const again = await loadPlayerCatTextures(scene, { ...luna });
    again.retirePrevious();
    expect(textures.has(a.key)).toBe(true);
  });
});
