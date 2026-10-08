import { analytics, buildEvent } from "@/analytics";
import { USER_API } from "@/api/user-api";
import { getAudioSettings, subscribeAudioSettings, type AudioSettings } from "@/components/audio/settings";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { GameModal } from "@/components/ui/GameModal";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import type { HeistRunCompleteMessage, HeistRunLog } from "@/shared-contracts/heist-bridge";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeistSaveChip, type SaveChipState } from "./HeistSaveChip";
import { analyticsStatus, HeistSaver } from "./heistSaves";
import { createHostBridge, type HostBridge } from "./hostBridge";
import {
  HEIST_EXIT_PATH,
  HEIST_FRAME_ENTRY_SCRIPT,
  HEIST_FRAME_TESTID,
  heistFrameSrc,
  NO_INSETS,
  openedFrom,
  progressFromProfile,
  readSafeAreaInsets,
  type HeistProfileFields,
} from "./session";
import { registerHeistSuspension } from "./suspension";

/** The iframe URL in the server HTML (plan G2: `/heist` HTML contains the iframe). */
export const HEIST_FRAME_SRC = heistFrameSrc("", false);

/** QA query forwarding (`?qa=1&replay=…`) only outside production builds, or in E2E builds. */
const allowQaForwarding = () =>
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E === "1";

/** How long a finished run waits for Firebase to report its user before it counts as "no user". */
const AUTH_WAIT_MS = 5_000;

function track(event: Parameters<typeof analytics.track>[0]) {
  try {
    analytics.track(event);
  } catch {
    // Analytics never breaks the Heist.
  }
}

/**
 * The `/heist` host (plan G2 layers 1 and 3): Catnip Heist full-bleed in a same-origin iframe, the
 * typed bridge, account-linked saves through `POST /user/catbassadors/live` (replay verified), the
 * save chip, and the "Add N heists played on this device" prompt. Rendered inside
 * `FirebaseAuthProvider authMode="optional"`: an existing Firebase session (an account, or a guest
 * from `/game`) is reused, none is ever created here, and the sheet opens only when the player asks.
 */
export const HeistHost = () => {
  const { user, authStatus, requireAccount } = useFirebaseAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<HostBridge | null>(null);
  const [src, setSrc] = useState(HEIST_FRAME_SRC);
  const [suspended, setSuspended] = useState(false);
  const [chip, setChip] = useState<SaveChipState | null>(null);
  const [unclaimed, setUnclaimed] = useState(0);
  const [claimDismissed, setClaimDismissed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [insets, setInsets] = useState(NO_INSETS);
  const [bridgeState, setBridgeState] = useState<"connecting" | "ready" | "timeout">("connecting");

  const uid = user?.uid ?? null;
  const signedIn = !!user && !user.isAnonymous && authStatus === "ready";
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const anonymousRef = useRef(!!user?.isAnonymous);
  anonymousRef.current = !!user?.isAnonymous;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const statusRef = useRef(authStatus);
  statusRef.current = authStatus;
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
        if (statusRef.current !== "unknown") return resolve();
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

  const showChip = useCallback((next: SaveChipState) => setChip({ ...next, at: Date.now() }), []);

  const saver = useMemo(
    () =>
      new HeistSaver({
        save: (log: HeistRunLog) =>
          USER_API.saveMatchDetailed({ type: GameType.CATNIP_HEIST, replay: log }),
        currentUid: () => uidRef.current,
        currentIsAnonymous: () => anonymousRef.current,
        onStatus: (runId, status, detail) => {
          bridgeRef.current?.saveResult(runId, status, detail.code);
          track(
            buildEvent("heist_save", {
              status: detail.duplicate === "other" ? "rejected" : analyticsStatus(detail.outcome, detail.httpStatus),
            })
          );
          if (detail.outcome === "stale") return; // onStalePurged shows the message
          if (detail.duplicate) {
            // A 409: the log was stored before. Never "saved" when it is another account's row.
            showChip({ kind: "duplicate", duplicate: detail.duplicate, account: signedInRef.current });
            return;
          }
          showChip({
            kind:
              detail.outcome === "device"
                ? "device"
                : status === "saved"
                  ? "saved"
                  : status === "signed-out"
                    ? "signed-out"
                    : status === "rejected"
                      ? "rejected"
                      : "retry",
            account: signedInRef.current,
          });
        },
        onStalePurged: (count) => showChip({ kind: "stale", count }),
        onChange: () => setUnclaimed(saver.unclaimed().length),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    saver.start();
    setUnclaimed(saver.unclaimed().length);
    return () => saver.dispose();
  }, [saver]);

  const onRunComplete = useCallback(
    async (message: HeistRunCompleteMessage) => {
      if (message.won) showChip({ kind: "saving" });
      await authKnown();
      await saver.submit(message.runId, message.won, message.log);
    },
    [authKnown, saver, showChip]
  );

  const onRequestSignIn = useCallback(() => {
    track(buildEvent("heist_signin_prompt", { from: "results" }));
    void requireAccount("save-progress");
  }, [requireAccount]);

  // ---- bridge ------------------------------------------------------------------------------
  const handlersRef = useRef({ onRunComplete, onRequestSignIn });
  handlersRef.current = { onRunComplete, onRequestSignIn };

  useEffect(() => {
    const origin = window.location.origin;
    const bridge = createHostBridge({
      win: window,
      origin: origin && origin !== "null" ? origin : "",
      target: () => frameRef.current?.contentWindow ?? null,
      handlers: {
        onReady: () => setBridgeState("ready"),
        onTimeout: () => setBridgeState((state) => (state === "ready" ? state : "timeout")),
        onRunComplete: (message) => void handlersRef.current.onRunComplete(message),
        onRequestSignIn: () => handlersRef.current.onRequestSignIn(),
        onExit: () => window.location.assign(HEIST_EXIT_PATH),
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []);

  // Session: sign-in state, server progress and insets, re-sent whenever one changes.
  const heistProfile = profile as (HeistProfileFields & { transient?: boolean }) | null | undefined;
  const progressKey = JSON.stringify([heistProfile?.heistScore ?? null, heistProfile?.heistStars ?? null]);
  const progress = useMemo(
    () => (uid && heistProfile && !heistProfile.transient ? progressFromProfile(heistProfile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, progressKey]
  );
  useEffect(() => {
    bridgeRef.current?.setSession({ signedIn, progress, insets });
  }, [signedIn, progress, insets, bridgeState]);

  // Sound: the shell's mute and volumes cover the Heist too (G14 "one switch for all sound"). The
  // Heist applies them for this visit without touching its standalone preference. The bridge keeps
  // the last value and sends it again on every `ready`.
  useEffect(() => {
    const send = (settings: AudioSettings) => bridgeRef.current?.setAudio(settings);
    send(getAudioSettings());
    return subscribeAudioSettings(send);
  }, []);

  // Safe-area insets (0 inside the iframe), measured here and re-measured on rotation.
  useEffect(() => {
    const measure = () => setInsets(readSafeAreaInsets(document));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  // Any GameModal (the AuthSheet included) pauses the Heist and makes the frame inert.
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

  // Queued runs of the signed-in uid go out once its profile is in. Runs of an anonymous guest that
  // is gone (signed in to another uid) go back to the claim prompt, which asks again.
  useEffect(() => {
    if (!uid || (authStatus !== "ready" && authStatus !== "guest")) return;
    if (saver.releaseGuestRuns() > 0) setClaimDismissed(false);
    void saver.drain();
  }, [uid, authStatus, saver]);

  // ---- entry ---------------------------------------------------------------------------------
  useEffect(() => {
    track(buildEvent("heist_open", { from: openedFrom(window.location.search) }));
    const entrySrc = heistFrameSrc(window.location.search, allowQaForwarding(), window.location.hash);
    // The entry script already pointed the server-rendered frame here: setting src again would
    // load the game a second time.
    if (entrySrc !== HEIST_FRAME_SRC && frameRef.current?.getAttribute("src") !== entrySrc) setSrc(entrySrc);
  }, []);

  // `from` only feeds heist_open: drop it from the address bar once the router is ready (a
  // replaceState before hydration ends would be undone by Next's own query update).
  const fromQuery = router?.isReady ? router.query.from : undefined;
  useEffect(() => {
    if (!router?.isReady || fromQuery === undefined) return;
    const { from: _from, ...rest } = router.query;
    void _from;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router?.isReady, fromQuery]);

  // ---- device runs ---------------------------------------------------------------------------
  const claimOpen =
    !!uid && (authStatus === "ready" || authStatus === "guest") && unclaimed > 0 && !claimDismissed;

  const claim = async () => {
    if (!uid) return;
    setClaiming(true);
    const ids = saver.unclaimed().map((run) => run.id);
    let status: "ok" | "error" | "offline" = "ok";
    try {
      await saver.claim(uid);
      // Sent once they left the queue; anything still queued is waiting on a retry.
      const left = saver.ownedBy(uid).filter((run) => ids.includes(run.id)).length;
      if (left > 0) status = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error";
    } catch {
      status = "error";
    } finally {
      setClaiming(false);
      setClaimDismissed(true);
    }
    track(buildEvent("heist_guest_claim", { status }));
  };
  const decline = () => {
    track(buildEvent("heist_guest_claim", { status: "rejected" }));
    saver.decline();
    setClaimDismissed(true);
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-tt-night-900"
      style={{ touchAction: "none" }}
      data-testid="heist-host"
      data-bridge={bridgeState}
      data-suspended={suspended ? "1" : undefined}
    >
      <iframe
        ref={frameRef}
        src={src}
        title="Catnip Heist"
        data-testid={HEIST_FRAME_TESTID}
        className="absolute inset-0 h-full w-full border-0 bg-tt-night-900"
        allow="autoplay; fullscreen; gamepad"
        // While a sheet or modal is open the game is paused and takes no input or focus.
        inert={suspended}
        // The entry script below may have changed src before hydration (on purpose).
        suppressHydrationWarning
      />
      <script type="module" async dangerouslySetInnerHTML={{ __html: HEIST_FRAME_ENTRY_SCRIPT }} />
      <HeistSaveChip state={chip} onDismiss={() => setChip(null)} />
      <GameModal
        open={claimOpen}
        onOpenChange={(open) => {
          if (!open) setClaimDismissed(true);
        }}
        title="ADD YOUR HEISTS?"
        icon="gamepad"
        description={claimQuestion(unclaimed, signedIn)}
        size="sm"
        name="heist-claim"
        canClose={!claiming}
      >
        <div className="flex flex-col gap-4" data-testid="heist-claim">
          <p className="flex items-start gap-2 font-sans text-p5 font-semibold leading-snug text-tt-cream">
            <span aria-hidden="true" className="mt-[2px] shrink-0 text-tt-sky">
              <PixelIcon name="info-box" size={18} />
            </span>
            Only add them if you played them. Someone else on this device? Tap Not mine and they are deleted.
          </p>
          {/* Centred like every other modal's actions: the primary first, NOT MINE beside it. */}
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
    </div>
  );
};

/** The claim prompt's question (decision #18). */
export function claimQuestion(count: number, account: boolean): string {
  const heists = count === 1 ? "1 heist" : `${count} heists`;
  return account
    ? `Add ${heists} played on this device to your account?`
    : `Add ${heists} played on this device to your game progress?`;
}

export default HeistHost;
