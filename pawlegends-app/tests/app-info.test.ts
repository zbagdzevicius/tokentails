/**
 * The native part of the game's release watermark (src/shell/appInfo.ts): app version and build, and the bundle the
 * updater runs, published on the window with an event. Every part is optional; nothing throws.
 */
import { describe, expect, it } from 'vitest';
import { APP_INFO_EVENT, APP_INFO_GLOBAL, publishAppInfo, readAppInfo } from '../src/shell/appInfo';

describe('app info for the release watermark', () => {
  it('reads the native version, build and the OTA bundle version', async () => {
    const info = await readAppInfo({
      getInfo: async () => ({ version: '1.1.0', build: '42' }),
      current: async () => ({ bundle: { id: 'k3j2', version: '20261111153000-a1b2c3d' } }),
    });
    expect(info).toEqual({ native: '1.1.0', nativeBuild: '42', ota: '20261111153000-a1b2c3d' });
  });

  it('the bundle in the binary is "builtin"; no updater (Mac) leaves it out', async () => {
    expect((await readAppInfo({ getInfo: async () => ({ version: '1.1.0' }), current: async () => ({ bundle: { id: 'builtin', version: '1.1.0' } }) })).ota).toBe('builtin');
    expect(await readAppInfo({ getInfo: async () => ({ version: '1.1.0', build: '3' }) })).toEqual({ native: '1.1.0', nativeBuild: '3' });
  });

  it('a failing call leaves its part out, never throws', async () => {
    const info = await readAppInfo({
      getInfo: async () => {
        throw new Error('no plugin');
      },
      current: async () => ({ bundle: { id: 'builtin' } }),
    });
    expect(info).toEqual({ ota: 'builtin' });
  });

  it('publishes on the window and announces it', async () => {
    const events: string[] = [];
    const w = { dispatchEvent: (e: Event) => (events.push(e.type), true) } as unknown as Window;
    await publishAppInfo({ getInfo: async () => ({ version: '1.1.0', build: '42' }) }, w);
    expect((w as unknown as Record<string, unknown>)[APP_INFO_GLOBAL]).toEqual({ native: '1.1.0', nativeBuild: '42' });
    expect(events).toEqual([APP_INFO_EVENT]);
  });
});
