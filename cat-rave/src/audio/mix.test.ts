import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMixLoader, MIX_CDN, MIX_MANIFEST, MIX_SAME_ORIGIN } from './mix';

const dir = fileURLToPath(new URL('../../../client/public/music/back-on-track-v1/', import.meta.url));
const manifest = JSON.parse(readFileSync(dir + MIX_MANIFEST, 'utf8'));
const beatmap = JSON.parse(readFileSync(dir + manifest.beatmap, 'utf8'));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mix loader', () => {
  it('a segment fetch that stalls times out and moves on to the other base', async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    vi.stubGlobal('location', { hostname: 'tokentails.com' });
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      seen.push(url);
      if (url.endsWith('.json')) return Promise.resolve(new Response(JSON.stringify(url.endsWith(MIX_MANIFEST) ? manifest : beatmap)));
      if (url.startsWith(MIX_CDN)) {
        // A hung connection: never settles unless aborted.
        return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    });
    const loader = createMixLoader();
    await loader.load();
    const ctl = new AbortController();
    const p = loader.segment(0, ctl.signal);
    await vi.advanceTimersByTimeAsync(8100);
    const buf = await p;
    expect(buf.byteLength).toBe(3);
    const segUrls = seen.filter((u) => !u.endsWith('.json'));
    expect(segUrls[0].startsWith(MIX_CDN)).toBe(true);
    expect(segUrls[1].startsWith(MIX_SAME_ORIGIN)).toBe(true);
  });

  it('the caller aborting still aborts the attempt', async () => {
    vi.stubGlobal('location', { hostname: 'tokentails.com' });
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      if (url.endsWith('.json')) return Promise.resolve(new Response(JSON.stringify(url.endsWith(MIX_MANIFEST) ? manifest : beatmap)));
      return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    });
    const loader = createMixLoader();
    const ctl = new AbortController();
    const p = loader.segment(1, ctl.signal);
    await new Promise((r) => setTimeout(r, 10));
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
