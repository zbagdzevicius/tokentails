/**
 * @jest-environment jsdom
 */
import {
  backingSize,
  CANVAS_PIXEL_RATIO,
  E2E_FLAG,
  E2E_GAMES,
  installLookResize,
  LOOK_RESIZE,
  makeGameConfig,
  RENDER_TIER,
  RESIZE_DEBOUNCE_MS,
  type LookGame,
  type LookResizeEvent,
} from "@/components/Phaser/look/makeGameConfig";
import { fitCssCamera, setCssScroll, setCssZoom } from "@/components/Phaser/look/camera";
import {
  installTextCrispness,
  refreshTextCrispness,
  textResolutionFor,
} from "@/components/Phaser/look/text";
import type { RenderProfile } from "@/components/Phaser/look/tier";
import type { Types } from "phaser";

const profile = (dpr: number, overrides: Partial<RenderProfile> = {}): RenderProfile => ({
  tier: "MID",
  detectedTier: "MID",
  setting: "auto",
  rawDpr: dpr,
  dpr,
  ...overrides,
});

const base: Types.Core.GameConfig = {
  type: 2,
  parent: "game-container",
  pixelArt: true,
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 600 } } },
};

/** A registry, scale manager, event bus and one camera: the surface makeGameConfig touches. */
function fakeGame(width: number, height: number) {
  const registry = new Map<string, unknown>();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const camera = {
    zoomX: 2,
    zoomY: 2,
    setZoom(x: number, y?: number) {
      camera.zoomX = x;
      camera.zoomY = y ?? x;
    },
  };
  const canvas = document.createElement("canvas");
  const game = {
    registry: { set: (key: string, value: unknown) => registry.set(key, value), get: (key: string) => registry.get(key) },
    canvas,
    scale: {
      width,
      height,
      zoom: 1,
      resize: jest.fn((w: number, h: number) => {
        game.scale.width = w;
        game.scale.height = h;
        canvas.width = w;
        canvas.height = h;
      }),
      setZoom: jest.fn((zoom: number) => {
        game.scale.zoom = zoom;
      }),
    },
    events: {
      emit: (event: string, ...args: unknown[]) => (listeners.get(event) || []).forEach((fn) => fn(...args)),
      once: (event: string, fn: () => void) => listeners.set(event, [...(listeners.get(event) || []), fn]),
      on: (event: string, fn: (...args: unknown[]) => void) => listeners.set(event, [...(listeners.get(event) || []), fn]),
    },
    scene: { getScenes: () => [{ cameras: { cameras: [camera] } }] },
  };
  return { game: game as typeof game & LookGame, registry, camera, canvas };
}

function setViewport(width: number, height: number, dpr: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: dpr });
}

describe("makeGameConfig sizes", () => {
  it.each([
    [390, 844, 2, 780, 1688],
    [390, 844, 1.5, 585, 1266],
    [1440, 900, 1, 1440, 900],
    [360, 740, 1.5, 540, 1110],
    [375, 667, 1.25, 469, 834], // rounded, not floored
  ])("%ix%i at dpr %d -> %ix%i backing, zoom 1/dpr", (w, h, dpr, bw, bh) => {
    const config = makeGameConfig(base, { profile: profile(dpr), size: { width: w, height: h }, resize: false });
    expect(config.width).toBe(bw);
    expect(config.height).toBe(bh);
    expect(config.scale?.mode).toBe(0); // Phaser.Scale.NONE
    expect(config.scale?.zoom).toBeCloseTo(1 / dpr);
    // CSS size = backing x zoom stays the viewport (within rounding)
    expect(Math.abs((config.width as number) * (config.scale!.zoom as number) - w)).toBeLessThan(1);
  });

  it("keeps the caller's keys and keeps Arcade bounds at the CSS size", () => {
    const config = makeGameConfig(base, { profile: profile(2), size: { width: 390, height: 844 }, resize: false });
    expect(config.parent).toBe("game-container");
    expect(config.pixelArt).toBe(true);
    expect(config.physics?.arcade).toMatchObject({ width: 390, height: 844, gravity: { x: 0, y: 600 } });
    // Explicit bounds win.
    const explicit = makeGameConfig(
      { ...base, physics: { default: "arcade", arcade: { width: 5000, height: 100 } } },
      { profile: profile(2), size: { width: 390, height: 844 }, resize: false },
    );
    expect(explicit.physics?.arcade).toMatchObject({ width: 5000, height: 100 });
    // No physics stays no physics.
    expect(makeGameConfig({ type: 2 }, { profile: profile(1), size: { width: 10, height: 10 }, resize: false }).physics).toBeUndefined();
  });

  it("sets canvasPixelRatio and the tier on boot and chains the caller's callbacks", () => {
    const preBoot = jest.fn();
    const postBoot = jest.fn();
    const config = makeGameConfig(
      { ...base, callbacks: { preBoot, postBoot } },
      { profile: profile(1.5, { tier: "LOW" }), size: { width: 360, height: 740 }, resize: false },
    );
    const { game, registry, canvas } = fakeGame(540, 1110);
    const phaserGame = Object.assign(game, { scene: { scenes: [] } });
    config.callbacks!.preBoot!(phaserGame as never);
    config.callbacks!.postBoot!(phaserGame as never);
    expect(registry.get(CANVAS_PIXEL_RATIO)).toBe(1.5);
    expect(registry.get(RENDER_TIER)).toBe("LOW");
    expect(preBoot).toHaveBeenCalledTimes(1);
    expect(postBoot).toHaveBeenCalledTimes(1);
    expect(canvas.style.width).toBe("360px");
    expect(canvas.style.height).toBe("740px");
  });

  it("lists booted games on window only when an e2e run set the flag", () => {
    const target = window as unknown as Record<string, unknown>;
    const boot = () => {
      const config = makeGameConfig(base, { profile: profile(2), size: { width: 390, height: 844 }, win: window, resize: false });
      const { game } = fakeGame(780, 1688);
      const phaserGame = Object.assign(game, { scene: { scenes: [] } });
      config.callbacks!.postBoot!(phaserGame as never);
      return phaserGame;
    };
    delete target[E2E_FLAG];
    delete target[E2E_GAMES];
    boot();
    expect(target[E2E_GAMES]).toBeUndefined();

    target[E2E_FLAG] = true;
    const first = boot();
    const second = boot();
    expect(target[E2E_GAMES]).toEqual([first, second]);
    delete target[E2E_FLAG];
    delete target[E2E_GAMES];
  });

  it("backingSize is at least 1x1", () => {
    expect(backingSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});

describe("LOOK_RESIZE", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("debounces, resizes the backing store to CSS x capped dpr, and emits once", () => {
    setViewport(390, 844, 3);
    const { game, registry, canvas } = fakeGame(780, 1688);
    registry.set(CANVAS_PIXEL_RATIO, 2);
    const events: LookResizeEvent[] = [];
    game.events.on(LOOK_RESIZE, (event) => events.push(event as LookResizeEvent));
    installLookResize(game, profile(2), { width: 390, height: 844 }, window);

    setViewport(844, 390, 3);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("orientationchange"));
    jest.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1);
    expect(game.scale.resize).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(game.scale.resize).toHaveBeenCalledTimes(1);
    expect(game.scale.resize).toHaveBeenCalledWith(1688, 780);
    expect(game.scale.setZoom).not.toHaveBeenCalled();
    expect(canvas.width).toBe(1688);
    expect(canvas.style.width).toBe("844px");
    expect(canvas.style.height).toBe("390px");
    expect(events).toEqual([
      expect.objectContaining({ width: 844, height: 390, dpr: 2, previousDpr: 2, backingWidth: 1688, backingHeight: 780 }),
    ]);

    // Same size again: nothing happens.
    window.dispatchEvent(new Event("resize"));
    jest.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    expect(game.scale.resize).toHaveBeenCalledTimes(1);
  });

  it("a ratio change sets the new zoom and rescales cameras so the world view is unchanged", () => {
    setViewport(1440, 900, 1);
    const { game, registry, camera } = fakeGame(1440, 900);
    registry.set(CANVAS_PIXEL_RATIO, 1);
    installLookResize(game, profile(1), { width: 1440, height: 900 }, window);

    setViewport(1440, 900, 2);
    window.dispatchEvent(new Event("resize"));
    jest.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    expect(game.scale.setZoom).toHaveBeenCalledWith(0.5);
    expect(game.scale.resize).toHaveBeenCalledWith(2880, 1800);
    expect(registry.get(CANVAS_PIXEL_RATIO)).toBe(2);
    expect(camera.zoomX).toBe(4); // was 2 at dpr 1
  });

  it("stops listening when the game is destroyed", () => {
    setViewport(390, 844, 2);
    const { game } = fakeGame(780, 1688);
    installLookResize(game, profile(2), { width: 390, height: 844 }, window);
    window.dispatchEvent(new Event("resize"));
    game.events.emit("destroy");
    setViewport(400, 800, 2);
    window.dispatchEvent(new Event("resize"));
    jest.advanceTimersByTime(RESIZE_DEBOUNCE_MS * 2);
    expect(game.scale.resize).not.toHaveBeenCalled();
  });

  it("a failing resize does not throw out of the handler", () => {
    setViewport(390, 844, 2);
    const { game } = fakeGame(780, 1688);
    game.scale.resize.mockImplementation(() => {
      throw new Error("context lost");
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    installLookResize(game, profile(2), { width: 390, height: 844 }, window);
    setViewport(391, 844, 2);
    window.dispatchEvent(new Event("resize"));
    expect(() => jest.advanceTimersByTime(RESIZE_DEBOUNCE_MS)).not.toThrow();
    spy.mockRestore();
  });
});

describe("camera helpers", () => {
  const scene = (dpr: number) => ({ registry: { get: (key: string) => (key === CANVAS_PIXEL_RATIO ? dpr : undefined) } });
  const camera = (width: number, height: number) => {
    const cam = {
      width,
      height,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      originX: 0.5,
      originY: 0.5,
      setZoom: (z: number) => void (cam.zoom = z),
      setScroll: (x: number, y?: number) => {
        cam.scrollX = x;
        cam.scrollY = y ?? x;
      },
      setOrigin: (x: number, y?: number) => {
        cam.originX = x;
        cam.originY = y ?? x;
      },
    };
    return cam;
  };

  it("setCssZoom multiplies by canvasPixelRatio, so the visible world is unchanged", () => {
    for (const dpr of [1, 1.5, 2]) {
      const cam = camera(390 * dpr, 844 * dpr);
      setCssZoom(cam, scene(dpr), 1.25);
      expect(cam.zoom).toBeCloseTo(1.25 * dpr);
      // visible world width = camera width / zoom = 390 / 1.25 at every ratio
      expect(cam.width / cam.zoom).toBeCloseTo(390 / 1.25);
    }
  });

  it("setCssScroll keeps the view centre the old 1x camera had", () => {
    const oldCentre = -650 + 390 / 2;
    for (const dpr of [1, 2]) {
      const cam = camera(390 * dpr, 844 * dpr);
      setCssScroll(cam, scene(dpr), -650, -1000);
      expect(cam.scrollX + cam.width / 2).toBeCloseTo(oldCentre);
      expect(cam.scrollY + cam.height / 2).toBeCloseTo(-1000 + 844 / 2);
    }
  });

  it("fitCssCamera maps the CSS layout onto the backing store and letterboxes on resize", () => {
    const cam = camera(780, 1688);
    fitCssCamera(cam, scene(2), { width: 390, height: 844 });
    expect(cam.zoom).toBe(2);
    expect([cam.originX, cam.originY]).toEqual([0, 0]);
    expect([cam.scrollX, cam.scrollY]).toEqual([0, 0]);
    // Rotated to landscape: fit the portrait layout into 844x390, centred.
    fitCssCamera(cam, scene(2), { width: 390, height: 844 }, { width: 844, height: 390 });
    const scale = 390 / 844;
    expect(cam.zoom).toBeCloseTo(scale * 2);
    expect(cam.scrollX).toBeCloseTo(-(844 / scale - 390) / 2);
    expect(cam.scrollY).toBeCloseTo(0);
  });

  it("text resolution follows camera zoom x ratio, capped at 3", () => {
    expect(textResolutionFor(1, 1)).toBe(1);
    expect(textResolutionFor(2.5, 2)).toBe(2.5);
    expect(textResolutionFor(4, 2)).toBe(3);
    expect(textResolutionFor(1, 2)).toBe(2);
  });

  it("installTextCrispness raises default-resolution Text only", () => {
    const handlers: Array<(object: unknown) => void> = [];
    const fakeScene = {
      ...scene(2),
      cameras: { main: { zoom: 2.5 } },
      sys: {
        events: {
          // The scene hands us a Text-typed listener; the test feeds it arbitrary objects.
          on: (_event: string, fn: (object: never) => void) =>
            handlers.push(fn as (object: unknown) => void),
          off: jest.fn(),
          once: jest.fn(),
        },
      },
    };
    installTextCrispness(fakeScene);
    const text = { type: "Text", style: { resolution: 1 }, setResolution: jest.fn(), texture: { setFilter: jest.fn() } };
    const explicit = { type: "Text", style: { resolution: 4 }, setResolution: jest.fn() };
    const sprite = { type: "Sprite", setResolution: jest.fn() };
    handlers.forEach((fn) => [text, explicit, sprite].forEach((object) => fn(object)));
    expect(text.setResolution).toHaveBeenCalledWith(2.5);
    expect(text.texture.setFilter).toHaveBeenCalledWith(0);
    expect(explicit.setResolution).not.toHaveBeenCalled();
    expect(sprite.setResolution).not.toHaveBeenCalled();
  });

  it("re-applies text resolution after create() and on refresh (ratio or zoom changed)", () => {
    const handlers = new Map<string, Array<(object?: unknown) => void>>();
    let ratio = 2;
    const camera = { zoom: 1 };
    const fakeScene = {
      registry: { get: (key: string) => (key === "canvasPixelRatio" ? ratio : undefined) },
      cameras: { main: camera },
      sys: {
        events: {
          on: (event: string, fn: (object: never) => void) =>
            handlers.set(event, [...(handlers.get(event) || []), fn as (object?: unknown) => void]),
          off: jest.fn(),
          once: jest.fn(),
        },
      },
    };
    installTextCrispness(fakeScene);
    const text = {
      type: "Text",
      scene: fakeScene,
      style: { resolution: 1 },
      setResolution: jest.fn(function (this: { style: { resolution: number } }, value: number) {
        this.style.resolution = value;
      }),
      texture: { setFilter: jest.fn() },
      once: jest.fn(),
    };
    handlers.get("addedtoscene")!.forEach((fn) => fn(text));
    // Added before setCssZoom: camera still at 1, so resolution = dpr.
    expect(text.style.resolution).toBe(2);

    camera.zoom = 2.5; // setCssZoom ran later in create()
    handlers.get("create")!.forEach((fn) => fn());
    expect(text.style.resolution).toBe(2.5);

    ratio = 1; // window moved to a 1x monitor; LOOK_RESIZE rescaled the camera
    camera.zoom = 1.25;
    refreshTextCrispness(fakeScene);
    expect(text.style.resolution).toBe(1.25);

    // A destroyed text is dropped, not re-rasterised.
    (text as { scene?: unknown }).scene = undefined;
    text.setResolution.mockClear();
    camera.zoom = 3;
    refreshTextCrispness(fakeScene);
    expect(text.setResolution).not.toHaveBeenCalled();
    expect(() => refreshTextCrispness({})).not.toThrow();
  });
});
