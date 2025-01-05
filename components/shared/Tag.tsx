import React, { PropsWithChildren } from "react";

export const Tag = ({ children, isSmall }: PropsWithChildren<{ isSmall?: boolean }>) => {
  return (
    <div className={`m-auto w-fit px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary ${isSmall ? 'text-p5' : 'text-p3'
      }`}>
      {children}
    </div>
  );
};
