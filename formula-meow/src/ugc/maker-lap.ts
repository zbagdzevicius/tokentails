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
/** a best lap is kept for this many track × class pairs (newest first) */
const MAX = 60;

/**
 * Laps are kept per track and class (`u-abc@1`): a lap at Alley Cat 100cc is no target for a Kitten 50cc race (the
 * playtest: a friend at 50cc got a 100cc lap to beat, "2.14 s faster", out of reach). `last` is the class this device
 * last raced each track at, so a share carries the lap that goes with it.
 */
type Laps = Record<string, number>;
type Blob = { laps: Laps; last?: Record<string, number> };

/** The link's lap: hundredths and the class it was driven at (null: a link from before the class rode along). */
export interface LapTarget {
  cs: number;
  cls: number | null;
}

function loadBlob(): { laps: Laps; last: Record<string, number> } {
  const v = load<Blob>(KEY, { laps: {} });
  const laps = v && typeof v.laps === 'object' && v.laps ? v.laps : {};
  const last = v && typeof v.last === 'object' && v.last ? v.last : {};
  return { laps, last };
}

const key = (id: string, cls: number) => `${id}@${cls | 0}`;

/** This device's best completed lap on track `id` at class `cls` (hundredths), or null. */
export function myLapCs(id: string, cls = 0): number | null {
  const v = loadBlob().laps[key(id, cls)];
  return typeof v === 'number' && v > 0 && Number.isFinite(v) ? v : null;
}

/** Keep `lapS` (seconds, a completed lap at class `cls`) as this device's best on `id` when it is better. True when it was. */
export function recordLap(id: string, lapS: number | null, cls = 0): boolean {
  if (!id.startsWith('u-') || lapS == null || !(lapS > 0) || !Number.isFinite(lapS)) return false;
  const cs = Math.round(lapS * 100);
  if (cs > 65535) return false;
  const { laps, last } = loadBlob();
  const k = key(id, cls);
  const old = laps[k];
  const better = !(typeof old === 'number' && old > 0 && old <= cs);
  const next: Laps = { [k]: better ? cs : old };
  for (const [kk, v] of Object.entries(laps)) if (kk !== k && Object.keys(next).length < MAX) next[kk] = v;
  const lastNext: Record<string, number> = { [id]: cls | 0 };
  for (const [kk, v] of Object.entries(last)) if (kk !== id && Object.keys(lastNext).length < MAX) lastNext[kk] = v;
  save(KEY, { laps: next, last: lastNext });
  return better;
}

/** The lap a track link carried (set when the link is opened), per track id, for this page only. */
const targets = new Map<string, LapTarget>();

export function setTarget(id: string, cs: number | undefined | null, cls: number | null = null): void {
  if (cs != null && cs > 0) targets.set(id, { cs, cls: cls != null && Number.isInteger(cls) && cls >= 0 ? cls : null });
}

/** The link's lap for a race on `id` at class `cls`: only when it was driven at that class, else null. */
export function targetCs(id: string, cls = 0): number | null {
  const tg = targets.get(id);
  return tg && tg.cls === cls ? tg.cs : null;
}

/** The class a link's lap was driven at (null: none, or unknown). */
export function targetClass(id: string): number | null {
  return targets.get(id)?.cls ?? null;
}

/** The lap a share of track `id` carries: this device's own best at the class it last raced, else the link's lap. */
export function shareLap(id: string): LapTarget | undefined {
  const cls = loadBlob().last[id];
  if (typeof cls === 'number') {
    const mine = myLapCs(id, cls);
    if (mine != null) return { cs: mine, cls };
  }
  const tg = targets.get(id);
  return tg && tg.cls != null ? tg : undefined;
}

/** Hundredths only (the track code's field). */
export function shareLapCs(id: string): number | undefined {
  return shareLap(id)?.cs;
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
