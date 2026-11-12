import clsx from "clsx";
import type { ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

export type StatusTone = "neutral" | "gold" | "mint" | "pink" | "rust" | "sky";

const TONES: Record<StatusTone, string> = {
  neutral: "border-tt-night-500 bg-tt-night-950/50 text-tt-muted",
  gold: "border-tt-gold-500/70 bg-tt-gold-400/10 text-tt-gold-400",
  mint: "border-tt-mint/60 bg-tt-mint/10 text-tt-mint",
  pink: "border-tt-pink/60 bg-tt-pink/10 text-tt-pink",
  rust: "border-tt-rust/60 bg-tt-rust/10 text-tt-rust",
  sky: "border-tt-sky/60 bg-tt-sky/10 text-tt-sky",
};

/**
 * A small state label ("Connected", "Locked", "Ready to claim"). Not a button and not a section
 * heading: use ModalSection for headings and ModalButton for actions.
 */
export const StatusPill = ({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: StatusTone;
  icon?: ModalIcon;
  className?: string;
  children?: ReactNode;
}) => (
  <span
    className={clsx(
      "inline-flex w-fit items-center gap-1 whitespace-nowrap border-2 px-2 py-0.5 font-sans text-p6 font-extrabold uppercase tracking-wider",
      TONES[tone],
      className
    )}
  >
    {icon != null && <IconSlot icon={icon} size={12} />}
    {children}
  </span>
);

export default StatusPill;
