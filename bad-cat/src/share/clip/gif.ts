/**
 * Tiny GIF89a encoder for clip fallback 2 (GDD 7.3: the image card plus a 2 s animated GIF of the slow-motion
 * crash). Loaded lazily (dynamic import from share/index.ts only when no video encoder works).
 *
 * - Fixed 252-colour palette (6 red x 7 green x 6 blue levels, padded to 256) with a 4x4 ordered dither off by
 *   default (flat cartoon colours compress better undithered).
 * - Variable-length LZW (min code size 8, codes up to 12 bits, a clear code when the table is full).
 * - NETSCAPE2.0 loop extension, one Graphic Control Extension per frame (delay in 1/100 s).
 * - `encodeGifWithin` halves the frame rate, then scales down, until the file fits the byte budget (1.5 MB).
 */

export const GIF_MAX_BYTES = 1_500_000;
export const GIF_WIDTH = 360;
export const GIF_FPS = 15;

export interface GifFrame {
  width: number;
  height: number;
  /** RGBA, width * height * 4 bytes. */
  data: Uint8ClampedArray | Uint8Array;
}

const R_LEVELS = 6;
const G_LEVELS = 7;
const B_LEVELS = 6;

/** The 256-entry RGB palette (252 used). */
export function gifPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < R_LEVELS; r++)
    for (let g = 0; g < G_LEVELS; g++)
      for (let b = 0; b < B_LEVELS; b++) {
        p[i * 3] = Math.round((r * 255) / (R_LEVELS - 1));
        p[i * 3 + 1] = Math.round((g * 255) / (G_LEVELS - 1));
        p[i * 3 + 2] = Math.round((b * 255) / (B_LEVELS - 1));
        i++;
      }
  return p;
}

/** RGBA -> palette indices (nearest level per channel). */
export function quantize(f: GifFrame): Uint8Array {
  const n = f.width * f.height;
  const out = new Uint8Array(n);
  const d = f.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = Math.round((d[j] * (R_LEVELS - 1)) / 255);
    const g = Math.round((d[j + 1] * (G_LEVELS - 1)) / 255);
    const b = Math.round((d[j + 2] * (B_LEVELS - 1)) / 255);
    out[i] = (r * G_LEVELS + g) * B_LEVELS + b;
  }
  return out;
}

/** GIF LZW: the code stream for `indices` packed LSB-first into bytes (without the sub-block framing). */
export function lzwEncode(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  // dictionary: key = prefix code * 256 + byte -> code
  let dict = new Map<number, number>();
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  if (!indices.length) {
    emit(eoi);
    if (bits > 0) out.push(acc & 0xff);
    return Uint8Array.from(out);
  }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      // the decoder grows its code size one code later than the encoder adds it
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(acc & 0xff);
  return Uint8Array.from(out);
}

/** GIF LZW decoder (tests and self-checks). */
export function lzwDecode(data: Uint8Array, minCodeSize = 8, maxOut = 1 << 24): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clear; i++) table[i] = [i];
    table[clear] = [];
    table[eoi] = [];
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let pos = 0;
  let acc = 0;
  let bits = 0;
  let prev: number[] | null = null;
  while (out.length < maxOut) {
    while (bits < codeSize && pos < data.length) {
      acc |= data[pos++] << bits;
      bits += 8;
    }
    if (bits < codeSize) break;
    const code = acc & ((1 << codeSize) - 1);
    acc >>>= codeSize;
    bits -= codeSize;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < table.length && table[code]) entry = table[code];
    else if (prev) entry = [...prev, prev[0]];
    else break;
    for (const b of entry) out.push(b);
    if (prev && table.length < 4096) {
      table.push([...prev, entry[0]]);
      if (table.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return Uint8Array.from(out);
}

class ByteSink {
  private chunks: Uint8Array[] = [];
  private buf = new Uint8Array(1 << 16);
  private n = 0;
  size = 0;
  byte(b: number): void {
    if (this.n === this.buf.length) this.flush();
    this.buf[this.n++] = b & 0xff;
    this.size++;
  }
  u16(v: number): void {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }
  bytes(a: ArrayLike<number>): void {
    for (let i = 0; i < a.length; i++) this.byte(a[i]);
  }
  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  private flush(): void {
    this.chunks.push(this.buf.slice(0, this.n));
    this.n = 0;
  }
  done(): Uint8Array {
    this.flush();
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** Encode frames (all the same size) into an animated GIF89a. `delayCs` = per-frame delay in 1/100 s. */
export function encodeGif(frames: readonly GifFrame[], opts: { delayCs?: number; loop?: boolean } = {}): Uint8Array {
  if (!frames.length) throw new Error('gif: no frames');
  const { width, height } = frames[0];
  const s = new ByteSink();
  s.ascii('GIF89a');
  s.u16(width);
  s.u16(height);
  s.byte(0xf7); // global colour table, 8 bits colour resolution, 256 entries
  s.byte(0); // background colour index
  s.byte(0); // pixel aspect ratio
  s.bytes(gifPalette());
  if (opts.loop !== false) {
    s.bytes([0x21, 0xff, 0x0b]);
    s.ascii('NETSCAPE2.0');
    s.bytes([0x03, 0x01, 0x00, 0x00, 0x00]); // loop forever
  }
  const delay = Math.max(2, Math.round(opts.delayCs ?? 100 / GIF_FPS));
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('gif: frame size mismatch');
    s.bytes([0x21, 0xf9, 0x04, 0x04]); // GCE, disposal 1 (leave in place), no transparency
    s.u16(delay);
    s.bytes([0x00, 0x00]);
    s.byte(0x2c);
    s.u16(0);
    s.u16(0);
    s.u16(width);
    s.u16(height);
    s.byte(0); // no local table, not interlaced
    s.byte(8); // LZW minimum code size
    const lzw = lzwEncode(quantize(f), 8);
    for (let i = 0; i < lzw.length; i += 255) {
      const len = Math.min(255, lzw.length - i);
      s.byte(len);
      s.bytes(lzw.subarray(i, i + len));
    }
    s.byte(0); // block terminator
  }
  s.byte(0x3b); // trailer
  return s.done();
}

/** Nearest-neighbour downscale of an RGBA frame by `k` (0 < k <= 1). */
export function scaleFrame(f: GifFrame, k: number): GifFrame {
  if (k >= 1) return f;
  const w = Math.max(2, Math.round(f.width * k));
  const h = Math.max(2, Math.round(f.height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(f.height - 1, Math.floor((y * f.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(f.width - 1, Math.floor((x * f.width) / w));
      const si = (sy * f.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = f.data[si];
      out[di + 1] = f.data[si + 1];
      out[di + 2] = f.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Encode within `maxBytes`: full size first, then every other frame (double delay), then 0.75x / 0.5x scale.
 * Returns null when even the smallest variant is too large.
 */
export function encodeGifWithin(frames: readonly GifFrame[], maxBytes = GIF_MAX_BYTES, fps = GIF_FPS): Uint8Array | null {
  const delay = Math.round(100 / fps);
  const tries: { k: number; step: number }[] = [
    { k: 1, step: 1 },
    { k: 0.75, step: 1 },
    { k: 0.75, step: 2 },
    { k: 0.5, step: 2 },
  ];
  for (const t of tries) {
    const fs = frames.filter((_, i) => i % t.step === 0).map((f) => scaleFrame(f, t.k));
    const gif = encodeGif(fs, { delayCs: delay * t.step });
    if (gif.length <= maxBytes) return gif;
  }
  return null;
}
