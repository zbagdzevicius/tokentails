import { getAudioSettings, subscribeAudioSettings } from "@/components/audio/settings";
import { registerHeistSuspension } from "@/components/heist/suspension";
import { CloseButton } from "@/components/shared/CloseButton";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSwordcatBridge, type SwordcatBridge } from "./bridge";
import { swordcatFrameSrc, swordcatOrigin, swordcatUrl } from "./flags";

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

interface SwordcatHostProps {
  /** The game URL. Defaults to the same-origin build (`/swordcat-game/`) or a valid `NEXT_PUBLIC_SWORDCAT_URL`; null shows the unavailable state (tests). */
  url?: string | null;
  /** Full page load back to the lobby. Injected by tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
}

/**
 * The `/swordcat` host (Swordcat plan §5.1): Pink Paw Knight full-bleed in an iframe from
 * `/swordcat-game/` (same origin; `NEXT_PUBLIC_SWORDCAT_URL` overrides it, `?embed=1`), the v1 bridge (`./bridge`), an exit button back to
 * `/game` in the frame's top-left corner (the game keeps that corner free in embed mode), and a rotate
 * hint on portrait phones. The frame sits inside the safe area. While the game boots the bridge keeps
 * saying hello; after 10 s a "still loading" note offers Reload, after 2 min a panel offers Reload and
 * Back to games, and a late `ready` still connects. No `sandbox`: the game needs its own storage and
 * WebGL. Any GameModal pauses the game through the same stand-in the Heist registers with the game
 * suspension registry. The shell's mute follows into the game. Phase 1 saves nothing.
 */
export const SwordcatHost = ({ url: urlProp, navigate }: SwordcatHostProps) => {
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

  const exit = () => (navigate ?? ((path: string) => window.location.assign(path)))(SWORDCAT_EXIT_PATH);

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
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [url]);

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
        <p className="font-sans text-p5 font-bold text-tt-cream">Pink Paw Knight is not available right now.</p>
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
        title="Pink Paw Knight"
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
          <span>Still loading Pink Paw Knight…</span>
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
          <p className="font-sans text-p5 font-bold text-tt-cream">Pink Paw Knight is taking too long to load.</p>
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
