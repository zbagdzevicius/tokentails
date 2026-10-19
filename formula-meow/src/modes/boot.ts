/**
 * Boot routing (modes lane). A plain visit gets the title screen; every deep link still goes straight to its race or
 * editor (GDD 1.1: a link opens onto the grid): dares (`#g=` / `?g=`), shared tracks (`?t=` / `#t=`), the Daily Cup
 * (`?daily=` / `/d/<n>`), the editor (`?make` / `/make`), and the QA parameters (`?track`, `?cls`, `?seed`).
 * `?bot`, `?speed`, `?lang`, `?perf` and `?quality` are not routes: they keep the title.
 */
import { parseRoute, type LocLike } from '../share/links/link';
import { readTrackCode, wantsEditor } from '../ugc/codec/link';

const ROUTE_PARAMS = ['track', 'cls', 'seed', 't', 'make', 'daily', 'g'];

export function isPlainVisit(loc: LocLike): boolean {
  const q = new URLSearchParams(loc.search);
  if (ROUTE_PARAMS.some((k) => q.has(k))) return false;
  if (/[#&](g|t|n|c)=/.test(loc.hash)) return false;
  if (parseRoute(loc).kind !== 'home') return false;
  if (readTrackCode(loc.search, loc.hash)) return false;
  if (wantsEditor(loc.search, loc.hash, loc.pathname)) return false;
  return true;
}
