/**
 * Pink Paw Knight (Swordcat) flags (Swordcat plan TOKENTAILS-PLAN.md §5.2). All default OFF, so a
 * build without them is unchanged: `/swordcat` sends players back to `/game` and the picker shows
 * no card.
 *
 * - `NEXT_PUBLIC_SWORDCAT`: `1`/`true`/`yes`/`on` opens `/swordcat`.
 * - `NEXT_PUBLIC_SWORDCAT_URL` (optional override): where the game build is served. By default the
 *   game is same-origin at `SWORDCAT_DEFAULT_URL` (`client/public/swordcat-game/`, copied from the
 *   Swordcat repo with `npm run build:tokentails`, like the Heist's `heist-game/`). An override must
 *   be an absolute `https:` URL, an `http://localhost` (or 127.0.0.1) URL for local dev, or a
 *   same-origin path; anything else counts as unset and the default is used.
 * - `NEXT_PUBLIC_SWORDCAT_PICKER`: `1`/… shows the card in the PLAY picker, only together with the
 *   page flag.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time, so a change needs a redeploy. Pure functions with the
 * env as default arguments, so tests pass values in.
 */

const TRUTHY = /^(1|true|yes|on)$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True only for `1`, `true`, `yes` or `on` (any case, trimmed). */
export function flagOn(value: string | undefined): boolean {
  return TRUTHY.test((value || "").trim());
}

/** `/swordcat` is open. */
export function swordcatEnabled(flag: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT): boolean {
  return flagOn(flag);
}

/** The same-origin build (`client/public/swordcat-game/`). Next serves no directory index, so the file is named. */
export const SWORDCAT_DEFAULT_URL = "/swordcat-game/index.html";

/**
 * The `NEXT_PUBLIC_SWORDCAT_URL` override, or null when it is missing or not allowed: absolute
 * `https:` URLs, `http://localhost` URLs, or same-origin paths starting with one `/` (not `//host`).
 */
export function swordcatUrlOverride(raw: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT_URL): string | null {
  const value = (raw || "").trim();
  if (!value || /[\s\\]/.test(value)) return null;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol === "https:") return value;
  if (parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname)) return value;
  return null;
}

/** The game's URL: a valid override, else the same-origin build. */
export function swordcatUrl(raw: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT_URL): string {
  return swordcatUrlOverride(raw) ?? SWORDCAT_DEFAULT_URL;
}

/** The PLAY picker card: its own flag plus the page flag (the URL always resolves now). */
export function swordcatPickerEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT_PICKER,
  pageFlag: string | undefined = process.env.NEXT_PUBLIC_SWORDCAT
): boolean {
  return flagOn(flag) && swordcatEnabled(pageFlag);
}

/** The iframe's src: the game URL with `embed=1` added. */
export function swordcatFrameSrc(url: string): string {
  const hashAt = url.indexOf("#");
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  return `${base}${base.includes("?") ? "&" : "?"}embed=1${hash}`;
}

/** The game's origin, resolved against the page (a same-origin path gives the page's origin). */
export function swordcatOrigin(url: string, base: string): string | null {
  try {
    const origin = new URL(url, base).origin;
    return origin && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}
