// copy-lint: web-only rendered only inside WebShelterPayouts (the isAppBuild gate in ShelterPayouts)
import { ReactNode, useEffect, useState } from "react";
import { Result, chainCount, stillReading, totalsBySymbol, twoDp, updatingCount } from "./payoutSections";
import { isArcMainnet } from "./chains";
import { ShelterDeployment, resolveChain } from "./rpc";
import { FIGURE, Skeleton } from "./ui";

/*
 * The hero's payout totals as one board: the main coin's total as the headline figure, every other
 * coin as an equal tile under it, and the payout and chain count at the foot. While the chains are
 * read the board keeps its final shape with skeleton blocks, so the figures land together instead
 * of popping in one coin at a time, and nothing below it jumps. Arc, the main chain, gets its own
 * line under the headline (its part of that coin and a bar of its share) and a mark on each tile of a
 * coin it paid, always per coin.
 */

/** How long the board waits for slow chains, once the deployment list is in, before it shows what is known. */
export const REVEAL_AFTER_MS = 7000;
/** Tiles to sketch before the deployment list has loaded (the 7 mainnets pay 4 coins: USDC + 3). */
const DEFAULT_SKELETON_TILES = 3;

export interface CoinTotal {
  symbol: string;
  /** 18-decimal units, summed within this one symbol only. */
  amount: bigint;
  count: number;
}

export interface HeroTotals {
  /** One entry per coin, biggest first. Different coins are never added together. */
  totals: CoinTotal[];
  payoutCount: number;
  /** A deployment is still being read. */
  pending: boolean;
  /** A deployment could not be read: its payouts are missing from the totals. */
  unread: boolean;
  /** Deployments shown from the index's last-known payouts while their chain is busy. */
  updating: number;
  chains: number;
  contracts: number;
  /**
   * Arc's part of each coin, from the Arc mainnet deployments only (never mixed across coins). Null
   * when Arc is not listed, still being read, or could not be read: then no Arc figure is shown.
   */
  arc: CoinTotal[] | null;
  /** An Arc deployment is still being read. */
  arcPending: boolean;
}

/** Sums the read deployments at `indices` per coin: different coins are never added together. */
function sumByCoin(deployments: ShelterDeployment[], results: Record<number, Result>, indices: number[]): CoinTotal[] {
  const bySymbol: Record<string, CoinTotal> = {};
  for (const i of indices) {
    const r = results[i];
    if (r?.status !== "done") continue;
    for (const t of totalsBySymbol(r.items, resolveChain(deployments[i]))) {
      const acc = bySymbol[t.symbol] || {
        symbol: t.symbol,
        amount: BigInt(0),
        count: 0,
      };
      acc.amount += t.amount;
      acc.count += t.count;
      bySymbol[t.symbol] = acc;
    }
  }
  return Object.values(bySymbol);
}

/** The hero figures from the per-deployment reads: per coin, never mixed. */
export function heroTotals(deployments: ShelterDeployment[], results: Record<number, Result>): HeroTotals {
  const totals = sumByCoin(
    deployments,
    results,
    deployments.map((_, i) => i)
  ).sort((a, b) => (a.amount === b.amount ? a.symbol.localeCompare(b.symbol) : a.amount > b.amount ? -1 : 1));
  return {
    totals,
    payoutCount: totals.reduce((n, t) => n + t.count, 0),
    pending: stillReading(deployments, results),
    unread: deployments.some((_, i) => results[i]?.status === "error"),
    updating: updatingCount(deployments, results),
    chains: chainCount(deployments),
    contracts: deployments.length,
    ...arcPart(deployments, results),
  };
}

/** Arc's figures: shown only once every Arc deployment is read; an unread one hides them (never 0). */
function arcPart(
  deployments: ShelterDeployment[],
  results: Record<number, Result>
): Pick<HeroTotals, "arc" | "arcPending"> {
  const arcIdx = deployments.map((_, i) => i).filter((i) => isArcMainnet(deployments[i].chainId));
  if (arcIdx.length === 0 || arcIdx.some((i) => results[i]?.status === "error"))
    return { arc: null, arcPending: false };
  if (arcIdx.some((i) => results[i]?.status !== "done")) return { arc: null, arcPending: true };
  return { arc: sumByCoin(deployments, results, arcIdx), arcPending: false };
}

/** Arc's share of a coin's total, in percent with one decimal, rounded down (0 to 100). */
export function arcShare(arcAmount: bigint, total: bigint): number {
  if (total <= BigInt(0) || arcAmount <= BigInt(0)) return 0;
  if (arcAmount >= total) return 100;
  return Number((arcAmount * BigInt(1000)) / total) / 10;
}

/** The payout token a deployment pays (native gifts of a chain are rare and not predicted). */
const tokenOf = (d: ShelterDeployment) => resolveChain(d)?.symbol || "USDC";

/**
 * The headline coin, fixed from the deployment list before any chain answers, so the headline never
 * switches coin while slow chains land: the coin most listed contracts pay (USDC on a tie).
 */
export function headlineCoin(deployments: ShelterDeployment[]): string | null {
  const n: Record<string, number> = {};
  for (const d of deployments) n[tokenOf(d)] = (n[tokenOf(d)] || 0) + 1;
  const ranked = Object.keys(n).sort((a, b) =>
    n[b] !== n[a] ? n[b] - n[a] : a === "USDC" ? -1 : b === "USDC" ? 1 : a.localeCompare(b)
  );
  return ranked[0] ?? null;
}

/** The other coins the listed contracts pay: one sketched tile each. */
export function expectedTileCoins(deployments: ShelterDeployment[], head = headlineCoin(deployments)): string[] {
  return Array.from(new Set(deployments.map(tokenOf))).filter((s) => s !== head);
}

/** False until `ms` have passed while `active` (the wait starts when the deployment list is in). */
function useElapsed(ms: number, active: boolean) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [ms, active]);
  return elapsed;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The board frame: the landing's cream frame on deep night, a faint LED dot grid and a gold glow.
const BOARD =
  "relative w-full max-w-4xl overflow-hidden rounded-[28px] border-4 border-tt-cream/80 bg-tt-night-900/85 px-4 py-5 md:px-8 md:py-8 shadow-[0_0_0_4px_rgb(var(--tt-night-950)),0_0_42px_rgb(var(--tt-gold-400)/.22)]";
const LEDS =
  "pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(rgb(var(--tt-gold-400)/.28)_1px,transparent_1.6px)] bg-[length:9px_9px]";
// Two equal columns on phones (an odd last tile spans both), a centred wrapping row from md up.
const TILES =
  "grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 md:flex md:flex-wrap md:justify-center";
const TILE =
  "flex min-h-[6.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-tt-cream/45 bg-black/45 px-3 py-3 md:min-w-[8.5rem] md:max-w-[14rem] md:flex-1 md:basis-[8.5rem]";
// The headline figure's line, reserved in both states so the swap does not move the page.
const HEAD_LINE = "min-h-[56px] md:min-h-[96px] lg:min-h-[128px]";
const HEAD_SIZE = "text-[56px] md:text-[96px] lg:text-[128px]";
const LABEL = "font-primary text-p6 md:text-p5 uppercase tracking-[0.2em] text-tt-cream/80";
// The count line, one line in both states.
const COUNT_LINE = "min-h-[1.375rem] md:min-h-[2.0625rem]";
// Arc's line under the headline (the Arc pill and its share bar), reserved while Arc is read.
const ARC_SLOT = "mt-3 flex min-h-[4.5rem] flex-col items-center justify-start gap-2 md:mt-4 md:min-h-[4rem]";
// Arc's accent: the sky ink, like the rave's "paid on Arc" line (cat-rave/src/arc/arc.css).
const ARC_PILL =
  "inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border-2 border-tt-sky/70 bg-tt-sky/10 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-sky shadow-[0_0_16px_rgb(var(--tt-sky)/.3)]";
const ARC_MARK =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-tt-sky/60 bg-tt-sky/10 px-2 py-0.5 font-primary text-p6 uppercase tracking-wide text-tt-sky break-words";
// The status slot under the count: "still counting…" while chains are read, then the updating or
// partial note. Kept at the note's height while reading, so neither moves the page when it lands.
const STATUS_SLOT = "min-h-12 md:min-h-11";

// claim: L-disbursed (the board sums the ShelterSplit payout events read from each chain)
const BoardLabel = () => (
  <p className={`${LABEL} flex items-center justify-center gap-2`}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-tt-gold-400 shadow-[0_0_8px_#ffcf66]" />
    Sent to shelters
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-tt-gold-400 shadow-[0_0_8px_#ffcf66]" />
  </p>
);

/** Arc's mark: a small sky diamond. */
const ArcDiamond = () => (
  <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45 bg-tt-sky shadow-[0_0_6px_rgb(var(--tt-sky))]" />
);

/** Arc's slot in skeleton blocks: the pill and the bar. */
const ArcSkeleton = ({ ghost = false }: { ghost?: boolean }) => (
  <div className={ARC_SLOT} aria-hidden="true" data-testid={ghost ? undefined : "payouts-arc-skeleton"}>
    <Skeleton className="h-7 w-[min(100%,17rem)] rounded-full md:h-8 md:w-80" />
    <Skeleton className="h-2 w-[min(100%,20rem)] rounded-full md:w-96" />
  </div>
);

/**
 * How much of the headline coin Arc paid, and a bar of Arc's share of that coin's total. The bar stays
 * sketched while other chains are read (`partial`), so the share does not shrink in front of the reader.
 */
const ArcLine = ({ arc, total, partial }: { arc: CoinTotal; total: CoinTotal; partial: boolean }) => {
  const share = arcShare(arc.amount, total.amount);
  return (
    <div className={ARC_SLOT} data-testid="payouts-arc">
      <p className={ARC_PILL} data-testid="payouts-arc-line">
        <ArcDiamond />
        <span>
          {twoDp(arc.amount)} <span className="normal-case">{arc.symbol}</span> of it paid on Arc
        </span>
        <span aria-hidden="true">·</span>
        <span>{plural(arc.count, "payout")}</span>
      </p>
      {partial ? (
        <Skeleton testId="payouts-arc-bar-skeleton" className="h-2 w-[min(100%,20rem)] rounded-full md:w-96" />
      ) : (
        <div className="flex w-full max-w-xs items-center gap-2 md:max-w-sm">
          <div
            role="img"
            aria-label={`Arc paid ${share}% of the ${total.symbol} total`}
            className="h-2 flex-1 overflow-hidden rounded-full bg-tt-cream/15"
            data-testid="payouts-arc-bar"
          >
            <div
              className="h-full rounded-full bg-tt-sky shadow-[0_0_8px_rgb(var(--tt-sky))]"
              style={{ width: `${share}%` }}
              data-testid="payouts-arc-fill"
            />
          </div>
          <span aria-hidden="true" className="font-primary text-p6 md:text-p5 text-tt-sky">
            {share}%
          </span>
        </div>
      )}
    </div>
  );
};

const Divider = () => <div aria-hidden="true" className="my-4 border-t-2 border-dashed border-tt-cream/20 md:my-6" />;

/** An empty Arc mark's row (one line, no words): tiles without a mark keep it, so no tile grows when a mark lands. */
const ArcMarkSpace = () => (
  <p aria-hidden="true" className={`${ARC_MARK} invisible`} data-testid="payouts-tile-arc-space">
    {"\u00a0"}
  </p>
);

// A tile's two text lines, shared by the tile and its sketch so both have the same line heights.
const TILE_FIGURE = `${FIGURE} text-h6 md:text-h5`;
const TILE_COUNT = "font-primary text-p6 uppercase tracking-wide text-tt-cream/70";

/** A skeleton block on a text line of `line`'s type, so the sketch is exactly as tall as the text. */
const SketchLine = ({ line, block }: { line: string; block: string }) => (
  <p className={`${line} grid place-items-center`}>
    <span className="invisible [grid-area:1/1]">{"\u00a0"}</span>
    <Skeleton className={`[grid-area:1/1] ${block}`} />
  </p>
);

const TileSkeleton = ({ ghost = false, markRow = false }: { ghost?: boolean; markRow?: boolean }) => (
  <div className={TILE} data-testid={ghost ? undefined : "payouts-skeleton-tile"} aria-hidden="true">
    <SketchLine line={TILE_FIGURE} block="h-7 w-20 md:h-8 md:w-24" />
    <SketchLine line={TILE_COUNT} block="h-3 w-14" />
    {markRow && <ArcMarkSpace />}
  </div>
);

/** The board's final shape in skeleton blocks. A `ghost` copy only holds the space (invisible, no labels). */
const BoardSkeleton = ({
  tiles,
  arc,
  markRow,
  ghost = false,
}: {
  tiles: number;
  arc: boolean;
  markRow: boolean;
  ghost?: boolean;
}) => (
  <>
    {!ghost && <span className="sr-only">Loading payout totals</span>}
    <div className={`${HEAD_LINE} flex items-center justify-center`}>
      <Skeleton
        testId={ghost ? undefined : "payouts-skeleton-headline"}
        className="h-[56px] w-[min(100%,18rem)] rounded-xl md:h-[96px] md:w-[22rem] lg:h-[128px] lg:w-[26rem]"
      />
    </div>
    <div className="mt-3 flex justify-center">
      <Skeleton className="h-4 w-28 md:h-[1.375rem] md:w-36" />
    </div>
    {arc && <ArcSkeleton ghost={ghost} />}
    {tiles > 0 && (
      <>
        <Divider />
        <div className={TILES}>
          {Array.from({ length: tiles }, (_, k) => (
            <TileSkeleton key={k} ghost={ghost} markRow={markRow} />
          ))}
        </div>
      </>
    )}
  </>
);

/** A message in the headline's place, at the skeleton's height so the board does not collapse. */
const BoardMessage = ({
  tiles,
  arc,
  markRow,
  children,
}: {
  tiles: number;
  arc: boolean;
  markRow: boolean;
  children: ReactNode;
}) => (
  <div className="grid">
    <div aria-hidden="true" className="invisible [grid-area:1/1]">
      <BoardSkeleton tiles={tiles} arc={arc} markRow={markRow} ghost />
    </div>
    <div className="flex items-center justify-center [grid-area:1/1]">{children}</div>
  </div>
);

/**
 * One coin. `arc` is that same coin's Arc part: "on Arc" when Arc paid all of it, else its amount.
 * `markRow` keeps the mark's row in a tile without a mark, so every tile matches the sketched ones.
 */
const CoinTile = ({ t, arc, markRow }: { t: CoinTotal; arc?: CoinTotal; markRow: boolean }) => (
  <div className={TILE} data-testid="payouts-coin-tile">
    <p className={TILE_FIGURE}>
      {twoDp(t.amount)} <span className="text-p5 md:text-p4 normal-case">{t.symbol}</span>
    </p>
    <p className={TILE_COUNT}>{plural(t.count, "payout")}</p>
    {arc && arc.amount > BigInt(0) && (
      <p className={ARC_MARK} data-testid="payouts-tile-arc">
        <ArcDiamond />
        {arc.amount >= t.amount ? (
          "on Arc"
        ) : (
          <span>
            {twoDp(arc.amount)} <span className="normal-case">{arc.symbol}</span> on Arc
          </span>
        )}
      </p>
    )}
    {markRow && !(arc && arc.amount > BigInt(0)) && <ArcMarkSpace />}
  </div>
);

/**
 * The hero board. `loading` is the deployment list still loading; with it done, `deployments` and
 * `results` are the mainnet reads. Keeps data-testid="payouts-totals" and every honesty line.
 */
export const TotalsBillboard = ({
  loading,
  deployments,
  results,
  revealAfterMs = REVEAL_AFTER_MS,
}: {
  loading: boolean;
  deployments: ShelterDeployment[];
  results: Record<number, Result>;
  revealAfterMs?: number;
}) => {
  const timedOut = useElapsed(revealAfterMs, !loading);
  const h = heroTotals(deployments, results);
  const headSymbol = headlineCoin(deployments);
  const expected = loading ? [] : expectedTileCoins(deployments, headSymbol);
  const tiles = loading ? DEFAULT_SKELETON_TILES : expected.length;
  // The headline coin is fixed up front; only with every chain read and none of it paid does the
  // biggest other coin take the headline (nothing can change after that).
  const head = h.totals.find((t) => t.symbol === headSymbol) || (h.pending ? undefined : h.totals[0]);
  const rest = h.totals.filter((t) => t !== head);
  // Figures land together: the skeleton stays until every chain answered, or until the wait is up
  // and the headline coin is known (slow chains then show "still counting…").
  const skeleton = loading || (h.pending && (!timedOut || !head));
  // After the wait, coins of chains still being read keep a sketched tile until they land.
  const known = new Set(h.totals.map((t) => t.symbol));
  const waiting =
    !skeleton && h.pending
      ? new Set(
          deployments
            .filter((_, i) => results[i]?.status !== "done" && results[i]?.status !== "error")
            .map(tokenOf)
            .filter((s) => s !== head?.symbol && !known.has(s))
        ).size
      : 0;
  // While reading, the status slot keeps its height for the note that may follow; a board with only
  // a message keeps it too, so it stays the skeleton's size.
  const reserveStatus = loading || h.pending || !head;
  // Arc's line: its slot is sketched while Arc may be listed, then its part of the headline coin.
  // Hidden (never 0) when Arc paid none of it or could not be read.
  const arcListed = loading || deployments.some((d) => isArcMainnet(d.chainId));
  // A tile coin that Arc pays may get an Arc mark: then every tile, sketched or not, keeps that row.
  const markRow = loading || deployments.some((d) => isArcMainnet(d.chainId) && tokenOf(d) !== headSymbol);
  const arcHead = head ? h.arc?.find((t) => t.symbol === head.symbol && t.amount > BigInt(0)) : undefined;
  const note = !skeleton && head && !h.pending && (h.unread || h.updating > 0);

  return (
    <div
      className="flex w-full flex-col items-center"
      data-testid="payouts-totals"
      aria-live="polite"
      aria-busy={skeleton}
    >
      <div className={BOARD} data-testid="payouts-billboard">
        <div aria-hidden="true" className={LEDS} />
        <div className="relative">
          <BoardLabel />
          <div className="mt-3 md:mt-4">
            {skeleton ? (
              <BoardSkeleton tiles={tiles} arc={arcListed} markRow={markRow} />
            ) : (
              <div className="motion-safe:animate-tt-reveal">
                {head ? (
                  <>
                    <p
                      className={`${FIGURE} ${HEAD_SIZE} ${HEAD_LINE} flex flex-wrap items-baseline justify-center gap-x-3`}
                      data-testid="payouts-headline"
                    >
                      {twoDp(head.amount)} <span className="text-h5 md:text-h3 normal-case">{head.symbol}</span>
                    </p>
                    <p className={`${LABEL} mt-3`}>{plural(head.count, "payout")}</p>
                    {arcHead ? (
                      <ArcLine arc={arcHead} total={head} partial={h.pending} />
                    ) : h.arcPending ? (
                      <ArcSkeleton />
                    ) : null}
                    {rest.length + waiting > 0 && (
                      <>
                        <Divider />
                        <div className={TILES} data-testid="payouts-coin-tiles">
                          {rest.map((t) => (
                            <CoinTile
                              key={t.symbol}
                              t={t}
                              arc={h.arc?.find((a) => a.symbol === t.symbol)}
                              markRow={markRow}
                            />
                          ))}
                          {Array.from({ length: waiting }, (_, k) => (
                            <TileSkeleton key={`waiting-${k}`} markRow={markRow} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <BoardMessage tiles={tiles} arc={arcListed} markRow={markRow}>
                    {/* Never "0 USDC": a chain that could not be read is not a chain with no payouts. */}
                    {h.unread ? (
                      <p className="max-w-xl text-p4 md:text-p3 text-tt-cream/90" data-testid="payouts-unread">
                        The chains are busy right now. Reload in a minute to see the live total.
                      </p>
                    ) : (
                      <p className={`${FIGURE} text-h4 md:text-h2`}>First payouts land soon</p>
                    )}
                  </BoardMessage>
                )}
              </div>
            )}
          </div>
          {/* The foot: the count line, then the status slot. Both keep their height while reading. */}
          <div className={`mt-4 flex items-center justify-center md:mt-6 ${COUNT_LINE}`}>
            {skeleton ? (
              <Skeleton className="h-4 w-56 md:h-6 md:w-80" />
            ) : head ? (
              <p
                className="font-primary text-p5 md:text-p3 uppercase tracking-wide text-tt-cream"
                data-testid="payouts-count"
              >
                across {plural(h.payoutCount, "payout")} on {plural(h.chains, "chain")}
                {h.chains !== h.contracts ? ` (${h.contracts} contracts)` : ""}
              </p>
            ) : null}
          </div>
          <div
            className={`flex items-start justify-center ${reserveStatus ? `mt-2 ${STATUS_SLOT}` : note ? "mt-2" : ""}`}
          >
            {!skeleton && head && h.pending && (
              <p
                className="font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-gold-400"
                data-testid="payouts-counting"
              >
                still counting…
              </p>
            )}
            {/* Partial figures must say they are partial: a chain that could not be read is missing. */}
            {!skeleton && head && !h.pending && h.unread && (
              <p className="max-w-xl text-p6 md:text-p5 text-tt-cream/90" data-testid="payouts-partial">
                Some chains could not be read right now, so these totals may be incomplete. Reload in a minute.
              </p>
            )}
            {/* Last-known figures are counted, and said to be last-known (the card names the time). */}
            {!skeleton && head && !h.pending && !h.unread && h.updating > 0 && (
              <p className="max-w-xl text-p6 md:text-p5 text-tt-cream/70" data-testid="payouts-updating">
                Updating:{" "}
                {h.updating === 1
                  ? "one contract shows its last indexed payouts while its chain is busy, so the newest may be missing. Reload in a minute."
                  : `${h.updating} contracts show their last indexed payouts while their chains are busy, so the newest may be missing. Reload in a minute.`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
