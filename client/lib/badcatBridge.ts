/**
 * Bad Cat Daily accounts (GDD 10 Phase 2): the token bridge between the game (a static build served top level at
 * /badcat) and the Token Tails Firebase session. The game embeds `/badcat-account?bridge=1&origin=<its origin>` in a
 * hidden iframe and asks it for a fresh ID token before an API call; the token goes out as the lowercase
 * `accesstoken` header with the `fb` prefix. `/badcat-account?return=<game url>` is the visible sign-in page.
 *
 * Pure helpers here (tested in __test__/badcat-bridge.test.ts); the page is pages/badcat-account.tsx. The bridge
 * answers only origins this function accepts, and only with `postMessage` to that exact origin.
 */

export const BADCAT_AUTH_CHANNEL = "tt-badcat-auth";
export const BADCAT_AUTH_VERSION = 1;

/** Messages the game sends to the bridge. */
export type BadcatAuthRequest =
  | { channel: typeof BADCAT_AUTH_CHANNEL; v: number; type: "hello" }
  | { channel: typeof BADCAT_AUTH_CHANNEL; v: number; type: "getToken"; id: number }
  | { channel: typeof BADCAT_AUTH_CHANNEL; v: number; type: "signOut" };

/** Messages the bridge sends to the game. */
export type BadcatAuthMessage =
  | {
      channel: typeof BADCAT_AUTH_CHANNEL;
      v: number;
      type: "session";
      signedIn: boolean;
      guest: boolean;
      verified: boolean;
    }
  | { channel: typeof BADCAT_AUTH_CHANNEL; v: number; type: "token"; id: number; token: string | null };

/**
 * Origins the bridge talks to: this site's own origin, any https tokentails.com host, and in development the game's
 * Vite servers (localhost 5174-5179). Anything else gets no answer.
 */
export function isAllowedGameOrigin(origin: string | null | undefined, selfOrigin: string, dev: boolean): boolean {
  if (!origin || typeof origin !== "string") return false;
  if (origin === selfOrigin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (url.protocol === "https:" && (url.hostname === "tokentails.com" || url.hostname.endsWith(".tokentails.com"))) {
    return !url.port;
  }
  if (dev && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    const port = Number(url.port);
    return port >= 5174 && port <= 5179;
  }
  return false;
}

/**
 * Where the visible sign-in page sends the player back to: a /badcat page on an allowed origin, else /badcat on
 * this site. Never an outside site (no open redirect).
 */
export function safeReturnUrl(raw: string | null | undefined, selfOrigin: string, dev: boolean): string {
  const fallback = `${selfOrigin}/badcat`;
  if (!raw || typeof raw !== "string" || raw.length > 4000) return fallback;
  let url: URL;
  try {
    url = new URL(raw, selfOrigin);
  } catch {
    return fallback;
  }
  if (!isAllowedGameOrigin(url.origin, selfOrigin, dev)) return fallback;
  if (url.username || url.password) return fallback;
  const devGame = dev && url.origin !== selfOrigin;
  if (!devGame && !/^\/badcat(\/|$)/.test(url.pathname)) return fallback;
  return url.toString();
}

export function isAuthRequest(data: unknown): data is BadcatAuthRequest {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.channel !== BADCAT_AUTH_CHANNEL || typeof d.v !== "number") return false;
  if (d.type === "hello" || d.type === "signOut") return true;
  return d.type === "getToken" && Number.isInteger(d.id);
}

export const sessionMessage = (signedIn: boolean, guest: boolean, verified: boolean): BadcatAuthMessage => ({
  channel: BADCAT_AUTH_CHANNEL,
  v: BADCAT_AUTH_VERSION,
  type: "session",
  signedIn,
  guest,
  verified,
});

export const tokenMessage = (id: number, token: string | null): BadcatAuthMessage => ({
  channel: BADCAT_AUTH_CHANNEL,
  v: BADCAT_AUTH_VERSION,
  type: "token",
  id,
  token: token ? (token.startsWith("fb") ? token : `fb${token}`) : null,
});
