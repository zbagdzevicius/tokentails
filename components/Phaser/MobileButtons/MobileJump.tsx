import React from "react";

export const MobileJump: React.FC<{
    isHidden: boolean;
}> = ({ isHidden }: { isHidden: boolean }) => {
    return (
        <>
            <div
                className={`pb-safe z-10 fixed bottom-6 left-0 right-0 w-full flex lg:hidden items-end justify-between ${isHidden ? "hidden" : ""
                    }`}
            >
                <button
                    id="jump"
                    className="absolute bottom-4 md:bottom-2 right-2 md:right-4 rounded-full h-[90px] w-[90px] bg-cover bg-center flex items-center justify-center border-4 border-gray-500"
                    style={{
                        backgroundImage: "url('/backgrounds/bg-7.png')",
                    }}
                >
                    <img
                        draggable={false}
                        className="h-full w-auto"
                        src="game/controls/jump-moba.png"
                        alt="Jump"
                    />
                </button>

            </div>
        </>
    );
};
