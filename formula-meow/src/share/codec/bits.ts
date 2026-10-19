// Copied from bad-cat/src/codec/bits.ts at 4889ed41 (copy, never import; import paths adapted for formula-meow).
/** MSB-first bit packing for the link codecs (GDD 6.6). Values are unsigned, at most 32 bits per call. */

export class BitWriter {
  private buf: number[] = [];
  private acc = 0; // pending bits (< 8)
  private n = 0; // number of pending bits

  /** Append the low `bits` bits of `value` (0 <= bits <= 32). */
  write(value: number, bits: number): this {
    if (bits < 0 || bits > 32) throw new RangeError(`bits out of range: ${bits}`);
    for (let i = bits - 1; i >= 0; i--) {
      const bit = i >= 31 ? (value >>> 31) & 1 : (value >>> i) & 1;
      this.acc = (this.acc << 1) | bit;
      this.n++;
      if (this.n === 8) {
        this.buf.push(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
    return this;
  }

  /** Total bits written. */
  get length(): number {
    return this.buf.length * 8 + this.n;
  }

  /** Bytes with the last partial byte zero-padded. */
  bytes(): Uint8Array {
    const out = new Uint8Array(this.buf.length + (this.n > 0 ? 1 : 0));
    out.set(this.buf);
    if (this.n > 0) out[this.buf.length] = (this.acc << (8 - this.n)) & 0xff;
    return out;
  }
}

export class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}

  /** Bits left to read. */
  get remaining(): number {
    return this.bytes.length * 8 - this.pos;
  }

  /** Read `bits` bits as an unsigned number; throws RangeError past the end. */
  read(bits: number): number {
    if (bits < 0 || bits > 32) throw new RangeError(`bits out of range: ${bits}`);
    if (bits > this.remaining) throw new RangeError('read past end');
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.bytes[this.pos >> 3];
      const bit = (byte >> (7 - (this.pos & 7))) & 1;
      v = v * 2 + bit; // multiply keeps 32-bit values unsigned
      this.pos++;
    }
    return v;
  }
}
