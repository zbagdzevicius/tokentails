/**
 * @jest-environment jsdom
 */
import {
  clearPendingMerge,
  isRetryableMergeError,
  PENDING_MERGE_KEY,
  readPendingMerge,
  savePendingMerge,
  tokenExpiry,
} from "@/context/auth/pendingMerge";

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: unknown) => `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;

beforeEach(() => sessionStorage.clear());

describe("pending guest merge (G1: no promise of a retry that cannot happen)", () => {
  it("reads the token's own expiry, with or without the fb prefix, and an hour when it can't", () => {
    expect(tokenExpiry(jwt({ exp: 2_000_000_000 }))).toBe(2_000_000_000_000);
    expect(tokenExpiry(`fb${jwt({ exp: 2_000_000_000 })}`)).toBe(2_000_000_000_000);
    expect(tokenExpiry("not-a-jwt", 1_000)).toBe(1_000 + 60 * 60 * 1000);
  });

  it("keeps the token in sessionStorage until it expires", () => {
    const token = jwt({ exp: 2_000 });
    savePendingMerge(token, "acc", 0);
    expect(JSON.parse(sessionStorage.getItem(PENDING_MERGE_KEY)!)).toEqual({
      guestToken: token,
      expiresAt: 2_000_000,
      targetUid: "acc",
    });
    expect(readPendingMerge("acc", 1_999_999)).toEqual({ guestToken: token, expiresAt: 2_000_000, targetUid: "acc" });
    expect(readPendingMerge("acc", 2_000_000)).toBeNull();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("ignores malformed values and clears on request", () => {
    sessionStorage.setItem(PENDING_MERGE_KEY, "{broken");
    expect(readPendingMerge("acc")).toBeNull();
    savePendingMerge("x", "acc", 0);
    clearPendingMerge();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("belongs to the account it was saved for: another account drops it, never merges it", () => {
    savePendingMerge("x", "account-a", 0);
    expect(readPendingMerge("account-b", 1)).toBeNull();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
    savePendingMerge("x", "account-a", 0);
    expect(readPendingMerge(null, 1)).toBeNull();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("keeps nothing without a target account, and drops entries saved before targetUid existed", () => {
    savePendingMerge("x", null, 0);
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
    sessionStorage.setItem(PENDING_MERGE_KEY, JSON.stringify({ guestToken: "x", expiresAt: 10 }));
    expect(readPendingMerge("acc", 1)).toBeNull();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("retries network, server and unverified-email failures only", () => {
    expect(isRetryableMergeError(0)).toBe(true);
    expect(isRetryableMergeError(503)).toBe(true);
    expect(isRetryableMergeError(403, "EMAIL_UNVERIFIED")).toBe(true);
    expect(isRetryableMergeError(409, "ACCOUNT_CONFLICT")).toBe(false);
    expect(isRetryableMergeError(401)).toBe(false);
    expect(isRetryableMergeError(403, "GUEST_FORBIDDEN")).toBe(false);
  });
});
