import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import type { YourcatAvatarStatus, YourcatView } from "@/models/yourcat";
import Link from "next/link";
import { forwardRef, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CardFormat } from "./cardLayout";
import { displayName, NAME_MAX, S3, sentenceName, STATUS_COPY } from "./copy";
import { pickPinkPawCat, type PinkPawCandidate } from "./pinkPawPick";
import { RevealFrame } from "./RevealFrame";
import { canShareFile, copyShareText, isInAppBrowser, shareCardFile, downloadFile, type ShareOutcome } from "./share";
import { ALERT, BODY, CAPTION, GHOST_BUTTON, GOLD_BUTTON, INPUT, ScreenHeading, SpriteStill, TEXT_LINK } from "./ui";
import { useShareCards, variantKey } from "./useShareCards";
import { buildShareUrl } from "./utm";

export const GIF_PLAY_MS = 5000;
export const NAME_DEBOUNCE_MS = 300;

export interface RevealStepProps {
  record: YourcatView;
  /** The avatar state as shown (a portrait still pending after the deadline reads as failed). */
  avatarStatus: YourcatAvatarStatus;
  /** A fresh upload this page view: run the reveal from the photo. */
  fresh: boolean;
  photoUrl: string | null;
  reducedMotion: boolean;
  nameError: string | null;
  onRename: (name: string) => Promise<YourcatView | null>;
  onDelete: () => Promise<boolean>;
  onStartOver: () => void;
  isGuest: boolean;
  onCreateAccount?: () => void;
  /** Seconds from the file selection to this reveal, or null when not measured here. */
  secondsToReveal: number | null;
  shelterCandidates: () => Promise<PinkPawCandidate[]>;
  toast: (message: string) => void;
}

/** The playable cat: the GIF plays for 5 s, then the still frame; a tap plays it again (WCAG 2.2.2). */
function PlayableCat({ catImg, spriteImg, name, reducedMotion }: { catImg: string; spriteImg: string; name: string; reducedMotion: boolean }) {
  const [playing, setPlaying] = useState(!reducedMotion);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlaying(false), GIF_PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, round]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);
  return (
    <button
      type="button"
      className="flex h-[192px] w-[192px] min-h-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400 disabled:cursor-default"
      aria-label={S3.playCat(name)}
      disabled={reducedMotion}
      onClick={() => {
        setRound((value) => value + 1);
        setPlaying(true);
      }}
      data-testid="yourcat-playable"
    >
      {playing ? (
        <img key={round} src={catImg} alt="" className="pixelated h-[192px] w-[192px]" data-testid="yourcat-gif" />
      ) : (
        <SpriteStill spriteImg={spriteImg} scale={4} />
      )}
    </button>
  );
}

/** A dialog that keeps focus inside and gives it back to `returnTo` when closed (§1.6). */
function ConfirmDialog({
  text,
  extra,
  confirm,
  cancel,
  onConfirm,
  onClose,
}: {
  text: string;
  extra?: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // The safe choice first: a second Enter or Space must not delete without reading the question.
    cancelRef.current?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    const buttons = Array.from(ref.current.querySelectorAll<HTMLButtonElement>("button"));
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-tt-night-950/80 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yourcat-delete-text"
        aria-describedby={extra ? "yourcat-delete-extra" : undefined}
        className="w-full max-w-md rounded-2xl border-4 border-tt-gold-500 bg-tt-night-800 p-5 text-tt-cream"
        onKeyDown={onKeyDown}
      >
        <p id="yourcat-delete-text" className={BODY}>
          {text}
        </p>
        {extra && (
          <p id="yourcat-delete-extra" className={`${CAPTION} mt-2`}>
            {extra}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button type="button" className={GOLD_BUTTON} onClick={onConfirm}>
            {confirm}
          </button>
          <button ref={cancelRef} type="button" className={GHOST_BUTTON} onClick={onClose}>
            {cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Phones default to the story format, larger screens to the post format. */
function defaultFormat(): CardFormat {
  try {
    return window.matchMedia("(max-width: 767px)").matches ? "story" : "post";
  } catch {
    return "story";
  }
}

/**
 * S3 "Reveal and share" (S4 merged in): the result in its gold frame, the playable cat, the card
 * preview with format and Pink Paw choices, and Share / Download / Copy link / Play.
 */
export const RevealStep = forwardRef<HTMLHeadingElement, RevealStepProps>((props, ref) => {
  const { record, avatarStatus, fresh, photoUrl, reducedMotion, nameError, onRename, onDelete, onStartOver } = props;
  const name = displayName(record.name, record.named);
  const family = record.familyLabel;

  // ---- name field: the card follows the field (debounced); a refused name keeps the last accepted.
  const [draft, setDraft] = useState(record.named ? record.name : "");
  const [debounced, setDebounced] = useState(draft);
  const [accepted, setAccepted] = useState(record.named ? record.name : "");
  const [saving, setSaving] = useState(false);
  // Once the visitor edits this field, a name arriving from the server no longer overwrites it.
  const touchedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draft), NAME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    // The server's name wins when it changes (the name typed during the wait lands after S3 shows,
    // another tab): the card and, while untouched, the field follow it at once.
    if (!record.named) return;
    setAccepted(record.name);
    if (!touchedRef.current) {
      setDraft(record.name);
      setDebounced(record.name);
    }
  }, [record.named, record.name]);
  const cardName = (nameError ? accepted : debounced).trim();
  // The field and the card must agree before a file leaves: not while the name debounces or saves.
  const nameSettling = saving || draft.trim() !== debounced.trim();

  const save = useCallback(async () => {
    const value = draft.trim();
    if (!value) return;
    setSaving(true);
    try {
      const next = await onRename(value);
      if (next) setAccepted(next.name);
    } finally {
      setSaving(false);
    }
  }, [draft, onRename]);

  // ---- format, Pink Paw ----------------------------------------------------------------------
  const [format, setFormat] = useState<CardFormat>("story");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormat(defaultFormat());
  }, []);
  const [shelter, setShelter] = useState<PinkPawCandidate | null>(null);
  const [withShelter, setWithShelter] = useState(true);
  const { shelterCandidates } = props;
  useEffect(() => {
    let cancelled = false;
    void shelterCandidates().then((candidates) => {
      if (!cancelled) setShelter(pickPinkPawCat(candidates, record.id));
    });
    return () => {
      cancelled = true;
    };
  }, [shelterCandidates, record.id]);
  const panelOn = !!shelter && withShelter;

  const avatarUrl = avatarStatus === "ready" ? record.avatar.url : null;
  const { variants, failed } = useShareCards({
    recordId: record.id,
    name: cardName,
    familyLabel: family,
    avatarUrl,
    spriteImg: record.cat.spriteImg,
    shelter,
    preferred: variantKey(format, panelOn),
  });
  const current = variants[variantKey(format, panelOn)] ?? null;
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current) setPreview(current.url);
  }, [current]);

  // ---- sharing -------------------------------------------------------------------------------
  const [inApp, setInApp] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const copyFieldRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInApp(isInAppBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent));
  }, []);
  useEffect(() => {
    // Evaluated on the real file; kept while the next generation renders, so "Share" stays in place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current) setCanShare(canShareFile(current.file));
  }, [current]);
  useEffect(() => {
    if (copyFallback) copyFieldRef.current?.select();
  }, [copyFallback]);

  const report = (method: "web-share" | "download" | "copy-link" | "long-press") =>
    analytics.track(
      buildGrowthEvent("card_shared", {
        surface: "yourcat",
        format: method === "copy-link" ? "none" : format,
        method,
        withShelterCat: method === "copy-link" ? false : panelOn,
        avatarStatus,
        secondsToReveal: props.secondsToReveal,
      }),
    );

  // The card text names the cat exactly as the card it goes with; the link text uses the saved name.
  const shareText = (medium: "card" | "link") =>
    S3.shareText(
      medium === "card" && current ? displayName(current.name, !!current.name) : name,
      buildShareUrl(medium, medium === "card" ? format : "link"),
    );

  const onShare = () => {
    if (!current || nameSettling) return;
    // No await before this call: iOS keeps the tap's user activation for navigator.share.
    void shareCardFile(current.file, shareText("card")).then((outcome: ShareOutcome) => {
      if (outcome === "web-share" || outcome === "download") report(outcome);
      if (outcome === "download") props.toast(S3.saved);
    });
  };
  const onDownload = () => {
    if (!current || nameSettling) return;
    if (downloadFile(current.file)) {
      report("download");
      props.toast(S3.saved);
    }
  };
  const onCopy = async () => {
    const text = shareText("link");
    if ((await copyShareText(text)) === "copy-link") {
      setCopyFallback(null);
      report("copy-link");
      props.toast(S3.copied);
    } else {
      setCopyFallback(text);
    }
  };
  // In-app browsers get the large card at once; pressing and holding it is recorded once (a save itself
  // cannot be detected): `contextmenu` where the webview fires it, else a 500 ms touch hold.
  const longPressReported = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLongPress = () => {
    if (longPressReported.current) return;
    longPressReported.current = true;
    report("long-press");
  };
  const startHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(onLongPress, 500);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => endHold, []);

  // ---- delete --------------------------------------------------------------------------------
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deleteLinkRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const closeDialog = () => {
    setConfirming(false);
    setTimeout(() => deleteLinkRef.current?.focus(), 0);
  };
  const paintingPaid = record.portrait.status === "painting";

  // ---- pixel portrait status line --------------------------------------------------------------
  const portraitLine =
    avatarStatus === "pending" ? S3.drawing(name) : avatarStatus === "failed" ? S3.drawFailed(name) : "";

  const ready = !!current && !nameSettling;
  const showFileButtons = !inApp && !failed;

  return (
    <section ref={sectionRef} className="flex min-h-[100svh] w-full flex-col items-center gap-6" data-testid="yourcat-reveal">
      <ScreenHeading ref={ref}>{S3.title(name)}</ScreenHeading>

      <div className="flex w-full flex-col items-center gap-4 md:flex-row md:items-end md:justify-center">
        <RevealFrame
          photoUrl={photoUrl}
          avatarUrl={avatarUrl}
          spriteImg={record.cat.spriteImg}
          animate={fresh}
          reducedMotion={reducedMotion}
          label={`${sentenceName(name)}, ${family} pixel cat`}
        />
        <PlayableCat catImg={record.cat.catImg} spriteImg={record.cat.spriteImg} name={name} reducedMotion={reducedMotion} />
      </div>

      <p className={CAPTION} aria-live="polite" data-testid="yourcat-portrait-status">
        {portraitLine}
      </p>
      <p className={`${BODY} max-w-xl text-center`}>{S3.matched(name, family)}</p>

      <div className="flex w-full max-w-md flex-col gap-1">
        <label htmlFor="yourcat-card-name" className="text-p5 md:text-p4 text-tt-cream">
          {S3.nameLabel}
        </label>
        <input
          id="yourcat-card-name"
          className={INPUT}
          type="text"
          autoComplete="off"
          maxLength={NAME_MAX}
          value={draft}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "yourcat-name-error" : undefined}
          onChange={(event) => {
            touchedRef.current = true;
            setDraft(event.target.value.slice(0, NAME_MAX));
          }}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
        {nameError && (
          <p id="yourcat-name-error" className={ALERT} role="alert">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-xl flex-col items-center gap-4" data-testid="yourcat-share">
        <div role="radiogroup" aria-label={S3.formatLabel} className="flex gap-3">
          {(["story", "post"] as const).map((value) => (
            <label
              key={value}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-p5 text-tt-cream focus-within:outline focus-within:outline-2 focus-within:outline-tt-gold-400 ${
                format === value ? "border-tt-gold-400 bg-tt-night-600" : "border-tt-cream/30"
              }`}
            >
              <input type="radio" name="yourcat-format" value={value} checked={format === value} onChange={() => setFormat(value)} className="sr-only" />
              {value === "story" ? S3.story : S3.post}
            </label>
          ))}
        </div>
        {shelter && (
          <button
            type="button"
            role="switch"
            aria-checked={withShelter}
            className="inline-flex min-h-11 items-center gap-3 rounded-xl px-2 text-p5 md:text-p4 text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
            onClick={() => setWithShelter((value) => !value)}
          >
            <span
              aria-hidden="true"
              className={`relative inline-block h-6 w-11 rounded-full border-2 border-tt-gold-500 ${withShelter ? "bg-tt-gold-400" : "bg-tt-night-600"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-tt-night-900 ${withShelter ? "right-0.5" : "left-0.5"}`} />
            </span>
            {S3.shelterSwitch(shelter.name)}
          </button>
        )}

        <div
          className={`yc-fade flex w-full items-center justify-center ${inApp ? "max-w-xl" : "max-w-xs"}`}
          data-testid="yourcat-card-preview"
        >
          {preview ? (
            <img
              src={preview}
              alt={S3.cardAlt(name, family)}
              className="w-full rounded-lg border-2 border-tt-cream/40"
              onContextMenu={inApp ? onLongPress : undefined}
              onTouchStart={inApp ? startHold : undefined}
              onTouchEnd={inApp ? endHold : undefined}
              onTouchMove={inApp ? endHold : undefined}
              onTouchCancel={inApp ? endHold : undefined}
            />
          ) : (
            <div className={`${CAPTION} flex aspect-[4/5] w-full items-center justify-center rounded-lg border-2 border-dashed border-tt-cream/40`}>
              {failed ? S3.cardFailed : S3.preparing}
            </div>
          )}
        </div>
        {inApp && !failed && (
          <div className="flex flex-col items-center gap-1 text-center" data-testid="yourcat-long-press">
            <p className={BODY}>{S3.longPress}</p>
            <p className={CAPTION}>{S3.inAppHint}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {showFileButtons && canShare && (
            <button type="button" className={GOLD_BUTTON} disabled={!ready} onClick={onShare}>
              {ready ? S3.share : S3.preparing}
            </button>
          )}
          {showFileButtons && (
            <button type="button" className={canShare ? GHOST_BUTTON : GOLD_BUTTON} disabled={!ready} onClick={onDownload}>
              {ready ? S3.download : S3.preparing}
            </button>
          )}
          <button type="button" className={GHOST_BUTTON} onClick={() => void onCopy()}>
            {S3.copyLink}
          </button>
          <Link href="/game" className={GHOST_BUTTON}>
            {S3.play(name)}
          </Link>
        </div>
        {copyFallback && (
          <div className="flex w-full flex-col gap-1">
            <input ref={copyFieldRef} className={INPUT} readOnly value={copyFallback} aria-describedby="yourcat-copy-hint" />
            <p id="yourcat-copy-hint" className={CAPTION}>
              {S3.copyFallback}
            </p>
          </div>
        )}
      </div>

      {props.isGuest && (
        <p className={`${CAPTION} max-w-xl text-center`} data-testid="yourcat-guest-note">
          {S3.guestNote(name)}{" "}
          <button type="button" className={TEXT_LINK} onClick={props.onCreateAccount}>
            {S3.createAccount}
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4">
        {record.photo.stored || record.avatar.status !== "none" ? (
          <button ref={deleteLinkRef} type="button" className={`${TEXT_LINK} text-p6`} onClick={() => setConfirming(true)}>
            {S3.deleteLink}
          </button>
        ) : null}
        <button type="button" className={`${TEXT_LINK} text-p6`} onClick={onStartOver}>
          {STATUS_COPY.startOver}
        </button>
      </div>
      {deleteError && (
        <p className={ALERT} role="alert">
          {S3.nameSaveFailed}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          text={S3.deleteConfirm(name, family)}
          extra={paintingPaid ? S3.deletePaidPending : undefined}
          confirm={S3.deleteYes}
          cancel={S3.deleteNo}
          onClose={closeDialog}
          onConfirm={async () => {
            setConfirming(false);
            const ok = await onDelete();
            if (ok) {
              props.toast(S3.deleted);
              // The delete link is gone with the photo: focus goes to the screen heading (§1.6).
              setTimeout(() => sectionRef.current?.querySelector<HTMLElement>("h1")?.focus(), 0);
            } else {
              setDeleteError(true);
              setTimeout(() => deleteLinkRef.current?.focus(), 0);
            }
          }}
        />
      )}
    </section>
  );
});
