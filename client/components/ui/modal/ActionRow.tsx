import clsx from "clsx";
import type { ReactNode } from "react";

export interface ActionRowProps {
  /**
   * Put the one primary action first. Phones stack the actions full width, primary on top; from
   * md up they sit in a row.
   */
  children?: ReactNode;
  align?: "start" | "center" | "end" | "between";
  /** Keep the row on phones too (two small actions that fit side by side). */
  inline?: boolean;
  className?: string;
}

const ALIGN: Record<NonNullable<ActionRowProps["align"]>, string> = {
  start: "md:justify-start",
  center: "md:justify-center",
  end: "md:justify-end",
  between: "md:justify-between",
};

/** One primary plus secondary or ghost actions, spaced the same way in every modal. */
export const ActionRow = ({ children, align = "start", inline, className }: ActionRowProps) => (
  <div
    className={clsx(
      "flex gap-3",
      inline
        ? "flex-row flex-wrap items-center"
        : "flex-col items-stretch md:flex-row md:flex-wrap md:items-center short:flex-row short:flex-wrap short:items-center",
      ALIGN[align],
      inline && align === "center" && "justify-center",
      inline && align === "end" && "justify-end",
      inline && align === "between" && "justify-between",
      className
    )}
  >
    {children}
  </div>
);

export default ActionRow;
