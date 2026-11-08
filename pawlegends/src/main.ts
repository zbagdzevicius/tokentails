/**
 * Boot (POC.md §3): crash overlay, no-zoom touch guards (app/noZoom.ts), embed handshake, then the app (quality
 * probe, renderer, lobby, title → pick → match → results). The match runs the sim in the LocalHost Worker (src/host/).
 */
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
  // embedded: the crash panel's "Back to games" leaves through the host (no host close button any more)
  if (bridge.active) setCrashExit(() => bridge.post('exit'));
  const app = document.getElementById('app');
  if (!app) throw new Error('no #app element');
  new App(app, bridge);
}

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
