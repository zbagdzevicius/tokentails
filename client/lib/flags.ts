/**
 * Shared env flag parsing for `NEXT_PUBLIC_*` switches. Next inlines these at build time, so a change
 * needs a redeploy.
 */

const TRUTHY = /^(1|true|yes|on)$/i;
const FALSY = /^(0|false|no|off)$/i;

/** True only for `1`, `true`, `yes` or `on` (any case, trimmed). Use it for opt-in flags. */
export function flagOn(value: string | undefined): boolean {
  return TRUTHY.test((value || "").trim());
}

/** True unless the value is `0`, `false`, `no` or `off` (any case, trimmed): unset means on. */
export function flagNotOff(value: string | undefined): boolean {
  return !FALSY.test((value || "").trim());
}
