/**
 * Site identity for meta tags. pawlegends-web serves one site, pawlegends.app, so the origin and name are fixed (no
 * env). Every absolute URL in SeoHead is built here with `new URL()`, never by string joins.
 */

export const SITE_ORIGIN = "https://pawlegends.app";
export const SITE_NAME = "Paw Legends";

/**
 * A site path (`/play`) or a full http(s) URL, as an absolute URL on `origin`. Returns null for values that are not a
 * URL or path, so callers leave the tag out instead of publishing a broken URL. The root is spelled `/`.
 */
export function absoluteUrl(pathOrUrl: string | null | undefined, origin: string = SITE_ORIGIN): string | null {
  if (pathOrUrl === undefined || pathOrUrl === null) return null;
  const value = pathOrUrl.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return null;
    const path = `/${value.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
    const url = new URL(path, `${origin}/`);
    // One canonical spelling: no trailing slash except for the root.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return null;
  }
}
