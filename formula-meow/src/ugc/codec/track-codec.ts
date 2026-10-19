/**
 * Track share code contract (GDD 6.3, ugc lane). The ugc lane implements it with the copied bad-cat bits/crc16/
 * base64url codecs (≈128 chars for a 24-point track) and registers it with `setTrackCodec`. The core only needs
 * `decode` to race a UGC track; `encode` is for the editor's publish step. Pure, no DOM.
 */
import type { TrackDef } from '../../types';

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
