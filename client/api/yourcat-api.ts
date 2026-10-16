import { getLimitedUseAppCheckToken } from "@/context/auth/appCheck";
import { errorCodeOf, ErrorCode } from "@/shared-contracts/errors";
import {
  isShareId,
  isYourcatErrorCode,
  type YourcatCheckoutView,
  type YourcatDeleteView,
  type YourcatErrorCode,
  type YourcatPortraitStyle,
  type YourcatPublicView,
  type YourcatStatusView,
  type YourcatView,
} from "@/models/yourcat";
import { getApp } from "firebase/app";
import { apiFetch, apiUrl, currentAccessToken, getAuthBridge } from "./api";

/*
 * `/yourcat` (bet #3, docs/plans/yourcat-v2.md §2.2):
 *
 *   GET    /yourcat/status                    public: kill switch, budget, families, portrait price
 *   GET    /yourcat/public/:shareId           public: the friend view of a shared cat (no photo, no ids)
 *   POST   /yourcat                           multipart photo upload (guests allowed)
 *   POST   /yourcat/manual                    { family, name? }: no photo, no AI
 *   GET    /yourcat/me                        { item }: the caller's latest record
 *   GET    /yourcat/:id                       one record
 *   PATCH  /yourcat/:id                       { name }
 *   DELETE /yourcat/:id                       deletes the photo and the pixel portrait
 *   POST   /yourcat/:id/portrait-checkout     { style }: a Stripe Checkout URL
 *
 * Every call except the two public reads carries the lowercase `accesstoken` header (the `fb`-prefixed Firebase token). The
 * upload also sends a limited-use App Check token in `x-firebase-appcheck`, after making sure the
 * guest document exists (`ensureGuestSession`), so a first-time visitor's upload is not refused with
 * 428. Error bodies are `{ statusCode, code, message }` with `YOURCAT_*` codes the client reads
 * itself; a 429 from a burst limit has no `code`.
 */

/** A refused or failed `/yourcat` call. */
export class YourcatRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "code" | "rate-limited" | "network" | "server",
    readonly code: YourcatErrorCode | null,
    readonly serverMessage: string | null,
  ) {
    super(serverMessage || `Request failed with status ${status}`);
    this.name = "YourcatRequestError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, YourcatRequestError.prototype);
  }

  /** The failure in the shape the copy maps (`uploadErrorCopy`). */
  get failure() {
    if (this.kind === "code" && this.code) return { kind: "code" as const, code: this.code, message: this.serverMessage || undefined };
    if (this.kind === "rate-limited") return { kind: "rate-limited" as const };
    if (this.kind === "network") return { kind: "network" as const };
    return { kind: "server" as const };
  }
}

/** Maps an answer to the error the page shows. */
export function toRequestError(status: number, body: unknown): YourcatRequestError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const code = record ? record.code : undefined;
  const message = record && typeof record.message === "string" ? record.message : null;
  if (status === 0) return new YourcatRequestError(0, "network", null, null);
  if (isYourcatErrorCode(code)) return new YourcatRequestError(status, "code", code, message);
  if (status === 429) return new YourcatRequestError(status, "rate-limited", null, message);
  return new YourcatRequestError(status, "server", null, message);
}

const jsonHeaders = (auth: boolean): Record<string, string> =>
  auth
    ? { Accept: "application/json", "Content-Type": "application/json", accesstoken: currentAccessToken() }
    : { Accept: "application/json" };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function json<T>(path: string, init: RequestInit, write: boolean, auth = true): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(
      `${apiUrl}${path}`,
      { ...init, headers: jsonHeaders(auth) },
      write ? { guestSession: true, requireAccount: false } : { guestSession: false, requireAccount: false },
    );
  } catch {
    throw new YourcatRequestError(0, "network", null, null);
  }
  const body = await readJson(response);
  if (!response.ok) throw toRequestError(response.status, body);
  return body as T;
}

// ---- App Check ---------------------------------------------------------------------------------

/** A prefetched limited-use token older than this is replaced at the tap (§1). */
export const APP_CHECK_MAX_AGE_MS = 4 * 60 * 1000;

let prefetched: { token: Promise<string | null>; at: number } | null = null;

async function freshAppCheckToken(): Promise<string | null> {
  try {
    return await getLimitedUseAppCheckToken(getApp());
  } catch {
    // No Firebase app on the page, or App Check not configured: the server decides.
    return null;
  }
}

/** Fetches one limited-use App Check token ahead of the tap (on page mount). */
export function prefetchAppCheck(now: number = Date.now()): void {
  if (prefetched && now - prefetched.at < APP_CHECK_MAX_AGE_MS) return;
  prefetched = { token: freshAppCheckToken(), at: now };
}

/** The prefetched token when it is fresh and unused, otherwise a new one. A token is used once. */
export async function takeAppCheckToken(now: number = Date.now()): Promise<string | null> {
  const ready = prefetched;
  prefetched = null;
  if (ready && now - ready.at < APP_CHECK_MAX_AGE_MS) {
    const token = await ready.token;
    if (token) return token;
  }
  return freshAppCheckToken();
}

/** For tests: forgets the prefetched token. */
export function __resetAppCheckForTests(): void {
  prefetched = null;
}

// ---- upload ------------------------------------------------------------------------------------

export interface UploadOptions {
  noticeVersion: string;
  /** Called once the request body has been sent (S2 step 1). */
  onSent?: () => void;
}

interface RawAnswer {
  status: number;
  body: unknown;
}

/**
 * Sends the multipart form with XMLHttpRequest, which reports when the body has left the browser
 * (`fetch` cannot). Status 0 means no answer (offline, aborted, CORS).
 */
function sendForm(url: string, form: FormData, headers: Record<string, string>, onSent?: () => void): Promise<RawAnswer> {
  return new Promise((resolve) => {
    let sent = false;
    const markSent = () => {
      if (sent) return;
      sent = true;
      onSent?.();
    };
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
      if (xhr.upload) xhr.upload.onload = markSent;
      xhr.onload = () => {
        markSent();
        let body: unknown = null;
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          body = null;
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => resolve({ status: 0, body: null });
      xhr.onabort = () => resolve({ status: 0, body: null });
      xhr.ontimeout = () => resolve({ status: 0, body: null });
      xhr.send(form);
    } catch {
      resolve({ status: 0, body: null });
    }
  });
}

async function ensureGuest(): Promise<void> {
  try {
    await getAuthBridge().ensureGuestSession?.();
  } catch {
    // The upload answers 428 if the session is still missing; that is retried once below.
  }
}

async function postPhoto(file: Blob, filename: string, options: UploadOptions): Promise<RawAnswer> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("consent", "true");
  form.append("noticeVersion", options.noticeVersion);
  const headers: Record<string, string> = { Accept: "application/json", accesstoken: currentAccessToken() };
  const appCheck = await takeAppCheckToken();
  if (appCheck) headers["x-firebase-appcheck"] = appCheck;
  return sendForm(`${apiUrl}/yourcat`, form, headers, options.onSent);
}

/** `POST /yourcat`. The guest session is made sure of first; a 428 is retried once. */
async function upload(file: Blob, filename: string, options: UploadOptions): Promise<YourcatView> {
  await ensureGuest();
  let answer = await postPhoto(file, filename, options);
  if (answer.status === 428 && errorCodeOf(answer.body) === ErrorCode.GUEST_SESSION_REQUIRED) {
    await ensureGuest();
    answer = await postPhoto(file, filename, options);
  }
  if (answer.status >= 200 && answer.status < 300 && answer.body) return answer.body as YourcatView;
  throw toRequestError(answer.status, answer.body);
}

// ---- JSON routes -------------------------------------------------------------------------------

/** `GET /yourcat/status`: public, so it carries no `accesstoken` (it is often read before sign-in ends). */
const status = () => json<YourcatStatusView>("/yourcat/status", { method: "GET" }, false, false);

/**
 * `GET /yourcat/public/:shareId`: the friend view of a shared cat. Unauthenticated: no `accesstoken` and
 * never a guest session (a friend opening a link creates nothing). A malformed id is refused here as
 * 404 `YOURCAT_NOT_FOUND`, without a request.
 */
const publicCat = async (shareId: string): Promise<YourcatPublicView> => {
  if (!isShareId(shareId)) throw new YourcatRequestError(404, "code", "YOURCAT_NOT_FOUND", null);
  return json<YourcatPublicView>(`/yourcat/public/${shareId}`, { method: "GET" }, false, false);
};

/** `POST /yourcat/manual`. */
const manual = async (family: string, name?: string): Promise<YourcatView> => {
  await ensureGuest();
  return json<YourcatView>(
    "/yourcat/manual",
    { method: "POST", body: JSON.stringify(name && name.trim() ? { family, name: name.trim() } : { family }) },
    true,
  );
};

/** `GET /yourcat/me`: the caller's latest record, or null. */
const me = async (): Promise<YourcatView | null> => {
  const body = await json<{ item: YourcatView | null }>("/yourcat/me", { method: "GET" }, false);
  return body?.item ?? null;
};

/** `GET /yourcat/:id`. */
const get = (id: string) => json<YourcatView>(`/yourcat/${encodeURIComponent(id)}`, { method: "GET" }, false);

/** `PATCH /yourcat/:id` with the card name. */
const rename = (id: string, name: string) =>
  json<YourcatView>(`/yourcat/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) }, true);

/** `DELETE /yourcat/:id`. */
const remove = (id: string) =>
  json<YourcatDeleteView>(`/yourcat/${encodeURIComponent(id)}`, { method: "DELETE" }, true);

/** `POST /yourcat/:id/portrait-checkout`. */
const portraitCheckout = (id: string, style: YourcatPortraitStyle) =>
  json<YourcatCheckoutView>(
    `/yourcat/${encodeURIComponent(id)}/portrait-checkout`,
    { method: "POST", body: JSON.stringify({ style }) },
    true,
  );

export const YOURCAT_API = {
  status,
  publicCat,
  upload,
  manual,
  me,
  get,
  rename,
  remove,
  portraitCheckout,
  ensureGuest,
  prefetchAppCheck,
};
