/**
 * Track share code v1 (GDD 6.3). Pure, no DOM. Bit-packed with the copied bad-cat `bits.ts`, then CRC-16, then
 * base64url. A 24-point track with 12 stickers, both names, a parent key and a lap time stays at or under 140 chars.
 *
 * Layout (MSB first):
 *   version:4 (=1, or 2 for themes 4–6)  theme:2 (v2: 3)  timeOfDay:2  fiveLaps:1  pointCount-1:5
 *   per point: x:6 z:6 (4 m grid steps + 32, so -128..124 m)  h:3  w:2
 *   featureCount:5, per feature: s:8 kind:3 (FEATURE_KINDS index) side:2 (0 centre, 1 left, 2 right)
 *   props: 3 × 4 (0 = empty)
 *   nameLen:5 + 6 bits per char, creatorLen:4 + 6 bits per char (CHARSET)
 *   hasParent:1 [+ parent:32]   hasLap:1 [+ creator lap centiseconds:16]
 *   zero pad to a byte, CRC-16 (2 bytes)
 *
 * Names go through the copied text filter on encode AND decode, and the decoder runs the validator, so a
 * hand-made code can only open a drivable, filtered track.
 *
 * v2 (iteration 2, tracks lane) differs only in the theme field (3 bits, for the café, shelter and living-room themes);
 * a track on themes 0–3 still encodes as v1 byte for byte, and every v1 code decodes as before. The hazard and
 * shortcut stickers always fitted the 3-bit kind field; they now build a real hazard and branch.
 */
import { FEATURE_KINDS, type FeatureKind, type ThemeId, type TrackDef, type TrackFeature, type TrackPoint } from '../../types';
import { BitReader, BitWriter } from './bits';
import { checkCrc16, withCrc16 } from './crc16';
import { fromBase64url, toBase64url } from './base64url';
import { filterText } from './text-filter';
import { validateTrack } from '../editor/validate';
import type { DecodeResult, TrackCodec } from './track-codec';

export const TRACK_CODE_VERSION = 1;
/** v2: a 3-bit theme (4 café, 5 shelter, 6 living room); 7 is reserved and refused */
export const TRACK_CODE_VERSION_V2 = 2;
export const NAME_MAX = 16;
export const CREATOR_MAX = 10;
/** 64 symbols, 6 bits each. Accents are folded (ž → z); anything else is dropped. */
export const CHARSET = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
const CHAR_INDEX = new Map<string, number>([...CHARSET].map((c, i) => [c, i]));

/** Filter, fold to the 6-bit charset, filter again (folding can reveal a blocked word). */
export function cleanName(raw: unknown, max: number): string {
  const first = filterText(raw, max);
  if (!first) return '';
  let out = '';
  for (const ch of first.normalize('NFD').replace(/\p{M}+/gu, '')) if (CHAR_INDEX.has(ch)) out += ch;
  out = out.replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return filterText(out, max) === out ? out : '';
}

function writeName(w: BitWriter, s: string, lenBits: number): void {
  w.write(s.length, lenBits);
  for (const ch of s) w.write(CHAR_INDEX.get(ch) ?? 0, 6);
}

function readName(r: BitReader, lenBits: number, max: number): string | null {
  const len = r.read(lenBits);
  if (len > max) return null;
  let s = '';
  for (let i = 0; i < len; i++) s += CHARSET[r.read(6)];
  return s;
}

const sideBits = (side: TrackFeature['side']): number => (side === -1 ? 1 : side === 1 ? 2 : 0);

/** Encode without any check (the editor encodes drafts too); names are cleaned. */
export function encodeTrackBytes(def: TrackDef, opts: { creatorLapCs?: number; noLap?: boolean } = {}): Uint8Array {
  const w = new BitWriter();
  const v2 = def.theme > 3;
  w.write(v2 ? TRACK_CODE_VERSION_V2 : TRACK_CODE_VERSION, 4);
  w.write(v2 ? Math.min(6, def.theme) : def.theme & 3, v2 ? 3 : 2);
  w.write(Math.max(0, Math.min(2, def.timeOfDay)), 2);
  w.write(def.laps === 5 ? 1 : 0, 1);
  const pts = def.points.slice(0, 32);
  w.write(Math.max(0, pts.length - 1), 5);
  for (const p of pts) {
    w.write(Math.max(0, Math.min(63, Math.round(p.x / 4) + 32)), 6);
    w.write(Math.max(0, Math.min(63, Math.round(p.z / 4) + 32)), 6);
    w.write(Math.max(0, Math.min(7, p.h | 0)), 3);
    w.write(p.w & 3, 2);
  }
  const feats = def.features.slice(0, 31);
  w.write(feats.length, 5);
  for (const f of feats) {
    w.write(Math.max(0, Math.min(255, f.s | 0)), 8);
    w.write(Math.max(0, FEATURE_KINDS.indexOf(f.kind)), 3);
    w.write(sideBits(f.side), 2);
  }
  for (let i = 0; i < 3; i++) w.write((def.props?.[i] ?? 0) & 15, 4);
  writeName(w, cleanName(def.name, NAME_MAX), 5);
  writeName(w, cleanName(def.creator ?? '', CREATOR_MAX), 4);
  if (def.parent != null) {
    w.write(1, 1);
    w.write(def.parent >>> 0, 32);
  } else w.write(0, 1);
  const lap = opts.noLap ? undefined : opts.creatorLapCs;
  if (lap != null && lap > 0) {
    w.write(1, 1);
    w.write(Math.min(65535, Math.round(lap)), 16);
  } else w.write(0, 1);
  return withCrc16(w.bytes());
}

export function encodeTrack(def: TrackDef, opts: { creatorLapCs?: number } = {}): string {
  return toBase64url(encodeTrackBytes(def, opts));
}

/** FNV-1a 32 over bytes. */
export function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 32-bit track key (GDD 6.2 `parent`): the code without the lap time, so a new time keeps the identity. */
export function trackKey(def: TrackDef): number {
  return fnv1a(encodeTrackBytes(def, { noLap: true }));
}

export function ugcId(def: TrackDef): string {
  return 'u-' + trackKey(def).toString(36);
}

export interface DecodedTrack {
  track: TrackDef;
  creatorLapCs?: number;
}

export type DecodeDetail = { ok: true; track: TrackDef; creatorLapCs?: number } | { ok: false; reason: 'crc' | 'version' | 'invalid' };

/** Decode a share code. `validate: false` is for local drafts only (links always validate). */
export function decodeTrackCode(code: string, opts: { validate?: boolean } = {}): DecodeDetail {
  const raw = fromBase64url(code.trim());
  if (!raw) return { ok: false, reason: 'crc' };
  const body = checkCrc16(raw);
  if (!body) return { ok: false, reason: 'crc' };
  const r = new BitReader(body);
  let def: TrackDef;
  let lap: number | undefined;
  try {
    const version = r.read(4);
    if (version !== TRACK_CODE_VERSION && version !== TRACK_CODE_VERSION_V2) return { ok: false, reason: 'version' };
    const theme = r.read(version === TRACK_CODE_VERSION_V2 ? 3 : 2) as ThemeId;
    if (version === TRACK_CODE_VERSION_V2 && (theme < 4 || theme > 6)) return { ok: false, reason: 'invalid' };
    const tod = r.read(2);
    if (tod > 2) return { ok: false, reason: 'invalid' };
    const laps = r.read(1) ? 5 : 3;
    const np = r.read(5) + 1;
    const points: TrackPoint[] = [];
    for (let i = 0; i < np; i++) {
      const x = (r.read(6) - 32) * 4;
      const z = (r.read(6) - 32) * 4;
      const h = r.read(3);
      const w = r.read(2) as TrackPoint['w'];
      points.push({ x, z, h, w });
    }
    const nf = r.read(5);
    const features: TrackFeature[] = [];
    for (let i = 0; i < nf; i++) {
      const s = r.read(8);
      const kind: FeatureKind = FEATURE_KINDS[r.read(3)];
      const sb = r.read(2);
      if (sb === 3) return { ok: false, reason: 'invalid' };
      const f: TrackFeature = { s, kind };
      if (sb) f.side = sb === 1 ? -1 : 1;
      else if (kind === 'pad' || kind === 'ramp' || kind === 'offroad' || kind === 'shortcut' || kind === 'hazard') f.side = 0;
      features.push(f);
    }
    const props: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = r.read(4);
      if (p) props.push(p);
    }
    const name = readName(r, 5, NAME_MAX);
    const creator = readName(r, 4, CREATOR_MAX);
    if (name == null || creator == null) return { ok: false, reason: 'invalid' };
    const parent = r.read(1) ? r.read(32) : undefined;
    lap = r.read(1) ? r.read(16) : undefined;
    // canonical: only zero pad bits may follow
    if (r.remaining >= 8) return { ok: false, reason: 'invalid' };
    if (r.remaining > 0 && r.read(r.remaining) !== 0) return { ok: false, reason: 'invalid' };
    def = {
      v: 1,
      id: '',
      name: cleanName(name, NAME_MAX),
      theme,
      timeOfDay: tod as 0 | 1 | 2,
      laps,
      points,
      features,
    };
    const c = cleanName(creator, CREATOR_MAX);
    if (c) def.creator = c;
    if (parent != null) def.parent = parent;
    if (props.length) def.props = props;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (opts.validate !== false && !validateTrack(def).ok) return { ok: false, reason: 'invalid' };
  def.id = ugcId(def);
  return lap != null ? { ok: true, track: def, creatorLapCs: lap } : { ok: true, track: def };
}

/** The TrackCodec registered with the core (src/ugc/codec/track-codec.ts). */
export const trackCodecV1: TrackCodec = {
  encode: (def, opts) => encodeTrack(def, opts),
  decode: (code): DecodeResult => {
    const d = decodeTrackCode(code);
    return d.ok ? { ok: true, track: d.track } : d;
  },
};
