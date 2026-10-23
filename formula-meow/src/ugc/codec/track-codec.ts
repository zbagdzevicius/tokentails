/**
 * Track share code contract (GDD 6.3, ugc lane). The ugc lane implements it in `track-code.ts` with the copied
 * bad-cat bits/crc16/base64url codecs and registers it with `setTrackCodec` from `src/lanes.ts`. The core only
 * needs `decode` (through `trackFromLocation`) to race a UGC track; `encode` is for the editor's share step.
 * Pure, no DOM.
 */
import type { TrackDef } from '../../types';
import { readTrackCode } from './link';

export type DecodeResult = { ok: true; track: TrackDef } | { ok: false; reason: 'crc' | 'version' | 'invalid' };

export interface TrackCodec {
  encode(def: TrackDef, opts?: { creatorLapCs?: number }): string;
  decode(code: string): DecodeResult;
}

let codec: TrackCodec | null = null;

export function setTrackCodec(c: TrackCodec): void {
  codec = c;
}

/** The registered codec, or null until the ugc lane lands. */
export function trackCodec(): TrackCodec | null {
  return codec;
}

/**
 * The UGC track a page URL carries (`?t=CODE` or `#t=CODE`): null when there is none (or no codec yet), otherwise
 * the decode result, so the caller can say "This track link is broken" on a failure.
 */
export function trackFromLocation(loc: { search: string; hash: string }): DecodeResult | null {
  const code = readTrackCode(loc.search, loc.hash);
  if (!code || !codec) return null;
  return codec.decode(code);
}
