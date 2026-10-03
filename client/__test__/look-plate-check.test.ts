import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { inflateSync } from "zlib";
import { hasStraightCrop, minCropRun, straightCropRun } from "@/components/Phaser/look/plateCheck";

// Task 6e review, finding 1: a manifest plate whose alpha ends in a straight row inside the plate
// shows as a hard-edged block mid-screen; the backdrop draws the procedural plate instead.

const PLATES = join(__dirname, "..", "public", "landing", "plates");

/** Alpha channel of an 8-bit PNG (palette or RGBA, not interlaced): enough for the plates. */
function pngAlpha(file: string): { alpha: Uint8Array; width: number; height: number } {
  const data = readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("8-bit, non-interlaced PNGs only");
      colorType = body[9];
    } else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : colorType === 3 ? 1 : 0;
  if (!bpp) throw new Error(`colour type ${colorType} not handled`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (value + predicted) & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    alpha[i] = colorType === 6 ? pixels[i * 4 + 3] : trns && pixels[i] < trns.length ? trns[pixels[i]] : 255;
  }
  return { alpha, width, height };
}

/** RGBA data with the given per-column lowest opaque row (-1: empty column). */
function rgbaWithBottoms(width: number, height: number, bottom: (x: number) => number) {
  const data = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x += 1) {
    const last = bottom(x);
    for (let y = 0; y <= last; y += 1) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

describe("straight crop detection", () => {
  it("flags a block whose bottom is a straight row inside the plate", () => {
    const width = 200;
    const height = 100;
    const data = rgbaWithBottoms(width, height, (x) => (x >= 40 && x < 120 ? 60 : height - 1));
    expect(straightCropRun(data, width, height, 4, 3)).toBe(80);
    expect(hasStraightCrop(data, width, height)).toBe(true);
  });

  it("passes silhouettes that reach the bottom edge or have a ragged lower edge", () => {
    const width = 200;
    const height = 100;
    expect(hasStraightCrop(rgbaWithBottoms(width, height, () => height - 1), width, height)).toBe(false);
    const ragged = rgbaWithBottoms(width, height, (x) => 50 + ((x * 7) % 13));
    expect(hasStraightCrop(ragged, width, height)).toBe(false);
    // A short flat stretch (a ledge a few art pixels wide) is not a crop.
    const ledge = rgbaWithBottoms(width, height, (x) => (x >= 10 && x < 10 + minCropRun(width) - 1 ? 40 : height - 1));
    expect(hasStraightCrop(ledge, width, height)).toBe(false);
    expect(hasStraightCrop(new Uint8Array(0), 0, 0)).toBe(false);
  });

  it("on the shipped plates: far, mid and fog are clean (drawn as art); near plates are checked", () => {
    const files = readdirSync(PLATES).filter((name) => name.endsWith(".png"));
    expect(files.length).toBeGreaterThan(20);
    const cropped: string[] = [];
    for (const name of files) {
      const { alpha, width, height } = pngAlpha(join(PLATES, name));
      if (straightCropRun(alpha, width, height) >= minCropRun(width)) cropped.push(name);
    }
    // Only near plates may carry the rectangular crop the review found (until task 6d re-cuts
    // them, the runtime draws those layers procedurally).
    expect(cropped.filter((name) => !name.includes("-near-"))).toEqual([]);
  });
});
