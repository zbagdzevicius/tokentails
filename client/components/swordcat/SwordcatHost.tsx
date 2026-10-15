import { analytics, buildEvent } from "@/analytics";
import { apiFetch } from "@/api/api";
import { formatUnits18, normalizeDonateRail, treatRailOpen } from "@/api/impact-api";
import { SHELTER_API, type DonateStatus } from "@/api/shelter-api";
import { getAudioSettings, subscribeAudioSettings } from "@/components/audio/settings";
import { isAppBuild } from "@/components/claims/build";
import { fetchDonateMe, sendTreat, treatSentStatus, type DonateMe, type TreatSend } from "@/components/codex/impact/treat";
import { registerHeistSuspension } from "@/components/heist/suspension";
import { CloseButton } from "@/components/shared/CloseButton";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  amountLabelOf,
  createSwordcatBridge,
  explorerUrlOf,
  receiptPathOf,
  type SwordcatBridge,
  type SwordcatTreatRequestMessage,
  type SwordcatTreatResult,
  type SwordcatTreatState,
} from "./bridge";
import { swordcatFrameSrc, swordcatOrigin, swordcatUrl } from "./flags";
import { SWORDCAT_TITLE } from "./title";

/** Where the exit button goes (the game lobby, like the Heist's exit). */
export const SWORDCAT_EXIT_PATH = "/game";
export const SWORDCAT_FRAME_TESTID = "swordcat-frame";
/** localStorage key: the player closed the "turn your phone sideways" hint. */
export const SWORDCAT_ROTATE_HINT_KEY = "tt:swordcat:rotate-hint:v1";
/** Portrait phones and tablets: the game reads best in landscape. */
export const SWORDCAT_ROTATE_QUERY = "(orientation: portrait) and (pointer: coarse)";
/** The rotate hint hides itself after this long (this page view only), so it never sits over the game's own buttons. */
export const SWORDCAT_ROTATE_HINT_MS = 8000;
/**
 * The exit button: 44 px, `SWORDCAT_EXIT_INSET_PX` inside the frame's top-left corner (the frame itself sits inside the
 * safe area). In embed mode the game keeps a `SWORDCAT_EXIT_GUTTER_PX` corner free of HUD (Swordcat `src/ui/ui.css`,
 * `--embed-gut`), so the button never covers Clem's portrait or hearts. Change both sides together.
 */
export const SWORDCAT_EXIT_SIZE_PX = 44;
export const SWORDCAT_EXIT_INSET_PX = 6;
export const SWORDCAT_EXIT_GUTTER_PX = 56;

/**
 * The frame fills the safe area only: inside an iframe the game reads no safe-area insets of its own, so a full-bleed
 * frame put its HUD under the notch (the page uses `viewport-fit=cover`). An iframe is a replaced element: offsets
 * alone do not stretch it, so the size is explicit.
 */
const SAFE_FRAME_STYLE = {
  top: "env(safe-area-inset-top)",
  left: "env(safe-area-inset-left)",
  width: "calc(100% - env(safe-area-inset-left) - env(safe-area-inset-right))",
  height: "calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
} as const;

function rotateHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(SWORDCAT_ROTATE_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberRotateHintDismissed() {
  try {
    window.localStorage.setItem(SWORDCAT_ROTATE_HINT_KEY, "1");
  } catch {
    // Blocked storage: the hint stays closed for this page view only.
  }
}

/**
 * Shows the rotate hint while the screen is a portrait touch screen, until the player closes it
 * (remembered) or `SWORDCAT_ROTATE_HINT_MS` passes (this page view only).
 */
function useRotateHint(): [boolean, () => void] {
  const [show, setShow] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Read on the client only; it changes nothing until `show` turns true after mount, so the
  // server and first client render agree.
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && rotateHintDismissed());
  useEffect(() => {
    if (rotateHintDismissed()) return;
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(SWORDCAT_ROTATE_QUERY);
    const update = () => setShow(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener?.(update);
    return () => query.removeListener?.(update);
  }, []);
  useEffect(() => {
    if (!show || dismissed || timedOut) return;
    const timer = window.setTimeout(() => setTimedOut(true), SWORDCAT_ROTATE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [show, dismissed, timedOut]);
  const dismiss = () => {
    setDismissed(true);
    rememberRotateHintDismissed();
  };
  return [show && !dismissed && !timedOut, dismiss];
}

// ---- treats (plan §12.1 item 7, §12.2) ------------------------------------------------------

/** What the host knows about today's treat rail: the game's `treat-state`, plus the chain to send on. */
export interface SwordcatRail {
  state: SwordcatTreatState["rail"];
  /** Another network than the main chain, when only that one is open (`normalizeDonateRail`). */
  chainId?: number;
  amountLabel?: string;
}

/** `$0.01` in app builds (they never name a coin or chain, R10), else `0.01 USDC`. */
export function treatAmountLabel(amountWei: unknown, coin: unknown, isApp: boolean): string | undefined {
  if (typeof amountWei !== "string" || !/^\d{1,40}$/.test(amountWei) || /^0+$/.test(amountWei)) return undefined;
  const amount = formatUnits18(amountWei);
  const label = isApp ? `$${amount}` : typeof coin === "string" && coin ? `${amount} ${coin}` : undefined;
  return amountLabelOf(label) ?? undefined;
}

/**
 * `GET /shelter/donate/status` as the game's rail. Null (the read failed): `soon`, like the Heist's
 * pre-launch state. Live with treats left: `live`. Exhausted, or live with none left: `exhausted`.
 * Paused or not deployed: `soon`.
 */
export function swordcatRailOf(status: DonateStatus | null, isApp: boolean): SwordcatRail {
  const rail = normalizeDonateRail(status);
  if (!rail) return { state: "soon" };
  if (treatRailOpen(rail)) {
    const chains = Array.isArray(status?.chains) ? status!.chains : [];
    const chain = rail.chainId !== undefined ? chains.find((c) => c.chainId === rail.chainId) : chains.find((c) => c.main);
    const amountLabel = treatAmountLabel(chain?.amountWei ?? status?.amountWei, chain?.coin ?? "USDC", isApp);
    return {
      state: "live",
      ...(rail.chainId !== undefined ? { chainId: rail.chainId } : {}),
      ...(amountLabel ? { amountLabel } : {}),
    };
  }
  if (rail.enabled && (rail.state === "exhausted" || rail.state === "live")) return { state: "exhausted" };
  return { state: "soon" };
}

/** Today's treat already left (or arrived) for this player or address. */
export function sentTodayOf(me: DonateMe | null): boolean {
  const status = me?.today?.status;
  return status === "PENDING" || status === "SENT" || status === "CONFIRMED";
}

/**
 * The receipt links for a sent treat, from the donate response body (`DonateResult`): the same-origin
 * receipt page and the https explorer link. App builds get neither (no chain or explorer, R10).
 */
export function treatReceiptOf(body: unknown, isApp: boolean): Pick<SwordcatTreatResult, "explorerUrl" | "receiptPath" | "amountLabel"> {
  if (isApp || !body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: Pick<SwordcatTreatResult, "explorerUrl" | "receiptPath" | "amountLabel"> = {};
  const explorerUrl = explorerUrlOf(b.explorerUrl);
  if (explorerUrl) out.explorerUrl = explorerUrl;
  const chainId = Number(b.chainId);
  if (typeof b.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(b.txHash) && Number.isSafeInteger(chainId) && chainId > 0) {
    const receiptPath = receiptPathOf(`/shelter-payouts/receipt?chain=${chainId}&tx=${b.txHash}`);
    if (receiptPath) out.receiptPath = receiptPath;
  }
  const amountLabel = treatAmountLabel(b.amountWei, typeof b.coin === "string" ? b.coin : "USDC", false);
  if (amountLabel) out.amountLabel = amountLabel;
  return out;
}

type TreatFetch = (input: string, init: RequestInit) => Promise<Response>;

const defaultTreatFetch: TreatFetch = (input, init) =>
  apiFetch(input, init, { guestSession: false, requireAccount: false });

interface SwordcatHostProps {
  /** The game URL. Defaults to the same-origin build (`/swordcat-game/`) or a valid `NEXT_PUBLIC_SWORDCAT_URL`; null shows the unavailable state (tests). */
  url?: string | null;
  /** Full page load back to the lobby. Injected by tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
  /** The treat POST (tests pass a fake). Defaults to `apiFetch`, as on the IMPACT tab. */
  treatFetch?: TreatFetch;
}

/**
 * The `/swordcat` host (Swordcat plan §5.1): the Swordcat game (`SWORDCAT_TITLE`) full-bleed in an iframe from
 * `/swordcat-game/` (same origin; `NEXT_PUBLIC_SWORDCAT_URL` overrides it, `?embed=1`), the v1 bridge (`./bridge`), an exit button back to
 * `/game` in the frame's top-left corner (the game keeps that corner free in embed mode), and a rotate
 * hint on portrait phones. The frame sits inside the safe area. While the game boots the bridge keeps
 * saying hello; after 10 s a "still loading" note offers Reload, after 2 min a panel offers Reload and
 * Back to games, and a late `ready` still connects. No `sandbox`: the game needs its own storage and
 * WebGL. Any GameModal pauses the game through the same stand-in the Heist registers with the game
 * suspension registry. The shell's mute follows into the game. Phase 1 saves nothing.
 *
 * Phase TT4 (plan §12): the game shows the treat panel after each save and posts `treat-request`;
 * this page sends the sponsored treat with `sendTreat()` (`source: "page"`, signed-in first, then the
 * no-account route), so the player never leaves the game. It answers `treat-result` and keeps the
 * game's `treat-state` (rail, sent today, amount) current. No token or free text crosses the bridge.
 */
export const SwordcatHost = ({ url: urlProp, navigate, treatFetch }: SwordcatHostProps) => {
  const url = urlProp === undefined ? swordcatUrl() : urlProp;
  const auth = useOptionalFirebaseAuth();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<SwordcatBridge | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [bridgeState, setBridgeState] = useState<"connecting" | "slow" | "timeout" | "ready">("connecting");
  // a new key remounts the iframe (Reload)
  const [frameKey, setFrameKey] = useState(0);
  const [rotateHint, dismissRotateHint] = useRotateHint();
  const src = useMemo(() => (url ? swordcatFrameSrc(url) : null), [url]);
  const signedIn = !!auth?.user && !auth.user.isAnonymous && auth.authStatus === "ready";
  const router = useRouter();
  // Treats: the rail and today's row, read once per page view and updated by each send.
  const railRef = useRef<SwordcatRail>({ state: "checking" });
  const sentTodayRef = useRef(false);
  const inFlightRef = useRef<string | null>(null);
  const answeredRef = useRef(new Map<string, SwordcatTreatResult>());
  const treatFetchRef = useRef<TreatFetch>(treatFetch ?? defaultTreatFetch);
  treatFetchRef.current = treatFetch ?? defaultTreatFetch;

  const exit = () => (navigate ?? ((path: string) => window.location.assign(path)))(SWORDCAT_EXIT_PATH);

  // `from` only says where the player came from (no swordcat_open event exists yet, plan §12.6):
  // drop it from the address bar once the router is ready, like /heist.
  const fromQuery = router?.isReady ? router.query?.from : undefined;
  useEffect(() => {
    if (!router?.isReady || fromQuery === undefined) return;
    const { from: _from, ...rest } = router.query;
    void _from;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router?.isReady, fromQuery]);

  const pushTreatState = useCallback(() => {
    const rail = railRef.current;
    bridgeRef.current?.setTreatState({
      rail: rail.state,
      sentToday: sentTodayRef.current,
      ...(rail.amountLabel ? { amountLabel: rail.amountLabel } : {}),
    });
  }, []);

  /**
   * One `treat-request`: one send in flight at a time, each request id answered once (a repeat gets
   * the same answer, never a second POST). Tokens never enter the frame: `sendTreat` reads them here.
   */
  const onTreatRequest = useCallback(
    async (message: SwordcatTreatRequestMessage) => {
      const answer = (result: SwordcatTreatResult) => {
        answeredRef.current.set(result.requestId, result);
        bridgeRef.current?.sendTreatResult(result);
        pushTreatState();
      };
      const previous = answeredRef.current.get(message.requestId);
      if (previous) {
        bridgeRef.current?.sendTreatResult(previous);
        return;
      }
      if (inFlightRef.current === message.requestId) return;
      if (inFlightRef.current) {
        bridgeRef.current?.sendTreatResult({ requestId: message.requestId, kind: "retry" });
        return;
      }
      if (sentTodayRef.current) {
        answer({ requestId: message.requestId, kind: "already-today" });
        return;
      }
      inFlightRef.current = message.requestId;
      let body: unknown = null;
      const capture: TreatFetch = async (input, init) => {
        const res = await treatFetchRef.current(input, init);
        if (res.ok) {
          try {
            body = await res.clone().json();
          } catch {
            body = null;
          }
        }
        return res;
      };
      let send: TreatSend;
      try {
        send = await sendTreat({ fetchImpl: capture, chainId: railRef.current.chainId });
      } catch {
        send = { kind: "retry" };
      } finally {
        inFlightRef.current = null;
      }
      analytics.track(buildEvent("treat_sent", { status: treatSentStatus(send) }));
      if (send.kind === "sent" || send.kind === "already-today") sentTodayRef.current = true;
      if (send.kind === "budget-spent") railRef.current = { state: "exhausted" };
      if (send.kind === "paused") railRef.current = { state: "soon" };
      answer({
        requestId: message.requestId,
        kind: send.kind,
        ...(send.kind === "sent" ? treatReceiptOf(body, isAppBuild()) : {}),
      });
    },
    [pushTreatState]
  );

  // Today's rail and this player's row: read once the page is up, and again when sign-in changes.
  useEffect(() => {
    if (!url) return;
    let live = true;
    void (async () => {
      const [status, me] = await Promise.all([
        SHELTER_API.getDonateStatus().catch(() => null),
        fetchDonateMe().catch(() => null),
      ]);
      if (!live) return;
      railRef.current = swordcatRailOf(status, isAppBuild());
      if (sentTodayOf(me)) sentTodayRef.current = true;
      pushTreatState();
    })();
    return () => {
      live = false;
    };
  }, [url, signedIn, pushTreatState]);

  // ---- bridge ------------------------------------------------------------------------------
  useEffect(() => {
    if (!url) return;
    const bridge = createSwordcatBridge({
      win: window,
      origin: swordcatOrigin(url, window.location.href),
      target: () => frameRef.current?.contentWindow ?? null,
      handlers: {
        onReady: () => setBridgeState("ready"),
        onSlow: () => setBridgeState((state) => (state === "connecting" ? "slow" : state)),
        onTimeout: () => setBridgeState((state) => (state === "ready" ? state : "timeout")),
        // Phase 1: nothing is saved (docs/GAMES.md). Visible in development only.
        onLevelComplete: (message) => {
          if (process.env.NODE_ENV === "development") console.debug("[swordcat] level-complete", message);
        },
        // Phase TT4: no swordcat analytics event exists yet (shared/ is off limits, plan §12.6).
        onCatSaved: (message) => {
          if (process.env.NODE_ENV === "development") console.debug("[swordcat] cat-saved", message);
        },
        onTreatRequest: (message) => void onTreatRequest(message),
      },
    });
    bridgeRef.current = bridge;
    pushTreatState();
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [url, onTreatRequest, pushTreatState]);

  // Sign-in state only (never a token), re-sent on every `ready`.
  useEffect(() => {
    bridgeRef.current?.setSignedIn(signedIn);
  }, [signedIn, bridgeState, url]);

  // The shell's one mute covers the game too; the bridge re-sends it on every `ready`.
  useEffect(() => {
    if (!url) return;
    bridgeRef.current?.setMuted(getAudioSettings().muted);
    return subscribeAudioSettings((settings) => bridgeRef.current?.setMuted(settings.muted));
  }, [url]);

  // Any GameModal (the AuthSheet included) pauses the game and makes the frame inert.
  useEffect(() => {
    if (!url) return;
    return registerHeistSuspension({
      onSuspend: () => {
        setSuspended(true);
        bridgeRef.current?.pause();
      },
      onResume: () => {
        setSuspended(false);
        bridgeRef.current?.resume();
      },
    });
  }, [url]);

  // The frame loaded a new game document (the game's own recovery reload): say hello again.
  const onFrameLoad = useCallback(() => {
    const bridge = bridgeRef.current;
    if (bridge?.ready) bridge.reconnect();
  }, []);

  const reload = () => {
    setBridgeState("connecting");
    setFrameKey((key) => key + 1);
    bridgeRef.current?.reconnect();
  };

  const exitButton = (
    <div
      className="fixed z-10"
      data-testid="swordcat-exit"
      style={{
        top: `calc(env(safe-area-inset-top) + ${SWORDCAT_EXIT_INSET_PX}px)`,
        left: `calc(env(safe-area-inset-left) + ${SWORDCAT_EXIT_INSET_PX}px)`,
      }}
    >
      {/* 44 px at every width (CloseButton grows to 64 px on lg, which would reach into the game's HUD) */}
      <CloseButton label="Back to games" onClick={exit} className="!static lg:!h-[44px] lg:!w-[44px]" />
    </div>
  );

  const reloadButtonClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-tt-night-950 bg-tt-gold-400 px-4 font-sans text-p6 font-bold text-tt-night-950 shadow-[0_2px_0_rgb(var(--tt-night-950))] outline-none focus-visible:ring-4 focus-visible:ring-tt-cream";

  if (!src) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-tt-night-900 px-4 text-center"
        data-testid="swordcat-host"
        data-state="unavailable"
      >
        {exitButton}
        <p className="font-sans text-p5 font-bold text-tt-cream">{SWORDCAT_TITLE} is not available right now.</p>
        <a
          href={SWORDCAT_EXIT_PATH}
          className="font-sans text-p5 font-bold text-tt-gold-400 underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
        >
          Back to games
        </a>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-tt-night-900"
      style={{ touchAction: "none" }}
      data-testid="swordcat-host"
      data-bridge={bridgeState}
      data-suspended={suspended ? "1" : undefined}
    >
      <iframe
        key={frameKey}
        ref={frameRef}
        src={src}
        title={SWORDCAT_TITLE}
        data-testid={SWORDCAT_FRAME_TESTID}
        className="absolute border-0 bg-tt-night-900"
        style={SAFE_FRAME_STYLE}
        allow="autoplay; fullscreen; gamepad"
        onLoad={onFrameLoad}
        // While a sheet or modal is open the game is paused and takes no input or focus.
        inert={suspended}
      />
      {exitButton}
      {bridgeState === "slow" && (
        <div
          role="status"
          data-testid="swordcat-slow"
          className="fixed left-1/2 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-tt-night-950 bg-tt-night-900/90 py-1 pl-3 pr-1 font-sans text-p6 font-bold text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))]"
          style={{ top: `calc(env(safe-area-inset-top) + ${SWORDCAT_EXIT_GUTTER_PX}px)` }}
        >
          <span>Still loading {SWORDCAT_TITLE}…</span>
          <button type="button" onClick={reload} className={reloadButtonClass}>
            Reload
          </button>
        </div>
      )}
      {bridgeState === "timeout" && (
        <div
          role="alert"
          data-testid="swordcat-timeout"
          className="fixed inset-0 z-[9] flex flex-col items-center justify-center gap-4 bg-tt-night-900/95 px-4 text-center"
        >
          <p className="font-sans text-p5 font-bold text-tt-cream">{SWORDCAT_TITLE} is taking too long to load.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={reload} className={reloadButtonClass}>
              Reload
            </button>
            <a
              href={SWORDCAT_EXIT_PATH}
              className="inline-flex min-h-[44px] items-center font-sans text-p5 font-bold text-tt-gold-400 underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
            >
              Back to games
            </a>
          </div>
        </div>
      )}
      {rotateHint && (
        <div
          role="status"
          data-testid="swordcat-rotate-hint"
          className="fixed left-1/2 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border-2 border-tt-night-950 bg-tt-night-900/90 py-1 pl-3 pr-1 font-sans text-p6 font-bold text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))]"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <span>Turn your phone sideways for the best view</span>
          <button
            type="button"
            onClick={dismissRotateHint}
            aria-label="Dismiss hint"
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-tt-cream outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
          >
            <PixelIcon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SwordcatHost;
