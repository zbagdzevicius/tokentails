/**
 * Paw Match font gate (plan G12 acceptance: "no Text created before fonts resolve under a 3 s
 * delay"). Phaser runs a scene's `create()` only after every file its `preload()` queued has
 * completed, so the gate holds when (1) the fonts file is the first thing preload queues and (2)
 * that file completes only once `loadGameFonts()` settles, even 3 s later. Phaser itself is
 * replaced by a minimal stand-in so the real scene module runs in Node.
 */
jest.mock("phaser", () => {
  class File {
    loader: unknown;
    type: string;
    key: string;
    state = 0;
    data: unknown;
    constructor(loader: unknown, config: { type: string; key: string }) {
      this.loader = loader;
      this.type = config.type;
      this.key = config.key;
    }
  }
  class Scene {
    constructor(public key?: string) {}
  }
  const Phaser = { Loader: { File, FILE_LOADING: 3 }, Scene };
  return { __esModule: true, default: Phaser, ...Phaser };
});

jest.mock("@/components/typography/loadGameFonts", () => ({
  loadGameFonts: jest.fn(),
}));

import { loadGameFonts, type GameFontLoadResult } from "@/components/typography/loadGameFonts";
import { TTFontsFile } from "@/components/Phaser/typography/TTFontsFile";
import { Match3Scene } from "@/components/Match3/scenes/Match3Scene";

const READY: GameFontLoadResult = { status: "ready", loaded: ["400 Bebas Neue"], missing: [], timedOut: false, durationMs: 3000 };

function fakeScene() {
  const calls: Array<{ kind: string; arg: unknown }> = [];
  const files: unknown[] = [];
  const loader = {
    image: jest.fn((key: string) => calls.push({ kind: "image", arg: key })),
    addFile: jest.fn((file: unknown) => {
      calls.push({ kind: "addFile", arg: file });
      files.push(file);
    }),
    keyExists: jest.fn(() => false),
    nextFile: jest.fn(),
    systems: { registry: { set: jest.fn() } },
  };
  const game = { events: { on: jest.fn(), once: jest.fn(), off: jest.fn(), emit: jest.fn() } };
  const scene = new Match3Scene() as unknown as { preload(): void; load: typeof loader; sys: { game: typeof game } };
  scene.load = loader;
  scene.sys = { game };
  return { scene, loader, calls, files };
}

describe("Match3Scene font gate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("queues the brand fonts before any other file", () => {
    (loadGameFonts as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { scene, calls } = fakeScene();
    scene.preload();
    expect(calls[0].kind).toBe("addFile");
    expect(calls[0].arg).toBeInstanceOf(TTFontsFile);
    // The catnip art loads too: the 16 px objective master and the 64 px tile (plan G8).
    const images = calls.filter((c) => c.kind === "image").map((c) => c.arg);
    expect(images).toContain("match3-catnip-icon-16");
  });

  it("holds the loader (and so create) for a 3 s font delay, then completes as a success", async () => {
    (loadGameFonts as jest.Mock).mockImplementation(
      () => new Promise<GameFontLoadResult>((resolve) => setTimeout(() => resolve(READY), 3000)),
    );
    const { scene, loader, files } = fakeScene();
    scene.preload();
    const fontsFile = files[0] as TTFontsFile;
    fontsFile.load();

    jest.advanceTimersByTime(2999);
    await Promise.resolve();
    expect(loader.nextFile).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(loader.nextFile).toHaveBeenCalledWith(fontsFile, true);
  });
});
