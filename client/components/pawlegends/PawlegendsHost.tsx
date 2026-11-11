import { analytics, reportAppError } from "@/analytics";
import { buildPawlegendsEvent, pawlegendsSaveCode } from "@/analytics/pawlegends-events";
import { CAT_API } from "@/api/cat-api";
import { USER_API } from "@/api/user-api";
import { getAudioSettings, setMuted, subscribeAudioSettings, type AudioSettings } from "@/components/audio/settings";
import { isAppBuild } from "@/components/claims/build";
import { registerHeistSuspension } from "@/components/heist/suspension";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { methodFromProviders, readLastMethod } from "@/context/auth/lastMethod";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import type { ICat } from "@/models/cats";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPawlegendsBridge,
  PAWLEGENDS_HELLO_TIMEOUT_MS,
  shareUrlOf,
  type PawlegendsAccountAction,
  type PawlegendsBridge,
  type PawlegendsNotifyWhere,
  type PawlegendsSignInReason,
  type PawlegendsStoreState,
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
import { championsOf } from "./championsBridge";
import { claimQuestion } from "./claim";
import { pickFeatured, storefrontCats, type FeaturedPick } from "./featuredBridge";
import {
  PAWLEGENDS_CONTACT,
  PAWLEGENDS_EXIT_PATH,
  PAWLEGENDS_FRAME_SRC,
  PAWLEGENDS_PRIVACY_URL,
  PAWLEGENDS_PARTY_LINK,
  PAWLEGENDS_TERMS_PATH,
  pawlegendsFrameSrc,
  withoutParty,
} from "./flags";
import { rosterOf } from "./rosterBridge";
import { PartySaves, PartyTickets } from "./partySaves";
import { PawlegendsApi as PawlegendsGameApi } from "./apiBridge";
import { PawlegendsSaver } from "./saves";
import { openedFrom, profileAfterSave, progressFromProfile, type PawlegendsProfileFields } from "./session";
import { PAWLEGENDS_TITLE } from "./title";
import { LANDING_VARIANT_PARAM, landingVariantOf } from "./landingVariant";

// The Token Tails checkout (Stripe Elements, the crypto checkout) is browser only and loads on first use.
const PawlegendsStoreSheet = dynamic(() => import("./PawlegendsStoreSheet").then((m) => m.PawlegendsStoreSheet), { ssr: false });
const PawlegendsCatSheet = dynamic(() => import("./PawlegendsCatSheet").then((m) => m.PawlegendsCatSheet), {
  ssr: false,
});
// Sign-in: the account chip's "Manage account" (sign out, delete); loads on first use.
const PawlegendsAccountSheet = dynamic(() => import("./PawlegendsAccount").then((m) => m.PawlegendsAccountSheet), {
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

/** The claim prompt's question (the Heist's decision #18 wording); shared with the app's in-page host. */
export { claimQuestion };

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
 * - **Champions** (sim v9). A shelter champion's card adds cosmetics only (who may pick a champion is the
 *   champion store's rule, CHAMPION-STORE.md: `store.champions`); `GET /pawlegends/champions`
 *   gives their cards (`champions`): art, and whether each is for sale. The game's lobby info panel may open a
 *   champion's card (`open-cat`), and from a non-owner's 3rd match on a champion until its card is shown, the game
 *   sends `champion-offer` (once a page load): unless a card was shown this visit, the host asks the offer engine
 *   with that card first (the server's caps still decide). Champion cards are never featured cats.
 * - **App builds** (Capacitor) play the game with starter and redeemed cats only: `store: false`, no featured
 *   cats, no offer, no champion card for sale, and `open-cat` is dropped (Apple 3.1.1 and 3.1.3(b)).
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
  // The server render has no URL, so the first render uses the plain src and a dare is forwarded after mount.
  const [frameSrc, setFrameSrc] = useState(PAWLEGENDS_FRAME_SRC);
  /** Reload presses on this page (the `pawlegends_bridge_timeout` event carries it). */
  const reloads = useRef(0);
  const [suspended, setSuspended] = useState(false);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  // The stored token is never rendered, so reading it on the first client render cannot break hydration.
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : readToken()));
  const [note, setNote] = useState<string | null>(null);
  const [unclaimed, setUnclaimed] = useState(0);
  const [claimDismissed, setClaimDismissed] = useState(false);
  const [forSale, setForSale] = useState<ICat[] | null>(null);
  const [sheet, setSheet] = useState<{ cat: ICat; owned: boolean } | null>(null);
  const [notifyWhere, setNotifyWhere] = useState<PawlegendsNotifyWhere | null>(null);
  /** Sign-in: the account sheet is open (the game's account chip, "Manage account"). */
  const [accountOpen, setAccountOpen] = useState(false);
  /** STORE-PASS.md: the store or pass SKU on the purchase sheet (web, signed in). */
  const [storeSku, setStoreSku] = useState<string | null>(null);
  /** STORE-PASS.md §3 step 5: re-reads `GET /pawlegends/me` and sends `store` to the game (set below). */
  const refreshStoreRef = useRef<(() => Promise<void>) | null>(null);
  /** The last `GET /pawlegends/me` answer (the store sheet reads a champion bundle's prorated price from it). */
  const storeState = useRef<PawlegendsStoreState | null>(null);

  const uid = auth?.user?.uid ?? null;
  // Without an auth provider the page behaves as signed out.
  const authStatus = auth ? auth.authStatus : "signed-out";
  const signedIn = !!auth?.user && !auth.user.isAnonymous && authStatus === "ready";
  const go = useCallback((url: string) => (navigate ?? ((u: string) => window.location.assign(u)))(url), [navigate]);
  // The game's lobby "Games" button (bridge `exit`): the one way out once the game is up (no host close button).
  const goRef = useRef(go);
  goRef.current = go;

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
        save: (replay, signal) => saveRef.current({ type: GameType.PAWLEGENDS, pawlegends: replay }, { signal }),
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
            ...(answer?.season ? { season: answer.season } : {}),
          });
          // the pass row moved (Season XP): the game's Pass screen follows
          if (saveStatus === "saved" && answer?.season) void refreshStoreRef.current?.();
          if (saveStatus !== "saving") {
            track(
              buildPawlegendsEvent("pawlegends_save", {
                status: saveStatus,
                catnipPaid: answer?.catnipPaid ?? 0,
                code: pawlegendsSaveCode(detail.code),
                httpStatus: detail.httpStatus,
              })
            );
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
  // Party play (MULTIPLAYER.md §5.3, §6): tickets minted with this page's session, v:2 results posted to `/live`.
  const partySaves = useMemo(
    () =>
      new PartySaves({
        save: (result) => saveRef.current({ type: GameType.PAWLEGENDS, pawlegends: result }),
        onStatus: (matchId, saveStatus, detail) => {
          const answer = detail.answer;
          // only the owner's own game hears its save status (§6.7); peers never see it
          bridgeRef.current?.saveResult({
            matchId,
            status: saveStatus,
            catnipPaid: answer?.catnipPaid ?? 0,
            catnipTotal: answer?.catnipCount ?? null,
            fastestWin: null,
            ...(detail.code ? { code: detail.code } : {}),
            ...(answer?.season ? { season: answer.season } : {}),
          });
          if (saveStatus === "saved" && answer?.season) void refreshStoreRef.current?.();
          if (saveStatus !== "saving")
            track(
              buildPawlegendsEvent("pawlegends_save", {
                status: saveStatus,
                catnipPaid: answer?.catnipPaid ?? 0,
                code: pawlegendsSaveCode(detail.code),
                httpStatus: detail.httpStatus,
              })
            );
          if (saveStatus === "saved" && answer?.catnipPaid) void latest.current.auth?.refreshProfile?.().catch(() => undefined);
        },
      }),
    []
  );
  const partyTickets = useMemo(
    () =>
      new PartyTickets({
        mint: () => USER_API.pawlegendsPartyTicket(),
        answer: (id, ticket, error) => bridgeRef.current?.partyTicket(id, ticket, error),
      }),
    []
  );
  // Social, ranked and reports (SOCIAL-RANKED.md §13): the game's API ops, through this page's session.
  const pawlegendsApi = useMemo(
    () =>
      new PawlegendsGameApi({
        fetch: (route) => USER_API.pawlegendsApiCall(route),
        answer: (id, ok, status, body) => bridgeRef.current?.apiResult(id, ok, status, body),
        signedIn: () => latest.current.signedIn,
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
  // The prompt closes once the matches are the account's; they are sent in the background (launch finding R4).
  const claim = () => {
    if (!uid) return;
    const count = saver.unclaimed().length;
    saver.take(uid);
    setClaimDismissed(true);
    void saver.drain();
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
  // bar. `from` (the picker link) and `lv` (the landing arm) only feed `pawlegends_open`.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!router?.isReady || handledReturn.current) return;
    handledReturn.current = true;
    const query = router.query ?? {};
    const search = typeof window === "undefined" ? "" : window.location.search;
    // `lv`: the landing A/B arm the play link came from (landingVariant.ts), so a landing's conversions can be counted.
    const variant = landingVariantOf(search);
    track(buildPawlegendsEvent("pawlegends_open", variant ? { from: openedFrom(search), landing_variant: variant } : { from: openedFrom(search) }));
    const action = returnActionOf(query);
    if (!action && query.from === undefined && query[LANDING_VARIANT_PARAM] === undefined) return;
    const rest = { ...query };
    for (const key of [...RETURN_QUERY_KEYS, "from", LANDING_VARIANT_PARAM]) delete rest[key];
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
        // STORE-PASS.md: a store or pass purchase lands in `/pawlegends/me` (the webhook grants it to the account)
        void refreshStoreRef.current?.();
        for (let i = 0; i < ENTITLEMENT_POLLS; i++) {
          if (i > 0) void refreshStoreRef.current?.();
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
  // Sim v9: the shelter champions' cards, once per visit (art in every build, for sale on the web only).
  const [championsBody, setChampionsBody] = useState<unknown>(null);
  useEffect(() => {
    // A test double may leave the champions route out.
    if (typeof api.champions !== "function") return;
    let live = true;
    void api
      .champions()
      .then((result) => live && result.ok && setChampionsBody(result.body))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);
  const champions = useMemo(() => championsOf(championsBody, ownedCats, isApp), [championsBody, ownedCats, isApp]);
  // The champions' cards are never featured: they reach the offer engine only as a champion offer (after a
  // non-owner's 3rd match on that champion).
  const featured: FeaturedPick = useMemo(
    () =>
      isApp || !forSale
        ? { cats: [], byId: new Map() }
        : pickFeatured(forSale, ownedCats, roster, undefined, undefined, new Set(champions.cards.map((c) => c.catalogId))),
    [isApp, forSale, ownedCats, roster, champions]
  );

  const sessionRef = useRef<number | null>(null);
  const offerAsked = useRef(false);
  const offerRef = useRef<string | null>(null);
  /** A Meet card was shown this visit (`offer-seen`): no other offer is asked for. */
  const offerSeen = useRef(false);
  /** Champion cards the game said are due this visit (`champion-offer`); every offer ask puts them first. */
  const dueChampions = useRef<string[]>([]);
  useEffect(() => {
    if (sessionRef.current === null) sessionRef.current = nextSession();
  }, []);

  // ---- bridge ----------------------------------------------------------------------------------
  const handlers = useRef<{
    onRequestSignIn: (reason: PawlegendsSignInReason) => void;
    onAccount: (action: PawlegendsAccountAction) => void;
    onOpenCat: (catalogId: string) => void;
    onOfferSeen: (catalogId: string) => void;
    onNotify: (where: PawlegendsNotifyWhere) => void;
    onChampionOffer: (catalogId: string) => void;
    onSkinPreview: (catalogId: string) => void;
    onStoreIntent: (sku: string) => void;
    onPassClaim: (row: "f" | "p" | null, tier: number | null) => void;
    onChampUnlock: (hero: string, via: "yarn" | "pick") => void;
  }>({
    onRequestSignIn: () => undefined,
    onAccount: () => undefined,
    onOpenCat: () => undefined,
    onOfferSeen: () => undefined,
    onNotify: () => undefined,
    onChampionOffer: () => undefined,
    onSkinPreview: () => undefined,
    onStoreIntent: () => undefined,
    onPassClaim: () => undefined,
    onChampUnlock: () => undefined,
  });
  /** Featured cats the player previewed as a card skin this visit (`skin-preview`): the next offer ask puts them first. */
  const previewed = useRef<string[]>([]);
  useEffect(() => {
    handlers.current = {
      onRequestSignIn: (reason) => {
        track(buildPawlegendsEvent("pawlegends_signin_prompt", { reason }));
        void auth?.requireAccount(reason).catch(() => undefined);
      },
      // Sign-in: the game's account chip and Settings row. Sign out goes through the provider; the `session` effect
      // below tells the game. Manage (and a delete from an older build) opens the account sheet, which asks to confirm.
      onAccount: (action) => {
        if (!auth) return;
        if (action === "sign-in") {
          track(buildPawlegendsEvent("pawlegends_signin_prompt", { reason: "save-progress" }));
          void auth.requireAccount("sign-in").catch(() => undefined);
        } else if (action === "sign-out") void auth.signOut().catch(() => undefined);
        else setAccountOpen(true);
      },
      onOpenCat: (catalogId) => {
        if (isApp) return;
        const forSaleCat = featured.byId.get(catalogId) ?? champions.byId.get(catalogId);
        const ownedCat = ownedCats.find((c) => roster.some((r) => r.id === c._id && r.catalogId === catalogId));
        if (!forSaleCat && !ownedCat) return;
        track(
          buildPawlegendsEvent("pawlegends_meet_open", {
            catalogId,
            from: ownedCat
              ? "roster"
              : offerRef.current === catalogId
                ? "offer"
                : featured.byId.has(catalogId)
                  ? "featured"
                  : "champion",
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
        offerSeen.current = true;
        void api.offerSeen({ deviceId: deviceId(), session: sessionRef.current ?? 1, catalogId });
      },
      onNotify: (where) => {
        if (!isApp && status?.email) setNotifyWhere(where);
      },
      // STORE-PASS.md §3: Buy on a store or pass SKU. Web only (the bridge refuses it in an app build); a signed-out
      // player is asked to sign in first (decision #9: store items belong to an account).
      onStoreIntent: (sku) => {
        const listed = status?.catalog?.find((c) => c.sku === sku);
        if (isApp || !listed) return bridgeRef.current?.storePurchaseResult(sku, false);
        track(buildPawlegendsEvent("pawlegends_store_intent", { sku }));
        if (latest.current.signedIn) return setStoreSku(sku);
        if (!auth) return bridgeRef.current?.storePurchaseResult(sku, false);
        void auth.requireAccount("purchase").then(
          (result) => (result === "signed-in" ? setStoreSku(sku) : bridgeRef.current?.storePurchaseResult(sku, false)),
          () => bridgeRef.current?.storePurchaseResult(sku, false)
        );
      },
      // STORE-PASS.md §5: claim pass rewards (guests too: they earn Season XP and claim the free row).
      onPassClaim: (row, tier) =>
        void api.passClaim(row && tier ? { row, tier } : { all: true }).then((result) => {
          if (result.ok && result.body) bridgeRef.current?.setStore(result.body);
        }),
      // CHAMPION-STORE.md §8.6: a Yarn unlock or a Champion Pick (the app too: no money changes hands); the fresh
      // `store` carries the champion, a refusal still re-sends it so the game's button comes back
      onChampUnlock: (hero, via) =>
        void api.champUnlock(hero, via).then((result) => {
          track(buildPawlegendsEvent("pawlegends_champ_unlock", { hero, via, ok: result.ok }));
          void refreshStoreRef.current?.();
        }),
      // Sim v9: a champion's card is due (from the 3rd match on it, until shown; the game re-sends it every visit):
      // ask the offer engine again with that card first, unless a card was already shown this visit. An offer held
      // but not yet shown does not block it; the server keeps one card a session and every other cap.
      onChampionOffer: (catalogId) => {
        if (isApp || offerSeen.current || !champions.byId.has(catalogId) || dueChampions.current.includes(catalogId)) return;
        dueChampions.current = [...dueChampions.current, catalogId];
        const due = dueChampions.current.filter((id) => champions.byId.has(id));
        void api
          .offer({
            deviceId: deviceId(),
            session: sessionRef.current ?? 1,
            screen: "results",
            catalogIds: [...due, ...featured.cats.map((c) => c.catalogId).filter((id) => !due.includes(id))],
            token: readToken(),
          })
          .then((result) => {
            const offer = result.ok ? result.body?.offer ?? null : null;
            if (offer && bridgeRef.current?.setOffer(offer)) offerRef.current = offer.catalogId;
          });
      },
      // Card skins: the player previewed a featured cat's skin on the pick screen. Same re-ask, with that cat right
      // after any due champion card; the server's caps (session 1, one a session, one a day, spend) still decide.
      onSkinPreview: (catalogId) => {
        if (isApp || offerSeen.current || !featured.byId.has(catalogId) || previewed.current.includes(catalogId)) return;
        previewed.current = [...previewed.current, catalogId];
        const first = [...dueChampions.current.filter((id) => champions.byId.has(id)), catalogId];
        void api
          .offer({
            deviceId: deviceId(),
            session: sessionRef.current ?? 1,
            screen: "results",
            catalogIds: [...first, ...featured.cats.map((c) => c.catalogId).filter((id) => !first.includes(id))],
            token: readToken(),
          })
          .then((result) => {
            const offer = result.ok ? result.body?.offer ?? null : null;
            if (offer && bridgeRef.current?.setOffer(offer)) offerRef.current = offer.catalogId;
          });
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
        onTimeout: () => {
          // The frame never answered: nothing inside it can report, so the host does (launch finding R1).
          track(
            buildPawlegendsEvent("pawlegends_bridge_timeout", {
              waitedMs: PAWLEGENDS_HELLO_TIMEOUT_MS,
              reloads: reloads.current,
            })
          );
          setBridgeState((s) => (s === "ready" ? s : "timeout"));
        },
        // A game or worker crash inside the iframe (its errors never reach this window's listeners): reported as
        // a scrubbed `app_error` with the host's per-session budget (launch finding R1).
        onClientError: (e) =>
          void reportAppError(`pawlegends_${e.source}`, e.msg, {
            source: e.source === "rejection" ? "rejection" : e.source === "worker" ? "worker" : "window",
            game: "pawlegends",
            screen: e.screen,
            tier: e.tier,
            sim: e.sim,
          }),
        // The game's own events (PUB-02): sent like the host's, so they follow the site's policy and share its id.
        onGameEvent: (name, properties) => track({ name, properties }),
        onMatchResult: (replay, _summary, matchId) =>
          void (async () => {
            // On the device before the Firebase wait and the POST: a page closed in between keeps it (R3).
            saver.hold(matchId, replay);
            await authKnown();
            await saver.submit(matchId, replay);
          })(),
        onPartyTicketRequest: (id) =>
          void (async () => {
            await authKnown();
            await partyTickets.request(id);
          })(),
        onApiRequest: (request) =>
          void (async () => {
            await authKnown();
            await pawlegendsApi.request(request);
          })(),
        onPartyResult: (result) =>
          void (async () => {
            await authKnown();
            await partySaves.submit(result);
          })(),
        onRequestSignIn: (reason) => handlers.current.onRequestSignIn(reason),
        onAccount: (action) => handlers.current.onAccount(action),
        onOpenCat: (catalogId) => handlers.current.onOpenCat(catalogId),
        onOfferSeen: (catalogId) => handlers.current.onOfferSeen(catalogId),
        onNotify: (where) => handlers.current.onNotify(where),
        onChampionOffer: (catalogId) => handlers.current.onChampionOffer(catalogId),
        onSkinPreview: (catalogId) => handlers.current.onSkinPreview(catalogId),
        onStoreIntent: (sku) => handlers.current.onStoreIntent(sku),
        onPassClaim: (row, tier) => handlers.current.onPassClaim(row, tier),
        onChampUnlock: (hero, via) => handlers.current.onChampUnlock(hero, via),
        onExit: () => goRef.current(PAWLEGENDS_EXIT_PATH),
        // the player's own Sound switch in the game is the site's one mute (it was lost on the next visit)
        onSound: (muted) => setMuted(muted),
        onShare: (kind, url, text) => {
          // a party invite is always the tokentails.com embed URL (D12), also from a preview or local host
          const safe = kind === "party" && PAWLEGENDS_PARTY_LINK.test(url) ? url : shareUrlOf(url, window.location.origin);
          if (!safe) return;
          const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
          // PUB-06: the dare line ("Beat my 7:12 vs Easy bots in Pawlegends!") goes with the link when the game sent one.
          const data: ShareData = text ? { url: safe, title: PAWLEGENDS_TITLE, text } : { url: safe, title: PAWLEGENDS_TITLE };
          if (typeof nav.share === "function") void nav.share(data).catch(() => undefined);
          else void nav.clipboard?.writeText(safe).then(() => setNote("Link copied"), () => undefined);
        },
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [authKnown, saver, partySaves, partyTickets, pawlegendsApi]);

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
  // UX pass 2: the profile name rides along (signed in only), so the player's own hero shows it instead of "You"
  const playerName = signedIn && profile && !(profile as { transient?: boolean }).transient ? (profile.name ?? null) : null;
  // Sign-in: how the player signed in (the account chip's icon); the last-used method wins when the account has several
  const providers = auth?.user?.providers?.join(",") ?? "";
  const provider = useMemo(
    () => (signedIn ? methodFromProviders(providers ? providers.split(",") : [], readLastMethod()) : null),
    [signedIn, providers]
  );
  useEffect(() => {
    bridgeRef.current?.setSession(signedIn, progress, playerName, provider);
  }, [signedIn, progress, playerName, provider, bridgeState]);
  useEffect(() => {
    bridgeRef.current?.setEntitlements(isApp ? null : token);
  }, [isApp, token]);
  // STORE-PASS.md §3 step 5: the account's owned store and pass items and its pass row, after sign-in, after a
  // Checkout return, after a saved match and after a claim. App builds get it too: the game draws only the pass's
  // free-row items there and never shows a price.
  const refreshStore = useCallback(async () => {
    if (!latest.current.uid) {
      bridgeRef.current?.setStore({ items: [], season: null });
      return;
    }
    const result = await api.me();
    if (result.ok && result.body) {
      storeState.current = result.body;
      bridgeRef.current?.setStore(result.body);
    }
  }, [api]);
  useEffect(() => {
    refreshStoreRef.current = refreshStore;
  }, [refreshStore]);
  useEffect(() => {
    if (authStatus === "unknown") return;
    void refreshStore();
  }, [uid, authStatus, bridgeState, refreshStore]);
  useEffect(() => {
    bridgeRef.current?.setRoster(roster);
  }, [roster]);
  useEffect(() => {
    bridgeRef.current?.setFeatured(featured.cats);
  }, [featured]);
  useEffect(() => {
    bridgeRef.current?.setChampions(champions.cards);
  }, [champions]);
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
    // a champion card the game already said is due goes first (the server returns the first one it may show)
    const due = dueChampions.current.filter((id) => champions.byId.has(id));
    void api
      .offer({
        deviceId: deviceId(),
        session: sessionRef.current ?? 1,
        catalogIds: [...due, ...featured.cats.map((c) => c.catalogId).filter((id) => !due.includes(id))],
        token: readToken(),
      })
      .then((result) => {
        // a champion ask sent after this one (it lists the featured cats too) has the newer answer
        if (dueChampions.current.length > due.length) return;
        const offer = result.ok ? result.body?.offer ?? null : null;
        if (offer && bridgeRef.current?.setOffer(offer)) offerRef.current = offer.catalogId;
      });
  }, [api, isApp, bridgeState, featured, authStatus, champions]);

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
    reloads.current += 1;
    setBridgeState("connecting");
    setFrameKey((k) => k + 1);
    bridgeRef.current?.reconnect();
  };
  // A dare link (`/pawlegends?dare=…`, launch finding PUB-03): the game reads the dare from its own URL, so the
  // frame is started again with the dare in its src (a fresh iframe, as the reload button does).
  useEffect(() => {
    const src = pawlegendsFrameSrc(window.location.search);
    // a party invite: the frame got the code; the address bar drops it, so a reload does not rejoin an old party
    const stripped = withoutParty(window.location.href);
    // (the Next router's own history state keeps working: its `as` and `url` follow the new address)
    if (stripped) window.history.replaceState({ ...(window.history.state ?? {}), as: stripped, url: stripped }, "", stripped);
    if (src === PAWLEGENDS_FRAME_SRC) return;
    setFrameSrc(src);
    setFrameKey((k) => k + 1);
    bridgeRef.current?.reconnect();
  }, []);

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
        src={frameSrc}
        title={PAWLEGENDS_TITLE}
        data-testid={PAWLEGENDS_FRAME_TESTID}
        className="absolute border-0 bg-tt-night-900"
        style={SAFE_FRAME_STYLE}
        allow="autoplay; fullscreen; gamepad; web-share; clipboard-write"
        onLoad={onFrameLoad}
        inert={suspended}
      />
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
          {/* No host close button any more: until the game's own "Games" button is up, this is the way out. */}
          <a href={PAWLEGENDS_EXIT_PATH} data-testid="pawlegends-slow-exit" className="px-2 font-sans text-p6 font-bold text-tt-gold-400 underline underline-offset-4">
            Back
          </a>
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
        canClose
      >
        <div className="flex flex-col gap-4" data-testid="pawlegends-claim">
          <p className="flex items-start gap-2 font-sans text-p5 font-semibold leading-snug text-tt-cream">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-tt-sky">
              <PixelIcon name="info-box" size={18} />
            </span>
            Only add them if you played them. Someone else on this device? Tap Not mine and they are deleted.
          </p>
          <ActionRow align="center">
            <ModalButton variant="primary" icon="check" onClick={claim}>
              ADD THEM
            </ModalButton>
            <ModalButton variant="secondary" icon="close" onClick={decline}>
              NOT MINE
            </ModalButton>
          </ActionRow>
        </div>
      </GameModal>
      {sheet && !sheet.owned && (
        <PawlegendsCatSheet cat={sheet.cat} onBought={(got) => onBought(sheet.cat, got)} onClose={closeSheet} />
      )}
      {sheet?.owned && <OwnedCatSheet cat={sheet.cat} onClose={() => setSheet(null)} />}
      {storeSku && status?.catalog?.some((c) => c.sku === storeSku) && (
        <PawlegendsStoreSheet
          api={api}
          sku={storeSku}
          label={status.catalog.find((c) => c.sku === storeSku)!.label}
          cents={
            // CHAMPION-STORE.md §5: a champion bundle's prorated price for this account (the server's, from `/me`)
            storeState.current?.champions?.bundles.find((b) => b.sku === storeSku)?.cents ??
            status.catalog.find((c) => c.sku === storeSku)!.cents
          }
          initialEmail={auth?.user?.email ?? ""}
          go={go}
          onClose={(bought) => {
            bridgeRef.current?.storePurchaseResult(storeSku, bought);
            setStoreSku(null);
          }}
        />
      )}
      {accountOpen && <PawlegendsAccountSheet onClose={() => setAccountOpen(false)} />}
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
        <p className="text-p6 leading-snug opacity-80" data-testid="pawlegends-notify-privacy">
          Token Tails keeps this email only to send {PAWLEGENDS_TITLE} season news. To stop, write to{" "}
          <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="font-bold text-tt-gold-400 underline underline-offset-2">
            {PAWLEGENDS_CONTACT}
          </a>
          .{" "}
          <a href={PAWLEGENDS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-2">
            Privacy Policy
          </a>
          {" · "}
          <a href={PAWLEGENDS_TERMS_PATH} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-2">
            Terms
          </a>
        </p>
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
