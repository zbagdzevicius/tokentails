import { Share } from "@/components/shared/Share";
import { ShareModal } from "@/components/shared/ShareModal";
import { useEntityMetadata } from "@/context/EntityMetadataContext";
import { ISave } from "@/models/save";
import classNames from "classnames";
import { getRandomNumber } from "@/constants/generate";
import { useState } from "react";
import { FeedBlock } from "./FeedBlock";
import { IComment } from "@/models/comment";
import { Comment, Comments } from "./Comments";

export interface IFeedActionsProps extends ISave {
  link: string;
  comments: IComment[];
}

export const FeedActions = ({
  link,
  type,
  entity,
  comments,
}: IFeedActionsProps) => {
  const { likeToggle, saveToggle, getEntityMetadata } = useEntityMetadata({
    entity,
    type,
  });
  const { isLiked, isSaved } = getEntityMetadata();
  const [shareModalOpened, setShareModalOpened] = useState(false);
  const [commentModalOpened, setCommentModalOpened] = useState(false);

  return (
    <>
      {entity && (
        <button
          onClick={() => saveToggle()}
          className="group flex items-center absolute top-4 right-4 text-gray-500"
        >
          <i
            className={classNames("bx bx-bookmarkt text-h5 animate-pulse", {
              "group-hover:hidden": !isSaved,
              hidden: isSaved,
            })}
          ></i>
          <i
            className={classNames(
              "group-hover:block bx bxs-bookmark-start text-h5",
              {
                hidden: !isSaved,
                "text-accent-600": isSaved,
              }
            )}
          ></i>
        </button>
      )}
      {entity && (
        <span className="absolute top-4 right-16">
          <FeedBlock type={type} entity={entity} />
        </span>
      )}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="rounded-full grid place-items-center text-p1 text-accent-600 mr-2">
              <img className="w-4" src="/logo/paw.png" />
            </span>
            <span className="text-gray-500 text-p5">
              {getRandomNumber(link, new Date())} Paws
            </span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-500 text-p5">
              {Math.ceil(getRandomNumber(`${link}-share`, new Date()) / 10)}{" "}
              Shares
            </span>
            <img className="w-4 ml-2" src="/logo/coin.webp" />
          </div>
        </div>
      </div>
      <div className="px-4">
        <div className="border-t border-gray-200 py-1">
          <div className="flex justify-between">
            {entity && (
              <button
                onClick={() => (isLiked ? {} : likeToggle())}
                className={classNames(
                  "group w-1/3 flex justify-center items-center text-xl rounded-md text-gray-500 rem:h-[38px]",
                  {
                    "hover:bg-gray-100": !isLiked,
                    "cursor-default": isLiked,
                  }
                )}
              >
                <img src="/logo/paw.png" className="w-6 h-6" />
                <div className="text-p4 font-semibold ml-2">
                  {isLiked ? "Pawed" : "Paw"}
                </div>
              </button>
            )}
            <a
              onClick={() => setCommentModalOpened(true)}
              className="group cursor-pointer w-1/3 flex justify-center items-center hover:bg-gray-100 text-xl rounded-md text-gray-500 rem:h-[38px]"
            >
              <img src="/logo/comments.png" className="w-6 h-6" />
              <div className="text-p4 font-semibold ml-2 leading-3">Meows</div>
            </a>
            <a
              onClick={() => setShareModalOpened(true)}
              className="w-1/3 cursor-pointer flex group justify-center items-center hover:bg-gray-100 text-xl rounded-md text-gray-500 rem:h-[38px] group relative"
            >
              <img src="/logo/coin.webp" className="w-6 h-6" />
              <div className="text-p4 font-semibold ml-2">Share</div>
              <Share url={link!} />
            </a>
            {commentModalOpened && (
              <Comments
                entity={entity}
                type={type}
                close={() => setCommentModalOpened(false)}
              />
            )}
            {shareModalOpened && (
              <ShareModal
                close={() => setShareModalOpened(false)}
                url={link!}
              />
            )}
          </div>
        </div>
      </div>
      {!!comments?.length && (
        <div className="px-2 pb-2">
          {comments?.map((comment) => (
            <Comment isReplyDisabled={true} key={comment._id} {...comment} />
          ))}
        </div>
      )}
    </>
  );
};
