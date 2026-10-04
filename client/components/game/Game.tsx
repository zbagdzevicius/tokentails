import CatnipChaos from "@/components/CatnipChaos/CatnipChaos";
import { SceneBoundary } from "@/components/errors/SceneBoundary";
import { installPhaserCrashGuard } from "@/components/Phaser/events";
import { GuestPill } from "@/components/shared/auth/GuestPill";
import { analytics, buildEvent } from "@/analytics";
import { saveNudge, type SaveNudgeTrigger } from "@/context/auth/saveNudge";
import { useFirebaseAuth, useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import type { SessionProfile } from "@/context/auth/types";
import { AltarHold } from "@/components/onboarding/AltarHold";
import { commitStarterChoice, wasKept } from "@/components/onboarding/commit";
import { clearDraft, readDraft } from "@/components/onboarding/draft";
import { useOnboardingHandoff } from "@/components/onboarding/handoff";
import { MeetYourCat, type MeetCommitOutcome } from "@/components/onboarding/MeetYourCat";
import { starterLook } from "@/components/onboarding/starters";
import { onboardingStore } from "@/components/onboarding/store";
import { useReducedMotion } from "@/components/onboarding/useReducedMotion";
import { IntroCurtain } from "@/components/game/IntroCurtain";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useBodyOverflowHidden } from "@/hooks/useBodyOverflowHidden";
import type { ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import type { IProfile } from "@/models/profile";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBackground } from "../../constants/hooks";
import Snowfall from "../shared/Snowfall";
import PixelRescue from "../PixelRescue/PixelRescue";
const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/shelter/Shelter"), {
  ssr: false,
});
const Match3 = dynamic(() => import("@/components/Match3/Match3"), {
  ssr: false,
});
/** How long the decision waits for ProfileContext to receive the backend profile (see below). */
const PROFILE_SETTLE_MS = 120;

export const Game = () => {
  const { gameType, isStarted, level, setGameType } = useGame();
  const { profile, setProfileUpdate } = useProfile();
  const { authStatus, authReady, user, requireAccount, refreshProfile } = useFirebaseAuth();
  const isGuest = authStatus === "guest";
  const signedOut = authStatus === "signed-out";
  // An anonymous guest whose profile request failed keeps playing on the template profile, so
  // it still needs the pill and the nudge (otherwise it has no way to save its cat).
  const anonFallback = authStatus === "profile-error" && !!user?.isAnonymous;
  const guestLike = isGuest || anonFallback;
  const [nudge, setNudge] = useState<SaveNudgeTrigger | null>(null);
  const background = useBackground({ level, gameType });
  useBodyOverflowHidden();
  const reducedMotion = useReducedMotion();
  const router = useRouter();

  /* Intro curtain (G14): readiness-driven, at least 700 ms, at most 2.5 s, tap to skip. */
  const authContext = useOptionalFirebaseAuth();
  const sheetOpen = !!authContext?.sheetController.sheet.open;
  const curtainReady = authReady || sheetOpen;
  const [showCurtain, setShowCurtain] = useState(true);
  const [curtainLifted, setCurtainLifted] = useState(false);
  const onCurtainLift = useCallback(() => setCurtainLifted(true), []);

  /* Meet your cat (G3): pending accounts, guests included; `/game?meet=1` replays it. */
  const onboardingState = (profile as SessionProfile | null | undefined)?.onboarding?.state;
  const pending = onboardingState === "pending";
  // "guest" and "ready" are the two states with a profile the backend sent (F5.7).
  const profileFromBackend = authStatus === "guest" || authStatus === "ready";
  const replay = router.isReady && router.query.meet === "1";
  const [meetOpen, setMeetOpen] = useState(false);
  const meetDecided = useRef(false);
  // The same decision as state, so the altar hold below drops in the render that decides.
  const [decided, setDecided] = useState(false);
  /** The open ceremony is a `?meet=1` replay: no hand-off into Cupid Cat (review 4a #5). */
  const meetIsReplay = useRef(false);
  /** The last commit answer of this ceremony (null while none has come back). */
  const lastOutcome = useRef<MeetCommitOutcome["status"] | null>(null);
  const { start: startHandoff, cancel: cancelHandoff } = useOnboardingHandoff();
  // ProfileContext hands out new functions each render; the commit callbacks read the latest.
  const latest = useRef({ profile, setProfileUpdate, refreshProfile });
  useEffect(() => {
    latest.current = { profile, setProfileUpdate, refreshProfile };
  });

  // Another account in this tab: nothing from the previous one's ceremony may show (review 4a #4).
  const previousUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (previousUid.current !== undefined && previousUid.current !== uid) onboardingStore.reset();
    previousUid.current = uid;
  }, [user?.uid]);

  // The player opened a mode during the lobby beat: the pending hand-off must not override it.
  // (The hand-off clears its own timer before it sets the mode, so this never cancels it.)
  useEffect(() => {
    if (gameType) cancelHandoff();
  }, [gameType, cancelHandoff]);

  /** Marks onboarding done locally and shows the starter in the lobby hero at once. */
  const applyCommit = useCallback(
    (outcome: MeetCommitOutcome) => {
      lastOutcome.current = outcome.status;
      // Nothing was saved and no draft kept: onboarding stays pending (review 4a #6).
      if (outcome.status === "failed") return;
      // A replay on a finished account changes nothing unless the server took the commit: its
      // cat stays in the hero (review 4a #4).
      if (meetIsReplay.current && outcome.status !== "committed") return;
      const { profile: current, setProfileUpdate: patchProfile, refreshProfile: reload } = latest.current;
      const look = starterLook(outcome.breed);
      // 409: the server already has a cat, so the chosen name and look are not it.
      const hero =
        outcome.status === "locked"
          ? null
          : { name: outcome.name, image: look.idle, still: look.still, replacesId: current?.cat?._id ?? null };
      if (hero) onboardingStore.set({ heroCat: hero });
      const patch: Partial<SessionProfile> = { onboarding: { state: "done" } };
      if (outcome.status === "committed" && current?.cat) {
        patch.cat = { ...current.cat, ...(outcome.cat as Partial<ICat>) } as ICat;
      }
      patchProfile(patch as Partial<IProfile>);
      if (outcome.status === "offline") return;
      // Once the profile is back from the server it is the truth: drop the stand-in.
      void Promise.resolve(reload())
        .catch(() => undefined)
        .then(() => {
          if (hero && onboardingStore.get().heroCat === hero) onboardingStore.set({ heroCat: null });
        });
    },
    [],
  );

  const finishMeet = useCallback(
    () => {
      setMeetOpen(false);
      if (router.query.meet !== undefined) {
        void router.replace({ pathname: router.pathname }, undefined, { shallow: true });
      }
      // A replay or a 409 is an existing player: back to the lobby, never forced into Cupid Cat 1.
      if (meetIsReplay.current || lastOutcome.current === "locked") {
        meetIsReplay.current = false;
        return;
      }
      startHandoff();
    },
    [startHandoff, router],
  );

  /** The ceremony, or a silent commit of an offline draft (no second ceremony). */
  const decide = useCallback((uid: string, replacesId: string | null) => {
    meetDecided.current = true;
    setDecided(true);
    lastOutcome.current = null;
    const draft = readDraft(uid);
    if (!draft) {
      setMeetOpen(true);
      return;
    }
    // The ceremony already happened offline: commit the kept choice, no second ceremony.
    const look = starterLook(draft.breed);
    const name = draft.skipped ? look.name : draft.name || look.name;
    onboardingStore.set({ heroCat: { name, image: look.idle, still: look.still, replacesId } });
    void commitStarterChoice(
      draft.skipped ? { breed: draft.breed, skipped: true } : { breed: draft.breed, name },
      uid,
    ).then((result) => {
      const kept = wasKept(result, uid);
      // A refused name, or a failure that kept nothing: the draft cannot be committed, so the
      // player chooses again.
      if (result.status === "invalid" || (result.status === "failed" && !kept)) {
        clearDraft();
        onboardingStore.set({ heroCat: null });
        setMeetOpen(true);
        return;
      }
      applyCommit(
        result.status === "committed"
          ? { status: "committed", breed: draft.breed, name: result.cat.name, cat: result.cat, skipped: !!draft.skipped }
          : { status: result.status === "locked" ? "locked" : "offline", breed: draft.breed, name, skipped: !!draft.skipped },
      );
    });
  }, [applyCommit]);

  // Decide once, after the curtain lifts: the ceremony, a silent retry of an offline draft, or
  // nothing (the lobby). Never while a mode is open.
  useEffect(() => {
    if (!curtainLifted || meetDecided.current || gameType || isStarted) return;
    if (replay) {
      meetDecided.current = true;
      meetIsReplay.current = true;
      lastOutcome.current = null;
      // A one-time decision from readiness, the URL and the stored draft (external state).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDecided(true);
      setMeetOpen(true);
      return;
    }
    // Only for a real session whose profile came back from the backend: before that, the page
    // shows the client template (also "pending"), and a returning player would get the ceremony.
    if (!pending || !profileFromBackend || !user) return;
    // The auth status turns "guest"/"ready" one render before FirebaseAuthContext copies the
    // backend profile into ProfileContext, so for that render `profile` is still the client
    // template ("pending" for everyone). Decide a moment later: if the real profile lands first
    // (and says "done"), this effect re-runs and the timer is cleared.
    const uid = user.uid;
    const timer = setTimeout(() => {
      const current = latest.current.profile as SessionProfile | null | undefined;
      if (meetDecided.current || current?.onboarding?.state !== "pending") return;
      decide(uid, current?.cat?._id ?? null);
    }, PROFILE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [curtainLifted, replay, pending, profileFromBackend, user, gameType, isStarted, decide]);


  // The curtain has lifted but the backend profile is not back yet (a slow sign-in), and the
  // template says "pending": hold the altar instead of showing the lobby first (review 4a #1).
  // It hands over to the ceremony, or drops when the profile says "done" or the session fails.
  const awaitingProfile = authStatus === "unknown" || authStatus === "loading-profile";
  const holdAltar =
    curtainLifted &&
    !decided &&
    !meetOpen &&
    !gameType &&
    !isStarted &&
    pending &&
    !(router.isReady && router.query.meet === "1") &&
    (awaitingProfile || (profileFromBackend && !!user));

  // Stall watchdog for the Phaser scenes (F9): armed on GAME_LOADED.
  useEffect(() => installPhaserCrashGuard(), []);

  const backToMenu = () => setGameType(null);

  // Soft save nudges, once a session, guests only (decision #10). Only the 10-minute timer is
  // wired here; the first clear and the first codex entry call `firstClear()` and
  // `firstCodexEntry()` from their own surfaces.
  useEffect(() => {
    if (!guestLike) {
      saveNudge.stop();
      return;
    }
    const unsubscribe = saveNudge.subscribe((trigger) => {
      setNudge(trigger);
      try {
        analytics.track(buildEvent("save_nudge_shown", { trigger }));
      } catch {
        // Analytics never breaks the game.
      }
    });
    saveNudge.start();
    return () => {
      unsubscribe();
      saveNudge.stop();
    };
  }, [guestLike]);

  const saveYourCat = () => {
    setNudge(null);
    // No guest to save after a failed anonymous sign-in: the sheet offers a plain sign-in.
    void requireAccount(signedOut ? "sign-in" : "save-progress");
  };

  return (
    <div className="w-full max-h-screen h-full absolute" style={background}>
      {showCurtain && (
        <IntroCurtain
          ready={curtainReady}
          reducedMotion={reducedMotion}
          onLift={onCurtainLift}
          onGone={() => setShowCurtain(false)}
        />
      )}
      {holdAltar && <AltarHold reducedMotion={reducedMotion} />}
      {meetOpen && (
        <MeetYourCat
          open
          uid={user?.uid}
          onCommitted={applyCommit}
          onDone={finishMeet}
        />
      )}
      {!isStarted && <Snowfall />}
      {/* Guest HUD pill (G1): the lobby only, so it never covers a run's HUD. A pending nudge
          waits here until the player is back in the lobby. */}
      {(guestLike || signedOut) && !isStarted && !gameType && !meetOpen && (
        <GuestPill
          onSave={saveYourCat}
          catName={profile?.cat?.name}
          catImg={profile?.cat?.catImg}
          signedOut={signedOut}
          nudge={guestLike ? nudge : null}
          onDismissNudge={() => setNudge(null)}
          className={
            // Top centre, between the corner HUD columns, on every screen (the lobby layout leaves
            // this slot free and measures the pill: components/game/lobbyLayout.ts).
            "fixed left-1/2 z-hud -translate-x-1/2 top-[max(1rem,env(safe-area-inset-top))]"
          }
        />
      )}
      {/* One SceneBoundary per Phaser mount (F9, G13): a crash shows the
          scene fallback instead of blanking the game. A mode mounts only with a profile (the
          template or the transient guest profile counts), as before. */}
      {gameType === GameType.HOME && profile && (
        <SceneBoundary name={GameType.HOME} onBackToMenu={backToMenu}>
          <Base />
        </SceneBoundary>
      )}
      {gameType === GameType.SHELTER && profile && (
        <SceneBoundary name={GameType.SHELTER} onBackToMenu={backToMenu}>
          <Adopt />
        </SceneBoundary>
      )}
      {gameType === GameType.CATNIP_CHAOS && profile && (
        <SceneBoundary name={GameType.CATNIP_CHAOS} onBackToMenu={backToMenu}>
          <CatnipChaos />
        </SceneBoundary>
      )}
      {gameType === GameType.PIXEL_RESCUE && profile && (
        <SceneBoundary name={GameType.PIXEL_RESCUE} onBackToMenu={backToMenu}>
          <PixelRescue />
        </SceneBoundary>
      )}
      {gameType === GameType.MATCH_3 && profile && (
        <SceneBoundary name={GameType.MATCH_3} onBackToMenu={backToMenu}>
          <Match3 />
        </SceneBoundary>
      )}
    </div>
  );
};
