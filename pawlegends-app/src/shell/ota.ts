/**
 * Self-hosted over-the-air web updates (docs/plans/moba/APP-STORE.md "OTA flow"), on @capgo/capacitor-updater in
 * manual mode (no Capgo cloud: autoUpdate off, no stats, no channel; config in capacitor.config.ts).
 *
 * 1. Boot: once the title is up (`html[data-ready]`), `notifyAppReady()`. A bundle that never gets there is rolled
 *    back by the plugin after `appReadyTimeout`, and this module then remembers it as failed (never retried).
 * 2. Check on launch and on resume (at most every CHECK_EVERY_MS): GET the manifest for this compat level (no device
 *    id, no cookies), verify its signature, decide, download in the background. The download is only kept.
 * 3. Apply (a reload into the new bundle) only when it is safe: on the title screen, no party. That is on the next
 *    cold start or on a resume while on the title, never in a match.
 *
 * Everything the module touches is injected (OtaDeps), so tests/ota.test.ts drives it without a device.
 */
import { decide, parseManifest, safeToApply, verifyManifest, type BundleStamp, type OtaManifest, type OtaPlatform } from './manifest';

/**
 * Whether this platform takes over-the-air updates. The iPhone app does (guidelines 2.5.2 and 4.7), and so does the
 * Android app (Google Play's Device and Network Abuse policy allows JavaScript run in a WebView). The Mac app
 * (`__PL_PLATFORM__ === 'mac'`, set by GameViewController.swift) does not: Mac App Store guideline 2.4.5 (v) and
 * (viii) rule out downloading resources and updating outside the Mac App Store, so the Mac only ever runs the game
 * bundled in its build and gets new content as a new build through App Review.
 */
export function takesOtaUpdates(platform: unknown): boolean {
  return platform !== 'mac';
}

export interface BundleRef {
  id: string;
  version: string;
  status?: string;
}

export interface UpdaterLike {
  notifyAppReady(): Promise<unknown>;
  download(o: { url: string; version: string; checksum: string; sessionKey: string }): Promise<BundleRef>;
  set(o: { id: string }): Promise<unknown>;
  list(): Promise<{ bundles: BundleRef[] }>;
  delete(o: { id: string }): Promise<unknown>;
  /** Download progress (`percent` 0..100); @capgo/capacitor-updater 7 has it, a fake may leave it out. */
  addListener?(event: 'download', cb: (e: { percent?: number }) => void): Promise<{ remove(): Promise<void> | void }> | { remove(): Promise<void> | void };
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface OtaDeps {
  updater: UpdaterLike;
  /** GET a URL as JSON (native HTTP in the app, so no CORS is needed on tokentails.com). */
  getJson(url: string): Promise<unknown>;
  stamp: BundleStamp;
  nativeVersion(): Promise<string>;
  manifestUrl: string;
  /** The manifest's platform this shell accepts (default ios). */
  platform?: OtaPlatform;
  /** Accept bundles from the local test server (the dev channel of a Debug build only). */
  allowLocal?: boolean;
  spkiPem: string;
  kv: KV;
  /** The game's state, for safeToApply. */
  gameState(): { screen: string | undefined; partyOpen: boolean; partySeat: boolean };
  now(): number;
  log?(msg: string): void;
  subtle?: SubtleCrypto;
}

export const KEYS = Object.freeze({
  pending: 'pl.ota.pending',
  trying: 'pl.ota.trying',
  failed: 'pl.ota.failed',
  checkedAt: 'pl.ota.checkedAt',
});

export const CHECK_EVERY_MS = 30 * 60_000;
const FAILED_MAX = 20;

function readJson<T>(kv: KV, k: string, fallback: T): T {
  try {
    const raw = kv.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(kv: KV, k: string, v: unknown): void {
  try {
    kv.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the next launch checks again */
  }
}

export class Ota {
  private busy = false;

  constructor(private readonly d: OtaDeps) {}

  private log(msg: string): void {
    this.d.log?.(`[ota] ${msg}`);
  }

  failedVersions(): string[] {
    const v = readJson<unknown>(this.d.kv, KEYS.failed, []);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  /**
   * The page booted (title up): tell the plugin, then settle the last apply. If we tried to move to version X and
   * are not running X now, X failed to boot and the plugin rolled it back: remember X as failed.
   */
  async booted(): Promise<void> {
    try {
      await this.d.updater.notifyAppReady();
    } catch (e) {
      this.log(`notifyAppReady failed: ${String(e)}`);
    }
    const trying = readJson<string | null>(this.d.kv, KEYS.trying, null);
    if (trying) {
      this.d.kv.removeItem(KEYS.trying);
      if (trying !== this.d.stamp.version) {
        const failed = [...new Set([...this.failedVersions(), trying])].slice(-FAILED_MAX);
        writeJson(this.d.kv, KEYS.failed, failed);
        this.log(`bundle ${trying} did not boot; rolled back to ${this.d.stamp.version}`);
      } else this.log(`now on ${trying}`);
    }
    const pending = readJson<BundleRef | null>(this.d.kv, KEYS.pending, null);
    if (pending && pending.version === this.d.stamp.version) this.d.kv.removeItem(KEYS.pending);
  }

  /** Fetch, verify and decide; download a newer bundle. Returns what happened (for logs and tests). */
  async check(force = false): Promise<string> {
    if (this.busy) return 'busy';
    const last = Number(this.d.kv.getItem(KEYS.checkedAt) ?? 0);
    if (!force && this.d.now() - last < CHECK_EVERY_MS) return 'throttled';
    this.busy = true;
    try {
      this.d.kv.setItem(KEYS.checkedAt, String(this.d.now()));
      let raw: unknown;
      try {
        raw = await this.d.getJson(`${this.d.manifestUrl}?t=${Math.floor(this.d.now() / 60_000)}`);
      } catch {
        return 'offline';
      }
      const m = parseManifest(raw, this.d.stamp.compat, this.d.allowLocal === true, this.d.platform ?? 'ios');
      if (!m) return 'no-manifest';
      const sig = await verifyManifest(m, this.d.spkiPem, this.d.subtle);
      if (sig === 'bad') {
        this.log(`manifest ${m.version}: bad signature`);
        return 'bad-signature';
      }
      const native = await this.d.nativeVersion();
      const choice = decide(m, this.d.stamp, native, this.failedVersions());
      if (choice.act === 'none') return choice.why;
      const pending = readJson<BundleRef | null>(this.d.kv, KEYS.pending, null);
      if (pending?.version === m.version && (await this.hasBundle(pending.id))) return 'already-downloaded';
      return await this.download(m);
    } finally {
      this.busy = false;
    }
  }

  private async hasBundle(id: string): Promise<boolean> {
    try {
      const { bundles } = await this.d.updater.list();
      return bundles.some((b) => b.id === id && (b.status === undefined || b.status === 'success' || b.status === 'pending'));
    } catch {
      return false;
    }
  }

  private async download(m: OtaManifest): Promise<string> {
    try {
      const b = await this.d.updater.download({ url: m.url, version: m.version, checksum: m.checksum, sessionKey: m.sessionKey });
      // an older pending download is superseded
      const old = readJson<BundleRef | null>(this.d.kv, KEYS.pending, null);
      if (old && old.id !== b.id) await this.d.updater.delete({ id: old.id }).catch(() => undefined);
      writeJson(this.d.kv, KEYS.pending, { id: b.id, version: m.version });
      this.log(`downloaded ${m.version}`);
      return 'downloaded';
    } catch (e) {
      this.log(`download ${m.version} failed: ${String(e)}`);
      return 'download-failed';
    }
  }

  /** The version downloaded and waiting to be applied, or null. */
  pendingVersion(): string | null {
    const pending = readJson<BundleRef | null>(this.d.kv, KEYS.pending, null);
    return pending && pending.version !== this.d.stamp.version ? pending.version : null;
  }

  /** Allow one failed version to be tried again (the update gate's manual Try again, at most once a day). */
  forgetFailed(version: string): void {
    writeJson(this.d.kv, KEYS.failed, this.failedVersions().filter((v) => v !== version));
  }

  /** Follow the download progress (percent). Returns an unsubscribe; a no-op where the updater has no events. */
  onProgress(cb: (percent: number) => void): () => void {
    const add = this.d.updater.addListener;
    if (typeof add !== 'function') return () => undefined;
    let handle: { remove(): Promise<void> | void } | null = null;
    let gone = false;
    try {
      void Promise.resolve(add.call(this.d.updater, 'download', (e) => {
        if (!gone && typeof e?.percent === 'number') cb(Math.max(0, Math.min(100, e.percent)));
      })).then((h) => {
        handle = h;
        if (gone) void handle?.remove();
      }, () => undefined);
    } catch {
      return () => undefined;
    }
    return () => {
      gone = true;
      void handle?.remove();
    };
  }

  /** Swap to the downloaded bundle if it is safe now. The plugin reloads the WebView into it. */
  applyIfSafe(): Promise<boolean> {
    return this.apply(true);
  }

  /**
   * Swap to the downloaded bundle now, without the title-screen check: the update gate (gate.ts) covers the game, so
   * nothing is playable behind it, and it only runs on the title or at boot.
   */
  applyNow(): Promise<boolean> {
    return this.apply(false);
  }

  private async apply(onlyWhenSafe: boolean): Promise<boolean> {
    const pending = readJson<BundleRef | null>(this.d.kv, KEYS.pending, null);
    if (!pending || pending.version === this.d.stamp.version) return false;
    if (this.failedVersions().includes(pending.version)) {
      this.d.kv.removeItem(KEYS.pending);
      return false;
    }
    if (onlyWhenSafe && !safeToApply(this.d.gameState())) return false;
    if (!(await this.hasBundle(pending.id))) {
      this.d.kv.removeItem(KEYS.pending);
      return false;
    }
    writeJson(this.d.kv, KEYS.trying, pending.version);
    try {
      await this.d.updater.set({ id: pending.id });
      return true;
    } catch (e) {
      this.d.kv.removeItem(KEYS.trying);
      this.log(`set ${pending.version} failed: ${String(e)}`);
      return false;
    }
  }
}
