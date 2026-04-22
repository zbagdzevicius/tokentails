import React, { PropsWithChildren } from 'react';

interface IProps {
  isLoading?: boolean;
}

export const Loader = ({ isLoading, children }: PropsWithChildren<IProps>) => {
  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute top-0 left-0 w-full h-full bg-white animate-spin opacity-50 z-10 flex justify-center items-center">
          <img src="/heart.webp" className="w-16 h-16 animate-spin" />
        </div>
      )}
      {children}
    </div>
  );
};
