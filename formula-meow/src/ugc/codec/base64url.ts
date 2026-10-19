// Copied from bad-cat/src/codec/base64url.ts at 735cbeec (copy, never import).
/** base64url without padding (RFC 4648 section 5). Decoding is strict: unknown characters or non-zero pad bits fail. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Int8Array = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

export function toBase64url(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    n += 8;
    while (n >= 6) {
      n -= 6;
      out += ALPHABET[(acc >> n) & 63];
    }
    acc &= (1 << n) - 1;
  }
  if (n > 0) out += ALPHABET[(acc << (6 - n)) & 63];
  return out;
}

/** null on a bad character, an impossible length or non-zero trailing pad bits. */
export function fromBase64url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let acc = 0;
  let n = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? LOOKUP[c] : -1;
    if (v < 0) return null;
    acc = (acc << 6) | v;
    n += 6;
    if (n >= 8) {
      n -= 8;
      out[o++] = (acc >> n) & 0xff;
    }
    acc &= (1 << n) - 1;
  }
  if (acc !== 0) return null; // canonical encodings only
  return out;
}
