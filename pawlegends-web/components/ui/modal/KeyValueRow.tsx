import clsx from "clsx";
import type { ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

export interface KeyValueRowProps {
  label: ReactNode;
  /** The value; when empty, `emptyValue` shows in muted italics instead. */
  value?: ReactNode;
  emptyValue?: ReactNode;
  icon?: ModalIcon;
  /** A small action on the right (an Edit or Connect ModalButton, a toggle). */
  action?: ReactNode;
  /** Let a sentence-like value wrap instead of being cut with an ellipsis. */
  wrapValue?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** A label and value on one line with an optional action: linked accounts, settings, receipts. */
export const KeyValueRow = ({
  label,
  value,
  emptyValue = "Not set",
  icon,
  action,
  wrapValue,
  className,
  ...rest
}: KeyValueRowProps) => {
  const empty = value == null || value === "" || value === false;
  return (
    <div
      data-testid={rest["data-testid"]}
      className={clsx("flex min-h-[52px] items-center gap-3 py-1.5", className)}
    >
      {icon != null && (
        <span
          aria-hidden="true"
          className="flex h-[36px] w-[36px] shrink-0 items-center justify-center bg-tt-night-950/50 text-tt-gold-400"
        >
          <IconSlot icon={icon} size={20} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">
          {label}
        </span>
        <span
          className={clsx(
            "font-sans text-p5 font-bold",
            wrapValue ? "leading-snug" : "truncate",
            empty ? "italic text-tt-muted" : "text-tt-cream"
          )}
        >
          {empty ? emptyValue : value}
        </span>
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/** Rows separated by hairlines. */
export const KeyValueList = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <div className={clsx("flex flex-col divide-y-2 divide-tt-night-500/50", className)}>{children}</div>
);

export default KeyValueRow;
