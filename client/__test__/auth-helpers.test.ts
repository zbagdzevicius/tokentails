import { AUTH_COPY, isAuthCancel, mapAuthError, mapNativeAuthError } from "@/context/auth/authErrors";
import {
  capturePendingRef,
  PENDING_REF_KEY,
  readPendingRef,
  refFromSearch,
  sendPendingRefOnPromotion,
} from "@/context/auth/pendingRef";
import { isAppleFirst, isInAppBrowser } from "@/context/auth/platform";
import { createSaveNudge, SAVE_NUDGE_SESSION_KEY, SAVE_NUDGE_TIMER_MS } from "@/context/auth/saveNudge";
import { __resetSessionsForTests, ensureAnonymousOnce, ensureGuestSessionOnce, resetAnonymous } from "@/context/auth/sessions";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const REF_A = "64e2e0000000000000000aaa";
const REF_B = "64e2e0000000000000000bbb";

describe("pendingRef (F5.7, decision #12)", () => {
  it("stores ?ref once: the first referrer wins", () => {
    const store = memoryStore();
    expect(capturePendingRef(REF_A, null, store)).toBe(REF_A);
    expect(capturePendingRef(REF_B, null, store)).toBe(REF_A);
    expect(store.data.get(PENDING_REF_KEY)).toBe(REF_A);
  });

  it("ignores anything that is not a user id, and the player's own id", () => {
    const store = memoryStore();
    expect(capturePendingRef("<script>", null, store)).toBeNull();
    expect(capturePendingRef(["", REF_A], null, store)).toBeNull();
    expect(capturePendingRef(REF_A, REF_A, store)).toBeNull();
    expect(readPendingRef(store)).toBeNull();
    expect(capturePendingRef([REF_B, REF_A], null, store)).toBe(REF_B);
  });

  it("reads ref from a search string", () => {
    expect(refFromSearch(`?ref=${REF_A}&x=1`)).toBe(REF_A);
    expect(refFromSearch("?x=1")).toBeNull();
  });

  it("sends only on promotedNow, then clears", async () => {
    const store = memoryStore();
    capturePendingRef(REF_A, null, store);
    const send = jest.fn(async () => ({}));
    expect(await sendPendingRefOnPromotion({ _id: "me", isGuest: false } as never, send, store)).toBe("skipped");
    expect(await sendPendingRefOnPromotion({ _id: "me" }, send, store)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(await sendPendingRefOnPromotion({ _id: "me", promotedNow: true }, send, store)).toBe("sent");
    expect(send).toHaveBeenCalledWith(REF_A);
    expect(readPendingRef(store)).toBeNull();
    expect(await sendPendingRefOnPromotion({ _id: "me", promotedNow: true }, send, store)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the referrer after a network failure, drops it after a backend refusal", async () => {
    const store = memoryStore();
    capturePendingRef(REF_A, null, store);
    expect(await sendPendingRefOnPromotion({ promotedNow: true }, async () => Promise.reject(new TypeError("offline")), store)).toBe("failed");
    expect(readPendingRef(store)).toBe(REF_A);
    expect(
      await sendPendingRefOnPromotion({ promotedNow: true }, async () => Promise.reject({ status: 400 }), store)
    ).toBe("failed");
    expect(readPendingRef(store)).toBeNull();
  });

  it("never sends a self-referral", async () => {
    const store = memoryStore();
    store.setItem(PENDING_REF_KEY, REF_A);
    const send = jest.fn();
    expect(await sendPendingRefOnPromotion({ _id: REF_A, promotedNow: true }, send, store)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("mapAuthError (neutral copy, G9)", () => {
  const err = (code: string) => ({ code });

  it("never tells whether an account exists for an email", () => {
    const notFound = mapAuthError(err("auth/user-not-found"));
    const wrong = mapAuthError(err("auth/wrong-password"));
    const invalid = mapAuthError(err("auth/invalid-credential"));
    expect(notFound).toEqual(wrong);
    expect(wrong).toEqual(invalid);
    [notFound, wrong, invalid].forEach((copy) => {
      expect(copy?.message).not.toMatch(/no (such )?account|not found|doesn't exist|does not exist|not registered/i);
    });
  });

  it("is silent for a closed or cancelled popup", () => {
    expect(mapAuthError(err("auth/popup-closed-by-user"))).toBeNull();
    expect(mapAuthError(err("auth/cancelled-popup-request"))).toBeNull();
    expect(isAuthCancel(err("auth/popup-closed-by-user"))).toBe(true);
  });

  it("maps field errors to their input and unknowns to a generic message", () => {
    expect(mapAuthError(err("auth/invalid-email"))).toEqual({ message: AUTH_COPY.invalidEmail, field: "email" });
    expect(mapAuthError(err("auth/weak-password"))?.field).toBe("password");
    expect(mapAuthError(err("auth/too-many-requests"))?.message).toBe(AUTH_COPY.tooMany);
    expect(mapAuthError(new Error("boom"))).toEqual({ message: AUTH_COPY.unknown, field: null });
  });

  it("mapNativeAuthError keeps cancels silent on Android and iOS", () => {
    expect(mapNativeAuthError({ code: "12501", message: "Sign in canceled" })).toBeNull();
    expect(mapNativeAuthError({ message: "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)" })).toBeNull();
    expect(mapNativeAuthError(new Error("User cancelled the sign-in flow"))).toBeNull();
    expect(mapNativeAuthError({ code: "auth/network-request-failed" })?.message).toBe(AUTH_COPY.network);
    expect(mapNativeAuthError(new Error("something else"))?.message).toBe(AUTH_COPY.unknown);
  });
});

describe("platform order and in-app browsers (G9)", () => {
  const chromeMac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  const safariMac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
  const instagram = `${iphone} Instagram 300.0.0.0`;

  it("puts Apple first on iOS and Apple Safari, Google first elsewhere", () => {
    expect(isAppleFirst({ userAgent: iphone })).toBe(true);
    expect(isAppleFirst({ userAgent: safariMac })).toBe(true);
    expect(isAppleFirst({ platform: "ios" })).toBe(true);
    expect(isAppleFirst({ userAgent: chromeMac })).toBe(false);
    expect(isAppleFirst({ userAgent: android })).toBe(false);
    expect(isAppleFirst({ userAgent: chromeMac, maxTouchPoints: 5 })).toBe(true); // iPad, desktop mode
  });

  it("detects social app browsers, never the Capacitor app", () => {
    expect(isInAppBrowser({ userAgent: instagram })).toBe(true);
    expect(isInAppBrowser({ userAgent: `${android} [FBAN/FB4A;FBAV/450.0]` })).toBe(true);
    expect(isInAppBrowser({ userAgent: `${android} TikTok 32.0` })).toBe(true);
    expect(isInAppBrowser({ userAgent: iphone })).toBe(false);
    expect(isInAppBrowser({ userAgent: instagram, platform: "ios" })).toBe(false);
  });
});

describe("save nudges (decision #10)", () => {
  function harness() {
    const store = memoryStore();
    let pending: (() => void) | null = null;
    const nudge = createSaveNudge({
      store: () => store,
      setTimer: (fn) => {
        pending = fn;
        return 1;
      },
      clearTimer: () => {
        pending = null;
      },
    });
    const heard: string[] = [];
    nudge.subscribe((trigger) => heard.push(trigger));
    return { nudge, store, heard, tick: () => pending?.() };
  }

  it("fires once per session: the 10-minute timer, then nothing", () => {
    const { nudge, heard, tick, store } = harness();
    expect(SAVE_NUDGE_TIMER_MS).toBe(600_000);
    nudge.start();
    tick();
    expect(heard).toEqual(["timer"]);
    expect(nudge.firstClear()).toBe(false);
    expect(nudge.firstCodexEntry()).toBe(false);
    expect(heard).toEqual(["timer"]);
    expect(store.data.get(SAVE_NUDGE_SESSION_KEY)).toBe("1");
  });

  it("the first clear and the first codex entry nudge too, and stop the timer", () => {
    const { nudge, heard, tick } = harness();
    nudge.start();
    expect(nudge.firstClear()).toBe(true);
    tick();
    expect(heard).toEqual(["first-clear"]);
  });

  it("does nothing while disarmed (not a guest)", () => {
    const { nudge, heard, tick } = harness();
    expect(nudge.firstCodexEntry()).toBe(false);
    nudge.start();
    nudge.stop();
    tick();
    expect(heard).toEqual([]);
  });

  it("remembers a nudge shown earlier in the same browser session", () => {
    const store = memoryStore();
    store.setItem(SAVE_NUDGE_SESSION_KEY, "1");
    const nudge = createSaveNudge({ store: () => store, setTimer: () => 1, clearTimer: () => undefined });
    nudge.start();
    expect(nudge.firstClear()).toBe(false);
    expect(nudge.shown()).toBe(true);
  });
});

describe("single-flight sessions", () => {
  beforeEach(() => __resetSessionsForTests());

  it("signs in anonymously once for concurrent callers, and again after a failure or a reset", async () => {
    const signIn = jest.fn().mockRejectedValueOnce(new Error("off")).mockResolvedValue("ok");
    await expect(Promise.all([ensureAnonymousOnce(signIn), ensureAnonymousOnce(signIn)])).rejects.toThrow("off");
    expect(signIn).toHaveBeenCalledTimes(1);
    await expect(ensureAnonymousOnce(signIn)).resolves.toBe("ok");
    await ensureAnonymousOnce(signIn);
    expect(signIn).toHaveBeenCalledTimes(2);
    resetAnonymous();
    await ensureAnonymousOnce(signIn);
    expect(signIn).toHaveBeenCalledTimes(3);
  });

  it("creates the guest session once per uid; a failure is retried by the next write", async () => {
    const create = jest.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue(undefined);
    await expect(ensureGuestSessionOnce("u1", create)).resolves.toBe(false);
    await expect(Promise.all([ensureGuestSessionOnce("u1", create), ensureGuestSessionOnce("u1", create)])).resolves.toEqual([
      true,
      true,
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    await ensureGuestSessionOnce("u2", create);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
