import { forwardRef, useEffect, useRef, useState } from "react";
import { BODY, CAPTION, Headline, NIGHT_PILL, PANEL, PrimaryAction } from "./brand";
import { ACTION_LABELS, NAME_MAX, S1, S2, type ErrorAction, type ErrorCopy } from "./copy";
import { PetCat } from "./PetCat";
import { HeadingBlock, InSlot } from "./studio";
import { ALERT, INPUT } from "./ui";
import { EXAMPLE_SPRITE } from "./UploadStep";
import { useCardPreload } from "./useShareCards";
import { usePortraitWait } from "./useYourcat";

export type SegmentState = "empty" | "active" | "done" | "failed";

/**
 * The honest three-segment meter (docs/plans/yourcat-polish.md §4.1): Photo, Coat, Portrait, each
 * filled only on a real event, then one line of live text. Three 24x8 px segments with a 4 px gap;
 * a filled segment pops once, the active one pulses, a failed one turns rust and shakes once. Under
 * reduced motion the pop and the shake are gone and the pulse is opacity only.
 */
export function Meter({ segments, text }: { segments: [SegmentState, SegmentState, SegmentState]; text: string }) {
  const names = [S2.meter.photo, S2.meter.coat, S2.meter.portrait];
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="yourcat-meter">
      <span className="flex shrink-0 gap-1" aria-hidden="true">
        {segments.map((state, index) => (
          <span
            key={names[index]}
            title={names[index]}
            data-state={state}
            data-testid={`yourcat-meter-${index + 1}`}
            className={`relative block h-2 w-6 border border-tt-gold-500 ${state === "failed" ? "yc-shake border-tt-rust" : ""} ${
              state === "active" ? "yc-wait" : ""
            }`}
          >
            {(state === "done" || state === "failed") && (
              <span className={`yc-seg-pop absolute inset-0 block ${state === "failed" ? "bg-tt-rust" : "bg-tt-gold-400"}`}>
                {state === "done" && (
                  // A 3x3 pixel check in the filled segment.
                  <svg viewBox="0 0 3 3" className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2" shapeRendering="crispEdges">
                    <g className="fill-tt-night-900">
                      <rect x="0" y="1" width="1" height="1" />
                      <rect x="1" y="2" width="1" height="1" />
                      <rect x="2" y="0" width="1" height="2" />
                    </g>
                  </svg>
                )}
              </span>
            )}
          </span>
        ))}
      </span>
      <span className="truncate text-p6 md:text-p5 text-tt-cream" aria-live="polite" data-testid="yourcat-meter-text">
        {text}
      </span>
    </div>
  );
}

/**
 * A "Try again" that waits `seconds` before it can be pressed (the plain 429). The countdown is shown
 * but not announced: it sits outside the button's name and outside any live region.
 */
function RetryButton({ seconds, primary, onClick }: { seconds: number; primary: boolean; onClick: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  const countdown =
    left > 0 ? (
      <span aria-hidden="true" className="tabular-nums" data-testid="yourcat-retry-countdown">
        {S2.retryIn(left)}
      </span>
    ) : null;
  if (primary) {
    return (
      <div className="flex flex-col items-center gap-1">
        <PrimaryAction text={ACTION_LABELS.retry} disabled={left > 0} onClick={onClick} />
        {countdown && <span className="text-p6 text-tt-lilac">{countdown}</span>}
      </div>
    );
  }
  return (
    <button type="button" className={NIGHT_PILL} disabled={left > 0} onClick={onClick}>
      {ACTION_LABELS.retry}
      {countdown}
    </button>
  );
}

export interface WorkingStepProps {
  /** Step 1 is done: the request body has left the browser. */
  sent: boolean;
  pendingName: string;
  onName: (name: string) => void;
  error: ErrorCopy | null;
  onAction: (action: ErrorAction) => void;
  reducedMotion?: boolean;
}

/**
 * S2 "the paint is drying" (§4 S2): the photo hangs in the same frame (the page's `TransformFrame`
 * runs the scan, the motes, the push-in and the quantise overlay), the honest meter in the kicker
 * slot, and the only name field of the flow. Once POST /yourcat answers with the pixel portrait still
 * drawing, S2 holds for it (R2-01): "Almost there", the Coat segment filled, the Portrait one active.
 * On a failure the heading, the meter ("Stopped", a rust segment) and one alert with the actions say
 * so, inside the first phone viewport, and focus moves to the heading. The visitor's own daily cap has
 * its own heading and leaves the Photo segment unfilled (R2-09).
 */
export const WorkingStep = forwardRef<HTMLHeadingElement, WorkingStepProps>(({ sent, pendingName, onName, error, onAction, reducedMotion = false }, ref) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const setHeading = (node: HTMLHeadingElement | null) => {
    headingRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  useEffect(() => {
    if (error) headingRef.current?.focus();
  }, [error]);
  // The card art loads once the photo has left, so the first card is quick after the reveal (§9.3).
  useCardPreload(sent);

  // POST answered with the pixel portrait still drawing: S2 holds for it ("Almost there", R2-01).
  const portraitWait = usePortraitWait();
  const failed = !!error;
  // A failure before the body left marks segment 1; otherwise segment 2 (the match) failed. The
  // visitor's own daily cap (R2-09) made nothing from the photo: segment 1 stays unfilled, 2 is rust.
  const segments: [SegmentState, SegmentState, SegmentState] = failed
    ? error.ownCap
      ? ["empty", "failed", "empty"]
      : sent
        ? ["done", "failed", "empty"]
        : ["failed", "empty", "empty"]
    : portraitWait
      ? ["done", "done", "active"]
      : sent
        ? ["done", "active", "empty"]
        : ["active", "empty", "empty"];
  const meterText = failed
    ? S2.meter.stopped
    : portraitWait
      ? S2.meter.painting
      : sent
        ? S2.meter.received
        : S2.meter.sending;
  const title = failed ? (error.title ?? S2.failedTitle) : portraitWait ? S2.almostTitle : S2.title;

  return (
    <>
      <HeadingBlock kicker={<Meter segments={segments} text={meterText} />}>
        <Headline ref={setHeading} parts={title} />
      </HeadingBlock>
      {/* The example cat stays on the altar; once the photo has left it sits and faces the frame (beat B). */}
      <InSlot slot="cat">
        <PetCat
          spriteImg={EXAMPLE_SPRITE}
          name={S1.example}
          labels={{ pet: S1.exampleAlt, tap: S1.example, purrs: S1.example }}
          mode={sent && !failed ? "sit" : "idle"}
          facing={sent && !failed ? "left" : "right"}
          interactive={false}
          sound={false}
          reducedMotion={reducedMotion}
        />
      </InSlot>
      <InSlot slot="panel">
        {error ? (
          <div className={`${PANEL} yc-rise-sm flex flex-col gap-3`} data-testid="yourcat-failure">
            <p className={ALERT} role="alert">
              {error.message}
            </p>
            {error.actions.length > 0 && (
              // A long label at the landing's 1.25x phone scale would overflow the panel: unscaled on phones.
              <div className="flex flex-wrap items-center justify-center gap-3 xl:justify-start max-sm:[&_.glow-box:hover]:!scale-105 max-sm:[&_.glow-box]:!scale-100">
                {error.actions.map((action, index) =>
                  action === "retry" && error.retryAfterSeconds ? (
                    <RetryButton key={action} seconds={error.retryAfterSeconds} primary={index === 0} onClick={() => onAction(action)} />
                  ) : index === 0 ? (
                    <PrimaryAction key={action} text={ACTION_LABELS[action]} onClick={() => onAction(action)} />
                  ) : (
                    <button key={action} type="button" className={NIGHT_PILL} onClick={() => onAction(action)}>
                      {ACTION_LABELS[action]}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={`${PANEL} flex flex-col gap-2`} data-testid="yourcat-wait">
            <label className={BODY} htmlFor="yourcat-wait-name">
              {S2.nameLabel}
            </label>
            <input
              id="yourcat-wait-name"
              className={INPUT}
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={NAME_MAX}
              placeholder={S2.namePlaceholder}
              value={pendingName}
              onChange={(event) => onName(event.target.value.slice(0, NAME_MAX))}
            />
            <p className={CAPTION}>{S2.leave}</p>
          </div>
        )}
      </InSlot>
    </>
  );
});
