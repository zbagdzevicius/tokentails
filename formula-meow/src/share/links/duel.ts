/**
 * Ghost duels (iteration 4, F9). Pure sim helpers, no DOM, so they are unit tested:
 *
 * - `shadowConfig`: the race a ghost was recorded in (its own field: eight karts for a lap race, the player alone for a
 *   time trial). The ghost replays exactly only inside that race, so the shadow world is always this one, whatever the
 *   player races against (the duel's visible race has one kart; "Race the pack" has the default field).
 * - `traceGhost`: the shadow race run ahead once, in chunks (never one long frame), logging the ghost's race distance
 *   every tick and its recomputed finish (a ghost never carries a time of its own). The dare card shows the time; the
 *   live gap pill reads the log.
 * - `duelGap`: "how many seconds ago was the ghost where I am now" (an F1-style time gap from the ghost's lap + s
 *   progress), + = the ghost is ahead.
 */
import { DEFAULT_CAT, SIM_VERSION, unpackInput, type CatSpec, type RaceConfig, type TickInput, type TrackDef } from '../../types';
import { SimWorld } from '../../core/sim/world';
import { buildField, createSimPlugins, kartLookFor } from '../../items-ai';
import type { BuiltTrack } from '../../core/track/build';
import type { Ghost, GhostHeader } from '../codec/ghost-codec';

/** The race the ghost was recorded in. */
export function shadowConfig(g: GhostHeader, track: TrackDef, name: string, cat: CatSpec | null): RaceConfig {
  const slot = g.slot;
  const look = { ...kartLookFor(0), body: g.body ?? 0 };
  const field = buildField({ seed: g.seed, cls: g.cls, playerSlot: slot, playerName: name, playerCat: cat ?? DEFAULT_CAT, playerKart: look });
  // a time trial races alone (modes/tt: the player at slot 0, no AI, no boxes), and so does a duel run (`solo`)
  const alone = g.mode === 'tt' || !!g.solo;
  const racers = alone ? [field[slot] ?? field[0]] : field.map((r, i) => (i === g.rival && i !== slot ? { ...r, rival: true } : r));
  return {
    track,
    seed: g.seed,
    cls: g.cls,
    modifiers: g.modifiers,
    racers,
    humans: [alone ? 0 : slot],
    forgiving: g.forgiving,
    mode: g.mode ?? 'race',
  };
}

/** A duel can only be run against a ghost of this build (older ones open as a target-time race, unchanged). */
export function duelable(g: Pick<GhostHeader, 'simVersion' | 'mode'>): boolean {
  return g.simVersion === SIM_VERSION && (g.mode == null || g.mode === 'race' || g.mode === 'dare' || g.mode === 'daily' || g.mode === 'tt');
}

export interface GhostTrace {
  /** recomputed finish, seconds since GO (null: the ghost never finished) */
  finish: number | null;
  /** the ghost's race distance (m) at each tick, kept non-decreasing (a respawn never makes the ghost "behind" itself) */
  dist: Float32Array;
  /** ticks logged */
  ticks: number;
  /** GO tick of the shadow race */
  go: number;
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Run the ghost's race to its end and log its progress. `chunk` ticks between yields (async: the card stays live while
 * it runs); `cancel.cancelled` stops it (null).
 */
export async function traceGhost(g: Ghost, track: TrackDef, opts: { built?: BuiltTrack; chunk?: number; cancel?: { cancelled: boolean } } = {}): Promise<GhostTrace | null> {
  const cfg = shadowConfig(g, track, 'ghost', null);
  const w = new SimWorld(cfg, createSimPlugins(cfg), opts.built);
  const me = cfg.humans[0];
  const n = g.inputs.length;
  const dist = new Float32Array(n + 1);
  const buf: TickInput[] = [];
  let hi = -Infinity;
  const chunk = opts.chunk ?? 900;
  let finish: number | null = null;
  const log = () => {
    const d = w.st.karts[me].dist;
    if (d > hi) hi = d;
    dist[w.tick] = hi;
  };
  log();
  while (w.tick < n && !w.done) {
    for (let c = 0; c < chunk && w.tick < n && !w.done; c++) {
      buf[0] = unpackInput(g.inputs[w.tick]);
      w.step(buf);
      log();
      const k = w.st.karts[me];
      if (k.finished && finish == null) finish = k.finishTime / 60;
    }
    if (finish != null) break;
    if (opts.cancel?.cancelled) return null;
    if (w.tick < n && opts.chunk !== Infinity) await yieldFrame();
  }
  const k = w.st.karts[me];
  if (finish == null && k.finished) finish = k.finishTime / 60;
  const go = w.st.events.find((e) => e.type === 'go')?.tick ?? 0;
  return { finish, dist, ticks: w.tick, go };
}

/**
 * Seconds the player is behind the ghost (+) or ahead of it (−) at race tick `tick`, with the player at race
 * distance `myDist`: the tick the ghost first reached `myDist`, compared with now. Null before GO, or when the ghost
 * never got that far before its log ended (it finished or stopped: then the gap is not a time any more).
 */
export function duelGap(tr: Pick<GhostTrace, 'dist' | 'ticks' | 'go'>, tick: number, myDist: number): number | null {
  if (tick <= tr.go) return null;
  const last = Math.min(tr.ticks, tr.dist.length - 1);
  if (last < 1) return null;
  if (tr.dist[last] < myDist) {
    // past the ghost's last logged point: ahead by at least the time since then (it finished earlier only if ahead)
    return tick <= last ? -(last - tick) / 60 : null;
  }
  // first tick with dist >= myDist (dist is non-decreasing)
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tr.dist[mid] >= myDist) hi = mid;
    else lo = mid + 1;
  }
  // sub-tick: interpolate inside the tick that crossed myDist
  let at = lo;
  if (lo > 0) {
    const a = tr.dist[lo - 1];
    const b = tr.dist[lo];
    if (b > a) at = lo - 1 + (myDist - a) / (b - a);
  }
  return (tick - at) / 60;
}

/** The pill's text: "+0.42" (behind, red) or "−0.18" (ahead, green), one place for the sign. */
export function gapText(gap: number): { text: string; ahead: boolean } {
  const ahead = gap < 0;
  const v = Math.abs(gap);
  return { text: `${ahead ? '−' : '+'}${v.toFixed(2)}`, ahead };
}
