/**
 * The app's in-page host (sign-in): what the `/pawlegends/play` page does around the iframe on the web
 * (client/components/pawlegends/PawlegendsHost.tsx), for the native app, which has no Next page. It runs the web
 * host's own bridge (`createPawlegendsBridge`) over the same-window channel (channel.ts) and reuses the web host's
 * React-free modules: the save queue (`PawlegendsSaver`, the one write path `POST /user/catbassadors/live`), party
 * tickets and party saves, the game's API ops (`PawlegendsApi`), the roster rules for app builds (`rosterOf(cats,
 * true)`: starter and redeemed cats only), the champions' cards (never for sale here) and the store state.
 *
 * - `hello` → `app {isApp: true, store: false, notify: false}`, `session {signedIn, progress, name, provider}`,
 *   `roster`, `champions`, `store`.
 * - `request-sign-in`, `account {sign-in}` → the native sign-in sheet (sheet.ts); a guest is linked (same uid) or,
 *   when the identity already has an account, the player is asked before the guest's progress is merged
 *   (`POST /user/guest/merge`, which runs `mergeStoreProgress` server side). Matches played on this device without
 *   any user are offered after sign-in: "Add N matches played on this device to your account?".
 * - `account {sign-out}`; `account {delete}` / `{manage}` → the account deletion (App Store 5.1.1(v)): a last
 *   confirmation, a fresh Sign in with Apple code for an Apple account, `DELETE /user/me`, then a fresh guest-less
 *   start (local play goes on).
 * - Purchases stay hidden (App Store 3.1.1, Google Play payments): `open-cat`, `store-intent`, `notify`, offers and
 *   featured cats are never answered (the game does not even send them in the app, embed/bridge.ts
 *   NATIVE_HOST_TYPES); the bridge refuses a stray `purchase-intent` with `ok: false`.
 * - Offline and signed out, nothing is created and nothing is sent: matches wait on the device.
 */
import { claimQuestion } from "@/components/pawlegends/claim";
import { championsOf } from "@/components/pawlegends/championsBridge";
import { createPawlegendsBridge, storeStateOf, type PawlegendsBridge, type PawlegendsReplay, type PawlegendsSignInReason } from "@/components/pawlegends/bridge";
import { PawlegendsApi as GameApi } from "@/components/pawlegends/apiBridge";
import { PartySaves, PartyTickets } from "@/components/pawlegends/partySaves";
import { rosterOf } from "@/components/pawlegends/rosterBridge";
import { PawlegendsSaver } from "@/components/pawlegends/saves";
import { profileAfterSave, progressFromProfile, type PawlegendsLiveAnswer, type PawlegendsProfileFields } from "@/components/pawlegends/session";
import { clearLastMethod, rememberLastMethod } from "@/context/auth/lastMethod";
import type { ICat } from "@/models/cats";
import type { QueueStorage } from "@/components/heist/heistSaves";
import type { MatchSaveResult, PartyTicketResult } from "@/api/user-api";
import type { ApiAnswer, HostApi } from "./api";
import { providerOf, type AuthOutcome, type AuthPort, type ShellPlatform } from "./auth";
import type { HostChannel } from "./channel";
import type { HostUi } from "./sheet";

/** The app's bundle id: the backend revokes Sign in with Apple with this client id (APPLE_CLIENT_IDS). */
export const APPLE_CLIENT_ID = "com.tokentails.pawlegends";

export const DELETE_ERROR = "We couldn't delete your account just now. Try again, or write to hello@tokentails.com.";

export interface NativeHostDeps {
  channel: HostChannel;
  auth: AuthPort;
  api: HostApi;
  ui: HostUi;
  platform: ShellPlatform;
  online?: () => boolean;
  storage?: QueueStorage | null;
  /** Tests: run timers at once. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

export interface NativeHost {
  readonly bridge: PawlegendsBridge;
  /** Opens the sign-in sheet (the game's `request-sign-in` and `account {sign-in}`). */
  signIn(reason?: string): void;
  signOut(): Promise<void>;
  deleteAccount(): Promise<"deleted" | "cancelled" | "error">;
  /** Re-reads the profile and store and re-sends `session` (after a user change). */
  refresh(): Promise<void>;
  dispose(): void;
}

type Profile = PawlegendsProfileFields & { name?: unknown; cats?: unknown; transient?: boolean };

const okStatus = (s: number) => s >= 200 && s < 300;

export function startNativeHost(deps: NativeHostDeps): NativeHost {
  const { channel, auth, api, ui, platform } = deps;
  const online = deps.online ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  let profile: Profile | null = null;
  let profileUid: string | null = null;
  let rosterSent = false;
  let championsBody: unknown = null;
  let lastUid: string | null | undefined;
  let signInOpen = false;
  let disposed = false;
  /** A credential waiting for the player to sign in the original way (`link-account`), and its guest. */
  let pending: { credential: Extract<AuthOutcome, { kind: "link-account" }>["pending"]; guestToken: string | null } | null = null;

  const user = () => auth.current();
  const isAccount = () => {
    const u = user();
    return !!u && !u.isAnonymous;
  };

  // ---- saves (the web host's queue; the one write path) ---------------------------------------
  const live = async (pawlegends: unknown, signal?: AbortSignal): Promise<MatchSaveResult> => {
    const r = await api.call("POST", "/user/catbassadors/live", {
      auth: "guest",
      body: { type: "PAWLEGENDS", pawlegends, platform: platform === "android" ? "android" : "ios" },
      signal,
    });
    const out: MatchSaveResult = { ok: okStatus(r.status), status: r.status, code: (r.code as MatchSaveResult["code"]) ?? null };
    if (out.ok) out.body = r.body;
    if (r.retryAfter) out.retryAfter = r.retryAfter;
    const mine = (r.body as { mine?: unknown } | null)?.mine;
    if (r.status === 409 && typeof mine === "boolean") out.mine = mine;
    return out;
  };

  let bridge!: PawlegendsBridge;
  const saveStatus = (matchId: string, status: Parameters<PawlegendsBridge["saveResult"]>[0]["status"], answer: ReturnType<typeof answerOf>, code: string | null, fastest = true) => {
    bridge.saveResult({
      matchId,
      status,
      catnipPaid: answer?.catnipPaid ?? 0,
      catnipTotal: answer?.catnipCount ?? null,
      fastestWin: fastest ? (answer?.fastestWin ?? null) : null,
      ...(code ? { code } : {}),
      ...(answer?.season ? { season: answer.season } : {}),
    });
  };
  const answerOf = (detail: { answer: PawlegendsLiveAnswer | null }): PawlegendsLiveAnswer | null => detail.answer;

  const saver = new PawlegendsSaver({
    save: (replay, signal) => live(replay, signal),
    currentUid: () => user()?.uid ?? null,
    currentIsAnonymous: () => !!user()?.isAnonymous,
    ...(deps.storage !== undefined ? { storage: deps.storage } : {}),
    ...(deps.schedule ? { schedule: deps.schedule } : {}),
    onStatus: (matchId, status, detail) => {
      const answer = answerOf(detail);
      saveStatus(matchId, status, answer, detail.code);
      if (status === "saved" && answer) {
        if (profile && isAccount()) {
          profile = { ...profile, ...profileAfterSave(profile, answer) };
          sendSession();
        }
        if (answer.season) void refreshStore();
      }
    },
  });
  const partySaves = new PartySaves({
    save: (result) => live(result),
    ...(deps.schedule ? { schedule: (fn: () => void, ms: number) => void deps.schedule!(fn, ms) } : {}),
    onStatus: (matchId, status, detail) => {
      const answer = answerOf(detail);
      saveStatus(matchId, status, answer, detail.code, false);
      if (status === "saved" && answer?.season) void refreshStore();
    },
  });
  const partyTickets = new PartyTickets({
    mint: async (): Promise<PartyTicketResult> => {
      if (!(await auth.ensureGuest(online()))) return { ticket: null, status: 0, code: null };
      const r = await api.call("POST", "/pawlegends/party/ticket", { auth: "guest", body: {} });
      const ticket = (r.body as { ticket?: unknown } | null)?.ticket;
      return { ticket: okStatus(r.status) && typeof ticket === "string" ? ticket : null, status: r.status, code: (r.code as PartyTicketResult["code"]) ?? null };
    },
    answer: (id, ticket, error) => bridge.partyTicket(id, ticket, error),
  });
  const gameApi = new GameApi({
    fetch: async (route) => {
      const r: ApiAnswer = await api.call(route.method, route.path, {
        auth: route.auth === "none" ? "none" : route.auth === "any" ? "guest" : "account",
        ...(route.body ? { body: route.body } : {}),
      });
      return { status: r.status, body: r.body };
    },
    answer: (id, ok, status, body) => bridge.apiResult(id, ok, status, body),
    signedIn: isAccount,
  });

  // ---- what the game is told -------------------------------------------------------------------
  const sendSession = () => {
    // as on the web (PawlegendsHost): signed in follows Firebase, not the profile read. A persisted account that
    // launches offline (or whose profile read failed) still shows as signed in, so the chip offers Sign out and
    // Delete account instead of a "Sign in" that does nothing (signIn() refuses while an account is signed in).
    const signedIn = isAccount();
    const known = signedIn && !!profile && !profile.transient && profileUid === user()?.uid;
    const name = known && typeof profile?.name === "string" ? profile.name : null;
    bridge.setSession(signedIn, known ? progressFromProfile(profile) : null, name, signedIn ? providerOf(user()) : null);
    const cats = known && Array.isArray(profile?.cats) ? (profile!.cats as ICat[]) : [];
    if (signedIn || rosterSent) {
      bridge.setRoster(rosterOf(cats, true));
      rosterSent = true;
    }
    if (championsBody) bridge.setChampions(championsOf(championsBody, cats, true).cards);
  };

  const refreshProfile = async (): Promise<void> => {
    const u = user();
    if (!u || u.isAnonymous) {
      profile = null;
      profileUid = null;
      return;
    }
    const r = await api.call("GET", "/user/profile", { auth: "account" });
    if (user()?.uid !== u.uid) return;
    if (okStatus(r.status) && r.body && typeof r.body === "object") {
      profile = r.body as Profile;
      profileUid = u.uid;
    } else if (profileUid !== u.uid) profile = null;
  };

  async function refreshStore(): Promise<void> {
    if (!user()) {
      bridge.setStore({ items: [], season: null });
      return;
    }
    const r = await api.call("GET", "/pawlegends/me", { auth: "guest" });
    const state = okStatus(r.status) ? storeStateOf(r.body) : null;
    if (state) bridge.setStore(state);
  }

  const loadChampions = async (): Promise<void> => {
    const r = await api.call("GET", "/pawlegends/champions", { auth: "none" });
    if (!okStatus(r.status) || !r.body) return;
    championsBody = r.body;
    sendSession();
  };

  const refresh = async (): Promise<void> => {
    await refreshProfile();
    if (disposed) return;
    sendSession();
    await refreshStore();
  };

  // ---- sign-in -----------------------------------------------------------------------------------
  const maybeClaim = async (): Promise<void> => {
    const u = user();
    if (!u || u.isAnonymous) return;
    const count = saver.unclaimed().length;
    if (!count) return;
    const yes = await ui.ask({
      title: "Add your matches?",
      text: claimQuestion(count, true),
      fine: "Only add them if you played them. Someone else on this phone? Tap Not mine and they are deleted.",
      yes: "Add them",
      no: "Not mine",
      testid: "native-host-claim",
    });
    if (yes) {
      saver.take(u.uid);
      void saver.drain();
    } else saver.decline();
  };

  const merge = async (guestToken: string): Promise<void> => {
    const yes = await ui.ask({
      title: "Add your guest progress?",
      text: "You already played on this phone without an account. Add those matches and your Treat Track progress to the account you just signed in to?",
      fine: "Not now leaves them with the guest. You can't add them later.",
      yes: "Add to my account",
      no: "Not now",
      testid: "native-host-merge",
    });
    if (!yes) return;
    ui.toast("Adding your guest progress…");
    const token = guestToken.startsWith("fb") ? guestToken : `fb${guestToken}`;
    const r = await api.call("POST", "/user/guest/merge", { auth: "account", headers: { "x-guest-token": token } });
    ui.toast(okStatus(r.status) ? "Your guest progress is in your account." : "We couldn't add your guest progress just now.");
  };

  const finish = async (provider: "google" | "apple" | "email"): Promise<void> => {
    rememberLastMethod(provider, user()?.email ?? null);
    pending = null;
    signInOpen = false;
    ui.closeSheet();
    await refresh();
    if (saver.releaseGuestRuns() > 0) void saver.drain();
    void saver.drain();
    await maybeClaim();
  };

  const handle = async (outcome: AuthOutcome): Promise<void> => {
    switch (outcome.kind) {
      case "done":
        if (pending) {
          const p = pending;
          if (await auth.linkPending(p.credential)) ui.toast("Sign-in added to your account.");
          await finish(outcome.provider);
          if (p.guestToken) await merge(p.guestToken);
          return;
        }
        return finish(outcome.provider);
      case "merge": {
        // a guest who first tried Google or Apple (`link-account`) and now signed in the original way: that
        // sign-in comes back as a merge, and the waiting credential is added to the account first (the web does
        // the same, FirebaseAuthContext `case "merge"`)
        const p = pending;
        if (p && (await auth.linkPending(p.credential))) ui.toast("Sign-in added to your account.");
        await finish(outcome.provider);
        return merge(outcome.guestToken);
      }
      case "link-account":
        pending = { credential: outcome.pending, guestToken: outcome.guestToken };
        return ui.linkAccount(outcome.provider, outcome.email);
      case "verify":
        return ui.verify(outcome.email, outcome.justSent);
      case "cancelled":
        return ui.error({ code: "auth/user-cancelled" });
      case "error":
        return ui.error(outcome.error, outcome.native);
    }
  };

  const signIn = (reason = "sign-in"): void => {
    if (isAccount() || signInOpen) return;
    signInOpen = true;
    ui.openSignIn(reason, {
      oauth: (name) => void auth.oauth(name).then(handle, (error: unknown) => ui.error(error, true)),
      email: (tab, email, password) =>
        void (tab === "create" ? auth.createEmail(email, password) : auth.signInEmail(email, password)).then(handle, (error: unknown) => ui.error(error)),
      reset: (email) => auth.reset(email),
      resend: () => auth.resend(),
      checkVerified: async () => {
        const ok = await auth.checkVerified();
        if (ok) await finish("email");
        return ok;
      },
      closed: () => {
        signInOpen = false;
        pending = null;
      },
    });
  };

  const signOut = async (): Promise<void> => {
    try {
      await auth.signOut();
    } catch {
      // already signed out
    }
    api.resetGuestSession();
    profile = null;
    profileUid = null;
    sendSession();
    bridge.setStore({ items: [], season: null });
    ui.toast("Signed out. Your matches on this phone stay here.");
  };

  const deleteAccount = async (): Promise<"deleted" | "cancelled" | "error"> => {
    const u = user();
    if (!u || u.isAnonymous) return "cancelled";
    const yes = await ui.ask({
      title: "Delete your account?",
      text: "Your sign-in is deleted, your Token Tails profile is anonymised and your cats go back to the shelter pool. This cannot be undone.",
      fine: "The game keeps working without an account. Matches on this phone stay on this phone.",
      yes: "Delete forever",
      no: "Keep my account",
      danger: true,
      testid: "native-host-delete",
    });
    if (!yes) return "cancelled";
    let appleAuthorizationCode: string | undefined;
    if (platform !== "android" && u.providers.includes("apple.com") && auth.caps.apple) {
      try {
        appleAuthorizationCode = await auth.appleCode();
      } catch {
        appleAuthorizationCode = undefined;
      }
      if (!appleAuthorizationCode) {
        ui.toast("Apple sign-in was cancelled, so your account was not deleted.");
        return "cancelled";
      }
    }
    const r = await api.call("DELETE", "/user/me", {
      auth: "account",
      body: appleAuthorizationCode ? { appleAuthorizationCode, appleClientId: APPLE_CLIENT_ID } : {},
    });
    if (!okStatus(r.status)) {
      ui.toast(r.status === 429 ? "Too many tries. Wait a minute, then try again." : DELETE_ERROR);
      return "error";
    }
    clearLastMethod();
    try {
      await auth.signOut();
    } catch {
      // the account is gone either way
    }
    api.resetGuestSession();
    profile = null;
    profileUid = null;
    sendSession();
    bridge.setStore({ items: [], season: null });
    ui.toast("Your account was deleted. You can keep playing without one.");
    return "deleted";
  };

  // ---- the bridge ------------------------------------------------------------------------------
  bridge = createPawlegendsBridge({
    win: channel.win,
    origin: channel.origin,
    target: channel.target,
    handlers: {
      onMatchResult: (replay: PawlegendsReplay, _summary, matchId) =>
        void (async () => {
          // on the device first: an app killed mid-POST still has it (R3)
          saver.hold(matchId, replay);
          await auth.ensureGuest(online());
          await saver.submit(matchId, replay);
        })(),
      onPartyTicketRequest: (id) => void partyTickets.request(id),
      onPartyResult: (result) => void partySaves.submit(result),
      onApiRequest: (request) => void gameApi.request(request),
      onPassClaim: (row, tier) =>
        void (async () => {
          if (!(await auth.ensureGuest(online()))) return;
          const r = await api.call("POST", "/pawlegends/pass/claim", { auth: "guest", body: { seasonId: "s1", ...(row && tier ? { row, tier } : { all: true }) } });
          const state = okStatus(r.status) ? storeStateOf((r.body as { me?: unknown } | null)?.me) : null;
          if (state) bridge.setStore(state);
        })(),
      onRequestSignIn: (reason: PawlegendsSignInReason) => signIn(reason),
      onAccount: (action) => {
        if (action === "sign-in") signIn("sign-in");
        else if (action === "sign-out") void signOut();
        else void deleteAccount();
      },
    },
  });
  bridge.setApp(true, false, false);
  sendSession();

  const offChange = auth.onChange(() => {
    const uid = user()?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    api.resetGuestSession();
    void refresh().then(() => {
      if (saver.releaseGuestRuns() > 0) void saver.drain();
      void saver.drain();
    });
  });

  saver.start();
  void loadChampions();
  void refresh();

  return {
    bridge,
    signIn,
    signOut,
    deleteAccount,
    refresh,
    dispose() {
      disposed = true;
      offChange();
      saver.dispose();
      bridge.dispose();
    },
  };
}
