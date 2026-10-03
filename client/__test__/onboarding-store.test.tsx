/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { FIRST_MODE, useOnboardingHandoff } from "@/components/onboarding/handoff";
import { heroFor, onboardingStore, type HeroCat } from "@/components/onboarding/store";

/** The lobby hero stand-in and the hand-off (review 4a #4, #5, #9). */

const setGameType = jest.fn();
const setLevel = jest.fn();
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ setGameType, setLevel }) }));

const HERO: HeroCat = { name: "Nimbus", image: "/misty.gif", replacesId: "guest-starter" };

describe("heroFor", () => {
  it("stands in while the profile still shows the cat it replaced, or no cat yet", () => {
    expect(heroFor(HERO, "guest-starter", true)).toBe(HERO);
    expect(heroFor(HERO, undefined, false)).toBe(HERO);
  });

  it("gives way to the profile once it shows another cat (committed, switched, another account)", () => {
    expect(heroFor(HERO, "c-committed", true)).toBeNull();
    expect(heroFor(HERO, "whiskers", true)).toBeNull();
    expect(heroFor(null, "guest-starter", true)).toBeNull();
  });

  it("a stand-in for a cat without an id matches only a profile cat without one", () => {
    const hero = { ...HERO, replacesId: null };
    expect(heroFor(hero, undefined, true)).toBe(hero);
    expect(heroFor(hero, "c1", true)).toBeNull();
  });
});

describe("useOnboardingHandoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setGameType.mockClear();
    setLevel.mockClear();
    onboardingStore.reset();
  });
  afterEach(() => jest.useRealTimers());

  it("shows the lobby beat, then opens Cupid Cat level 1 and ends the post-ceremony entrance", () => {
    const { result } = renderHook(() => useOnboardingHandoff());
    const api = result.current;
    act(() => api.start());
    expect(onboardingStore.get()).toMatchObject({ justFinished: true, firstRunLabel: FIRST_MODE.label });
    expect(setGameType).toHaveBeenLastCalledWith(null);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // Mode and level in one call (5a review #10: one `select`, no routing in between).
    expect(setGameType).toHaveBeenLastCalledWith(FIRST_MODE.gameType, "1");
    expect(setLevel).not.toHaveBeenCalled();
    expect(onboardingStore.get()).toMatchObject({ justFinished: false, firstRunLabel: null });
  });

  it("cancel stops a pending hand-off (the player picked a mode during the beat)", () => {
    const { result } = renderHook(() => useOnboardingHandoff());
    const api = result.current;
    act(() => api.start());
    act(() => api.cancel());
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(setGameType).not.toHaveBeenCalledWith(FIRST_MODE.gameType);
    expect(onboardingStore.get().firstRunLabel).toBeNull();
  });
});
