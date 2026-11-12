/**
 * Paw Legends site constants (analytics/gtm.ts, _document). Every page of pawlegends-web is a Paw Legends page, so
 * there is no per-path switch. No imports, so tests that mock `@/analytics/gtm` still get the real helpers.
 */
/** The Paw Legends GTM container (the founder's snippet). A public id, not a secret. */
export const PAWLEGENDS_GTM_ID = "GTM-K6RTRKSR";

/** Paw Legends' own domain: the apex and www (next.config.js sends www to the apex). */
export const PAWLEGENDS_HOSTS: readonly string[] = Object.freeze(["pawlegends.app", "www.pawlegends.app"]);

export const isPawlegendsHost = (hostname: string): boolean => PAWLEGENDS_HOSTS.includes(hostname.toLowerCase());
