import { FeedActionsLoader } from "../blog/FeedActionsLoader";
import { FeedAuthorLoader } from "../blog/FeedAuthorLoader";

export const Loader = () => {
    return (
        <div className="shadow bg-white rounded-lg relative animate-pulse mt-4 transition-animation">
            <div className="flex justify-between items-center pr-4">
                <FeedAuthorLoader />
            </div>

            <div className="text-justify px-4 py-2 gap-2 flex flex-col mb-8">
                <div className="w-full h-2 bg-gray-500 rounded-lg"></div>
                <div className="w-full h-2 bg-gray-500 rounded-lg"></div>
            </div>

            <FeedActionsLoader />
        </div>
    );
};
