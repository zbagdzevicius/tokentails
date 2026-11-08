/**
 * The OTA flow (src/shell/ota.ts) with a fake updater: check, download, apply only when safe, the boot watchdog
 * bookkeeping, and that a bundle that failed to boot is never tried again.
 */
import { describe, expect, it } from 'vitest';
import { encryptBundle, generateKeys, signManifest, spkiPem } from '../scripts/lib/capgo-crypto.mjs';
import { CHECK_EVERY_MS, KEYS, Ota, takesOtaUpdates, type BundleRef, type KV, type OtaDeps, type UpdaterLike } from '../src/shell/ota';
import type { BundleStamp } from '../src/shell/manifest';

const keys = generateKeys() as { privatePem: string; publicPem: string };

function published(version: string, seq: number, over: Record<string, unknown> = {}) {
  const enc = encryptBundle(Buffer.from(version), keys.privatePem);
  const f = {
    schema: 1,
    platform: 'ios',
    compat: 1,
    version,
    seq,
    url: `https://tokentails.com/pawlegends-app/updates/ios/1/bundles/${version}.zip`,
    checksum: enc.checksum,
    sessionKey: enc.sessionKey,
    simVersion: 14,
    minNative: '1.0.0',
    rollback: false,
    ...over,
  };
  return { ...f, signature: signManifest(f, keys.privatePem) };
}

class FakeUpdater implements UpdaterLike {
  bundles: BundleRef[] = [];
  readyCalls = 0;
  setTo: string | null = null;
  downloads: string[] = [];
  failDownload = false;
  async notifyAppReady() {
    this.readyCalls++;
  }
  async download(o: { version: string }) {
    if (this.failDownload) throw new Error('checksum');
    this.downloads.push(o.version);
    const b = { id: `id-${o.version}`, version: o.version, status: 'pending' };
    this.bundles.push(b);
    return b;
  }
  async set(o: { id: string }) {
    this.setTo = o.id;
  }
  async list() {
    return { bundles: this.bundles };
  }
  async delete(o: { id: string }) {
    this.bundles = this.bundles.filter((b) => b.id !== o.id);
  }
}

function kv(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function setup(o: { stamp?: BundleStamp; manifest?: unknown; screen?: string; store?: ReturnType<typeof kv>; updater?: FakeUpdater } = {}) {
  const updater = o.updater ?? new FakeUpdater();
  const store = o.store ?? kv();
  let t = 1_000_000_000;
  const state = { screen: o.screen ?? 'title', partyOpen: false, partySeat: false };
  let manifest: unknown = o.manifest ?? published('202611071530-abc1234', 202611071530);
  const deps: OtaDeps = {
    updater,
    getJson: async () => {
      if (manifest instanceof Error) throw manifest;
      return JSON.parse(JSON.stringify(manifest));
    },
    stamp: o.stamp ?? { version: '202611011200-0000000', seq: 202611011200, compat: 1, simVersion: 14 },
    nativeVersion: async () => '1.0.0',
    manifestUrl: 'https://tokentails.com/pawlegends-app/updates/ios/1/manifest.json',
    spkiPem: spkiPem(keys.publicPem),
    kv: store,
    gameState: () => state,
    now: () => t,
  };
  return {
    ota: new Ota(deps),
    updater,
    store,
    state,
    tick: (ms: number) => (t += ms),
    setManifest: (m: unknown) => (manifest = m),
  };
}

describe('Ota.check', () => {
  it('downloads a newer bundle and keeps it pending (no reload yet)', async () => {
    const { ota, updater, store } = setup();
    expect(await ota.check()).toBe('downloaded');
    expect(updater.downloads).toEqual(['202611071530-abc1234']);
    expect(updater.setTo).toBeNull();
    expect(JSON.parse(store.m.get(KEYS.pending)!)).toEqual({ id: 'id-202611071530-abc1234', version: '202611071530-abc1234' });
  });
  it('is throttled, and does not fetch the same bundle twice', async () => {
    const { ota, updater, tick } = setup();
    await ota.check();
    expect(await ota.check()).toBe('throttled');
    tick(CHECK_EVERY_MS + 1);
    expect(await ota.check()).toBe('already-downloaded');
    expect(updater.downloads.length).toBe(1);
  });
  it('offline, no manifest, a bad signature: nothing happens', async () => {
    const a = setup({ manifest: new Error('offline') });
    expect(await a.ota.check()).toBe('offline');
    const b = setup({ manifest: { hello: 1 } });
    expect(await b.ota.check()).toBe('no-manifest');
    const forged = { ...published('202611071530-abc1234', 202611071530), seq: 202611071531 };
    const c = setup({ manifest: forged });
    expect(await c.ota.check()).toBe('bad-signature');
    expect(c.updater.downloads).toEqual([]);
  });
  it('a failed download leaves nothing pending', async () => {
    const updater = new FakeUpdater();
    updater.failDownload = true;
    const { ota, store } = setup({ updater });
    expect(await ota.check()).toBe('download-failed');
    expect(store.m.has(KEYS.pending)).toBe(false);
  });
  it('a newer download replaces an older pending one', async () => {
    const { ota, updater, tick, setManifest } = setup();
    await ota.check();
    setManifest(published('202611081000-def5678', 202611081000));
    tick(CHECK_EVERY_MS + 1);
    expect(await ota.check()).toBe('downloaded');
    expect(updater.bundles.map((b) => b.version)).toEqual(['202611081000-def5678']);
  });
});

describe('Ota.applyIfSafe', () => {
  it('swaps on the title screen and records the attempt', async () => {
    const { ota, updater, store } = setup();
    await ota.check();
    expect(await ota.applyIfSafe()).toBe(true);
    expect(updater.setTo).toBe('id-202611071530-abc1234');
    expect(JSON.parse(store.m.get(KEYS.trying)!)).toBe('202611071530-abc1234');
  });
  it('never in a match, on pick or results, or with a party', async () => {
    const s = setup();
    await s.ota.check();
    for (const screen of ['match', 'pick', 'results']) {
      s.state.screen = screen;
      expect(await s.ota.applyIfSafe()).toBe(false);
    }
    s.state.screen = 'title';
    s.state.partyOpen = true;
    expect(await s.ota.applyIfSafe()).toBe(false);
    expect(s.updater.setTo).toBeNull();
  });
  it('drops a pending bundle the updater no longer has', async () => {
    const s = setup();
    await s.ota.check();
    s.updater.bundles = [];
    expect(await s.ota.applyIfSafe()).toBe(false);
    expect(s.store.m.has(KEYS.pending)).toBe(false);
  });
});

describe('Ota.booted (the watchdog bookkeeping)', () => {
  it('always tells the updater the bundle is ready', async () => {
    const { ota, updater } = setup();
    await ota.booted();
    expect(updater.readyCalls).toBe(1);
  });
  it('the new bundle booted: the attempt and the pending record are cleared', async () => {
    const store = kv();
    store.m.set(KEYS.trying, JSON.stringify('202611071530-abc1234'));
    store.m.set(KEYS.pending, JSON.stringify({ id: 'x', version: '202611071530-abc1234' }));
    const { ota } = setup({ store, stamp: { version: '202611071530-abc1234', seq: 202611071530, compat: 1, simVersion: 14 } });
    await ota.booted();
    expect(store.m.has(KEYS.trying)).toBe(false);
    expect(store.m.has(KEYS.pending)).toBe(false);
    expect(ota.failedVersions()).toEqual([]);
  });
  it('the new bundle did not boot (rolled back): it is remembered and never downloaded again', async () => {
    const store = kv();
    store.m.set(KEYS.trying, JSON.stringify('202611071530-abc1234'));
    const { ota, updater } = setup({ store });
    await ota.booted();
    expect(ota.failedVersions()).toEqual(['202611071530-abc1234']);
    expect(await ota.check(true)).toBe('failed-before');
    expect(updater.downloads).toEqual([]);
  });
});

describe('takesOtaUpdates', () => {
  it('the iPhone app takes updates; the Mac app never does (guideline 2.4.5)', () => {
    expect(takesOtaUpdates('ios')).toBe(true);
    expect(takesOtaUpdates(undefined)).toBe(true);
    expect(takesOtaUpdates('mac')).toBe(false);
  });
});
