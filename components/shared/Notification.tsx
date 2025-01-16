import React from "react";
import { IToast } from "@/context/ToastContext";

export const Notification = ({ notifications }: { notifications: IToast[] }) => {
    if (notifications.length === 0) return null;

    const { message, icon, isError } = notifications[0];

    return (
        <div
            className="fixed z-[110] top-32 left-1/2"
            style={{ transform: "translateX(-50%)" }}
        >
            <div
                className={`animate-bounceWithFade w-[360px] min-h-10 px-2 text-main-black font-secondary`}
            >
                <div className="flex flex-col text-center items-center justify-center">

                    <img
                        src="utilities/ui-elements/emblem.png"
                        className="relative w-48 rounded-full"
                    />

                    {icon && (
                        <img
                            className={`w-20 absolute top-0 translate-y-1 ${isError ? "blur-sm" : ""
                                }`}
                            src={icon}
                            alt="Notification Icon"
                        />
                    )}
                    <p
                        className="text-p1 font-bold text-yellow-300"
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
