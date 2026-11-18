/**
 * Boot (POC.md §3): crash overlay, no-zoom touch guards (app/noZoom.ts), embed handshake, then the app (quality
 * probe, renderer, lobby, title → pick → match → results). The match runs the sim in the LocalHost Worker (src/host/).
 */
// v6 Lightning Rivalry tokens first: every screen's CSS (pulled in by the app graph below) reads them
import './ui/theme/v6.css';
import { App } from './app/app';
import { installCrashOverlay, reportCrash, setCrashExit, setCrashHook, showCrash } from './app/crash';
import { createAnalytics } from './analytics/posthog';
import { SIM_VERSION } from './sim/version';
import { installNoZoom } from './app/noZoom';
import { installBridge } from './embed/bridge';
import { inAppShell, shellPlatform } from './app/platform';
import { lockAppBuild } from './meta/roster';
import './ui/ui.css';

function boot(): void {
  // the App Store build (docs/plans/moba/APP-STORE.md): no purchase links, starter and redeemed cats only
  if (inAppShell()) {
    lockAppBuild();
    // html[data-shell] = mac | ios: the native app the page runs in (the Mac app keeps the desktop HUD)
    document.documentElement.dataset.shell = shellPlatform() ?? '';
  }
  installCrashOverlay();
  installNoZoom();
  const bridge = installBridge();
  // embedded: the crash panel's "Back to games" leaves through the host (no host close button any more); the app's
  // in-page host has no games page to go back to
  if (bridge.kind === 'frame') setCrashExit(() => bridge.post('exit'));
  const app = document.getElementById('app');
  if (!app) throw new Error('no #app element');
  new App(app, bridge);
  // gaps5: the coat part builders are their own chunk (render/chars/coatParts.ts); fetch them once the first screen is up
  setTimeout(() => void import('./render/chars/coatParts').then((m) => m.loadCoatParts()), 1500);
}

// the boot loading screen (src/boot/comicBoot.js): the first-load JS has run, the bar jumps to at least 70 %
const bootWin = window as { __plBoot?: (pct: number) => void; __plBootArt?: (capMs: number) => Promise<void> };
bootWin.__plBoot?.(70);

function start(): void {
  try {
    boot();
  } catch (e) {
    // The App never set its crash hook: a boot crash goes out through a bare, consent-gated analytics (R1).
    const analytics = createAnalytics(() => ({}));
    setCrashHook((source, msg) => {
      analytics.track('app_error', { source, msg, screen: 'boot', tier: 'none', sim: SIM_VERSION });
      analytics.flush();
    });
    reportCrash('boot', e);
    showCrash(e);
  }
}

// The loading screen's champion pictures paint before the app's first heavy frame (shaders, the title scene: a
// main-thread block of ~1.7 s on a desktop), or they could only appear as the title came up (live check Nov 18). At
// most BOOT_ART_WAIT_MS, nothing when they are already in (a slow connection) or offline (they fail at once).
const BOOT_ART_WAIT_MS = 450;
if (bootWin.__plBootArt) bootWin.__plBootArt(BOOT_ART_WAIT_MS).then(start, start);
else start();
