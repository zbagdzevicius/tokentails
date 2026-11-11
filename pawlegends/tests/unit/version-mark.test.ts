// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_INFO_EVENT, bindVersionMark, buildStamp, formatVersion, versionMarkHtml } from '../../src/ui/versionMark';

const BASE = { version: '1.0.2', sha: 'A1B2C3D', builtAt: '2026-11-11T15:30:59.000Z', sim: 20 };

describe('release watermark: the version line', () => {
  it('formats the UTC build time as yyyymmdd-HHMM', () => {
    expect(buildStamp('2026-11-11T15:30:59.000Z')).toBe('20261111-1530');
    expect(buildStamp('2026-01-02T03:04:00+02:00')).toBe('20260102-0104');
    expect(buildStamp('')).toBe('');
    expect(buildStamp('not a date')).toBe('');
  });

  it('web: version, build, sha, sim and "web"', () => {
    expect(formatVersion({ ...BASE, platform: null })).toBe('v1.0.2 · build 20261111-1530 · a1b2c3d · sim 20 · web');
  });

  it('app: the platform, the native version and build, and the active OTA bundle', () => {
    expect(formatVersion({ ...BASE, platform: 'ios', app: { native: '1.1.0', nativeBuild: '42', ota: '20261111153000-a1b2c3d' } })).toBe(
      'v1.0.2 · build 20261111-1530 · a1b2c3d · sim 20 · iOS 1.1.0 (42) · ota 20261111153000-a1b2c3d',
    );
    expect(formatVersion({ ...BASE, platform: 'android', app: { native: '1.1.0', ota: 'builtin' } })).toBe(
      'v1.0.2 · build 20261111-1530 · a1b2c3d · sim 20 · Android 1.1.0 · ota builtin',
    );
    // the shell has not answered yet: the platform alone
    expect(formatVersion({ ...BASE, platform: 'mac', app: null })).toBe('v1.0.2 · build 20261111-1530 · a1b2c3d · sim 20 · macOS');
  });

  it('missing or hostile parts are left out, never "undefined" or markup', () => {
    expect(formatVersion({ version: '', sha: '', builtAt: '', sim: 20, platform: null })).toBe('v? · sim 20 · web');
    const line = formatVersion({ ...BASE, platform: 'ios', app: { native: '<b>1.1</b>', ota: 'x" onclick="y' } });
    expect(line).not.toMatch(/[<>"]/);
    expect(line).not.toContain('undefined');
    expect(versionMarkHtml('a "b" <c>')).not.toContain('<c>');
  });
});

describe('release watermark: the button', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).__PL_APP_INFO__;
    document.body.innerHTML = '';
  });

  it('a click copies the full line; a refused clipboard fails silently', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const root = document.createElement('div');
    root.innerHTML = versionMarkHtml();
    document.body.appendChild(root);
    bindVersionMark(root);
    const el = root.querySelector<HTMLButtonElement>('.lb-ver')!;
    const line = el.querySelector('span')!.textContent!;
    expect(line).toMatch(/^v\S+ · (build \d{8}-\d{4} · )?\S+ · sim \d+ · web$/);
    el.click();
    expect(writeText).toHaveBeenCalledWith(line);
    await Promise.resolve();
    await Promise.resolve();
    expect(el.querySelector('span')!.textContent).toBe('Copied');

    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    expect(() => el.click()).not.toThrow();
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    expect(() => el.click()).not.toThrow();
  });

  it('fills in the native part when the shell publishes it', () => {
    // a native page (Capacitor bridge, iPhone)
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'ios' });
    const root = document.createElement('div');
    root.innerHTML = versionMarkHtml();
    document.body.appendChild(root);
    const ac = new AbortController();
    bindVersionMark(root, ac.signal);
    const span = root.querySelector('.lb-ver span')!;
    expect(span.textContent).toMatch(/ · iOS$/);
    (window as unknown as Record<string, unknown>).__PL_APP_INFO__ = { native: '1.1.0', nativeBuild: '7', ota: 'builtin' };
    window.dispatchEvent(new Event(APP_INFO_EVENT));
    expect(span.textContent).toMatch(/ · iOS 1\.1\.0 \(7\) · ota builtin$/);
    ac.abort();
  });
});
