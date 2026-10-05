/**
 * @jest-environment jsdom
 *
 * MY HOME as the Cat Yard, the pieces around the yard itself: the HOME HUD (FEED {name}, the
 * top-left nav, the measured feed panel), which HOME the mode store reports before HomeYard has
 * mounted (no flash of the old layout), the mobile controls and snowfall rules, the HOME backdrop,
 * the shared select flow, and HOME's sounds.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ICat } from "@/models/cats";
import { GameType } from "@/models/game";

// The manifest fetch never settles here: the hook keeps its first (cached or default) answer.
jest.mock("@/components/Phaser/look/manifest", () => ({
  ...jest.requireActual("@/components/Phaser/look/manifest"),
  fetchLookManifest: () => new Promise(() => undefined),
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, onClick }: { text: string; onClick?: () => void }) => <button onClick={onClick}>{text}</button>,
}));
jest.mock("@/components/shared/game/StatusBar", () => ({
  StatusBar: ({ status }: { status: number }) => <div data-testid="eat-bar" data-status={status} />,
}));

const mockSetProfileUpdate = jest.fn();
const mockSetGameType = jest.fn();
const mockToast = jest.fn();
const mockSetActive = jest.fn();
const profileState: { profile: { cat: ICat; cats: ICat[] } | null } = { profile: null };
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: profileState.profile, setProfileUpdate: mockSetProfileUpdate }),
}));
jest.mock("@/context/CatContext", () => ({ MAX_CAT_STATUS: 4 }));
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ setGameType: mockSetGameType }) }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));
jest.mock("@/api/cat-api", () => ({ CAT_API: { setActive: (id: string) => mockSetActive(id) } }));

import { YardHomeHud } from "@/components/home/YardHomeHud";
import {
  getHomeFeedPanelHeight,
  isYardHome,
  phaserHomeControls,
  resolveHomeYardMode,
  setHomeFeedPanelHeight,
  setHomeYardMode,
  useHomeYardMode,
} from "@/components/home/homeYardMode";
import { CARD_ABOVE_FEED_PX, CARD_BOTTOM_PX, cardBottomPx } from "@/components/home/HomeYard";
import { useSelectHomeCat } from "@/components/home/useSelectHomeCat";
import { GameEvent } from "@/components/Phaser/events";
import { SKY_YARD_DUSK, useBackground } from "@/constants/hooks";

const cat = (id: string, eat: number): ICat =>
  ({ _id: id, name: id.toUpperCase(), catImg: `${id}.gif`, spriteImg: `${id}.png`, status: { EAT: eat } }) as unknown as ICat;

beforeEach(() => {
  setHomeYardMode(null);
  setHomeFeedPanelHeight(0);
  jest.clearAllMocks();
});

describe("YardHomeHud", () => {
  const handlers = () => ({ onBack: jest.fn(), onShelter: jest.fn(), onFeed: jest.fn() });

  it("shows GO BACK and SHELTER top-left, and FEED {name} with the EAT bar for a hungry cat", () => {
    const h = handlers();
    render(<YardHomeHud cat={cat("luna", 1)} {...h} />);
    const nav = screen.getByTestId("home-yard-nav");
    expect(nav.style.top).toContain("safe-area-inset-top");
    expect(nav.style.left).toContain("safe-area-inset-left");
    fireEvent.click(screen.getByText("← GO BACK"));
    fireEvent.click(screen.getByText("SHELTER"));
    fireEvent.click(screen.getByText("FEED LUNA"));
    expect(h.onBack).toHaveBeenCalledTimes(1);
    expect(h.onShelter).toHaveBeenCalledTimes(1);
    expect(h.onFeed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("eat-bar").dataset.status).toBe("1");
    expect(screen.queryByText("Feed To Control")).toBeNull();
  });

  it("hides the feed panel once the cat is fed, and the nav stays", () => {
    const h = handlers();
    const view = render(<YardHomeHud cat={cat("luna", 1)} {...h} />);
    expect(screen.getByTestId("home-yard-feed")).toBeTruthy();
    view.rerender(<YardHomeHud cat={cat("luna", 4)} {...h} />);
    expect(screen.queryByTestId("home-yard-feed")).toBeNull();
    expect(screen.getByText("← GO BACK")).toBeTruthy();
  });

  it("reports the feed panel's height for the yard's name card, and 0 once it hides", () => {
    const rect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 96, width: 160, top: 0, left: 0, right: 160, bottom: 96, x: 0, y: 0, toJSON: () => ({}) });
    const h = handlers();
    const view = render(<YardHomeHud cat={cat("luna", 1)} {...h} />);
    expect(getHomeFeedPanelHeight()).toBe(96);
    view.rerender(<YardHomeHud cat={cat("luna", 4)} {...h} />);
    expect(getHomeFeedPanelHeight()).toBe(0);
    rect.mockRestore();
  });

  it("the name card sits above the measured panel, else above the default room", () => {
    expect(cardBottomPx(true, 0)).toBe(CARD_ABOVE_FEED_PX);
    expect(cardBottomPx(false, 0)).toBe(CARD_BOTTOM_PX);
    expect(cardBottomPx(true, 96)).toBe(96 + 12 + 8);
  });
});

describe("HOME mode", () => {
  it("reads as the yard before HomeYard has reported (no flash of the old HUD), unless switched off", () => {
    expect(resolveHomeYardMode(null, true)).toBe("yard");
    expect(resolveHomeYardMode(null, false)).toBe("phaser");
    expect(resolveHomeYardMode("phaser", true)).toBe("phaser");
    const { result } = renderHook(() => useHomeYardMode());
    expect(result.current).toBe("yard");
    act(() => setHomeYardMode("phaser"));
    expect(result.current).toBe("phaser");
  });

  it("snowfall and the yard HUD follow isYardHome; mobile controls only for a fed Phaser HOME", () => {
    expect(isYardHome(GameType.HOME, "yard")).toBe(true);
    expect(isYardHome(GameType.HOME, "phaser")).toBe(false);
    expect(isYardHome(GameType.SHELTER, "yard")).toBe(false);
    expect(phaserHomeControls(GameType.HOME, "yard", 4)).toBe(false);
    expect(phaserHomeControls(GameType.HOME, "phaser", 0)).toBe(false);
    expect(phaserHomeControls(GameType.HOME, "phaser", 2)).toBe(true);
    expect(phaserHomeControls(GameType.SHELTER, "phaser", 4)).toBe(false);
  });

  it("the yard HOME paints its own dusk sky (no look poster); the Phaser HOME keeps its backdrop", () => {
    const yard = renderHook(() => useBackground({ gameType: GameType.HOME, homeYard: true }));
    expect(yard.result.current.backgroundImage).toBe(SKY_YARD_DUSK);
    const phaser = renderHook(() => useBackground({ gameType: GameType.HOME, homeYard: false }));
    expect(phaser.result.current.backgroundImage).not.toBe(SKY_YARD_DUSK);
    expect(phaser.result.current.backgroundImage).toBeTruthy();
  });
});

describe("useSelectHomeCat", () => {
  beforeEach(() => {
    const me = cat("a", 4);
    profileState.profile = { cat: me, cats: [me, cat("b", 1)] };
  });

  it("selects a hungry cat and re-enters HOME for it", () => {
    const spawn = jest.fn();
    window.addEventListener(GameEvent.CAT_SPAWN, spawn);
    const { result } = renderHook(() => useSelectHomeCat());
    act(() => result.current(cat("b", 1)));
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ cat: expect.objectContaining({ _id: "b" }) }));
    expect(mockSetActive).toHaveBeenCalledWith("b");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: "B selected successfully!", img: "b.gif" }));
    expect(mockSetGameType).toHaveBeenCalledWith(GameType.HOME);
    window.removeEventListener(GameEvent.CAT_SPAWN, spawn);
  });

  it("refuses the active cat or no cat", () => {
    const { result } = renderHook(() => useSelectHomeCat());
    act(() => result.current(cat("a", 4)));
    act(() => result.current(undefined));
    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledWith({ message: "This cat is already selected" });
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});

describe("homeSfx", () => {
  it("a replay of the eating sound clears the old 2 s cut", () => {
    jest.useFakeTimers();
    const pause = jest.fn();
    const play = jest.fn(() => Promise.resolve());
    const audio = jest.spyOn(window, "Audio").mockImplementation(
      () => ({ play, pause, volume: 1, currentTime: 0 }) as unknown as HTMLAudioElement,
    );
    jest.isolateModules(() => {
      jest.doMock("@/components/audio/uiSounds", () => ({ systemAudioAllowed: () => true }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { playHomeSound } = require("@/components/home/homeSfx") as typeof import("@/components/home/homeSfx");
      playHomeSound("eat");
      jest.advanceTimersByTime(1500);
      playHomeSound("eat");
      jest.advanceTimersByTime(1000); // 2.5 s after the first play, 1 s after the replay
      expect(pause).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(pause).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(2);
    });
    audio.mockRestore();
    jest.useRealTimers();
  });
});
