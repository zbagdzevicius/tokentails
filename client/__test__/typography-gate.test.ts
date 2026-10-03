/**
 * The Phaser font gate (plan F4): TTFontsFile holds the scene's loader, and so `create()`, until
 * the brand faces settle. Phaser itself is replaced by a minimal Loader.File so the gate's own
 * logic runs in Node.
 */
jest.mock("phaser", () => {
  class File {
    loader: unknown;
    type: string;
    key: string;
    url: string;
    state = 0;
    data: unknown;
    constructor(loader: unknown, config: { type: string; key: string; url: string }) {
      this.loader = loader;
      this.type = config.type;
      this.key = config.key;
      this.url = config.url;
    }
  }
  const Phaser = { Loader: { File, FILE_LOADING: 3 } };
  return { __esModule: true, default: Phaser, ...Phaser };
});

jest.mock("@/components/typography/loadGameFonts", () => ({
  loadGameFonts: jest.fn(),
}));

import { loadGameFonts, type GameFontLoadResult } from "@/components/typography/loadGameFonts";
import {
  TTFontsFile,
  TT_FONTS_FILE_KEY,
  TT_FONTS_FILE_TYPE,
  TT_FONTS_RESULT_KEY,
  preloadTTFonts,
} from "@/components/Phaser/typography/TTFontsFile";

const READY: GameFontLoadResult = { status: "ready", loaded: ["900 Passion One"], missing: [], timedOut: false, durationMs: 12 };

function fakeLoader() {
  const registry = new Map<string, unknown>();
  const files: TTFontsFile[] = [];
  const loader = {
    nextFile: jest.fn(),
    systems: { registry: { set: (key: string, value: unknown) => registry.set(key, value) } },
    addFile: jest.fn((file: TTFontsFile) => files.push(file)),
    keyExists: jest.fn((file: TTFontsFile) => files.some((f) => f.key === file.key && f.type === file.type)),
  };
  return { loader, registry, files };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("TTFontsFile", () => {
  it("completes only after the fonts settle, and always as a success", async () => {
    let resolve!: (r: GameFontLoadResult) => void;
    const { loader, registry } = fakeLoader();
    const file = new TTFontsFile(loader as never, TT_FONTS_FILE_KEY, () => new Promise((r) => (resolve = r)));
    expect(file.type).toBe(TT_FONTS_FILE_TYPE);

    file.load();
    await flush();
    expect(loader.nextFile).not.toHaveBeenCalled();

    const fallback = { ...READY, status: "fallback" as const, missing: ["400 Bebas Neue"], loaded: [] };
    resolve(fallback);
    await flush();
    expect(loader.nextFile).toHaveBeenCalledTimes(1);
    expect(loader.nextFile).toHaveBeenCalledWith(file, true);
    expect(file.result).toBe(fallback);
    expect(registry.get(TT_FONTS_RESULT_KEY)).toBe(fallback);
  });

  it("still releases the scene if the loader function rejects", async () => {
    const { loader } = fakeLoader();
    const file = new TTFontsFile(loader as never, TT_FONTS_FILE_KEY, () => Promise.reject(new Error("boom")));
    file.load();
    await flush();
    expect(loader.nextFile).toHaveBeenCalledWith(file, true);
    expect(file.result).toBeNull();
  });

  it("adds nothing to a cache", () => {
    const { loader } = fakeLoader();
    const file = new TTFontsFile(loader as never);
    expect(() => file.addToCache()).not.toThrow();
  });
});

describe("preloadTTFonts", () => {
  it("queues one gate per load and installs healing on the game", async () => {
    (loadGameFonts as jest.Mock).mockResolvedValue(READY);
    const { loader, files } = fakeLoader();
    const game = { events: { emit: jest.fn(), once: jest.fn() } };
    const scene = { load: loader, sys: { game } };
    const fonts = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    (globalThis as { document?: unknown }).document = { fonts };

    preloadTTFonts(scene as never);
    preloadTTFonts(scene as never);
    expect(files).toHaveLength(1);
    expect(game.events.once).toHaveBeenCalledWith("destroy", expect.any(Function));
    expect(fonts.addEventListener).toHaveBeenCalledTimes(1);
    expect(fonts.addEventListener).toHaveBeenCalledWith("loadingdone", expect.any(Function));
    delete (globalThis as { document?: unknown }).document;

    files[0].load();
    await flush();
    expect(loadGameFonts).toHaveBeenCalledTimes(1);
    expect(loader.nextFile).toHaveBeenCalledWith(files[0], true);
  });
});
