/**
 * Which pages are Paw Legends pages (analytics/gtm.ts picks its container with these). No imports, so tests that mock
 * `@/analytics/gtm` still get the real helpers.
 */
/** The Paw Legends GTM container (the founder's snippet). A public id, not a secret. */
export const PAWLEGENDS_GTM_ID = "GTM-K6RTRKSR";

/** Paw Legends' own domain: the apex and www (next.config.js sends www to the apex). */
export const PAWLEGENDS_HOSTS: readonly string[] = Object.freeze(["pawlegends.app", "www.pawlegends.app"]);

export const isPawlegendsHost = (hostname: string): boolean => PAWLEGENDS_HOSTS.includes(hostname.toLowerCase());

/** A Paw Legends page on tokentails.com: the landing, its sub-pages (play, privacy, terms, account, support), `/legends`. */
export const isPawlegendsPath = (pathname: string): boolean =>
  pathname === "/pawlegends" || pathname.startsWith("/pawlegends/") || pathname === "/legends";

/** Every page on pawlegends.app, and the Paw Legends pages on any other host. */
export const isPawlegendsLocation = (loc: { hostname: string; pathname: string }): boolean =>
  isPawlegendsHost(loc.hostname) || isPawlegendsPath(loc.pathname);

/** The page path the app routes on: pawlegends.app's `/` is the `/pawlegends` landing (next.config.js rewrites). */
export const pagePathOf = (loc: { hostname: string; pathname: string }): string =>
  isPawlegendsHost(loc.hostname) && loc.pathname === "/" ? "/pawlegends" : loc.pathname;

