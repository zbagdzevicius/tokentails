import {
  ALLOW_DPR_3,
  applySetting,
  capDpr,
  detectTier,
  dprCap,
  readRenderSetting,
  RENDER_SETTING_KEY,
  resolveRenderProfile,
  writeRenderSetting,
} from "@/components/Phaser/look/tier";

/** A window-shaped stub: navigator signals and a device pixel ratio. */
function fakeWindow(options: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  dpr?: number;
}) {
  return {
    devicePixelRatio: options.dpr ?? 1,
    navigator: {
      deviceMemory: options.deviceMemory,
      hardwareConcurrency: options.hardwareConcurrency,
      connection: options.saveData === undefined ? undefined : { saveData: options.saveData },
    },
  } as unknown as Window;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceeded");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("render tier detection", () => {
  it.each([
    [{ deviceMemory: 2, hardwareConcurrency: 8 }, "LOW"],
    [{ deviceMemory: 4, hardwareConcurrency: 8 }, "LOW"],
    [{ deviceMemory: 8, hardwareConcurrency: 2 }, "LOW"],
    [{ deviceMemory: 8, hardwareConcurrency: 8, saveData: true }, "LOW"],
    [{ deviceMemory: 8, hardwareConcurrency: 8 }, "HIGH"],
    [{ hardwareConcurrency: 8 }, "HIGH"], // Safari: no memory reported
    [{ deviceMemory: 8, hardwareConcurrency: 4 }, "MID"],
    [{ hardwareConcurrency: 6 }, "MID"],
    [{}, "MID"],
  ] as const)("%j -> %s", (signals, tier) => {
    expect(detectTier(signals)).toBe(tier);
  });

  it("the player's setting overrides detection", () => {
    expect(applySetting("LOW", "high")).toBe("HIGH");
    expect(applySetting("HIGH", "low")).toBe("LOW");
    expect(applySetting("MID", "auto")).toBe("MID");
  });
});

describe("dpr cap (decision #84)", () => {
  it("never allows 3 by default", () => {
    expect(ALLOW_DPR_3).toBe(false);
    expect(capDpr(3, "HIGH")).toBe(2);
    expect(capDpr(3, "MID")).toBe(2);
    expect(capDpr(3, "LOW", 8)).toBe(2);
  });

  it("caps LOW at 1.5 when deviceMemory <= 4", () => {
    expect(dprCap("LOW", 4)).toBe(1.5);
    expect(dprCap("LOW", 2)).toBe(1.5);
    expect(dprCap("LOW", 8)).toBe(2);
    expect(dprCap("LOW")).toBe(2);
    expect(capDpr(2.75, "LOW", 4)).toBe(1.5);
    // MID and HIGH ignore memory.
    expect(dprCap("MID", 4)).toBe(2);
  });

  it("keeps lower ratios and never goes below 1", () => {
    expect(capDpr(1.25, "MID")).toBe(1.25);
    expect(capDpr(1, "HIGH")).toBe(1);
    expect(capDpr(0.8, "HIGH")).toBe(1);
    expect(capDpr(Number.NaN, "HIGH")).toBe(1);
  });

  it("resolves a low-memory Android phone to LOW at 1.5", () => {
    const profile = resolveRenderProfile({
      win: fakeWindow({ deviceMemory: 4, hardwareConcurrency: 8, dpr: 2.625 }),
      storage: memoryStorage(),
    });
    expect(profile).toMatchObject({ tier: "LOW", detectedTier: "LOW", setting: "auto", rawDpr: 2.625, dpr: 1.5 });
  });

  it("resolves an iPhone (no deviceMemory) at 3x to 2", () => {
    const profile = resolveRenderProfile({
      win: fakeWindow({ hardwareConcurrency: 6, dpr: 3 }),
      storage: memoryStorage(),
    });
    expect(profile.tier).toBe("MID");
    expect(profile.dpr).toBe(2);
  });

  it("a High setting on a low-memory phone lifts the 1.5 cap to 2", () => {
    const profile = resolveRenderProfile({
      win: fakeWindow({ deviceMemory: 4, dpr: 3 }),
      storage: memoryStorage({ [RENDER_SETTING_KEY]: "high" }),
    });
    expect(profile).toMatchObject({ tier: "HIGH", detectedTier: "LOW", setting: "high", dpr: 2 });
  });

  it("an explicit Low setting caps at 1.5 even where auto LOW would allow 2", () => {
    expect(dprCap("LOW", 8, "low")).toBe(1.5);
    expect(dprCap("LOW", undefined, "low")).toBe(1.5);
    expect(dprCap("LOW", 8, "auto")).toBe(2);
    expect(capDpr(3, "LOW", undefined, "low")).toBe(1.5);
    expect(capDpr(1.25, "LOW", undefined, "low")).toBe(1.25);
    // iPhone (no deviceMemory), 3x, player picked Low: Low is no longer the same as High.
    const low = resolveRenderProfile({
      win: fakeWindow({ hardwareConcurrency: 6, dpr: 3 }),
      storage: memoryStorage({ [RENDER_SETTING_KEY]: "low" }),
    });
    expect(low).toMatchObject({ tier: "LOW", detectedTier: "MID", setting: "low", dpr: 1.5 });
    const high = resolveRenderProfile({
      win: fakeWindow({ hardwareConcurrency: 6, dpr: 3 }),
      storage: memoryStorage({ [RENDER_SETTING_KEY]: "high" }),
    });
    expect(high.dpr).toBe(2);
  });

  it("works on the server (no window)", () => {
    expect(resolveRenderProfile({ win: null, storage: null })).toMatchObject({ dpr: 1, rawDpr: 1, setting: "auto" });
  });
});

describe("render setting storage", () => {
  it("reads, writes and clears the setting", () => {
    const storage = memoryStorage();
    expect(readRenderSetting(storage)).toBe("auto");
    expect(writeRenderSetting("low", storage)).toBe(true);
    expect(storage.data.get(RENDER_SETTING_KEY)).toBe("low");
    expect(readRenderSetting(storage)).toBe("low");
    expect(writeRenderSetting("auto", storage)).toBe(true);
    expect(storage.data.has(RENDER_SETTING_KEY)).toBe(false);
  });

  it("ignores junk and survives storage that throws", () => {
    expect(readRenderSetting(memoryStorage({ [RENDER_SETTING_KEY]: "ultra" }))).toBe("auto");
    expect(readRenderSetting(throwingStorage)).toBe("auto");
    expect(writeRenderSetting("high", throwingStorage)).toBe(false);
    expect(writeRenderSetting("high", null)).toBe(false);
    expect(
      resolveRenderProfile({ win: fakeWindow({ dpr: 2 }), storage: throwingStorage }).setting,
    ).toBe("auto");
  });
});
