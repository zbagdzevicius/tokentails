/**
 * @jest-environment jsdom
 */
import {
  __resetGameRegistryForTests,
  acquireGameSuspension,
  getRegisteredGames,
  isFormFieldTarget,
  isGameSuspended,
  registerGame,
  type RegistrableGame,
} from "@/lib/game/gameRegistry";

/** A fake game with the Phaser 4 surface the registry touches. */
function fakeGame(
  options: {
    booted?: boolean;
    running?: boolean;
    isRunning?: boolean;
    withGetAllPlaying?: boolean;
    managerEnabled?: boolean;
  } = {}
) {
  const listeners = new Map<string, Array<() => void>>();
  const manager = { enabled: options.managerEnabled ?? true, preventDefault: true };
  const plugin = {
    enabled: true,
    resetKeys: jest.fn(),
    disableGlobalCapture: jest.fn(() => {
      manager.preventDefault = false;
    }),
    enableGlobalCapture: jest.fn(() => {
      manager.preventDefault = true;
    }),
  };
  const music = { isPlaying: true, pause: jest.fn(() => true), resume: jest.fn(() => true) };
  const loop = {
    running: options.running ?? true,
    sleep: jest.fn(() => {
      loop.running = false;
    }),
    wake: jest.fn(() => {
      loop.running = true;
    }),
  };
  const game = {
    isBooted: options.booted ?? true,
    ...(options.isRunning === undefined ? {} : { isRunning: options.isRunning }),
    loop,
    input: { keyboard: manager },
    scene: { getScenes: jest.fn(() => [{ input: { keyboard: plugin } }]) },
    sound: {
      pauseAll: jest.fn(),
      resumeAll: jest.fn(),
      ...(options.withGetAllPlaying === false ? {} : { getAllPlaying: jest.fn(() => [music]) }),
    },
    events: {
      once: jest.fn((event: string, fn: () => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      }),
    },
    destroy: jest.fn(),
    emit(event: string) {
      const fns = listeners.get(event) ?? [];
      listeners.delete(event);
      fns.forEach((fn) => fn());
    },
  };
  return { game: game as typeof game & RegistrableGame, manager, plugin, music, loop };
}

beforeEach(() => {
  __resetGameRegistryForTests();
});

describe("gameRegistry", () => {
  it("registers games and clears them when Phaser emits destroy", () => {
    const { game } = fakeGame();
    registerGame(game);
    expect(getRegisteredGames()).toEqual([game]);
    game.emit("destroy");
    expect(getRegisteredGames()).toEqual([]);
  });

  it("clears the entry as soon as destroy is called, and still calls Phaser's destroy", () => {
    const { game } = fakeGame();
    const original = game.destroy;
    registerGame(game);
    game.destroy(true);
    expect(getRegisteredGames()).toEqual([]);
    expect(original).toHaveBeenCalledWith(true);
  });

  it("registering twice keeps one entry", () => {
    const { game } = fakeGame();
    registerGame(game);
    registerGame(game);
    expect(getRegisteredGames()).toHaveLength(1);
  });

  it("suspends keyboard, capture, loop and sound, and reverses them on release", () => {
    const { game, manager, plugin, music, loop } = fakeGame();
    registerGame(game);

    const release = acquireGameSuspension();
    expect(isGameSuspended()).toBe(true);
    expect(manager.enabled).toBe(false);
    expect(plugin.enabled).toBe(false);
    expect(plugin.disableGlobalCapture).toHaveBeenCalledTimes(1);
    expect(plugin.resetKeys).toHaveBeenCalledTimes(1);
    expect(manager.preventDefault).toBe(false);
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    expect(music.pause).toHaveBeenCalledTimes(1);

    release();
    expect(isGameSuspended()).toBe(false);
    expect(manager.enabled).toBe(true);
    expect(plugin.enabled).toBe(true);
    expect(plugin.enableGlobalCapture).toHaveBeenCalledTimes(1);
    expect(manager.preventDefault).toBe(true);
    expect(loop.wake).toHaveBeenCalledWith(true);
    expect(music.resume).toHaveBeenCalledTimes(1);
  });

  it("falls back to pauseAll and resumeAll without getAllPlaying", () => {
    const { game } = fakeGame({ withGetAllPlaying: false });
    registerGame(game);
    const release = acquireGameSuspension();
    expect(game.sound.pauseAll).toHaveBeenCalledTimes(1);
    release();
    expect(game.sound.resumeAll).toHaveBeenCalledTimes(1);
  });

  it("restores what the game had, not blanket defaults", () => {
    const { game, manager, plugin, loop } = fakeGame({ running: false });
    manager.preventDefault = false;
    plugin.enabled = false;
    registerGame(game);
    const release = acquireGameSuspension();
    release();
    expect(plugin.enabled).toBe(false);
    expect(manager.preventDefault).toBe(false);
    expect(plugin.enableGlobalCapture).not.toHaveBeenCalled();
    expect(loop.sleep).not.toHaveBeenCalled();
    expect(loop.wake).not.toHaveBeenCalled();
  });

  it("nests suspensions and resumes only after the last release; double release is a no-op", () => {
    const { game, loop } = fakeGame();
    registerGame(game);
    const first = acquireGameSuspension();
    const second = acquireGameSuspension();
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    first();
    first();
    expect(isGameSuspended()).toBe(true);
    expect(loop.wake).not.toHaveBeenCalled();
    second();
    expect(isGameSuspended()).toBe(false);
    expect(loop.wake).toHaveBeenCalledTimes(1);
  });

  it("suspends a game registered while a modal is already open", () => {
    const release = acquireGameSuspension();
    const { game, manager, loop } = fakeGame();
    registerGame(game);
    expect(manager.enabled).toBe(false);
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    release();
    expect(manager.enabled).toBe(true);
  });

  it("sleeps a booting game after its first step", () => {
    const { game, loop } = fakeGame({ booted: false, running: false });
    registerGame(game);
    const release = acquireGameSuspension();
    expect(loop.sleep).not.toHaveBeenCalled();
    loop.running = true; // Phaser started the loop after boot.
    game.emit("poststep");
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    release();
    expect(loop.wake).toHaveBeenCalledTimes(1);
  });

  it("sleeps a booted game whose loop has not started yet (Phaser waits for its textures)", () => {
    // A real `new Phaser.Game()` on a loaded page: booted at once, loop started later.
    const { game, loop, manager } = fakeGame({ booted: true, running: false, isRunning: false });
    const release = acquireGameSuspension();
    registerGame(game);
    expect(manager.enabled).toBe(false); // The keyboard is live after boot: suspended now.
    expect(loop.sleep).not.toHaveBeenCalled();
    loop.running = true;
    game.isRunning = true;
    game.emit("poststep");
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    release();
    expect(loop.wake).toHaveBeenCalledTimes(1);
    expect(manager.enabled).toBe(true);
  });

  it("does not leave the keyboard dead when a game registers before boot", () => {
    // Phaser's KeyboardManager constructor sets enabled = false; boot turns it on.
    const { game, loop, manager, plugin } = fakeGame({
      booted: false,
      running: false,
      managerEnabled: false,
    });
    const release = acquireGameSuspension();
    registerGame(game);
    expect(manager.enabled).toBe(false);
    // Boot, then the first step.
    manager.enabled = true;
    game.isBooted = true;
    loop.running = true;
    game.emit("poststep");
    expect(manager.enabled).toBe(false);
    expect(plugin.enabled).toBe(false);
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    release();
    expect(manager.enabled).toBe(true);
    expect(plugin.enabled).toBe(true);
  });

  it("leaves a pre-boot game's keyboard alone when the modal closes before its first step", () => {
    const { game, manager, plugin } = fakeGame({ booted: false, running: false, managerEnabled: false });
    const release = acquireGameSuspension();
    registerGame(game);
    release();
    manager.enabled = true; // Boot happens after the modal closed.
    game.emit("poststep");
    expect(manager.enabled).toBe(true);
    expect(plugin.enabled).toBe(true);
  });

  it("pauses sounds started while suspended and resumes them with the rest", () => {
    const { game } = fakeGame();
    const created: Array<{ pause: jest.Mock; resume: jest.Mock; play: () => void }> = [];
    const add = jest.fn(() => {
      const handlers: Array<() => void> = [];
      const sound = {
        pause: jest.fn(() => true),
        resume: jest.fn(() => true),
        once: jest.fn((event: string, fn: () => void) => {
          if (event === "play") handlers.push(fn);
        }),
        play: () => handlers.splice(0).forEach((fn) => fn()),
      };
      created.push(sound);
      return sound;
    });
    Object.assign(game.sound, { add });
    registerGame(game);
    const release = acquireGameSuspension();
    // A scene's create() starts the lobby music under the modal.
    (game.sound as unknown as { add: () => { play: () => void } }).add().play();
    expect(add).toHaveBeenCalledTimes(1);
    expect(created[0].pause).toHaveBeenCalledTimes(1);
    release();
    expect(created[0].resume).toHaveBeenCalledTimes(1);
    expect((game.sound as { add?: unknown }).add).toBe(add);
    // After the modal, new sounds play untouched.
    (game.sound as unknown as { add: () => { play: () => void } }).add().play();
    expect(created[1].pause).not.toHaveBeenCalled();
  });

  it("does not resume paused sounds when a suspended game is destroyed", () => {
    const { game, music } = fakeGame();
    registerGame(game);
    acquireGameSuspension();
    game.destroy(true);
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(music.resume).not.toHaveBeenCalled();
  });

  it("wakes a sleeping game when it is destroyed, so Phaser's deferred destroy runs", () => {
    const { game, loop } = fakeGame();
    registerGame(game);
    acquireGameSuspension();
    game.destroy(true);
    expect(loop.wake).toHaveBeenCalled();
    expect(getRegisteredGames()).toEqual([]);
  });

  it("survives a game whose systems throw", () => {
    const { game } = fakeGame();
    game.loop.sleep = jest.fn(() => {
      throw new Error("renderer lost");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    registerGame(game);
    const release = acquireGameSuspension();
    expect(() => release()).not.toThrow();
    warn.mockRestore();
  });
});

describe("form-field key guard (known bug: Phaser key capture swallowed typing)", () => {
  /**
   * Stands in for Phaser's KeyboardManager: a bubble-phase window listener that, like
   * KeyboardManager.onKeyDown, bails when disabled and otherwise preventDefaults captured keys.
   */
  function installFakePhaserListener(manager: { enabled: boolean; preventDefault: boolean }) {
    const seen: string[] = [];
    const ups: string[] = [];
    const captures = ["w", "a", "d", "z", "q", " "];
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !manager.enabled) return;
      (event.type === "keyup" ? ups : seen).push(event.key);
      if (manager.preventDefault && captures.includes(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return {
      seen,
      ups,
      remove: () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
      },
    };
  }

  it("classifies form fields", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const button = document.createElement("button");
    expect(isFormFieldTarget(input)).toBe(true);
    expect(isFormFieldTarget(textarea)).toBe(true);
    expect(isFormFieldTarget(select)).toBe(true);
    expect(isFormFieldTarget(editable)).toBe(true);
    expect(isFormFieldTarget(button)).toBe(false);
    expect(isFormFieldTarget(window)).toBe(false);
    expect(isFormFieldTarget(null)).toBe(false);
  });

  it("lets w, a, d, z, q and space reach an input and keeps them from the game", () => {
    const { game, manager } = fakeGame();
    registerGame(game);
    const phaser = installFakePhaserListener(manager);
    const input = document.createElement("input");
    document.body.appendChild(input);

    for (const key of ["w", "a", "d", "z", "q", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(phaser.seen).toEqual([]);
    // The manager is back on for game input once the field event has passed.
    expect(manager.enabled).toBe(true);

    const gameKey = new KeyboardEvent("keydown", { key: "d", bubbles: true, cancelable: true });
    document.body.dispatchEvent(gameKey);
    expect(phaser.seen).toEqual(["d"]);
    expect(gameKey.defaultPrevented).toBe(true);

    phaser.remove();
    input.remove();
  });

  it("lets the game see the keyup of a key held before focus moved into a field", () => {
    const { game, manager } = fakeGame();
    registerGame(game);
    const phaser = installFakePhaserListener(manager);
    const input = document.createElement("input");
    document.body.appendChild(input);

    // Hold D on the page (the cat runs), then release it while an input has focus.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", code: "KeyD", bubbles: true, cancelable: true })
    );
    expect(phaser.seen).toEqual(["d"]);
    const up = new KeyboardEvent("keyup", { key: "d", code: "KeyD", bubbles: true, cancelable: true });
    input.dispatchEvent(up);
    expect(phaser.ups).toEqual(["d"]);
    // Phaser saw it with preventDefault off, and the flag is back afterwards.
    expect(up.defaultPrevented).toBe(false);
    expect(manager.preventDefault).toBe(true);
    expect(manager.enabled).toBe(true);

    phaser.remove();
    input.remove();
  });

  it("does not preventDefault a held space keyup in a field (checkbox toggles)", () => {
    const { game, manager } = fakeGame();
    registerGame(game);
    const phaser = installFakePhaserListener(manager);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true })
    );
    const up = new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true });
    checkbox.dispatchEvent(up);
    expect(phaser.ups).toEqual([" "]);
    expect(up.defaultPrevented).toBe(false);
    phaser.remove();
    checkbox.remove();
  });

  it("hides keyups of keys typed in the field from the game", () => {
    const { game, manager } = fakeGame();
    registerGame(game);
    const phaser = installFakePhaserListener(manager);
    const input = document.createElement("input");
    document.body.appendChild(input);
    for (const type of ["keydown", "keyup"]) {
      input.dispatchEvent(new KeyboardEvent(type, { key: "a", code: "KeyA", bubbles: true, cancelable: true }));
    }
    // A key released on the page first is no longer held when a later keyup lands in the field.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true }));
    phaser.ups.length = 0;
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true, cancelable: true }));
    expect(phaser.ups).toEqual([]);
    expect(manager.enabled).toBe(true);
    phaser.remove();
    input.remove();
  });

  it("restores the manager by timer when propagation is stopped before window", () => {
    jest.useFakeTimers();
    const { game, manager } = fakeGame();
    registerGame(game);
    const input = document.createElement("input");
    input.addEventListener("keydown", (event) => event.stopPropagation());
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(manager.enabled).toBe(false);
    jest.runAllTimers();
    expect(manager.enabled).toBe(true);
    input.remove();
    jest.useRealTimers();
  });

  it("does not undo a suspension that starts while a field event is passing", () => {
    const { game, manager } = fakeGame();
    registerGame(game);
    const input = document.createElement("input");
    let release: (() => void) | undefined;
    input.addEventListener("keydown", () => {
      release = acquireGameSuspension();
    });
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(manager.enabled).toBe(false);
    release!();
    expect(manager.enabled).toBe(true);
    input.remove();
  });
});
