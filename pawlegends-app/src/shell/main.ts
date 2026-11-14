/**
 * The app shell script (`www/shell.js`, a classic script loaded before the game in index.html by
 * scripts/build-web.mjs). Native only: on any other page it does nothing.
 *
 * - haptics: a `navigator.vibrate` backed by the Taptic Engine or Android's haptic effects (haptics.ts), not in
 *   the Mac app;
 * - Android back button and gesture: Escape into the game, or the app to the background on the bare title (back.ts);
 * - OTA: notifyAppReady once the title is up, update checks on launch and resume, apply on the title (ota.ts);
 *   iPhone and Android: the Mac app runs only the game bundled in its build (takesOtaUpdates in ota.ts, guideline
 *   2.4.5). Each platform reads its own manifest (`updates/<platform>/<compat>/`).
 * - the update gate (gate.ts, docs/plans/moba/FORCE-UPDATE.md §4): the app does not start on an outdated bundle. It
 *   checks the policy at launch, on resume while on the title, whenever the game returns to the title, and when the
 *   game reports that the server refused this version (`pl:update-required`); never mid-match.
 * - the compat-1 bridge bundle (`__PL_BRIDGE__`, build-web.mjs --bridge) keeps only the OTA, haptics and back handling:
 *   no gate (the page itself is the "Update Paw Legends" screen) and no host channel.
 * - the release watermark: `window.__PL_APP_INFO__` (app version, build, active OTA bundle) for the title (appInfo.ts);
 * - sign-in: the same-window channel to the in-page host (`window.__PL_HOST__`, src/host/channel.ts), installed here,
 *   before the game's module runs, so the game's bridge finds it at boot; the host itself (`host.js`, Firebase and
 *   the sign-in sheet) loads after the game and attaches to it.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { channelOf, manifestUrl, otaPlatformOf, safeToApply, type BundleStamp } from './manifest';
import { handleBack } from './back';
import { installVibrate } from './haptics';
import { Ota, takesOtaUpdates, type KV } from './ota';
import { CHANNEL_GLOBAL, createChannel } from '../host/channel';
import { publishAppInfo } from './appInfo';
import { Gate } from './gate';
import { fetchPolicy, offlineVerdict, readCache } from './policy';
import { CLIENT_POLICY_STORE_URLS, CLIENT_POLICY_WEB_URL, type ClientPolicyQuery } from '@/shared-contracts/client-policy';

declare const __PL_STAMP__: BundleStamp;
declare const __PL_SPKI__: string;
declare const __PL_UPDATES_URL__: string;
declare const __PL_LOCAL_UPDATES_URL__: string;
declare const __PL_API_ORIGIN__: string;
declare const __PL_BRIDGE__: boolean;

/** Resume re-checks at most this often (a forced check from the game or a boot is never throttled). */
const GATE_RESUME_EVERY_MS = 5 * 60_000;

const memoryKv = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

function storage(): KV {
  try {
    const ls = window.localStorage;
    ls.setItem('pl.ota.probe', '1');
    ls.removeItem('pl.ota.probe');
    return ls;
  } catch {
    return memoryKv();
  }
}

/** Resolve once the game set html[data-ready] (its title is up). */
function whenReady(): Promise<void> {
  const html = document.documentElement;
  if (html.dataset.ready === '1') return Promise.resolve();
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => {
      if (html.dataset.ready === '1') {
        mo.disconnect();
        resolve();
      }
    });
    mo.observe(html, { attributes: true, attributeFilter: ['data-ready'] });
  });
}

function partySeat(): boolean {
  try {
    return !!sessionStorage.getItem('pl.party.resume');
  } catch {
    return false;
  }
}

/** The game's channel to the in-page host (sign-in); host.js picks the host side up from CHANNEL_GLOBAL. */
function installHostChannel(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__PL_HOST__) return;
  const channel = createChannel();
  Object.defineProperty(window, '__PL_HOST__', { value: channel.game, configurable: false, writable: false });
  Object.defineProperty(window, CHANNEL_GLOBAL, { value: channel, configurable: false, writable: false });
}

/** Run `fn` once the body exists (shell.js is a classic script in <head>). */
function whenBody(fn: () => void): void {
  if (document.body) fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

function start(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (!__PL_BRIDGE__) {
    try {
      installHostChannel();
    } catch (e) {
      console.warn('[shell] no host channel', e);
    }
  }
  // the Mac app (Mac Catalyst) has no Taptic Engine: no vibrate bridge there, the game's haptics stay silent
  const platform = (window as unknown as { __PL_PLATFORM__?: unknown }).__PL_PLATFORM__;
  const mac = platform === 'mac';
  const android = Capacitor.getPlatform() === 'android';
  if (!mac) {
    const styles = { LIGHT: ImpactStyle.Light, MEDIUM: ImpactStyle.Medium, HEAVY: ImpactStyle.Heavy } as const;
    installVibrate(navigator, { impact: (o) => Haptics.impact({ style: styles[o.style] }) }, setTimeout, android);
  }
  // registering the listener turns off Capacitor's default (WebView history back, else close the app mid-match)
  if (android) void App.addListener('backButton', () => void handleBack(document, () => App.minimizeApp()));
  // the title screen's release watermark: app version and build, and the bundle the updater runs (appInfo.ts)
  void publishAppInfo({ getInfo: () => App.getInfo(), current: takesOtaUpdates(platform) ? () => CapacitorUpdater.current() : undefined });

  // set by the native shell before any page script (GameViewController.swift, MainActivity.java): stable, beta
  // (TestFlight) or dev (Debug builds)
  const channel = channelOf((window as unknown as { __PL_CHANNEL__?: unknown }).__PL_CHANNEL__);
  const getJson = async (url: string, timeoutMs = 8000): Promise<unknown> => {
    const r = await CapacitorHttp.get({ url, headers: { accept: 'application/json' }, responseType: 'json', connectTimeout: timeoutMs, readTimeout: timeoutMs });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  };
  const otaPlatform = otaPlatformOf(Capacitor.getPlatform());
  const kv = storage();
  const gameState = () => ({ screen: document.documentElement.dataset.screen, partyOpen: !!document.querySelector('.pl-party'), partySeat: partySeat() });
  const ota = new Ota({
    updater: CapacitorUpdater,
    getJson: (url) => getJson(url),
    stamp: __PL_STAMP__,
    nativeVersion: async () => (await App.getInfo()).version,
    manifestUrl: manifestUrl(channel, __PL_UPDATES_URL__, __PL_LOCAL_UPDATES_URL__, __PL_STAMP__.compat, otaPlatform),
    platform: otaPlatform,
    allowLocal: channel === 'dev',
    spkiPem: __PL_SPKI__,
    kv,
    gameState,
    now: () => Date.now(),
    log: (m) => console.info(`${m} (channel ${channel})`),
  });
  const ota_ = takesOtaUpdates(platform) ? ota : null;
  // the boot is settled: the title is up and the updater's watchdog is told (a bundle that never gets here is reverted)
  const booted = whenReady().then(() => ota.booted());
  const backgroundCheck = async () => {
    if (!ota_) return;
    // a bundle downloaded earlier: swap now if on the title (a short reload behind the splash colour)
    if (await ota_.applyIfSafe()) return;
    console.info(`[ota] ${__PL_STAMP__.version}: check ${await ota_.check()} (channel ${channel})`);
  };

  if (__PL_BRIDGE__) {
    // the bridge page: the old background flow only, so the bridge itself can be rolled back or replaced
    void booted.then(backgroundCheck);
    void App.addListener('resume', backgroundCheck);
    return;
  }

  // ---- the update gate (gate.ts) -----------------------------------------------------------------------------
  const gatePlatform = mac ? 'mac' : otaPlatform;
  const nativeVersion = App.getInfo().then((i) => String(i.version ?? ''), () => '');
  const query = async (): Promise<ClientPolicyQuery> => {
    const native = await nativeVersion;
    return {
      platform: gatePlatform,
      compat: __PL_STAMP__.compat,
      channel,
      bundle: __PL_STAMP__.version,
      seq: __PL_STAMP__.seq,
      sim: __PL_STAMP__.simVersion,
      ...(/^[0-9]{1,4}(\.[0-9]{1,4}){0,2}$/.test(native) ? { native } : {}),
    };
  };
  const ready = () => document.documentElement.dataset.ready === '1';
  const gate = new Gate({
    doc: document,
    policy: async () =>
      fetchPolicy({
        getJson,
        // the dev channel (Debug builds) asks only its local server's policy.json (scripts/ota-local.mjs)
        apiUrl: channel === 'dev' ? null : `${__PL_API_ORIGIN__}/pawlegends/client-policy`,
        mirrorUrl: ota_ ? `${channel === 'dev' ? __PL_LOCAL_UPDATES_URL__ : __PL_UPDATES_URL__}/${otaPlatform}/${__PL_STAMP__.compat}/policy.json` : null,
        query: await query(),
        spkiPem: __PL_SPKI__,
        kv,
        now: () => Date.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      }),
    offline: () => offlineVerdict(readCache(kv), { platform: gatePlatform, compat: __PL_STAMP__.compat, sim: __PL_STAMP__.simVersion }, Date.now()),
    ota: ota_,
    ready: () => booted,
    atTitle: () => !ready() || safeToApply(gameState()),
    onOk: () => void booted.then(backgroundCheck),
    kv,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    version: __PL_STAMP__.version,
    platform: gatePlatform,
    storeUrl: CLIENT_POLICY_STORE_URLS[gatePlatform],
    webUrl: CLIENT_POLICY_WEB_URL,
    // Capacitor hands a navigation to another site to the system (Safari, the App Store, Google Play)
    openUrl: (url) => window.location.assign(url),
    onOnline: (cb) => {
      window.addEventListener('online', cb);
      return () => window.removeEventListener('online', cb);
    },
    log: (m) => console.info(`${m} (channel ${channel})`),
  });
  whenBody(() => void gate.run('boot'));

  // the game came back to the title (from a match, results or a party): a check owed to it, or one every 5 minutes
  new MutationObserver(() => {
    if (!ready() || document.documentElement.dataset.screen !== 'title' || !safeToApply(gameState())) return;
    if (gate.owed || Date.now() - gate.lastRun >= GATE_RESUME_EVERY_MS) void gate.run('title');
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });

  // the game says the server refused this version (a save, the relay): check on the title, unthrottled
  window.addEventListener('pl:update-required', () => {
    gate.owe();
    if (ready() && safeToApply(gameState())) void gate.run('required');
  });
  window.addEventListener('pl:update-check', () => {
    if (ready() && safeToApply(gameState()) && Date.now() - gate.lastRun >= 60_000) void gate.run('check');
  });

  void App.addListener('resume', async () => {
    if (ready() && safeToApply(gameState()) && (gate.owed || gate.blocking || Date.now() - gate.lastRun >= GATE_RESUME_EVERY_MS)) {
      void gate.run('resume');
      return;
    }
    if (gate.blocking) return;
    await backgroundCheck();
  });
}

try {
  start();
} catch (e) {
  console.warn('[shell] not started', e);
}
