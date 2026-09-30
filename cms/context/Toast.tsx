import React from 'react';
import type { IToast } from './ToastContext';

export const Toast = ({ message, isError }: IToast) => {
  return (
    <div className="fixed z-30 left-1/2 -translate-x-1/2 font-primary uppercase top-16 bg-grey-500">
      <div
        className={`animate-bounce rem:w-[360px] px-6 py-2 w-fit rounded-lg
             flex items-center justify-center gap-4 text-white ${isError ? 'bg-red-600' : 'bg-green-600'}`}
      >
        <div>{message}</div>
      </div>
    </div>
  );
};
