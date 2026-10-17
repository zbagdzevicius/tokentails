/**
 * @jest-environment jsdom
 */
import { Result, FeedSection } from "@/components/shelter-payouts/payoutSections";
import { ChainCard } from "@/components/shelter-payouts/ShelterPayouts";
import { ShelterDeployment } from "@/components/shelter-payouts/rpc";
import { REVEAL_AFTER_MS, TotalsBillboard, heroTotals } from "@/components/shelter-payouts/TotalsBillboard";
import { act, render, screen } from "@testing-library/react";

/*
 * The /shelter-payouts hero billboard: one board, skeleton while the chains are read, every coin
 * revealed together, coins never added up, and the honesty lines kept.
 */
const SHELTER = "0x" + "e2".repeat(20);
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const addr = (n: number) => "0x" + n.toString(16).padStart(40, "0");

// Arbitrum pays USDC (6 decimals); Arc's EURC deployment overrides the symbol.
const USDC_ARB: ShelterDeployment = { chainId: 42161, address: addr(1), network: "mainnet" };
const USDC_BASE: ShelterDeployment = { chainId: 8453, address: addr(2), network: "mainnet" };
const EURC_ARC: ShelterDeployment = { chainId: 5042, address: addr(3), network: "mainnet", symbol: "EURC", decimals: 6 };

const item = (contract: string, amount: number, tx: number) => ({
  kind: "token" as const,
  contract,
  shelter: SHELTER,
  amount: BigInt(amount),
  memo: "",
  txHash: hash(tx),
  blockNumber: tx,
  logIndex: 0,
});
const done = (...items: ReturnType<typeof item>[]): Result => ({ status: "done", items });

const totalsText = () => screen.getByTestId("payouts-totals").textContent || "";

describe("hero totals billboard", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows the skeleton, busy and labelled, while the deployment list loads", () => {
    render(<TotalsBillboard loading deployments={[]} results={{}} />);
    const board = screen.getByTestId("payouts-totals");
    expect(board.getAttribute("aria-busy")).toBe("true");
    expect(board.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Loading payout totals")).toBeTruthy();
    expect(screen.getByTestId("payouts-skeleton-headline")).toBeTruthy();
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
  });

  it("keeps the skeleton while any chain is read: no coin pops in on its own", () => {
    const deployments = [USDC_ARB, EURC_ARC];
    render(<TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 3_000_000, 1)) }} />);
    expect(screen.getByTestId("payouts-totals").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
    expect(totalsText()).not.toContain("USDC");
    // The skeleton sketches one tile per coin beyond the headline.
    expect(screen.getAllByTestId("payouts-skeleton-tile")).toHaveLength(1);
  });

  it("reveals every coin together once all chains are read, each coin on its own, never summed", () => {
    const deployments = [USDC_ARB, USDC_BASE, EURC_ARC];
    render(
      <TotalsBillboard
        loading={false}
        deployments={deployments}
        results={{
          0: done(item(addr(1), 2_000_000, 1)),
          1: done(item(addr(2), 1_000_000, 2)),
          2: done(item(addr(3), 100_000, 3)),
        }}
      />
    );
    expect(screen.getByTestId("payouts-totals").getAttribute("aria-busy")).toBe("false");
    expect(screen.queryByText("Loading payout totals")).toBeNull();
    // USDC from two chains adds up (same coin); EURC is its own tile.
    expect(screen.getByTestId("payouts-headline").textContent).toBe("3 USDC");
    const tiles = screen.getAllByTestId("payouts-coin-tile");
    expect(tiles).toHaveLength(1);
    expect(tiles[0].textContent).toContain("0.1 EURC");
    expect(tiles[0].textContent).toContain("1 payout");
    expect(totalsText()).not.toMatch(/3\.1/);
    expect(screen.getByTestId("payouts-count").textContent).toBe("across 3 payouts on 3 chains");
  });

  it("after the wait, shows what is known and says it is still counting", () => {
    const deployments = [USDC_ARB, EURC_ARC];
    render(<TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 3_000_000, 1)) }} />);
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS);
    });
    expect(screen.getByTestId("payouts-headline").textContent).toBe("3 USDC");
    expect(screen.getByTestId("payouts-count").textContent).toContain("still counting…");
    // The EURC chain is still read: its tile stays sketched, so the board keeps its shape.
    expect(screen.getAllByTestId("payouts-skeleton-tile")).toHaveLength(1);
  });

  it("with nothing read yet the wait keeps the skeleton (never 0 USDC)", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB]} results={{}} />);
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS * 2);
    });
    expect(screen.getByTestId("payouts-skeleton-headline")).toBeTruthy();
    expect(totalsText()).not.toMatch(/0 USDC/);
  });

  it("an unread chain with no totals says the chains are busy, not 0", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB]} results={{ 0: { status: "error", error: "x" } }} />);
    expect(screen.getByTestId("payouts-unread")).toBeTruthy();
    expect(totalsText()).not.toMatch(/\b0 USDC/);
  });

  it("partial totals say they are partial", () => {
    render(
      <TotalsBillboard
        loading={false}
        deployments={[USDC_ARB, USDC_BASE]}
        results={{ 0: done(item(addr(1), 1_000_000, 1)), 1: { status: "error", error: "x" } }}
      />
    );
    expect(screen.getByTestId("payouts-partial")).toBeTruthy();
    expect(screen.getByTestId("payouts-headline").textContent).toBe("1 USDC");
  });

  it("last-known (updating) totals say so", () => {
    render(
      <TotalsBillboard
        loading={false}
        deployments={[USDC_ARB]}
        results={{ 0: { status: "done", items: [item(addr(1), 1_000_000, 1)], updating: { block: 9, time: 1 } } }}
      />
    );
    expect(screen.getByTestId("payouts-updating").textContent).toContain("one contract shows its last indexed payouts");
  });

  it("no payouts on any chain: first payouts land soon", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB]} results={{ 0: done() }} />);
    expect(totalsText()).toContain("First payouts land soon");
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
  });

  it("heroTotals orders coins biggest first and keeps them apart", () => {
    const h = heroTotals([EURC_ARC, USDC_ARB], { 0: done(item(addr(3), 5_000_000, 1)), 1: done(item(addr(1), 1_000_000, 2)) });
    expect(h.totals.map((t) => t.symbol)).toEqual(["EURC", "USDC"]);
    expect(h.payoutCount).toBe(2);
    expect(h.pending).toBe(false);
  });
});

describe("loading skeletons elsewhere on the page", () => {
  it("the chain card sketches its figure while reading", () => {
    render(<ChainCard deployment={USDC_ARB} result={{ status: "loading" }} balance={{ status: "loading" }} />);
    const loading = screen.getByTestId("chain-card-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toBe("Reading payouts…");
  });

  it("the feed shows skeleton rows while pending and the empty line after", () => {
    const { rerender } = render(<FeedSection feed={[]} pending shelterName={() => null} />);
    expect(screen.getByTestId("payouts-feed-loading").getAttribute("aria-busy")).toBe("true");
    rerender(<FeedSection feed={[]} pending={false} shelterName={() => null} />);
    expect(screen.queryByTestId("payouts-feed-loading")).toBeNull();
    expect(screen.getByText(/^No payouts yet/)).toBeTruthy();
  });
});
