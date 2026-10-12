import { elapsedSeconds } from "@/analytics/growth-events";
import { useReducedMotion } from "@/components/onboarding/useReducedMotion";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { isApp as isAppBuild } from "@/models/app";
import type { ICat } from "@/models/cats";
import type { IProfile } from "@/models/profile";
import type { YourcatFamilyOption, YourcatView } from "@/models/yourcat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppOnlyNotice } from "./AppOnlyNotice";
import { YourcatMotionStyles } from "./brand";
import { displayName, FRIEND, MANUAL, S1, S2, S3, type ErrorAction } from "./copy";
import { Frame, type FrameHandle } from "./Frame";
import { ManualPick, ManualPickHeading } from "./ManualPick";
import { PAID_FRAME_INNER, PaidFrameContent, PaidState } from "./PaidState";
import { PetCat } from "./PetCat";
import { PortraitUpsell } from "./PortraitUpsell";
import { RevealStep } from "./RevealStep";
import { Stage, StudioSky } from "./Stage";
import { InSlot, NIGHT_COLUMN, NIGHT_COLUMN_BOTTOM, StudioContext, type CueListener, type StageConfig, type Studio, type StudioSlots } from "./studio";
import { TransformFrame, type TransformMode } from "./TransformFrame";
import { UploadStep } from "./UploadStep";
import { useYourcat, type Screen } from "./useYourcat";
import { WorkingStep } from "./WorkingStep";

/** The frame's inner box on S1 to S3: an integer multiple of 96 (192 phones, 384 md+), §2.6. */
export const FRAME_INNER = Object.freeze({ w: 192, h: 192, mdW: 384, mdH: 384 });
/** S2 beat C starts this long after the working screen began (§4 S2). */
export const BEAT_C_MS = 6000;

const EMPTY_SLOTS: StudioSlots = { frameFx: null, companion: null, cat: null, overlay: null, panel: null, extras: null };

/**
 * `/yourcat` (bet #3, docs/plans/yourcat-v2.md §1, docs/plans/yourcat-polish.md §3): one photo of the
 * visitor's cat becomes their playable pixel cat, a pixel portrait and a share card.
 *
 * The page is a studio: one `<Stage>` with one gilt `<Frame>` and its `<TransformFrame>` stays mounted
 * across the friend view (S0), upload (S1), working (S2), reveal (S3), the manual pick and the paid
 * return (S6), so the frame never moves or resizes between screens. Phones stack heading, stage and
 * panel; md+ is a two-column studio (`grid-cols-[minmax(0,1fr)_420px]`): the stage in column 1, the
 * heading and the screen's panel in column 2. Screens fill the slots through portals (`studio.tsx`).
 * The app build shows only the "works in your browser" notice (no stage, no prices).
 */
export function YourCatPage({ isApp = isAppBuild, className = "" }: { isApp?: boolean; className?: string }) {
  const auth = useOptionalFirebaseAuth();
  // Without an auth provider (tests, embeds) the API is called straight away.
  const authReady = auth ? auth.authReady || auth.authSettled : true;
  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const toast = useCallback((message: string) => showToast({ message }), [showToast]);
  const reducedMotion = useReducedMotion();

  // The profile follows the record, so /game shows the new cat as the hero (§4.4).
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  });
  const onRecord = useCallback(
    (view: YourcatView, change: "created" | "renamed" | "loaded") => {
      if (change === "loaded") return;
      const current = profileRef.current;
      if (!current) return;
      const others = (current.cats || []).filter((cat) => cat?._id !== view.cat._id);
      const existing = (current.cats || []).find((cat) => cat?._id === view.cat._id);
      const cat = { ...(existing || {}), ...view.cat, starterBreed: undefined } as unknown as ICat;
      if (change === "renamed") {
        setProfileUpdate({
          cat: current.cat?._id === view.cat._id ? ({ ...current.cat, name: view.cat.name } as ICat) : current.cat,
          cats: (current.cats || []).map((item) => (item?._id === view.cat._id ? ({ ...item, name: view.cat.name } as ICat) : item)),
        });
        return;
      }
      setProfileUpdate({
        cat,
        cats: [cat, ...others],
        onboarding: { state: "done" },
      } as Partial<IProfile>);
    },
    [setProfileUpdate],
  );

  // The reveal clock is a screen recording: the stage must be in view before it starts (§4 S2).
  const stageRef = useRef<HTMLDivElement | null>(null);
  const beforeReveal = useCallback(() => {
    try {
      const top = stageRef.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight)) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }
    } catch {
      // Old browsers: no scroll, the reveal still plays.
    }
  }, []);

  const state = useYourcat({ authReady, isApp, onRecord, reducedMotion, beforeReveal });
  const { screen, record, status, actions } = state;

  // ---- the studio: slots, stage state, cue listener, replay ---------------------------------------
  const frameRef = useRef<FrameHandle | null>(null);
  const [slots, setSlots] = useState<StudioSlots>(EMPTY_SLOTS);
  const setSlot = useCallback(
    (key: keyof StudioSlots, node: HTMLElement | null) => setSlots((now) => (now[key] === node ? now : { ...now, [key]: node })),
    [],
  );
  const setFrameFx = useCallback((node: HTMLElement | null) => setSlot("frameFx", node), [setSlot]);
  const setCompanion = useCallback((node: HTMLElement | null) => setSlot("companion", node), [setSlot]);
  const setCat = useCallback((node: HTMLElement | null) => setSlot("cat", node), [setSlot]);
  const setOverlay = useCallback((node: HTMLElement | null) => setSlot("overlay", node), [setSlot]);
  const setPanel = useCallback((node: HTMLElement | null) => setSlot("panel", node), [setSlot]);
  const setExtras = useCallback((node: HTMLElement | null) => setSlot("extras", node), [setSlot]);
  const [stageConfig, setStageConfig] = useState<StageConfig>({});
  const listenerRef = useRef<CueListener | null>(null);
  const [replayToken, setReplayToken] = useState(0);
  const studio = useMemo<Studio>(
    () => ({
      slots,
      frame: frameRef,
      stage: stageRef,
      configure: setStageConfig,
      listen: (listener) => {
        listenerRef.current = listener;
      },
      replay: () => setReplayToken((value) => value + 1),
    }),
    [slots],
  );
  const onCue = useCallback((cue: "hold" | "stepOut" | "title" | "done") => listenerRef.current?.onCue?.(cue), []);
  const onAvatarLanded = useCallback(() => listenerRef.current?.onAvatarLanded?.(), []);

  // ---- S2 beat C: 6 s after the working screen began ---------------------------------------------
  const [beatC, setBeatC] = useState(false);
  useEffect(() => {
    if (screen !== "working") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBeatC(false);
      return;
    }
    const timer = setTimeout(() => setBeatC(true), BEAT_C_MS);
    return () => clearTimeout(timer);
  }, [screen]);

  // ---- the manual pick previews the selected family on the stage --------------------------------------
  const [preview, setPreview] = useState<YourcatFamilyOption | null>(null);

  // Focus moves to each new screen's heading (§1.6); the first render keeps the page's own focus.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [screen]);

  const onAction = useCallback(
    (action: ErrorAction) => {
      if (action === "manual") actions.openManual();
      else if (action === "retry") actions.retry();
      else if (action === "reload") window.location.reload();
      else actions.backToStart();
    },
    [actions],
  );

  const isGuest = !!(profile as (IProfile & { isGuest?: boolean }) | null | undefined)?.isGuest || auth?.authStatus === "guest";
  const name = record ? displayName(record.name, record.named) : "your cat";
  const secondsToReveal =
    state.fresh && state.timing.selectedAt && state.timing.revealedAt
      ? elapsedSeconds(state.timing.selectedAt, state.timing.revealedAt)
      : null;

  const portrait = status?.portrait ?? null;
  const portraitStatus = record?.portrait.status ?? "none";
  const showPaidInline = portraitStatus === "painting" || portraitStatus === "ready" || portraitStatus === "failed";
  // A fresh reveal shows the upsell once the free pixel portrait is no longer drawing (it is the payoff
  // the visitor waits for); a returning visitor sees it at once.
  const showUpsell =
    !isApp &&
    !!record &&
    !!portrait?.enabled &&
    record.photo.stored &&
    !showPaidInline &&
    !(state.fresh && state.avatarStatus === "pending");
  // Uploads closed (budget spent or paused): no "back to the photo" or "new photo" promises.
  const uploadsOpen = status ? status.enabled && status.uploadsOpen : true;

  if (isApp) {
    return (
      <div
        className={`relative w-full flex-1 bg-tt-night-900 text-tt-cream ${className}`}
        data-testid="yourcat-page"
        data-screen="app"
      >
        <YourcatMotionStyles />
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-[76px] md:px-12 md:pt-[104px]">
          <AppOnlyNotice ref={headingRef} />
        </div>
      </div>
    );
  }

  // ---- what the persistent frame holds on this screen -----------------------------------------------
  const shown: Screen = screen === "reveal" && !record ? "upload" : screen === "paid" && !record ? "upload" : screen;
  const friend = shown === "friend" ? state.friend : null;
  const clocked = shown === "reveal" && ((state.fresh && !!state.photoUrl) || state.manualFresh);
  let mode: TransformMode = "empty";
  if (shown === "working") mode = "working";
  else if (shown === "friend") mode = "settled";
  else if (shown === "reveal") mode = state.fresh && state.photoUrl ? "reveal" : state.manualFresh ? "manual" : "settled";
  const avatarUrl =
    shown === "friend"
      ? friend?.view.avatarUrl ?? null
      : record && state.avatarStatus === "ready"
        ? record.avatar.url
        : null;
  const spriteImg = shown === "friend" ? friend?.view.spriteImg ?? "" : record?.cat.spriteImg ?? "";
  const frameLabel =
    shown === "friend" && friend
      ? FRIEND.portraitAlt(friend.view.name, friend.view.familyLabel)
      : shown === "working"
        ? S2.photoAlt
        : shown === "reveal" && record
          ? S3.frameLabel(name, record.familyLabel)
          : S1.frameLabel;
  const paid = shown === "paid" && !!record;
  const failed = shown === "working" && !!state.error;

  const frameContent = paid && record ? (
    <PaidFrameContent
      avatarUrl={record.avatar.status === "ready" ? record.avatar.url : null}
      spriteImg={record.cat.spriteImg}
      portraitUrl={record.portrait.url}
      status={record.portrait.status}
      reducedMotion={reducedMotion}
      renderCat={(phase) => {
        // S6: the cat sits beside the painting and blinks; when the veil has wiped away it stands and
        // faces the frame (same slot and scale as S3). Still pettable.
        const hung = phase === "ready";
        return (
          <PetCat
            spriteImg={record.cat.spriteImg}
            name={name}
            labels={{ pet: S3.pet.pet(name), tap: S3.pet.tap(name), purrs: S3.pet.purrs(name) }}
            mode={hung ? "idle" : "sit"}
            facing={hung ? "left" : "right"}
            blink
            reducedMotion={reducedMotion}
          />
        );
      }}
    />
  ) : (
    <TransformFrame
      photoUrl={shown === "working" || shown === "reveal" ? state.photoUrl : null}
      avatarUrl={avatarUrl}
      spriteImg={spriteImg}
      mode={mode}
      working={{ sent: state.sent, beatC, failed }}
      reducedMotion={reducedMotion}
      label={frameLabel}
      pendingLabel={state.avatarStatus === "failed" ? "" : S3.pendingLabel}
      photoBadgeLabel={S3.photoBadge}
      replayToken={replayToken}
      onCue={onCue}
      onAvatarLanded={onAvatarLanded}
    />
  );

  // ---- the screen ---------------------------------------------------------------------------------
  let body: React.ReactNode = null;
  if (shown === "working") {
    body = (
      <WorkingStep
        ref={headingRef}
        sent={state.sent}
        pendingName={state.pendingName}
        onName={actions.updatePendingName}
        error={state.error?.copy ?? null}
        onAction={onAction}
        reducedMotion={reducedMotion}
      />
    );
  } else if (shown === "manual" && status) {
    // The H1 sits in the heading block (column 2, row 1 on md+), the panel straight under it.
    body = (
      <>
        <ManualPickHeading ref={headingRef} />
        <InSlot slot="panel">
          <ManualPick
            titled={false}
            families={status.families}
            busy={state.busy}
            onMake={actions.makeManual}
            onBack={actions.backToStart}
            uploadsOpen={uploadsOpen}
            onSelect={setPreview}
            reducedMotion={reducedMotion}
          />
        </InSlot>
        {preview && (
          <InSlot slot="cat">
            <PetCat
              key={preview.family}
              spriteImg={preview.spriteImg}
              name={preview.label}
              labels={{ pet: MANUAL.preview(preview.label), tap: preview.label, purrs: preview.label }}
              interactive={false}
              sound={false}
              reducedMotion={reducedMotion}
            />
          </InSlot>
        )}
      </>
    );
  } else if (paid && record) {
    body = (
      <InSlot slot="panel">
        <PaidState
          ref={headingRef}
          record={record}
          name={name}
          portrait={portrait}
          late={state.paidLate}
          onBack={actions.showCard}
          reportPaid
          showPortrait={false}
          reducedMotion={reducedMotion}
        />
      </InSlot>
    );
  } else if (shown === "reveal" && record) {
    body = (
      <RevealStep
        key={record.id}
        ref={headingRef}
        record={record}
        avatarStatus={state.avatarStatus}
        clocked={clocked}
        manual={state.manual}
        uploadsOpen={uploadsOpen}
        canReplay={state.canReplay}
        shareId={state.shareId}
        reducedMotion={reducedMotion}
        nameError={state.nameError}
        onRename={actions.rename}
        onDelete={actions.deleteRecord}
        onStartOver={actions.startOver}
        isGuest={isGuest}
        onCreateAccount={auth ? () => void auth.requireAccount("save-progress") : undefined}
        secondsToReveal={secondsToReveal}
        shelterCandidates={actions.shelterCandidates}
        toast={toast}
      />
    );
  } else {
    body = (
      <UploadStep
        key={friend ? "friend" : "upload"}
        ref={headingRef}
        status={status}
        statusFailed={state.statusFailed}
        getting={state.booting || !authReady}
        fileError={state.fileError}
        onFile={(file, source) => void actions.chooseFile(file, source)}
        onManual={actions.openManual}
        reducedMotion={reducedMotion}
        friend={friend ? friend.view : null}
        onSeeOwn={friend && record ? actions.showOwnCat : undefined}
      />
    );
  }

  const below =
    shown === "reveal" && record ? (
      <>
        {showPaidInline && (
          <div className="mx-auto mt-24 w-full max-w-3xl px-4">
            <PaidState
              record={record}
              name={name}
              portrait={portrait}
              late={state.paidLate}
              onBack={() => window.scrollTo({ top: 0 })}
              reducedMotion={reducedMotion}
            />
          </div>
        )}
        {showUpsell && portrait && (
          <div className="mx-auto mt-24 w-full max-w-3xl px-4">
            <PortraitUpsell
              record={record}
              name={name}
              portrait={portrait}
              onExists={() => void actions.refreshFromServer()}
              reducedMotion={reducedMotion}
            />
          </div>
        )}
      </>
    ) : null;

  return (
    <StudioContext.Provider value={studio}>
      <div
        className={`relative min-h-[100svh] w-full flex-1 bg-tt-night-900 text-tt-cream ${shown === "reveal" ? "max-md:pb-24" : ""} ${className}`}
        data-testid="yourcat-page"
        data-screen={shown}
      >
        <YourcatMotionStyles />
        {/* md+: the painted world behind the whole studio (R2-03); the grid after it is `relative`, so it paints on top. */}
        <StudioSky reducedMotion={reducedMotion} />
        <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center px-4 pb-16 pt-[76px] xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start xl:gap-x-12 xl:gap-y-0 md:px-12 md:pt-[104px]">
          {body}
          <div key="stage" ref={stageRef} className="w-full md:mx-auto md:max-w-[680px] xl:mx-0 xl:max-w-none xl:col-start-1 xl:row-span-2 xl:row-start-1">
            <Stage
              reducedMotion={reducedMotion}
              shifted={!!stageConfig.shifted && shown === "reveal"}
              companionSide={stageConfig.companionSide}
              onDrop={stageConfig.onDrop}
              onDragState={stageConfig.onDragState}
              frame={
                <div className="relative">
                  <Frame
                    ref={frameRef}
                    inner={paid ? PAID_FRAME_INNER : FRAME_INNER}
                    legs
                    sheen={!!stageConfig.sheen && !paid}
                    breathe={shown === "working" && beatC && !failed}
                    dragOver={!!stageConfig.dragOver}
                    failed={failed}
                    reducedMotion={reducedMotion}
                    className={shown === "upload" ? "yc-fade-in [--yc-delay:140ms] [--yc-dur:600ms]" : ""}
                  >
                    {frameContent}
                  </Frame>
                  <div ref={setFrameFx} className="pointer-events-none absolute inset-0" />
                </div>
              }
              companion={<div ref={setCompanion} className="flex items-end" />}
              cat={<div ref={setCat} className="flex items-end" />}
              overlay={<div ref={setOverlay} className="pointer-events-none absolute inset-0" />}
            />
          </div>
          <div
            key="panel"
            ref={setPanel}
            className={`w-full max-w-xl xl:col-start-2 xl:row-span-3 xl:max-w-none xl:self-start xl:sticky xl:top-[104px] ${
              // S6 keeps its H1 inside the panel (it is shared with the inline S3 use), so the panel itself
              // takes column 2, row 1 and the whole night panel; every other screen has a heading block
              // there, the night panel's top half.
              paid ? `xl:row-start-1 ${NIGHT_COLUMN}` : `xl:row-start-2 ${NIGHT_COLUMN_BOTTOM}`
            }`}
            data-testid="yourcat-panel"
          />
          <div key="extras" ref={setExtras} className="w-full max-w-xl xl:col-start-1 xl:row-start-3 xl:mt-4 xl:max-w-none" />
        </div>
        {below && <div className="relative">{below}</div>}
      </div>
    </StudioContext.Provider>
  );
}

export default YourCatPage;
