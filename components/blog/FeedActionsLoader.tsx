export const FeedActionsLoader = () => {
    return (
        <>
            <button className="group flex items-center absolute top-4 right-4 text-gray-500">
                <i className="bx bx-bookmark text-h5"></i>
            </button>
            <div className="px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="rounded-full grid place-items-center text-p1 -ml-1 text-gray-500 mr-2">
                            <i className="bx bxs-like"></i>
                        </span>
                        <div className="w-8 h-2 bg-gray-500 rounded-lg"></div>
                    </div>
                    <div className="flex items-center">
                        <span className="text-gray-500 text-p3">
                            <div className="w-16 h-2 bg-gray-500 rounded-lg"></div>
                        </span>
                    </div>
                </div>
            </div>
            <div className="px-4">
                <div className="border-t border-gray-200 py-1">
                    <div className="flex justify-between">
                        <button className="group w-1/3 flex justify-center items-center text-xl rounded-md text-gray-500 rem:h-[38px]">
                            <i className="bx bx-like text-p1"></i>
                            <div className="w-12 h-1.5 bg-gray-500 rounded-lg ml-2"></div>
                        </button>
                        <a className="w-1/3 flex group justify-center items-center text-xl rounded-md text-gray-500 rem:h-[38px] group relative">
                            <i className="bx bx-share bx-flip-horizontal text-p1"></i>
                            <div className="w-12 h-1.5 bg-gray-500 rounded-lg ml-2"></div>
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
};
