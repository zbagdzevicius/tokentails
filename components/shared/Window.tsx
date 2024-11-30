type WindowProps = {
    children: React.ReactNode;
    isUnlocked: boolean;
    isOpened: boolean;
};
export const Window: React.FC<WindowProps> = ({ children, isUnlocked, isOpened }) => {

    return (
        <div className="border-4 border-black h-fit w-fit">
            <div className="relative lg:w-32 lg:h-36 w-20 h-24 border-4 border-[#61412D]  group" onClick={(e) => e.stopPropagation()}>
                <div className="w-full h-full">
                    {children}
                </div>
                <div className={`w-1/2 h-full border-[#61412D] lg:border-l-4 border-l-1 lg:border-r-[0.5rem] border-r-[0.113rem] border-y lg:border-y-2 absolute top-0 left-0 transition-transform duration-500 origin-left flex flex-col justify-around items-center transform 
                    ${isUnlocked && "group-hover:[transform:rotateY(-130deg)]"}
                    ${isOpened && "[transform:rotateY(-130deg)]"}
                    `} >
                    <div className="lg:border-3 border-2 border-black  lg:w-14 lg:h-24 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="lg:border-3 border-2 border-black  lg:w-14 lg:h-24 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="left-knob w-1 lg:h-4 h-2 bg-gray-300 absolute top-1/2 transform -translate-y-1/2 lg:right-2.5 right-1"></div>
                </div>
                <div className={`w-1/2 h-full border-[#61412D] lg:border-l-8 border-l-1 lg:border-r-[0.5rem] border-r-[0.113rem] border-y lg:border-y-2 absolute top-0 right-0  transition-transform duration-500 origin-right flex flex-col justify-around items-center transform
                     ${isUnlocked && "group-hover:[transform:rotateY(130deg)]"}
                      ${isOpened && "[transform:rotateY(130deg)]"}
                     `}>
                    <div className="lg:border-3 border-2 border-black lg:w-14 lg:h-24 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="lg:border-3 border-2 border-black lg:w-14 lg:h-24 w-10 h-20">
                        <div className="bg-sky-300 opacity-40 w-full h-full"></div>
                    </div>
                    <div className="right-knob w-1 lg:h-4  h-2 bg-gray-300 absolute top-1/2 transform -translate-y-1/2 lg:left-2.5 left-1"></div>
                </div>
            </div>
        </div>
    );
};
