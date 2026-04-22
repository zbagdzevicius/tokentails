import React from "react";
import { IToast } from "@/context/ToastContext";
import { cdnFile } from "@/constants/utils";

export const Notification = ({
  notifications,
}: {
  notifications: IToast[];
}) => {
  if (notifications.length === 0) return null;

  const { message, icon, isError } = notifications[0];

  return (
    <div
      className="fixed z-[110] top-2 md:top-4 xl:top-12 left-1/2"
      style={{ transform: "translateX(-50%)" }}
    >
      <div
        className={`animate-bounceWithFade rem:w-[240px] md:w-[300px] lg:w-[360px] min-h-10 px-2 text-yellow-900 font-secondary`}
      >
        <div className="flex flex-col text-center items-center justify-center">
          <div className="relative">
            <img
              draggable={false}
              src={cdnFile("utilities/ui-elements/emblem.png")}
              className="relative w-32 md:w-40 lg:w-48 rounded-full"
            />
            {icon && (
              <img
                draggable={false}
                className={`w-14 md:w-[72px] lg:w-20 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 ${
                  isError ? "blur-sm" : ""
                }`}
                src={icon}
                alt="Notification Icon"
              />
            )}
          </div>

          <p
            className="text-p2 md:text-p1 font-bold text-yellow-300 glow"
            style={{
              textShadow: "1px 1px 2px black, 0 0 1em red, 0 0 0.2em black",
            }}
          >
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};
