/**
 * `www/host.js` (sign-in): the app's in-page host, a deferred classic script after the game (scripts/build-web.mjs).
 * The shell (`shell.js`, before the game) already installed the channel (`window.__PL_HOST__` for the game,
 * `window.__PL_HOST_CHANNEL__` for this script); the game waits for the host's `hello`, so loading this after the
 * game costs the first frame nothing. Native only: on any other page it does nothing.
 *
 * Firebase failing to start (storage blocked, a broken WebView) must never stop the game: the host then runs with
 * no sign-in (`NoAuth`), the game plays signed out and the sheet says sign-in is unavailable.
 */
import { Capacitor } from "@capacitor/core";
import { HostApi } from "./api";
import { createFirebaseAuth, nativeCaps, NativeAuth, platformOf, type AuthOutcome, type AuthPort, type NativeCaps } from "./auth";
import { CHANNEL_GLOBAL, type HostChannel } from "./channel";
import { startNativeHost } from "./nativeHost";
import { DomHostUi, UNAVAILABLE_CODE } from "./sheet";

declare const __PL_API_ORIGIN__: string;

const unavailable = (): Promise<AuthOutcome> => Promise.resolve({ kind: "error", error: { code: UNAVAILABLE_CODE } });

/** Sign-in that never works (Firebase could not start): the game still gets its `hello` and plays signed out. */
export class NoAuth implements AuthPort {
  constructor(readonly caps: NativeCaps = { apple: false, google: false }) {}
  current() {
    return null;
  }
  onChange() {
    return () => undefined;
  }
  async token() {
    return null;
  }
  async ensureGuest() {
    return false;
  }
  oauth = unavailable;
  createEmail = unavailable;
  signInEmail = unavailable;
  async reset() {
    throw { code: UNAVAILABLE_CODE };
  }
  async resend() {}
  async checkVerified() {
    return false;
  }
  async linkPending() {
    return false;
  }
  async signOut() {}
  async appleCode() {
    return undefined;
  }
}

function boot(): void {
  const w = window as unknown as Record<string, unknown>;
  const channel = w[CHANNEL_GLOBAL] as HostChannel | undefined;
  if (!channel || !Capacitor.isNativePlatform()) return;
  const platform = platformOf(w);
  const caps = nativeCaps(w, platform, Capacitor.isPluginAvailable("FirebaseAuthentication"));
  let auth: AuthPort;
  try {
    auth = new NativeAuth(createFirebaseAuth(), caps);
  } catch (e) {
    console.warn("[host] sign-in unavailable", e);
    auth = new NoAuth();
  }
  const online = () => navigator.onLine !== false;
  const api = new HostApi({
    origin: __PL_API_ORIGIN__,
    fetch: (input, init) => fetch(input, init),
    token: () => auth.token(),
    isAccount: () => {
      const u = auth.current();
      return !!u && !u.isAnonymous;
    },
    ensureUser: () => auth.ensureGuest(online()),
  });
  startNativeHost({ channel, auth, api, ui: new DomHostUi(document, platform, caps), platform, online });
  console.info(`[host] up (${platform}; apple ${caps.apple}, google ${caps.google})`);
}

try {
  boot();
} catch (e) {
  console.warn("[host] not started", e);
}
