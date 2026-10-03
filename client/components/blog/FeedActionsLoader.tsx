import { PixelIcon } from "@/components/shared/PixelIcon";

export const FeedActionsLoader = () => {
    return (
        <>
            <button className="group flex items-center absolute top-4 right-4 text-gray-500">
                <PixelIcon name="bookmark" className="text-h5" />
            </button>
            <div className="px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="rounded-full grid place-items-center text-p1 -ml-1 text-gray-500 mr-2">
                            <PixelIcon name="thumbs-up" />
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
                            <PixelIcon name="thumbs-up" className="text-p1" />
                            <div className="w-12 h-1.5 bg-gray-500 rounded-lg ml-2"></div>
                        </button>
                        <a className="w-1/3 flex group justify-center items-center text-xl rounded-md text-gray-500 rem:h-[38px] group relative">
                            <PixelIcon name="share" className="text-p1 -scale-x-100" />
                            <div className="w-12 h-1.5 bg-gray-500 rounded-lg ml-2"></div>
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
};
