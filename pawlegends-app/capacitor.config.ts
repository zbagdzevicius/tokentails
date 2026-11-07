import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Pawlegends iOS app (docs/plans/moba/APP-STORE.md "Architecture"). A standalone Capacitor project: the existing
 * Token Tails app (client/, com.tokentails.app) is separate and untouched.
 *
 * Served from capacitor://localhost (no server.url, no hostname): the bundled game plays offline, and the backend
 * already allows this origin for REST and the party relay (backend/src/shared/cors-origins.ts).
 */

/** The game's background (pawlegends/index.html --bg). Painted behind the WebView until the first frame. */
export const BACKGROUND = '#2b1d2e';

const publicKey = readFileSync(join(__dirname, 'ota/public-key.pem'), 'utf8').trim();

const config: CapacitorConfig = {
  appId: 'com.tokentails.pawlegends',
  appName: 'Pawlegends',
  webDir: 'www',
  backgroundColor: BACKGROUND,
  loggingBehavior: 'debug',
  ios: {
    backgroundColor: BACKGROUND,
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
    // the game is touch-first; zoom gestures are blocked in the page too (app/noZoom.ts)
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Manual self-hosted updates (src/shell/ota.ts): no Capgo cloud, no stats, no device id sent anywhere.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      channelUrl: '',
      updateUrl: '',
      appReadyTimeout: 30000,
      responseTimeout: 30,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: true,
      allowModifyUrl: false,
      allowSetDefaultChannel: false,
      allowPreview: false,
      shakeMenu: false,
      nativeUpdatePrompt: false,
      publicKey,
    },
  },
};

export default config;
