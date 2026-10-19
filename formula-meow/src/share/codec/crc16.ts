// Copied from bad-cat/src/codec/crc16.ts at 4889ed41 (copy, never import; import paths adapted for formula-meow).
/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) for link payloads, and CRC-32 (IEEE) for UGC room ids. */

export function crc16(bytes: Uint8Array, len = bytes.length): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

let CRC32_TABLE: Uint32Array | null = null;
function crc32Table(): Uint32Array {
  if (CRC32_TABLE) return CRC32_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (CRC32_TABLE = t);
}

export function crc32(bytes: Uint8Array): number {
  const t = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Append a big-endian CRC-16 of `payload`. */
export function withCrc16(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 2);
  out.set(payload);
  const c = crc16(payload);
  out[payload.length] = c >> 8;
  out[payload.length + 1] = c & 0xff;
  return out;
}

/** Strip and check a trailing CRC-16; null if it does not match. */
export function checkCrc16(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 3) return null;
  const n = bytes.length - 2;
  const c = crc16(bytes, n);
  if (bytes[n] !== c >> 8 || bytes[n + 1] !== (c & 0xff)) return null;
  return bytes.subarray(0, n);
}
