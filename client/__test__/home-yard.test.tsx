/**
 * @jest-environment jsdom
 *
 * MY HOME as the Cat Yard (shared/home-yard.ts, components/home): cats in, feeding and SELECT out,
 * every fallback to the Phaser HOME, and the pieces around it (kill switch, mode store, the built
 * module path, the crash guard with a sceneless GAME_LOADED).
 */
import { act, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ICat } from "@/models/cats";
import type { HomeYardAPI, HomeYardModule, HomeYardOptions } from "@/shared-contracts/home-yard";
import { HOME_YARD_API_VERSION } from "@/shared-contracts/home-yard";

const mockReport = jest.fn<boolean, unknown[]>(() => true);
jest.mock("@/analytics", () => ({ reportAppError: (...args: unknown[]) => mockReport(...args) }));
jest.mock("@/lib/game/gameRegistry", () => ({ getRegisteredGames: () => [], isGameSuspended: () => false }));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));

const mockSound = jest.fn();
jest.mock("@/components/home/homeSfx", () => ({ playHomeSound: (kind: string) => mockSound(kind) }));

const cat = (id: string, extra: Partial<ICat> = {}): ICat =>
  ({
    _id: id,
    name: id.toUpperCase(),
    spriteImg: `https://cdn.example/${id}.png`,
    catImg: `https://cdn.example/${id}.gif`,
    status: { EAT: 4 },
    tier: "COMMON",
    type: "FIRE",
    ...extra,
  }) as unknown as ICat;

const state: {
  profile: { _id: string; cat: ICat; cats: ICat[] } | null;
  userCats: ICat[] | undefined;
  openedModal: string | null;
} = { profile: null, userCats: undefined, openedModal: null };
const mockSetProfileUpdate = jest.fn();
const mockSetCatStatus = jest.fn();
const mockSetGameType = jest.fn();
const mockToast = jest.fn();
const mockSetActive = jest.fn();

jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: state.profile, setProfileUpdate: mockSetProfileUpdate }),
}));
jest.mock("@/context/CatContext", () => ({
  MAX_CAT_STATUS: 4,
  useCat: () => ({ cat: state.profile?.cat, setCatStatus: mockSetCatStatus }),
}));
jest.mock("@/context/GameContext", () => ({
  useGame: () => ({ openedModal: state.openedModal, setGameType: mockSetGameType, setOpenedModal: jest.fn() }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));
jest.mock("@/api/cat-api", () => ({ CAT_API: { cats: jest.fn(), setActive: (id: string) => mockSetActive(id) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.userCats }) }));

import { HomeYard } from "@/components/home/HomeYard";
import { homeYardCats, isHungry, findOwnedCat } from "@/components/home/homeYardCats";
import { getHomeYardMode, homeYardEnabled, setHomeYardMode } from "@/components/home/homeYardMode";
import { HOME_YARD_ASSET_BASE, loadHomeYard } from "@/components/home/loadHomeYard";
import { HOME_YARD_ENTRY } from "@/components/home/yardEntry.generated";
import { GameEvent, GameEvents, installPhaserCrashGuard } from "@/components/Phaser/events";
import { StatusType } from "@/models/status";

/** A fake built module: records the options and every API call. */
function fakeModule(opts: { ready?: Promise<{ loaded: number; failed: string[] }> } = {}) {
  const calls: string[] = [];
  let options: HomeYardOptions | null = null;
  let resolveFeed: (() => void) | null = null;
  const api: HomeYardAPI = {
    ready: opts.ready ?? Promise.resolve({ loaded: 3, failed: [] }),
    setCats: (cats) => calls.push(`setCats:${cats.map((c) => `${c.id}${c.active ? "*" : ""}${c.hungry ? "!" : ""}`).join(",")}`),
    feed: (id) => {
      calls.push(`feed:${id}`);
      return new Promise<void>((resolve) => {
        resolveFeed = () => {
          options?.onFed?.(id);
          resolve();
        };
      });
    },
    select: (id) => calls.push(`select:${id}`),
    focus: (id) => calls.push(`focus:${id}`),
    start: () => calls.push("start"),
    stop: () => calls.push("stop"),
    dispose: () => calls.push("dispose"),
    stats: () => null,
    screenPositions: () => [],
  };
  const mod: HomeYardModule = {
    HOME_YARD_API_VERSION,
    createHomeYard: jest.fn((_el: HTMLElement, o: HomeYardOptions) => {
      options = o;
      return api;
    }),
  };
  return {
    mod,
    calls,
    get options() {
      return options!;
    },
    finishFeed: () => resolveFeed?.(),
  };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

beforeEach(() => {
  const me = cat("a", { status: { EAT: 1 } as ICat["status"] });
  state.profile = { _id: "u1", cat: me, cats: [me, cat("b"), cat("c")] };
  state.userCats = [cat("a"), cat("b"), cat("c")];
  state.openedModal = null;
  mockReport.mockClear();
  mockSound.mockClear();
  setHomeYardMode(null);
});

describe("HomeYard", () => {
  it("builds the yard with the player's cats, the active one from the profile", async () => {
    const f = fakeModule();
    render(<HomeYard fallback={<p>phaser home</p>} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    expect(f.mod.createHomeYard).toHaveBeenCalledTimes(1);
    expect(f.options.assetBase).toBe(HOME_YARD_ASSET_BASE);
    expect(f.options.cats.map((c) => [c.id, c.active, c.hungry])).toEqual([
      ["a", true, true],
      ["b", false, false],
      ["c", false, false],
    ]);
    expect(f.options.cats[0].sheetUrl).toBe("https://cdn.example/a.png");
    expect(screen.queryByText("phaser home")).toBeNull();
    expect(getHomeYardMode()).toBe("yard");
  });

  it("sends game_loaded once ready (a sceneless GAME_LOADED) and meows for a hungry cat", async () => {
    jest.useFakeTimers();
    const loaded = jest.fn();
    window.addEventListener(GameEvent.GAME_LOADED, loaded);
    const f = fakeModule();
    render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    expect(screen.getByTestId("home-yard").dataset.state).toBe("ready");
    expect(loaded).toHaveBeenCalledTimes(1);
    expect((loaded.mock.calls[0][0] as CustomEvent).detail ?? null).toBeNull();
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(mockSound).toHaveBeenCalledWith("meow");
    window.removeEventListener(GameEvent.GAME_LOADED, loaded);
    jest.useRealTimers();
  });

  it("feeds through the HUD's CAT_EAT: yard.feed, then CAT_EATEN and the EAT save", async () => {
    const eaten = jest.fn();
    window.addEventListener(GameEvent.CAT_EATEN, eaten);
    const f = fakeModule();
    render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    act(() => GameEvents.CAT_EAT.push());
    act(() => GameEvents.CAT_EAT.push()); // a second tap while eating is ignored
    expect(f.calls.filter((c) => c.startsWith("feed"))).toEqual(["feed:a"]);
    f.options.onEating?.("a");
    expect(mockSound).toHaveBeenCalledWith("eat");
    await act(async () => f.finishFeed());
    expect(eaten).toHaveBeenCalledTimes(1);
    expect(mockSetCatStatus).toHaveBeenCalledWith({ type: StatusType.EAT, status: 4 });
    expect(mockSound).toHaveBeenCalledWith("purr");
    window.removeEventListener(GameEvent.CAT_EATEN, eaten);
  });

  it("SELECT on another cat runs the select flow; the active cat is refused", async () => {
    const spawn = jest.fn();
    window.addEventListener(GameEvent.CAT_SPAWN, spawn);
    const f = fakeModule();
    render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    act(() => f.options.onChoose?.("b"));
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ cat: expect.objectContaining({ _id: "b" }) }));
    expect(mockSetActive).toHaveBeenCalledWith("b");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: "B selected successfully!" }));
    // b is fully fed: no re-entry into HOME.
    expect(mockSetGameType).not.toHaveBeenCalled();
    act(() => f.options.onChoose?.("a"));
    expect(mockToast).toHaveBeenCalledWith({ message: "This cat is already selected" });
    window.removeEventListener(GameEvent.CAT_SPAWN, spawn);
  });

  it("pushes a new active cat into the yard", async () => {
    const f = fakeModule();
    const view = render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    state.profile = { ...state.profile!, cat: cat("b") };
    view.rerender(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    expect(f.calls).toContain("setCats:a,b*,c");
  });

  it("stops rendering under a game modal and starts again after", async () => {
    const f = fakeModule();
    const view = render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    state.openedModal = "SHOP";
    view.rerender(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    state.openedModal = null;
    view.rerender(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    const last = f.calls.filter((c) => c === "stop" || c === "start");
    expect(last.slice(-2)).toEqual(["stop", "start"]);
  });

  it("disposes the yard on unmount and clears the mode", async () => {
    const f = fakeModule();
    const view = render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    view.unmount();
    expect(f.calls).toContain("dispose");
    expect(getHomeYardMode()).toBeNull();
  });

  it("reports a missing sheet as the Phaser HOME did", async () => {
    const f = fakeModule();
    render(<HomeYard fallback={null} loader={() => Promise.resolve(f.mod)} enabled />);
    await flush();
    f.options.onSheetError?.("a");
    f.options.onSheetError?.("b");
    expect(mockReport.mock.calls.map((c) => c[0])).toEqual(["player_texture_missing", "npc_texture_missing"]);
  });

  describe("falls back to the Phaser HOME", () => {
    it("when the module does not load", async () => {
      render(<HomeYard fallback={<p>phaser home</p>} loader={() => Promise.reject(new Error("404"))} enabled />);
      await flush();
      expect(screen.getByText("phaser home")).toBeTruthy();
      expect(mockReport).toHaveBeenCalledWith("home_yard_fallback", expect.any(Error), expect.objectContaining({ scene: "HomeYard" }));
      expect(getHomeYardMode()).toBe("phaser");
    });

    it("when the yard is not ready in time", async () => {
      jest.useFakeTimers();
      const f = fakeModule({ ready: new Promise(() => undefined) });
      render(<HomeYard fallback={<p>phaser home</p>} loader={() => Promise.resolve(f.mod)} timeoutMs={1000} enabled />);
      await flush();
      expect(screen.getByRole("status").textContent).toMatch(/Opening your yard/);
      act(() => {
        jest.advanceTimersByTime(1100);
      });
      expect(screen.getByText("phaser home")).toBeTruthy();
      expect(f.calls).toContain("dispose");
      expect(mockReport).toHaveBeenCalledWith("home_yard_fallback", expect.objectContaining({ reason: "timeout" }), expect.objectContaining({ reason: "timeout" }));
      jest.useRealTimers();
    });

    it("when createHomeYard throws", async () => {
      const mod: HomeYardModule = {
        HOME_YARD_API_VERSION,
        createHomeYard: () => {
          throw new Error("no context");
        },
      };
      render(<HomeYard fallback={<p>phaser home</p>} loader={() => Promise.resolve(mod)} enabled />);
      await flush();
      expect(screen.getByText("phaser home")).toBeTruthy();
      expect(mockReport).toHaveBeenCalledWith("home_yard_fallback", expect.anything(), expect.objectContaining({ reason: "create" }));
    });

    it("when the kill switch is off, without loading anything", async () => {
      const loader = jest.fn();
      render(<HomeYard fallback={<p>phaser home</p>} loader={loader} enabled={false} />);
      await flush();
      expect(screen.getByText("phaser home")).toBeTruthy();
      expect(loader).not.toHaveBeenCalled();
      expect(getHomeYardMode()).toBe("phaser");
    });
  });
});

describe("loadHomeYard", () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
  });
  const withWebGL = (on: boolean) => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => (on ? ({ getExtension: () => null } as unknown as RenderingContext) : null)) as never;
  };

  it("imports the built entry and checks its API version", async () => {
    withWebGL(true);
    const good = { HOME_YARD_API_VERSION, createHomeYard: () => null };
    const load = jest.fn(() => Promise.resolve(good));
    await expect(loadHomeYard(HOME_YARD_ENTRY, load)).resolves.toBe(good);
    expect(load).toHaveBeenCalledWith(HOME_YARD_ENTRY);
    await expect(loadHomeYard("/x.js", () => Promise.resolve({ HOME_YARD_API_VERSION: 99, createHomeYard: () => null }))).rejects.toMatchObject({ reason: "version" });
    await expect(loadHomeYard("/x.js", () => Promise.reject(new Error("404")))).rejects.toMatchObject({ reason: "import" });
  });

  it("refuses without WebGL before importing anything", async () => {
    withWebGL(false);
    const load = jest.fn();
    await expect(loadHomeYard(HOME_YARD_ENTRY, load)).rejects.toMatchObject({ reason: "webgl" });
    expect(load).not.toHaveBeenCalled();
  });
});

describe("home yard pieces", () => {
  it("the kill switch is on unless set to 0 / false / off / no", () => {
    expect(homeYardEnabled(undefined)).toBe(true);
    expect(homeYardEnabled("")).toBe(true);
    expect(homeYardEnabled("1")).toBe(true);
    expect(homeYardEnabled("on")).toBe(true);
    for (const off of ["0", "false", "OFF", " no "]) expect(homeYardEnabled(off)).toBe(false);
  });

  it("maps cats: profile list as fallback, the active cat added and fresh from the profile", () => {
    const fresh = cat("z", { status: { EAT: 0 } as ICat["status"], blessing: {} as ICat["blessing"] });
    const fromProfile = homeYardCats(undefined, [cat("x")], fresh);
    expect(fromProfile.map((c) => [c.id, c.active, c.hungry, c.blessed])).toEqual([
      ["z", true, true, true],
      ["x", false, false, false],
    ]);
    const stale = cat("x", { status: { EAT: 0 } as ICat["status"] });
    const fed = cat("x", { status: { EAT: 4 } as ICat["status"] });
    expect(homeYardCats([stale, cat("y")], [], fed)[0]).toMatchObject({ id: "x", active: true, hungry: false });
    expect(homeYardCats([], [], null)).toEqual([]);
    expect(isHungry(undefined)).toBe(true);
    expect(findOwnedCat("y", undefined, [cat("y")])?._id).toBe("y");
  });

  it("the generated entry points at a module built into public/heist-game", () => {
    expect(HOME_YARD_ENTRY).toMatch(/^\/heist-game\/build\/home-[\w-]+\.js$/);
    const file = join(__dirname, "..", "public", HOME_YARD_ENTRY);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/createHomeYard/);
  });

  it("the crash guard ignores a GAME_LOADED without a Phaser scene", () => {
    jest.useFakeTimers();
    const cleanup = installPhaserCrashGuard({ stallMs: 1000, checkMs: 100 });
    GameEvents.GAME_LOADED.push();
    jest.advanceTimersByTime(60_000);
    expect(mockReport).not.toHaveBeenCalled();
    cleanup();
    jest.useRealTimers();
  });
});
