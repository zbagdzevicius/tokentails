import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useOptionalFirebaseAuth, type AccountReason } from "@/context/FirebaseAuthContext";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Account gating for player actions (plan G1 `requireAccount` bullet, decision #9; task 4c).
 *
 * `runWithAccount(reason, action)`:
 * - a registered account (`authStatus === "ready"`) runs `action` at once, no sheet;
 * - anyone else (a guest, a signed-out visitor, a profile still loading) gets
 *   `requireAccount(reason)`. `dismissed` does nothing and resolves `undefined`. `signed-in`
 *   waits until React has committed the account (status `ready`, so the profile context holds the
 *   account's profile), then runs `action`;
 * - without a FirebaseAuthProvider on the page (`/packs`), `action` runs as before.
 *
 * When the sheet was shown, `action` runs after an await, so it must read state (the profile,
 * `setProfileUpdate`) through `useLatest`, never through a closure captured at the tap: that one
 * still holds the guest profile and would write it back.
 */
export function useAccountAction() {
  const auth = useOptionalFirebaseAuth();
  const authRef = useRef(auth);
  const readyWaiters = useRef<Array<() => void>>([]);

  useIsomorphicLayoutEffect(() => {
    authRef.current = auth;
    if (auth?.authStatus === "ready" && readyWaiters.current.length) {
      const waiters = readyWaiters.current;
      readyWaiters.current = [];
      waiters.forEach((resolve) => resolve());
    }
  });

  const runWithAccount = useCallback(
    async <T,>(reason: AccountReason, action: () => T | Promise<T>): Promise<T | undefined> => {
      const current = authRef.current;
      if (!current || current.authStatus === "ready") return action();
      const result = await current.requireAccount(reason);
      if (result !== "signed-in") return undefined;
      if (authRef.current?.authStatus !== "ready") {
        await new Promise<void>((resolve) => readyWaiters.current.push(resolve));
      }
      // One more task, so effects that copy the new profile into refs have run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return action();
    },
    []
  );

  return {
    runWithAccount,
    /** True for a guest (anonymous, transient or persisted guest document). */
    isGuest: auth?.authStatus === "guest",
    /** A registered account with its profile. */
    isRegistered: auth?.authStatus === "ready",
    /** A provider is on the page (false on `/packs`). */
    hasAuth: !!auth,
    authStatus: auth?.authStatus,
  };
}

/** The latest committed value in a ref, for handlers that run after an await. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export default useAccountAction;
