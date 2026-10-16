/**
 * Share URL and UTM (docs/plans/yourcat-v2.md §5.5, docs/plans/yourcat-polish.md §8).
 *
 * The shared link carries the campaign parameters and, when the cat has one, `cat=<shareId>`: a
 * random public share id (12 base64url characters from `crypto.randomBytes(9)` on the server), never
 * the record id, a user id or a `ref`. A friend who opens it sees the cat's name (only when named),
 * family and pixel look through `GET /yourcat/public/:shareId`, never the photo. On load, the page
 * keeps the incoming `utm_source`, `utm_medium` and `utm_content` (when they look like plain slugs)
 * in sessionStorage for `upload_started`; nothing else reads them.
 */
import { siteOrigin } from "@/components/seo/site";
import { isShareId } from "@/models/yourcat";

export type ShareMedium = "card" | "link";
export type ShareContent = "story" | "post" | "link";

export const UTM_STORAGE_KEY = "tt.yourcat.utm";
const UTM_VALUE = /^[a-z0-9_-]{1,32}$/;

/**
 * `…/yourcat?cat=<shareId>&utm_source=share&utm_medium=…&utm_campaign=yourcat&utm_content=…`. A missing
 * or malformed share id is left out (the link then opens the upload page).
 */
export function buildShareUrl(
  medium: ShareMedium,
  content: ShareContent,
  shareId?: string | null,
  origin: string = siteOrigin(),
): string {
  const cat = isShareId(shareId) ? `cat=${shareId}&` : "";
  return `${origin}/yourcat?${cat}utm_source=share&utm_medium=${medium}&utm_campaign=yourcat&utm_content=${content}`;
}

/** The `cat` parameter of a query string when it is a well-formed share id (`^[A-Za-z0-9_-]{12}$`), else null. */
export function readShareId(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get("cat");
    return isShareId(value) ? value : null;
  } catch {
    return null;
  }
}

export interface IncomingUtm {
  utmSource?: string;
  utmMedium?: string;
  utmContent?: string;
}

/** The three parameters from a query string, each dropped unless it matches `^[a-z0-9_-]{1,32}$`. */
export function readUtm(search: string): IncomingUtm {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return {};
  }
  const out: IncomingUtm = {};
  const keep = (key: string, field: keyof IncomingUtm) => {
    const value = params.get(key);
    if (value !== null && UTM_VALUE.test(value)) out[field] = value;
  };
  keep("utm_source", "utmSource");
  keep("utm_medium", "utmMedium");
  keep("utm_content", "utmContent");
  return out;
}

/** Stores the incoming parameters (only when there are any). Never throws. */
export function storeUtm(utm: IncomingUtm): void {
  if (!utm.utmSource && !utm.utmMedium && !utm.utmContent) return;
  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Private mode or blocked storage: the event goes without them.
  }
}

/** The stored parameters, re-checked. Never throws. */
export function loadUtm(): IncomingUtm {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Record<string, unknown>;
    const out: IncomingUtm = {};
    for (const key of ["utmSource", "utmMedium", "utmContent"] as const) {
      const item = value?.[key];
      if (typeof item === "string" && UTM_VALUE.test(item)) out[key] = item;
    }
    return out;
  } catch {
    return {};
  }
}
