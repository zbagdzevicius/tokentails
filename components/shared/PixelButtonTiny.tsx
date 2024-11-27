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
    return (
        <button
            onClick={onClick}
            className={`flex justify-center items-center lg:h-12 ${!active ? "hover:animate-colormax hover:pb-1" : ""
                }`}
        >
            <div className="lg:h-8 h-4 w-1 bg-black"></div>
            <div className="lg:h-10 h-5 w-1 flex flex-col bg-red-500 border-y-4 border-black">
                <div className="lg:h-6 h-3 bg-red-500"></div>
                <div className="lg:h-1 h-[2px] bg-yellow-300"></div>
                {!active && <div className="h-2 bg-red-700"></div>}
            </div>
            <div className="lg:h-12 h-6 flex flex-col  border-y-4 border-black bg-red-500">
                <div
                    className={`lg:h-9 h-4 bg-red-500 font-secondary lg:text-p4 text-p6 flex items-center justify-center lg:w-[12.5rem] w-[4.6125rem] gap-2`}
                >
                    <p className="text-yellow-300 whitespace-nowrap">{text}</p>
                    {subtext && <p className="text-yellow-200">{subtext}</p>}
                </div>
                <div className="lg:h-1 h-[2px] bg-yellow-300"></div>
                {!active && <div className="lg:h-2 h-1 bg-red-700"></div>}
            </div>
            <div className="lg:h-10 h-5 w-1 flex flex-col bg-red-500 border-y-4 border-black">
                <div className="lg:h-8 h-4 bg-yellow-300"></div>
                {!active && <div className="lg:h-2 h-1 bg-red-700"></div>}
            </div>
            <div className="lg:h-8 h-4 w-1 bg-black"></div>
        </button>
    );
};
