/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

/**
 * Task 4c (plan G1 `requireAccount`, decision #9; G9 `DELETE /user/me`, decision #4; G14 Wheel):
 * - account actions run at once for an account, open `requireAccount(reason)` for a guest, run
 *   after `signed-in` and do nothing after `dismissed`;
 * - the Wheel's X is aria-disabled and Esc does nothing from the SPIN tap until the reveal played;
 * - the profile's guest menu (Save progress, Erase guest progress) and account menu (Delete account
 *   with a confirm step, the Apple code on iOS).
 */

jest.mock("@/hooks/useSuspendGame", () => ({ useSuspendGame: jest.fn() }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn(), analytics: { enabled: false, track: jest.fn() } }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}`, bgStyle: () => ({}), isMobile: () => false }));
const mockSetProfileUpdate = jest.fn();
const mockProfile = {
  _id: "u1",
  name: "Player",
  tails: 10,
  streak: 1,
  canRedeemLives: true,
  cat: { _id: "c1", name: "Scout", isStarter: true, catImg: "/cat.png" },
  quests: [],
};
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: mockProfile, setProfileUpdate: mockSetProfileUpdate, logout: jest.fn(), isFB: true }),
}));
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ setOpenedModal: jest.fn(), setGameType: jest.fn() }) }));
const mockToast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => mockToast }));

type Status = "ready" | "guest" | "signed-out" | "loading-profile";
const mockAuth: {
  authStatus: Status;
  requireAccount: jest.Mock;
  signOut: jest.Mock;
  eraseGuest: jest.Mock;
  user: { providers: string[] } | null;
} = {
  authStatus: "ready",
  requireAccount: jest.fn(),
  signOut: jest.fn(async () => undefined),
  eraseGuest: jest.fn(async () => true),
  user: { providers: ["google.com"] },
};
let mockHasProvider = true;
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => (mockHasProvider ? { ...mockAuth } : undefined),
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(() => ({ data: undefined })),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));
let mockPlatform = "web";
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => mockPlatform } }));
const mockSignInWithApple = jest.fn();
jest.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: { signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args) },
}));
const mockRedeem = jest.fn();
const mockDeleteMe = jest.fn();
jest.mock("@/api/user-api", () => ({
  USER_API: {
    redeem: (...args: unknown[]) => mockRedeem(...args),
    deleteMe: (...args: unknown[]) => mockDeleteMe(...args),
    saveProfileTwitter: jest.fn(),
  },
}));
const mockCreateTicket = jest.fn();
jest.mock("@/api/ticket-api", () => ({
  TICKET_API: { getTickets: jest.fn(), createTicket: (...args: unknown[]) => mockCreateTicket(...args) },
}));
let mockSpin: (() => void) | null = null;
jest.mock("@/components/shared/Wheel", () => {
  const Wheel = React.forwardRef(
    ({ onFinished }: { onFinished: (value: number) => void }, ref: React.Ref<{ spin: () => void }>) => {
      React.useImperativeHandle(ref, () => ({ spin: () => (mockSpin = () => onFinished(25)) }));
      return <canvas aria-hidden="true" />;
    }
  );
  Wheel.displayName = "Wheel";
  return { __esModule: true, default: Wheel };
});
jest.mock("@/components/shared/GameMusicToggler", () => ({ GameMusicToggle: () => null }));
jest.mock("@/components/shared/AnalyticsConsentBanner", () => ({ AnalyticsSettingsButton: () => null }));
jest.mock("@/components/tailsCard/TailsCardPack", () => ({ TailsCardPack: () => null }));
jest.mock("@/components/web3/Payment", () => ({ Payment: () => <p>checkout</p> }));
jest.mock("next/dynamic", () => () => (props: Record<string, unknown>) => <p>checkout {String(props.price ?? "")}</p>);

import { useAccountAction } from "@/hooks/useAccountAction";
import { WheelModal, WHEEL_REVEAL_HOLD_MS } from "@/components/shared/WheelModal";
import { PacksModal, isPaymentLayer } from "@/components/shared/PacksModal";
import { SupportModal } from "@/components/shared/SupportModal";
import {
  DELETE_ACCOUNT_ERROR,
  ProfileModal,
  requestAccountDeletion,
} from "@/components/shared/ProfileModal";
import { ApiError } from "@/api/api";

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
});

beforeEach(() => {
  mockAuth.authStatus = "ready";
  mockAuth.requireAccount = jest.fn(async () => "dismissed");
  mockAuth.user = { providers: ["google.com"] };
  mockHasProvider = true;
  mockPlatform = "web";
  mockSpin = null;
});

describe("useAccountAction", () => {
  it("runs the action at once for an account, without the sheet", async () => {
    const action = jest.fn(() => 7);
    const { result } = renderHook(() => useAccountAction());
    await expect(result.current.runWithAccount("claim-rewards", action)).resolves.toBe(7);
    expect(mockAuth.requireAccount).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("asks a guest to sign in, and does nothing when they close the sheet", async () => {
    mockAuth.authStatus = "guest";
    const action = jest.fn();
    const { result } = renderHook(() => useAccountAction());
    await expect(result.current.runWithAccount("purchase", action)).resolves.toBeUndefined();
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("purchase");
    expect(action).not.toHaveBeenCalled();
  });

  it("runs the action once the guest signed in and the account is committed", async () => {
    mockAuth.authStatus = "guest";
    mockAuth.requireAccount = jest.fn(async () => "signed-in");
    const action = jest.fn(() => "done");
    const { result, rerender } = renderHook(() => useAccountAction());
    let settled: Promise<unknown> = Promise.resolve();
    await act(async () => {
      settled = result.current.runWithAccount("adopt", action);
      await Promise.resolve();
    });
    // Still a guest in React: the action waits for the account.
    expect(action).not.toHaveBeenCalled();
    mockAuth.authStatus = "ready";
    rerender();
    await act(async () => {
      await expect(settled).resolves.toBe("done");
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("keeps the old flow on pages without the auth runtime", async () => {
    mockHasProvider = false;
    const action = jest.fn(() => 1);
    const { result } = renderHook(() => useAccountAction());
    await expect(result.current.runWithAccount("purchase", action)).resolves.toBe(1);
  });
});

describe("WheelModal", () => {
  it("a guest's SPIN opens the sheet first and never redeems after a dismissal", async () => {
    mockAuth.authStatus = "guest";
    render(<WheelModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("claim-rewards");
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("cannot be closed from the SPIN tap until the reveal has played", async () => {
    jest.useFakeTimers();
    mockRedeem.mockResolvedValue({ tails: 25 });
    const close = jest.fn();
    render(<WheelModal close={close} />);
    const dialog = screen.getByRole("dialog", { name: "TAILS WHEEL" });
    const x = within(dialog).getByRole("button", { name: "Close" });
    expect(x.getAttribute("aria-disabled")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SPIN!" }));
    });
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    expect(x.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(x);
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    // The wheel stops: still locked while the won value is revealed.
    await act(async () => {
      mockSpin?.();
    });
    expect(x.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300 + WHEEL_REVEAL_HOLD_MS + 10);
    });
    expect(x.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByText("You won 25 Tails")).toBeTruthy();
    fireEvent.click(x);
    expect(close).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe("PacksModal", () => {
  it("a guest's pack tap opens the sheet for a purchase, and the checkout opens after sign-in", async () => {
    mockAuth.authStatus = "guest";
    mockAuth.requireAccount = jest.fn(async () => {
      mockAuth.authStatus = "ready";
      return "signed-in";
    });
    const { rerender } = render(<PacksModal close={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "$5" }));
    });
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("purchase");
    rerender(<PacksModal close={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId("packs-panel").getAttribute("data-payment-step")).toBe("true"));
    expect(screen.getByText(/checkout/)).toBeTruthy();
  });

  it("treats Stripe frames and body-level third-party layers as outside the modal's rules", () => {
    const stripe = document.createElement("iframe");
    stripe.name = "__privateStripeFrame1234";
    document.body.appendChild(stripe);
    const kit = document.createElement("div");
    const kitButton = document.createElement("button");
    kit.appendChild(kitButton);
    document.body.appendChild(kit);
    const app = document.createElement("div");
    app.id = "__next";
    const appButton = document.createElement("button");
    app.appendChild(appButton);
    document.body.appendChild(app);
    expect(isPaymentLayer(stripe)).toBe(true);
    expect(isPaymentLayer(kitButton)).toBe(true);
    expect(isPaymentLayer(appButton)).toBe(false);
  });
});

describe("SupportModal", () => {
  it("sends a guest's ticket only after they signed in", async () => {
    mockAuth.authStatus = "guest";
    render(<SupportModal close={jest.fn()} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Help me" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SEND" }));
    });
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("support");
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it("sends an account's ticket at once", async () => {
    mockCreateTicket.mockResolvedValue({ message: "Help me" });
    render(<SupportModal close={jest.fn()} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Help me" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SEND" }));
    });
    expect(mockAuth.requireAccount).not.toHaveBeenCalled();
    expect(mockCreateTicket).toHaveBeenCalledWith({ message: "Help me" });
  });
});

describe("ProfileModal account menu", () => {
  it("a guest gets Save progress and Erase guest progress (with a confirm), never Delete account", async () => {
    mockAuth.authStatus = "guest";
    const close = jest.fn();
    render(<ProfileModal close={close} />);
    expect(screen.queryByRole("button", { name: "DELETE ACCOUNT" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "SAVE PROGRESS" }));
    expect(mockAuth.requireAccount).toHaveBeenCalledWith("save-progress");

    fireEvent.click(screen.getByRole("button", { name: "ERASE GUEST PROGRESS" }));
    expect(screen.getByTestId("confirm-erase-guest")).toBeTruthy();
    expect(mockAuth.eraseGuest).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ERASE" }));
    });
    expect(mockAuth.eraseGuest).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });

  it("an account deletes itself after the confirm step, then signs out", async () => {
    mockDeleteMe.mockResolvedValue({ success: true });
    const close = jest.fn();
    render(<ProfileModal close={close} />);
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    expect(screen.getByTestId("confirm-delete-account")).toBeTruthy();
    expect(mockDeleteMe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "KEEP MY ACCOUNT" }));
    expect(screen.queryByTestId("confirm-delete-account")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "DELETE FOREVER" }));
    });
    expect(mockDeleteMe).toHaveBeenCalledWith(undefined);
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("on iOS with Sign in with Apple, sends a fresh authorization code", async () => {
    mockPlatform = "ios";
    mockAuth.user = { providers: ["apple.com"] };
    mockSignInWithApple.mockResolvedValue({ credential: { authorizationCode: "apple-code" } });
    mockDeleteMe.mockResolvedValue({ success: true });
    render(<ProfileModal close={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "DELETE FOREVER" }));
    });
    expect(mockSignInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(mockDeleteMe).toHaveBeenCalledWith("apple-code");
  });

  it("shows the Rename action for the starter only once it has a document", () => {
    render(<ProfileModal close={jest.fn()} />);
    expect(screen.getByRole("button", { name: /RENAME Scout/i })).toBeTruthy();
  });
});

describe("requestAccountDeletion", () => {
  const deps = (overrides = {}) => ({
    needsAppleCode: false,
    getAppleCode: jest.fn(async () => "code"),
    deleteMe: jest.fn(async () => ({ success: true })),
    signOut: jest.fn(async () => undefined),
    ...overrides,
  });

  it("cancels, deleting nothing, when the Apple prompt is cancelled", async () => {
    const d = deps({ needsAppleCode: true, getAppleCode: jest.fn(async () => Promise.reject(new Error("cancel"))) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ status: "cancelled" });
    expect(d.deleteMe).not.toHaveBeenCalled();
  });

  it("reports an error and stays signed in when the backend refuses", async () => {
    const d = deps({ deleteMe: jest.fn(async () => Promise.reject(new ApiError(500, null))) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ status: "error", message: DELETE_ACCOUNT_ERROR });
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it("deletes, then signs out", async () => {
    const d = deps();
    await expect(requestAccountDeletion(d)).resolves.toEqual({ status: "deleted" });
    expect(d.deleteMe).toHaveBeenCalledWith(undefined);
    expect(d.signOut).toHaveBeenCalledTimes(1);
  });
});
