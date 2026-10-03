import { isOneOf, STARTER_BREEDS, type StarterBreed } from "@/shared-contracts/enums";

/**
 * Offline fallback for the starter commit (plan 2.13 row 8). Guests and accounts commit through
 * `POST /user/starter`; only when that request cannot reach the server is the choice kept here, so
 * the player is not sent through the ceremony again and the commit is retried on the next visit.
 *
 * Keyed by Firebase uid so a draft never lands on another account on a shared device. Every read
 * and write is wrapped: blocked storage just means no fallback.
 */
const KEY = "tt.starterDraft";
/** A draft older than this is dropped: the guest session it was made for has likely gone. */
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface StarterDraft {
  uid: string;
  breed: StarterBreed;
  name?: string;
  skipped?: boolean;
  savedAt: number;
}

export function saveDraft(draft: Omit<StarterDraft, "savedAt">, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Storage blocked: the next visit shows the ceremony again, which is safe.
  }
}

export function readDraft(uid: string | null | undefined, now = Date.now()): StarterDraft | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StarterDraft>;
    const valid =
      value &&
      value.uid === uid &&
      typeof value.savedAt === "number" &&
      now - value.savedAt < DRAFT_TTL_MS &&
      isOneOf(STARTER_BREEDS, value.breed);
    if (!valid) {
      if (value?.uid === uid) clearDraft();
      return null;
    }
    return {
      uid,
      breed: value.breed as StarterBreed,
      name: typeof value.name === "string" ? value.name : undefined,
      skipped: value.skipped === true,
      savedAt: value.savedAt as number,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
