import {
  getLookVersionOverride,
  getReducedMotionOverride,
  getRenderTierSetting,
  isReducedMotion,
  LOOK_SETTINGS_EVENT,
  LOOK_VERSION_ALIAS_KEY,
  LOOK_VERSION_KEY,
  REDUCED_MOTION_KEY,
  setLookVersionOverride,
  setReducedMotionOverride,
  setRenderTierSetting,
} from "@/components/Phaser/look/settings";
import { resetMemorySettings } from "@/components/Phaser/look/storage";
import { RENDER_SETTING_KEY, resolveRenderProfile } from "@/components/Phaser/look/tier";

// G7 "Render tiers": Auto / High / Low and reduced motion are separate settings, and both work
// with storage blocked (decision #84; task 6c's GameOptionsModal imports these).

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
};

const blocked = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const media = (reduce: boolean) => ({ matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) }) as unknown as Window;

beforeEach(() => resetMemorySettings());

describe("graphics setting (Auto / High / Low)", () => {
  it("persists in storage and clears on auto", () => {
    const storage = memoryStorage();
    expect(getRenderTierSetting(storage)).toBe("auto");
    expect(setRenderTierSetting("low", storage)).toBe(true);
    expect(storage.data.get(RENDER_SETTING_KEY)).toBe("low");
    expect(getRenderTierSetting(storage)).toBe("low");
    expect(setRenderTierSetting("auto", storage)).toBe(true);
    expect(storage.data.has(RENDER_SETTING_KEY)).toBe(false);
  });

  it("works with storage blocked: kept in memory for the page and used by the next mount", () => {
    expect(getRenderTierSetting(blocked)).toBe("auto");
    expect(setRenderTierSetting("high", blocked)).toBe(false);
    expect(getRenderTierSetting(blocked)).toBe("high");
    expect(getRenderTierSetting(null)).toBe("high");
    // The game config reads the page's own storage; with none, the memory value applies.
    const win = { navigator: { hardwareConcurrency: 4 }, devicePixelRatio: 2 } as unknown as Window;
    const profile = resolveRenderProfile({ win });
    expect(profile.setting).toBe("high");
    expect(profile.tier).toBe("HIGH");
  });

  it("drops junk values", () => {
    const storage = memoryStorage();
    storage.setItem(RENDER_SETTING_KEY, "ultra");
    expect(getRenderTierSetting(storage)).toBe("auto");
  });
});

describe("reduced motion (separate from the tier)", () => {
  it("follows the system unless overridden", () => {
    const storage = memoryStorage();
    expect(getReducedMotionOverride(storage)).toBe("system");
    expect(isReducedMotion(media(true), storage)).toBe(true);
    expect(isReducedMotion(media(false), storage)).toBe(false);
    setReducedMotionOverride("on", storage);
    expect(storage.data.get(REDUCED_MOTION_KEY)).toBe("on");
    expect(isReducedMotion(media(false), storage)).toBe(true);
    setReducedMotionOverride("off", storage);
    expect(isReducedMotion(media(true), storage)).toBe(false);
    setReducedMotionOverride("system", storage);
    expect(storage.data.has(REDUCED_MOTION_KEY)).toBe(false);
  });

  it("works with storage blocked and with no matchMedia", () => {
    expect(isReducedMotion(null, blocked)).toBe(false);
    expect(setReducedMotionOverride("on", blocked)).toBe(false);
    expect(isReducedMotion(null, blocked)).toBe(true);
    const throwing = { matchMedia: () => { throw new Error("nope"); } } as unknown as Window;
    setReducedMotionOverride("system", blocked);
    expect(isReducedMotion(throwing, blocked)).toBe(false);
  });
});

describe("look version override (decision #51)", () => {
  it("reads the override, then the alias the manifest's rollback note uses", () => {
    const storage = memoryStorage();
    expect(getLookVersionOverride(storage)).toBeNull();
    storage.setItem(LOOK_VERSION_ALIAS_KEY, "v0");
    expect(getLookVersionOverride(storage)).toBe("v0");
    setLookVersionOverride("v1", storage);
    expect(storage.data.get(LOOK_VERSION_KEY)).toBe("v1");
    expect(getLookVersionOverride(storage)).toBe("v1");
    setLookVersionOverride(null, storage);
    expect(getLookVersionOverride(storage)).toBeNull();
    storage.setItem(LOOK_VERSION_KEY, "v9");
    expect(getLookVersionOverride(storage)).toBeNull();
  });

  it("announces every change on window", () => {
    const events: string[] = [];
    const target = new EventTarget();
    (globalThis as unknown as { window: EventTarget }).window = target;
    target.addEventListener(LOOK_SETTINGS_EVENT, (event) => events.push(event.type));
    try {
      setRenderTierSetting("low", memoryStorage());
      setReducedMotionOverride("on", memoryStorage());
      setLookVersionOverride("v0", memoryStorage());
      expect(events).toEqual([LOOK_SETTINGS_EVENT, LOOK_SETTINGS_EVENT, LOOK_SETTINGS_EVENT]);
    } finally {
      delete (globalThis as unknown as { window?: EventTarget }).window;
    }
  });
});
