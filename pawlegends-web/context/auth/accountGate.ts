import { isRegisteredProfile } from "./authStatus";
import type { AccountReason, AccountResult, SessionProfile } from "./types";

/**
 * The promise side of `requireAccount(reason)` (plan F5.7), kept apart from React so its rules are
 * unit tested:
 *
 * - Every caller waiting at the same time shares one sheet and gets the same result.
 * - It resolves `signed-in` only for a profile fetched AFTER the request started (a refreshed
 *   `GET /user/profile`, tracked by a sequence number) whose `isGuest` is false. A profile that was
 *   already in memory never counts, and neither does a guest or transient one.
 * - It resolves `dismissed` when the player closes the sheet.
 * - It never polls for a token (the old `waitForLocalStorageKey` helper polls forever).
 */
export class AccountGate {
  private waiters: Array<(result: AccountResult) => void> = [];
  private minSeq = Number.POSITIVE_INFINITY;
  private currentReason: AccountReason | null = null;

  /** True while at least one caller waits. */
  get pending(): boolean {
    return this.waiters.length > 0;
  }

  /** The reason of the first waiting caller (it names the sheet), or null. */
  get reason(): AccountReason | null {
    return this.currentReason;
  }

  /**
   * Starts (or joins) a wait. `lastSeq` is the sequence number of the newest profile request
   * already started; only a later one may resolve this wait.
   */
  request(reason: AccountReason, lastSeq: number): Promise<AccountResult> {
    if (!this.pending) {
      this.currentReason = reason;
      this.minSeq = lastSeq + 1;
    }
    return new Promise<AccountResult>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Offers a fetched profile. Resolves every waiter with `signed-in` when the profile is a
   * registered account fetched after the wait began. Returns whether it resolved.
   */
  offerProfile(profile: SessionProfile | null | undefined, seq: number): boolean {
    if (!this.pending || seq < this.minSeq || !isRegisteredProfile(profile)) return false;
    this.settle("signed-in");
    return true;
  }

  /** The player closed the sheet. */
  dismiss(): void {
    if (this.pending) this.settle("dismissed");
  }

  private settle(result: AccountResult): void {
    const waiters = this.waiters;
    this.waiters = [];
    this.minSeq = Number.POSITIVE_INFINITY;
    this.currentReason = null;
    waiters.forEach((resolve) => resolve(result));
  }
}
