/**
 * UGC actions shared by the hub (main bundle) and the Track Doodle editor (lazy chunk): share a track link,
 * remix a track, label a track. Copy is plain and honest: no counts, no claims.
 */
import type { TrackDef } from '../types';
import { encodeTrack, trackKey, ugcId } from './codec/track-code';
import { shareLap } from './maker-lap';
import { trackLink } from './codec/link';
import { loadCreator } from './store';
import { ugcPieces } from './editor/pieces';

/** The track's link; it carries this device's best lap on it (or the lap the link came with), F10 "Beat the maker". */
export function linkFor(def: TrackDef): string {
  const lap = shareLap(ugcId(def));
  return trackLink(encodeTrack(def, { creatorLapCs: lap?.cs }), location, lap?.cls ?? undefined);
}

/** Native share sheet when there is one, else the clipboard. Resolves to a short status line for the UI. */
export async function shareTrack(def: TrackDef): Promise<string> {
  const url = linkFor(def);
  const title = def.name || 'My Formula Meow track';
  const text = `Race my track "${title}" in Formula Meow 🏁🐱`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ url }))) {
    try {
      await nav.share({ title, text, url });
      return 'Shared!';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'Link copied!';
  } catch {
    return url;
  }
}

/**
 * A copy of `def` ready to edit as a remix: the parent key points at the original (GDD 6.4 Remix). Set pieces the
 * doodle rules would refuse (an authored track places them closer together) are dropped, so a remix opens drivable.
 */
export function remixOf(def: TrackDef): TrackDef {
  // only what a track code carries: an authored track's branches, hazards, coins, flyover, music and arena kind do not
  // survive the share / race round trip, so the editor must not show (or validate pieces against) them either
  const src: TrackDef = JSON.parse(JSON.stringify(def)) as TrackDef;
  const copy: TrackDef = { v: 1, id: src.id, name: src.name, theme: src.theme, timeOfDay: src.timeOfDay, laps: src.laps, points: src.points, features: src.features };
  if (src.props) copy.props = src.props;
  if (src.setPieces) copy.setPieces = src.setPieces;
  copy.parent = trackKey(def);
  copy.id = 'draft';
  const pieces = ugcPieces(copy);
  if (pieces) copy.setPieces = pieces;
  else delete copy.setPieces;
  const me = loadCreator();
  if (me) copy.creator = me;
  else delete copy.creator;
  return copy;
}

export function byline(def: TrackDef): string {
  return def.creator ? `by ${def.creator}` : 'by a fellow racer';
}

export function displayName(def: TrackDef): string {
  return def.name || 'Untitled Track';
}
