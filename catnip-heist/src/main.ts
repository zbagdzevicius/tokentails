/**
 * Catnip Heist entry point.
 *
 * URL params:
 *   ?embed=1              inside the /heist host page (src/embed): seed 1, host insets and progress,
 *                         runs go to the host for saving; ignored when not in a frame
 *   ?qa=1                 install window.__heist QA hooks (always on in dev; only in QA builds)
 *   ?seed=<n>             sim seed (default 1; always 1 in embed mode)
 *   ?controls=grid        arrows move along the grid instead of screen directions
 *   ?shadows=0            disable real-time shadows
 *   ?level=heist-03       level for ?replay=solution and for the first run (default heist-01)
 *   ?replay=solution|last watch the bundled solution or your last finished run (embed: needs qa=1)
 *   ?speed=<n>            replay speed multiplier
 *   ?screen=yard|pick|levels  open straight onto a screen
 *
 * Build flags:
 *   VITE_HEIST_BUILD=replay|verify  leaves the crash fallback, the crash report and product
 *                                   analytics out (G13-H, F9)
 *   VITE_POSTHOG_KEY, VITE_POSTHOG_HOST  where consented crash reports and events go; unset sends nothing
 *   VITE_HEIST_QA=1                 a QA build: `?qa=1` installs window.__heist. Without it (every
 *                                   production build) the QA module is not in the bundle at all, so
 *                                   no URL or devtools call can play a bundled solution as a real,
 *                                   saveable run. Set only for E2E and QA builds.
 */
import { ASSET_BASE, DEPLOYMENTS_URL } from './types';
import { loadManifest } from './render/voxel/sheets';
import { LEVEL_IDS, getSolution } from './levels';
import { App } from './app/App';
import type { ControlScheme } from './app/controls';
import { QA_BUILD } from './app/qa-build';
import type { CrashGuard } from './app/crash';
import type { HeistAnalytics } from './analytics';
import { installEmbed, readLaunchParams, type EmbedController } from './embed';
import { wantsPayoutsDeepLink } from './ui/shelter-payouts';
import { TESTNET_DEPLOYMENTS_URL, prefetchShelterPayouts } from './ui/payouts';
import { isWebHost } from './ui/rail';

/**
 * Vite replaces these at build time, so in replay and verify builds the
 * crash branch below is dead code and `./app/crash` is never bundled.
 */
const CRASH_FALLBACK_BUILD =
  import.meta.env.VITE_HEIST_BUILD !== 'replay' && import.meta.env.VITE_HEIST_BUILD !== 'verify';

function storage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

async function installCrash(): Promise<CrashGuard | null> {
  if (!CRASH_FALLBACK_BUILD) return null;
  try {
    const { installCrashGuard, posthogSender } = await import('./app/crash');
    const session = storage('sessionStorage');
    return installCrashGuard({
      win: window,
      doc: document,
      localStorage: storage('localStorage'),
      sessionStorage: session,
      // Watching a replay is not a player session: nothing is reported.
      reporting: !new URLSearchParams(location.search).has('replay'),
      send: posthogSender({
        apiKey: import.meta.env.VITE_POSTHOG_KEY,
        host: import.meta.env.VITE_POSTHOG_HOST,
        sessionStorage: session,
        // text/plain is CORS-safelisted, so the beacon needs no preflight (an
        // application/json Blob would make a credentialed CORS request that
        // PostHog can refuse). PostHog parses the JSON body either way.
        beacon: (url, body) => navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' })) ?? false,
      }),
    });
  } catch {
    return null;
  }
}

const crashGuard = installCrash();

/** Drop a handled `#payouts` from the URL (no reload, no history entry). */
function clearPayoutsHash(): void {
  if (!/^#payouts$/i.test(location.hash)) return;
  try {
    history.replaceState(history.state, '', location.pathname + location.search);
  } catch {
    /* sandboxed frame: leave the hash */
  }
}

const framed = (() => {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
})();
const launch = readLaunchParams(location.search, framed);

/**
 * The "Sent to shelters" modal is web-only (ui.ts) and reads the payout index, then the newest
 * blocks. Its reads start ahead of it, so the modal paints from them when it opens: a `?payouts` /
 * `#payouts` link starts them now, before the game loads; otherwise they start once the title is up.
 */
const payoutsWeb = isWebHost(window as never) && !!DEPLOYMENTS_URL && !launch.replay;
if (payoutsWeb && wantsPayoutsDeepLink(location)) prefetchShelterPayouts(DEPLOYMENTS_URL, TESTNET_DEPLOYMENTS_URL);

/** The title is up: read the payouts while the player looks at it (idle time, off the first frames). */
function prefetchPayoutsSoon(): void {
  if (!payoutsWeb) return;
  const run = () => prefetchShelterPayouts(DEPLOYMENTS_URL);
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else setTimeout(run, 1000);
}

/** Product analytics (F9), same build gate as the crash module: never in replay or verify builds. */
async function installAnalytics(): Promise<HeistAnalytics | null> {
  if (!CRASH_FALLBACK_BUILD) return null;
  try {
    const { createHeistAnalytics, beaconTransport } = await import('./analytics');
    return createHeistAnalytics({
      apiKey: import.meta.env.VITE_POSTHOG_KEY,
      host: import.meta.env.VITE_POSTHOG_HOST,
      localStorage: storage('localStorage'),
      sessionStorage: storage('sessionStorage'),
      transport: beaconTransport(navigator, window.fetch?.bind(window)),
      superProperties: { embed: launch.embed },
    });
  } catch {
    return null;
  }
}

const analytics = installAnalytics();

/**
 * Feeds App's frame time to the crash guard's heartbeat, so a frozen heist
 * (not a one-off error: App.frame keeps scheduling) shows the fallback.
 */
async function watchFrames(app: App): Promise<void> {
  const guard = await crashGuard;
  guard?.watch(() => app.lastFrameAt);
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const q = new URLSearchParams(location.search);
  const manifest = await loadManifest(ASSET_BASE);
  const levelParam = q.get('level');
  const levelId = levelParam && LEVEL_IDS.includes(levelParam) ? levelParam : LEVEL_IDS[0];
  let embed: EmbedController | null = null;
  let firstSession = false;
  let titleUp = false;
  let autoPicked = false;
  const autoPick = () => {
    if (autoPicked || !firstSession || !titleUp) return;
    autoPicked = true;
    if (app.screen === 'title' && app.progress.isFresh()) app.ui.showCatPick();
  };
  const app = new App({
    root,
    manifest,
    base: ASSET_BASE,
    levelId,
    seed: launch.seed,
    controls: (q.get('controls') === 'grid' ? 'grid' : 'screen') as ControlScheme,
    replaySpeed: Number(q.get('speed')) || 1,
    shadows: q.get('shadows') !== '0',
    embed: launch.embed ? { onExit: () => embed?.exit(), onSignIn: () => embed?.requestSignIn() } : undefined,
    // First-run funnel (G10): the same consent-gated instance, so it is absent from replay and verify builds.
    analytics,
    onRunComplete: (run) => {
      embed?.runComplete(run);
      void analytics.then((a) => a?.track('heist_run_complete', { level: run.levelId, outcome: run.won ? 'win' : 'fail', stars: run.stars }));
    },
  });
  if (launch.embed) {
    root.dataset.embed = '1';
    // A first-time player (no local progress, and none from the account in the first session)
    // goes straight to the crew pick, so `/heist` is START then playing level 1 (plan G2: landing
    // to the first playable level in 3 taps). Anyone with progress keeps the title.
    // The first session can arrive before the title is up, so this runs once both happened.
    embed = installEmbed(window, window.parent, document, () => app, () => {
      firstSession = true;
      autoPick();
    });
  } else {
    // In embed mode the host page sends heist_open with where the player came from.
    void analytics.then((a) => a?.trackOnce('heist_open', { from: 'standalone' }));
  }
  if (QA_BUILD && (import.meta.env.DEV || launch.qa)) {
    const { installQA } = await import('./app/qa');
    installQA(app);
  }
  void watchFrames(app);

  const replay = launch.replay;
  const log = replay === 'solution' ? getSolution(levelId) : replay === 'last' ? app.lastReplay() : null;
  if (log) {
    try {
      await app.startRun([log.catIds[0], log.catIds[1]], log);
      root.dataset.ready = '1';
      return;
    } catch (e) {
      console.warn('replay could not start, showing the title instead', e);
      app.toMenu(false);
      app.showTitle();
      root.dataset.ready = '1';
      return;
    }
  }
  app.showTitle();
  const screen = q.get('screen');
  if (screen === 'pick') app.ui.showCatPick();
  else if (screen === 'yard') app.openYard();
  else if (screen === 'levels') app.openLevels();
  else if (wantsPayoutsDeepLink(location)) {
    // ?payouts or #payouts: the "Sent to shelters" modal over the title (no crew-pick jump).
    autoPicked = true;
    app.ui.showPayouts();
    clearPayoutsHash();
  } else if (launch.embed) {
    titleUp = true;
    autoPick();
  }
  prefetchPayoutsSoon();
  // A #payouts link followed while the game is open opens the modal too. The hash is dropped
  // once handled, so following the same link again still fires hashchange.
  window.addEventListener('hashchange', () => {
    if (!wantsPayoutsDeepLink({ hash: location.hash })) return;
    app.ui.showPayouts();
    clearPayoutsHash();
  });
  root.dataset.ready = '1';
}

boot().catch(async (e) => {
  console.error(e);
  const guard = await crashGuard;
  if (guard) {
    guard.crash(e);
    return;
  }
  // Replay and verify builds (no crash module): show the error for the developer.
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#FF7AA2;position:fixed;inset:auto 16px 16px;white-space:pre-wrap';
  pre.textContent = String(e);
  document.body.appendChild(pre);
});
