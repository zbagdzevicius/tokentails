/**
 * Beat the maker (iteration 4, F10). A track link can carry a lap time (track code `creatorLapCs`, hundredths): the
 * best lap the sender drove on that track, on their device. Opening the link shows "Sender's lap 0:24.31 · beat it",
 * a live lap delta and, on the results, how it went. Racing a doodle (the test drive from the editor included) keeps
 * the best completed lap on this device, and sharing the track carries it (re-sharing a friend's track carries your
 * own lap once you have one).
 *
 * Honest by construction: a lap is only ever a completed lap the sim timed (`RaceResult.player.bestLap`), and the copy
 * says "sender", never claiming who made it.
 */
import { load, save } from '../core/app/storage';
import { t } from '../ui/i18n';

const KEY = 'ugc-laps';
/** a best lap is kept for this many tracks (newest first) */
const MAX = 60;

type Laps = Record<string, number>;

function loadLaps(): Laps {
  const v = load<{ laps: Laps }>(KEY, { laps: {} });
  return v && typeof v.laps === 'object' && v.laps ? v.laps : {};
}

/** This device's best completed lap on track `id` (hundredths), or null. */
export function myLapCs(id: string): number | null {
  const v = loadLaps()[id];
  return typeof v === 'number' && v > 0 && Number.isFinite(v) ? v : null;
}

/** Keep `lapS` (seconds, a completed lap) as this device's best on `id` when it is better. True when it was. */
export function recordLap(id: string, lapS: number | null): boolean {
  if (!id.startsWith('u-') || lapS == null || !(lapS > 0) || !Number.isFinite(lapS)) return false;
  const cs = Math.round(lapS * 100);
  if (cs > 65535) return false;
  const laps = loadLaps();
  const old = laps[id];
  if (typeof old === 'number' && old > 0 && old <= cs) return false;
  const next: Laps = { [id]: cs };
  for (const [k, v] of Object.entries(laps)) if (k !== id && Object.keys(next).length < MAX) next[k] = v;
  save(KEY, { laps: next });
  return true;
}

/** The lap a track link carried (set when the link is opened), per track id, for this page only. */
const targets = new Map<string, number>();

export function setTarget(id: string, cs: number | undefined | null): void {
  if (cs != null && cs > 0) targets.set(id, cs);
}

export function targetCs(id: string): number | null {
  return targets.get(id) ?? null;
}

/** The lap a share of track `id` carries: this device's own best, else the lap the link came with. */
export function shareLapCs(id: string): number | undefined {
  return myLapCs(id) ?? targetCs(id) ?? undefined;
}

/** "0:24.31" from hundredths. */
export function fmtLap(cs: number): string {
  const m = Math.floor(cs / 6000);
  const s = (cs % 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** The results line for a lap against the link's lap (both measured: the sim's best completed lap and the code's). */
export function makerLine(targetCsV: number, bestLapS: number | null): string | null {
  if (bestLapS == null || !(bestLapS > 0)) return null;
  const d = bestLapS - targetCsV / 100;
  if (d < 0) return t("⏱ You beat the sender's lap by {s} s!", { s: (-d).toFixed(2) });
  if (d === 0) return t("⏱ You matched the sender's lap: {t}", { t: fmtLap(targetCsV) });
  return t("⏱ The sender's lap is {s} s faster. Again?", { s: d.toFixed(2) });
}

/** Live lap delta (s): the lap so far against the target lap scaled to how far round the lap the kart is. */
export function liveLapDelta(targetCsV: number, lapElapsedS: number, lapFrac: number): number | null {
  if (!(lapFrac > 0.08) || lapFrac > 1.02 || !(lapElapsedS > 0)) return null;
  return lapElapsedS - (targetCsV / 100) * lapFrac;
}

/** The banner line for a link's lap ("⏱ Sender's lap 0:24.31 · beat it"). */
export function makerTargetLine(cs: number): string {
  return t("⏱ Sender's lap {t} · beat it", { t: fmtLap(cs) });
}
