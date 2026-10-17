import { USER_API } from "@/api/user-api";
import {
  getAudioSettings,
  subscribeAudioSettings,
} from "@/components/audio/settings";
import { isAppBuild } from "@/components/claims/build";
import { registerHeistSuspension } from "@/components/heist/suspension";
import { CloseButton } from "@/components/shared/CloseButton";
import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPawlegendsBridge,
  shareUrlOf,
  type PawlegendsBridge,
  type PawlegendsSku,
} from "./bridge";
import {
  browserStorage,
  browserTimeZone,
  checkoutErrorLine,
  createPawlegendsApi,
  currencyFor,
  deviceId,
  isEmail,
  PAWLEGENDS_AGE_BANDS,
  PAWLEGENDS_CONSENT_VERSION,
  PAWLEGENDS_MVP_TARGET,
  priceLabel,
  readAgeBand,
  readToken,
  RETURN_QUERY_KEYS,
  returnActionOf,
  tokenEmail,
  tokenSkus,
  UNDER_16_MESSAGE,
  writeAgeBand,
  writeToken,
  type PawlegendsAgeBand,
  type PawlegendsApi,
  type StoreStatus,
} from "./checkout";
import {
  PAWLEGENDS_EXIT_PATH,
  PAWLEGENDS_FRAME_SRC,
  PAWLEGENDS_TERMS_PATH,
} from "./flags";
import { rosterOf } from "./rosterBridge";
import { PawlegendsSaver, type PawlegendsSaveStatus } from "./saves";
import { PAWLEGENDS_TITLE } from "./title";

export const PAWLEGENDS_FRAME_TESTID = "pawlegends-frame";
/** The SKU a Checkout redirect was for, so the return can answer `purchase-result`. */
export const PAWLEGENDS_PENDING_KEY = "tt.pawlegends.pending.v1";
/** After Checkout the webhook may lag: the host asks for the items this many times, this far apart. */
export const ENTITLEMENT_POLLS = 6;
export const ENTITLEMENT_POLL_MS = 2_000;

const SAFE_FRAME_STYLE = {
  top: "env(safe-area-inset-top)",
  left: "env(safe-area-inset-left)",
  width: "calc(100% - env(safe-area-inset-left) - env(safe-area-inset-right))",
  height: "calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
} as const;

const AGE_LABELS: Record<PawlegendsAgeBand, string> = {
  under16: "Under 16",
  "16-17": "16 or 17",
  "18+": "18 or older",
};

/** The line shown for a save, in the small note under the exit button. */
export function saveNoteOf(
  status: PawlegendsSaveStatus,
  signedIn: boolean
): string | null {
  switch (status) {
    case "saved":
      return "Match saved";
    case "queued":
      return signedIn
        ? "Match will save when you are back online"
        : "Sign in on /game to keep your wins";
    case "stale":
      return "An older match could not be saved after an update";
    case "rejected":
      return null;
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

interface PawlegendsHostProps {
  /** The store API (tests pass a fake). */
  api?: PawlegendsApi;
  /** Full page loads (Checkout and the exit). Defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
  /** Override `isAppBuild()` (tests). */
  isApp?: boolean;
  /** Override the `/live` POST (tests). */
  saveMatch?: typeof USER_API.saveMatchDetailed;
  /** The delay between entitlement polls (tests pass 0). */
  pollMs?: number;
}

/**
 * The `/pawlegends` host (POC.md §11.4): the game full-bleed in a same-origin iframe
 * (`/pawlegends-game/index.html?embed=1`), the `tt-pawlegends` v1 bridge, an exit button back to `/game`, saves
 * through `POST /user/catbassadors/live` (`./saves`), the signed-in player's cats as the roster, and the web
 * store (`./checkout`): the purchase sheet, Stripe Checkout, the entitlement token, restore by email and the
 * Legends Pass notify-me list.
 *
 * App builds play the game but show no store, no offers and no purchased items (GDD §9.8): the game hears
 * `app {isApp: true, store: false}`, every purchase intent is refused and no entitlement token is sent.
 * When the backend store is not ready (a missing secret: 503) the game hears `store: false` and still plays.
 */
export const PawlegendsHost = ({
  api: apiProp,
  navigate,
  isApp: isAppProp,
  saveMatch,
  pollMs = ENTITLEMENT_POLL_MS,
}: PawlegendsHostProps) => {
  const isApp = isAppProp ?? isAppBuild();
  const api = useMemo(() => apiProp ?? createPawlegendsApi(), [apiProp]);
  const auth = useOptionalFirebaseAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<PawlegendsBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<
    "connecting" | "slow" | "timeout" | "ready"
  >("connecting");
  const [frameKey, setFrameKey] = useState(0);
  const [suspended, setSuspended] = useState(false);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  // The stored token is never rendered, so reading it on the first client render cannot break hydration.
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readToken()
  );
  const [sheetSku, setSheetSku] = useState<PawlegendsSku | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const uid = auth?.user?.uid ?? null;
  const signedIn =
    !!auth?.user && !auth.user.isAnonymous && auth.authStatus === "ready";
  const uidRef = useRef(uid);
  const signedInRef = useRef(signedIn);
  const go = useCallback(
    (url: string) =>
      (navigate ?? ((u: string) => window.location.assign(u)))(url),
    [navigate]
  );
  const storeOpen = !isApp && !!status?.store;

  // ---- saves -----------------------------------------------------------------------------------
  const saveRef = useRef(saveMatch ?? USER_API.saveMatchDetailed);
  const saverRef = useRef<PawlegendsSaver | null>(null);
  // Refs follow the latest render (synced in an effect, never written during render).
  useEffect(() => {
    uidRef.current = uid;
    signedInRef.current = signedIn;
    saveRef.current = saveMatch ?? USER_API.saveMatchDetailed;
  });
  useEffect(() => {
    const saver = new PawlegendsSaver({
      save: (replay) =>
        saveRef.current({ type: GameType.PAWLEGENDS, pawlegends: replay }),
      currentUid: () => uidRef.current,
      onStatus: (_id, saveStatus) =>
        setNote(saveNoteOf(saveStatus, signedInRef.current)),
      onStalePurged: () => setNote(saveNoteOf("stale", signedInRef.current)),
    });
    saverRef.current = saver;
    return () => {
      saver.dispose();
      saverRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (uid) void saverRef.current?.drain();
  }, [uid]);

  // ---- entitlements ----------------------------------------------------------------------------
  const keepToken = useCallback((next: string | null) => {
    writeToken(next);
    setToken(next);
  }, []);

  // The stored token, refreshed once per visit (web only: app builds render no purchased items).
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

  // Store readiness (the SKU table and prices come from the server).
  useEffect(() => {
    if (isApp) return;
    let live = true;
    void api.status().then((result) => {
      if (live)
        setStatus(
          result.ok && result.body
            ? result.body
            : { store: false, email: false, termsVersion: null, skus: [] }
        );
    });
    return () => {
      live = false;
    };
  }, [api, isApp]);

  // Stripe's return, a restore link or a notify confirmation: handled once, then dropped from the address bar.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!router?.isReady || handledReturn.current) return;
    const action = returnActionOf(router.query ?? {});
    if (!action) return;
    handledReturn.current = true;
    const rest = { ...router.query };
    for (const key of RETURN_QUERY_KEYS) delete rest[key];
    void router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
      scroll: false,
    });
    if (isApp) return;
    const storage = browserStorage();
    let pending: PawlegendsSku | null = null;
    try {
      pending =
        (storage?.getItem(PAWLEGENDS_PENDING_KEY) as PawlegendsSku | null) ??
        null;
      storage?.removeItem(PAWLEGENDS_PENDING_KEY);
    } catch {
      pending = null;
    }
    void (async () => {
      if (action.kind === "checkout-cancel") {
        if (pending) bridgeRef.current?.purchaseResult(pending, false);
        return;
      }
      if (action.kind === "checkout-ok") {
        setNote("Getting your items…");
        for (let i = 0; i < ENTITLEMENT_POLLS; i++) {
          const result = await api.entitlementsForSession(action.sessionId);
          if (result.ok && result.body) {
            keepToken(result.body.token);
            if (result.body.items.length) {
              setNote("Your items are in the lobby");
              if (pending) bridgeRef.current?.purchaseResult(pending, true);
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
        } else
          setNote(
            "That restore link has expired. Ask for a new one in the store."
          );
        return;
      }
      const result = await api.confirmNotify(action.t);
      setNote(
        result.ok
          ? "You are on the Legends Pass list"
          : "That link has expired."
      );
    })();
  }, [router, api, isApp, keepToken, pollMs]);

  // ---- bridge ----------------------------------------------------------------------------------
  const intentRef = useRef<(sku: PawlegendsSku) => void>(() => undefined);
  useEffect(() => {
    intentRef.current = (sku) => {
      if (!storeOpen) {
        bridgeRef.current?.purchaseResult(sku, false);
        return;
      }
      setSheetSku(sku);
    };
  }, [storeOpen]);

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
        onMatchResult: (replay) => void saverRef.current?.submit(replay),
        onPurchaseIntent: (sku) => intentRef.current(sku),
        onShare: (_kind, url) => {
          const safe = shareUrlOf(url, window.location.origin);
          if (!safe) return;
          const nav = window.navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>;
          };
          if (typeof nav.share === "function")
            void nav
              .share({ url: safe, title: PAWLEGENDS_TITLE })
              .catch(() => undefined);
          else
            void nav.clipboard?.writeText(safe).then(
              () => setNote("Link copied"),
              () => undefined
            );
        },
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []);

  useEffect(() => {
    bridgeRef.current?.setApp(isApp, storeOpen);
  }, [isApp, storeOpen]);
  useEffect(() => {
    bridgeRef.current?.setSignedIn(signedIn);
  }, [signedIn]);
  useEffect(() => {
    bridgeRef.current?.setEntitlements(isApp ? null : token);
  }, [isApp, token]);
  const roster = useMemo(
    () => rosterOf(uid ? profile?.cats : null),
    [uid, profile?.cats]
  );
  useEffect(() => {
    bridgeRef.current?.setRoster(roster);
  }, [roster]);
  useEffect(() => {
    bridgeRef.current?.setMuted(getAudioSettings().muted);
    return subscribeAudioSettings((settings) =>
      bridgeRef.current?.setMuted(settings.muted)
    );
  }, []);
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

  const closeSheet = (bought: boolean) => {
    if (sheetSku && !bought) bridgeRef.current?.purchaseResult(sheetSku, false);
    setSheetSku(null);
  };

  const reloadClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-tt-night-950 bg-tt-gold-400 px-4 font-sans text-p6 font-bold text-tt-night-950 shadow-[0_2px_0_rgb(var(--tt-night-950))] outline-none focus-visible:ring-4 focus-visible:ring-tt-cream";

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-tt-night-900"
      style={{ touchAction: "none" }}
      data-testid="pawlegends-host"
      data-bridge={bridgeState}
      data-store={storeOpen ? "1" : "0"}
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
        style={{
          top: "calc(env(safe-area-inset-top) + 6px)",
          left: "calc(env(safe-area-inset-left) + 6px)",
        }}
      >
        <CloseButton
          label="Back to games"
          onClick={() => go(PAWLEGENDS_EXIT_PATH)}
          className="!static lg:!h-[44px] lg:!w-[44px]"
        />
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
          <p className="font-sans text-p5 font-bold text-tt-cream">
            {PAWLEGENDS_TITLE} is taking too long to load.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={reload} className={reloadClass}>
              Reload
            </button>
            <a
              href={PAWLEGENDS_EXIT_PATH}
              className="font-sans text-p5 font-bold text-tt-gold-400 underline underline-offset-4"
            >
              Back to games
            </a>
          </div>
        </div>
      )}
      {sheetSku && status && (
        <PurchaseSheet
          sku={sheetSku}
          status={status}
          token={token}
          api={api}
          onClose={() => closeSheet(false)}
          onRedirect={(url) => {
            try {
              browserStorage()?.setItem(PAWLEGENDS_PENDING_KEY, sheetSku);
            } catch {
              // The return still delivers the items; only the in-game "bought" answer is lost.
            }
            go(url);
          }}
        />
      )}
    </div>
  );
};

interface PurchaseSheetProps {
  sku: PawlegendsSku;
  status: StoreStatus;
  token: string | null;
  api: PawlegendsApi;
  onClose: () => void;
  onRedirect: (url: string) => void;
}

/**
 * The purchase sheet (POC.md §8.2 step 2): the price, the "Delivered now" and "Delivered at MVP launch" lines,
 * the age band question (first time only), the terms link and the immediate-delivery consent. Below it: restore
 * by email and the Legends Pass notify-me sign-up.
 */
export const PurchaseSheet = ({
  sku,
  status,
  token,
  api,
  onClose,
  onRedirect,
}: PurchaseSheetProps) => {
  const def = status.skus.find((s) => s.sku === sku) ?? null;
  const currency = useMemo(() => currencyFor(browserTimeZone()), []);
  const [storedBand] = useState(() => readAgeBand());
  const [band, setBand] = useState<PawlegendsAgeBand | null>(storedBand);
  const [email, setEmail] = useState(() => tokenEmail(token) ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreLine, setRestoreLine] = useState<string | null>(null);
  const [notifyLine, setNotifyLine] = useState<string | null>(null);
  const owned = tokenSkus(token);

  const underAge = band === "under16";
  const emailOk = isEmail(email);
  const canBuy = !!def && !!band && !underAge && consent && emailOk && !busy;

  const buy = async () => {
    if (!def || !band || !canBuy) return;
    setBusy(true);
    setError(null);
    writeAgeBand(band);
    const result = await api.checkout({
      sku,
      currency,
      email: email.trim(),
      ageBand: band,
      consentVersion: PAWLEGENDS_CONSENT_VERSION,
      deviceId: deviceId(),
      ...(token ? { token } : {}),
    });
    if (result.ok && result.body) {
      onRedirect(result.body.url);
      return;
    }
    setBusy(false);
    setError(checkoutErrorLine(result));
  };

  const restore = async () => {
    if (!isEmail(restoreEmail))
      return setRestoreLine("Enter the email you bought with.");
    const result = await api.restore(restoreEmail.trim());
    setRestoreLine(
      result.ok
        ? "Check your inbox for a restore link."
        : "That did not work. Try again in a few minutes."
    );
  };

  const notify = async () => {
    const value = email.trim() || restoreEmail.trim();
    if (!isEmail(value)) return setNotifyLine("Enter your email above first.");
    const result = await api.notify(value, "store");
    setNotifyLine(
      result.ok
        ? "Check your inbox to confirm."
        : "That did not work. Try again in a few minutes."
    );
  };

  const inputClass =
    "min-h-[44px] w-full rounded-md border-2 border-tt-night-950 bg-tt-cream px-3 font-sans text-p5 text-tt-night-950 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400";

  return (
    <GameModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={def?.label ?? PAWLEGENDS_TITLE}
      surface="panel"
      size="md"
      name="pawlegends-purchase"
    >
      <div
        className="flex flex-col gap-4 font-sans text-p5 text-tt-cream"
        data-testid="pawlegends-sheet"
        data-sku={sku}
      >
        {def ? (
          <>
            <p className="font-primary text-h6" data-testid="pawlegends-price">
              {priceLabel(def.cents[currency], currency)}{" "}
              <span className="font-sans text-p6">VAT included</span>
            </p>
            <div>
              <p className="font-bold">Delivered now</p>
              <p data-testid="pawlegends-now">{def.deliveredNow}</p>
            </div>
            <div>
              <p className="font-bold">
                Delivered at MVP launch (target {PAWLEGENDS_MVP_TARGET})
              </p>
              <p data-testid="pawlegends-mvp">{def.deliveredAtMvp}</p>
            </div>
            {sku === "pl_founder_legend_upgrade" &&
              !owned.includes("pl_founder") && (
                <p className="text-p6">
                  The upgrade is for Founder owners. Restore your items below
                  first.
                </p>
              )}
            {!storedBand && (
              <fieldset
                className="flex flex-col gap-2"
                data-testid="pawlegends-age"
              >
                <legend className="font-bold">How old are you?</legend>
                {PAWLEGENDS_AGE_BANDS.map((value) => (
                  <label
                    key={value}
                    className="flex min-h-[44px] items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="pawlegends-age"
                      value={value}
                      checked={band === value}
                      onChange={() => setBand(value)}
                    />
                    {AGE_LABELS[value]}
                  </label>
                ))}
              </fieldset>
            )}
            {underAge ? (
              <p role="alert" data-testid="pawlegends-under16">
                {UNDER_16_MESSAGE}
              </p>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span>Email (your receipt, restore and spending limit)</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    data-testid="pawlegends-email"
                  />
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    data-testid="pawlegends-consent"
                  />
                  <span>
                    Deliver the &quot;now&quot; items at once. I understand I
                    lose my 14-day withdrawal right for those items only. The
                    items delivered at MVP launch keep it until they arrive.{" "}
                    <a
                      href={PAWLEGENDS_TERMS_PATH}
                      target="_blank"
                      rel="noopener"
                      className="text-tt-gold-400 underline underline-offset-4"
                    >
                      Terms and refunds
                    </a>
                  </span>
                </label>
              </>
            )}
            {error && (
              <p role="alert" data-testid="pawlegends-error">
                {error}
              </p>
            )}
            <ActionRow>
              <ModalButton
                variant="primary"
                icon="check"
                onClick={() => void buy()}
                disabled={!canBuy}
                busy={busy}
                data-testid="pawlegends-buy"
              >
                BUY
              </ModalButton>
              <ModalButton variant="secondary" icon="close" onClick={onClose}>
                NOT NOW
              </ModalButton>
            </ActionRow>
          </>
        ) : (
          <p>This item is not on sale right now.</p>
        )}
        {status.email && (
          <div
            className="flex flex-col gap-2 border-t-2 border-tt-night-950/40 pt-3"
            data-testid="pawlegends-restore-form"
          >
            <label className="flex flex-col gap-1">
              <span>Bought before? Restore your items by email</span>
              <input
                type="email"
                autoComplete="email"
                value={restoreEmail}
                onChange={(e) => setRestoreEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <ActionRow inline>
              <ModalButton
                variant="secondary"
                size="sm"
                onClick={() => void restore()}
                data-testid="pawlegends-restore"
              >
                SEND RESTORE LINK
              </ModalButton>
              <ModalButton
                variant="ghost"
                size="sm"
                onClick={() => void notify()}
                data-testid="pawlegends-notify"
              >
                LEGENDS PASS: NOTIFY ME
              </ModalButton>
            </ActionRow>
            {restoreLine && <p role="status">{restoreLine}</p>}
            {notifyLine && <p role="status">{notifyLine}</p>}
          </div>
        )}
      </div>
    </GameModal>
  );
};

export default PawlegendsHost;
