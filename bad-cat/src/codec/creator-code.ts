/**
 * Creator codes (GDD 6.6 `via`, 9.2) and the payload hash (GDD 6.7 "Hide and report", `ugc_reported`).
 */
import { crc32 } from './crc16';
import { isBlocked } from './text-filter';

const CREATOR_RE = /^[a-z0-9_]{6,12}$/;

/** Normalised creator code (trimmed, lower case, 6-12 chars [a-z0-9_], not on the block list), else null. */
export function creatorCode(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const c = raw.trim().toLowerCase();
  if (!CREATOR_RE.test(c)) return null;
  if (isBlocked(c) || isBlocked(c.replace(/_/g, ' '))) return null;
  return c;
}

/** Short stable hash of a link payload: CRC-32 (IEEE) of its UTF-8 bytes, base36, left-padded to 8 chars. */
export function payloadHash(payload: string): string {
  const s = typeof payload === 'string' ? payload : '';
  return crc32(new TextEncoder().encode(s)).toString(36).padStart(8, '0');
}
