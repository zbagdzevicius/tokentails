/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GameType } from "@/models/game";
import { CATNIP_CHAOS_LEVELS } from "@/shared-contracts/caps";

/**
 * GameContext run lifecycle (plan F6, G10, task 5a):
 * - RUN_BEGIN is the only start signal: one restart gives exactly one GAME_RESTART, one
 *   RUN_READY, one RUN_BEGIN and one `game_start`;
 * - the save policy: wins save with `outcome`, hard deaths save only a new best, soft stops never;
 * - hard deaths keep the mode on screen (no GameSelect flash) and show the DeathCard;
 * - the first clear calls `saveNudge.firstClear()` and exposes `lastOutcome`;
 * - first-time routing sends a player with no clears straight to level 1.
 * Review fixes (5a review #1, #2, #6, #9, #10): clears are per player, INFINITE never counts
 * towards the assist, routing waits for the profile, "saved" waits for the save, the hand-off's
 * mode-and-level call counts one `select`.
 */

const mockGameRun = {
  select: jest.fn(),
  restart: jest.fn(),
  start: jest.fn(),
  loaded: jest.fn(),
  stop: jest.fn(),
  leave: jest.fn(),
  lifeLost: jest.fn(),
  hintShown: jest.fn(),
  hintDone: jest.fn(),
  firstClear: jest.fn(),
  abandon: jest.fn(),
};
jest.mock("@/analytics", () => ({
  gameRun: mockGameRun,
  reportAppError: jest.fn(),
  analytics: { track: jest.fn() },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
}));

const mockSaveMatch = jest.fn();
jest.mock("@/api/user-api", () => ({
  USER_API: { saveMatch: (...args: unknown[]) => mockSaveMatch(...args) },
  MatchSaveThrottledError: class extends Error {},
}));

const mockFirstClear = jest.fn();
jest.mock("@/context/auth/saveNudge", () => ({ saveNudge: { firstClear: () => mockFirstClear() } }));

let mockProfile: Record<string, unknown> | null = null;
const mockSetProfileUpdate = jest.fn();
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: mockProfile, setProfileUpdate: mockSetProfileUpdate }),
}));
let mockAuthStatus = "ready";
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => ({ authStatus: mockAuthStatus }) }));
const mockToast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock("@/components/Phaser/onboarding/haptics", () => ({ haptic: jest.fn() }));

// Heavy surfaces GameContext renders, out of scope here.
const stub = (name: string) => () => <div data-testid={name} />;
jest.mock("@/components/game/GameSelect", () => ({ GameSelect: () => <div data-testid="game-select" /> }));
jest.mock("@/components/game/GameOptionsModal", () => ({ GameOptionsModal: () => null }));
jest.mock("@/components/Phaser/MobileButtons/MobileButtons", () => ({ MobileButtons: () => null }));
jest.mock("@/components/shared/CatsModal", () => ({ CatsModal: () => null }));
jest.mock("@/components/shared/CodexModal", () => ({ CodexModal: () => null }));
jest.mock("@/components/shared/InviteModal", () => ({ InviteModal: () => null }));
jest.mock("@/components/shared/Notification", () => ({ Notification: () => null }));
jest.mock("@/components/shared/PacksModal", () => ({ PacksModal: () => null }));
jest.mock("@/components/shared/QuestsModal", () => ({ QuestsModal: () => null }));
jest.mock("@/components/shared/SupportModal", () => ({ SupportModal: () => null }));
jest.mock("@/components/shared/ProfileModal", () => ({ ProfileModal: () => null }));
jest.mock("@/components/shared/WheelModal", () => ({ WheelModal: () => null }));
jest.mock("@/components/shared/GameMusicPlayer", () => ({ GameMusicPlayer: () => null }));
jest.mock("@/components/shared/EndGameModal", () => ({
  EndGameModal: ({ tryAgain }: { tryAgain: () => void }) => (
    <button type="button" data-testid="end-game" onClick={() => tryAgain()}>
      PLAY AGAIN
    </button>
  ),
}));
jest.mock("@/components/shared/PixelRescueEndGameModal", () => ({ PixelRescueEndGameModal: stub("pixel-end") }));

import { GameProvider, useGame } from "@/context/GameContext";
import { GameEvents } from "@/components/Phaser/events";
import { ftueStore } from "@/components/Phaser/onboarding/ftue-store";

// These tests cover the Cupid Cat flows, so they run inside its season (January to March).
jest.mock("@/components/game/seasons", () => ({
  ...jest.requireActual("@/components/game/seasons"),
  isCupidSeason: () => true,
}));


type GameApi = ReturnType<typeof useGame>;
const apiRef: { current: GameApi | null } = { current: null };
const Probe = () => {
  const game = useGame();
  React.useEffect(() => {
    apiRef.current = game;
  });
  return (
    <div>
      <span data-testid="started">{String(!!game.isStarted)}</span>
      <span data-testid="level">{game.level ?? ""}</span>
      <span data-testid="outcome">{game.lastOutcome ? JSON.stringify(game.lastOutcome) : ""}</span>
    </div>
  );
};
const api = () => apiRef.current!;

const renderGame = () =>
  render(
    <GameProvider>
      <Probe />
    </GameProvider>,
  );

/** Counts window events of one type. */
const counter = (type: string) => {
  let n = 0;
  const listener = () => (n += 1);
  window.addEventListener(type, listener);
  return { get: () => n, stop: () => window.removeEventListener(type, listener) };
};

const cleared = (...levels: string[]) => CATNIP_CHAOS_LEVELS.map((level) => (levels.includes(level) ? 1 : 0));

beforeAll(() => {
  // PixelButton plays a click; jsdom has no media playback.
  jest.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
});

beforeEach(() => {
  ftueStore.reset();
  mockProfile = { _id: "p", cat: { _id: "c" }, catnipChaos: [0, 4, 2], catnipChaosCleared: cleared("11") };
  mockAuthStatus = "ready";
  mockSaveMatch.mockResolvedValue({ catnipChaos: [0, 6], catnipChaosCleared: cleared("11", "12") });
});

const enterLevel = (level: string) => {
  act(() => api().setGameType(GameType.CATNIP_CHAOS));
  act(() => api().setLevel(level));
};

describe("GameContext run lifecycle", () => {
  it("one restart gives exactly one restart, one ready, one begin and one game_start", async () => {
    renderGame();
    enterLevel("12");
    // A scene that restarts on GAME_RESTART: ready, then begins on the player's input.
    const onRestart = () => {
      GameEvents.RUN_READY.push({ isRestart: true });
      GameEvents.RUN_BEGIN.push({});
    };
    window.addEventListener("GAME_RESTART", onRestart);
    const restarts = counter("GAME_RESTART");
    const readies = counter("RUN_READY");
    const begins = counter("RUN_BEGIN");
    const starts = counter("GAME_START");

    await act(async () => GameEvents.GAME_STOP.push({ score: 1, time: 0, outcome: "died" }));
    expect(screen.getByTestId("death-card")).toBeTruthy();
    mockGameRun.start.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));

    expect(restarts.get()).toBe(1);
    expect(readies.get()).toBe(1);
    expect(begins.get()).toBe(1);
    expect(starts.get()).toBe(0);
    expect(mockGameRun.restart).toHaveBeenCalledTimes(1);
    expect(mockGameRun.start).toHaveBeenCalledTimes(1);
    expect(mockGameRun.start).toHaveBeenCalledWith({ mode: GameType.CATNIP_CHAOS, level: "12", isRestart: undefined });
    expect(screen.queryByTestId("death-card")).toBeNull();
    window.removeEventListener("GAME_RESTART", onRestart);
    [restarts, readies, begins, starts].forEach((c) => c.stop());
  });

  it("does not send game_start for the deprecated GAME_START", () => {
    renderGame();
    enterLevel("12");
    act(() => GameEvents.GAME_START.push({}));
    expect(mockGameRun.start).not.toHaveBeenCalled();
    act(() => GameEvents.RUN_BEGIN.push({ isRestart: false }));
    expect(mockGameRun.start).toHaveBeenCalledTimes(1);
  });

  it("saves a win with its outcome, records the first clear and calls the save nudge", async () => {
    renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 6, time: 0, outcome: "won" }));
    expect(mockSaveMatch).toHaveBeenCalledTimes(1);
    expect(mockSaveMatch).toHaveBeenCalledWith(expect.objectContaining({ type: GameType.CATNIP_CHAOS, level: "12", points: 6, outcome: "won" }));
    expect(mockFirstClear).toHaveBeenCalledTimes(1);
    expect(mockGameRun.firstClear).toHaveBeenCalledWith({ mode: GameType.CATNIP_CHAOS, level: "12" });
    expect(JSON.parse(screen.getByTestId("outcome").textContent!)).toEqual({ mode: GameType.CATNIP_CHAOS, level: "12", outcome: "won", clearedNow: true });
    expect(ftueStore.localClears(GameType.CATNIP_CHAOS)).toEqual(["12"]);
    await waitFor(() => expect(mockSetProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ catnipChaosCleared: cleared("11", "12") })));
    expect(screen.getByTestId("end-game")).toBeTruthy();
  });

  it("a repeat clear is not a first clear", async () => {
    renderGame();
    enterLevel("11");
    await act(async () => GameEvents.GAME_STOP.push({ score: 6, time: 0, outcome: "won" }));
    expect(mockFirstClear).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId("outcome").textContent!).clearedNow).toBe(false);
  });

  it("keeps the mode on screen after a hard death and saves only a new best", async () => {
    renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 2, time: 0, outcome: "died" }));
    expect(mockSaveMatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("started").textContent).toBe("true");
    expect(screen.queryByTestId("game-select")).toBeNull();
    expect(screen.getByTestId("death-card")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await act(async () => GameEvents.GAME_STOP.push({ score: 3, time: 0, outcome: "died" }));
    expect(mockSaveMatch).toHaveBeenCalledTimes(1);
    expect(mockSaveMatch).toHaveBeenCalledWith(expect.objectContaining({ points: 3, outcome: "died" }));
  });

  it("never saves a soft stop and shows nothing for it", async () => {
    renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 9, time: 0, outcome: "quit" }));
    expect(mockSaveMatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("death-card")).toBeNull();
    expect(screen.queryByTestId("end-game")).toBeNull();
  });

  it("clamps the endless run to its cap before saving", async () => {
    renderGame();
    enterLevel("01");
    await act(async () => GameEvents.GAME_STOP.push({ score: 731, time: 0, outcome: "died" }));
    expect(mockSaveMatch).toHaveBeenCalledWith(expect.objectContaining({ level: "01", points: 500 }));
    expect(screen.getByText("Run over")).toBeTruthy();
  });

  it("shows the DeathCard to a signed-out player and sends nothing", async () => {
    mockAuthStatus = "signed-out";
    renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 7, time: 0, outcome: "died" }));
    expect(screen.getByTestId("death-card")).toBeTruthy();
    expect(mockSaveMatch).not.toHaveBeenCalled();
  });

  it("suggests Extra guards after three hard deaths on a Purrsuit level", async () => {
    renderGame();
    enterLevel("12");
    for (let i = 0; i < 3; i++) {
      await act(async () => GameEvents.GAME_STOP.push({ score: 0, time: 0, outcome: "died", cause: "spike" }));
      if (i < 2) {
        expect(screen.queryByTestId("death-assist")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
      }
    }
    expect(screen.getByTestId("death-assist")).toBeTruthy();
    expect(screen.getByTestId("death-tip").textContent).toMatch(/spikes/);
    fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(ftueStore.assists().extraGuards).toBe(true);
    expect(screen.getByText("On for your next try")).toBeTruthy();
    // The button went away; focus moved to RETRY instead of dropping to the body.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "RETRY" }));
  });

  it("never suggests Extra guards on INFINITE (every run there ends as died)", async () => {
    renderGame();
    enterLevel("01");
    for (let i = 0; i < 4; i++) {
      await act(async () => GameEvents.GAME_STOP.push({ score: 0, time: 0, outcome: "died" }));
      expect(screen.queryByTestId("death-assist")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    }
    expect(ftueStore.hardDeaths(GameType.CATNIP_CHAOS, "01")).toBe(0);
  });

  it("says saved only once the new best's save answered, and not saved when it failed", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    mockSaveMatch.mockReturnValueOnce(new Promise((resolve) => (resolveSave = resolve)));
    renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 3, time: 0, outcome: "died" }));
    expect(screen.getByTestId("death-new-best").textContent).toBe("New best");
    await act(async () => resolveSave({ catnipChaos: [0, 4, 3] }));
    expect(screen.getByTestId("death-new-best").textContent).toBe("New best, saved");

    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    mockSaveMatch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => GameEvents.GAME_STOP.push({ score: 4, time: 0, outcome: "died" }));
    await waitFor(() => expect(screen.getByTestId("death-new-best").textContent).toBe("New best, not saved"));
  });

  it("does not hand one player's local clears to the next player on this device", async () => {
    // Player p wins 1-2, but the save fails: the server never learns of it.
    mockSaveMatch.mockRejectedValueOnce(new Error("offline"));
    const { unmount } = renderGame();
    enterLevel("12");
    await act(async () => GameEvents.GAME_STOP.push({ score: 6, time: 0, outcome: "won" }));
    expect(ftueStore.localClears(GameType.CATNIP_CHAOS)).toEqual(["12"]);
    unmount();

    // Player q (no clears on the server) on the same device: routed to 1-1, and q's own first
    // clear of 1-2 is a first clear.
    mockProfile = { _id: "q", cat: { _id: "c2" }, catnipChaos: [], catnipChaosCleared: cleared() };
    mockFirstClear.mockClear();
    renderGame();
    expect(ftueStore.owner()).toBe("q");
    expect(ftueStore.localClears(GameType.CATNIP_CHAOS)).toEqual([]);
    act(() => api().setGameType(GameType.CATNIP_CHAOS));
    expect(screen.getByTestId("level").textContent).toBe("11");
    act(() => api().setLevel("12"));
    await act(async () => GameEvents.GAME_STOP.push({ score: 6, time: 0, outcome: "won" }));
    expect(mockFirstClear).toHaveBeenCalledTimes(1);
  });

  it("does not route while the profile is still loading", () => {
    mockAuthStatus = "loading-profile";
    mockProfile = null;
    renderGame();
    act(() => api().setGameType(GameType.CATNIP_CHAOS));
    expect(screen.getByTestId("level").textContent).toBe("");
  });

  it("opens a mode and level in one call with one select (the hand-off)", () => {
    mockProfile = { _id: "p", catnipChaos: [], catnipChaosCleared: [] };
    renderGame();
    mockGameRun.select.mockClear();
    act(() => api().setGameType(GameType.PIXEL_RESCUE, "1"));
    expect(mockGameRun.select).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("level").textContent).toBe("1");
    expect(screen.getByTestId("started").textContent).toBe("true");
  });

  it("routes a player with no clears straight to level 1, and others to the level map", () => {
    mockProfile = { _id: "p", catnipChaos: [], catnipChaosCleared: [] };
    const { unmount } = renderGame();
    act(() => api().setGameType(GameType.CATNIP_CHAOS));
    expect(screen.getByTestId("level").textContent).toBe("11");
    expect(screen.getByTestId("started").textContent).toBe("true");
    unmount();

    mockProfile = { _id: "p", catnipChaos: [0, 3], catnipChaosCleared: cleared("11") };
    renderGame();
    act(() => api().setGameType(GameType.CATNIP_CHAOS));
    expect(screen.getByTestId("level").textContent).toBe("");
  });

  it("tells analytics about soft deaths and hints", () => {
    renderGame();
    enterLevel("12");
    act(() => GameEvents.LIFE_LOST.push({ guardsLeft: 2, cause: "spike" }));
    expect(mockGameRun.lifeLost).toHaveBeenCalledWith({ mode: GameType.CATNIP_CHAOS, level: "12" }, 2);
    act(() => GameEvents.RUN_HINT.push({ hint: "first-spike", text: "JUMP!", kind: "prompt" }));
    act(() => GameEvents.RUN_HINT_DONE.push({ hint: "first-spike", result: "done" }));
    expect(mockGameRun.hintShown).toHaveBeenCalledWith({ mode: GameType.CATNIP_CHAOS, level: "12" }, "first-spike");
    expect(mockGameRun.hintDone).toHaveBeenCalledTimes(1);
  });
});
