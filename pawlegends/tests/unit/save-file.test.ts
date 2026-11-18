// @vitest-environment happy-dom
/**
 * Founder, Nov 18: "I can't save it". Save used `<a download>` everywhere and said "Saved." even in the app, whose
 * WebView ignores downloads. share/saveFile.ts: a download on the web; in the app the native gallery save, else the
 * share sheet, else a plain reason; never "Saved" for nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { canShareFile, nativeSaveAvailable, saveFile, saveNote, saveRoute, type CapLike } from '../../src/share/saveFile';

const video = (): Blob => new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'video/mp4' });
const NAME = 'paw-legends-clip-20261118.mp4';

const shell = (save: ((o: Record<string, unknown>) => Promise<unknown>) | null): CapLike => ({
  PluginHeaders: [{ name: 'PawlegendsShell', methods: save ? [{ name: 'saveFile' }] : [] }],
  nativePromise: (plugin, method, opts) => (plugin === 'PawlegendsShell' && method === 'saveFile' && save ? save(opts) : Promise.reject(Object.assign(new Error('no'), { code: 'UNIMPLEMENTED' }))),
});

const sheet = (outcome: 'ok' | 'abort' | null): Navigator & { canShare?: (d: ShareData) => boolean } =>
  ({
    share: outcome === null ? undefined : vi.fn(() => (outcome === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))),
    canShare: outcome === null ? undefined : () => true,
  }) as unknown as Navigator;

describe('save route', () => {
  it('web downloads; the app saves natively, else shares, else none', () => {
    expect(saveRoute({ platform: null, native: false, shareFiles: true })).toBe('download');
    expect(saveRoute({ platform: 'android', native: true, shareFiles: false })).toBe('device');
    expect(saveRoute({ platform: 'ios', native: false, shareFiles: true })).toBe('sheet');
    expect(saveRoute({ platform: 'android', native: false, shareFiles: false })).toBe('none');
  });
  it('the native method is found in the plugin headers only when the binary has it', () => {
    expect(nativeSaveAvailable(shell(async () => ({})))).toBe(true);
    expect(nativeSaveAvailable(shell(null))).toBe(false);
    expect(nativeSaveAvailable(null)).toBe(false);
    expect(canShareFile(new File([video()], NAME), sheet(null))).toBe(false);
    expect(canShareFile(new File([video()], NAME), sheet('ok'))).toBe(true);
  });
  it('says where it went, or why not, in plain words', () => {
    expect(saveNote({ ok: true, via: 'download', video: true })).toBe('Saved to your Downloads.');
    expect(saveNote({ ok: true, via: 'device', video: true, folder: 'Movies/Paw Legends' })).toBe('Saved to your gallery (Movies › Paw Legends).');
    expect(saveNote({ ok: true, via: 'device', video: true, folder: 'Photos' })).toBe('Saved to Photos.');
    expect(saveNote({ ok: false, why: 'cancelled', video: true })).toBe('');
    expect(saveNote({ ok: false, why: 'unsupported', video: true })).toMatch(/can't save the video\. Update the app/);
    expect(saveNote({ ok: false, why: 'denied', video: false })).toMatch(/Allow Paw Legends to add to Photos/);
  });
});

describe('saveFile', () => {
  it('web: a download link is clicked with the file name', async () => {
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      const r = await saveFile(video(), NAME, { platform: null, capacitor: null, nav: sheet(null) });
      expect(r).toMatchObject({ ok: true, via: 'download', note: 'Saved to your Downloads.' });
      expect(clicks).toEqual([NAME]);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });
  it('app with the native save: the file goes to the gallery as base64', async () => {
    const got: Record<string, unknown>[] = [];
    const r = await saveFile(video(), NAME, { platform: 'android', capacitor: shell(async (o) => (got.push(o), { folder: 'Movies/Paw Legends' })), nav: sheet(null) });
    expect(r).toMatchObject({ ok: true, via: 'device', note: 'Saved to your gallery (Movies › Paw Legends).' });
    expect(got[0]).toMatchObject({ name: NAME, mime: 'video/mp4', data: 'AQIDBAU=' });
  });
  it('app without the native save: the share sheet, and Cancel says nothing', async () => {
    const nav = sheet('ok');
    expect(await saveFile(video(), NAME, { platform: 'ios', capacitor: shell(null), nav })).toMatchObject({ ok: true, via: 'sheet' });
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(await saveFile(video(), NAME, { platform: 'ios', capacitor: shell(null), nav: sheet('abort') })).toMatchObject({ ok: false, why: 'cancelled', note: '' });
  });
  it('an old Android app (no native save, no share sheet): never "Saved", a reason instead', async () => {
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      const r = await saveFile(video(), NAME, { platform: 'android', capacitor: shell(null), nav: sheet(null) });
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ why: 'unsupported' });
      expect(r.note).not.toMatch(/Saved/);
      expect(clicks).toEqual([]);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });
  it('native refusal: Photos access refused falls back to the sheet, else says how to allow it', async () => {
    const denied = shell(() => Promise.reject(Object.assign(new Error('no'), { code: 'DENIED' })));
    expect(await saveFile(video(), NAME, { platform: 'ios', capacitor: denied, nav: sheet('ok') })).toMatchObject({ ok: true, via: 'sheet' });
    expect(await saveFile(video(), NAME, { platform: 'ios', capacitor: denied, nav: sheet(null) })).toMatchObject({ ok: false, why: 'denied' });
    const broken = shell(() => Promise.reject(Object.assign(new Error('no'), { code: 'FAILED' })));
    expect(await saveFile(video(), NAME, { platform: 'android', capacitor: broken, nav: sheet(null) })).toMatchObject({ ok: false, why: 'error', note: "Couldn't save the video. Try again." });
  });
});
