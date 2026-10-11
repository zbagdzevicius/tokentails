import { useReducedMotion } from "@/components/onboarding/useReducedMotion";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { isApp as isAppBuild } from "@/models/app";
import type { ICat } from "@/models/cats";
import type { IProfile } from "@/models/profile";
import type { YourcatView } from "@/models/yourcat";
import { useCallback, useEffect, useRef } from "react";
import { AppOnlyNotice } from "./AppOnlyNotice";
import { displayName, type ErrorAction } from "./copy";
import { ManualPick } from "./ManualPick";
import { PaidState } from "./PaidState";
import { PortraitUpsell } from "./PortraitUpsell";
import { RevealStep } from "./RevealStep";
import { YourcatStyles } from "./ui";
import { UploadStep } from "./UploadStep";
import { elapsedSeconds } from "@/analytics/growth-events";
import { useYourcat } from "./useYourcat";
import { WorkingStep } from "./WorkingStep";

/**
 * `/yourcat` (bet #3, docs/plans/yourcat-v2.md §1): one photo of the visitor's cat becomes their
 * playable pixel cat, a pixel portrait and a share card. Screens S1 (upload), S2 (working), S3
 * (reveal and share), the no-AI pick (§1.5), S5 (HD portrait, web only) and S6 (paid return).
 */
export function YourCatPage({ isApp = isAppBuild }: { isApp?: boolean }) {
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

  const state = useYourcat({ authReady, isApp, onRecord });
  const { screen, record, status, actions } = state;

  // Focus moves to each new screen's heading (§1.6); the first render keeps the page's own focus.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    headingRef.current?.focus();
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

  let body: React.ReactNode;
  if (isApp) {
    body = <AppOnlyNotice ref={headingRef} />;
  } else if (screen === "working") {
    body = (
      <WorkingStep
        ref={headingRef}
        photoUrl={state.photoUrl}
        sent={state.sent}
        pendingName={state.pendingName}
        onName={actions.updatePendingName}
        error={state.error?.copy ?? null}
        onAction={onAction}
      />
    );
  } else if (screen === "manual" && status) {
    body = (
      <ManualPick
        ref={headingRef}
        families={status.families}
        busy={state.busy}
        onMake={actions.makeManual}
        onBack={actions.backToStart}
        uploadsOpen={uploadsOpen}
      />
    );
  } else if (screen === "paid" && record) {
    body = (
      <PaidState
        ref={headingRef}
        record={record}
        name={name}
        portrait={portrait}
        late={state.paidLate}
        onBack={actions.showCard}
        reportPaid
      />
    );
  } else if (screen === "reveal" && record) {
    body = (
      <>
        <RevealStep
          ref={headingRef}
          record={record}
          avatarStatus={state.avatarStatus}
          fresh={state.fresh}
          manual={state.manual}
          uploadsOpen={uploadsOpen}
          photoUrl={state.photoUrl}
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
        {showPaidInline && (
          <div className="mt-24 w-full border-t-2 border-tt-cream/30 pt-12">
            <PaidState record={record} name={name} portrait={portrait} late={state.paidLate} onBack={() => window.scrollTo({ top: 0 })} />
          </div>
        )}
        {showUpsell && portrait && (
          <PortraitUpsell
            record={record}
            name={name}
            portrait={portrait}
            onExists={() => void actions.refreshFromServer()}
          />
        )}
      </>
    );
  } else {
    body = (
      <UploadStep
        ref={headingRef}
        status={status}
        statusFailed={state.statusFailed}
        getting={state.booting || !authReady}
        fileError={state.fileError}
        onFile={(file, source) => void actions.chooseFile(file, source)}
        onManual={actions.openManual}
      />
    );
  }

  return (
    <div className="relative w-full bg-tt-night-900 text-tt-cream" data-testid="yourcat-page" data-screen={isApp ? "app" : screen}>
      <YourcatStyles />
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pb-24 pt-28 md:pt-32">{body}</div>
    </div>
  );
}

export default YourCatPage;
