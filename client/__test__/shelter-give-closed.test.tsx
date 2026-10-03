/**
 * @jest-environment jsdom
 */
/**
 * /shelter-payouts/give: a signed-out visitor is never asked to sign in for a treat that cannot
 * be sent (backend unreachable, rail paused, or today's jar empty).
 */
import { render, screen, waitFor } from "@testing-library/react";

const getDonateStatus = jest.fn();
const requireAccount = jest.fn();

jest.mock("@/api/shelter-api", () => ({
  SHELTER_API: { getDonateStatus: () => getDonateStatus(), donate: jest.fn() },
}));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ authStatus: "signed-out", requireAccount }),
}));
jest.mock("next/router", () => ({ useRouter: () => ({ query: { from: "heist" } }) }));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () => Promise.reject(new Error("offline")),
}));
jest.mock("@/components/shelter-payouts/Celebration", () => ({ Celebration: () => null }));
// The Pink Paw logo and photos read the shared storefront query (a provider these tests do not mount).
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({ PinkPawLogo: () => null, PinkPawStrip: () => null }));

import { GiveTreat } from "@/components/shelter-payouts/GiveTreat";

const open = { enabled: true, chainId: 5042, amountWei: "10000000000000000", remainingTodayWei: "50000000000000000" };

describe("GiveTreat when the jar is closed", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["backend unreachable", null],
    ["rail paused", { ...open, enabled: false }],
    ["budget spent", { ...open, remainingTodayWei: "0" }],
  ])("%s: disables the button and drops the sign-in label", async (_label, status) => {
    getDonateStatus.mockResolvedValue(status);
    render(<GiveTreat />);
    const button = screen.getByTestId("send-treat");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(button.textContent).not.toMatch(/sign in/i);
    button.click();
    expect(requireAccount).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in when a treat can be sent", async () => {
    getDonateStatus.mockResolvedValue(open);
    render(<GiveTreat />);
    await screen.findByTestId("treat-amount");
    const button = screen.getByTestId("send-treat") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toMatch(/sign in to send a treat/i);
  });
});
