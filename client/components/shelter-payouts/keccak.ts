// keccak256 (the Ethereum variant, padding 0x01) in plain TypeScript, so the wallet flow can compute
// the router's authNonce and EIP-55 checksums without a web3 dependency. Checked in
// __test__/shelter-router-calldata.test.ts against @noble/hashes and against `cast keccak`.
// 64-bit lanes are held as two 32-bit halves (lo, hi); no BigInt in the permutation.

const RC_LO = [
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001, 0x80008081, 0x00008009,
  0x0000008a, 0x00000088, 0x80008009, 0x8000000a, 0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
  0x00008002, 0x00000080, 0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
];
const RC_HI = [
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
];
// Rotation offsets r[x + 5y] and the pi lane order, as in the Keccak reference.
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

function keccakF(s: Uint32Array) {
  const bLo = new Uint32Array(25);
  const bHi = new Uint32Array(25);
  const cLo = new Uint32Array(5);
  const cHi = new Uint32Array(5);
  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) {
      cLo[x] = s[2 * x] ^ s[2 * (x + 5)] ^ s[2 * (x + 10)] ^ s[2 * (x + 15)] ^ s[2 * (x + 20)];
      cHi[x] = s[2 * x + 1] ^ s[2 * (x + 5) + 1] ^ s[2 * (x + 10) + 1] ^ s[2 * (x + 15) + 1] ^ s[2 * (x + 20) + 1];
    }
    for (let x = 0; x < 5; x++) {
      const nLo = cLo[(x + 1) % 5];
      const nHi = cHi[(x + 1) % 5];
      const dLo = cLo[(x + 4) % 5] ^ ((nLo << 1) | (nHi >>> 31));
      const dHi = cHi[(x + 4) % 5] ^ ((nHi << 1) | (nLo >>> 31));
      for (let y = 0; y < 25; y += 5) {
        s[2 * (x + y)] ^= dLo;
        s[2 * (x + y) + 1] ^= dHi;
      }
    }
    // rho and pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const i = x + 5 * y;
        const lo = s[2 * i];
        const hi = s[2 * i + 1];
        const r = ROT[i];
        let oLo: number;
        let oHi: number;
        if (r === 0) {
          oLo = lo;
          oHi = hi;
        } else if (r < 32) {
          oLo = (lo << r) | (hi >>> (32 - r));
          oHi = (hi << r) | (lo >>> (32 - r));
        } else if (r === 32) {
          oLo = hi;
          oHi = lo;
        } else {
          const k = r - 32;
          oLo = (hi << k) | (lo >>> (32 - k));
          oHi = (lo << k) | (hi >>> (32 - k));
        }
        const j = y + 5 * ((2 * x + 3 * y) % 5);
        bLo[j] = oLo;
        bHi[j] = oHi;
      }
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        s[2 * (x + y)] = bLo[x + y] ^ (~bLo[((x + 1) % 5) + y] & bLo[((x + 2) % 5) + y]);
        s[2 * (x + y) + 1] = bHi[x + y] ^ (~bHi[((x + 1) % 5) + y] & bHi[((x + 2) % 5) + y]);
      }
    }
    // iota
    s[0] ^= RC_LO[round];
    s[1] ^= RC_HI[round];
  }
}

const RATE = 136; // bytes, for a 256-bit output

export function keccak256Bytes(data: Uint8Array): Uint8Array {
  const s = new Uint32Array(50);
  const padded = new Uint8Array(Math.ceil((data.length + 1) / RATE) * RATE);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  for (let off = 0; off < padded.length; off += RATE) {
    for (let i = 0; i < RATE / 4; i++) {
      const p = off + i * 4;
      s[i] ^= padded[p] | (padded[p + 1] << 8) | (padded[p + 2] << 16) | (padded[p + 3] << 24);
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const w = s[i];
    out[i * 4] = w & 0xff;
    out[i * 4 + 1] = (w >>> 8) & 0xff;
    out[i * 4 + 2] = (w >>> 16) & 0xff;
    out[i * 4 + 3] = (w >>> 24) & 0xff;
  }
  return out;
}

export const bytesToHex = (b: Uint8Array) => {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
};

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 || /[^0-9a-fA-F]/.test(h)) throw new Error(`not hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** keccak256 of raw bytes or of a 0x-hex string's bytes, as 0x-hex. */
export const keccak256 = (data: Uint8Array | string) =>
  "0x" + bytesToHex(keccak256Bytes(typeof data === "string" ? hexToBytes(data) : data));

/** keccak256 of a UTF-8 string, as 0x-hex. */
export const keccakUtf8 = (text: string) => "0x" + bytesToHex(keccak256Bytes(new TextEncoder().encode(text)));

/** EIP-55 mixed-case checksum address. Throws on anything that is not a 20-byte hex address. */
export function toChecksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`not an address: ${address}`);
  const lower = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak256Bytes(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}
