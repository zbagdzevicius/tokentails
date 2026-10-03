import clsx from "clsx";
import React, { PropsWithChildren } from "react";

export const Tag = ({
  children,
  size = "md",
}: PropsWithChildren<{ size?: "sm" | "md" }>) => {
  return (
    <div
      className={clsx(
        "m-auto w-fit px-4 bg-gradient-to-r border-yellow-900 border-4 from-pink-500 to-yellow-900 text-pink-100 rounded-md font-primary font-normal whitespace-nowrap",
        size === "sm" ? "text-p6" : "text-p3"
      )}
    >
      {children}
    </div>
  );
};
