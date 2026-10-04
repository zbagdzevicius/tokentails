/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Task 5e (plan G4 "End of run", "ProfileModal", "/shelter-payouts"):
 * - the end-of-run paw line says "Paw earned: tonight Token Tails pays a treat to Pink Paw" only
 *   when the paw is earned and the settlement sends, otherwise progress; the treat CTA only when
 *   the rail is open and the account may send; the panel says LEVEL CLEARED on `clearedNow`;
 * - MY IMPACT renders with spent=0 and cat=null, with no spend-to-surgeries conversion;
 * - /shelter-payouts empty states are future tense with the claims date (or none), and app builds
 *   get the proof notice instead of wallet and explorer wording.
 */

jest.mock("@/hooks/useSuspendGame", () => ({ useSuspendGame: jest.fn() }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn(), analytics: { enabled: false, track: jest.fn() } }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}`, bgStyle: () => ({}), isMobile: () => false }));
jest.mock("@/components/claims/EvidenceChip", () => ({
  EvidenceChip: ({ kind }: { kind: string }) => <span data-testid="chip">{kind}</span>,
}));

type Viewer = "loading" | "guest" | "unverified" | "registered";
const mockImpactMe: { viewer: Viewer; me: unknown; loading: boolean } = { viewer: "registered", me: null, loading: false };
let mockRail: unknown = null;
jest.mock("@/components/impact/useImpactMe", () => ({
  IMPACT_ME_QUERY_KEY: "impact-me",
  useImpactMe: () => mockImpactMe,
  useDonateRail: () => mockRail,
}));
let mockImpact: unknown = null;
jest.mock("@/hooks/useImpact", () => ({ useImpact: () => ({ impact: mockImpact, loading: false }) }));
const mockInvalidate = jest.fn();
// One client for the whole suite, as react-query's provider gives.
const mockQueryClient = { setQueryData: jest.fn(), invalidateQueries: mockInvalidate };
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(() => ({ data: undefined })),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => mockQueryClient,
}));

const mockSetOpenedModal = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: mockProfile, setProfileUpdate: jest.fn(), logout: jest.fn(), isFB: true }),
}));
jest.mock("@/context/GameContext", () => ({
  useGame: () => ({ setOpenedModal: mockSetOpenedModal, setGameType: jest.fn() }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => ({
    authStatus: "ready",
    requireAccount: jest.fn(),
    signOut: jest.fn(),
    eraseGuest: jest.fn(),
    user: { providers: ["google.com"] },
  }),
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: {} }));
jest.mock("@/api/user-api", () => ({ USER_API: { deleteMe: jest.fn(), saveProfileTwitter: jest.fn() } }));
jest.mock("@/components/shared/GameMusicToggler", () => ({ GameMusicToggle: () => null }));
jest.mock("@/components/shared/AnalyticsConsentBanner", () => ({ AnalyticsSettingsButton: () => null }));
jest.mock("next/dynamic", () => () => () => null);
const mockOpenWebImpact = jest.fn(() => Promise.resolve());
jest.mock("@/components/claims/build", () => ({
  ...jest.requireActual("@/components/claims/build"),
  openWebImpact: () => mockOpenWebImpact(),
}));

import {
  endGamePawCopy,
  EndGamePaw,
  GIVE_TREAT_PATH,
  PAW_RECHECK_MS,
  showTreatCta,
} from "@/components/impact/EndGamePaw";
import { pawView } from "@/components/impact/pawView";
import { clearedThisRun, EndGamePanel } from "@/components/shared/EndGameModal";
import { ProfileModalContent } from "@/components/shared/ProfileModal";
import { GameModal } from "@/models/game";
import { claimsDateLabel, payoutsEmptyCopy, ShelterPayouts } from "@/components/shelter-payouts/ShelterPayouts";
import { custodyDisclosure, ShelterProfile } from "@/components/shelter-payouts/ShelterProfile";
import { handoverLabel } from "@/components/shelter-payouts/campaign";
import { takeProgressTab } from "@/components/impact/progressTab";

function me({ remaining = 1, eligible = true, treatEligible = false, lifetime = 0 } = {}) {
  return {
    treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0", lastConfirmedAt: null },
    instantTreat: { eligible: treatEligible, reason: treatEligible ? null : "account-too-new", eligibleAt: null },
    paws: {
      today: {
        day: "2026-10-02",
        qualifyingRuns: 2 - remaining,
        runsNeeded: 2,
        remaining,
        earned: remaining === 0 && eligible,
        eligibility: { eligible, reason: eligible ? null : "account-too-new", eligibleAt: null },
        settlesAt: "2026-10-03T00:30:00.000Z",
        message: "",
      },
      lifetime,
      latestSettlement: null,
      hasProof: false,
    },
  };
}

const partnerSnapshot = (sendEnabled: boolean) => ({
  shelters: { items: [{ name: "Pink Paw", role: "partner", partnerStatus: "active" }] },
  pawSettlements: { sendEnabled },
});
const LIVE_RAIL = { enabled: true, state: "live", treatsLeftToday: 12, resetsAt: null };

const ORIGINAL_IS_APP = process.env.NEXT_PUBLIC_IS_APP;
beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
});
beforeEach(() => {
  mockImpactMe.viewer = "registered";
  mockImpactMe.me = null;
  mockImpactMe.loading = false;
  mockRail = null;
  mockImpact = null;
  mockProfile = null;
  delete process.env.NEXT_PUBLIC_IS_APP;
});
afterAll(() => {
  if (ORIGINAL_IS_APP === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
  else process.env.NEXT_PUBLIC_IS_APP = ORIGINAL_IS_APP;
});

describe("end-of-run paw copy", () => {
  it("shows progress until the paw is earned", () => {
    const view = pawView("registered", me({ remaining: 1 }) as never);
    expect(endGamePawCopy(view, "Pink Paw", true)).toEqual({ text: "1 more run for today's paw", earned: false });
  });

  it("promises tonight's treat only when the settlement sends", () => {
    const view = pawView("registered", me({ remaining: 0 }) as never);
    expect(endGamePawCopy(view, "Pink Paw", true)).toEqual({
      text: "Paw earned: tonight Token Tails pays a treat to Pink Paw.",
      earned: true,
    });
    const off = endGamePawCopy(view, "Pink Paw", false);
    expect(off.earned).toBe(true);
    expect(off.text).not.toMatch(/tonight/);
  });

  it("never says earned for an ineligible account or a guest", () => {
    const blocked = pawView("registered", me({ remaining: 0, eligible: false }) as never);
    expect(endGamePawCopy(blocked, "Pink Paw", true).earned).toBe(false);
    expect(endGamePawCopy(pawView("guest", null), "Pink Paw", true)).toEqual({
      text: "Save your progress to earn daily paws.",
      earned: false,
    });
  });

  it("offers the treat CTA only when the rail is open and the account may send", () => {
    expect(showTreatCta(true, true)).toBe(true);
    expect(showTreatCta(false, true)).toBe(false);
    expect(showTreatCta(true, false)).toBe(false);
  });
});

describe("EndGamePaw", () => {
  it("earned + sending settlement + open rail + eligible: the paw line and the treat CTA", () => {
    mockImpactMe.me = me({ remaining: 0, treatEligible: true });
    mockImpact = partnerSnapshot(true);
    mockRail = LIVE_RAIL;
    render(<EndGamePaw refreshKey={1} />);
    expect(screen.getByTestId("end-game-paw-text").textContent).toBe(
      "Paw earned: tonight Token Tails pays a treat to Pink Paw."
    );
    expect(screen.getByTestId("end-game-paw").getAttribute("data-paw-earned")).toBe("true");
    expect(screen.getByTestId("end-game-treat").getAttribute("href")).toBe(GIVE_TREAT_PATH);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["impact-me"] });
  });

  it("progress, rail not deployed: no paw claim and no CTA", () => {
    mockImpactMe.me = me({ remaining: 1, treatEligible: true });
    mockImpact = partnerSnapshot(true);
    render(<EndGamePaw />);
    expect(screen.getByTestId("end-game-paw-text").textContent).toBe("1 more run for today's paw");
    expect(screen.queryByTestId("end-game-treat")).toBeNull();
    expect(screen.getByTestId("end-game-paw").getAttribute("data-paw-earned")).toBeNull();
  });

  it("open rail but a too-new account: no CTA", () => {
    mockImpactMe.me = me({ remaining: 0, treatEligible: false });
    mockRail = LIVE_RAIL;
    render(<EndGamePaw />);
    expect(screen.queryByTestId("end-game-treat")).toBeNull();
  });

  it("app builds: the treat CTA opens web /impact, never the give page (F7.2)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "true";
    mockImpactMe.me = me({ remaining: 0, treatEligible: true });
    mockImpact = partnerSnapshot(true);
    mockRail = LIVE_RAIL;
    render(<EndGamePaw />);
    const cta = screen.getByTestId("end-game-treat");
    expect(cta.getAttribute("href")).toBeNull();
    expect(document.querySelector(`a[href="${GIVE_TREAT_PATH}"]`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /SEND PINK PAW A TREAT/ }));
    expect(mockOpenWebImpact).toHaveBeenCalled();
  });

  it("re-reads /impact/me after the save can have answered, then stops once earned", () => {
    jest.useFakeTimers();
    try {
      mockInvalidate.mockClear();
      // The first read predates the save: one run still to go.
      mockImpactMe.me = me({ remaining: 1 });
      mockImpact = partnerSnapshot(true);
      const { rerender } = render(<EndGamePaw />);
      expect(screen.getByTestId("end-game-paw-text").textContent).toBe("1 more run for today's paw");
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
      act(() => {
        jest.advanceTimersByTime(PAW_RECHECK_MS[0]);
      });
      expect(mockInvalidate).toHaveBeenCalledTimes(2);
      // The save answered: the refetched read says the paw is earned.
      mockImpactMe.me = me({ remaining: 0 });
      rerender(<EndGamePaw />);
      expect(screen.getByTestId("end-game-paw-text").textContent).toBe(
        "Paw earned: tonight Token Tails pays a treat to Pink Paw."
      );
      act(() => {
        jest.advanceTimersByTime(PAW_RECHECK_MS[1]);
      });
      expect(mockInvalidate).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("guests are never re-read", () => {
    jest.useFakeTimers();
    try {
      mockInvalidate.mockClear();
      mockImpactMe.viewer = "guest";
      render(<EndGamePaw />);
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a guest gets the save line, with no CTA", () => {
    mockImpactMe.viewer = "guest";
    mockRail = LIVE_RAIL;
    render(<EndGamePaw />);
    expect(screen.getByTestId("end-game-paw-text").textContent).toBe("Save your progress to earn daily paws.");
    expect(screen.queryByTestId("end-game-treat")).toBeNull();
  });
});

describe("EndGamePanel", () => {
  const panel = (cleared: boolean) => (
    <EndGamePanel
      title="Level 1 Summary"
      name="end-game"
      onClose={jest.fn()}
      scoreIcon={null}
      score={12}
      scoreLabel="catnip"
      actions={<button type="button">PLAY AGAIN</button>}
      cleared={cleared}
      footer={<p data-testid="footer">paw</p>}
    />
  );

  it("says LEVEL CLEARED only when the save cleared the level", () => {
    const { rerender } = render(panel(true));
    expect(screen.getByTestId("end-game-cleared").textContent).toMatch(/Level cleared/i);
    expect(screen.getByTestId("footer")).toBeTruthy();
    rerender(panel(false));
    expect(screen.queryByTestId("end-game-cleared")).toBeNull();
  });
});

describe("clearedThisRun (LEVEL CLEARED belongs to the run on screen)", () => {
  const run = { gameType: "CATNIP_CHAOS", level: "11" };
  it("trusts an outcome for this mode and level", () => {
    expect(clearedThisRun({ mode: "CATNIP_CHAOS", level: "11", outcome: "won", clearedNow: true }, run)).toBe(true);
    expect(clearedThisRun({ clearedNow: true }, run)).toBe(true);
  });
  it("ignores an outcome left over from another run", () => {
    expect(clearedThisRun(null, run)).toBe(false);
    expect(clearedThisRun({ mode: "CATNIP_CHAOS", level: "11", outcome: "won", clearedNow: false }, run)).toBe(false);
    expect(clearedThisRun({ mode: "MATCH_3", level: "11", outcome: "won", clearedNow: true }, run)).toBe(false);
    expect(clearedThisRun({ mode: "CATNIP_CHAOS", level: "12", outcome: "won", clearedNow: true }, run)).toBe(false);
    expect(clearedThisRun({ mode: "CATNIP_CHAOS", level: "11", outcome: "died", clearedNow: true }, run)).toBe(false);
    // A failed run right after a cleared one: the stop event says died, the old outcome says won.
    expect(
      clearedThisRun({ mode: "CATNIP_CHAOS", level: "11", outcome: "won", clearedNow: true }, { ...run, outcome: "died" })
    ).toBe(false);
  });
});

describe("ProfileModal MY IMPACT", () => {
  it("renders with spent=0 and cat=null, links to IMPACT, and converts nothing", () => {
    mockProfile = { _id: "u1", name: "Player", tails: 0, spent: 0, cat: null, quests: [], streak: 0 };
    mockImpactMe.me = me({ remaining: 2, lifetime: 0 });
    render(<ProfileModalContent close={jest.fn()} />);
    // Visible as ABOUT ME opens, under the stats: no tab to tap first.
    expect(screen.getByRole("region", { name: "Stats" })).toBeTruthy();
    const summary = screen.getByTestId("my-impact-summary");
    expect(summary.textContent).toMatch(/2 more runs for today's paw/);
    expect(screen.getByTestId("my-impact-paws").textContent).toBe("0 paws");
    expect(document.body.textContent).not.toMatch(/surger|meals|vaccin/i);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "OPEN IMPACT" }));
    });
    expect(mockSetOpenedModal).toHaveBeenCalledWith(GameModal.CODEX);
    expect(takeProgressTab()).toBe("impact");
    // The MY IMPACT button jumps straight to PROGRESS on IMPACT too.
    mockSetOpenedModal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "MY IMPACT" }));
    expect(mockSetOpenedModal).toHaveBeenCalledWith(GameModal.CODEX);
    expect(takeProgressTab()).toBe("impact");
  });

  it("renders for a buyer the same way: no spend gate, no spend figure", () => {
    mockProfile = { _id: "u1", name: "Buyer", tails: 0, spent: 250, cat: null, quests: [], streak: 0 };
    mockImpactMe.viewer = "guest";
    render(<ProfileModalContent close={jest.fn()} />);
    expect(screen.getByTestId("my-impact-summary").textContent).toMatch(/Save your progress/);
    expect(screen.queryByTestId("my-impact-paws")).toBeNull();
    expect(document.body.textContent).not.toMatch(/250/);
  });
});

describe("/shelter-payouts", () => {
  it("formats the claims date and drops a missing or bad one", () => {
    expect(claimsDateLabel("2026-10-02")).toBe("2 October 2026");
    expect(claimsDateLabel("")).toBeNull();
    expect(claimsDateLabel("soon")).toBeNull();
    expect(claimsDateLabel(undefined)).toBeNull();
  });

  it("empty state: future tense, with the claims date or none", () => {
    const before = payoutsEmptyCopy("2026-12-01", new Date("2026-10-02T00:00:00Z"));
    expect(before).toMatch(/Token Tails will list/);
    expect(before).toMatch(/will start counting on 1 December 2026\.$/);
    const after = payoutsEmptyCopy("2026-10-02", new Date("2026-10-05T00:00:00Z"));
    expect(after).toMatch(/From 2 October 2026 on, the USDC that comes in to the campaign wallet counts toward the goal: today, sponsored treats\.$/);
    const none = payoutsEmptyCopy("", new Date());
    expect(none).toBe(
      "No mainnet payouts yet. Token Tails will list each payout here as soon as the first mainnet contract goes live."
    );
    for (const text of [before, after, none]) expect(text).not.toMatch(/\b(paid|sent|raised)\b/);
  });

  it("app builds get the proof notice, never wallet or explorer wording", () => {
    process.env.NEXT_PUBLIC_IS_APP = "true";
    render(<ShelterPayouts />);
    const notice = screen.getByTestId("payouts-app-notice");
    expect(notice.textContent).not.toMatch(/wallet|explorer|USDC|on-chain/i);
    expect(screen.getByRole("button", { name: "SEE THE PROOF" })).toBeTruthy();
  });

  it("custody and handover lines follow the F7.2 app labels", () => {
    expect(custodyDisclosure(true)).not.toMatch(/wallet|on-chain/i);
    expect(custodyDisclosure(false)).toMatch(/wallet/);
    expect(handoverLabel("held-by-token-tails", true)).toMatch(/Held by Token Tails/);
    expect(handoverLabel("handed-over", true)).toBe("Held by shelter");
    expect(handoverLabel("handed-over")).toMatch(/keys/);
  });

  it("ShelterProfile hides the wallet row in app builds", () => {
    const campaign = {
      name: "Autumn",
      goalUsdc: "90",
      startDate: "2026-10-02",
      endDate: "2027-09-30",
      chainId: 5042,
      fromBlock: null,
      sources: [],
      token: null,
      startBalance: "0",
      shelter: { name: "Pink Paw", wallet: "0x" + "a".repeat(40), handover: "held-by-token-tails" as const },
    };
    const { rerender } = render(<ShelterProfile campaign={campaign} isApp />);
    expect(screen.getByTestId("shelter-profile").textContent).not.toMatch(/wallet|0xaaaa/i);
    rerender(<ShelterProfile campaign={campaign} isApp={false} />);
    expect(screen.getByTestId("shelter-profile").textContent).toMatch(/Wallet/);
  });
});
