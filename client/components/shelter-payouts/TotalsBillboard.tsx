import { useEffect, useState } from "react";
import { Result, chainCount, stillReading, totalsBySymbol, twoDp, updatingCount } from "./payoutSections";
import { ShelterDeployment, resolveChain } from "./rpc";
import { FIGURE, Skeleton } from "./ui";

/*
 * The hero's payout totals as one board: the biggest coin total as the headline figure, every other
 * coin as an equal tile under it, and the payout and chain count at the foot. While the chains are
 * read the board keeps its final shape with skeleton blocks, so the figures land together instead
 * of popping in one coin at a time, and nothing below it jumps.
 */

/** How long the board waits for slow chains before it shows what is known ("still counting…"). */
export const REVEAL_AFTER_MS = 7000;
/** Tiles to sketch before the deployment list has loaded. */
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
}

/** The hero figures from the per-deployment reads: per coin, never mixed. */
export function heroTotals(deployments: ShelterDeployment[], results: Record<number, Result>): HeroTotals {
  const bySymbol: Record<string, CoinTotal> = {};
  deployments.forEach((d, i) => {
    const r = results[i];
    if (r?.status !== "done") return;
    for (const t of totalsBySymbol(r.items, resolveChain(d))) {
      const acc = bySymbol[t.symbol] || { symbol: t.symbol, amount: BigInt(0), count: 0 };
      acc.amount += t.amount;
      acc.count += t.count;
      bySymbol[t.symbol] = acc;
    }
  });
  const totals = Object.values(bySymbol).sort((a, b) =>
    a.amount === b.amount ? a.symbol.localeCompare(b.symbol) : a.amount > b.amount ? -1 : 1
  );
  return {
    totals,
    payoutCount: totals.reduce((n, t) => n + t.count, 0),
    pending: stillReading(deployments, results),
    unread: deployments.some((_, i) => results[i]?.status === "error"),
    updating: updatingCount(deployments, results),
    chains: chainCount(deployments),
    contracts: deployments.length,
  };
}

/** The coins the listed contracts pay: the tiles the skeleton sketches (the headline takes one). */
export function expectedCoins(deployments: ShelterDeployment[]): number {
  return new Set(deployments.map((d) => resolveChain(d)?.symbol || "USDC")).size;
}

/** False until `ms` have passed since the board mounted. */
function useElapsed(ms: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return elapsed;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The board frame: the landing's cream frame on deep night, a faint LED dot grid and a gold glow.
const BOARD =
  "relative w-full max-w-4xl overflow-hidden rounded-[28px] border-4 border-tt-cream/80 bg-tt-night-900/85 px-4 py-5 md:px-8 md:py-8 shadow-[0_0_0_4px_rgb(var(--tt-night-950)),0_0_42px_rgb(var(--tt-gold-400)/.22)]";
const LEDS =
  "pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(rgb(var(--tt-gold-400)/.28)_1px,transparent_1.6px)] bg-[length:9px_9px]";
const TILE =
  "flex min-h-[6.25rem] min-w-[8.5rem] max-w-[14rem] flex-1 basis-[8.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-tt-cream/45 bg-black/45 px-3 py-3";
// The headline figure's line, reserved in both states so the swap does not move the page.
const HEAD_LINE = "min-h-[56px] md:min-h-[96px] lg:min-h-[128px]";
const HEAD_SIZE = "text-[56px] md:text-[96px] lg:text-[128px]";
const LABEL = "font-primary text-p6 md:text-p5 uppercase tracking-[0.2em] text-tt-cream/80";

// claim: L-disbursed (the board sums the ShelterSplit payout events read from each chain)
const BoardLabel = () => (
  <p className={`${LABEL} flex items-center justify-center gap-2`}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-tt-gold-400 shadow-[0_0_8px_#ffcf66]" />
    Sent to shelters
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-tt-gold-400 shadow-[0_0_8px_#ffcf66]" />
  </p>
);

const Divider = () => <div aria-hidden="true" className="my-4 border-t-2 border-dashed border-tt-cream/20 md:my-6" />;

const TileSkeleton = () => (
  <div className={TILE} data-testid="payouts-skeleton-tile" aria-hidden="true">
    <Skeleton className="h-7 w-20 md:h-8 md:w-24" />
    <Skeleton className="h-3 w-14" />
  </div>
);

/** The board's final shape in skeleton blocks. */
const BoardSkeleton = ({ tiles }: { tiles: number }) => (
  <>
    <span className="sr-only">Loading payout totals</span>
    <div className={`${HEAD_LINE} flex items-center justify-center`}>
      <Skeleton testId="payouts-skeleton-headline" className="h-[56px] w-[min(100%,18rem)] rounded-xl md:h-[96px] md:w-[30rem] lg:h-[128px] lg:w-[40rem]" />
    </div>
    <div className="mt-3 flex justify-center">
      <Skeleton className="h-4 w-36 md:h-5 md:w-48" />
    </div>
    {tiles > 0 && (
      <>
        <Divider />
        <div className="flex flex-wrap justify-center gap-3">
          {Array.from({ length: tiles }, (_, k) => (
            <TileSkeleton key={k} />
          ))}
        </div>
      </>
    )}
  </>
);

const CoinTile = ({ t }: { t: CoinTotal }) => (
  <div className={TILE} data-testid="payouts-coin-tile">
    <p className={`${FIGURE} text-h6 md:text-h5`}>
      {twoDp(t.amount)} <span className="text-p5 md:text-p4 normal-case">{t.symbol}</span>
    </p>
    <p className="font-primary text-p6 uppercase tracking-wide text-tt-cream/70">{plural(t.count, "payout")}</p>
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
  const timedOut = useElapsed(revealAfterMs);
  const h = heroTotals(deployments, results);
  const [head, ...rest] = h.totals;
  // Figures land together: the skeleton stays until every chain answered, or until the wait is up
  // and something is known (slow chains then show "still counting…").
  const skeleton = loading || (h.pending && (!timedOut || h.totals.length === 0));
  const tiles = loading ? DEFAULT_SKELETON_TILES : Math.max(0, expectedCoins(deployments) - 1);
  // Shown after the wait while slow chains are still read: their coins keep a sketched tile.
  const waiting = !skeleton && h.pending && head ? Math.max(0, tiles - rest.length) : 0;

  return (
    <div
      className="flex w-full flex-col items-center gap-3"
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
              <BoardSkeleton tiles={tiles} />
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
                    <p className={`${LABEL} mt-3`}>
                      {head.symbol} · {plural(head.count, "payout")}
                    </p>
                  </>
                ) : (
                  <div className={`${HEAD_LINE} flex items-center justify-center`}>
                    {/* Never "0 USDC": a chain that could not be read is not a chain with no payouts. */}
                    {h.unread ? (
                      <p className="max-w-xl text-p4 md:text-p3 text-tt-cream/90" data-testid="payouts-unread">
                        The chains are busy right now. Reload in a minute to see the live total.
                      </p>
                    ) : (
                      <p className={`${FIGURE} text-h4 md:text-h2`}>First payouts land soon</p>
                    )}
                  </div>
                )}
                {rest.length + waiting > 0 && (
                  <>
                    <Divider />
                    <div className="flex flex-wrap justify-center gap-3" data-testid="payouts-coin-tiles">
                      {rest.map((t) => (
                        <CoinTile key={t.symbol} t={t} />
                      ))}
                      {/* Coins of chains still being read keep their sketched tile until they land. */}
                      {Array.from({ length: waiting }, (_, k) => (
                        <TileSkeleton key={`waiting-${k}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {/* The foot line: its height is kept while loading so the reveal does not move the page. */}
          <div className="mt-4 flex min-h-6 items-center justify-center md:mt-6 md:min-h-8">
            {skeleton ? (
              <Skeleton className="h-4 w-56 md:h-6 md:w-80" />
            ) : head ? (
              <p className="font-primary text-p5 md:text-p3 uppercase tracking-wide text-tt-cream" data-testid="payouts-count">
                across {plural(h.payoutCount, "payout")} on {plural(h.chains, "chain")}
                {h.chains !== h.contracts ? ` (${h.contracts} contracts)` : ""}
                {h.pending ? " · still counting…" : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Partial figures must say they are partial: a chain that could not be read is missing. */}
      {!skeleton && head && !h.pending && h.unread && (
        <p className="max-w-xl text-p5 md:text-p4 text-tt-cream/90" data-testid="payouts-partial">
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
  );
};
