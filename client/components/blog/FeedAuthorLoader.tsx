export const FeedAuthorLoader = () => {
    return (
        <div className="flex items-center justify-between px-4 py-2">
            <div className="flex space-x-2 items-center">
                <span className="w-10 h-10 text-h5 rounded-full grid place-items-center bg-gray-300">
                    <i className="bx text-gray-500 bx-loader animate-spin"></i>
                </span>
                <div className="flex flex-col gap-2 w-20">
                    <div className="w-full h-1.5 bg-gray-500 rounded-lg"></div>
                    <div className="w-full h-1.5 bg-gray-500 rounded-lg"></div>
                </div>
            </div>
        </div>
    );
};
