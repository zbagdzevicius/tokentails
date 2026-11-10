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
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { channelOf, manifestUrl, otaPlatformOf, type BundleStamp } from './manifest';
import { handleBack } from './back';
import { installVibrate } from './haptics';
import { Ota, takesOtaUpdates, type KV } from './ota';

declare const __PL_STAMP__: BundleStamp;
declare const __PL_SPKI__: string;
declare const __PL_UPDATES_URL__: string;
declare const __PL_LOCAL_UPDATES_URL__: string;

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

function start(): void {
  if (!Capacitor.isNativePlatform()) return;
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

  // set by the native shell before any page script (GameViewController.swift, MainActivity.java): stable, beta
  // (TestFlight) or dev (Debug builds)
  const channel = channelOf((window as unknown as { __PL_CHANNEL__?: unknown }).__PL_CHANNEL__);
  const ota = new Ota({
    updater: CapacitorUpdater,
    getJson: async (url) => {
      const r = await CapacitorHttp.get({ url, headers: { accept: 'application/json' }, responseType: 'json', connectTimeout: 8000, readTimeout: 8000 });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    },
    stamp: __PL_STAMP__,
    nativeVersion: async () => (await App.getInfo()).version,
    manifestUrl: manifestUrl(channel, __PL_UPDATES_URL__, __PL_LOCAL_UPDATES_URL__, __PL_STAMP__.compat, otaPlatformOf(Capacitor.getPlatform())),
    platform: otaPlatformOf(Capacitor.getPlatform()),
    allowLocal: channel === 'dev',
    spkiPem: __PL_SPKI__,
    kv: storage(),
    gameState: () => ({ screen: document.documentElement.dataset.screen, partyOpen: !!document.querySelector('.pl-party'), partySeat: partySeat() }),
    now: () => Date.now(),
    log: (m) => console.info(`${m} (channel ${channel})`),
  });

  // the Mac app never downloads game files (Mac App Store guideline 2.4.5): it only settles the boot watchdog
  if (!takesOtaUpdates(platform)) {
    void whenReady().then(() => ota.booted());
    console.info(`[ota] ${__PL_STAMP__.version}: no over-the-air updates on this platform (${String(platform)})`);
    return;
  }

  void whenReady().then(async () => {
    await ota.booted();
    // a bundle downloaded last session: swap now, on the cold-start title (a short reload behind the splash colour)
    if (await ota.applyIfSafe()) return;
    console.info(`[ota] ${__PL_STAMP__.version}: check ${await ota.check()} (channel ${channel})`);
  });

  void App.addListener('resume', async () => {
    if (await ota.applyIfSafe()) return;
    console.info(`[ota] ${__PL_STAMP__.version}: check ${await ota.check()} (channel ${channel})`);
  });
}

try {
  start();
} catch (e) {
  console.warn('[shell] not started', e);
}
