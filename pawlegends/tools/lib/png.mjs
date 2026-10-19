/**
 * A minimal PNG decoder (Node zlib, no dependencies) for tools/gen-cat-skins.mjs: 8-bit greyscale, RGB, palette
 * (1, 2, 4 or 8 bit, with tRNS), grey+alpha and RGBA, non-interlaced. Returns RGBA bytes.
 */
import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** @param {Uint8Array} buf @returns {{ width: number, height: number, data: Uint8Array }} */
export function decodePng(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8);
      height = dv.getUint32(p + 12);
      depth = body[8];
      ctype = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error(`colour type ${ctype} not supported`);
  if (ctype !== 3 && depth !== 8) throw new Error(`bit depth ${depth} not supported for colour type ${ctype}`);
  const raw = zlib.inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b))));
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const px = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (ctype === 3) {
        const per = 8 / depth;
        const idx = depth === 8 ? row[x] : (row[Math.floor(x / per)] >> ((per - 1 - (x % per)) * depth)) & ((1 << depth) - 1);
        out[o] = palette[idx * 3];
        out[o + 1] = palette[idx * 3 + 1];
        out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ctype === 0 || ctype === 4) {
        const g = row[x * channels];
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = ctype === 4 ? row[x * 2 + 1] : 255;
      } else {
        out[o] = row[x * channels];
        out[o + 1] = row[x * channels + 1];
        out[o + 2] = row[x * channels + 2];
        out[o + 3] = ctype === 6 ? row[x * 4 + 3] : 255;
      }
    }
  }
  return { width, height, data: out };
}

/** Encode RGBA as an 8-bit RGBA PNG (contact sheets). */
export function encodePng(width, height, data) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b) => {
    let c = -1;
    for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0);
    b.write(type, 4, 'ascii');
    Buffer.from(body).copy(b, 8);
    b.writeUInt32BE(crc(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
