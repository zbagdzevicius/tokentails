/** Aggregation of episode results per (level, persona). Pure. */
import type { EpisodeResult, Outcome } from './runner';
import type { PersonaId } from './personas';

export interface CellSummary {
  levelId: string;
  persona: PersonaId;
  runs: number;
  wins: number;
  /** Wins / runs (0-1). */
  completion: number;
  /** Over won runs (ticks); null without wins. */
  medianTicks: number | null;
  p90Ticks: number | null;
  parTicks: number;
  /** Spots per run over all runs. */
  spotsMean: number;
  spotsMedian: number;
  /** Share of runs (all) with zero spots. */
  spotFree: number;
  /** Mean stars per run (0-3), and share of runs earning each star. */
  starsMean: number;
  starWin: number;
  starCoins: number;
  starClean: number;
  threeStars: number;
  /** Mean share of coins collected (0-1). */
  coinShare: number;
  outcomes: Record<Outcome, number>;
  /** Attempts that were soft-locked (unwinnable without a restart), and runs that hit at least one. */
  softLocks: number;
  softLockedRuns: number;
  /** Mean retries per run. */
  retries: number;
  /** Median total play time of won runs including retried attempts. */
  medianSession: number | null;
  /** Spot heatmap: "x,y" -> count. */
  heat: Record<string, number>;
  /** Spots per guard id. */
  byGuard: Record<string, number>;
  /** Quit points: "x,y" -> count, and per stage. */
  quitTiles: Record<string, number>;
  quitStages: Record<string, number>;
  /** Most common last intent before quitting ("why") -> count. */
  quitWhy: Record<string, number>;
  /** Mean bot activity per run. */
  meows: number;
  lures: number;
  swaps: number;
  dashes: number;
}

/** Nearest-rank percentile of a sorted array (p in 0..1). */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[k];
}

export function median(sorted: readonly number[]): number {
  if (!sorted.length) return NaN;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function bump(m: Record<string, number>, k: string, by = 1): void {
  m[k] = (m[k] ?? 0) + by;
}

export function summarize(results: readonly EpisodeResult[]): CellSummary {
  if (!results.length) throw new Error('summarize: no results');
  const r0 = results[0];
  const n = results.length;
  const wins = results.filter((r) => r.won);
  const winTicks = wins.map((r) => r.ticks).sort((a, b) => a - b);
  const spots = results.map((r) => r.spotted).sort((a, b) => a - b);
  const outcomes: Record<Outcome, number> = { win: 0, 'quit-spots': 0, 'quit-stuck': 0, timeout: 0 };
  const heat: Record<string, number> = {};
  const byGuard: Record<string, number> = {};
  const quitTiles: Record<string, number> = {};
  const quitStages: Record<string, number> = {};
  const quitWhy: Record<string, number> = {};
  let stars = 0;
  let s1 = 0;
  let s2 = 0;
  let s4 = 0;
  let three = 0;
  let coinShare = 0;
  let meows = 0;
  let lures = 0;
  let swaps = 0;
  let dashes = 0;
  for (const r of results) {
    outcomes[r.outcome]++;
    for (const sp of r.spots) {
      bump(heat, `${sp.x},${sp.y}`);
      bump(byGuard, sp.guard);
    }
    if (r.quit) {
      bump(quitTiles, `${r.quit.x},${r.quit.y}`);
      bump(quitStages, r.quit.stage);
      bump(quitWhy, r.quit.why.replace(/ \(coin\)$/, '').replace(/^hold [^:]+$/, 'hold plate'));
    }
    const c = (r.stars & 1 ? 1 : 0) + (r.stars & 2 ? 1 : 0) + (r.stars & 4 ? 1 : 0);
    stars += c;
    if (r.stars & 1) s1++;
    if (r.stars & 2) s2++;
    if (r.stars & 4) s4++;
    if (c === 3) three++;
    coinShare += r.coinsTotal ? r.coins / r.coinsTotal : 1;
    meows += r.stats.meows;
    lures += r.stats.lures;
    swaps += r.stats.swaps;
    dashes += r.stats.dashes;
  }
  return {
    levelId: r0.levelId,
    persona: r0.persona,
    runs: n,
    wins: wins.length,
    completion: wins.length / n,
    medianTicks: winTicks.length ? median(winTicks) : null,
    p90Ticks: winTicks.length ? percentile(winTicks, 0.9) : null,
    parTicks: r0.parTicks,
    spotsMean: spots.reduce((a, b) => a + b, 0) / n,
    spotsMedian: median(spots),
    spotFree: results.filter((r) => r.spotted === 0).length / n,
    starsMean: stars / n,
    starWin: s1 / n,
    starCoins: s2 / n,
    starClean: s4 / n,
    threeStars: three / n,
    coinShare: coinShare / n,
    outcomes,
    softLocks: results.reduce((a, r) => a + r.softLocks, 0),
    softLockedRuns: results.filter((r) => r.softLocks > 0).length,
    retries: results.reduce((a, r) => a + r.retries, 0) / n,
    medianSession: wins.length ? median(wins.map((r) => r.sessionTicks).sort((a, b) => a - b)) : null,
    heat,
    byGuard,
    quitTiles,
    quitStages,
    quitWhy,
    meows: meows / n,
    lures: lures / n,
    swaps: swaps / n,
    dashes: dashes / n,
  };
}

/** Top-k entries of a count map, highest first (ties by key for stable output). */
export function topK(m: Record<string, number>, k: number): [string, number][] {
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k);
}
