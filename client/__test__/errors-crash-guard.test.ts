/**
 * @jest-environment jsdom
 *
 * F9 Phaser crash guard: listener isolation, the stall watchdog, and
 * same-origin window error reporting.
 */
const mockReport = jest.fn<boolean, unknown[]>(() => true);
jest.mock("@/analytics", () => ({
  reportAppError: (...args: unknown[]) => mockReport(...args),
}));
const mockGames: unknown[] = [];
let mockSuspended = false;
jest.mock("@/lib/game/gameRegistry", () => ({
  getRegisteredGames: () => mockGames,
  isGameSuspended: () => mockSuspended,
}));
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
}));

import { SCENE_STALL_EVENT } from "@/components/errors/events";
import {
  createStallWatchdog,
  GameEvent,
  GameEvents,
  guardListener,
  installPhaserCrashGuard,
  installWindowErrorReporting,
  isSameOrigin,
  teardownStalledGame,
  type IPhaserScene,
} from "@/components/Phaser/events";

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("GameEvents listener guard", () => {
  it("a throwing listener is reported and the next listener still runs", () => {
    const after = jest.fn();
    const bad = () => {
      throw new Error("listener boom");
    };
    GameEvents.GAME_STOP.addEventListener(bad);
    GameEvents.GAME_STOP.addEventListener(after);
    expect(() => GameEvents.GAME_STOP.push({ score: 1, time: 2, outcome: "died" })).not.toThrow();
    expect(after).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { score: 1, time: 2, outcome: "died" } }),
    );
    expect(mockReport).toHaveBeenCalledWith(
      "listener_error:game_stop",
      expect.any(Error),
      expect.objectContaining({ source: "listener", event: "GAME_STOP" }),
    );
    GameEvents.GAME_STOP.removeEventListener(bad);
    GameEvents.GAME_STOP.removeEventListener(after);
  });

  it("removeEventListener removes the wrapped listener", () => {
    const listener = jest.fn();
    GameEvents.CAT_MEOW.addEventListener(listener);
    GameEvents.CAT_MEOW.removeEventListener(listener);
    GameEvents.CAT_MEOW.push({});
    expect(listener).not.toHaveBeenCalled();
  });

  it("the same callback on two events stays independent", () => {
    const listener = jest.fn();
    GameEvents.CAT_EAT.addEventListener(listener);
    GameEvents.CAT_PLAY.addEventListener(listener);
    GameEvents.CAT_EAT.removeEventListener(listener);
    GameEvents.CAT_EAT.push({});
    GameEvents.CAT_PLAY.push({});
    expect(listener).toHaveBeenCalledTimes(1);
    GameEvents.CAT_PLAY.removeEventListener(listener);
  });

  it("guardListener passes values through", () => {
    const inner = jest.fn();
    guardListener(GameEvent.GAME_UPDATE, inner)(5);
    expect(inner).toHaveBeenCalledWith(5);
    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("createStallWatchdog", () => {
  function setup() {
    let t = 0;
    let visible = true;
    const onStall = jest.fn();
    const watchdog = createStallWatchdog({
      onStall,
      stallMs: 8000,
      checkMs: 1000,
      now: () => t,
      isVisible: () => visible,
      setInterval: () => 1,
      clearInterval: () => {},
    });
    // Advance the clock in timer-sized steps, checking like the interval.
    const tick = (ms: number, beat = false) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
        t += 1000;
        if (beat) watchdog.beat();
        watchdog.check();
      }
    };
    return {
      watchdog,
      onStall,
      tick,
      jump: (ms: number) => {
        t += ms;
      },
      setVisible: (v: boolean) => {
        visible = v;
      },
    };
  }

  it("never trips before GAME_LOADED arms it", () => {
    const { watchdog, onStall, tick } = setup();
    tick(60_000);
    expect(watchdog.armed).toBe(false);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("stays quiet while frames arrive", () => {
    const { watchdog, onStall, tick } = setup();
    watchdog.arm();
    tick(60_000, true);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("trips once when frames stop on a visible page", () => {
    const { watchdog, onStall, tick } = setup();
    watchdog.arm();
    tick(3000, true);
    tick(9000);
    expect(onStall).toHaveBeenCalledTimes(1);
    tick(30_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("does not trip on a tab switch", () => {
    const { watchdog, onStall, tick, setVisible } = setup();
    watchdog.arm();
    tick(2000, true);
    setVisible(false);
    tick(120_000);
    setVisible(true);
    watchdog.reset(); // visibilitychange
    tick(3000, true);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("does not trip after a background freeze of the timers", () => {
    const { watchdog, onStall, tick, jump } = setup();
    watchdog.arm();
    tick(2000, true);
    // Device sleep: no timers, no frames, the page reports visible after.
    jump(300_000);
    tick(1000);
    tick(3000, true);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("does not trip while the game is paused", () => {
    const { watchdog, onStall, tick } = setup();
    let paused = true;
    watchdog.arm(() => paused);
    tick(60_000);
    expect(onStall).not.toHaveBeenCalled();
    paused = false;
    tick(9000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("disarm stops it", () => {
    const { watchdog, onStall, tick } = setup();
    watchdog.arm();
    watchdog.disarm();
    tick(60_000);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe("installPhaserCrashGuard", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function fakeGame() {
    const handlers = new Map<string, Set<() => void>>();
    const game = {
      isPaused: false,
      pendingDestroy: false,
      loop: { running: true },
      destroy: jest.fn(() => {
        game.pendingDestroy = true;
      }),
      runDestroy: jest.fn(() => {
        game.pendingDestroy = false;
        game.emit("destroy");
      }),
      events: {
        on: (name: string, fn: () => void) => {
          if (!handlers.has(name)) handlers.set(name, new Set());
          handlers.get(name)!.add(fn);
        },
        off: (name: string, fn: () => void) => handlers.get(name)?.delete(fn),
        once: (name: string, fn: () => void) => {
          const wrapped = () => {
            handlers.get(name)?.delete(wrapped);
            fn();
          };
          if (!handlers.has(name)) handlers.set(name, new Set());
          handlers.get(name)!.add(wrapped);
        },
      },
      emit: (name: string) => handlers.get(name)?.forEach((fn) => fn()),
    };
    return game;
  }

  const loaded = (game: ReturnType<typeof fakeGame>) =>
    GameEvents.GAME_LOADED.push({
      scene: { game, scene: { key: "BaseScene" } } as unknown as IPhaserScene,
    });

  it("reports a stall after GAME_LOADED and tells the scene boundary", () => {
    const onStall = jest.fn();
    window.addEventListener(SCENE_STALL_EVENT, onStall);
    const cleanup = installPhaserCrashGuard({ stallMs: 5000, checkMs: 1000 });
    const game = fakeGame();

    jest.advanceTimersByTime(20_000);
    expect(mockReport).not.toHaveBeenCalled();

    loaded(game);
    for (let i = 0; i < 3; i++) {
      game.emit("poststep");
      jest.advanceTimersByTime(1000);
    }
    expect(mockReport).not.toHaveBeenCalled();
    jest.advanceTimersByTime(6000);
    expect(mockReport).toHaveBeenCalledWith(
      "scene_stall",
      expect.any(Error),
      expect.objectContaining({ source: "watchdog", level: "scene", scene: "BaseScene" }),
    );
    expect(onStall).toHaveBeenCalledTimes(1);
    // The dead loop never takes the step that would run Phaser's deferred
    // destroy, so the guard runs it: no leaked WebGL context or listeners.
    expect(game.destroy).toHaveBeenCalledWith(true);
    expect(game.runDestroy).toHaveBeenCalledTimes(1);
    cleanup();
    window.removeEventListener(SCENE_STALL_EVENT, onStall);
  });

  it("a visibility change resets the clock and a destroyed game disarms", () => {
    const cleanup = installPhaserCrashGuard({ stallMs: 5000, checkMs: 1000 });
    const game = fakeGame();
    loaded(game);
    jest.advanceTimersByTime(4000);
    document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(4000);
    expect(mockReport).not.toHaveBeenCalled();
    game.emit("destroy");
    jest.advanceTimersByTime(60_000);
    expect(mockReport).not.toHaveBeenCalled();
    cleanup();
  });

  it("a paused game never trips", () => {
    const cleanup = installPhaserCrashGuard({ stallMs: 5000, checkMs: 1000 });
    const game = fakeGame();
    game.isPaused = true;
    loaded(game);
    jest.advanceTimersByTime(60_000);
    expect(mockReport).not.toHaveBeenCalled();
    cleanup();
  });

  describe("startup (before GAME_LOADED)", () => {
    afterEach(() => {
      mockGames.length = 0;
      mockSuspended = false;
    });

    const opts = { stallMs: 5000, startupStallMs: 12000, checkMs: 1000 };

    it("steps begin, then stop before GAME_LOADED: a stall is raised", () => {
      const onStall = jest.fn();
      window.addEventListener(SCENE_STALL_EVENT, onStall);
      const cleanup = installPhaserCrashGuard(opts);
      const game = fakeGame();
      mockGames.push(game);
      jest.advanceTimersByTime(1000); // discovered
      for (let i = 0; i < 4; i++) {
        game.emit("poststep");
        jest.advanceTimersByTime(1000);
      }
      // The startup limit is longer than the running one.
      jest.advanceTimersByTime(8000);
      expect(mockReport).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(mockReport).toHaveBeenCalledWith(
        "scene_stall",
        expect.any(Error),
        expect.objectContaining({ source: "watchdog", level: "scene", phase: "startup" }),
      );
      expect(onStall).toHaveBeenCalledTimes(1);
      expect(game.runDestroy).toHaveBeenCalledTimes(1);
      // A dead game is never watched again.
      jest.advanceTimersByTime(60_000);
      expect(mockReport).toHaveBeenCalledTimes(1);
      cleanup();
      window.removeEventListener(SCENE_STALL_EVENT, onStall);
    });

    it("a game that has not stepped yet (still booting) never trips", () => {
      const cleanup = installPhaserCrashGuard(opts);
      mockGames.push(fakeGame());
      jest.advanceTimersByTime(120_000);
      expect(mockReport).not.toHaveBeenCalled();
      cleanup();
    });

    it("a tab switch during startup does not trip", () => {
      const cleanup = installPhaserCrashGuard(opts);
      const game = fakeGame();
      mockGames.push(game);
      jest.advanceTimersByTime(1000);
      game.emit("poststep");
      const visibility = jest
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("hidden");
      jest.advanceTimersByTime(60_000);
      visibility.mockRestore();
      document.dispatchEvent(new Event("visibilitychange"));
      game.emit("poststep");
      jest.advanceTimersByTime(5000);
      expect(mockReport).not.toHaveBeenCalled();
      cleanup();
    });

    it("a suspended game (modal open) does not trip", () => {
      const cleanup = installPhaserCrashGuard(opts);
      const game = fakeGame();
      mockGames.push(game);
      jest.advanceTimersByTime(1000);
      game.emit("poststep");
      mockSuspended = true;
      jest.advanceTimersByTime(60_000);
      expect(mockReport).not.toHaveBeenCalled();
      cleanup();
    });

    it("GAME_LOADED switches to the running limit", () => {
      const cleanup = installPhaserCrashGuard(opts);
      const game = fakeGame();
      mockGames.push(game);
      jest.advanceTimersByTime(1000);
      game.emit("poststep");
      loaded(game);
      jest.advanceTimersByTime(6000);
      expect(mockReport).toHaveBeenCalledWith(
        "scene_stall",
        expect.any(Error),
        expect.objectContaining({ phase: "running", scene: "BaseScene" }),
      );
      cleanup();
    });

    const withScene = (status: number, key = "BaseScene") => {
      const game = fakeGame() as ReturnType<typeof fakeGame> & {
        scene: { scenes: Array<{ sys: { settings: { status: number; key: string } } }> };
      };
      game.scene = { scenes: [{ sys: { settings: { status, key } } }] };
      return game;
    };

    it("a scene whose create() threw (left in CREATING) shows the fallback", () => {
      const onStall = jest.fn();
      window.addEventListener(SCENE_STALL_EVENT, onStall);
      const cleanup = installPhaserCrashGuard(opts);
      // The loop keeps stepping: create() threw from a loader callback.
      const game = withScene(4, "ShelterScene");
      mockGames.push(game);
      for (let i = 0; i < 3; i++) {
        game.emit("poststep");
        jest.advanceTimersByTime(1000);
      }
      expect(mockReport).toHaveBeenCalledWith(
        "scene_start_failed",
        expect.any(Error),
        expect.objectContaining({ scene: "ShelterScene", phase: "startup" }),
      );
      expect(onStall).toHaveBeenCalledTimes(1);
      expect(game.destroy).toHaveBeenCalledWith(true);
      cleanup();
      window.removeEventListener(SCENE_STALL_EVENT, onStall);
    });

    it("a scene seen in CREATING once, then running, is fine", () => {
      const cleanup = installPhaserCrashGuard(opts);
      const game = withScene(4);
      mockGames.push(game);
      jest.advanceTimersByTime(1000);
      game.scene.scenes[0].sys.settings.status = 5;
      for (let i = 0; i < 10; i++) {
        game.emit("poststep");
        jest.advanceTimersByTime(1000);
      }
      expect(mockReport).not.toHaveBeenCalled();
      cleanup();
    });
  });

  it("cleanup stops watching", () => {
    const cleanup = installPhaserCrashGuard({ stallMs: 5000, checkMs: 1000 });
    loaded(fakeGame());
    cleanup();
    jest.advanceTimersByTime(60_000);
    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("teardownStalledGame", () => {
  it("runs the deferred destroy only when one is pending", () => {
    const pending = { pendingDestroy: false, destroy: jest.fn(), runDestroy: jest.fn() };
    teardownStalledGame(pending);
    expect(pending.destroy).toHaveBeenCalledWith(true);
    expect(pending.runDestroy).not.toHaveBeenCalled();
    const flagged = {
      pendingDestroy: false,
      destroy: jest.fn(() => {
        flagged.pendingDestroy = true;
      }),
      runDestroy: jest.fn(() => {
        throw new Error("half built");
      }),
    };
    expect(() => teardownStalledGame(flagged)).not.toThrow();
    expect(flagged.runDestroy).toHaveBeenCalledTimes(1);
    expect(() => teardownStalledGame(null)).not.toThrow();
  });
});

describe("isSameOrigin", () => {
  it("matches the Capacitor iOS scheme, whose URL origin is the opaque 'null'", () => {
    const cap = { protocol: "capacitor:", host: "localhost", href: "capacitor://localhost/game" };
    expect(isSameOrigin("capacitor://localhost/_next/static/chunks/main.js", cap)).toBe(true);
    expect(isSameOrigin("/_next/static/chunks/main.js", cap)).toBe(true);
    expect(isSameOrigin("https://localhost/x.js", cap)).toBe(false);
    expect(isSameOrigin("chrome-extension://abc/inject.js", cap)).toBe(false);
    expect(isSameOrigin(undefined, cap)).toBe(false);
  });

  it("matches https hosts exactly", () => {
    const web = { protocol: "https:", host: "tokentails.com", href: "https://tokentails.com/game" };
    expect(isSameOrigin("https://tokentails.com/a.js", web)).toBe(true);
    expect(isSameOrigin("https://cdn.tokentails.com/a.js", web)).toBe(false);
  });
});

describe("installWindowErrorReporting", () => {
  const origin = window.location.origin;

  it("reports same-origin uncaught errors only", () => {
    const cleanup = installWindowErrorReporting();
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("ours"),
        message: "ours",
        filename: `${origin}/_next/static/chunks/main.js`,
      }),
    );
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error.",
        filename: "chrome-extension://abc/inject.js",
      }),
    );
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      "window_error",
      expect.any(Error),
      expect.objectContaining({ source: "window" }),
    );
    cleanup();
  });

  it("reports same-origin unhandled rejections only", () => {
    const cleanup = installWindowErrorReporting();
    const rejection = (reason: unknown) => {
      const event = new Event("unhandledrejection") as Event & { reason?: unknown };
      event.reason = reason;
      window.dispatchEvent(event);
    };
    const ours = new Error("ours");
    ours.stack = `Error: ours\n    at load (${origin}/_next/static/chunks/app.js:1:2)`;
    const theirs = new Error("wallet");
    theirs.stack = "Error: wallet\n    at x (chrome-extension://abc/inpage.js:3:4)";
    rejection(ours);
    rejection(theirs);
    rejection("plain string");
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      "unhandled_rejection",
      ours,
      expect.objectContaining({ source: "rejection" }),
    );
    cleanup();
    rejection(ours);
    expect(mockReport).toHaveBeenCalledTimes(1);
  });
});
