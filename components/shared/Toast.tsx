import { cdnFile } from "@/constants/utils";
import { ICollectibleProperty, IToast } from "@/context/ToastContext";
import React from "react";

const symbolImage: Record<ICollectibleProperty, string> = {
  tails: cdnFile("logo/logo.webp"),
};

export const Toast = ({ message, icon, isError, symbol, img }: IToast) => {
  const symbolImg = symbol ? symbolImage[symbol] : null;
  return (
    <div
      className="fixed z-[110] top-32 left-1/2 "
      style={{ transform: "translateX(-50%)" }}
    >
      <div
        key={message}
        className={`animate-bounceWithFade rem:w-[360px] min-h-10 px-2 rounded-lg shadow border-2 text-p3 ${
          isError ? "border-red-500" : "border-main-black"
        } bg-gradient-to-bl from-rose-400 to-orange-300 flex flex-col items-center justify-center text-main-black font-primary uppercase font-bold`}
      >
        {img && <img src={img} className="w-12 mt-1 mb-1" />}
        <div className="flex items-center gap-2 text-center">
          <div>{message}</div>
          {symbolImg && <img src={symbolImg} className="w-6" />}
        </div>
      </div>
    </div>
  );
};
