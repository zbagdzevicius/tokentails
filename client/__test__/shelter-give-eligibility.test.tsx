/**
 * @jest-environment jsdom
 */
/**
 * /shelter-payouts/give for a signed-in account the treat policy (F7.5) refuses: the page says what
 * is missing and never asks the player to sign in again.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

const getDonateStatus = jest.fn();
const donate = jest.fn();
const requireAccount = jest.fn();

jest.mock("@/api/shelter-api", () => ({
  SHELTER_API: { getDonateStatus: () => getDonateStatus(), donate: (s: string) => donate(s) },
}));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ authStatus: "ready", requireAccount }),
}));
jest.mock("next/router", () => ({ useRouter: () => ({ query: { from: "heist" } }) }));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () => Promise.reject(new Error("offline")),
}));
jest.mock("@/components/shelter-payouts/Celebration", () => ({ Celebration: () => null }));
// The Pink Paw logo and photos read the shared storefront query (a provider these tests do not mount).
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({ PinkPawLogo: () => null, PinkPawStrip: () => null }));

import { GiveTreat, notEligibleMessage } from "@/components/shelter-payouts/GiveTreat";

const open = { enabled: true, chainId: 5042, amountWei: "10000000000000000", remainingTodayWei: "50000000000000000" };

describe("GiveTreat for a signed-in account that is not eligible yet", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [{ reason: "email-unverified", eligibleAt: null }, /verify your email/i],
    [{ reason: "account-too-new", eligibleAt: "2026-10-03T10:00:00.000Z" }, /a day after you join/i],
    [{ reason: "no-saved-game", eligibleAt: null }, /play a game with your cat first/i],
  ])("%o: shows the reason and does not ask to sign in", async (refusal, text) => {
    getDonateStatus.mockResolvedValue(open);
    donate.mockResolvedValue({ status: "not-eligible", ...refusal });
    render(<GiveTreat />);
    await screen.findByTestId("treat-amount");
    await act(async () => {
      fireEvent.click(screen.getByTestId("send-treat"));
    });
    expect((await screen.findByTestId("treat-not-eligible")).textContent).toMatch(text);
    expect(requireAccount).not.toHaveBeenCalled();
    expect(donate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sign in again/i)).toBeNull();
  });

  it("falls back to a plain line when eligibleAt is missing or bad", () => {
    expect(notEligibleMessage("account-too-new", null)).toMatch(/come back tomorrow/i);
    expect(notEligibleMessage("account-too-new", "not a date")).toMatch(/come back tomorrow/i);
  });
});
