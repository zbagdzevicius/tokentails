import { primeHomeSounds } from "@/components/home/homeSfx";
import type { YourcatStatusView } from "@/models/yourcat";
import { forwardRef, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { BODY, CAPTION, ChipCheck, Headline, NIGHT_PILL, PrimaryAction } from "./brand";
import { FRIEND, S1, s1Body, STATUS_COPY } from "./copy";
import { Frame, FrameSilhouette } from "./Frame";
import { flyTo } from "./motion";
import { PetCat } from "./PetCat";
import { ACCEPT_ATTRIBUTE } from "./prepareUpload";
import { PrivacyPanel } from "./PrivacyPanel";
import { HeadingBlock, InSlot, useStageConfig, useStudio } from "./studio";
import { ALERT, INLINE_LINK } from "./ui";
import { useOwnCapped } from "./useYourcat";

/** The stock pixel cat beside the empty frame (S1): frame 0 of the Ginger starter, labelled "Example". */
export const EXAMPLE_SPRITE = "/cats/yellow/sprites/original.png";

/** The S1 entrance rhythm (§4 S1): kicker 0, H1 70, frame 140 (the page), CTA 240, captions 320, cat 500 ms. */
export const S1_RHYTHM = Object.freeze({ kicker: 0, title: 70, cta: 240, captions: 320, cat: 500 });

/** The friend view's small empty frame (R1-11): 72 px inner on phones, 128 on md+; it appears and its glass sheens once at 300 ms. */
export const FRIEND_EMPTY_INNER = Object.freeze({ w: 72, h: 72, mdW: 128, mdH: 128 });
export const FRIEND_EMPTY_MS = 300;

const delay = (ms: number) => ({ "--yc-delay": `${ms}ms` }) as CSSProperties;

/** A shared cat's public view, as the friend view needs it. */
export interface FriendCatView {
  name: string | null;
  familyLabel: string;
  spriteImg: string;
}

export interface UploadStepProps {
  status: YourcatStatusView | null;
  statusFailed: boolean;
  /** The identity or the visitor's record is still loading. */
  getting: boolean;
  fileError: string | null;
  onFile: (file: File, source: "picker" | "drop") => void;
  onManual: () => void;
  reducedMotion: boolean;
  /** The friend view (S0, `?cat=`): the shared cat stands on the altar, an empty frame waits beside it. */
  friend?: FriendCatView | null;
  /** The visitor already has a cat: the friend view offers "See your cat". */
  onSeeOwn?: () => void;
}

/**
 * S1 "the empty frame" and S0 "a friend's cat" (docs/plans/yourcat-polish.md §4): the chip, the
 * headline, one primary action ("Choose a photo"), one line of body and the two captions. The page's
 * frame stands empty with the dashed silhouette (S1) or holds the friend's pixel portrait (S0); an
 * example cat (S1) or the friend's pettable cat (S0) stands beside it. The whole stage is a drop zone.
 * On select the button presses, the photo flies into the frame (`flyTo`), and the meow and purr are
 * unlocked for the reveal (iOS needs a gesture). Paused and spent keep one way on and no upload
 * promise (§1.0). Spent covers the visitor's own daily cap too, once this tab has met it (R2-09).
 */
export const UploadStep = forwardRef<HTMLHeadingElement, UploadStepProps>(
  ({ status, statusFailed, getting, fileError, onFile, onManual, reducedMotion, friend = null, onSeeOwn }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const ctaRef = useRef<HTMLDivElement | null>(null);
    const studio = useStudio();
    const [dragging, setDragging] = useState(false);
    const [pressed, setPressed] = useState(0);
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const [catTimerDone, setCatTimerDone] = useState(false);

    const loading = getting || (!status && !statusFailed);
    const paused = !!status && !status.enabled;
    const spent = !!status && status.enabled && !status.uploadsOpen;
    const open = !paused && !spent;
    // The visitor's own daily cap, remembered for this tab (R2-09): the spent state says it is theirs.
    const ownCapped = useOwnCapped();

    // The example cat peeks out from behind the frame's right leg at 500 ms (with everything under reduced motion).
    useEffect(() => {
      if (reducedMotion) return;
      const timer = setTimeout(() => setCatTimerDone(true), friend ? 0 : S1_RHYTHM.cat);
      return () => clearTimeout(timer);
    }, [reducedMotion, friend]);
    const catIn = reducedMotion || catTimerDone;

    /** The flight from the button into the frame, then the upload. */
    const take = (file: File, source: "picker" | "drop") => {
      const inner = studio.frame.current?.inner;
      const from = ctaRef.current?.getBoundingClientRect();
      if (inner && from && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try {
          const url = URL.createObjectURL(file);
          void flyTo(url, from, inner, 420, reducedMotion).then(() => URL.revokeObjectURL(url));
        } catch {
          // No flight: the photo still appears in the frame.
        }
      }
      onFile(file, source);
    };

    const onStageDrop = (file: File) => {
      if (!loading && open) take(file, "drop");
    };
    useStageConfig({
      sheen: !friend && open,
      dragOver: dragging,
      onDrop: open ? onStageDrop : undefined,
      onDragState: open ? setDragging : undefined,
    });

    const choose = () => {
      // The tap is the only gesture before the reveal: unlock its sounds now (§4 S1 "Sound").
      primeHomeSounds(["meow", "purr"]);
      setPressed((value) => value + 1);
      inputRef.current?.click();
    };

    const onCtaDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file && !loading && open) take(file, "drop");
    };

    const title = friend ? FRIEND.title(friend.name) : S1.title;
    const body = paused
      ? STATUS_COPY.disabled
      : spent
        ? ownCapped
          ? STATUS_COPY.ownCapSpent
          : STATUS_COPY.budgetSpent
        : friend
          ? FRIEND.body
          : s1Body();

    let primary: React.ReactNode;
    if (paused) primary = <PrimaryAction text={STATUS_COPY.playGame} href="/game" />;
    else if (spent) primary = <PrimaryAction text={STATUS_COPY.pickYourself} onClick={onManual} />;
    else
      primary = (
        <PrimaryAction
          text={loading ? STATUS_COPY.loading : S1.choose}
          disabled={loading}
          onClick={choose}
          describedBy="yourcat-confirm"
        />
      );

    return (
      <>
        <HeadingBlock
          kicker={
            open ? (
              <span className="yc-fade-in" style={delay(S1_RHYTHM.kicker)}>
                <ChipCheck>{S1.chip}</ChipCheck>
              </span>
            ) : null
          }
        >
          <span className="yc-rise block" style={delay(S1_RHYTHM.title)}>
            <Headline ref={ref} parts={title} />
          </span>
        </HeadingBlock>

        {/* The altar: the example cat (S1) or the friend's cat (S0) on the right, the small empty frame (S0) on the left. */}
        {friend ? (
          <>
            <InSlot slot="companion">
              {/* Its own room left of the frame (the stage moves the frame group right for it, R1-11). */}
              <div className="yc-fade-in flex flex-col items-center" style={delay(FRIEND_EMPTY_MS)} data-testid="yourcat-friend-empty" data-yc-room="true">
                <Frame inner={FRIEND_EMPTY_INNER} legs sheen="once" sheenDelayMs={FRIEND_EMPTY_MS} reducedMotion={reducedMotion}>
                  <FrameSilhouette label={FRIEND.frameLabel} compact />
                </Frame>
              </div>
            </InSlot>
            <InSlot slot="cat">
              <PetCat
                spriteImg={friend.spriteImg}
                name={friend.name ?? "your cat"}
                labels={{ pet: FRIEND.pet.pet(friend.name), tap: FRIEND.pet.tap(friend.name), purrs: FRIEND.pet.purrs(friend.name) }}
                entrance={reducedMotion ? "none" : "walkIn"}
                reducedMotion={reducedMotion}
              />
            </InSlot>
          </>
        ) : (
          <InSlot slot="cat">
            <div className="flex flex-col items-center" data-testid="yourcat-example">
              {catIn ? (
                // Not pettable: it is a stock cat. Its caption under the paws says "Example".
                <PetCat
                  spriteImg={EXAMPLE_SPRITE}
                  name={S1.example}
                  labels={{ pet: S1.exampleAlt, tap: S1.example, purrs: S1.example }}
                  entrance={reducedMotion ? "none" : "peek"}
                  facing={dragging ? "left" : "right"}
                  interactive={false}
                  sound={false}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <span className="block h-[111px] w-[144px] md:h-[148px] md:w-[192px]" aria-hidden="true" />
              )}
            </div>
          </InSlot>
        )}

        <InSlot slot="panel">
          <div className="flex w-full flex-col items-center gap-3 text-center xl:items-start xl:text-left" data-testid="yourcat-upload">
            <p
              className={`${BODY} order-2 max-w-xl xl:order-1 yc-fade-in`}
              style={delay(S1_RHYTHM.title)}
              role={paused || spent ? "status" : undefined}
            >
              {body}
            </p>
            <div
              ref={ctaRef}
              className={`order-1 flex w-full flex-col items-center gap-1 xl:order-2 xl:items-start ${
                dragging ? "outline-dashed outline-2 outline-offset-4 outline-tt-cream" : ""
              }`}
              onDragOver={
                open
                  ? (event) => {
                      event.preventDefault();
                      if (!loading) setDragging(true);
                    }
                  : undefined
              }
              onDragLeave={open ? () => setDragging(false) : undefined}
              onDrop={open ? onCtaDrop : undefined}
            >
              <div
                key={pressed}
                className={`yc-pop-in ${pressed ? "yc-press" : ""} ${open ? "" : "max-sm:[&_.glow-box:hover]:!scale-105 max-sm:[&_.glow-box]:!scale-100"}`}
                style={delay(S1_RHYTHM.cta)}
              >
                {primary}
              </div>
              {open && !loading && <span className="hidden text-p6 text-tt-lilac md:block">{S1.dropHint}</span>}
              {friend && onSeeOwn && (
                <button type="button" className={`${NIGHT_PILL} mt-2`} onClick={onSeeOwn}>
                  {FRIEND.seeYours}
                </button>
              )}
            </div>
            {open && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="yourcat-file-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) take(file, "picker");
                  }}
                />
                {fileError && (
                  <p className={`${ALERT} order-3`} role="alert">
                    {fileError}
                  </p>
                )}
                <div className="order-4 flex flex-col gap-2 yc-fade-in" style={delay(S1_RHYTHM.captions)}>
                  <p id="yourcat-confirm" className={CAPTION}>
                    {S1.confirm}
                  </p>
                  <p className={CAPTION}>
                    {S1.privacy}{" "}
                    <button
                      type="button"
                      className={INLINE_LINK}
                      aria-expanded={privacyOpen}
                      aria-controls="yourcat-privacy"
                      onClick={() => setPrivacyOpen((value) => !value)}
                    >
                      {S1.privacyLink}
                    </button>
                  </p>
                </div>
                <div className="order-5 w-full">
                  <PrivacyPanel open={privacyOpen} id="yourcat-privacy" />
                </div>
              </>
            )}
          </div>
        </InSlot>
      </>
    );
  },
);
