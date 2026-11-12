/**
 * Scrubs personal data and secrets out of error text before it leaves the
 * device (F9). The rules live in `shared/analytics-core.ts` so the core app
 * and Catnip Heist scrub alike; see that file for what is removed and kept.
 */
export {
  SCRUB_LIMITS,
  scrubText,
  scrubStack,
  scrubContext,
  scrubRoute,
} from "@/shared-contracts/analytics-core";
export type { ScrubbedValue } from "@/shared-contracts/analytics-core";
