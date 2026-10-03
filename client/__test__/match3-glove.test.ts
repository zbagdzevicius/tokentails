/**
 * The Paw Match glove pointer (plan G14): the PNG in `public/match3/pointer/` is exported from the
 * pixel matrix in `components/Match3/glove.ts` and must match it. Run with `UPDATE_GLOVE=1` to
 * write the PNG after editing the matrix.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { GLOVE_MATRIX, GLOVE_PALETTE, GLOVE_TEXTURE_URL, glovePixels } from "@/components/Match3/glove";
import { GLOVE_SIZE, GLOVE_TIP } from "@/components/Match3/tutorial";

const PNG_PATH = path.join(__dirname, "..", "public", GLOVE_TEXTURE_URL.replace(/^\//, ""));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
};

/** A deterministic RGBA PNG (no filters, zlib level 9), so the export is reproducible. */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decodes the unfiltered RGBA PNG this test writes (enough to check the committed file). */
function decodePng(file: Buffer): { width: number; height: number; data: Uint8Array } {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 6]);
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0);
    out.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, height, data: out };
}

describe("Paw Match glove pointer", () => {
  const pixels = glovePixels();

  it("is a 32x32 matrix in the declared palette", () => {
    expect(GLOVE_MATRIX).toHaveLength(GLOVE_SIZE);
    for (const row of GLOVE_MATRIX) {
      expect(row).toHaveLength(GLOVE_SIZE);
      for (const char of row) expect(GLOVE_PALETTE[char]).toBeDefined();
    }
    expect(pixels.width).toBe(32);
    expect(pixels.height).toBe(32);
  });

  it("points up from the declared fingertip, with an outline around the whole glove", () => {
    // The tip pixels are outline; the first glove pixel sits right under them.
    expect(GLOVE_MATRIX[GLOVE_TIP.y].slice(GLOVE_TIP.x - 1, GLOVE_TIP.x + 1)).toBe("KK");
    expect(GLOVE_MATRIX[GLOVE_TIP.y + 1][GLOVE_TIP.x - 1]).toMatch(/[WSL]/);
    // Nothing is drawn above the tip row, and every glove pixel touches only glove or outline.
    const at = (x: number, y: number) => GLOVE_MATRIX[y]?.[x] ?? ".";
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (at(x, y) === "." || at(x, y) === "K") continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          expect(at(x + dx, y + dy)).not.toBe(".");
        }
      }
    }
  });

  it("the committed PNG is the export of the matrix", () => {
    const expected = encodePng(pixels.width, pixels.height, pixels.data);
    if (process.env.UPDATE_GLOVE === "1") {
      fs.mkdirSync(path.dirname(PNG_PATH), { recursive: true });
      fs.writeFileSync(PNG_PATH, expected);
    }
    expect(fs.existsSync(PNG_PATH)).toBe(true);
    const decoded = decodePng(fs.readFileSync(PNG_PATH));
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(Buffer.from(decoded.data).equals(Buffer.from(pixels.data))).toBe(true);
  });
});
