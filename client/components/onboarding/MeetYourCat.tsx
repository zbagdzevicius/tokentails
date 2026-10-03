import { analytics, buildEvent, type AnalyticsEventName, type AnalyticsEventProperties } from "@/analytics";
import { STARTER_API, type IFeaturedCat, type IStarterCat } from "@/api/starter-api";
import { PixelButton } from "@/components/shared/PixelButton";
import { RevealAnimation } from "@/components/tailsCard/RevealAnimation";
import type { StarterBreed } from "@/shared-contracts/enums";
import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { ALTAR_ART, AltarScene, altarSpriteScale, altarSpriteStyle } from "./AltarScene";
import { commitStarterChoice, wasKept } from "./commit";
import { initialMeetState, meetReducer, VISIBLE_STEPS, type MeetStep } from "./meetMachine";
import { ChoosePanel, displayCatName, FeaturedPanel, MeetPanel, NamePanel, StepHeading, StepText } from "./MeetPanels";
import { checkName, nameMessage, surpriseName } from "./names";
import { PixelCat, useIntegerScale } from "./PixelCat";
import { DEFAULT_STARTER, STARTER_IMAGES, starterLook } from "./starters";
import { useLatest } from "./useLatest";
import { useReducedMotion } from "./useReducedMotion";
import { useVisualViewport } from "./useVisualViewport";

/**
 * Meet your cat (plan G3, founder item 3): the altar ceremony that pays off the landing's
 * "YOUR CAT AWAITS". Shown to `onboarding.state === 'pending'` accounts, guests included, straight
 * from the intro curtain; `/game?meet=1` replays it.
 *
 * The step order and the commit outcomes live in `meetMachine.ts`. This component renders the
 * altar, the panels and the reveal, runs the commit (`POST /user/starter`) and reports the result.
 */

/** "Your cat awaits…": the painted tabby holds this long before it becomes pixel Scout. */
export const AWAITS_CROSSFADE_MS = 1200;
/** The loading step waits for the altar art at most this long. */
export const LOADING_MAX_MS = 1500;
const LOADING_MIN_MS = 350;
/** The reveal's card glow fades after this long (as in a pack opening). */
const REVEAL_GLOW_MS = 1000;

export type MeetCommitOutcome =
  | { status: "committed"; breed: StarterBreed; name: string; cat: IStarterCat; skipped: boolean }
  | { status: "locked"; breed: StarterBreed; name: string; skipped: boolean }
  | { status: "offline"; breed: StarterBreed; name: string; skipped: boolean }
  /** Nothing was saved and no draft was kept (401, 403, a non-NAME 400, or no uid). */
  | { status: "failed"; breed: StarterBreed; name: string; skipped: boolean };

export interface MeetSummary {
  exit: "finished" | "skipped";
  breed: StarterBreed;
  name: string;
  followed: string[];
}

export interface MeetYourCatProps {
  open: boolean;
  /** Firebase uid, for the offline draft. */
  uid?: string | null;
  /**
   * Called once per commit answer other than a name refusal: committed, 409, kept offline, or
   * failed (nothing saved; the caller must not mark onboarding done).
   */
  onCommitted?: (outcome: MeetCommitOutcome) => void;
  /** The ceremony ended (finished or skipped). The caller shows the lobby and hands off. */
  onDone: (summary: MeetSummary) => void;
}

function track<E extends AnalyticsEventName>(name: E, properties?: AnalyticsEventProperties[E]) {
  try {
    analytics.track(buildEvent(name, (properties ?? {}) as AnalyticsEventProperties[E]));
  } catch {
    // Analytics never breaks the ceremony.
  }
}

function preload(urls: ReadonlyArray<string>) {
  if (typeof Image === "undefined") return;
  urls.forEach((url) => {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  });
}

export const MeetYourCat = ({ open, uid, onCommitted, onDone }: MeetYourCatProps) => {
  const [state, dispatch] = useReducer(meetReducer, undefined, initialMeetState);
  const reducedMotion = useReducedMotion();
  const viewport = useVisualViewport();
  const [crossfaded, setCrossfaded] = useState(false);
  const [featured, setFeatured] = useState<IFeaturedCat[] | null>(null);
  const [reserved, setReserved] = useState<string[]>([]);
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const [followPending, setFollowPending] = useState<Set<string>>(() => new Set());
  const [followMessage, setFollowMessage] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const altarReady = useRef(false);
  const shownAt = useRef(0);
  const commitStarted = useRef(false);
  const doneSent = useRef(false);
  const skippedFrom = useRef<MeetStep>("loading");
  const callbacks = useLatest({ onCommitted, onDone });

  const look = starterLook(state.breed);
  const cardScale = useIntegerScale({ fraction: 0.25, cap: 96, min: 2, max: 2, initial: 2 });

  /* ------------------------------------------------------------ lifecycle */

  useEffect(() => {
    if (!open) return;
    shownAt.current = Date.now();
    track("onboarding_shown");
    preload([ALTAR_ART.paintedCat, ALTAR_ART.title, ...STARTER_IMAGES]);
    let alive = true;
    void STARTER_API.featured(3).then((cats) => {
      if (!alive) return;
      setFeatured(cats);
      dispatch({ type: "FEATURED", count: cats.length });
    });
    void STARTER_API.featuredNames().then((names) => {
      if (alive) setReserved(names);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  // Loading: the altar background only, until its art has loaded (bounded both ways).
  useEffect(() => {
    if (state.step !== "loading") return;
    const finish = () => dispatch({ type: "LOADED" });
    const max = setTimeout(finish, LOADING_MAX_MS);
    const poll = setInterval(() => {
      if (altarReady.current && Date.now() - shownAt.current >= LOADING_MIN_MS) finish();
    }, 50);
    return () => {
      clearTimeout(max);
      clearInterval(poll);
    };
  }, [state.step]);

  // "Your cat awaits…": hold the painted tabby, then crossfade to pixel Scout.
  useEffect(() => {
    if (state.step !== "awaits") return;
    const timer = setTimeout(() => setCrossfaded(true), AWAITS_CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [state.step]);

  // Each visible step: analytics, and focus moves to its heading (SKIP stays first in the order).
  // Focus moves in the same commit as the step (a layout effect), so a Tab pressed right after the
  // step appears is never undone a frame later. A target that is not mounted yet is retried on
  // the next frame.
  useEffect(() => {
    if (!VISIBLE_STEPS.includes(state.step)) return;
    track("onboarding_step_viewed", { step: state.step });
  }, [state.step]);
  useLayoutEffect(() => {
    if (!VISIBLE_STEPS.includes(state.step)) return;
    const focusStep = () => {
      const target = state.step === "name" ? inputRef.current : headingRef.current;
      if (!target?.isConnected) return false;
      target.focus({ preventScroll: true });
      return true;
    };
    if (focusStep()) return;
    const frame = requestAnimationFrame(() => {
      focusStep();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.step]);

  // The commit: at the reveal, or straight away on SKIP.
  useEffect(() => {
    if (state.commit !== "pending" || commitStarted.current) return;
    commitStarted.current = true;
    const skipped = state.exit === "skipped";
    const breed = skipped ? DEFAULT_STARTER : state.breed;
    const name = skipped ? starterLook(DEFAULT_STARTER).name : state.name || look.name;
    void commitStarterChoice(skipped ? { breed, skipped: true } : { breed, name }, uid).then((result) => {
      if (result.status === "invalid") {
        commitStarted.current = false;
        track("cat_name_rejected", { reason: result.code });
        dispatch({ type: "COMMIT_INVALID", error: result.code });
        return;
      }
      if (result.status === "committed") {
        track("starter_committed", { starter: breed });
        dispatch({ type: "COMMIT_RESULT", result: "committed", name: result.cat.name });
        callbacks.current.onCommitted?.({ status: "committed", breed, name: result.cat.name, cat: result.cat, skipped });
        return;
      }
      if (result.status === "locked") {
        dispatch({ type: "COMMIT_RESULT", result: "locked" });
        callbacks.current.onCommitted?.({ status: "locked", breed, name, skipped });
        return;
      }
      // Offline or a server error: the draft is kept (commit.ts) and the ceremony goes on.
      if (wasKept(result, uid)) {
        dispatch({ type: "COMMIT_RESULT", result: "offline" });
        callbacks.current.onCommitted?.({ status: "offline", breed, name, skipped });
        return;
      }
      // Nothing kept: the reveal offers a retry; going on leaves onboarding pending on the server.
      commitStarted.current = false;
      dispatch({ type: "COMMIT_RESULT", result: "failed" });
      callbacks.current.onCommitted?.({ status: "failed", breed, name, skipped });
    });
  }, [state.commit, state.exit, state.breed, state.name, look.name, uid, callbacks]);

  useEffect(() => {
    if (state.step !== "done" || doneSent.current) return;
    doneSent.current = true;
    if (state.exit === "skipped") track("onboarding_skipped", { step: skippedFrom.current });
    callbacks.current.onDone({
      exit: state.exit || "finished",
      breed: state.exit === "skipped" ? DEFAULT_STARTER : state.breed,
      name: state.exit === "skipped" ? starterLook(DEFAULT_STARTER).name : state.name || look.name,
      followed: Array.from(following),
    });
  }, [state.step, state.exit, state.breed, state.name, look.name, following, callbacks]);

  /* -------------------------------------------------------------- actions */

  // The reveal cannot be left until the commit answers (review 4a #3).
  const revealSaving = state.step === "reveal" && state.commit === "pending";

  const skip = useCallback(() => {
    if (state.step === "reveal" && state.commit === "pending") return;
    skippedFrom.current = state.step;
    dispatch({ type: "SKIP" });
  }, [state.step, state.commit]);

  const select = (breed: StarterBreed) => {
    if (breed !== state.breed) track("starter_selected", { starter: breed });
    dispatch({ type: "SELECT", breed });
  };

  const changeName = (value: string) => {
    const check = checkName(value, reserved);
    dispatch({ type: "SET_NAME", value, error: check.ok ? null : check.code });
  };

  const submitName = () => {
    const check = checkName(state.nameInput, reserved);
    if (!check.ok) {
      track("cat_name_rejected", { reason: check.code });
      dispatch({ type: "SUBMIT_NAME", name: null, error: check.code });
      inputRef.current?.focus();
      return;
    }
    track("starter_named", { length: check.name.length });
    dispatch({ type: "SUBMIT_NAME", name: check.name, error: null });
  };

  const surprise = () => {
    const name = surpriseName(state.nameInput, reserved);
    const check = checkName(name, reserved);
    dispatch({ type: "SET_NAME", value: name, error: check.ok ? null : check.code });
    inputRef.current?.focus();
  };

  const toggleFollow = async (cat: IFeaturedCat) => {
    if (followPending.has(cat._id)) return;
    const wasFollowing = following.has(cat._id);
    const optimistic = new Set(following);
    if (wasFollowing) optimistic.delete(cat._id);
    else optimistic.add(cat._id);
    setFollowing(optimistic);
    setFollowMessage(null);
    setFollowPending((current) => new Set(current).add(cat._id));
    const result = wasFollowing ? await STARTER_API.unfollow(cat._id) : await STARTER_API.follow(cat._id);
    setFollowPending((current) => {
      const next = new Set(current);
      next.delete(cat._id);
      return next;
    });
    if (!result.ok) {
      setFollowing((current) => {
        const next = new Set(current);
        if (wasFollowing) next.add(cat._id);
        else next.delete(cat._id);
        return next;
      });
      setFollowMessage(`We couldn't ${wasFollowing ? "unfollow" : "follow"} ${displayCatName(cat.name)}. Try again.`);
      return;
    }
    if (!wasFollowing) track("featured_cat_followed");
  };

  /* -------------------------------------------------------------- render */

  const step = state.step;
  const nameError = state.nameError ? nameMessage(state.nameError) : null;
  const pendingName = checkName(state.nameInput, reserved);
  const submitLabel =
    pendingName.ok && pendingName.name.length <= 8 ? `MEET ${pendingName.name.toUpperCase()}` : "REVEAL";
  // The cat on the altar: Scout until the crossfade, then the chosen starter.
  const showPixelCat = step === "choose" || step === "name" || step === "featured" || (step === "awaits" && crossfaded);
  const stageAnchor = step === "awaits" || step === "loading" ? 0.82 : 0.9;

  const dialogStyle = viewport
    ? { top: viewport.offsetTop, height: viewport.height }
    : { top: 0, bottom: 0 };

  return (
    <Dialog.Root open={open} modal>
      <Dialog.Portal>
        <Dialog.Content
          ref={contentRef}
          data-testid="meet-your-cat"
          data-step={step}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-x-0 z-modal flex flex-col overflow-hidden bg-tt-night-900 text-tt-cream outline-none"
          style={dialogStyle}
        >
          <Dialog.Title className="sr-only">Meet your cat</Dialog.Title>

          {/* SKIP first in the focus order; it commits the default starter. Above the reveal layer
              (z-reveal, 400, in this dialog's stacking context) so it is never covered. */}
          {step !== "done" && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[410] flex justify-end px-3"
              style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={skip}
                disabled={revealSaving}
                data-testid="meet-skip"
                className={clsx(
                  "disabled:cursor-wait disabled:opacity-60",
                  "pointer-events-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center border-2 border-tt-gold-500/70 bg-tt-night-800/80 px-4",
                  "font-secondary text-p4 uppercase tracking-widest text-tt-cream hover:bg-tt-night-700",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
                )}
              >
                Skip
                <span className="sr-only">
                  {step === "reveal" || step === "featured"
                    ? ", go to the game"
                    : `, keep ${starterLook(DEFAULT_STARTER).name} and go to the game`}
                </span>
              </button>
            </div>
          )}

          {/* One polite region for step changes and the reveal's "Meet {name}!". */}
          <p aria-live="polite" className="sr-only" data-testid="meet-announce">
            {step === "loading" ? "Getting your cat ready" : step === "reveal" ? `Meet ${state.name}!` : ""}
          </p>

          {/* The altar stage. */}
          <div className="relative min-h-[72px] flex-1">
            <AltarScene
              paintedCat={step === "awaits"}
              paintedOpacity={crossfaded ? 0 : 1}
              dim={step !== "loading" && step !== "awaits"}
              anchorY={stageAnchor}
              reducedMotion={reducedMotion}
              onReady={() => {
                altarReady.current = true;
              }}
            >
              {(box) => {
                const scale = altarSpriteScale(box, 24, step === "awaits" ? 8 : 6);
                const shown = step === "awaits" ? starterLook(DEFAULT_STARTER) : look;
                return (
                  <PixelCat
                    src={shown.idle}
                    still={shown.still}
                    reducedMotion={reducedMotion}
                    scale={scale}
                    alt=""
                    testId="altar-pixel-cat"
                    className={clsx(
                      "pointer-events-none",
                      reducedMotion ? "transition-none" : "transition-opacity duration-700 ease-out",
                    )}
                    style={{ ...altarSpriteStyle(box, scale), opacity: showPixelCat ? 1 : 0 }}
                  />
                );
              }}
            </AltarScene>
            {step === "awaits" && (
              <div
                // On short screens (phones in landscape) the title would cover the cat: the panel
                // heading says it instead.
                className="pointer-events-none absolute inset-x-0 top-[14%] flex justify-center px-4 md:top-[10%] [@media(max-height:520px)]:hidden"
                aria-hidden="true"
              >
                <span
                  className="block w-[min(92vw,760px)] animate-appear motion-reduce:animate-none"
                  style={{
                    aspectRatio: "1845 / 352",
                    backgroundImage: `url(${ALTAR_ART.title})`,
                    backgroundSize: `${(2800 / 1845) * 100}% auto`,
                    backgroundPosition: `${(492 / (2800 - 1845)) * 100}% ${(531 / (1563 - 352)) * 100}%`,
                    backgroundRepeat: "no-repeat",
                    imageRendering: "pixelated",
                  }}
                />
              </div>
            )}
          </div>

          {/* The panel for the step. */}
          {/* Shrinks and scrolls when the screen is short (landscape phones, an open keyboard). */}
          <div
            className="relative z-[5] min-h-0 shrink overflow-y-auto overscroll-contain px-3 pt-1 md:px-6"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {step === "awaits" && (
              <MeetPanel testId="meet-awaits" className="max-w-[460px]">
                <div className="flex flex-col items-center gap-3 text-center">
                  <StepHeading ref={headingRef} id="meet-awaits-title">
                    Your cat awaits…
                  </StepHeading>
                  <StepText>A little companion is waiting on the altar for you.</StepText>
                  <PixelButton
                    text="MEET YOUR CAT"
                    onClick={() => dispatch({ type: "CONTINUE" })}
                    id="meet-awaits-continue"
                  />
                </div>
              </MeetPanel>
            )}
            {step === "choose" && (
              <ChoosePanel
                selected={state.breed}
                onSelect={select}
                onContinue={() => dispatch({ type: "CONTINUE" })}
                onBack={() => dispatch({ type: "BACK" })}
                headingRef={headingRef}
                reducedMotion={reducedMotion}
                cardScale={cardScale}
              />
            )}
            {step === "name" && (
              <NamePanel
                value={state.nameInput}
                error={nameError}
                onChange={changeName}
                onSubmit={submitName}
                onSurprise={surprise}
                onBack={() => dispatch({ type: "BACK" })}
                headingRef={headingRef}
                inputRef={inputRef}
                submitLabel={submitLabel}
              />
            )}
            {step === "featured" && (
              <FeaturedPanel
                cats={featured}
                following={following}
                pending={followPending}
                message={followMessage}
                onToggle={(cat) => void toggleFollow(cat)}
                onStart={() => dispatch({ type: "START" })}
                headingRef={headingRef}
              />
            )}
          </div>

          {step === "reveal" && (
            <MeetReveal reducedMotion={reducedMotion}>
              <RevealCard
                name={state.name || look.name}
                src={look.idle}
                still={look.still}
                reducedMotion={reducedMotion}
                headingRef={headingRef}
                saving={revealSaving}
                failed={state.commit === "failed"}
                onRetry={() => dispatch({ type: "RETRY" })}
                onContinue={() => dispatch({ type: "CONTINUE" })}
              />
            </MeetReveal>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/**
 * The reveal light: on when the reveal mounts, fading after a second like a pack opening. A fade,
 * not motion, so reduced motion keeps it (RevealAnimation shortens the fade and drops the spin).
 */
const MeetReveal = ({ reducedMotion, children }: { reducedMotion: boolean; children: ReactNode }) => {
  const [glow, setGlow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setGlow(false), REVEAL_GLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <RevealAnimation showRevealOverlay={glow} reducedMotion={reducedMotion} testId="meet-reveal">
      {children}
    </RevealAnimation>
  );
};

/** The reveal's centrepiece: the starter large at an integer scale, under its "Meet {name}!" plate. */
const RevealCard = ({
  name,
  src,
  still,
  reducedMotion,
  headingRef,
  saving,
  failed,
  onRetry,
  onContinue,
}: {
  name: string;
  src: string;
  still: string;
  reducedMotion: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  saving: boolean;
  failed: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) => {
  const scale = useIntegerScale({ fraction: 0.42, cap: 288, min: 3, max: 6, initial: 4 });
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center" data-testid="meet-reveal-card">
      <PixelCat
        src={src}
        still={still}
        reducedMotion={reducedMotion}
        scale={scale}
        alt=""
        testId="reveal-pixel-cat"
        className={clsx(!reducedMotion && "animate-appear")}
        style={{ marginBottom: -10 * scale, marginTop: -8 * scale }}
      />
      {/* One plate with the name (the old gold nameplate repeated it): night, so it reads over the
          reveal light. */}
      <div className="relative z-[1] mt-1 flex flex-col items-center gap-3 border-2 border-tt-gold-500/70 bg-tt-night-800/90 px-6 pb-4 pt-3 shadow-[0_6px_0_rgb(var(--tt-night-950))]">
        <StepHeading ref={headingRef} id="meet-reveal-title">
          Meet {name}!
        </StepHeading>
        {/* Waits for the save's answer, so a name the server refuses comes back to the nameplate.
            Offline still counts as done (draft kept); the request gives up after 10 s. */}
        {failed && (
          <p className="max-w-[18rem] font-secondary text-p5 text-tt-cream" data-testid="meet-save-failed">
            We couldn&apos;t save {name}. Try again, or keep playing and choose again next time.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {failed && <PixelButton text="TRY AGAIN" onClick={onRetry} id="meet-reveal-retry" />}
          <PixelButton
            text={saving ? "SAVING…" : "CONTINUE"}
            busy={saving}
            onClick={onContinue}
            id="meet-reveal-continue"
          />
        </div>
        <span className="sr-only" aria-live="polite">
          {saving ? "Saving your cat" : ""}
        </span>
      </div>
    </div>
  );
};

export default MeetYourCat;
