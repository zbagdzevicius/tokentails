/**
 * Whether to offer the way into `/yourcat` from the landing and the onboarding ceremony (launch item
 * L9). Off unless `NEXT_PUBLIC_YOURCAT_ENTRY` is set; then it reads the public `GET /yourcat/status`
 * and says yes only when the feature is on and uploads are open, never in the app build (no upload
 * there), and never while loading or after an error. With the flag off nothing is requested, so no
 * page changes and no test sees a new backend call.
 *
 * This file stays light on purpose (the landing imports it): the API module, which pulls in Firebase,
 * is loaded only when the flag is on, and only after mount.
 */
import { useEffect, useState } from "react";

/** The entry link text. Re-exported by `copy.ts` (`ENTRY_LINK`), so the honesty test reads it too. */
export const YOURCAT_ENTRY_COPY = "Turn your cat's photo into your game cat";

export const YOURCAT_ENTRY_HREF = "/yourcat";

/** `NEXT_PUBLIC_YOURCAT_ENTRY=1` (or `true`, `on`) turns the entry link on. Read at call time for tests. */
export function yourcatEntryEnabled(raw: string | undefined = process.env.NEXT_PUBLIC_YOURCAT_ENTRY): boolean {
  const value = (raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

export interface YourcatAvailableOptions {
  /** App build: no upload, so no entry. Defaults to `NEXT_PUBLIC_IS_APP`. */
  isApp?: boolean;
  /** The build flag. Defaults to `NEXT_PUBLIC_YOURCAT_ENTRY`. */
  enabled?: boolean;
}

/** True once the status says `/yourcat` is on and open; false while loading, on error, or when off. */
export function useYourcatAvailable({
  isApp = !!process.env.NEXT_PUBLIC_IS_APP,
  enabled = yourcatEntryEnabled(),
}: YourcatAvailableOptions = {}): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (isApp || !enabled) return;
    let alive = true;
    void (async () => {
      try {
        const { YOURCAT_API } = await import("@/api/yourcat-api");
        const status = await YOURCAT_API.status();
        if (alive) setAvailable(!!status && status.enabled === true && status.uploadsOpen === true);
      } catch {
        if (alive) setAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isApp, enabled]);
  return available;
}
