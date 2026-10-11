import { forwardRef, useEffect, useState } from "react";
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

function StepDot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`yc-dot inline-block h-4 w-4 shrink-0 rounded-sm border-2 border-tt-gold-500 ${done ? "bg-tt-gold-400" : "bg-transparent"}`}
    />
  );
}

/** A "Try again" that waits `seconds` before it can be pressed (the plain 429). */
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
    </button>
  );
}

/**
 * S2 "Working": the visitor's own photo with a slow scan line, a two-step checklist in a polite live
 * region, and the name field (the visitor has nothing else to do while the photo is matched).
 */
export const WorkingStep = forwardRef<HTMLHeadingElement, WorkingStepProps>(
  ({ photoUrl, sent, pendingName, onName, error, onAction }, ref) => {
    const name = displayName(pendingName, !!pendingName.trim());
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
          <ScreenHeading ref={ref} className={SUBTITLE}>
            {S2.title}
          </ScreenHeading>
          <ol className="flex flex-col gap-2" aria-live="polite" data-testid="yourcat-steps">
            <li className="flex items-center gap-3 text-p5 md:text-p4 text-tt-cream">
              <StepDot done={sent} />
              <span>{S2.uploading}</span>
            </li>
            <li className="flex items-center gap-3 text-p5 md:text-p4 text-tt-cream">
              <StepDot done={false} />
              <span>{S2.matching(name)}</span>
            </li>
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
        </div>
      </div>
    );
  },
);
