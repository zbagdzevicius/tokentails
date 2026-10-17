/**
 * Composition root. Wires every lane through GameServices, then hands control to the UI router. A lane that throws
 * while building its service object shows the fallback card instead of a blank page.
 *
 * Server features are on whenever the game has an API origin (VITE_BADCAT_API_URL, else https://api.tokentails.com
 * on tokentails.com): money and the Phase 2 online services then follow GET /badcat/status. A standalone or local
 * build without that answers locally with zero requests. Analytics send nothing without VITE_BADCAT_POSTHOG_KEY
 * plus consent.
 */
import type { GameServices, PlatformApi } from './types';
import { sim } from './sim';
import { content } from './content';
import { codec } from './codec';
import { render } from './render';
import { createAudio } from './audio';
import { catMaker } from './catmaker';
import { createPlatform } from './platform';
import { progress } from './progress';
import { createMoney, defaultMoneyDeps, type MoneyApiX } from './money';
import { meta } from './meta';
import { createOnline } from './online';
import { startApp } from './ui';

function fallback(root: HTMLElement, err: unknown): void {
  root.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;text-align:center;padding:16px">' +
    '<div><h1 style="margin:0 0 8px">Bad Cat Daily</h1><p style="opacity:.7">Under construction.</p></div></div>';
  if (import.meta.env.DEV) console.warn(err);
}

/** Money on the same store, env, session id and A/B arm as the platform (one source for each). */
function moneyFor(platform: PlatformApi): MoneyApiX | undefined {
  try {
    return createMoney(
      defaultMoneyDeps({
        env: platform.env,
        store: platform.store,
        track: (e, p) => platform.track(e, p),
        ...(platform.sessionId ? { sessionId: () => platform.sessionId!() } : {}),
        ...(platform.abArm ? { abArm: () => platform.abArm!() } : {}),
      }),
    );
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[bad-cat] money unavailable', err);
    return undefined;
  }
}

/** Phase 2 online services: zero requests without an API origin. */
function onlineFor(platform: PlatformApi): GameServices['online'] {
  try {
    return createOnline({ env: platform.env, store: platform.store });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[bad-cat] online unavailable', err);
    return undefined;
  }
}

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const platform = createPlatform();
    const services: GameServices = {
      platform,
      content,
      codec,
      sim,
      render,
      createAudio,
      catMaker,
      loadShare: () => import('./share').then((m) => m.share),
      progress,
      money: moneyFor(platform),
      // wave 2: meta screens (archive, Rap Sheet, season, settings, friends, weekly, consent, my rooms) and the
      // Room Maker, which stays in its own lazy chunk
      meta,
      loadEditor: () => import('./editor').then((m) => m.editor),
      // Phase 2: accounts, ranked saves, boards, short links, the room feed, live data, push (server status decides)
      online: onlineFor(platform),
    };
    // PWA: asset cache + Add to Home Screen capture (skipped in dev, in-app browsers and without SW support).
    try {
      platform.registerServiceWorker?.();
    } catch {
      /* the game works without it */
    }
    startApp(root, services);
  } catch (err) {
    fallback(root, err);
  }
}

boot();
