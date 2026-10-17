/**
 * @jest-environment jsdom
 */
import { Result, FeedSection } from "@/components/shelter-payouts/payoutSections";
import { arcFirst } from "@/components/shelter-payouts/chains";
import { ChainCard, PerChainCards } from "@/components/shelter-payouts/ShelterPayouts";
import { ShelterDeployment } from "@/components/shelter-payouts/rpc";
import { REVEAL_AFTER_MS, TotalsBillboard, arcShare, expectedTileCoins, headlineCoin, heroTotals } from "@/components/shelter-payouts/TotalsBillboard";
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

// Arc's USDC split: token payouts in 6 decimals, native USDC gifts in 18.
const USDC_ARC: ShelterDeployment = { chainId: 5042, address: addr(4), network: "mainnet" };

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
    expect(screen.getByTestId("payouts-count").textContent).toBe("across 1 payout on 2 chains");
    expect(screen.getByTestId("payouts-counting").textContent).toBe("still counting…");
    // The EURC chain is still read: its tile stays sketched, so the board keeps its shape.
    expect(screen.getAllByTestId("payouts-skeleton-tile")).toHaveLength(1);
  });

  it("the wait starts when the deployment list is in, not when the board mounts", () => {
    const deployments = [USDC_ARB, EURC_ARC];
    const { rerender } = render(<TotalsBillboard loading deployments={[]} results={{}} />);
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS * 2);
    });
    // The list arrives late and the first chain answers at once: still no pop-in.
    rerender(<TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 3_000_000, 1)) }} />);
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
    expect(screen.getByTestId("payouts-skeleton-headline")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS);
    });
    expect(screen.getByTestId("payouts-headline").textContent).toBe("3 USDC");
  });

  it("the skeleton turns into every figure at once, in the same board", () => {
    const deployments = [USDC_ARB, USDC_BASE, EURC_ARC];
    const { rerender } = render(<TotalsBillboard loading={false} deployments={deployments} results={{ 2: done(item(addr(3), 100_000, 3)) }} />);
    const board = screen.getByTestId("payouts-billboard");
    rerender(
      <TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 2_000_000, 1)), 2: done(item(addr(3), 100_000, 3)) }} />
    );
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
    expect(screen.queryByTestId("payouts-coin-tile")).toBeNull();
    rerender(
      <TotalsBillboard
        loading={false}
        deployments={deployments}
        results={{ 0: done(item(addr(1), 2_000_000, 1)), 1: done(item(addr(2), 1_000_000, 2)), 2: done(item(addr(3), 100_000, 3)) }}
      />
    );
    expect(screen.getByTestId("payouts-billboard")).toBe(board);
    expect(screen.getByTestId("payouts-headline").textContent).toBe("3 USDC");
    expect(screen.getAllByTestId("payouts-coin-tile")).toHaveLength(1);
    expect(screen.queryByTestId("payouts-skeleton-tile")).toBeNull();
    expect(screen.queryByTestId("payouts-counting")).toBeNull();
  });

  it("the headline coin is fixed up front: a bigger other coin read first never takes it", () => {
    const deployments = [USDC_ARB, USDC_BASE, EURC_ARC];
    const { rerender } = render(<TotalsBillboard loading={false} deployments={deployments} results={{ 2: done(item(addr(3), 9_000_000, 3)) }} />);
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS);
    });
    // Only EURC is known: the board waits for the headline coin instead of crowning EURC.
    expect(screen.queryByTestId("payouts-headline")).toBeNull();
    expect(totalsText()).not.toContain("EURC");
    rerender(<TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 1_000_000, 1)), 2: done(item(addr(3), 9_000_000, 3)) }} />);
    expect(screen.getByTestId("payouts-headline").textContent).toBe("1 USDC");
    expect(screen.getAllByTestId("payouts-coin-tile")[0].textContent).toContain("9 EURC");
    expect(screen.getByTestId("payouts-counting")).toBeTruthy();
  });

  it("headlineCoin picks the coin most contracts pay; the rest get one sketched tile each", () => {
    expect(headlineCoin([EURC_ARC, USDC_ARB, USDC_BASE])).toBe("USDC");
    expect(headlineCoin([EURC_ARC, USDC_ARB])).toBe("USDC");
    expect(headlineCoin([])).toBeNull();
    expect(expectedTileCoins([EURC_ARC, USDC_ARB, USDC_BASE])).toEqual(["EURC"]);
  });

  it("with only other coins paid, the biggest takes the headline once every chain is read", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB, EURC_ARC]} results={{ 0: done(), 1: done(item(addr(3), 2_000_000, 1)) }} />);
    expect(screen.getByTestId("payouts-headline").textContent).toBe("2 EURC");
  });

  it("with no contracts listed the board says first payouts land soon", () => {
    render(<TotalsBillboard loading={false} deployments={[]} results={{}} />);
    expect(screen.getByTestId("payouts-totals").getAttribute("aria-busy")).toBe("false");
    expect(totalsText()).toContain("First payouts land soon");
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

describe("the Arc share on the billboard", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const native = (contract: string, wei: bigint, tx: number) => ({ ...item(contract, 0, tx), kind: "native" as const, amount: wei });
  // Arbitrum 3 USDC, Arc 1 USDC (token) + 0.5 USDC (native, 18 decimals), Arc 0.1 EURC.
  const deployments = [USDC_ARB, USDC_ARC, EURC_ARC];
  const allRead = (): Record<number, Result> => ({
    0: done(item(addr(1), 3_000_000, 1)),
    1: { status: "done", items: [item(addr(4), 1_000_000, 2), native(addr(4), BigInt("500000000000000000"), 3)] },
    2: done(item(addr(3), 100_000, 4)),
  });

  it("heroTotals sums only the Arc deployments, per coin, never mixed", () => {
    const h = heroTotals(deployments, allRead());
    expect(h.totals.find((t) => t.symbol === "USDC")?.amount).toBe(BigInt("4500000000000000000"));
    expect(h.arc).toEqual([
      { symbol: "USDC", amount: BigInt("1500000000000000000"), count: 2 },
      { symbol: "EURC", amount: BigInt("100000000000000000"), count: 1 },
    ]);
    expect(h.arcPending).toBe(false);
  });

  it("shows Arc's part of the headline coin, its payouts and its share bar", () => {
    render(<TotalsBillboard loading={false} deployments={deployments} results={allRead()} />);
    expect(screen.getByTestId("payouts-headline").textContent).toBe("4.5 USDC");
    const line = screen.getByTestId("payouts-arc-line").textContent;
    expect(line).toContain("1.5 USDC of it paid on Arc");
    expect(line).toContain("2 payouts");
    // 1.5 of 4.5 USDC: 33.3% (the EURC is never part of the share).
    expect(screen.getByTestId("payouts-arc-fill").getAttribute("style")).toContain("width: 33.3%");
    expect(screen.getByTestId("payouts-arc-bar").getAttribute("aria-label")).toBe("Arc paid 33.3% of the USDC total");
    // EURC is paid only on Arc: its tile says so, without adding coins together.
    const tile = screen.getAllByTestId("payouts-coin-tile")[0];
    expect(tile.textContent).toContain("0.1 EURC");
    expect(screen.getByTestId("payouts-tile-arc").textContent).toBe("on Arc");
    expect(totalsText()).not.toMatch(/1\.6|4\.6/);
  });

  it("a coin paid on Arc and elsewhere gets Arc's amount on its tile", () => {
    // A EURC contract off Arc as well: the EURC tile names Arc's part of that coin only.
    const EURC_BASE: ShelterDeployment = { chainId: 8453, address: addr(5), network: "mainnet", symbol: "EURC", decimals: 6 };
    const list = [USDC_ARB, USDC_BASE, EURC_ARC, EURC_BASE];
    const results = {
      0: done(item(addr(1), 1_000_000, 1)),
      1: done(),
      2: done(item(addr(3), 200_000, 2)),
      3: done(item(addr(5), 100_000, 3)),
    };
    expect(heroTotals(list, results).arc).toEqual([{ symbol: "EURC", amount: BigInt("200000000000000000"), count: 1 }]);
    render(<TotalsBillboard loading={false} deployments={list} results={results} />);
    expect(screen.getAllByTestId("payouts-coin-tile")[0].textContent).toContain("0.3 EURC");
    expect(screen.getByTestId("payouts-tile-arc").textContent).toBe("0.2 EURC on Arc");
    // No USDC on Arc here: no Arc line under the headline.
    expect(screen.queryByTestId("payouts-arc")).toBeNull();
  });

  it("Arc read but none of the headline coin paid there: no line, never 0", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB, USDC_ARC]} results={{ 0: done(item(addr(1), 1_000_000, 1)), 1: done() }} />);
    // Arc read but paid none of the headline coin: no line, never "0 USDC of it".
    expect(screen.queryByTestId("payouts-arc")).toBeNull();
    expect(totalsText()).not.toContain("on Arc");
  });

  it("hidden, not 0, when an Arc deployment could not be read", () => {
    const results = allRead();
    results[2] = { status: "error", error: "x" };
    expect(heroTotals(deployments, results).arc).toBeNull();
    render(<TotalsBillboard loading={false} deployments={deployments} results={results} />);
    expect(screen.getByTestId("payouts-headline")).toBeTruthy();
    expect(screen.queryByTestId("payouts-arc")).toBeNull();
    expect(screen.queryByTestId("payouts-arc-skeleton")).toBeNull();
    expect(totalsText()).not.toContain("on Arc");
  });

  it("reserves Arc's slot in the skeleton and keeps it sketched while Arc is still read", () => {
    const { rerender } = render(<TotalsBillboard loading deployments={[]} results={{}} />);
    expect(screen.getByTestId("payouts-arc-skeleton")).toBeTruthy();
    rerender(<TotalsBillboard loading={false} deployments={deployments} results={{ 0: done(item(addr(1), 3_000_000, 1)) }} />);
    expect(screen.getByTestId("payouts-arc-skeleton")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(REVEAL_AFTER_MS);
    });
    // The headline shows after the wait; Arc's figure waits in its sketched slot, never a partial 0.
    expect(screen.getByTestId("payouts-headline").textContent).toBe("3 USDC");
    expect(heroTotals(deployments, { 0: done(item(addr(1), 3_000_000, 1)) }).arcPending).toBe(true);
    expect(screen.getByTestId("payouts-arc-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("payouts-arc")).toBeNull();
    rerender(<TotalsBillboard loading={false} deployments={deployments} results={allRead()} />);
    expect(screen.queryByTestId("payouts-arc-skeleton")).toBeNull();
    expect(screen.getByTestId("payouts-arc-line")).toBeTruthy();
  });

  it("no Arc slot when no Arc contract is listed", () => {
    render(<TotalsBillboard loading={false} deployments={[USDC_ARB]} results={{}} />);
    expect(screen.queryByTestId("payouts-arc-skeleton")).toBeNull();
  });

  it("arcShare is Arc's part of one coin, rounded down to one decimal", () => {
    expect(arcShare(BigInt(1), BigInt(3))).toBe(33.3);
    expect(arcShare(BigInt(2), BigInt(3))).toBe(66.6);
    expect(arcShare(BigInt(5), BigInt(5))).toBe(100);
    expect(arcShare(BigInt(0), BigInt(5))).toBe(0);
    expect(arcShare(BigInt(1), BigInt(0))).toBe(0);
  });
});

describe("per chain grid", () => {
  it("lists Arc's cards first, marked as the main chain; the rest keep their order", () => {
    const list = [USDC_ARB, USDC_BASE, USDC_ARC, EURC_ARC];
    expect(arcFirst(list)).toEqual([2, 3, 0, 1]);
    // Arc testnet is not the mainnet main chain.
    expect(arcFirst([USDC_ARB, { chainId: 5042002, address: addr(9) }])).toEqual([0, 1]);
    render(<PerChainCards deployments={list} results={{}} balances={{}} />);
    const cards = screen.getAllByTestId("chain-card");
    expect(cards.map((c) => !!c.querySelector('[data-testid="chain-card-main"]'))).toEqual([true, true, false, false]);
    expect(cards[0].textContent).toContain("Arc · main chain");
    expect(cards[2].textContent).toContain("Arbitrum");
    expect(cards[3].textContent).toContain("Base");
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
