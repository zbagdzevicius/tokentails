import { GameModal } from "@/models/game";

/**
 * Opening PROGRESS on a given tab (plan 2.13 row 29: the IMPACT tab is the in-game impact home;
 * the lobby RESCUE tile and ProfileModal's MY IMPACT row open PROGRESS on IMPACT).
 *
 * The lobby opens PROGRESS through the existing path, `setOpenedModal(GameModal.CODEX)`, which
 * takes no arguments. The tab travels beside it:
 * - `takeProgressTab()` returns the pending tab once and clears it. Codex calls it when it
 *   mounts (task 6a) and opens that tab.
 * - A `tt:progress-tab` window event carries `{ tab }` at the same moment, for a Codex that is
 *   already mounted.
 * A request older than `PROGRESS_TAB_TTL_MS` is dropped, so a stale tap never steers a later open.
 */

export const PROGRESS_TABS = [
  "impact",
  "rewards",
  "missions",
  "tiers",
  "pet-art",
  "badges",
  "vault",
] as const;
export type ProgressTab = (typeof PROGRESS_TABS)[number];

export const PROGRESS_TAB_EVENT = "tt:progress-tab";
/** Long enough for a lazily loaded Codex on a slow phone; 6a also clears it when PROGRESS closes. */
export const PROGRESS_TAB_TTL_MS = 20_000;

export interface ProgressTabDetail {
  tab: ProgressTab;
}

let pending: { tab: ProgressTab; at: number } | null = null;

/** Records the tab the next PROGRESS open should show and announces it. */
export function requestProgressTab(tab: ProgressTab, now: number = Date.now()): void {
  pending = { tab, at: now };
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(
      new CustomEvent<ProgressTabDetail>(PROGRESS_TAB_EVENT, { detail: { tab } })
    );
  }
}

/** The pending tab, without clearing it (null when none or expired). */
export function peekProgressTab(now: number = Date.now()): ProgressTab | null {
  if (!pending || now - pending.at > PROGRESS_TAB_TTL_MS) return null;
  return pending.tab;
}

/** The pending tab, once: the next call returns null. */
export function takeProgressTab(now: number = Date.now()): ProgressTab | null {
  const tab = peekProgressTab(now);
  pending = null;
  return tab;
}

/** Drops any pending tab (Codex calls this when PROGRESS closes, task 6a). */
export function clearProgressTab(): void {
  pending = null;
}

/** Opens PROGRESS (the CODEX modal) on `tab` through the existing open path. */
export function openProgress(
  setOpenedModal: (modal: GameModal | null) => void,
  tab: ProgressTab = "impact"
): void {
  requestProgressTab(tab);
  setOpenedModal(GameModal.CODEX);
}
