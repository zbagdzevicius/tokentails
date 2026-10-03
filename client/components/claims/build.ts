import { DEFAULT_SITE_ORIGIN, siteOrigin } from "@/components/seo/site";

/**
 * Whether this is a Capacitor app build (`NEXT_PUBLIC_IS_APP`, plan F7.2). Read at call time so a
 * unit test can flip it; Next inlines the value at build time either way.
 */
export function isAppBuild(): boolean {
  return !!process.env.NEXT_PUBLIC_IS_APP;
}

/** The public web /impact page, optionally at one claim's row. Always the https web origin. */
export function webImpactUrl(id?: string): string {
  const origin = siteOrigin();
  const base = /^https:\/\//.test(origin) ? origin : DEFAULT_SITE_ORIGIN;
  const url = new URL("/impact", base);
  if (id) url.hash = id;
  return url.toString();
}

/**
 * Opens web /impact from an app build through `@capacitor/browser` (an in-app browser tab, so the
 * explorer and wallet wording stays on the web page). Falls back to `window.open` if the plugin is
 * missing, for example in a browser preview of the app export.
 */
export async function openWebImpact(id?: string): Promise<void> {
  const url = webImpactUrl(id);
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    if (typeof window !== "undefined")
      window.open(url, "_blank", "noopener,noreferrer");
  }
}
