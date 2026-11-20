/**
 * The visitor's coarse country for PostHog (docs/plans/moba/POSTHOG-PRIVACY.md): PostHog's GeoIP stays off
 * (`$geoip_disable`) and its IP capture can be discarded, so every event carries our own `country` instead, the
 * ISO 3166-1 alpha-2 code the game already uses for the player's flag. Sources, in order: the game's own flag cache on
 * this origin (`pl.flag`, written by pawlegends/src/social/flags.ts, kept whether or not the flag is shown), this tab's
 * earlier answer, then the backend's `GET /pawlegends/flag/here` (Cloudflare's `cf-ipcountry`; nothing stored, no IP
 * read). Asked only once analytics loads, i.e. after consent. Unknown: no `country` at all, never a guess from locale.
 */

/** The game's flag cache (pawlegends/src/social/flags.ts CACHE_KEY) and its freshness (CACHE_MS). */
export const GAME_FLAG_KEY = "pl.flag";
const GAME_FLAG_MS = 12 * 3_600_000;
/** sessionStorage: this tab's answer, so each page does not ask again. */
export const COUNTRY_SESSION_KEY = "pawlegends.analytics-country.v1";
/** Longest wait for the backend before analytics starts without a country. */
export const COUNTRY_TIMEOUT_MS = 1500;

/** A real ISO country code (Cloudflare's XX unknown and T1 Tor are not), or null. Pure. */
export function cleanCountry(v: unknown): string | null {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : null;
}

type KV = Pick<Storage, "getItem" | "setItem">;
type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

let known: string | null = null;

/** The country events carry now (null: none). */
export function currentCountry(): string | null {
  return known;
}

/** Tests: forget the known country. */
export function setCountryForTests(cc: string | null): void {
  known = cleanCountry(cc);
}

const safe = <T,>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** The game's cached flag country when fresh, else null. Pure over its input. */
export function gameFlagCountry(raw: string | null, nowMs: number): string | null {
  if (!raw) return null;
  const v = safe(() => JSON.parse(raw) as { cc?: unknown; at?: unknown } | null);
  if (!v || typeof v.at !== "number" || nowMs - v.at >= GAME_FLAG_MS) return null;
  return cleanCountry(v.cc);
}

export interface LoadCountryOptions {
  apiBase?: string | null;
  fetch?: FetchLike | null;
  local?: KV | null;
  session?: KV | null;
  now?: () => number;
  timeoutMs?: number;
}

/** Find the country once (see the file comment); never throws, never waits longer than `timeoutMs`. */
export async function loadCountry(o: LoadCountryOptions = {}): Promise<string | null> {
  const local = o.local === undefined ? safe(() => window.localStorage) : o.local;
  const session = o.session === undefined ? safe(() => window.sessionStorage) : o.session;
  const now = o.now ?? Date.now;
  const fromGame = gameFlagCountry(safe(() => local?.getItem(GAME_FLAG_KEY) ?? null), now());
  const fromTab = cleanCountry(safe(() => session?.getItem(COUNTRY_SESSION_KEY)));
  if (fromGame || fromTab) return (known = fromGame ?? fromTab);
  const base = (o.apiBase ?? process.env.NEXT_PUBLIC_BE_URL ?? "").replace(/\/+$/, "");
  const fetcher = o.fetch === undefined ? safe(() => globalThis.fetch?.bind(globalThis) as unknown as FetchLike) : o.fetch;
  if (!base || !fetcher) return known;
  const ctrl = safe(() => new AbortController());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = fetcher(`${base}/pawlegends/flag/here`, { method: "GET", credentials: "omit", cache: "no-store", signal: ctrl?.signal })
      .then(async (r) => (r.ok ? cleanCountry(((await r.json()) as { cc?: unknown } | null)?.cc) : null))
      .catch(() => null);
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ctrl?.abort();
        resolve(null);
      }, o.timeoutMs ?? COUNTRY_TIMEOUT_MS);
    });
    const cc = await Promise.race([answer, late]);
    if (cc) {
      known = cc;
      safe(() => session?.setItem(COUNTRY_SESSION_KEY, cc));
    }
  } catch {
    // no country rather than no analytics
  } finally {
    if (timer) clearTimeout(timer);
  }
  return known;
}

type CaptureLike = { event?: string; properties?: Record<string, unknown>; $set?: Record<string, unknown> } | null;

/**
 * `before_send`: our `country` on every event (an event prop of that name never passes), and on the person
 * (`$set`) only when PostHog processes a person for it (a signed-in, identified player). Pure apart from `cr`.
 */
export function addCountry<T extends CaptureLike>(cr: T, cc: string | null = known): T {
  if (!cr || !cr.properties || typeof cr.properties !== "object") return cr;
  const code = cleanCountry(cc);
  if (!code) {
    delete cr.properties.country;
    return cr;
  }
  cr.properties.country = code;
  if (cr.properties.$process_person_profile === true || cr.event === "$identify") cr.$set = { ...(cr.$set ?? {}), country: code };
  return cr;
}
