/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const track = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (e: unknown) => track(e) },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
}));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));
jest.mock("@/api/api", () => ({ apiUrl: "http://api.test", currentAccessToken: () => "fbtoken", apiFetch: jest.fn() }));
let viewer = "registered";
jest.mock("@/components/impact/useImpactMe", () => ({
  IMPACT_ME_QUERY_KEY: "impact-me",
  DONATE_RAIL_QUERY_KEY: "donate-rail",
  useImpactMe: () => ({ viewer, me: null, loading: false }),
}));
jest.mock("@/hooks/useImpact", () => ({ useImpact: () => ({ impact: null, source: null, loading: false }) }));
const setProfileUpdate = jest.fn();
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: { _id: "u1" }, setProfileUpdate }) }));
const toast = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => toast }));
// A guest who signs in when asked (signInWhenAsked) becomes a registered account before the action runs.
let signInWhenAsked = false;
const runWithAccount = jest.fn(async (_r: string, action: () => unknown) => {
  if (viewer !== "registered" && signInWhenAsked) viewer = "registered";
  return viewer === "registered" ? action() : undefined;
});
jest.mock("@/hooks/useAccountAction", () => ({
  useAccountAction: () => ({ runWithAccount }),
  useLatest: (v: unknown) => ({ current: v }),
}));
// GameModal pulls in the game registry and focus traps: a plain dialog is enough here.
jest.mock("@/components/ui/GameModal", () => ({
  GameModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

const pledgeBodies: Array<{ amount: number; pledgeId: string }> = [];
let interruptFirst = true;
/** Every attempt is interrupted (the give may or may not have reached the backend). */
let interruptAll = false;
/** The backend refuses every give with this code. */
let refuseWith: string | null = null;
/** What the goal has raised; a refusal can move it (another player filled it first). */
let goalRaised = 4000;
let raisedAfterRefusal: number | null = null;
let accountEligible = true;
let givesReads = 0;
jest.mock("@/api/impact-api", () => ({
  fetchDonateRail: async () => ({ enabled: true, state: "live", treatsLeftToday: 5, resetsAt: "2026-10-01T00:00:00Z" }),
}));
jest.mock("@/components/codex/impact/treat", () => {
  const actual = jest.requireActual("@/components/codex/impact/treat");
  return {
    ...actual,
    fetchDonateMe: async () => ({
      resetsAt: null,
      today: null,
      confirmedCount: 1,
      onTheirWayCount: 0,
      eligibility: { eligible: true, reason: null, eligibleAt: null },
    }),
    sendTreat: async () => ({ kind: "budget-spent" }),
  };
});
jest.mock("@/api/rescue-goals-api", () => {
  const actual = jest.requireActual("@/api/rescue-goals-api");
  const goal = () =>
    actual.normalizeGoal({
      id: "g1",
      title: "Winter food",
      deliverable: "Food",
      status: "OPEN",
      targetTails: 10000,
      raisedTails: goalRaised,
      shelter: { name: "Pink Paw" },
    });
  return {
    ...actual,
    fetchGoals: async () => [goal()],
    fetchMyGives: async () => {
      givesReads += 1;
      return actual.normalizeMyGives({
        daily: { cap: 5000, used: 0, left: 5000 },
        balance: { tails: 3000 },
        totals: { tailsGiven: 0, goalsHelped: 0 },
        eligibility: accountEligible
          ? { eligible: true, open: true }
          : { eligible: false, open: true, reason: "account-too-new", eligibleAt: null },
        limits: { min: 10, max: 5000 },
      });
    },
    pledgeWithRetry: (req: { goalId: string; amount: number; pledgeId: string }, opts: unknown) =>
      actual.pledgeWithRetry(
        {
          ...req,
          fetchImpl: async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            pledgeBodies.push(body);
            if (interruptAll) return { ok: false, status: 503, json: async () => ({ code: "PLEDGE_INTERRUPTED" }) };
            if (refuseWith) {
              if (raisedAfterRefusal !== null) goalRaised = raisedAfterRefusal;
              return { ok: false, status: 409, json: async () => ({ code: refuseWith }) };
            }
            if (interruptFirst && pledgeBodies.length === 1) {
              return { ok: false, status: 503, json: async () => ({ code: "PLEDGE_INTERRUPTED" }) };
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                pledge: { pledgeId: body.pledgeId, amount: body.amount, status: "CONFIRMED" },
                goal: { id: "g1", status: "OPEN", raisedTails: 4000 + body.amount, targetTails: 10000, remainingTails: 6000 - body.amount },
                balance: { tails: 3000 - body.amount },
                daily: { cap: 5000, used: body.amount, left: 5000 - body.amount },
              }),
            };
          },
        },
        { ...(opts as object), wait: async () => undefined }
      ),
  };
});

import { ImpactTab } from "@/components/codex/impact/ImpactTab";

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ImpactTab season={null} seasonLoading={false} />
    </QueryClientProvider>
  );

beforeEach(() => {
  viewer = "registered";
  pledgeBodies.length = 0;
  interruptFirst = true;
  interruptAll = false;
  refuseWith = null;
  goalRaised = 4000;
  raisedAfterRefusal = null;
  accountEligible = true;
  signInWhenAsked = false;
  givesReads = 0;
  track.mockClear();
  toast.mockClear();
});

describe("IMPACT tab", () => {
  it("tracks impact_tab_viewed once and shows every card", async () => {
    renderTab();
    expect(await screen.findByTestId("goal-open")).toBeTruthy();
    for (const id of ["season-band", "treat-card", "todays-paw", "my-impact", "delivered-strip"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(track.mock.calls.filter(([e]) => e.name === "impact_tab_viewed")).toHaveLength(1);
  });

  it("a give needs the confirm sheet and re-sends the same client UUID", async () => {
    renderTab();
    const chip = await screen.findByTestId("give-chip-1000");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    const sheet = await screen.findByRole("dialog", { name: "GIVE TAILS" });
    expect(sheet.textContent).toContain("Giving never lowers your rank.");
    expect(pledgeBodies).toHaveLength(0); // nothing is sent before CONFIRM
    fireEvent.click(screen.getByTestId("give-confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "GIVE TAILS" })).toBeNull());
    expect(pledgeBodies).toHaveLength(2);
    expect(pledgeBodies[0]).toEqual({ amount: 1000, pledgeId: pledgeBodies[1].pledgeId });
    expect(setProfileUpdate).toHaveBeenCalledWith({ tails: 2000 });
    expect(track.mock.calls.some(([e]) => e.name === "pledge_made")).toBe(true);
  });

  it("a new give gets a new UUID", async () => {
    interruptFirst = false;
    renderTab();
    const chip = await screen.findByTestId("give-chip-100");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    fireEvent.click(await screen.findByTestId("give-confirm"));
    await waitFor(() => expect(pledgeBodies).toHaveLength(1));
    fireEvent.click(screen.getByTestId("give-chip-100"));
    fireEvent.click(await screen.findByTestId("give-confirm"));
    await waitFor(() => expect(pledgeBodies).toHaveLength(2));
    expect(pledgeBodies[0].pledgeId).not.toBe(pledgeBodies[1].pledgeId);
  });

  it("an interrupted give, closed and picked again, keeps its UUID and reloads the account", async () => {
    interruptAll = true;
    renderTab();
    const chip = await screen.findByTestId("give-chip-100");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    fireEvent.click(await screen.findByTestId("give-confirm"));
    await screen.findByTestId("give-problem");
    expect(screen.getByTestId("give-confirm").textContent).toBe("Try again");
    const first = pledgeBodies.length;
    expect(first).toBeGreaterThan(0);
    const reads = givesReads;
    fireEvent.click(screen.getByTestId("give-cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "GIVE TAILS" })).toBeNull());
    await waitFor(() => expect(givesReads).toBeGreaterThan(reads)); // balance and MAX read again
    fireEvent.click(screen.getByTestId("give-chip-100"));
    const retry = await screen.findByTestId("give-confirm");
    expect(retry.textContent).toBe("Try again");
    fireEvent.click(retry);
    await waitFor(() => expect(pledgeBodies.length).toBeGreaterThan(first));
    expect(new Set(pledgeBodies.map((b) => b.pledgeId)).size).toBe(1);
  });

  it("after an interrupted give, any chip re-offers that same give, so MAX never makes a second one", async () => {
    interruptAll = true;
    renderTab();
    const chip = await screen.findByTestId("give-chip-1000");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    fireEvent.click(await screen.findByTestId("give-confirm"));
    await screen.findByTestId("give-problem");
    const first = pledgeBodies.length;
    fireEvent.click(screen.getByTestId("give-cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "GIVE TAILS" })).toBeNull());
    // The give may have gone through, so the refreshed MAX can differ from 1,000: tapping it must
    // still re-send the interrupted give (the backend replays it) rather than start a new one.
    interruptAll = false;
    interruptFirst = false;
    fireEvent.click(screen.getByTestId("give-chip-max"));
    const retry = await screen.findByTestId("give-confirm");
    expect(retry.textContent).toBe("Try again");
    fireEvent.click(retry);
    await waitFor(() => expect(pledgeBodies.length).toBeGreaterThan(first));
    expect(new Set(pledgeBodies.map((b) => b.pledgeId)).size).toBe(1);
    expect(new Set(pledgeBodies.map((b) => b.amount))).toEqual(new Set([1000]));
  });

  it("after a refusal the sheet only closes: no button re-sends the refused give", async () => {
    interruptFirst = false;
    refuseWith = "PLEDGES_PAUSED";
    renderTab();
    const chip = await screen.findByTestId("give-chip-1000");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    fireEvent.click(await screen.findByTestId("give-confirm"));
    expect((await screen.findByTestId("give-problem")).textContent).toBe("Giving to goals opens soon.");
    expect(screen.queryByTestId("give-confirm")).toBeNull();
    expect(screen.getByTestId("give-cancel").textContent).toBe("Close");
    expect(pledgeBodies).toHaveLength(1);
  });

  it("a goal that needs fewer Tails offers the smaller give with a new UUID", async () => {
    interruptFirst = false;
    refuseWith = "GOAL_OVERFLOW";
    raisedAfterRefusal = 9950; // 50 left
    renderTab();
    const chip = await screen.findByTestId("give-chip-1000");
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(chip);
    fireEvent.click(await screen.findByTestId("give-confirm"));
    const problem = await screen.findByTestId("give-problem");
    expect(problem.textContent).toContain("You can give 50 Tails instead.");
    expect(screen.getByTestId("give-confirm").textContent).toBe("Give 50");
    refuseWith = null;
    fireEvent.click(screen.getByTestId("give-confirm"));
    await waitFor(() => expect(pledgeBodies).toHaveLength(2));
    expect(pledgeBodies[1].amount).toBe(50);
    expect(pledgeBodies[1].pledgeId).not.toBe(pledgeBodies[0].pledgeId);
  });

  it("a guest who signs in from a chip with a too-new account gets a toast, not a sheet", async () => {
    viewer = "guest";
    signInWhenAsked = true;
    accountEligible = false;
    renderTab();
    fireEvent.click(await screen.findByTestId("give-chip-100"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ message: "Giving opens three days after you join.", isError: true })
    );
    expect(screen.queryByRole("dialog", { name: "GIVE TAILS" })).toBeNull();
    expect(pledgeBodies).toHaveLength(0);
  });

  it("a guest is asked for an account and never gives", async () => {
    viewer = "guest";
    renderTab();
    fireEvent.click(await screen.findByTestId("give-chip-100"));
    await waitFor(() => expect(runWithAccount).toHaveBeenCalledWith("save-progress", expect.any(Function)));
    expect(screen.queryByRole("dialog", { name: "GIVE TAILS" })).toBeNull();
    expect(screen.getByTestId("my-impact-guest")).toBeTruthy();
    expect(screen.getByTestId("treat-card").querySelector("[data-treat-state]")!.getAttribute("data-treat-state")).toBe("not-eligible");
  });

  it("the treat card follows the DONATE_* answer and tracks treat_sent", async () => {
    renderTab();
    const send = await screen.findByTestId("treat-send");
    fireEvent.click(send);
    await waitFor(() =>
      expect(screen.getByTestId("treat-card").querySelector("[data-treat-state]")!.getAttribute("data-treat-state")).toBe("budget-spent")
    );
    expect(track).toHaveBeenCalledWith({ name: "treat_sent", properties: { status: "rejected" } });
  });
});
