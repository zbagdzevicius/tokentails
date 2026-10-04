import clsx from "clsx";
import { useId, type ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

export type StatTone = "gold" | "mint" | "pink" | "sky" | "lilac";

const TONE_TEXT: Record<StatTone, string> = {
  gold: "text-tt-gold-400",
  mint: "text-tt-mint",
  pink: "text-tt-pink",
  sky: "text-tt-sky",
  lilac: "text-tt-lilac",
};
const TONE_FILL: Record<StatTone, string> = {
  gold: "bg-tt-gold-400",
  mint: "bg-tt-mint",
  pink: "bg-tt-pink",
  sky: "bg-tt-sky",
  lilac: "bg-tt-lilac",
};

export interface StatTileProps {
  /** Short name, 1–2 words ("Tails", "Day streak"). */
  label: ReactNode;
  value: ReactNode;
  icon?: ModalIcon;
  /** Small text after the value ("/ 2,578", "days"). */
  unit?: ReactNode;
  /** One plain line that explains the number ("Rescue points. Spend them on packs."). */
  helper?: ReactNode;
  /** Draws a bar under the value. */
  progress?: { value: number; max: number; label?: string };
  tone?: StatTone;
  /** A truth-layer chip (EvidenceChip) or similar, shown next to the label. */
  badge?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** One number with its icon, name and a short explanation. Group them in a StatGrid. */
export const StatTile = ({
  label,
  value,
  icon,
  unit,
  helper,
  progress,
  tone = "gold",
  badge,
  className,
  ...rest
}: StatTileProps) => {
  const id = useId();
  const pct =
    progress && progress.max > 0
      ? Math.max(0, Math.min(100, (progress.value / progress.max) * 100))
      : 0;
  return (
    <div
      data-testid={rest["data-testid"]}
      className={clsx("tt-card flex min-w-0 flex-col gap-1.5 p-3 short:p-2", className)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {icon != null && (
          // A fixed 16 px box: an image icon (an inline <img>) would otherwise add a baseline gap
          // and sit lower than a PixelIcon in the next tile.
          <span aria-hidden="true" className={clsx("flex h-4 w-4 shrink-0 items-center justify-center", TONE_TEXT[tone])}>
            <IconSlot icon={icon} size={16} />
          </span>
        )}
        <span
          id={`${id}-label`}
          className="truncate font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted"
        >
          {label}
        </span>
        {badge != null && <span className="ml-auto shrink-0">{badge}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-primary text-p3 leading-none text-tt-cream short:text-p4">{value}</span>
        {unit != null && (
          <span className="font-sans text-p6 font-bold text-tt-muted">{unit}</span>
        )}
      </div>
      {progress && (
        <div
          role="progressbar"
          aria-labelledby={progress.label ? undefined : `${id}-label`}
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={Math.min(progress.value, progress.max)}
          className="h-[8px] w-full bg-tt-night-950 [box-shadow:0_0_0_2px_rgb(var(--tt-night-500)/0.9)]"
        >
          <div
            className={clsx("h-full transition-[width] duration-500 motion-reduce:transition-none", TONE_FILL[tone])}
            // Any progress at all stays visible (4 px), so 30 of 2,578 does not read as none.
            style={{ width: `${pct}%`, minWidth: progress.value > 0 ? 4 : 0 }}
          />
        </div>
      )}
      {helper != null && (
        <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">{helper}</p>
      )}
    </div>
  );
};

/** A responsive grid of StatTiles: 2 columns on phones, `cols` from md up. */
export const StatGrid = ({
  cols = 4,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={clsx(
      "grid grid-cols-2 gap-3 short:gap-2",
      cols === 3 && "md:grid-cols-3 short:grid-cols-3",
      cols === 4 && "md:grid-cols-4 short:grid-cols-4",
      className
    )}
  >
    {children}
  </div>
);

export default StatTile;
