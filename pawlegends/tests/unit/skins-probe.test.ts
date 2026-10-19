/**
 * Card skins (GDD §7.2): the runtime sprite probe. CORS fetch with no credentials, a 48 px crop of IDLE frame 0,
 * `close()` after, at most 2 at a time, blocked during a match, failures (403) cached for 24 h, 64 entries at most,
 * storage access that may throw.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodePng } from '../../tools/lib/png.mjs';
import { NEGATIVE_TTL_MS, PROBE_KEY, PROBE_MAX, fnv, probeResult, requestProbe, resetProbe, setProbeBlocked } from '../../src/render/skins/spriteProbe';

const SHEET = decodePng(new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../fixtures/skins/RASCAL_bow-tie-red.png'))));
const store = new Map<string, string>();
let clock = 1_000_000;
const calls: { url: string; init: RequestInit }[] = [];
const crops: number[][] = [];
let closed = 0;
let inFlight = 0;
let maxInFlight = 0;

beforeEach(() => {
  store.clear();
  calls.length = 0;
  crops.length = 0;
  closed = 0;
  inFlight = maxInFlight = 0;
  clock = 1_000_000;
  resetProbe(() => clock);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return url.includes('403') ? { ok: false, blob: async () => new Blob() } : { ok: true, blob: async () => new Blob() };
  });
  vi.stubGlobal('createImageBitmap', async (_b: Blob, sx: number, sy: number, sw: number, sh: number) => {
    crops.push([sx, sy, sw, sh]);
    return { sx, sy, close: () => void closed++ };
  });
  class Ctx {
    private img: { sx: number; sy: number } | null = null;
    clearRect(): void {}
    drawImage(b: { sx: number; sy: number }): void {
      this.img = b;
    }
    getImageData(): { data: Uint8ClampedArray } {
      const out = new Uint8ClampedArray(48 * 48 * 4);
      const { sx, sy } = this.img as { sx: number; sy: number };
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) for (let k = 0; k < 4; k++) out[(y * 48 + x) * 4 + k] = SHEET.data[((sy + y) * SHEET.width + sx + x) * 4 + k];
      return { data: out };
    }
  }
  vi.stubGlobal('OffscreenCanvas', class {
    getContext(): Ctx {
      return new Ctx();
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

const done = (url: string, fam: number[] = []): Promise<unknown> => new Promise((r) => requestProbe(url, fam, r));

describe('spriteProbe', () => {
  it('fetches in CORS mode without credentials, decodes only the 48 px IDLE frame, closes the bitmap, caches the row', async () => {
    const url = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RASCAL/bow-tie-red.png';
    const e = (await done(url, [0xd08f1c])) as { ok: boolean; accent: number };
    expect(calls[0].init).toMatchObject({ mode: 'cors', credentials: 'omit' });
    expect(crops[0]).toEqual([0, 192, 48, 48]);
    expect(closed).toBe(1);
    expect(e.ok).toBe(true);
    expect(probeResult(url)?.row?.pattern).toBeDefined();
    expect(JSON.parse(store.get(PROBE_KEY) as string)[fnv(url)].ok).toBe(true);
    // cached: never fetched again
    expect(requestProbe(url, [], () => undefined)).toBe(false);
  });
  it('a 403 is cached as a failure for 24 h, then probed again', async () => {
    const url = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PEACHES/403.png';
    await done(url);
    expect(probeResult(url)?.ok).toBe(false);
    expect(requestProbe(url, [], () => undefined)).toBe(false);
    clock += NEGATIVE_TTL_MS + 1;
    expect(probeResult(url)).toBeUndefined();
  });
  it('at most 2 at a time; blocked during a match until it ends', async () => {
    setProbeBlocked(true);
    const all = [1, 2, 3, 4, 5].map((n) => done(`https://x.example/assets/A/${n}.png`));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.length).toBe(0);
    setProbeBlocked(false);
    await Promise.all(all);
    expect(calls.length).toBe(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
  it('a probe in flight when a match starts is neither cached nor reported until the match ends', async () => {
    const url = 'https://x.example/assets/D/1.png';
    let landed = 0;
    requestProbe(url, [], () => void landed++);
    setProbeBlocked(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.length).toBe(1);
    expect(landed).toBe(0);
    expect(probeResult(url)).toBeUndefined();
    // asked again mid-match: not fetched twice
    expect(requestProbe(url, [], () => undefined)).toBe(false);
    setProbeBlocked(false);
    expect(landed).toBe(1);
    expect(probeResult(url)?.ok).toBe(true);
    expect(calls.length).toBe(1);
  });
  it(`keeps at most ${PROBE_MAX} entries (oldest out); a blocked store does not throw`, async () => {
    for (let n = 0; n < PROBE_MAX + 6; n++) {
      clock++;
      await done(`https://x.example/assets/B/403-${n}.png`);
    }
    expect(Object.keys(JSON.parse(store.get(PROBE_KEY) as string)).length).toBe(PROBE_MAX);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    resetProbe(() => clock);
    await expect(done('https://x.example/assets/C/403.png')).resolves.toBeDefined();
  });
});
