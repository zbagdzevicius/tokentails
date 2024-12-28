import React, { PropsWithChildren } from "react";

export const Tag = ({ children }: PropsWithChildren<{}>) => {
  return (
    <div className="m-auto w-fit px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary text-p3">
      {children}
    </div>
  );
};
