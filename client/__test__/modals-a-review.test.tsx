/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Task 4c review fixes:
 * - the Wheel's spin lock always lifts: a redeem that never answers times out, and a wheel that
 *   never reports where it stopped hits the watchdog; a late redeem still credits the $TAILS;
 * - actions that open a popup or share sheet (the invite link, wallet connect and transfer) run
 *   straight from an account's tap, and after a guest's sign-in ask for a second tap;
 * - the Packs checkout cannot be closed while a payment is confirming;
 * - Logout is offered to every signed-in, non-anonymous user; Delete account only when ready.
 */

jest.mock("@/hooks/useSuspendGame", () => ({ useSuspendGame: jest.fn() }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn(), analytics: { enabled: false, track: jest.fn() } }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}`, bgStyle: () => ({}), isMobile: () => false }));
const mockSetProfileUpdate = jest.fn();
const mockShareURL = jest.fn();
const mockOpenLink = jest.fn();
const mockProfile = {
  _id: "u1",
  name: "Player",
  tails: 10,
  streak: 1,
  monthStreak: 1,
  canRedeemLives: true,
  cat: { _id: "c1", name: "Scout", isStarter: true, catImg: "/cat.png" },
  quests: [],
};
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({
    profile: mockProfile,
    setProfileUpdate: mockSetProfileUpdate,
    utils: { shareURL: mockShareURL, openLink: mockOpenLink },
    shareUrl: "https://tokentails.com/?ref=u1",
    logout: jest.fn(),
    isFB: true,
  }),
}));
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ setOpenedModal: jest.fn(), setGameType: jest.fn() }) }));
const mockToast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));

type Status = "ready" | "guest" | "signed-out" | "loading-profile" | "needs-verification" | "profile-error";
const mockAuth: {
  authStatus: Status;
  requireAccount: jest.Mock;
  signOut: jest.Mock;
  eraseGuest: jest.Mock;
  user: { isAnonymous: boolean; providers: string[] } | null;
} = {
  authStatus: "ready",
  requireAccount: jest.fn(),
  signOut: jest.fn(async () => undefined),
  eraseGuest: jest.fn(async () => true),
  user: { isAnonymous: false, providers: ["google.com"] },
};
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => ({ ...mockAuth }) }));
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(() => ({ data: undefined })),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: { signInWithApple: jest.fn() } }));
const mockRedeem = jest.fn();
jest.mock("@/api/user-api", () => ({
  USER_API: { redeem: (...args: unknown[]) => mockRedeem(...args), deleteMe: jest.fn(), saveProfileTwitter: jest.fn() },
}));
jest.mock("@/api/quest-api", () => ({ QUEST_API: { find: jest.fn(), complete: jest.fn() } }));
jest.mock("@/components/Leaderboard", () => ({ LeaderboardContent: () => null }));
jest.mock("@/components/LeaderboardCatnip", () => ({ LeaderboardCatnipContent: () => null }));
jest.mock("@/components/LeaderboardRescuer", () => ({ LeaderboardRescuerContent: () => null }));
const mockWheelSpin = jest.fn();
/** The wheel's `onFinished`, so a test can report where it stopped (or never do). */
const mockWheel: { finish?: (segment: number) => void } = {};
jest.mock("@/components/shared/Wheel", () => {
  const Wheel = React.forwardRef((props: { onFinished?: (segment: number) => void }, ref: React.Ref<{ spin: () => void }>) => {
    // A wheel that only reports where it stopped when a test calls `mockWheel.finish`.
    React.useEffect(() => {
      mockWheel.finish = props.onFinished;
    });
    React.useImperativeHandle(ref, () => ({ spin: mockWheelSpin }));
    return <canvas aria-hidden="true" />;
  });
  Wheel.displayName = "Wheel";
  return { __esModule: true, default: Wheel };
});
jest.mock("@/components/shared/GameMusicToggler", () => ({ GameMusicToggle: () => null }));
jest.mock("@/components/shared/AnalyticsConsentBanner", () => ({ AnalyticsSettingsButton: () => null }));
jest.mock("@/components/tailsCard/TailsCardPack", () => ({ TailsCardPack: () => null }));
// The lazily loaded checkout: a stand-in that reports a payment in flight.
jest.mock("next/dynamic", () => () => (props: { onProcessingChange?: (busy: boolean) => void }) =>
  props.onProcessingChange ? (
    <div>
      <button type="button" onClick={() => props.onProcessingChange?.(true)}>
        pay
      </button>
      <button type="button" onClick={() => props.onProcessingChange?.(false)}>
        payment done
      </button>
    </div>
  ) : null
);
jest.mock("@/models/app", () => ({ isApp: false, isProd: false }));
jest.mock("@/context/Web3Context", () => ({
  useWeb3: () => ({ currencyType: "USDC", rates: null, transactionStatus: null, setTransactionStatus: jest.fn() }),
}));
const mockConnectWallet = jest.fn();
const mockTransfer = jest.fn();
let mockConnected = false;
let mockPending = false;
jest.mock("@/components/web3/transfer/useWeb3Transfer", () => ({
  useWeb3Transfer: () => ({
    isTransactionPending: mockPending,
    chainStatusDetail: { connected: mockConnected, address: mockConnected ? "GABCDEFXYZ" : undefined },
    connectWallet: mockConnectWallet,
    isLoading: false,
    transfer: mockTransfer,
  }),
}));

import { WheelModal, WHEEL_REDEEM_TIMEOUT_MS, MAX_SPIN_LOCK_MS } from "@/components/shared/WheelModal";
import { QuestsModalContent } from "@/components/shared/QuestsModal";
import { PacksModal } from "@/components/shared/PacksModal";
import { ProfileModal } from "@/components/shared/ProfileModal";
import { Web3Transfer } from "@/components/web3/transfer/Web3Transfer";
import { EntityType } from "@/models/save";

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.authStatus = "ready";
  mockAuth.requireAccount = jest.fn(async () => "dismissed");
  mockAuth.user = { isAnonymous: false, providers: ["google.com"] };
  mockConnected = false;
  mockPending = false;
});

afterEach(() => {
  jest.useRealTimers();
});

const wheelX = () =>
  within(screen.getByRole("dialog", { name: "DAILY SPIN" })).getByRole("button", { name: "Close" });

describe("WheelModal spin lock", () => {
  it("lifts the lock when the redeem request never answers", async () => {
    jest.useFakeTimers();
    mockRedeem.mockReturnValue(new Promise(() => undefined));
    const close = jest.fn();
    render(<WheelModal close={close} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    expect(wheelX().getAttribute("aria-disabled")).toBe("true");

    await act(async () => {
      jest.advanceTimersByTime(WHEEL_REDEEM_TIMEOUT_MS + 10);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({ message: expect.stringMatching(/network is slow/i) });
    expect(mockWheelSpin).not.toHaveBeenCalled();
    fireEvent.click(wheelX());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("still credits a redeem that lands after the timeout, without spinning", async () => {
    jest.useFakeTimers();
    let answer: (value: { tails: number }) => void = () => undefined;
    mockRedeem.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(WHEEL_REDEEM_TIMEOUT_MS + 10);
    });
    await act(async () => {
      answer({ tails: 50 });
    });
    expect(mockSetProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ canRedeemLives: false, tails: 60 }));
    expect(mockToast).toHaveBeenCalledWith({ message: "Your spin landed: +50 Tails" });
    // The SPIN button is gone: the claim was spent.
    expect(screen.queryByRole("button", { name: "SPIN!" })).toBeNull();
    expect(mockWheelSpin).not.toHaveBeenCalled();
  });

  it("lifts the lock when the wheel never reports where it stopped", async () => {
    jest.useFakeTimers();
    mockRedeem.mockResolvedValue({ tails: 25 });
    const close = jest.fn();
    render(<WheelModal close={close} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(mockWheelSpin).toHaveBeenCalledTimes(1);
    expect(wheelX().getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "DAILY SPIN" }), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(MAX_SPIN_LOCK_MS);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({ message: expect.stringMatching(/got stuck/i) });
    fireEvent.keyDown(screen.getByRole("dialog", { name: "DAILY SPIN" }), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("a slow redeem does not eat the spin budget, and SPIN never comes back once the Tails arrived", async () => {
    jest.useFakeTimers();
    let answer: (value: { tails: number }) => void = () => undefined;
    mockRedeem.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    // The redeem answers just inside its timeout.
    await act(async () => {
      jest.advanceTimersByTime(WHEEL_REDEEM_TIMEOUT_MS - 1000);
    });
    await act(async () => {
      answer({ tails: 25 });
    });
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(mockWheelSpin).toHaveBeenCalledTimes(1);
    // 15 s from the tap, the wheel is still turning: still locked, no SPIN, no "stuck" toast.
    await act(async () => {
      jest.advanceTimersByTime(15000 - WHEEL_REDEEM_TIMEOUT_MS + 1000 - 150);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "SPIN!" })).toBeNull();
    expect(mockToast).not.toHaveBeenCalledWith({ message: expect.stringMatching(/got stuck/i) });
    // It stops; the reveal plays and the lock lifts.
    await act(async () => {
      mockWheel.finish?.(25);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      jest.advanceTimersByTime(2100);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: "SPIN!" })).toBeNull();
  });

  it("a wheel that stops after the watchdog shows the prize without locking the modal again", async () => {
    jest.useFakeTimers();
    mockRedeem.mockResolvedValue({ tails: 50 });
    const close = jest.fn();
    render(<WheelModal close={close} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(150 + MAX_SPIN_LOCK_MS);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: "SPIN!" })).toBeNull();
    await act(async () => {
      mockWheel.finish?.(50);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByText("50")).toBeTruthy();
    fireEvent.click(wheelX());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("credits the Tails onto the profile as it is after the redeem, not as it was at the tap", async () => {
    let answer: (value: { tails: number }) => void = () => undefined;
    mockRedeem.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { rerender } = render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    // Something else credited 30 Tails while the redeem was in flight.
    mockProfile.tails = 40;
    rerender(<WheelModal close={jest.fn()} />);
    try {
      await act(async () => {
        answer({ tails: 5 });
      });
      expect(mockSetProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ tails: 45 }));
    } finally {
      mockProfile.tails = 10;
    }
  });

  it("keeps SPIN away while a timed-out redeem is still in flight, and brings it back if it fails", async () => {
    jest.useFakeTimers();
    let fail: (error: Error) => void = () => undefined;
    mockRedeem.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(WHEEL_REDEEM_TIMEOUT_MS + 10);
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: "SPIN!" })).toBeNull();
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail(new Error("offline"));
    });
    expect(screen.getByRole("button", { name: "SPIN!" })).toBeTruthy();
  });

  it("unlocks at once when the redeem fails", async () => {
    mockRedeem.mockRejectedValue(new Error("offline"));
    render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    expect(wheelX().getAttribute("aria-disabled")).toBeNull();
  });
});

describe("popup actions run from the tap", () => {
  let rerenderQuests: () => void = () => undefined;
  const openInvite = () => {
    const view = render(<QuestsModalContent />);
    rerenderQuests = () => view.rerender(<QuestsModalContent />);
    fireEvent.click(screen.getByRole("tab", { name: /QUESTS/ }));
    return screen.getByRole("button", { name: "GET INVITE LINK" });
  };

  it("an account shares the invite link synchronously, inside the tap", () => {
    const invite = openInvite();
    fireEvent.click(invite);
    // No await in between: the share sheet still has the tap's user activation.
    expect(mockShareURL).toHaveBeenCalledWith("https://tokentails.com/?ref=u1");
    expect(mockAuth.requireAccount).not.toHaveBeenCalled();
  });

  it("a guest signs in first, then is asked to tap again; nothing is shared from outside the tap", async () => {
    mockAuth.authStatus = "guest";
    mockAuth.requireAccount = jest.fn(async () => {
      mockAuth.authStatus = "ready";
      return "signed-in";
    });
    const invite = openInvite();
    await act(async () => {
      fireEvent.click(invite);
    });
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("share");
    // The sheet resolved; the next render commits the account.
    await act(async () => {
      rerenderQuests();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(mockShareURL).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ message: expect.stringMatching(/tap GET INVITE LINK again/i) });
  });

  it("a dismissed sheet does nothing", async () => {
    mockAuth.authStatus = "guest";
    const invite = openInvite();
    await act(async () => {
      fireEvent.click(invite);
    });
    expect(mockShareURL).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("a partner quest link opens inside the tap, before the debounced claim", () => {
    jest.useFakeTimers();
    render(<QuestsModalContent />);
    fireEvent.click(screen.getByRole("tab", { name: /QUESTS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Follow on X" }));
    // Opened synchronously, inside the tap; the claim itself waits for the debounce.
    expect(mockOpenLink).toHaveBeenCalledWith(expect.stringContaining("x.com"));
  });

  it("an account connects the wallet inside the tap; a guest is asked to tap again", async () => {
    const { unmount } = render(<Web3Transfer price={5} entityType={EntityType.PACK} id="STARTER" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    expect(mockConnectWallet).toHaveBeenCalledTimes(1);
    unmount();

    mockAuth.authStatus = "guest";
    mockAuth.requireAccount = jest.fn(async () => {
      mockAuth.authStatus = "ready";
      return "signed-in";
    });
    const view = render(<Web3Transfer price={5} entityType={EntityType.PACK} id="STARTER" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    });
    view.rerender(<Web3Transfer price={5} entityType={EntityType.PACK} id="STARTER" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("purchase");
    expect(mockConnectWallet).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ message: expect.stringMatching(/tap again/i) });
  });

  it("an account's Buy Now signs the transfer inside the tap", () => {
    mockConnected = true;
    render(<Web3Transfer price={5} entityType={EntityType.PACK} id="STARTER" />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    expect(mockTransfer).toHaveBeenCalledTimes(1);
  });

  it("reports a pending transfer to the host", () => {
    const onProcessingChange = jest.fn();
    mockConnected = true;
    mockPending = true;
    render(
      <Web3Transfer price={5} entityType={EntityType.PACK} id="STARTER" onProcessingChange={onProcessingChange} />
    );
    expect(onProcessingChange).toHaveBeenLastCalledWith(true);
  });
});

describe("PacksModal checkout lock", () => {
  it("cannot be closed by the X or Esc while a payment is confirming", async () => {
    const close = jest.fn();
    render(<PacksModal close={close} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "$5" }));
    });
    const dialog = screen.getByRole("dialog", { name: "PACKS" });
    const x = within(dialog).getAllByRole("button", { name: "Close" })[0];
    expect(x.getAttribute("aria-disabled")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "pay" }));
    expect(x.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(x);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "payment done" }));
    expect(x.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(x);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("ProfileModal Logout", () => {
  it.each(["loading-profile", "needs-verification", "profile-error"] as const)(
    "offers Logout (and no Delete account) while the account is %s",
    (status) => {
      mockAuth.authStatus = status;
      render(<ProfileModal close={jest.fn()} />);
      expect(screen.getByRole("button", { name: "LOG OUT" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "DELETE ACCOUNT" })).toBeNull();
    }
  );

  it("offers Logout and Delete account to a ready account", () => {
    render(<ProfileModal close={jest.fn()} />);
    expect(screen.getByRole("button", { name: "LOG OUT" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "DELETE ACCOUNT" })).toBeTruthy();
  });

  it("offers no Logout to a signed-out visitor", () => {
    mockAuth.authStatus = "signed-out";
    mockAuth.user = null;
    render(<ProfileModal close={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "LOG OUT" })).toBeNull();
  });
});
