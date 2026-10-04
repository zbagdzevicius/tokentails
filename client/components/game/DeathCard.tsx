import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { ASSIST_COPY, deathTip, type DeathCause } from "@/components/Phaser/onboarding/hints";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ModalButton, StatGrid, StatTile, StatusPill } from "@/components/ui/modal";
import { PixelFrame } from "@/components/ui/PixelFrame";
import clsx from "clsx";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { PawGuardIcon, useInputKind } from "./RunGate";

/**
 * The card after a hard death (plan G10): no Paw Guard left, the clock ran out, or the endless run
 * ended. RETRY is focused and restarts the same level at once (GAME_RESTART, no reload, the
 * target is under 300 ms to the next gate); a contextual tip says what to try. After three hard
 * deaths on a level it suggests the "Extra guards" assist.
 *
 * It is not a GameModal on purpose: the run is over, so there is nothing to suspend, and opening
 * and closing a Radix dialog would cost the instant retry. It is still an `alertdialog` with its
 * own focus loop; Esc goes to the level map.
 */
const focusRetryIn = (container: HTMLElement | null) => {
  const retry = container?.querySelector<HTMLButtonElement>("button");
  // No scroll jump on the first paint; then make sure a keyboard or pad player can see RETRY when
  // the card scrolls (the assist card on a short landscape phone).
  retry?.focus({ preventScroll: true });
  retry?.scrollIntoView?.({ block: "nearest" });
};

export type DeathSaveState = "saving" | "saved" | "failed";

/** The line under the points for a new best: "saved" only after the save answered. */
export function newBestLine(saveState: DeathSaveState | undefined): string {
  if (saveState === "saved") return "New best, saved";
  if (saveState === "failed") return "New best, not saved";
  return "New best";
}

export interface DeathCardProps {
  mode: string;
  level: string | null;
  /** "Level 1-1", "Day 3" (the RunGate's name, `levelNameParts().title`); "" for none. */
  levelName: string;
  /** The level's own name ("Kitten Starter 1"), when it has one. */
  levelDetail?: string;
  /** The game ("Paw Match"), under the title. */
  modeName?: string;
  /** The player's cat sprite, drawn small above the title (decorative). */
  catImg?: string;
  outcome: "died" | "timeout";
  /** Points of this run (catnip or hearts), already clamped to the cap. */
  points: number;
  /** Best saved points on this level before the run. */
  best?: number;
  /** What ended the run, for the tip. */
  cause?: DeathCause;
  /** Label of the points ("catnip", "hearts"). */
  unit?: "catnip" | "hearts";
  onRetry: () => void;
  onLevels: () => void;
  /** Offer an assist (Purrsuit: after three hard deaths). */
  assist?: { name: keyof typeof ASSIST_COPY; on: boolean; onEnable: () => void } | null;
  /** This run beat the best (it is being saved). */
  newBest?: boolean;
  /** Where the new best's save is: "saved" only once `/live` answered (5a review #9). */
  saveState?: DeathSaveState;
  /** The endless run: its end is the normal finish, not a failure. */
  endless?: boolean;
}

export const DeathCard = ({
  mode,
  levelName,
  levelDetail,
  modeName,
  catImg,
  outcome,
  points,
  best,
  cause,
  unit = "catnip",
  onRetry,
  onLevels,
  assist,
  newBest,
  saveState,
  endless,
}: DeathCardProps) => {
  const input = useInputKind();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // RETRY takes focus so Enter or Space retries straight away.
    focusRetryIn(retryRef.current);
  }, []);
  const focusRetry = () => focusRetryIn(retryRef.current);
  // "Turn it on" goes away once clicked; focus moves to RETRY instead of dropping to the body.
  const enableAssist = () => {
    assist?.onEnable();
    focusRetry();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onLevels();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
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

  const title = outcome === "timeout" ? "Time's up" : endless ? "Run over" : "Ouch!";
  const tip = deathTip(mode, outcome === "timeout" ? "timeout" : cause, input);
  const assistCopy = assist ? ASSIST_COPY[assist.name] : null;

  const bestShown = typeof best === "number" && Math.max(best, points) > 0 ? Math.max(best, points) : null;
  const unitIcon =
    unit === "catnip" ? (
      <CatnipIcon size={16} alt="" />
    ) : (
      <span aria-hidden="true" className="text-tt-pink">
        <PixelIcon name="heart" size={16} />
      </span>
    );

  const subline = [levelDetail, modeName].filter(Boolean).join(" · ");
  const pointsTile = (
    <StatTile
      label="This run"
      value={points}
      unit={unit}
      icon={unitIcon}
      tone={newBest ? "mint" : "gold"}
      className={clsx((bestShown === null || newBest) && "col-span-2")}
      data-testid="death-points"
      badge={
        newBest ? (
          // The save state rides on the tile it is about; "saved" only once `/live` answered.
          <span data-testid="death-new-best" aria-live="polite" className="flex">
            <StatusPill
              tone={saveState === "failed" ? "neutral" : "mint"}
              icon={saveState === "saved" ? "check" : saveState === "failed" ? undefined : "trophy"}
            >
              {newBestLine(saveState)}
            </StatusPill>
          </span>
        ) : undefined
      }
    />
  );

  return (
    <div
      className="fixed inset-0 z-gate flex items-center justify-center bg-tt-night-950/75 px-4 backdrop-blur-[2px] lowfx:bg-tt-night-950/85 lowfx:backdrop-filter-none reduced-transparency:backdrop-filter-none"
      data-testid="death-card"
      data-run-ignore=""
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain py-3 md:max-w-[28rem] short:!max-w-[min(30rem,calc(100vw-2rem))]"
      >
        <PixelFrame
          ambient
          className="w-full motion-safe:animate-[opacity_150ms_ease-out]"
          shadowClassName="drop-shadow-[0_10px_0_rgba(7,5,26,0.55)] lowfx:[filter:none]"
        >
          {/* PixelFrame pads its content box inline (2 units, the rim); the card's own padding sits
              inside it so nothing touches the gold rim. */}
          <div className="flex flex-col items-stretch gap-3 px-4 pb-4 pt-4 text-center short:!gap-2 short:!px-3 short:!pb-2.5 short:!pt-2.5">
            <div className="flex flex-col items-center gap-1.5 short:!gap-1">
              {catImg && (
                <img
                  src={catImg}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  data-testid="death-cat"
                  className="pointer-events-none h-14 w-auto max-w-[45%] select-none object-contain opacity-90 pixelated [filter:grayscale(0.35)_drop-shadow(0_3px_0_rgb(var(--tt-night-950)))] short:hidden"
                />
              )}
              {levelName && (
                <p className="inline-flex items-center gap-1.5 border-2 border-tt-lilac/50 bg-tt-night-950/50 px-2 py-0.5 font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-lilac">
                  <PixelIcon name="gamepad" size={14} />
                  {levelName}
                </p>
              )}
              <h2
                id={titleId}
                className="font-primary text-h6 leading-none text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))] short:!text-p2"
              >
                {title}
              </h2>
              {subline && (
                <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5 short:!text-p6">{subline}</p>
              )}
            </div>
            <StatGrid cols={2} className="text-left">
              {pointsTile}
              {bestShown !== null && !newBest && (
                <StatTile
                  label="Best"
                  value={bestShown}
                  unit={unit}
                  icon="trophy"
                  tone="gold"
                  data-testid="death-best"
                />
              )}
            </StatGrid>
            <div className="tt-card flex items-start gap-2 p-3 text-left short:!p-2">
              <span aria-hidden="true" className="mt-[2px] text-tt-sky">
                <PixelIcon name="info-box" size={18} />
              </span>
              <p className="font-sans text-p5 font-bold leading-snug text-tt-cream short:!text-p6" data-testid="death-tip">
                {tip}
              </p>
            </div>
            {assist && assistCopy && (
              <div
                className="tt-card flex w-full flex-col items-center gap-1 p-3 short:!flex-row short:!flex-wrap short:!justify-between short:!gap-x-3 short:!p-2 short:!text-left"
                data-tone={assist.on ? "success" : "highlight"}
                data-testid="death-assist"
              >
                <div className="flex flex-col items-center gap-1 short:!items-start">
                  <p className="flex items-center gap-2 font-primary text-p4 uppercase tracking-wide text-tt-gold-400 short:!text-p5">
                    <PawGuardIcon size={16} /> {assistCopy.name}
                  </p>
                  <p className="font-sans text-p6 font-bold text-tt-cream">{assistCopy.line}</p>
                </div>
                {assist.on ? (
                  <p className="flex min-h-[44px] items-center font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-mint">
                    On for your next try
                  </p>
                ) : (
                  <ModalButton variant="secondary" size="sm" onClick={enableAssist}>
                    Turn it on
                  </ModalButton>
                )}
              </div>
            )}
            {/* Pinned to the bottom of the scroller, so RETRY is always on screen. */}
            <div
              ref={retryRef}
              className="sticky bottom-0 z-10 -mx-1 mt-1 flex w-auto flex-row gap-3 bg-gradient-to-t from-tt-night-800 via-tt-night-800/95 to-transparent px-1 pb-1 pt-2"
            >
              <ModalButton id="death-card-retry" variant="primary" icon="reload" className="flex-1" onClick={onRetry}>
                RETRY
              </ModalButton>
              <ModalButton variant="secondary" icon="map" onClick={onLevels}>
                LEVEL MAP
              </ModalButton>
            </div>
          </div>
        </PixelFrame>
      </div>
    </div>
  );
};
