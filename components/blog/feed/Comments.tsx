import { Avatar } from "@/components/blog/feed/Avatar";
import { commentsFetch, getNextPageFn, submitComment } from "@/constants/api";
import { fromNow } from "@/constants/utils";
import { useEntityMetadata } from "@/context/EntityMetadataContext";
import { useProfile } from "@/context/ProfileContext";
import { IComment } from "@/models/comment";
import { EntityType, ISave } from "@/models/save";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import classNames from "classnames";
import { ChangeEvent, useCallback, useMemo, useState } from "react";
import { If, Then } from "react-if";
import { useDebouncedCallback } from "use-debounce";

interface IProps extends ISave {
  close: () => void;
}

type ICommentInputProps = Pick<IComment, "type" | "entity"> & {
  onComment: (comment: IComment) => void;
};

export const SafeInput = (
  props: ICommentInputProps & { placeholder: string }
) => {
  const [message, setMessage] = useState("");
  const { profile } = useProfile();
  const commentCall = useCallback(async () => {
    if (!profile) {
      throw Error("Not signed in");
    }
    if (!message?.length) {
      throw Error("Message is empty");
    }
    return submitComment({ ...props, text: message });
  }, [profile, message]);
  const { mutate, isPending } = useMutation({
    mutationFn: commentCall,
    onSuccess: (data) => {
      props.onComment(data);
      setMessage("");
    },
  });
  const onSubmit = useDebouncedCallback((key?: string) => {
    if (key === "Enter") {
      mutate();
    }
  }, 200);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isPending) {
      setMessage(event?.target?.value);
    }
  };

  return (
    <div
      onKeyUp={(e) => onSubmit(e.key)}
      className="bg-yellow-100 relative p2 h-8 md:h-10 rounded-full flex items-center justify-center"
    >
      <input
        autoFocus={true}
        type="text"
        disabled={isPending}
        placeholder={props.placeholder}
        className={classNames(
          "outline-none bg-transparent w-full px-4 h-full",
          {
            "animate-pulse": isPending,
          }
        )}
        onChange={handleChange}
        value={message}
      />
      <div
        onClick={() => onSubmit("Enter")}
        className="bx bxs-send absolute right-0 pr-2 top-0 bottom-0 flex justify-center items-center cursor-pointer"
      >
        <img className="w-6" src="/logo/paw.png" />
      </div>
    </div>
  );
};

export const Comment = ({
  _id,
  text,
  createdAt,
  user,
  isReplyDisabled,
}: IComment & { isReplyDisabled: boolean }) => {
  const { likeToggle, unlikeToggle, getEntityMetadata } = useEntityMetadata({
    entity: _id!,
    type: EntityType.COMMENT,
  });
  const { isLiked, isUnliked } = getEntityMetadata();
  const [isReplyInputDisplayed, setIsCommentInputDisplayed] = useState(false);

  const [postedReplies, setPostedReplies] = useState([] as IComment[]);
  const { data, isFetching } = useInfiniteQuery({
    queryKey: ["entity-comments", _id, isReplyInputDisplayed],
    queryFn: ({ pageParam }) =>
      !isReplyInputDisplayed
        ? []
        : commentsFetch(EntityType.COMMENT, _id!, { page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: getNextPageFn,
  });
  const onReply = useCallback(
    (comment: IComment) => {
      setPostedReplies((comments) => [comment, ...comments]);
    },
    [setPostedReplies]
  );
  const replies = useMemo(
    () => [...postedReplies, ...(data?.pages?.flat(1) || [])],
    [data?.pages, postedReplies]
  );

  const date = useMemo(() => fromNow(createdAt)?.text, [createdAt]);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Avatar avatar={user?.avatar} />
        <div className="flex flex-col bg-blue-300 rounded-lg px-2 py-1">
          <div className="text-p6 text-primary font-medium">{user?.name}</div>
          <div className="text-p5 text-primary">{text}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="ml-2 text-p6 text-gray-500">{date}</span>
        <button
          onClick={() => (isLiked ? {} : likeToggle())}
          className={classNames(
            "px-1 group flex justify-center items-center text-xl rounded-md text-gray-500",
            {
              "hover:bg-yellow-100": !isLiked,
              "cursor-default": isLiked,
            }
          )}
        >
          <img className="w-4" src="/logo/paw.png" />
          <div className="text-p5 font-semibold ml-2">Paw</div>
        </button>
        {!isReplyDisabled && (
          <button
            onClick={() => setIsCommentInputDisplayed(true)}
            className={classNames(
              "px-1group flex justify-center items-center text-xl rounded-md text-gray-500",
              {
                "hover:bg-yellow-100": !isReplyInputDisplayed,
                "cursor-default": isReplyInputDisplayed,
              }
            )}
          >
            <img src="/logo/comments.png" className="w-5" />
            <div className="text-p5 font-semibold ml-2">Meows</div>
          </button>
        )}
        <button
          onClick={() => (isUnliked ? {} : unlikeToggle())}
          className={classNames(
            "px-1 group flex justify-center items-center text-xl rounded-md text-gray-500",
            {
              "hover:bg-yellow-100": !isUnliked,
              "cursor-default": isUnliked,
            }
          )}
        >
          <div className="text-p5 font-semibold ml-2">Report</div>
        </button>
      </div>
      <If condition={isReplyInputDisplayed}>
        <Then>
          <div className="flex mb-2">
            <div className="w-1 mr-2 backdrop-contrast-75 rounded-lg"></div>
            <div className="pt-2 flex-1">
              <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                {!replies.length && (
                  <span className="text-center">No meows, Write a meow</span>
                )}
                {replies.map((reply) => (
                  <Comment key={reply._id!} isReplyDisabled={true} {...reply} />
                ))}
              </div>
              <div className="pt-2"></div>
              {!isReplyDisabled && (
                <SafeInput
                  entity={_id!}
                  type={EntityType.COMMENT}
                  onComment={onReply}
                  placeholder="Meow"
                />
              )}
            </div>
          </div>
        </Then>
      </If>
    </div>
  );
};

export const Comments = ({ close, entity, type }: IProps) => {
  const [postedComments, setPostedComments] = useState([] as IComment[]);
  const { data, isFetching } = useInfiniteQuery({
    queryKey: ["entity-comments", entity],
    queryFn: ({ pageParam }) =>
      commentsFetch(type, entity, { page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: getNextPageFn,
  });
  const onComment = useCallback(
    (comment: IComment) => {
      setPostedComments((comments) => [comment, ...comments]);
    },
    [setPostedComments]
  );
  const comments = useMemo(
    () => [...postedComments, ...(data?.pages?.flat(1) || [])],
    [data?.pages, postedComments]
  );

  return (
    <div className="fixed left-0 right-0 top-0 bottom-0 w-full z-50 flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-100 opacity-[0.75]"
      ></div>
      <div className="z-50 w-full md:w-[480px] max-w-full mt-safe absolute bg-yellow-50 absolute top-32 bottom-0 rounded-t-[22px] shadow flex flex-col pb-8 pt-6 px-2">
        <div className="flex justify-center gap-2 items-center mb-5">
          <img src="/logo/comments.png" className="w-6 h-6" />
          <div className="text-center">Meows</div>
          <img src="/logo/comments.png" className="w-6 h-6 scale-x-[-100%]" />
        </div>
        <div className="flex flex-col gap-4 mb-6 overflow-y-auto flex-1">
          {!comments.length && (
            <span className="text-center">
              No meows, write a meow and press a paw.
            </span>
          )}
          {comments.map((comment) => (
            <Comment key={comment._id!} {...comment} />
          ))}
        </div>
        <SafeInput
          entity={entity}
          type={type}
          onComment={onComment}
          placeholder="Write a meow"
        />
        <div className="pb-safe"></div>
        <button onClick={close} className="absolute right-3 top-2 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
