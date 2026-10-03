/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

/**
 * Task 4c (plan G6 "Overlay migration", F3.3/F3.4): Cats, Wheel, Packs, Pack, Profile, Shop
 * (InviteModal), Events (QuestsModal), Codex, Support and Share are GameModals: a named dialog on
 * the night surface, Esc / X / scrim close it, focus returns to the opener, and the Phaser games
 * are suspended while it is open. No cream scrim and no ad hoc z value is left.
 */

const mockSuspend = jest.fn();
jest.mock("@/hooks/useSuspendGame", () => ({ useSuspendGame: (active: boolean) => mockSuspend(active) }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn(), analytics: { enabled: false, track: jest.fn() } }));
jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
  bgStyle: () => ({}),
  isMobile: () => false,
}));
const mockProfile = {
  _id: "u1",
  name: "Player",
  tails: 10,
  streak: 1,
  canRedeemLives: true,
  cat: { _id: "c1", name: "Scout", isStarter: true, catImg: "/cat.png" },
  quests: [],
  codex: [],
};
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({
    profile: mockProfile,
    setProfileUpdate: jest.fn(),
    utils: { shareURL: jest.fn(), openLink: jest.fn() },
    shareUrl: "https://tokentails.com/?ref=u1",
    logout: jest.fn(),
    isFB: true,
  }),
}));
jest.mock("@/context/GameContext", () => ({
  useGame: () => ({ setOpenedModal: jest.fn(), setGameType: jest.fn(), addNotification: jest.fn() }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
const mockAuth = {
  authStatus: "ready",
  requireAccount: jest.fn(async () => "signed-in"),
  signOut: jest.fn(async () => undefined),
  eraseGuest: jest.fn(async () => true),
  user: { uid: "u", isAnonymous: false, email: "a@b.c", emailVerified: true, providers: ["google.com"] },
};
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => mockAuth }));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@capacitor/clipboard", () => ({ Clipboard: { write: jest.fn() } }));
jest.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: { signInWithApple: jest.fn() } }));
jest.mock("@/api/user-api", () => ({ USER_API: { redeem: jest.fn(), deleteMe: jest.fn(), saveProfileTwitter: jest.fn() } }));
jest.mock("@/api/cat-api", () => ({ CAT_API: { cats: jest.fn(), stake: jest.fn(), stakingRedeem: jest.fn(), setActive: jest.fn() } }));
jest.mock("@/api/quest-api", () => ({ QUEST_API: { find: jest.fn(), complete: jest.fn() } }));
jest.mock("@/api/ticket-api", () => ({ TICKET_API: { getTickets: jest.fn(), createTicket: jest.fn() } }));
jest.mock("@/components/codex/Codex", () => ({ Codex: () => <p>codex body</p> }));
jest.mock("@/components/mystery/MysteryBoxCat", () => ({ MysteryBoxCat: () => <p>loot box</p> }));
jest.mock("@/components/web3/Web3Providers", () => ({ Web3Providers: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/Leaderboard", () => ({ LeaderboardContent: () => <p>board</p> }));
jest.mock("@/components/LeaderboardCatnip", () => ({ LeaderboardCatnipContent: () => <p>catnip board</p> }));
jest.mock("@/components/LeaderboardRescuer", () => ({ LeaderboardRescuerContent: () => <p>rescuers</p> }));
jest.mock("@/components/tailsCard/TailsCardPack", () => ({ TailsCardPack: () => <p>pack art</p> }));
jest.mock("@/components/tailsCard/TailsCardMini", () => ({ TailsCardMini: () => <p>mini</p> }));
jest.mock("@/components/tailsCard/TailsCardModal", () => ({ TailsCardModal: () => null }));
jest.mock("@/components/shared/Wheel", () => {
  const Wheel = React.forwardRef(() => <canvas aria-hidden="true" />);
  Wheel.displayName = "Wheel";
  return { __esModule: true, default: Wheel };
});
jest.mock("@/components/shared/GameMusicToggler", () => ({ GameMusicToggle: () => null }));
jest.mock("@/components/shared/AnalyticsConsentBanner", () => ({ AnalyticsSettingsButton: () => null }));
jest.mock("@/components/shared/Countdown", () => ({ Countdown: () => <p>countdown</p> }));
jest.mock("next-share", () => ({
  FacebookShareButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  FacebookMessengerShareButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));
jest.mock("next/dynamic", () => () => () => null);

import { CatsModal } from "@/components/shared/CatsModal";
import { WheelModal } from "@/components/shared/WheelModal";
import { PacksModal } from "@/components/shared/PacksModal";
import { PackModal } from "@/components/shared/PackModal";
import { ProfileModal } from "@/components/shared/ProfileModal";
import { InviteModal } from "@/components/shared/InviteModal";
import { QuestsModal } from "@/components/shared/QuestsModal";
import { CodexModal } from "@/components/shared/CodexModal";
import { SupportModal } from "@/components/shared/SupportModal";
import { ShareModal } from "@/components/shared/ShareModal";
import type { ICat } from "@/models/cats";

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: query.includes("max-width"), addEventListener: jest.fn(), removeEventListener: jest.fn() }),
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: () => Promise.resolve({ state: "granted" }) },
  });
});

type CloseProps = { close: () => void };
const MODALS: Array<{ name: string; title: string; render: (props: CloseProps) => React.ReactElement }> = [
  { name: "CatsModal", title: "MY PETS", render: (p) => <CatsModal {...p} /> },
  { name: "WheelModal", title: "TAILS WHEEL", render: (p) => <WheelModal {...p} /> },
  { name: "PacksModal", title: "PACKS", render: (p) => <PacksModal {...p} /> },
  { name: "PackModal", title: "STARTER pack", render: (p) => <PackModal cat={{ name: "Pack", packType: "STARTER" } as unknown as ICat} {...p} /> },
  { name: "ProfileModal", title: "ABOUT ME", render: (p) => <ProfileModal {...p} /> },
  { name: "InviteModal", title: "SHOP", render: (p) => <InviteModal {...p} /> },
  { name: "QuestsModal", title: "EVENTS", render: (p) => <QuestsModal {...p} /> },
  { name: "CodexModal", title: "PROGRESS", render: (p) => <CodexModal {...p} /> },
  { name: "SupportModal", title: "SUPPORT", render: (p) => <SupportModal {...p} /> },
  { name: "ShareModal", title: "SHARE", render: (p) => <ShareModal url="/feed/x" {...p} /> },
];

/** The modal opens from a button the way the lobby opens it: by state, after a tap. */
const Harness = ({ modal, onClose }: { modal: (typeof MODALS)[number]; onClose: () => void }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open &&
        modal.render({
          close: () => {
            onClose();
            setOpen(false);
          },
        })}
    </>
  );
};

const openHarness = async (modal: (typeof MODALS)[number]) => {
  const onClose = jest.fn();
  render(<Harness modal={modal} onClose={onClose} />);
  const opener = screen.getByRole("button", { name: "open" });
  opener.focus();
  await act(async () => {
    fireEvent.click(opener);
  });
  const dialog = await screen.findByRole("dialog", { name: modal.title });
  return { onClose, opener, dialog };
};

describe.each(MODALS)("$name", (modal) => {
  beforeEach(() => {
    mockAuth.authStatus = "ready";
    mockSuspend.mockClear();
  });

  it("is a named night dialog that suspends the game, with no cream scrim or ad hoc z", async () => {
    const { dialog } = await openHarness(modal);
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(mockSuspend).toHaveBeenCalledWith(modal.name !== "ShareModal");
    expect(document.querySelector('[data-testid="game-modal-scrim"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/bg-tt-cream\/50|bg-yellow-300\/50|z-\[1\d\d\]|z-\[100000\]|bg-white\/75/);
    const result = await axe.run(dialog, {
      runOnly: ["button-name", "nested-interactive", "aria-dialog-name", "image-alt"],
    });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`)).toEqual([]);
  });

  it("closes on Esc and returns focus to the opener", async () => {
    const { onClose, opener, dialog } = await openHarness(modal);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes on the X", async () => {
    const { onClose, dialog } = await openHarness(modal);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes on the scrim", async () => {
    const { onClose } = await openHarness(modal);
    const scrim = document.querySelector('[data-testid="game-modal-scrim"]') as HTMLElement;
    fireEvent.pointerDown(scrim);
    fireEvent.pointerUp(scrim);
    fireEvent.click(scrim);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("PacksModal on /packs", () => {
  it("renders as the page, not a dialog, when it has no close", () => {
    render(<PacksModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Packs" })).toBeTruthy();
  });
});

describe("ShareModal on wide screens", () => {
  it("closes without opening a dialog from md up (the Share menu covers it)", async () => {
    const matchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    const close = jest.fn();
    render(<ShareModal url="/feed/x" close={close} />);
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  });
});
