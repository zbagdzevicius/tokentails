import { cdnFile } from "@/constants/utils";

/**
 * Site identity for meta tags (plan F12). Every absolute URL in SeoHead and ArticleMicrodata
 * is built here with `new URL()`, never by string joins (the old
 * `.join("/").replace("//", "/")` produced `https:/tokentails.com/...`).
 */

/** Used when `NEXT_PUBLIC_DOMAIN` is unset or unparsable. */
export const DEFAULT_SITE_ORIGIN = "https://tokentails.com";
export const DEFAULT_SITE_NAME = "Token Tails";

/**
 * The default share image: the landing's Open Graph card at the 1200x630 size every unfurler
 * expects (generated from `logo/ogg.jpg` by scripts/build-icons.mjs, plan G14).
 */
export const DEFAULT_OG_IMAGE = Object.freeze({
  path: "logo/og-v2-1200x630.jpg",
  width: 1200,
  height: 630,
  alt: "Token Tails: a white pixel cat waves from a moonlit temple stage",
});

/**
 * The publisher logo in JSON-LD: the shared 512 icon (plan G14; it replaced the missing
 * `/logo.svg`). Same origin, not CDN, like every icon the document links.
 */
export const SITE_LOGO = Object.freeze({
  path: "icons/icon-512.png",
  width: 512,
  height: 512,
});

const isBlank = (value: string | null | undefined): value is undefined | null | "" =>
  value === undefined ||
  value === null ||
  !value.trim() ||
  value.trim() === "undefined" ||
  value.trim() === "null";

/**
 * The canonical origin (`https://host[:port]`, no trailing slash) from `NEXT_PUBLIC_DOMAIN`.
 * Accepts a bare host (`tokentails.com`), a trailing slash or a path, and falls back to
 * `DEFAULT_SITE_ORIGIN` when the value is missing or not a URL.
 */
export function siteOrigin(
  raw: string | undefined = process.env.NEXT_PUBLIC_DOMAIN
): string {
  if (isBlank(raw)) {
    return DEFAULT_SITE_ORIGIN;
  }
  const value = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_SITE_ORIGIN;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function siteName(
  raw: string | undefined = process.env.NEXT_PUBLIC_SITE_NAME
): string {
  return isBlank(raw) ? DEFAULT_SITE_NAME : raw.trim();
}

/** The X/Twitter handle without `@`, or null when none is configured (then no Twitter tags). */
export function twitterHandle(
  raw: string | undefined = process.env.NEXT_PUBLIC_TWITTER_PAGE
): string | null {
  if (isBlank(raw)) {
    return null;
  }
  const handle = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "");
  return /^\w{1,15}$/.test(handle) ? handle : null;
}

/** A configured public value, or null. */
export function configured(raw: string | undefined): string | null {
  return isBlank(raw) ? null : raw.trim();
}

/**
 * A site path (`/feed/news`) or a full http(s) URL, as an absolute URL on `origin`. Returns null
 * for values that are not a URL or path (for example a title passed as a path), so callers can
 * leave the tag out instead of publishing a broken URL. An empty or blank value is null too (the
 * root is `/`).
 */
export function absoluteUrl(
  pathOrUrl: string | null | undefined,
  origin: string = siteOrigin()
): string | null {
  if (pathOrUrl === undefined || pathOrUrl === null) {
    return null;
  }
  const value = pathOrUrl.trim();
  // An empty value is not the root: the root is spelled "/".
  if (!value || /\s/.test(value)) {
    return null;
  }
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).href;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
      return null;
    }
    const path = `/${value.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
    const url = new URL(path, `${origin}/`);
    // One canonical spelling: no trailing slash except for the root.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.href;
  } catch {
    return null;
  }
}

/** An asset (CDN in production, same origin otherwise) as an absolute URL. */
export function absoluteAsset(path: string, origin: string = siteOrigin()): string {
  return absoluteUrl(cdnFile(path), origin) ?? `${origin}/${path}`;
}

/** The web path of an article, matching `pages/feed/[category]/[article].tsx`. */
export function articleSitePath(
  categorySlug: string | undefined,
  slug: string | undefined
): string | null {
  if (!categorySlug || !slug) {
    return null;
  }
  return `/feed/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`;
}
