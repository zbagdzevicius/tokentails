import { describe, expect, it } from 'vitest';
import type { ClipExportResult, PlayableRoom, RenderApi, Renderer, RunResult, ShareApi } from '../types';
import { DEFAULT_CAT } from '../types';
import { ClipJob } from './clip-job';

function fakeShare(result: () => ClipExportResult, seen: unknown[]): ShareApi {
  return {
    planClip: () => ({ pick: 'default' }) as never,
    exportClip: async (_r, _rr, _p, _c, _run, opts) => {
      seen.push(opts);
      return result();
    },
    shareClip: async () => 'download',
    copyHandoffLink: async () => true,
  };
}

function job(result: () => ClipExportResult, seen: unknown[], options = {}): ClipJob {
  const share = fakeShare(result, seen);
  return new ClipJob({
    loadShare: async () => share,
    render: {} as RenderApi,
    renderer: {} as Renderer,
    play: {} as PlayableRoom,
    cat: DEFAULT_CAT,
    result: {} as RunResult,
    opener: async () => undefined,
    options,
  });
}

const ok = (): ClipExportResult => ({ blob: new Blob(['x'], { type: 'video/mp4' }), mime: 'video/mp4', encoder: 'webcodecs', audio: true, ms: 1 });

describe('ClipJob (wave 2 share formats)', () => {
  it('passes the format, handle, caption style and music to exportClip', async () => {
    const seen: Record<string, unknown>[] = [];
    const j = job(ok, seen, { captionStyle: 2, music: true });
    await j.start();
    expect(seen[0]).toMatchObject({ music: true, captionStyle: 2 });
    expect(seen[0].format).toBeUndefined();
    expect(await j.setOptions({ format: 'stitch', overlay: 'luna.mom' })).toBe(true);
    await j.idle();
    expect(j.state.status).toBe('ready');
    expect(seen[1]).toMatchObject({ format: 'stitch', overlay: 'luna.mom', captionStyle: 2, music: true });
    // same options: nothing re-renders
    expect(await j.setOptions({ format: 'stitch', overlay: 'luna.mom' })).toBe(false);
    expect(seen).toHaveLength(2);
    // carousel is not a clip format
    await j.setOptions({ format: 'carousel' });
    await j.idle();
    expect(seen[2].format).toBeUndefined();
  });
  it('fallback 2: no encoder → the crash GIF becomes the post', async () => {
    const gif = new Blob(['g'], { type: 'image/gif' });
    const j = job(() => ({ blob: null, mime: '', encoder: 'fallback', audio: false, ms: 1, error: 'CLIP_UNSUPPORTED', gif, card: null }), []);
    await j.start();
    expect(j.state.status).toBe('ready');
    expect(j.state.blob).toBe(gif);
  });
  it('an export error without a fallback stays an error', async () => {
    const j = job(() => ({ blob: null, mime: '', encoder: 'webcodecs', audio: false, ms: 1, error: 'boom' }), []);
    await j.start();
    expect(j.state.status).toBe('error');
  });
});
