/**
 * The app shell script (`www/shell.js`, a classic script loaded before the game in index.html by
 * scripts/build-web.mjs). Native only: on any other page it does nothing.
 *
 * - haptics: a `navigator.vibrate` backed by the Taptic Engine (haptics.ts);
 * - OTA: notifyAppReady once the title is up, update checks on launch and resume, apply on the title (ota.ts).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import type { BundleStamp } from './manifest';
import { installVibrate } from './haptics';
import { Ota, type KV } from './ota';

declare const __PL_STAMP__: BundleStamp;
declare const __PL_SPKI__: string;
declare const __PL_MANIFEST_URL__: string;

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
  const styles = { LIGHT: ImpactStyle.Light, MEDIUM: ImpactStyle.Medium, HEAVY: ImpactStyle.Heavy } as const;
  installVibrate(navigator, { impact: (o) => Haptics.impact({ style: styles[o.style] }) });

  const ota = new Ota({
    updater: CapacitorUpdater,
    getJson: async (url) => {
      const r = await CapacitorHttp.get({ url, headers: { accept: 'application/json' }, responseType: 'json', connectTimeout: 8000, readTimeout: 8000 });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    },
    stamp: __PL_STAMP__,
    nativeVersion: async () => (await App.getInfo()).version,
    manifestUrl: __PL_MANIFEST_URL__,
    spkiPem: __PL_SPKI__,
    kv: storage(),
    gameState: () => ({ screen: document.documentElement.dataset.screen, partyOpen: !!document.querySelector('.pl-party'), partySeat: partySeat() }),
    now: () => Date.now(),
    log: (m) => console.info(m),
  });

  void whenReady().then(async () => {
    await ota.booted();
    // a bundle downloaded last session: swap now, on the cold-start title (a short reload behind the splash colour)
    if (await ota.applyIfSafe()) return;
    await ota.check();
  });

  void App.addListener('resume', async () => {
    if (await ota.applyIfSafe()) return;
    await ota.check();
  });
}

try {
  start();
} catch (e) {
  console.warn('[shell] not started', e);
}
