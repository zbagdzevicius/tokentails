import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { ACTION_LABELS, displayName, NAME_MAX, S2, type ErrorAction, type ErrorCopy } from "./copy";
import { ALERT, CAPTION, GHOST_BUTTON, GOLD_BUTTON, INPUT, ScreenHeading, SUBTITLE } from "./ui";

export interface WorkingStepProps {
  photoUrl: string | null;
  /** Step 1 is done: the request body has left the browser. */
  sent: boolean;
  pendingName: string;
  onName: (name: string) => void;
  error: ErrorCopy | null;
  onAction: (action: ErrorAction) => void;
}

type StepState = "waiting" | "done" | "failed";

function StepDot({ state }: { state: StepState }) {
  const look =
    state === "done" ? "border-tt-gold-500 bg-tt-gold-400" : state === "failed" ? "border-tt-rust bg-tt-rust" : "border-tt-gold-500 bg-transparent";
  return <span aria-hidden="true" className={`yc-dot inline-block h-4 w-4 shrink-0 rounded-sm border-2 ${look}`} />;
}

/** One checklist line: its text changes with its state, and a hidden word says the state out loud. */
function Step({ state, text }: { state: StepState; text: string }) {
  return (
    <li className="flex items-center gap-3 text-p5 md:text-p4 text-tt-cream" data-state={state}>
      <StepDot state={state} />
      <span>{text}</span>
      {state !== "waiting" && <span className="sr-only">, {state === "done" ? S2.stepDone : S2.stepFailed}</span>}
    </li>
  );
}

/**
 * A "Try again" that waits `seconds` before it can be pressed (the plain 429). The countdown is shown
 * but not announced: it sits outside the button's name and outside any live region.
 */
function RetryButton({ seconds, onClick }: { seconds: number; onClick: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return (
    <button type="button" className={GOLD_BUTTON} disabled={left > 0} onClick={onClick}>
      {ACTION_LABELS.retry}
      {left > 0 && (
        <span aria-hidden="true" className="tabular-nums" data-testid="yourcat-retry-countdown">
          {S2.retryIn(left)}
        </span>
      )}
    </button>
  );
}

/**
 * S2 "Working": the visitor's own photo with a slow scan line, a two-step checklist in a polite live
 * region, and the name field (the visitor has nothing else to do while the photo is matched). On a
 * failure the heading and step 2 say so, the name field and the "come back" line go, and focus moves
 * to the heading (the alert below it says why).
 */
export const WorkingStep = forwardRef<HTMLHeadingElement, WorkingStepProps>(
  ({ photoUrl, sent, pendingName, onName, error, onAction }, ref) => {
    const name = displayName(pendingName, !!pendingName.trim());
    const headingRef = useRef<HTMLHeadingElement | null>(null);
    const setHeading = useCallback(
      (node: HTMLHeadingElement | null) => {
        headingRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    useEffect(() => {
      if (error) headingRef.current?.focus();
    }, [error]);
    const failed = !!error;
    return (
      <div className="flex w-full flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
        <div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-xl border-8 border-tt-gold-500 bg-tt-night-800">
          {photoUrl && <img src={photoUrl} alt={S2.photoAlt} className="h-full w-full object-cover" />}
          {!error && (
            // A full-height layer slides down with the 2 px line on its bottom edge (transform only).
            <span aria-hidden="true" className="yc-scan pointer-events-none absolute inset-0" data-testid="yourcat-scan">
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-tt-gold-400" />
            </span>
          )}
        </div>
        <div className="flex w-full max-w-md flex-col gap-4 text-left">
          <ScreenHeading ref={setHeading} className={SUBTITLE}>
            {failed ? S2.failedTitle : S2.title}
          </ScreenHeading>
          <ol className="flex flex-col gap-2" aria-live="polite" data-testid="yourcat-steps">
            {/* A failure before the body left the browser marks step 1 failed; otherwise step 2. */}
            <Step
              state={sent ? "done" : failed ? "failed" : "waiting"}
              text={sent ? S2.uploaded : failed ? S2.uploadFailed : S2.uploading}
            />
            {(sent || !failed) && <Step state={failed ? "failed" : "waiting"} text={failed ? S2.matchFailed(name) : S2.matching(name)} />}
          </ol>

          {error && (
            <div className="flex flex-col gap-3">
              <p className={ALERT} role="alert">
                {error.message}
              </p>
              {error.actions.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {error.actions.map((action, index) =>
                    action === "retry" && error.retryAfterSeconds ? (
                      <RetryButton key={action} seconds={error.retryAfterSeconds} onClick={() => onAction(action)} />
                    ) : (
                      <button
                        key={action}
                        type="button"
                        className={index === 0 ? GOLD_BUTTON : GHOST_BUTTON}
                        onClick={() => onAction(action)}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {!failed && (
            <>
              <label className="flex flex-col gap-1 text-p5 md:text-p4 text-tt-cream" htmlFor="yourcat-wait-name">
                {S2.nameLabel}
              </label>
              <input
                id="yourcat-wait-name"
                className={INPUT}
                type="text"
                autoComplete="off"
                maxLength={NAME_MAX}
                placeholder={S2.namePlaceholder}
                value={pendingName}
                onChange={(event) => onName(event.target.value.slice(0, NAME_MAX))}
              />
              <p className={CAPTION}>{S2.leave}</p>
            </>
          )}
        </div>
      </div>
    );
  },
);
