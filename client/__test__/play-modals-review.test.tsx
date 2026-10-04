/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { GameType } from "@/models/game";

/** The end-of-run review (group "play"): truthful score lines, one level name, Cupid's next day. */

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ level: "1" }) }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: null }) }));
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => null }));
jest.mock("@/components/impact/EndGamePaw", () => ({ EndGamePaw: () => null }));
jest.mock("@/components/game/RunGate", () => ({ PawGuardIcon: () => null, useInputKind: () => "touch" }));

import { getGameLevelName, levelNameParts } from "@/components/game/levelNames";
import { scoreHelper } from "@/components/shared/EndGameModal";
import { cupidDayOpen, nextCupidDay } from "@/components/shared/PixelRescueEndGameModal";
import { DeathCard } from "@/components/game/DeathCard";

describe("scoreHelper: what happened to the points, never 'added to your total'", () => {
  it("waits for /live before saying saved", () => {
    expect(scoreHelper("catnip", 10, { saved: true, reason: "won", best: 0, state: "saving" })).toBe("Saving to your progress…");
    expect(scoreHelper("catnip", 10, { saved: true, reason: "won", best: 0, state: "saved" })).toBe("Saved to your progress.");
    expect(scoreHelper("catnip", 10, { saved: true, reason: "won", best: 4, state: "saved" })).toBe("New best, saved to your progress.");
    expect(scoreHelper("catnip", 3, { saved: true, reason: "won", best: 8, state: "saved" })).toBe("Saved. Your best here stays 8.");
    expect(scoreHelper("catnip", 3, { saved: true, reason: "won", best: 8, state: "failed" })).toMatch(/^Not saved/);
  });
  it("says why nothing was saved", () => {
    expect(scoreHelper("catnip", 10, { saved: false, reason: "no-session" })).toBe("Sign in to keep this catnip.");
    expect(scoreHelper("hearts", 10, { saved: false, reason: "no-session" })).toBe("Sign in to keep these hearts.");
    expect(scoreHelper("catnip", 3, { saved: false, reason: "not-better", best: 9 })).toBe("Your best here stays 9.");
    expect(scoreHelper("catnip", 3, null)).toBe("Collected this run.");
    expect(scoreHelper("catnip", 10, { saved: true, reason: "won", state: "saved", guest: true })).toBe("Saved as a guest. Sign in to keep it.");
  });
});

describe("one name per level on both end-of-run screens", () => {
  it("matches the RunGate names", () => {
    expect(levelNameParts("12", GameType.CATNIP_CHAOS)).toEqual({ title: "Level 1-2" });
    expect(levelNameParts("0", GameType.CATNIP_CHAOS)).toEqual({ title: "Infinite run" });
    expect(levelNameParts("4", GameType.PIXEL_RESCUE)).toEqual({ title: "Day 4" });
    const pm = levelNameParts("1", GameType.MATCH_3);
    expect(pm.title).toBe("Level 1");
    expect(getGameLevelName("1", GameType.MATCH_3)).toBe(`Level 1 · ${pm.detail}`);
  });
});

describe("Cupid Cat's next day", () => {
  it("is offered only once it is open", () => {
    const feb3 = new Date(2027, 1, 3);
    expect(cupidDayOpen("3", feb3)).toBe(true);
    expect(cupidDayOpen("4", feb3)).toBe(false);
    expect(nextCupidDay("2", feb3)).toEqual({ level: "3", open: true });
    expect(nextCupidDay("3", feb3)).toEqual({ level: "4", open: false });
    expect(nextCupidDay(null, feb3)).toBeNull();
    expect(cupidDayOpen("20", new Date(2027, 2, 1))).toBe(true);
  });
});

describe("DeathCard", () => {
  const base = {
    mode: GameType.MATCH_3,
    level: "1",
    levelName: "Level 1",
    levelDetail: "Kitten Starter 1",
    modeName: "Paw Match",
    outcome: "died" as const,
    onRetry: jest.fn(),
    onLevels: jest.fn(),
  };
  it("a new best is one tile with its save state, not two equal tiles", () => {
    render(<DeathCard {...base} points={3} best={0} newBest saveState="saved" />);
    expect(screen.getByTestId("death-points").textContent).toMatch(/3/);
    expect(screen.queryByTestId("death-best")).toBeNull();
    expect(screen.getByTestId("death-new-best").textContent).toBe("New best, saved");
    expect(screen.getByText("Kitten Starter 1 · Paw Match")).toBeTruthy();
    expect(levelNameParts("1", GameType.MATCH_3).detail).toBe("Kitten Starter 1");
  });
  it("shows the best beside this run otherwise, and no empty level chip", () => {
    render(<DeathCard {...base} levelName="" points={2} best={5} />);
    expect(screen.getByTestId("death-best").textContent).toMatch(/5/);
    expect(screen.queryByText(/^Level/)).toBeNull();
  });
});
