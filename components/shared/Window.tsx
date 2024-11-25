type WindowProps = {
    children: React.ReactNode;
    isUnlocked: boolean;
    isOpened: boolean;
};
export const Window: React.FC<WindowProps> = ({ children, isUnlocked, isOpened }) => {

    return (
        <div className="border-4 border-black h-fit">
            <div className="relative lg:w-60 lg:h-60 w-24 h-24 border-4 border-[#61412D]  group" onClick={(e) => e.stopPropagation()}>
                <div className="w-full h-full">
                    {children}
                </div>
                <div className={`w-1/2 h-full border-[#61412D] lg:border-l-[1.25rem] border-l-4 lg:border-r-[0.75rem] border-r-[0.313rem] border-y lg:border-y-2 absolute top-0 left-0 transition-transform duration-500 origin-left flex flex-col justify-around items-center transform 
                    ${isUnlocked && "group-hover:[transform:rotateY(-140deg)]"}
                    ${isOpened && "[transform:rotateY(-140deg)]"}
                    `} >
                    <div className="lg:border-4 border-2 border-black  lg:w-24 lg:h-32 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="lg:border-4 border-2 border-black  lg:w-24 lg:h-32 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="left-knob lg:w-2.5 lg:h-8 w-1.5 h-2 bg-gray-300 absolute top-1/2 transform -translate-y-1/2 lg:right-2.5 right-1"></div>
                </div>
                <div className={`w-1/2 h-full border-[#61412D] lg:border-l-[1.25rem] border-l-4 lg:border-r-[0.75rem] border-r-[0.313rem] border-y lg:border-y-2 absolute top-0 right-0  transition-transform duration-500 origin-right flex flex-col justify-around items-center transform
                     ${isUnlocked && "group-hover:[transform:rotateY(140deg)]"}
                      ${isOpened && "[transform:rotateY(140deg)]"}
                     `}>
                    <div className="lg:border-4 border-2 border-black bg-sky-300 opacity-40  lg:w-24 lg:h-32 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="lg:border-4 border-2 border-black bg-sky-300 opacity-40   lg:w-24 lg:h-32 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="right-knob lg:w-2.5 lg:h-8 w-1.5 h-2 bg-gray-300 absolute top-1/2 transform -translate-y-1/2 lg:left-2.5 left-1"></div>
                </div>
            </div>
        </div>
    );
};
