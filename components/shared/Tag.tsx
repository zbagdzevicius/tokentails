import React, { PropsWithChildren } from "react";

export const Tag = ({
  children,
  isSmall,
}: PropsWithChildren<{ isSmall?: boolean }>) => {
  return (
    <div
      className={`m-auto w-fit px-4 bg-gradient-to-r border-yellow-900 border-4 from-yellow-500 to-yellow-900 text-yellow-50 rounded-md font-primary font-normal whitespace-nowrap ${
        isSmall ? "text-p5" : "text-p3"
      }`}
    >
      {children}
    </div>
  );
};
