/**
 * UGC actions shared by the hub (main bundle) and the Track Doodle editor (lazy chunk): share a track link,
 * remix a track, label a track. Copy is plain and honest: no counts, no claims.
 */
import type { TrackDef } from '../types';
import { encodeTrack, trackKey } from './codec/track-code';
import { trackLink } from './codec/link';
import { loadCreator } from './store';

export function linkFor(def: TrackDef): string {
  return trackLink(encodeTrack(def), location);
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

/** A copy of `def` ready to edit as a remix: the parent key points at the original (GDD 6.4 Remix). */
export function remixOf(def: TrackDef): TrackDef {
  const copy: TrackDef = JSON.parse(JSON.stringify(def)) as TrackDef;
  copy.parent = trackKey(def);
  copy.id = 'draft';
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
