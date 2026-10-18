import { analytics } from "@/analytics";
import { buildPawlegendsEvent } from "@/analytics/pawlegends-events";
import { CAT_API } from "@/api/cat-api";
import { USER_API } from "@/api/user-api";
import { getAudioSettings, subscribeAudioSettings, type AudioSettings } from "@/components/audio/settings";
import { isAppBuild } from "@/components/claims/build";
import { registerHeistSuspension } from "@/components/heist/suspension";
import { CloseButton } from "@/components/shared/CloseButton";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import type { ICat } from "@/models/cats";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPawlegendsBridge,
  shareUrlOf,
  type PawlegendsBridge,
  type PawlegendsNotifyWhere,
  type PawlegendsSignInReason,
} from "./bridge";
import {
  browserStorage,
  createPawlegendsApi,
  deviceId,
  isEmail,
  nextSession,
  readToken,
  RETURN_QUERY_KEYS,
  returnActionOf,
  writeToken,
  type PawlegendsApi,
  type StoreStatus,
} from "./checkout";
import { pickFeatured, storefrontCats, type FeaturedPick } from "./featuredBridge";
import { PAWLEGENDS_EXIT_PATH, PAWLEGENDS_FRAME_SRC } from "./flags";
import { rosterOf } from "./rosterBridge";
import { PawlegendsSaver } from "./saves";
import { openedFrom, profileAfterSave, progressFromProfile, type PawlegendsProfileFields } from "./session";
import { PAWLEGENDS_TITLE } from "./title";

// The Token Tails checkout (Stripe Elements, the crypto checkout) is browser only and loads on first use.
const PawlegendsCatSheet = dynamic(() => import("./PawlegendsCatSheet").then((m) => m.PawlegendsCatSheet), {
  ssr: false,
});

export const PAWLEGENDS_FRAME_TESTID = "pawlegends-frame";
/** Left over from the `pl_*` Checkout redirect; cleared on a return. */
export const PAWLEGENDS_PENDING_KEY = "tt.pawlegends.pending.v1";
/** After a `pl_*` Checkout the webhook may lag: the host asks for the items this many times, this far apart. */
export const ENTITLEMENT_POLLS = 6;
export const ENTITLEMENT_POLL_MS = 2_000;
/** How long a finished match waits for Firebase to report its user before it counts as "no user". */
const AUTH_WAIT_MS = 5_000;

const SAFE_FRAME_STYLE = {
  top: "env(safe-area-inset-top)",
  left: "env(safe-area-inset-left)",
  width: "calc(100% - env(safe-area-inset-left) - env(safe-area-inset-right))",
  height: "calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
} as const;

function track(event: Parameters<typeof analytics.track>[0]) {
  try {
    analytics.track(event);
  } catch {
    // Analytics never breaks the game.
  }
}

/** The claim prompt's question (the Heist's decision #18 wording). */
export function claimQuestion(count: number, account: boolean): string {
  const matches = count === 1 ? "1 match" : `${count} matches`;
  return account
    ? `Add ${matches} played on this device to your account?`
    : `Add ${matches} played on this device to your game progress?`;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface PawlegendsHostProps {
  /** The store and offer API (tests pass a fake). */
  api?: PawlegendsApi;
  /** Full page loads (the exit). Defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
  /** Override `isAppBuild()` (tests). */
  isApp?: boolean;
  /** Override the `/live` POST (tests). */
  saveMatch?: typeof USER_API.saveMatchDetailed;
  /** Override `GET /cat/sale` (tests). */
  loadStorefront?: () => Promise<Record<string, unknown> | null>;
  /** The delay between entitlement polls (tests pass 0). */
  pollMs?: number;
}

/**
 * The `/pawlegends` host: the game full-bleed in a same-origin iframe (`/pawlegends-game/index.html?embed=1`) inside
 * the Token Tails games ecosystem.
 *
 * - **Account.** An existing Firebase session is reused (`authMode="optional"`); the game asks for sign-in with
 *   `request-sign-in` ("Save your wins") and the AuthSheet opens. `session {signedIn, progress}` is re-sent on
 *   every change, so unlocks and fastest wins follow the account across devices.
 * - **Saves.** Every match goes through `POST /user/catbassadors/live` (`./saves`), keyed by the game's `matchId`;
 *   each step is told to the game as `save-result` (the results screen's save chip and "+20 catnip"). A first
 *   win per difficulty pays catnip within `PAWLEGENDS_LEVEL_CAPS`. Matches played with no account wait on the
 *   device and the "ADD YOUR MATCHES?" prompt asks after sign-in.
 * - **Cards.** The player's Token Tails cats are the roster (art and catalog id included). Up to two unowned
 *   direct-purchase cats from `GET /cat/sale` are `featured`, and `GET /pawlegends/offer` may name one of them as
 *   the session's single "Meet" card (never in session 1). `open-cat` opens the Token Tails $5 named-cat
 *   checkout (`PawlegendsCatSheet`); the bought cat joins the roster at once. Never packs, never random.
 * - **App builds** (Capacitor) play the game with starter and redeemed cats only: `store: false`, no featured
 *   cats, no offer, and `open-cat` is dropped (Apple 3.1.1 and 3.1.3(b)).
 */
export const PawlegendsHost = ({
  api: apiProp,
  navigate,
  isApp: isAppProp,
  saveMatch,
  loadStorefront,
  pollMs = ENTITLEMENT_POLL_MS,
}: PawlegendsHostProps) => {
  const isApp = isAppProp ?? isAppBuild();
  const api = useMemo(() => apiProp ?? createPawlegendsApi(), [apiProp]);
  const auth = useOptionalFirebaseAuth();
  const { profile, setProfileUpdate } = useProfile();
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<PawlegendsBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<"connecting" | "slow" | "timeout" | "ready">("connecting");
  const [frameKey, setFrameKey] = useState(0);
  const [suspended, setSuspended] = useState(false);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  // The stored token is never rendered, so reading it on the first client render cannot break hydration.
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : readToken()));
  const [note, setNote] = useState<string | null>(null);
  const [unclaimed, setUnclaimed] = useState(0);
  const [claimDismissed, setClaimDismissed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [forSale, setForSale] = useState<ICat[] | null>(null);
  const [sheet, setSheet] = useState<{ cat: ICat; owned: boolean } | null>(null);
  const [notifyWhere, setNotifyWhere] = useState<PawlegendsNotifyWhere | null>(null);

  const uid = auth?.user?.uid ?? null;
  // Without an auth provider the page behaves as signed out.
  const authStatus = auth ? auth.authStatus : "signed-out";
  const signedIn = !!auth?.user && !auth.user.isAnonymous && authStatus === "ready";
  const go = useCallback((url: string) => (navigate ?? ((u: string) => window.location.assign(u)))(url), [navigate]);

  // Refs follow the latest render (synced in an effect, never written during render).
  const latest = useRef({ uid, anonymous: !!auth?.user?.isAnonymous, signedIn, authStatus, profile, setProfileUpdate, auth });
  useEffect(() => {
    latest.current = { uid, anonymous: !!auth?.user?.isAnonymous, signedIn, authStatus, profile, setProfileUpdate, auth };
  });
  const authWaiters = useRef(new Set<() => void>());
  useEffect(() => {
    if (authStatus === "unknown") return;
    authWaiters.current.forEach((resolve) => resolve());
    authWaiters.current.clear();
  }, [authStatus]);
  /** Resolves once Firebase has reported (or after AUTH_WAIT_MS). */
  const authKnown = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (latest.current.authStatus !== "unknown" || !latest.current.auth) return resolve();
        const done = () => {
          clearTimeout(timer);
          authWaiters.current.delete(done);
          resolve();
        };
        const timer = setTimeout(done, AUTH_WAIT_MS);
        authWaiters.current.add(done);
      }),
    []
  );

  // ---- saves -----------------------------------------------------------------------------------
  const saveRef = useRef(saveMatch ?? USER_API.saveMatchDetailed);
  useEffect(() => {
    saveRef.current = saveMatch ?? USER_API.saveMatchDetailed;
  });
  const saver = useMemo(
    () =>
      new PawlegendsSaver({
        save: (replay) => saveRef.current({ type: GameType.PAWLEGENDS, pawlegends: replay }),
        currentUid: () => latest.current.uid,
        currentIsAnonymous: () => latest.current.anonymous,
        onStatus: (matchId, saveStatus, detail) => {
          const answer = detail.answer;
          bridgeRef.current?.saveResult({
            matchId,
            status: saveStatus,
            catnipPaid: answer?.catnipPaid ?? 0,
            catnipTotal: answer?.catnipCount ?? null,
            fastestWin: answer?.fastestWin ?? null,
            ...(detail.code ? { code: detail.code } : {}),
          });
          if (saveStatus !== "saving") {
            track(buildPawlegendsEvent("pawlegends_save", { status: saveStatus, catnipPaid: answer?.catnipPaid ?? 0 }));
          }
          if (saveStatus === "saved" && answer) {
            // The next `session` carries the new progress at once; a paid first win also refreshes the profile
            // (the catnip total and the leaderboard position).
            const { profile: current, setProfileUpdate: update, auth: authNow } = latest.current;
            if (current) update(profileAfterSave(current as PawlegendsProfileFields, answer) as never);
            if (answer.catnipPaid > 0) void authNow?.refreshProfile?.().catch(() => undefined);
          }
          if (saveStatus === "queued" && detail.outcome === "device") setNote(null);
        },
        onStalePurged: () => setNote("An older match could not be saved after an update"),
        onChange: () => setUnclaimed(saver.unclaimed().length),
      }),
    []
  );
  useEffect(() => {
    saver.start();
    setUnclaimed(saver.unclaimed().length);
    return () => saver.dispose();
  }, [saver]);
  // Queued matches of the signed-in uid go out once its profile is in. Matches of an anonymous guest that is
  // gone (signed in to another uid) go back to the claim prompt.
  useEffect(() => {
    if (!uid || (authStatus !== "ready" && authStatus !== "guest")) return;
    if (saver.releaseGuestRuns() > 0) setClaimDismissed(false);
    void saver.drain();
  }, [uid, authStatus, saver]);

  const claimOpen = !!uid && (authStatus === "ready" || authStatus === "guest") && unclaimed > 0 && !claimDismissed;
  const claim = async () => {
    if (!uid) return;
    setClaiming(true);
    const count = saver.unclaimed().length;
    try {
      await saver.claim(uid);
    } finally {
      setClaiming(false);
      setClaimDismissed(true);
    }
    track(buildPawlegendsEvent("pawlegends_guest_claim", { count, choice: "add" }));
  };
  const decline = () => {
    track(buildPawlegendsEvent("pawlegends_guest_claim", { count: saver.unclaimed().length, choice: "decline" }));
    saver.decline();
    setClaimDismissed(true);
  };

  // ---- the legacy `pl_*` items -------------------------------------------------------------------
  const keepToken = useCallback((next: string | null) => {
    writeToken(next);
    setToken(next);
  }, []);
  // A stored token is refreshed once per visit, so earlier items stay restorable (web only).
  useEffect(() => {
    if (isApp) return;
    const stored = readToken();
    if (!stored) return;
    let live = true;
    void api.refresh(stored).then((result) => {
      if (!live) return;
      if (result.ok && result.body) keepToken(result.body.token);
      else if (result.status === 401) keepToken(null);
    });
    return () => {
      live = false;
    };
  }, [api, isApp, keepToken]);
  // Whether the backend can send email (the notify-me list).
  useEffect(() => {
    if (isApp) return;
    let live = true;
    void api.status().then((result) => {
      if (live) setStatus(result.ok && result.body ? result.body : { store: false, email: false, termsVersion: null, skus: [] });
    });
    return () => {
      live = false;
    };
  }, [api, isApp]);

  // A `pl_*` Checkout return, a restore link or a notify confirmation: handled once, then dropped from the address
  // bar. `from` (the picker link) only feeds `pawlegends_open`.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!router?.isReady || handledReturn.current) return;
    handledReturn.current = true;
    const query = router.query ?? {};
    track(buildPawlegendsEvent("pawlegends_open", { from: openedFrom(typeof window === "undefined" ? "" : window.location.search) }));
    const action = returnActionOf(query);
    if (!action && query.from === undefined) return;
    const rest = { ...query };
    for (const key of [...RETURN_QUERY_KEYS, "from"]) delete rest[key];
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
    if (isApp || !action) return;
    try {
      browserStorage()?.removeItem(PAWLEGENDS_PENDING_KEY);
    } catch {
      // Blocked storage.
    }
    void (async () => {
      if (action.kind === "checkout-cancel") return;
      if (action.kind === "checkout-ok") {
        setNote("Getting your items…");
        for (let i = 0; i < ENTITLEMENT_POLLS; i++) {
          const result = await api.entitlementsForSession(action.sessionId);
          if (result.ok && result.body) {
            keepToken(result.body.token);
            if (result.body.items.length) {
              setNote("Your items are in the lobby");
              return;
            }
          }
          if (i < ENTITLEMENT_POLLS - 1) await wait(pollMs);
        }
        setNote("Payment received. Your items will appear shortly.");
        return;
      }
      if (action.kind === "restore") {
        const result = await api.verifyRestore(action.t);
        if (result.ok && result.body) {
          keepToken(result.body.token);
          setNote("Your items are restored");
        } else setNote("That restore link has expired.");
        return;
      }
      const result = await api.confirmNotify(action.t);
      setNote(result.ok ? "You are on the Legends Pass list" : "That link has expired.");
    })();
  }, [router, api, isApp, keepToken, pollMs]);

  // ---- cards: roster, featured, offer ---------------------------------------------------------------
  const ownedCats = useMemo(() => (uid ? ((profile?.cats as ICat[] | undefined) ?? []) : []), [uid, profile?.cats]);
  const roster = useMemo(() => rosterOf(ownedCats, isApp), [ownedCats, isApp]);
  // The storefront once per visit (web only); the featured pick follows the owned cats.
  useEffect(() => {
    if (isApp) return;
    let live = true;
    const load = loadStorefront ?? (async () => (await CAT_API.storefront()).cats as unknown as Record<string, unknown>);
    void load()
      .then((front) => live && setForSale(storefrontCats(front)))
      .catch(() => live && setForSale([]));
    return () => {
      live = false;
    };
  }, [isApp, loadStorefront]);
  const featured: FeaturedPick = useMemo(
    () => (isApp || !forSale ? { cats: [], byId: new Map() } : pickFeatured(forSale, ownedCats, roster)),
    [isApp, forSale, ownedCats, roster]
  );

  const sessionRef = useRef<number | null>(null);
  const offerAsked = useRef(false);
  const offerRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionRef.current === null) sessionRef.current = nextSession();
  }, []);

  // ---- bridge ----------------------------------------------------------------------------------
  const handlers = useRef<{
    onRequestSignIn: (reason: PawlegendsSignInReason) => void;
    onOpenCat: (catalogId: string) => void;
    onOfferSeen: (catalogId: string) => void;
    onNotify: (where: PawlegendsNotifyWhere) => void;
  }>({ onRequestSignIn: () => undefined, onOpenCat: () => undefined, onOfferSeen: () => undefined, onNotify: () => undefined });
  useEffect(() => {
    handlers.current = {
      onRequestSignIn: (reason) => {
        track(buildPawlegendsEvent("pawlegends_signin_prompt", { reason }));
        void auth?.requireAccount(reason).catch(() => undefined);
      },
      onOpenCat: (catalogId) => {
        if (isApp) return;
        const forSaleCat = featured.byId.get(catalogId);
        const ownedCat = ownedCats.find((c) => roster.some((r) => r.id === c._id && r.catalogId === catalogId));
        if (!forSaleCat && !ownedCat) return;
        track(
          buildPawlegendsEvent("pawlegends_meet_open", {
            catalogId,
            from: ownedCat ? "roster" : offerRef.current === catalogId ? "offer" : "featured",
          })
        );
        if (ownedCat) {
          setSheet({ cat: ownedCat, owned: true });
          return;
        }
        const open = () => setSheet({ cat: forSaleCat!, owned: false });
        if (latest.current.signedIn) return open();
        track(buildPawlegendsEvent("pawlegends_signin_prompt", { reason: "purchase" }));
        if (!auth) {
          bridgeRef.current?.purchaseResult(catalogId, false);
          return;
        }
        void auth.requireAccount("purchase").then(
          (result) => (result === "signed-in" ? open() : bridgeRef.current?.purchaseResult(catalogId, false)),
          () => bridgeRef.current?.purchaseResult(catalogId, false)
        );
      },
      onOfferSeen: (catalogId) => {
        void api.offerSeen({ deviceId: deviceId(), session: sessionRef.current ?? 1, catalogId });
      },
      onNotify: (where) => {
        if (!isApp && status?.email) setNotifyWhere(where);
      },
    };
  });

  useEffect(() => {
    const origin = window.location.origin;
    const bridge = createPawlegendsBridge({
      win: window,
      origin: origin && origin !== "null" ? origin : null,
      target: () => frameRef.current?.contentWindow ?? null,
      handlers: {
        onReady: () => setBridgeState("ready"),
        onSlow: () => setBridgeState((s) => (s === "connecting" ? "slow" : s)),
        onTimeout: () => setBridgeState((s) => (s === "ready" ? s : "timeout")),
        onMatchResult: (replay, _summary, matchId) =>
          void (async () => {
            await authKnown();
            await saver.submit(matchId, replay);
          })(),
        onRequestSignIn: (reason) => handlers.current.onRequestSignIn(reason),
        onOpenCat: (catalogId) => handlers.current.onOpenCat(catalogId),
        onOfferSeen: (catalogId) => handlers.current.onOfferSeen(catalogId),
        onNotify: (where) => handlers.current.onNotify(where),
        onShare: (_kind, url) => {
          const safe = shareUrlOf(url, window.location.origin);
          if (!safe) return;
          const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
          if (typeof nav.share === "function") void nav.share({ url: safe, title: PAWLEGENDS_TITLE }).catch(() => undefined);
          else void nav.clipboard?.writeText(safe).then(() => setNote("Link copied"), () => undefined);
        },
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [authKnown, saver]);

  // `app.store`: the Token Tails cat checkout is reachable (web). `notify`: the backend can send the email.
  const notify = !isApp && !!status?.email;
  useEffect(() => {
    bridgeRef.current?.setApp(isApp, !isApp, notify);
  }, [isApp, notify]);
  const progressKey = JSON.stringify(progressFromProfile(profile as PawlegendsProfileFields | null));
  const progress = useMemo(() => {
    const p = profile as (PawlegendsProfileFields & { transient?: boolean }) | null | undefined;
    return uid && p && !p.transient ? progressFromProfile(p) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, progressKey]);
  useEffect(() => {
    bridgeRef.current?.setSession(signedIn, progress);
  }, [signedIn, progress, bridgeState]);
  useEffect(() => {
    bridgeRef.current?.setEntitlements(isApp ? null : token);
  }, [isApp, token]);
  useEffect(() => {
    bridgeRef.current?.setRoster(roster);
  }, [roster]);
  useEffect(() => {
    bridgeRef.current?.setFeatured(featured.cats);
  }, [featured]);
  useEffect(() => {
    const send = (settings: AudioSettings) =>
      bridgeRef.current?.setAudio({ muted: settings.muted, music: settings.musicVolume, sfx: settings.effectsVolume });
    send(getAudioSettings());
    return subscribeAudioSettings(send);
  }, []);

  // The session's one offer: asked once per visit, after the game is ready and the featured cats are known.
  useEffect(() => {
    if (isApp || offerAsked.current || bridgeState !== "ready" || !featured.cats.length) return;
    if (authStatus === "unknown" || authStatus === "loading-profile") return;
    offerAsked.current = true;
    void api
      .offer({
        deviceId: deviceId(),
        session: sessionRef.current ?? 1,
        catalogIds: featured.cats.map((c) => c.catalogId),
        token: readToken(),
      })
      .then((result) => {
        const offer = result.ok ? result.body?.offer ?? null : null;
        if (offer && bridgeRef.current?.setOffer(offer)) offerRef.current = offer.catalogId;
      });
  }, [api, isApp, bridgeState, featured, authStatus]);

  useEffect(
    () =>
      registerHeistSuspension({
        onSuspend: () => {
          setSuspended(true);
          bridgeRef.current?.pause();
        },
        onResume: () => {
          setSuspended(false);
          bridgeRef.current?.resume();
        },
      }),
    []
  );

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 6000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const onFrameLoad = useCallback(() => {
    if (bridgeRef.current?.ready) bridgeRef.current.reconnect();
  }, []);
  const reload = () => {
    setBridgeState("connecting");
    setFrameKey((k) => k + 1);
    bridgeRef.current?.reconnect();
  };

  const onBought = (cat: ICat, got: ICat) => {
    const catalogId = String(cat._id).toLowerCase();
    track(buildPawlegendsEvent("pawlegends_cat_purchase", { ok: true }));
    bridgeRef.current?.purchaseResult(catalogId, true);
    // The new cat is in the roster before the game hears anything else.
    bridgeRef.current?.setRoster(rosterOf([...ownedCats, got], isApp));
  };
  const closeSheet = (bought: ICat | null) => {
    if (sheet && !sheet.owned && !bought) {
      track(buildPawlegendsEvent("pawlegends_cat_purchase", { ok: false }));
      bridgeRef.current?.purchaseResult(String(sheet.cat._id).toLowerCase(), false);
    }
    setSheet(null);
  };

  const reloadClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-tt-night-950 bg-tt-gold-400 px-4 font-sans text-p6 font-bold text-tt-night-950 shadow-[0_2px_0_rgb(var(--tt-night-950))] outline-none focus-visible:ring-4 focus-visible:ring-tt-cream";

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-tt-night-900"
      style={{ touchAction: "none", overscrollBehavior: "none" }}
      data-testid="pawlegends-host"
      data-bridge={bridgeState}
      data-store={isApp ? "0" : "1"}
      data-suspended={suspended ? "1" : undefined}
    >
      <iframe
        key={frameKey}
        ref={frameRef}
        src={PAWLEGENDS_FRAME_SRC}
        title={PAWLEGENDS_TITLE}
        data-testid={PAWLEGENDS_FRAME_TESTID}
        className="absolute border-0 bg-tt-night-900"
        style={SAFE_FRAME_STYLE}
        allow="autoplay; fullscreen; gamepad"
        onLoad={onFrameLoad}
        inert={suspended}
      />
      <div
        className="fixed z-10"
        data-testid="pawlegends-exit"
        style={{ top: "calc(env(safe-area-inset-top) + 6px)", left: "calc(env(safe-area-inset-left) + 6px)" }}
      >
        <CloseButton label="Back to games" onClick={() => go(PAWLEGENDS_EXIT_PATH)} className="!static lg:!h-[44px] lg:!w-[44px]" />
      </div>
      {note && (
        <div
          role="status"
          data-testid="pawlegends-note"
          className="fixed left-1/2 z-10 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border-2 border-tt-night-950 bg-tt-night-900/90 px-3 py-1 font-sans text-p6 font-bold text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))]"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {note}
        </div>
      )}
      {bridgeState === "slow" && (
        <div
          role="status"
          data-testid="pawlegends-slow"
          className="fixed left-1/2 top-14 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-tt-night-950 bg-tt-night-900/90 py-1 pl-3 pr-1 font-sans text-p6 font-bold text-tt-cream"
        >
          <span>Still loading {PAWLEGENDS_TITLE}…</span>
          <button type="button" onClick={reload} className={reloadClass}>
            Reload
          </button>
        </div>
      )}
      {bridgeState === "timeout" && (
        <div
          role="alert"
          data-testid="pawlegends-timeout"
          className="fixed inset-0 z-[9] flex flex-col items-center justify-center gap-4 bg-tt-night-900/95 px-4 text-center"
        >
          <p className="font-sans text-p5 font-bold text-tt-cream">{PAWLEGENDS_TITLE} is taking too long to load.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={reload} className={reloadClass}>
              Reload
            </button>
            <a href={PAWLEGENDS_EXIT_PATH} className="font-sans text-p5 font-bold text-tt-gold-400 underline underline-offset-4">
              Back to games
            </a>
          </div>
        </div>
      )}
      <GameModal
        open={claimOpen}
        onOpenChange={(open) => {
          if (!open) setClaimDismissed(true);
        }}
        title="ADD YOUR MATCHES?"
        icon="gamepad"
        description={claimQuestion(unclaimed, signedIn)}
        size="sm"
        name="pawlegends-claim"
        canClose={!claiming}
      >
        <div className="flex flex-col gap-4" data-testid="pawlegends-claim">
          <p className="flex items-start gap-2 font-sans text-p5 font-semibold leading-snug text-tt-cream">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-tt-sky">
              <PixelIcon name="info-box" size={18} />
            </span>
            Only add them if you played them. Someone else on this device? Tap Not mine and they are deleted.
          </p>
          <ActionRow align="center">
            <ModalButton variant="primary" icon="check" onClick={() => void claim()} busy={claiming}>
              ADD THEM
            </ModalButton>
            <ModalButton variant="secondary" icon="close" onClick={decline} disabled={claiming}>
              NOT MINE
            </ModalButton>
          </ActionRow>
        </div>
      </GameModal>
      {sheet && !sheet.owned && (
        <PawlegendsCatSheet cat={sheet.cat} onBought={(got) => onBought(sheet.cat, got)} onClose={closeSheet} />
      )}
      {sheet?.owned && <OwnedCatSheet cat={sheet.cat} onClose={() => setSheet(null)} />}
      {notifyWhere && (
        <NotifySheet
          api={api}
          where={notifyWhere}
          initialEmail={auth?.user?.email ?? ""}
          onClose={() => setNotifyWhere(null)}
        />
      )}
    </div>
  );
};

/** A cat the player already has: its card and what it does in the game. No checkout. */
const OwnedCatSheet = ({ cat, onClose }: { cat: ICat; onClose: () => void }) => (
  <GameModal
    open
    onOpenChange={(open) => !open && onClose()}
    title={`${cat.name} is in your squad`}
    icon="paw"
    size="sm"
    surface="panel"
    name="pawlegends-owned-cat"
  >
    <div className="flex flex-col items-center gap-4 text-center" data-testid="pawlegends-owned-cat">
      <p className="font-sans text-p5 font-semibold text-tt-cream">Pick it as a companion on the hero screen.</p>
      <ModalButton variant="primary" icon="check" onClick={onClose}>
        PLAY
      </ModalButton>
    </div>
  </GameModal>
);

/** "Notify me" for news of the next season (`POST /pawlegends/notify`, confirmed by email). */
const NotifySheet = ({
  api,
  where,
  initialEmail,
  onClose,
}: {
  api: PawlegendsApi;
  where: PawlegendsNotifyWhere;
  initialEmail: string;
  onClose: () => void;
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!isEmail(email)) return setLine("Enter your email first.");
    setBusy(true);
    const result = await api.notify(email.trim(), where === "store" ? "store" : "results");
    setBusy(false);
    setLine(result.ok ? "Check your inbox to confirm." : "That did not work. Try again in a few minutes.");
  };
  return (
    <GameModal open onOpenChange={(open) => !open && onClose()} title="Season news" icon="mail" size="sm" surface="panel" name="pawlegends-notify">
      <div className="flex flex-col gap-3 font-sans text-p5 text-tt-cream" data-testid="pawlegends-notify-sheet">
        <label className="flex flex-col gap-1">
          <span>Email (one confirmation, then season news only)</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] w-full rounded-md border-2 border-tt-night-950 bg-tt-cream px-3 font-sans text-p5 text-tt-night-950 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
            data-testid="pawlegends-notify-email"
          />
        </label>
        {line && <p role="status">{line}</p>}
        <ActionRow>
          <ModalButton variant="primary" icon="check" onClick={() => void send()} busy={busy} data-testid="pawlegends-notify-send">
            NOTIFY ME
          </ModalButton>
          <ModalButton variant="secondary" icon="close" onClick={onClose}>
            CLOSE
          </ModalButton>
        </ActionRow>
      </div>
    </GameModal>
  );
};

export default PawlegendsHost;
