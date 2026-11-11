import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Pawlegends iOS and Android apps (docs/plans/moba/APP-STORE.md "Architecture", docs/plans/moba/PLAY-STORE.md). A
 * standalone Capacitor project: the existing Token Tails app (client/, com.tokentails.app) is separate and untouched.
 *
 * Served from capacitor://localhost on iOS and https://localhost on Android (no server.url, no hostname): the bundled
 * game plays offline, and the backend allows both origins for REST and the party relay
 * (backend/src/shared/cors-origins.ts). Never change androidScheme or hostname after the first Play release: the
 * origin would change and wipe the players' localStorage (settings, quality tier, OTA state, party key).
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
  server: {
    // Capacitor's Android default, pinned (see above). The Token Tails app uses http; this app does not.
    androidScheme: 'https',
  },
  ios: {
    backgroundColor: BACKGROUND,
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
    // the game is touch-first; zoom gestures are blocked in the page too (app/noZoom.ts)
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: BACKGROUND,
    // MainActivity hides the system bars (immersive) and pads the WebView by the display cutout itself
    adjustMarginsForEdgeToEdge: 'disable',
    allowMixedContent: false,
    captureInput: false,
    // WebGL 2 and the game's JS need a current Chromium WebView; older ones get Capacitor's "update WebView" page
    minWebViewVersion: 110,
    zoomEnabled: false,
  },
  plugins: {
    // Sign-in (src/host/auth.ts): Google and Apple run natively and hand their ID token to the Firebase JS SDK, which
    // holds the session (skipNativeAuth), exactly as the Token Tails app does. Email runs in the JS SDK only.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['apple.com', 'google.com'],
    },
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
