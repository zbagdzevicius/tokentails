import clsx from "clsx";
import type { ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

export interface EmptyStateProps {
  /** A PixelIcon name, or art (a sprite) for a friendlier empty state. */
  icon?: ModalIcon;
  title: ReactNode;
  /** What to do next, in one or two plain sentences. */
  body?: ReactNode;
  /** Usually one ModalButton (primary for "go do it", secondary for "retry"). */
  action?: ReactNode;
  /** `error`: rust icon and role="alert" for a failed load. */
  tone?: "default" | "error";
  compact?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** Nothing here yet, or it failed to load: say so and offer the next step. */
export const EmptyState = ({
  icon = "sparkles",
  title,
  body,
  action,
  tone = "default",
  compact,
  className,
  ...rest
}: EmptyStateProps) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    data-testid={rest["data-testid"]}
    className={clsx(
      "flex flex-col items-center text-center",
      compact ? "gap-2 px-3 py-4" : "gap-3 px-4 py-8 short:py-4",
      className
    )}
  >
    <span
      aria-hidden="true"
      className={clsx(
        "flex items-center justify-center bg-tt-night-950/50",
        compact ? "h-[44px] w-[44px]" : "h-[64px] w-[64px]",
        tone === "error" ? "text-tt-rust" : "text-tt-gold-400",
        "[box-shadow:0_-2px_0_0_rgb(var(--tt-night-500)),0_2px_0_0_rgb(var(--tt-night-500)),-2px_0_0_0_rgb(var(--tt-night-500)),2px_0_0_0_rgb(var(--tt-night-500))]"
      )}
    >
      <IconSlot icon={icon} size={compact ? 22 : 32} />
    </span>
    <p className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-cream">{title}</p>
    {body != null && (
      <p className="max-w-[34ch] font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
        {body}
      </p>
    )}
    {action != null && <div className="mt-1">{action}</div>}
  </div>
);

/** Skeleton rows while data loads. Announced once as busy, with `label` for screen readers. */
export const LoadingState = ({
  rows = 3,
  label = "Loading",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) => (
  <div role="status" aria-busy="true" className={clsx("flex flex-col gap-2", className)}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => (
      <span
        key={i}
        aria-hidden="true"
        className="tt-skeleton block h-[16px]"
        style={{ width: `${92 - ((i * 17) % 40)}%` }}
      />
    ))}
  </div>
);

export default EmptyState;
