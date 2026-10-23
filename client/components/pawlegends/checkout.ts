/**
 * The Pawlegends `pl_*` store client and the offer API, host side (POC.md §8.2, §8.3).
 *
 * Since the Token Tails integration the game sells nothing itself: its one card is "Meet <cat>", which opens the
 * Token Tails $5 named-cat checkout (`PawlegendsCatSheet`, `<Payment entityType={EntityType.CAT}>`). The offer
 * comes from `GET /pawlegends/offer` (`offer()` below) and is recorded with `POST /pawlegends/offer/seen`. The
 * `pl_*` routes stay so earlier buyers keep their items: the stored token is refreshed and sent as `entitlements`,
 * a restore link still works, and a Checkout return still fetches its token. No new `pl_*` purchase starts here.
 *
 * The legacy flow, kept for those returns:
 *
 * 1. `POST /pawlegends/checkout {sku, currency, email, ageBand, consentVersion, deviceId, token?}` answers a
 *    Stripe Checkout URL and the page goes there (a full redirect works in TikTok and Instagram in-app browsers).
 *    The email is required (the backend keeps the age band, the spend cap and the once-only packs with it) and
 *    Stripe shows it locked. With a Token Tails session it goes to `POST /pawlegends/checkout/account` with the
 *    lowercase `accesstoken` header, so the account id is a spend-cap key too; when that route refuses the session
 *    (401 expired, 403 a guest, 428 no guest document) the plain route is used.
 * 2. Stripe returns to `/pawlegends?checkout=ok&session_id=cs_…`; `GET /pawlegends/entitlements?sessionId=`
 *    answers the entitlement token, kept here and sent to the game as `entitlements {token}`.
 * 3. On later visits the token is refreshed with `x-pawlegends-token`.
 * 4. Restore: `POST /pawlegends/restore {email}` mails a link to `/pawlegends?restore=…`;
 *    `POST /pawlegends/restore/verify {t}` answers a fresh token in any browser.
 * 5. "Legends Pass: notify me": `POST /pawlegends/notify {email}`, confirmed from `/pawlegends?notify=…`.
 *
 * The client never sends a price: the server's SKU table always wins. A missing backend secret answers 503 and
 * `GET /pawlegends/status` reports `store: false`: the host then tells the game to hide its store; the game still
 * plays. Without email (`email: false`) restore and notify answer 503, and the host hides both forms.
 *
 * Storage is per-viewer convenience only (token, device id, age band) and every access is wrapped in try/catch.
 * Pure helpers take their fetch and storage, so every rule is unit-tested.
 */
import { apiUrl, currentAccessToken } from "@/api/api";
import { isPawlegendsSku, type PawlegendsSku } from "./bridge";

export const PAWLEGENDS_TOKEN_KEY = "tt.pawlegends.token.v1";
export const PAWLEGENDS_DEVICE_KEY = "tt.pawlegends.device.v1";
export const PAWLEGENDS_AGE_KEY = "tt.pawlegends.age.v1";
/** How many times this browser opened `/pawlegends` (the offer engine's `session`: never an offer in session 1). */
export const PAWLEGENDS_SESSIONS_KEY = "tt.pawlegends.sessions.v1";
/** Mirror of `PAWLEGENDS_CONSENT_VERSIONS` / `PAWLEGENDS_TERMS_VERSION` in the backend contracts. */
export const PAWLEGENDS_CONSENT_VERSION = "2026-10-23";
/** Mirror of `PAWLEGENDS_MVP_TARGET`. */
export const PAWLEGENDS_MVP_TARGET = "2027-04-30";

export const PAWLEGENDS_AGE_BANDS = ["under16", "16-17", "18+"] as const;
export type PawlegendsAgeBand = (typeof PAWLEGENDS_AGE_BANDS)[number];
export const isAgeBand = (value: unknown): value is PawlegendsAgeBand =>
  typeof value === "string" &&
  (PAWLEGENDS_AGE_BANDS as readonly string[]).includes(value);
/** Mirror of the backend's `UNDER_16_MESSAGE`. */
export const UNDER_16_MESSAGE =
  "Ask a parent or guardian to buy this on their own device.";

/**
 * What a new squad member brings in Pawlegends (display only; the game decides the effect). Cosmetic only, and it
 * must match what the game grants (`rosterCosmetics` in pawlegends/src/meta/roster.ts) and the game's Meet card line
 * (`meetCard` in pawlegends/src/ui/cards.ts): a Companion Kitten, the element chroma and the card skin for every hero.
 */
export const MEET_PERKS = [
  "Trots at your heels as a Companion Kitten",
  "Its element chroma for every hero",
  "Its card skin for every hero",
] as const;

export type PawlegendsCurrency = "usd" | "eur";

/** EUR when the browser's time zone is in Europe, else USD (POC.md §8.1). */
export function currencyFor(
  timeZone: string | null | undefined
): PawlegendsCurrency {
  return typeof timeZone === "string" && /^Europe\//.test(timeZone)
    ? "eur"
    : "usd";
}

export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "$9.99" / "€9.99" from cents (VAT included). */
export function priceLabel(
  cents: number,
  currency: PawlegendsCurrency
): string {
  const amount = (Math.max(0, Math.round(cents)) / 100).toFixed(2);
  return currency === "eur" ? `€${amount}` : `$${amount}`;
}

// ---- storage -------------------------------------------------------------------------------------

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): KeyStorage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(storage: KeyStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(
  storage: KeyStorage | null,
  key: string,
  value: string | null
): void {
  try {
    if (!storage) return;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Blocked storage: the value lives for this page view only.
  }
}

const TOKEN = /^[A-Za-z0-9_-]{1,8000}\.[A-Za-z0-9_-]{16,128}$/;
export const isEntitlementToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

export const readToken = (storage = browserStorage()) => {
  const value = read(storage, PAWLEGENDS_TOKEN_KEY);
  return isEntitlementToken(value) ? value : null;
};
export const writeToken = (token: string | null, storage = browserStorage()) =>
  write(
    storage,
    PAWLEGENDS_TOKEN_KEY,
    isEntitlementToken(token) ? token : null
  );

export const readAgeBand = (
  storage = browserStorage()
): PawlegendsAgeBand | null => {
  const value = read(storage, PAWLEGENDS_AGE_KEY);
  return isAgeBand(value) ? value : null;
};
export const writeAgeBand = (
  band: PawlegendsAgeBand,
  storage = browserStorage()
) => write(storage, PAWLEGENDS_AGE_KEY, band);

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

function randomId(random: () => number = Math.random): string {
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let out = "";
    for (let i = 0; i < 32; i++) out += Math.floor(random() * 16).toString(16);
    return out;
  }
}

/** This browser's device id (the backend's spend-cap and offer key), made once and kept. */
export function deviceId(
  storage = browserStorage(),
  random?: () => number
): string {
  const stored = read(storage, PAWLEGENDS_DEVICE_KEY);
  if (stored && DEVICE_ID.test(stored)) return stored;
  const id = `d${randomId(random)}`;
  write(storage, PAWLEGENDS_DEVICE_KEY, id);
  return id;
}

/** Counts this page view as one more session (once per mount) and answers the new count; 1 without storage. */
export function nextSession(storage = browserStorage()): number {
  const stored = Number(read(storage, PAWLEGENDS_SESSIONS_KEY));
  const next = Number.isInteger(stored) && stored >= 0 && stored < 1_000_000 ? stored + 1 : 1;
  write(storage, PAWLEGENDS_SESSIONS_KEY, String(next));
  return next;
}

/** The SKUs an entitlement token lists (display only: the server verifies the token). */
export function tokenSkus(token: string | null): PawlegendsSku[] {
  if (!isEntitlementToken(token)) return [];
  try {
    const part = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      atob(part + "===".slice((part.length + 3) % 4))
    ) as { skus?: unknown };
    return Array.isArray(json.skus) ? json.skus.filter(isPawlegendsSku) : [];
  } catch {
    return [];
  }
}

// ---- the return query ----------------------------------------------------------------------------

export type ReturnAction =
  | { kind: "checkout-ok"; sessionId: string }
  | { kind: "checkout-cancel" }
  | { kind: "restore"; t: string }
  | { kind: "notify"; t: string }
  | null;

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;
const RAW_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

const first = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
    ? value[0]
    : undefined;

/** What the page was opened for (Stripe's return, a restore link, a notify confirmation). */
export function returnActionOf(query: Record<string, unknown>): ReturnAction {
  const checkout = first(query.checkout);
  const sessionId = first(query.session_id);
  if (checkout === "ok" && sessionId && SESSION_ID.test(sessionId))
    return { kind: "checkout-ok", sessionId };
  if (checkout === "cancel") return { kind: "checkout-cancel" };
  const restore = first(query.restore);
  if (restore && RAW_TOKEN.test(restore))
    return { kind: "restore", t: restore };
  const notify = first(query.notify);
  if (notify && RAW_TOKEN.test(notify)) return { kind: "notify", t: notify };
  return null;
}

/** The query keys the page removes from the address bar once handled. */
export const RETURN_QUERY_KEYS = [
  "checkout",
  "session_id",
  "restore",
  "notify",
] as const;

// ---- the API -------------------------------------------------------------------------------------

export interface StoreSku {
  sku: PawlegendsSku;
  label: string;
  cents: Record<PawlegendsCurrency, number>;
  deliveredNow: string;
  deliveredAtMvp: string;
}

export interface StoreStatus {
  store: boolean;
  email: boolean;
  termsVersion: string | null;
  skus: StoreSku[];
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  code: string | null;
  message: string | null;
  body: T | null;
}

export interface EntitlementAnswer {
  token: string;
  items: string[];
  skus: PawlegendsSku[];
  expiresAt: number;
}

export interface CheckoutRequest {
  sku: PawlegendsSku;
  currency: PawlegendsCurrency;
  email: string;
  ageBand: PawlegendsAgeBand;
  consentVersion: string;
  deviceId: string;
  token?: string;
}

export type StoreFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

const centsOf = (value: unknown): Record<PawlegendsCurrency, number> | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return Number.isInteger(v.usd) && Number.isInteger(v.eur)
    ? { usd: v.usd as number, eur: v.eur as number }
    : null;
};

const lineOf = (value: unknown): string | null =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 240 &&
  !/[<>]/.test(value)
    ? value
    : null;

/** `GET /pawlegends/status` as a clean copy; null fields make the store count as not ready. */
export function storeStatusOf(body: unknown): StoreStatus {
  const b =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const skus: StoreSku[] = [];
  for (const raw of Array.isArray(b.skus) ? b.skus : []) {
    const r =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const cents = centsOf(r.cents);
    const label = lineOf(r.label);
    const deliveredNow = lineOf(r.deliveredNow);
    const deliveredAtMvp = lineOf(r.deliveredAtMvp);
    if (
      isPawlegendsSku(r.sku) &&
      cents &&
      label &&
      deliveredNow &&
      deliveredAtMvp
    ) {
      skus.push({ sku: r.sku, label, cents, deliveredNow, deliveredAtMvp });
    }
  }
  return {
    store: b.store === true && skus.length > 0,
    email: b.email === true,
    termsVersion: typeof b.termsVersion === "string" ? b.termsVersion : null,
    skus,
  };
}

export function entitlementOf(body: unknown): EntitlementAnswer | null {
  const b =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (
    !b ||
    !isEntitlementToken(b.token) ||
    !Array.isArray(b.items) ||
    !Array.isArray(b.skus)
  )
    return null;
  return {
    token: b.token,
    items: b.items.filter(
      (i): i is string => typeof i === "string" && i.length <= 64
    ),
    skus: b.skus.filter(isPawlegendsSku),
    expiresAt: Number.isFinite(b.expiresAt) ? (b.expiresAt as number) : 0,
  };
}

/** Same-origin or https Checkout URLs only (Stripe answers `https://checkout.stripe.com/...`). */
export function checkoutUrlOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function createPawlegendsApi(
  base: string | undefined = apiUrl,
  fetchImpl: StoreFetch = (i, init) => fetch(i, init),
  accessToken: () => string = currentAccessToken
) {
  const root = `${(base || "").replace(/\/+$/, "")}/pawlegends`;

  async function call<T>(
    path: string,
    init: RequestInit,
    parse: (body: unknown) => T | null
  ): Promise<ApiResult<T>> {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        ...init,
        credentials: "omit",
      });
    } catch {
      return { ok: false, status: 0, code: null, message: null, body: null };
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      const j =
        json && typeof json === "object"
          ? (json as Record<string, unknown>)
          : {};
      return {
        ok: false,
        status: response.status,
        code: typeof j.code === "string" ? j.code : null,
        message:
          typeof j.message === "string" && j.message.length <= 200
            ? j.message
            : null,
        body: null,
      };
    }
    const body = parse(json);
    return {
      ok: body !== null,
      status: response.status,
      code: null,
      message: null,
      body,
    };
  }

  const postJson = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const okBody = (body: unknown) =>
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  return {
    status: () => call("/status", { method: "GET" }, (b) => storeStatusOf(b)),
    checkout: async (request: CheckoutRequest) => {
      const body = postJson({
        sku: request.sku,
        currency: request.currency,
        email: request.email,
        ageBand: request.ageBand,
        consentVersion: request.consentVersion,
        deviceId: request.deviceId,
        ...(request.token ? { token: request.token } : {}),
      });
      const parse = (b: unknown) => {
        const url = checkoutUrlOf(okBody(b).url);
        return url ? { url } : null;
      };
      let session = "";
      try {
        session = accessToken() || "";
      } catch {
        session = "";
      }
      if (!session.startsWith("fb")) return call("/checkout", body, parse);
      const withAuth: RequestInit = {
        ...body,
        headers: {
          ...(body.headers as Record<string, string>),
          accesstoken: session,
        },
      };
      const first = await call("/checkout/account", withAuth, parse);
      // An expired session (401), a guest (403) or a guest with no document (428) must not block a purchase: the
      // plain route still keys the cap by email and device.
      return first.status === 401 ||
        first.status === 403 ||
        first.status === 428
        ? call("/checkout", body, parse)
        : first;
    },
    entitlementsForSession: (sessionId: string) =>
      call(
        `/entitlements?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "GET" },
        entitlementOf
      ),
    refresh: (token: string) =>
      call(
        "/entitlements",
        { method: "GET", headers: { "x-pawlegends-token": token } },
        entitlementOf
      ),
    restore: (email: string) =>
      call("/restore", postJson({ email }), (b) => okBody(b)),
    verifyRestore: (t: string) =>
      call("/restore/verify", postJson({ t }), entitlementOf),
    notify: (email: string, source: string) =>
      call("/notify", postJson({ email, source }), (b) => okBody(b)),
    confirmNotify: (t: string) =>
      call("/notify/confirm", postJson({ t }), (b) => okBody(b)),
    /**
     * `GET /pawlegends/offer`: one `meet` card for a cat of `catalogIds` (the featured list), or null. The server
     * applies the rules (session >= 2, lobby or results, one card per session, never in app builds, the spend cap).
     */
    offer: (query: { deviceId: string; session: number; catalogIds: string[]; screen?: "lobby" | "results"; token?: string | null }) => {
      const params = new URLSearchParams({
        deviceId: query.deviceId,
        session: String(query.session),
        screen: query.screen ?? "lobby",
        catalogIds: query.catalogIds.filter((id) => /^[0-9a-f]{24}$/.test(id)).slice(0, 2).join(","),
      });
      const init: RequestInit = query.token ? { method: "GET", headers: { "x-pawlegends-token": query.token } } : { method: "GET" };
      return call(`/offer?${params.toString()}`, init, (b) => {
        const offer = okBody(b).offer;
        if (offer === null) return { offer: null };
        const o = okBody(offer);
        return o.kind === "meet" && typeof o.catalogId === "string" && /^[0-9a-f]{24}$/.test(o.catalogId)
          ? { offer: { kind: "meet" as const, catalogId: o.catalogId } }
          : { offer: null };
      });
    },
    /** `POST /pawlegends/offer/seen`: the card showed in this session (no other card this session). */
    offerSeen: (body: { deviceId: string; session: number; catalogId: string }) =>
      call("/offer/seen", postJson({ ...body, kind: "meet" }), (b) => okBody(b)),
    /**
     * `GET /pawlegends/champions` (sim v9): the shelter champions' cards, `{cats: [{hero, catalogId, forSale, cat}]}`
     * (`championsOf` in `./championsBridge` validates the rows).
     */
    champions: () => call("/champions", { method: "GET" }, (b) => okBody(b)),
    /** Founder Legend seats left (`GET /pawlegends/founders`, POC.md §8.3), shown on its purchase sheet. */
    founders: () =>
      call("/founders", { method: "GET" }, (b) => {
        const o = okBody(b);
        return typeof o.left === "number" && typeof o.cap === "number" && o.left >= 0
          ? { left: Math.floor(o.left), cap: Math.floor(o.cap) }
          : null;
      }),
  };
}

export type PawlegendsApi = ReturnType<typeof createPawlegendsApi>;

/** A short line for a refused checkout (the backend's codes, `pawlegends.errors.ts`). */
export function checkoutErrorLine(
  result: Pick<ApiResult<unknown>, "status" | "code">
): string {
  switch (result.code) {
    case "PAWLEGENDS_UNDER_16":
      return UNDER_16_MESSAGE;
    case "PAWLEGENDS_SPEND_CAP":
      return "This purchase would go over your 30-day limit.";
    case "PAWLEGENDS_ALREADY_OWNED":
      return "You already own this.";
    case "PAWLEGENDS_SOLD_OUT":
      return "All Founder Legend seats are taken.";
    case "PAWLEGENDS_NEEDS_FOUNDER":
      return "The upgrade is for Founder owners. Restore your items first.";
    case "PAWLEGENDS_STRIPE_UNAVAILABLE":
    case "PAWLEGENDS_ENTITLEMENT_UNAVAILABLE":
    case "PAWLEGENDS_WEBHOOK_UNAVAILABLE":
      return "The store is closed right now. The game still plays.";
  }
  if (result.status === 0) return "No connection. Try again.";
  if (result.status === 429)
    return "Too many tries. Wait a minute and try again.";
  return "Checkout did not start. Try again.";
}

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/;
export const isEmail = (value: string) => EMAIL.test(value.trim());

/** The verified email an entitlement token carries (a restore by email), to prefill the purchase sheet. */
export function tokenEmail(token: string | null): string | null {
  if (!isEntitlementToken(token)) return null;
  try {
    const part = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      atob(part + "===".slice((part.length + 3) % 4))
    ) as { email?: unknown; ev?: unknown };
    return json.ev === 1 &&
      typeof json.email === "string" &&
      isEmail(json.email)
      ? json.email
      : null;
  } catch {
    return null;
  }
}
