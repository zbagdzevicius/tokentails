/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, renderHook, screen, within } from "@testing-library/react";

/**
 * The lobby impact board with the real <Claim> and <EvidenceChip> (claim guards: every figure keeps
 * its as-of date and its tier and status chips, and its accessible name is the full sentence), and
 * the lobby's motion pause (lobbyMotion.ts, WCAG 2.2.2).
 */

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@capacitor/browser", () => ({ Browser: { open: jest.fn() } }));
jest.mock("next/dynamic", () => () => () => null);

import type { PublicImpact } from "@/api/impact-api";
import { ImpactStrip } from "@/components/impact/ImpactStrip";
import { pawView } from "@/components/impact/pawView";
import {
  MOTION_PAUSED_ATTR,
  resetLobbyMotion,
  setLobbyMotionPaused,
  useLobbyMotionPaused,
  useLobbyMotionScope,
  useStillFrame,
} from "@/components/game/lobbyMotion";

const AS_OF = "2026-10-18T11:05:00.000Z";

function paidSnapshot(custody: "handed-over" | "held-by-token-tails" = "handed-over"): PublicImpact {
  return {
    _v: 1,
    bucket: "b",
    generatedAt: AS_OF,
    asOf: { chain: AS_OF, mongo: AS_OF },
    sources: { chain: "ok", mongo: "ok" },
    money: {
      custody,
      bySymbol: { USDC: "63850000000000000000", "USDC.e": "200000000000000000", USDG: "100000000000000000" },
      byBucket: {},
      eventCount: 60,
      lastTxHash: null,
    },
    chain: { chainId: 5042, contract: null, fromBlock: null, lastScannedBlock: null },
    players: { registeredAllTime: 10, active30d: null },
    heists: { verified: null },
    shelters: { total: 1, partners: 1, countries: ["LT"], items: [] },
    rescueCats: { total: 0, adopted: 0 },
    outcomes: { published: 0, items: [] },
    rail: {
      state: "live",
      chainId: 5042,
      splitAddress: null,
      amountWei: "0",
      dailyBudgetWei: "0",
      giftsPerDayCap: 0,
      treatsLeftToday: 0,
      resetsAt: AS_OF,
    },
    treats: { confirmedCount: 86, onTheirWayCount: 0, totalConfirmedWei: "860000000000000000" },
    pledges: { status: "not-started", rows: [] },
    pawSettlements: { count: 0, latest: null, sendEnabled: false },
    rescueGoals: { open: 0, items: [] },
  } as unknown as PublicImpact;
}

const guest = pawView("guest", null);

describe("lobby board claims", () => {
  it("names each money slot with the full sentence, its date and its labels", () => {
    render(<ImpactStrip impact={paidSnapshot()} paw={guest} onOpenImpact={jest.fn()} isApp={false} now={null} />);
    const treats = screen.getByRole("button", {
      name: /^Token Tails has sent 0\.86 USDC in treats so far, as of 18 Oct 2026\. ON-CHAIN · SHELTER WALLET, LIVE\./,
    });
    expect(treats.getAttribute("data-claim")).toBe("L-treats");
    const shelters = screen.getByRole("button", {
      name: /^Token Tails has sent 63\.85 USDC · 0\.20 USDC\.e · 0\.10 USDG to shelters, as of 18 Oct 2026\. ON-CHAIN · SHELTER WALLET, LIVE\./,
    });
    expect(shelters.getAttribute("data-claim")).toBe("L-disbursed");
    const given = screen.getByRole("button", { name: /^\$40K\+ donated in crypto and goods, as of 3 Oct 2026\. COMPANY-REPORTED\./ });
    expect(given.getAttribute("data-claim")).toBe("F-026");
  });

  it("keeps every chip visible on its slot, condensed only where the label is long", () => {
    render(<ImpactStrip impact={paidSnapshot()} paw={guest} onOpenImpact={jest.fn()} isApp={false} now={null} />);
    for (const id of ["L-treats", "L-disbursed"]) {
      const slot = document.querySelector(`[data-claim="${id}"]`) as HTMLElement;
      const tier = slot.querySelector('[data-chip="onchain-shelter-held"]') as HTMLElement;
      // Visible "ON-CHAIN"; the full label is screen-reader text and in the tooltip.
      expect(within(tier).getByText("ON-CHAIN").getAttribute("aria-hidden")).toBe("true");
      expect(within(tier).getByText("ON-CHAIN · SHELTER WALLET").className).toContain("sr-only");
      expect(tier.getAttribute("title")).toMatch(/^ON-CHAIN · SHELTER WALLET: /);
      expect(slot.querySelector('[data-chip="live"]')?.textContent).toBe("LIVE");
      // The as-of date is on the slot, the full one on hover.
      const asOf = slot.querySelector('[data-testid="board-asof"]') as HTMLElement;
      expect(asOf.textContent).toBe("18 Oct");
      expect(asOf.getAttribute("title")).toBe("As of 18 Oct 2026");
    }
    const given = document.querySelector('[data-claim="F-026"]') as HTMLElement;
    expect(given.querySelector('[data-chip="company-reported"]')?.textContent).toBe("COMPANY-REPORTED");
    expect(given.querySelector('[data-testid="board-asof"]')?.getAttribute("title")).toBe("As of 3 Oct 2026");
  });

  it("shows each coin on its own and never sums them", () => {
    render(<ImpactStrip impact={paidSnapshot()} paw={guest} onOpenImpact={jest.fn()} isApp={false} now={null} />);
    const shelters = document.querySelector('[data-claim="L-disbursed"]') as HTMLElement;
    const amounts = Array.from(shelters.querySelectorAll('[data-testid="board-amount"]')).map((a) => a.textContent);
    expect(amounts).toEqual(["63.85USDC", "0.20USDC.e", "0.10USDG"]);
    expect(document.body.textContent).not.toMatch(/64\.15/);
  });

  it("app builds show the app labels, with no chain words", () => {
    render(<ImpactStrip impact={paidSnapshot()} paw={guest} onOpenImpact={jest.fn()} isApp now={null} />);
    const board = screen.getByTestId("impact-strip");
    expect(board.textContent).not.toMatch(/on-?chain|wallet/i);
    expect(board.querySelector('[data-chip="onchain-shelter-held"]')?.textContent).toBe("PAID TO SHELTER");
  });
});

describe("lobby motion pause", () => {
  afterEach(() => resetLobbyMotion());

  it("pauses only while the lobby is mounted, and marks <html> for the CSS", () => {
    const paused = renderHook(() => useLobbyMotionPaused());
    act(() => setLobbyMotionPaused(true));
    // No lobby on screen: nothing pauses (a run never starts frozen).
    expect(paused.result.current).toBe(false);
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(false);
    const scope = renderHook(() => useLobbyMotionScope());
    expect(paused.result.current).toBe(true);
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(true);
    act(() => setLobbyMotionPaused(false));
    expect(paused.result.current).toBe(false);
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(false);
    act(() => setLobbyMotionPaused(true));
    scope.unmount();
    expect(paused.result.current).toBe(false);
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(false);
  });

  it("the board's pause drives the lobby store", () => {
    renderHook(() => useLobbyMotionScope());
    const paused = renderHook(() => useLobbyMotionPaused());
    const Board = () => {
      const p = useLobbyMotionPaused();
      return (
        <ImpactStrip
          impact={null}
          paw={guest}
          onOpenImpact={jest.fn()}
          isApp={false}
          now={null}
          paused={p}
          onPausedChange={setLobbyMotionPaused}
        />
      );
    };
    render(<Board />);
    act(() => screen.getByTestId("impact-strip-pause").click());
    expect(paused.result.current).toBe(true);
    expect(screen.getByTestId("impact-strip-pause").getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(true);
    act(() => screen.getByTestId("impact-strip-pause").click());
    expect(paused.result.current).toBe(false);
    expect(document.documentElement.hasAttribute(MOTION_PAUSED_ATTR)).toBe(false);
  });

  it("a paused GIF shows the cat's still frame", () => {
    const { result, rerender } = renderHook(({ frozen }) => useStillFrame("/cat/idle.gif", frozen, "/cat/still.png"), {
      initialProps: { frozen: false },
    });
    expect(result.current).toBeNull();
    rerender({ frozen: true });
    expect(result.current).toBe("/cat/still.png");
  });
});
