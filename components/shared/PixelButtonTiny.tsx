import { useHover } from "@uidotdev/usehooks";
import { useEffect } from "react";

interface IProps {
    text: string;
    subtext?: string | number;
    active?: boolean;
    isBig?: boolean;
    onClick?: () => void;
}

export const PixelButtonTiny = ({
    text,
    subtext,
    active,
    onClick,
}: IProps) => {
    const [ref, hovering] = useHover();
    const handleClick = () => {
        const audio = new Audio("/audio/button/click-close.wav");
        audio.volume = 0.5;
        audio.play();
        if (onClick) onClick();
    };

    useEffect(() => {
        if (hovering) {
            const audio = new Audio("/audio/button/modern-mix.wav");
            audio.volume = 0.5;
            audio.play();
        }
    }, [hovering]);
    return (
        <button
            ref={ref}
            onClick={handleClick}
            className={`flex justify-center items-center lg:h-6 ${!active ? "hover:animate-colormax lg:hover:pb-1 hover:pb-[1px]" : ""
                }`}
        >
            <div className="lg:h-5 h-3 w-1 bg-black"></div>
            <div className="lg:h-8 h-4 w-1 flex flex-col bg-red-500 lg:border-y-4 border-y-2 border-black">
                <div className="lg:h-4 h-2 bg-red-500"></div>
                <div className="lg:h-2 h-[1px] bg-yellow-300"></div>
                {!active && <div className="h-1 bg-red-700"></div>}
            </div>
            <div className="lg:h-8 h-5 flex flex-col  lg:border-y-4 border-y-2 border-black bg-red-500">
                <div
                    className={`lg:h-6 h-3 bg-red-500 font-secondary lg:text-p5 text-p6 flex items-center justify-center lg:w-[6.5rem] w-[3.6125rem] gap-2`}
                >
                    <p className="text-yellow-300 whitespace-nowrap">{text}</p>
                    {subtext && <p className="text-yellow-200">{subtext}</p>}
                </div>
                <div className="lg:h-1 h-[1px] bg-yellow-300"></div>
                {!active && <div className="lg:h-2 h-1 bg-red-700"></div>}
            </div>
            <div className="lg:h-8 h-4 w-1 flex flex-col bg-red-500 lg:border-y-4 border-y-2 border-black">
                <div className="lg:h-4 h-3 bg-yellow-300"></div>
                {!active && <div className="lg:h-2 h-1 bg-red-700"></div>}
            </div>
            <div className="lg:h-6 h-3 w-1 bg-black"></div>
        </button>
    );
};
