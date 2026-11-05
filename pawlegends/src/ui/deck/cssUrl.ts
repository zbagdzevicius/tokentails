/**
 * Safe values for inline `style="background-image:…"` attributes (no stylesheet, no DOM): a leaf module, so the lobby
 * (first load) can use it without pulling in the drawer chunk or the Nature stylesheet.
 *
 * Host URLs (roster art, sprite sheets) are allow-listed by host upstream, but their paths are not: a quote, a bracket
 * or a semicolon in a path would close `url(…)` and inject CSS (QA: a full-screen overlay from a sprite path).
 */

/** A URL safe inside `url("…")` in an inline style: http(s) only, no quotes, brackets, backslashes or spaces. */
export function cssUrl(u: string | null | undefined): string | null {
  if (!u || !/^https?:\/\//i.test(u) || /["'\\()\s<>;]/.test(u)) return null;
  return `url(&quot;${u}&quot;)`;
}

/** An internal picture (a baked portrait): a base64 image data URL or a blob URL only, as `url("…")`; else null. */
export function cssDataUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const ok = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) || /^blob:https?:\/\/[^\s"'\\()<>;]+$/.test(u);
  return ok ? `url(&quot;${u}&quot;)` : null;
}
