// copy-lint: web-only every caller renders these inside an isApp web branch (landing, /impact)
import type { RailCopyState } from "@/api/impact-api";

/*
 * The rail words beside F-025, one per rail state (one reading for every surface, see
 * `railCopyState` in api/impact-api.ts). Kept under components/ so copy-lint scans them; web only
 * because they name the chain.
 */

export const RAIL_CHIP_COPY: Record<RailCopyState, string> = {
  soon: "Arc shelter rail opens soon",
  paused: "Arc shelter rail · treats paused",
  open: "Arc shelter rail",
  exhausted: "Arc shelter rail · today's treats used up",
};
