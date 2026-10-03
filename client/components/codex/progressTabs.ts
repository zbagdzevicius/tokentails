import { PROGRESS_TABS, type ProgressTab } from "@/components/impact/progressTab";

/*
 * PROGRESS tabs (plan G5 "PROGRESS restructure"): IMPACT (default), REWARDS, MISSIONS, TIERS,
 * PET ART, BADGES, VAULT. The button that opens them stays "PROGRESS" (decision #42).
 *
 * - PET ART is a paid AI portrait: app builds cannot sell it until store IAP exists, so it is
 *   left out there (the old `Codex.tsx:69-71` filter, kept).
 * - VAULT shows only on the web when `GET /user/token-status` says TOKEN (decision #39).
 *
 * The ids are the lobby's `ProgressTab` ids (components/impact/progressTab.ts), so a deep link
 * from the RESCUE tile or MY IMPACT lands on the right tab.
 */

export { PROGRESS_TABS };
export type { ProgressTab };

export const PROGRESS_TAB_LABELS: Record<ProgressTab, string> = {
  impact: "IMPACT",
  rewards: "REWARDS",
  missions: "MISSIONS",
  tiers: "TIERS",
  "pet-art": "PET ART",
  badges: "BADGES",
  vault: "VAULT",
};

export const DEFAULT_PROGRESS_TAB: ProgressTab = "impact";

/** The tabs this build shows, in order. */
export function visibleProgressTabs({ isApp, vault }: { isApp: boolean; vault: boolean }): ProgressTab[] {
  return PROGRESS_TABS.filter((tab) => {
    if (tab === "pet-art") return !isApp;
    if (tab === "vault") return !isApp && vault;
    return true;
  });
}

/** A requested tab if this build shows it, else IMPACT. */
export function resolveProgressTab(requested: unknown, visible: readonly ProgressTab[]): ProgressTab {
  return typeof requested === "string" && (visible as readonly string[]).includes(requested)
    ? (requested as ProgressTab)
    : DEFAULT_PROGRESS_TAB;
}
