/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Task 5e (plan G4 "Client", 2.13 row 29): the lobby RESCUE tile, the md+ impact strip and today's
 * paw progress, in every state they can show.
 */

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}`, bgStyle: () => ({}), isMobile: () => false }));
jest.mock("@/components/claims/Claim", () => ({
  Claim: ({ id, values, text }: { id: string; values: Record<string, unknown>; text?: string }) => (
    <span data-testid="claim" data-claim={id} data-text={text}>
      {JSON.stringify(values)}
    </span>
  ),
}));
jest.mock("@/components/claims/EvidenceChip", () => ({
  EvidenceChip: ({ kind }: { kind: string }) => <span data-testid="chip">{kind}</span>,
}));

import { GameModal } from "@/models/game";
import { ImpactStrip } from "@/components/impact/ImpactStrip";
import { PawProgress } from "@/components/impact/PawProgress";
import { pawView, pawDayEnd, runsLeftText, timeLeft } from "@/components/impact/pawView";
import {
  openProgress,
  PROGRESS_TAB_EVENT,
  PROGRESS_TAB_TTL_MS,
  clearProgressTab,
  peekProgressTab,
  requestProgressTab,
  takeProgressTab,
} from "@/components/impact/progressTab";
import {
  MeetShelterCatsButton,
  RESCUE_SEEN_KEY,
  RescueTile,
  rescueBadge,
  ShelterTile,
} from "@/components/impact/RescueTile";
import { stripFigures, partnerShelterName, treatsFigure, disbursedFigure } from "@/components/impact/live";
import type { ImpactMe, PublicImpact } from "@/api/impact-api";

const DAY = "2026-10-02";

function me(today: Partial<NonNullable<ImpactMe["paws"]>["today"]> = {}, lifetime = 0): ImpactMe {
  return {
    treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0", lastConfirmedAt: null },
    instantTreat: { eligible: false, reason: null, eligibleAt: null },
    paws: {
      today: {
        day: DAY,
        qualifyingRuns: 1,
        runsNeeded: 2,
        remaining: 1,
        earned: false,
        eligibility: { eligible: true, reason: null, eligibleAt: null },
        settlesAt: `2026-10-03T00:30:00.000Z`,
        message: "",
        ...today,
      },
      lifetime,
      latestSettlement: null,
      hasProof: false,
    },
  };
}

function snapshot(over: Partial<PublicImpact> = {}): PublicImpact {
  return {
    _v: 1,
    bucket: "b",
    generatedAt: "2026-10-02T05:00:00.000Z",
    asOf: { chain: "2026-10-02T05:00:00.000Z", mongo: "2026-10-02T05:00:00.000Z" },
    sources: { chain: "not-deployed", mongo: "ok" },
    money: { custody: "held-by-token-tails", bySymbol: {}, byBucket: {}, eventCount: 0, lastTxHash: null },
    chain: { chainId: 5042, contract: null, fromBlock: null, lastScannedBlock: null },
    players: { registeredAllTime: 10, active30d: null },
    heists: { verified: null },
    shelters: {
      total: 1,
      partners: 1,
      countries: ["LT"],
      items: [
        {
          slug: "pink-paw",
          name: "Pink Paw",
          countryCode: "LT",
          partnerStatus: "active",
          role: "partner",
          handoverStatus: "held-by-token-tails",
          publicWallet: null,
        } as unknown as PublicImpact["shelters"]["items"][number],
      ],
    },
    rescueCats: { total: 0, adopted: 0 },
    outcomes: { published: 0, items: [] },
    rail: {
      state: "not-deployed",
      chainId: 5042,
      splitAddress: null,
      amountWei: "0",
      dailyBudgetWei: "0",
      giftsPerDayCap: 0,
      treatsLeftToday: 0,
      resetsAt: "2026-10-03T00:00:00.000Z",
    },
    treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0" },
    pledges: { status: "not-started", rows: [] },
    pawSettlements: { count: 0, latest: null, sendEnabled: false },
    rescueGoals: { open: 0, items: [] },
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  takeProgressTab();
});

describe("pawView", () => {
  it("asks a guest to save progress and never counts runs", () => {
    const v = pawView("guest", null);
    expect(v.state).toBe("guest");
    expect(v.runs).toBeNull();
    expect(v.text).toMatch(/Save your progress/);
  });

  it("asks an unverified account to verify", () => {
    expect(pawView("unverified", null).state).toBe("unverified");
  });

  it("shows loading while the first read is in flight", () => {
    expect(pawView("registered", null, true).state).toBe("loading");
    expect(pawView("loading", null).state).toBe("loading");
  });

  it("falls back to a no-claim line when /impact/me failed", () => {
    const v = pawView("registered", null);
    expect(v.state).toBe("unavailable");
    expect(v.text).not.toMatch(/earned/i);
  });

  it("counts the runs left, singular and plural", () => {
    expect(runsLeftText(1)).toBe("1 more run for today's paw");
    expect(runsLeftText(2)).toBe("2 more runs for today's paw");
    const v = pawView("registered", me({ qualifyingRuns: 0, remaining: 2 }, 4));
    expect(v).toMatchObject({ state: "progress", text: "2 more runs for today's paw", lifetime: 4 });
    expect(v.runs).toEqual({ done: 0, needed: 2 });
    expect(v.closesAt?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("says earned only when the runs are done and the account is eligible", () => {
    const earned = pawView("registered", me({ qualifyingRuns: 2, remaining: 0, earned: true }));
    expect(earned.state).toBe("earned");
    const young = pawView(
      "registered",
      me({ qualifyingRuns: 2, remaining: 0, eligibility: { eligible: false, reason: "account-too-new", eligibleAt: null } })
    );
    expect(young).toMatchObject({ state: "blocked", text: "Paws start once your account is a day old." });
    const unverified = pawView(
      "registered",
      me({ qualifyingRuns: 2, remaining: 0, eligibility: { eligible: false, reason: "email-unverified", eligibleAt: null } })
    );
    expect(unverified.text).toMatch(/Verify your email/);
  });

  it("formats the countdown and the paw day end", () => {
    expect(pawDayEnd("bad")).toBeNull();
    const end = pawDayEnd(DAY)!;
    expect(timeLeft(end, new Date("2026-10-02T21:48:00Z"))).toBe("2h 12m");
    expect(timeLeft(end, new Date("2026-10-02T23:59:30Z"))).toBe("1m");
    expect(timeLeft(end, new Date("2026-10-03T00:00:01Z"))).toBeNull();
    expect(timeLeft(null, new Date())).toBeNull();
    // A device clock days behind the paw day shows no countdown rather than "60h left today".
    expect(timeLeft(end, new Date("2026-09-30T12:00:00Z"))).toBeNull();
  });
});

describe("PawProgress", () => {
  it("shows the dots, the line and a local-time countdown", () => {
    const view = pawView("registered", me({ qualifyingRuns: 1, remaining: 1 }));
    render(<PawProgress view={view} now={new Date("2026-10-02T20:00:00Z")} />);
    expect(screen.getByTestId("paw-text").textContent).toContain("1 more run for today's paw");
    expect(screen.getByRole("img", { name: "1 of 2 runs today" })).toBeTruthy();
    expect(screen.getByTestId("paw-countdown").textContent).toMatch(/^4h 0m left today \(until .+\)$/);
    expect(screen.getByTestId("chip").textContent).toContain("in-game");
  });

  it("renders no countdown before mount (server render) or for a guest", () => {
    const { rerender } = render(<PawProgress view={pawView("registered", me())} now={null} />);
    expect(screen.queryByTestId("paw-countdown")).toBeNull();
    rerender(<PawProgress view={pawView("guest", null)} now={new Date()} />);
    expect(screen.queryByTestId("paw-countdown")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("paw-progress").getAttribute("data-paw-state")).toBe("guest");
  });

  it("drops the evidence chip in the compact strip variant", () => {
    render(<PawProgress view={pawView("guest", null)} variant="compact" now={null} />);
    expect(screen.queryByTestId("chip")).toBeNull();
  });
});

describe("RescueTile", () => {
  it("picks the badge: paw count, 99+, NEW until seen, or nothing", () => {
    expect(rescueBadge(3, false)).toBe("3");
    expect(rescueBadge(3, true)).toBe("3");
    expect(rescueBadge(120, true)).toBe("99+");
    expect(rescueBadge(0, false)).toBe("NEW");
    expect(rescueBadge(0, true)).toBeNull();
  });

  it("shows NEW for a first visit, then clears it once opened", () => {
    const onOpen = jest.fn();
    const { unmount } = render(<RescueTile lifetimePaws={0} onOpen={onOpen} />);
    expect(screen.getByTestId("rescue-badge").textContent).toContain("NEW");
    fireEvent.click(screen.getByTestId("rescue-tile"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("rescue-badge")).toBeNull();
    expect(window.localStorage.getItem(RESCUE_SEEN_KEY)).toBe("1");
    unmount();
    render(<RescueTile lifetimePaws={0} onOpen={onOpen} />);
    expect(screen.queryByTestId("rescue-badge")).toBeNull();
  });

  it("names the paws in its accessible label", () => {
    render(<RescueTile lifetimePaws={1} onOpen={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Rescue: your impact, 1 paw earned" })).toBeTruthy();
    expect(screen.getByTestId("rescue-badge").textContent).toContain("1");
  });

  it("still works when storage throws", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const onOpen = jest.fn();
    render(<RescueTile lifetimePaws={0} onOpen={onOpen} />);
    expect(screen.getByTestId("rescue-badge").textContent).toContain("NEW");
    fireEvent.click(screen.getByTestId("rescue-tile"));
    expect(onOpen).toHaveBeenCalled();
    spy.mockRestore();
    set.mockRestore();
  });

  it("MEET SHELTER CATS opens the Shelter in one tap, as a button and as a tile", () => {
    const onOpen = jest.fn();
    render(
      <>
        <MeetShelterCatsButton onOpen={onOpen} />
        <ShelterTile onOpen={onOpen} />
      </>
    );
    fireEvent.click(screen.getByTestId("meet-shelter-cats"));
    fireEvent.click(screen.getByTestId("shelter-tile"));
    expect(onOpen).toHaveBeenCalledTimes(2);
    // The tile's art reads SHELTER; MEET CATS is visible on a band inside it, and the accessible
    // name says the whole action.
    expect(screen.getByTestId("shelter-tile-caption").textContent).toMatch(/^Meet cats$/i);
    expect(screen.getByTestId("shelter-tile").getAttribute("aria-label")).toBe("Meet shelter cats");
    expect(screen.getByTestId("meet-shelter-cats").getAttribute("aria-label")).toBe("Meet shelter cats");
  });

  it("the RESCUE heart follows the lobby pause", () => {
    const { rerender } = render(<RescueTile lifetimePaws={0} onOpen={jest.fn()} />);
    expect(screen.getByTestId("rescue-heart").getAttribute("data-paused")).toBeNull();
    expect(screen.getByTestId("rescue-heart").className).toMatch(/animate-pulse/);
    rerender(<RescueTile lifetimePaws={0} onOpen={jest.fn()} paused />);
    expect(screen.getByTestId("rescue-heart").getAttribute("data-paused")).toBe("true");
    expect(screen.getByTestId("rescue-heart").className).not.toMatch(/animate-pulse/);
  });
});

describe("openProgress (RESCUE opens PROGRESS on IMPACT)", () => {
  it("opens the CODEX modal and passes the impact tab, once", () => {
    const setOpenedModal = jest.fn();
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(PROGRESS_TAB_EVENT, listener);
    openProgress(setOpenedModal);
    window.removeEventListener(PROGRESS_TAB_EVENT, listener);
    expect(setOpenedModal).toHaveBeenCalledWith(GameModal.CODEX);
    expect(events).toEqual([{ tab: "impact" }]);
    expect(peekProgressTab()).toBe("impact");
    expect(takeProgressTab()).toBe("impact");
    expect(takeProgressTab()).toBeNull();
  });

  it("drops a stale request", () => {
    requestProgressTab("badges", 1000);
    expect(peekProgressTab(1000 + PROGRESS_TAB_TTL_MS + 1)).toBeNull();
  });

  it("survives a slow first open of a lazily loaded Codex", () => {
    requestProgressTab("impact", 1000);
    expect(PROGRESS_TAB_TTL_MS).toBeGreaterThanOrEqual(15_000);
    expect(peekProgressTab(1000 + 12_000)).toBe("impact");
    clearProgressTab();
    expect(peekProgressTab(1000 + 12_000)).toBeNull();
  });
});

describe("live figures", () => {
  it("shows nothing while no money moved, then per-currency figures", () => {
    expect(stripFigures(null, false)).toEqual([]);
    expect(stripFigures(snapshot(), false)).toEqual([]);
    const paid = snapshot({
      sources: { chain: "ok", mongo: "ok" },
      money: {
        custody: "held-by-token-tails",
        bySymbol: { USDC: "2000000000000000000", EURC: "0" },
        byBucket: {},
        eventCount: 2,
        lastTxHash: null,
      },
      treats: { confirmedCount: 1, onTheirWayCount: 0, totalConfirmedWei: "10000000000000000" },
    });
    expect(treatsFigure(paid, false)?.id).toBe("L-treats");
    expect(disbursedFigure(paid, false)?.values.amount).toMatch(/2/);
    expect(stripFigures(paid, false).map((f) => f.id)).toEqual(["L-treats", "L-disbursed"]);
  });

  it("names the active partner shelter", () => {
    expect(partnerShelterName(snapshot())).toBe("Pink Paw");
    expect(partnerShelterName(null)).toBeNull();
  });
});

describe("ImpactStrip", () => {
  const paw = pawView("registered", me());

  it("is static: aria-live off, a pause control, and a future-tense empty state", () => {
    const onOpen = jest.fn();
    render(<ImpactStrip impact={snapshot()} paw={paw} onOpenImpact={onOpen} isApp={false} />);
    const strip = screen.getByTestId("impact-strip");
    expect(strip.getAttribute("aria-live")).toBe("off");
    expect(screen.getByTestId("impact-strip-empty").textContent).toMatch(/^No treat-rail payouts yet\. The first goes out when the rail opens\.$/);
    const pause = screen.getByTestId("impact-strip-pause");
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      fireEvent.click(pause);
    });
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("impact-strip-heart").getAttribute("data-paused")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "My impact" }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Proof" }).getAttribute("href")).toBe("/impact");
  });

  it("a controlled pause is reported to the lobby, which pauses the RESCUE heart too", () => {
    const onPausedChange = jest.fn();
    const { rerender } = render(
      <ImpactStrip impact={snapshot()} paw={paw} onOpenImpact={jest.fn()} isApp={false} paused={false} onPausedChange={onPausedChange} />
    );
    fireEvent.click(screen.getByTestId("impact-strip-pause"));
    expect(onPausedChange).toHaveBeenCalledWith(true);
    rerender(
      <ImpactStrip impact={snapshot()} paw={paw} onOpenImpact={jest.fn()} isApp={false} paused onPausedChange={onPausedChange} />
    );
    expect(screen.getByTestId("impact-strip-heart").getAttribute("data-paused")).toBe("true");
  });

  it("renders money through Claim with a claim id", () => {
    const paid = snapshot({
      treats: { confirmedCount: 1, onTheirWayCount: 0, totalConfirmedWei: "10000000000000000" },
    });
    render(<ImpactStrip impact={paid} paw={paw} onOpenImpact={jest.fn()} isApp={false} />);
    expect(screen.getAllByTestId("claim").map((c) => c.getAttribute("data-claim"))).toEqual(["F-026", "L-treats"]);
    expect(screen.queryByTestId("impact-strip-empty")).toBeNull();
  });

  it("uses the registry's short words for F-026 and labels the rail group after it", () => {
    render(<ImpactStrip impact={snapshot()} paw={paw} onOpenImpact={jest.fn()} isApp={false} />);
    const given = screen.getAllByTestId("claim").find((c) => c.getAttribute("data-claim") === "F-026")!;
    expect(given.getAttribute("data-text")).toBe("$40K+ donated in crypto and goods");
    const label = screen.getByTestId("impact-strip-rail-label");
    expect(label.textContent).toBe("On the treat rail:");
    expect(given.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens web proof from an app build instead of a link", () => {
    render(<ImpactStrip impact={snapshot()} paw={paw} onOpenImpact={jest.fn()} isApp />);
    expect(screen.queryByRole("link", { name: "Proof" })).toBeNull();
    expect(screen.getByRole("button", { name: "Proof" })).toBeTruthy();
  });
});
