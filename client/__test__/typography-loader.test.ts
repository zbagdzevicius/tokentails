import { createAnalytics, type AnalyticsClient, type ConsentState } from "@/analytics";
import {
  GAME_FONT_RETRIES,
  GAME_FONT_TIMEOUT_MS,
  createGameFontLoader,
  LATIN_EXT_SAMPLE,
  LATIN_SAMPLE,
  faceDescriptor,
  type FontSetLike,
} from "@/components/typography/loadGameFonts";

type Mode = "loaded" | "undeclared" | "error" | "hang";

/**
 * A FontFaceSet stand-in: `behaviour` says how the latin load of a descriptor settles, `ext` how
 * the latin-ext one does (loaded by default). `calls` lists the latin loads, `extCalls` the others.
 */
function fakeFontSet(
  behaviour: (font: string) => Mode,
  ext: (font: string) => Mode = () => "loaded",
): FontSetLike & {
  calls: string[];
  extCalls: string[];
} {
  const calls: string[] = [];
  const extCalls: string[] = [];
  return {
    calls,
    extCalls,
    load(font: string, text?: string) {
      const isExt = text === LATIN_EXT_SAMPLE;
      (isExt ? extCalls : calls).push(font);
      if (!isExt) expect(text).toBe(LATIN_SAMPLE);
      const mode = isExt ? ext(font) : behaviour(font);
      if (mode === "loaded") return Promise.resolve([{ family: font }]);
      if (mode === "undeclared") return Promise.resolve([]);
      if (mode === "error") return Promise.reject(new Error("network"));
      return new Promise(() => {});
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("loadGameFonts (plan F4)", () => {
  it("loads every role face with document.fonts.load and reports ready", async () => {
    const fonts = fakeFontSet(() => "loaded");
    const track = jest.fn();
    const loader = createGameFontLoader({ fontSet: () => fonts, track });
    const result = await loader.load();
    expect(result.status).toBe("ready");
    expect(result.missing).toEqual([]);
    expect(result.loaded).toEqual(["900 Passion One", "400 Bebas Neue", "700 Nunito", "800 Nunito"]);
    expect(fonts.calls).toEqual([
      faceDescriptor("Passion One", 900),
      faceDescriptor("Bebas Neue", 400),
      faceDescriptor("Nunito", 700),
      faceDescriptor("Nunito", 800),
    ]);
    expect(fonts.extCalls).toEqual(fonts.calls);
    expect(track).not.toHaveBeenCalled();
  });

  it("waits for the latin-ext (Lithuanian) files before resolving", async () => {
    let releaseExt: () => void = () => {};
    const extGate = new Promise<void>((resolve) => {
      releaseExt = resolve;
    });
    const fonts: FontSetLike = {
      load: (_font, text) =>
        text === LATIN_EXT_SAMPLE ? extGate.then(() => [{}]) : Promise.resolve([{}]),
    };
    let settled = false;
    const pending = createGameFontLoader({ fontSet: () => fonts, track: jest.fn() })
      .load()
      .then((r) => {
        settled = true;
        return r;
      });
    await flush();
    expect(settled).toBe(false);
    releaseExt();
    await expect(pending).resolves.toMatchObject({ status: "ready" });
  });

  it("a failed latin-ext load does not mark the face missing or send an event", async () => {
    const track = jest.fn();
    const fonts = fakeFontSet(() => "loaded", () => "error");
    const result = await createGameFontLoader({ fontSet: () => fonts, track }).load();
    expect(result).toMatchObject({ status: "ready", missing: [] });
    expect(track).not.toHaveBeenCalled();
  });

  it("is memoised: one set of loads however many callers", async () => {
    const fonts = fakeFontSet(() => "loaded");
    const loader = createGameFontLoader({ fontSet: () => fonts, track: jest.fn() });
    const [a, b] = await Promise.all([loader.load(), loader.load()]);
    await loader.load();
    expect(a).toBe(b);
    expect(fonts.calls).toHaveLength(4);
    expect(loader.result()).toBe(a);
  });

  it("is SSR-safe: without document.fonts it resolves unsupported and memoises nothing", async () => {
    const env: { fonts?: FontSetLike } = {};
    const loader = createGameFontLoader({ fontSet: () => env.fonts, track: jest.fn() });
    await expect(loader.load()).resolves.toMatchObject({ status: "unsupported", missing: [] });
    env.fonts = fakeFontSet(() => "loaded");
    await expect(loader.load()).resolves.toMatchObject({ status: "ready" });
  });

  it("detects an undeclared face (load resolves with no faces), which check() would miss", async () => {
    const track = jest.fn();
    const fonts = fakeFontSet((font) => (font.includes("Bebas") ? "undeclared" : "loaded"));
    const result = await createGameFontLoader({ fontSet: () => fonts, track }).load();
    expect(result.status).toBe("fallback");
    expect(result.missing).toEqual(["400 Bebas Neue"]);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith({
      name: "game_font_fallback",
      properties: { font: "400 Bebas Neue", role: "hud" },
    });
  });

  it("treats a failed load as missing and never rejects", async () => {
    const track = jest.fn();
    const fonts = fakeFontSet((font) => (font.includes("800") ? "error" : "loaded"));
    const result = await createGameFontLoader({ fontSet: () => fonts, track }).load();
    expect(result).toMatchObject({ status: "fallback", missing: ["800 Nunito"], timedOut: false });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("survives a font set whose load throws synchronously", async () => {
    const fonts: FontSetLike = {
      load() {
        throw new Error("SecurityError");
      },
    };
    const result = await createGameFontLoader({ fontSet: () => fonts, track: jest.fn() }).load();
    expect(result.status).toBe("fallback");
    expect(result.missing).toHaveLength(4);
  });

  describe("with a stalled face", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("gives up at 3000 ms, starts on the fallbacks and reports one event", async () => {
      expect(GAME_FONT_TIMEOUT_MS).toBe(3000);
      const track = jest.fn();
      const fonts = fakeFontSet((font) => (font.includes("Passion") ? "hang" : "loaded"));
      const loader = createGameFontLoader({ fontSet: () => fonts, track });
      const done = jest.fn();
      void loader.load().then(done);

      await flush();
      jest.advanceTimersByTime(2999);
      await flush();
      expect(done).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await flush();
      expect(done).toHaveBeenCalledWith(
        expect.objectContaining({ status: "fallback", timedOut: true, missing: ["900 Passion One"] }),
      );
      expect(track).toHaveBeenCalledTimes(1);
      expect(track.mock.calls[0][0]).toEqual({
        name: "game_font_fallback",
        properties: { font: "900 Passion One", role: "title" },
      });
    });
  });

  it("sends exactly one event for several missing faces and repeated loads", async () => {
    const track = jest.fn();
    const fonts = fakeFontSet((font) => (font.includes("Nunito") ? "undeclared" : "loaded"));
    const loader = createGameFontLoader({ fontSet: () => fonts, track });
    await loader.load();
    await loader.load();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0].properties).toEqual({ font: "700 Nunito, 800 Nunito", role: "caption" });
  });

  it("retries only the missing faces after a fallback, still sending one event", async () => {
    const track = jest.fn();
    let networkUp = false;
    const fonts = fakeFontSet((font) => (font.includes("Bebas") && !networkUp ? "error" : "loaded"));
    const loader = createGameFontLoader({ fontSet: () => fonts, track });
    const first = await loader.load();
    expect(first).toMatchObject({ status: "fallback", missing: ["400 Bebas Neue"] });
    const firstCalls = fonts.calls.length;

    networkUp = true;
    const second = await loader.load();
    expect(second).toMatchObject({ status: "ready", missing: [] });
    expect(second.loaded).toEqual(expect.arrayContaining(first.loaded));
    expect(fonts.calls.slice(firstCalls)).toEqual([faceDescriptor("Bebas Neue", 400)]);
    expect(loader.result()).toBe(second);
    expect(track).toHaveBeenCalledTimes(1);

    // Ready is memoised: no further loads.
    expect(await loader.load()).toBe(second);
    expect(fonts.calls.length).toBe(firstCalls + 1);
  });

  it("stops retrying after GAME_FONT_RETRIES fallbacks", async () => {
    expect(GAME_FONT_RETRIES).toBe(2);
    const fonts = fakeFontSet((font) => (font.includes("Bebas") ? "error" : "loaded"));
    const loader = createGameFontLoader({ fontSet: () => fonts, track: jest.fn() });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await loader.load());
    const bebasCalls = fonts.calls.filter((font) => font.includes("Bebas"));
    expect(bebasCalls).toHaveLength(1 + GAME_FONT_RETRIES);
    expect(results[4]).toBe(results[3]);
    expect(results[4]).toMatchObject({ status: "fallback" });
  });

  it("never lets telemetry break the gate", async () => {
    const fonts = fakeFontSet(() => "undeclared");
    const loader = createGameFontLoader({
      fontSet: () => fonts,
      track: () => {
        throw new Error("analytics down");
      },
    });
    await expect(loader.load()).resolves.toMatchObject({ status: "fallback" });
  });
});

describe("game_font_fallback is consent-gated", () => {
  const setup = (consent: ConsentState) => {
    const capture = jest.fn();
    const client: AnalyticsClient = {
      capture,
      register: jest.fn(),
      opt_in_capturing: jest.fn(),
      opt_out_capturing: jest.fn(),
      has_opted_out_capturing: () => false,
      reset: jest.fn(),
    };
    const load = jest.fn(async () => client);
    const analytics = createAnalytics({
      apiKey: "phc_test",
      load,
      superProperties: () => ({ app: "core", platform: "web", device_tier: "high" }),
      readConsent: () => consent,
      writeConsent: jest.fn(),
    });
    const fonts = fakeFontSet((font) => (font.includes("Bebas") ? "undeclared" : "loaded"));
    const loader = createGameFontLoader({ fontSet: () => fonts, track: analytics.track });
    return { capture, load, loader };
  };

  it("sends nothing without consent (and never loads the analytics client)", async () => {
    for (const consent of ["unset", "denied"] as const) {
      const { capture, load, loader } = setup(consent);
      await loader.load();
      await flush();
      expect(load).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    }
  });

  it("sends exactly one event with consent", async () => {
    const { capture, loader } = setup("granted");
    await loader.load();
    await loader.load();
    await flush();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("game_font_fallback", { font: "400 Bebas Neue", role: "hud" });
  });
});
