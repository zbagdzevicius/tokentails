import { Avatar } from '@/components/profile/Avatar';
import { useEntityMetadata } from '@/context/EntityMetadataContext';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { IComment } from '@/models/comment';
import { EntityType, ISave } from '@/models/save';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import classNames from 'classnames';
import { commentsFetch, getNextPageFn, submitComment } from '@/constants/api';
import { fromNow } from '@/constants/utils';
import { ChangeEvent, useCallback, useMemo, useState } from 'react';
import { If, Then } from 'react-if';
import { useDebouncedCallback } from 'use-debounce';

interface IProps extends ISave {
    close: () => void;
}

type ICommentInputProps = Pick<IComment, 'type' | 'entity'> & { onComment: (comment: IComment) => void };

export const SafeInput = (props: ICommentInputProps & { placeholder: string }) => {
    const [message, setMessage] = useState('');
    const { user, showSignInPopup } = useFirebaseAuth();
    const commentCall = useCallback(async () => {
        if (!user) {
            showSignInPopup();
            throw Error('Not signed in');
        }
        if (!message?.length) {
            throw Error('Message is empty');
        }
        return submitComment({ ...props, text: message });
    }, [user, message, showSignInPopup]);
    const { mutate, isPending } = useMutation({
        mutationFn: commentCall,
        onSuccess: (data) => {
            props.onComment(data);
            setMessage('');
        },
    });
    const onSubmit = useDebouncedCallback((key?: string) => {
        if (key === 'Enter') {
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
                className={classNames('outline-none bg-transparent w-full px-4 h-full', {
                    'animate-pulse': isPending,
                })}
                onChange={handleChange}
                value={message}
            />
            <div
                onClick={() => onSubmit('Enter')}
                className="bx bxs-send absolute right-0 pr-2 top-0 bottom-0 flex justify-center items-center cursor-pointer"
            ><img className='w-6' src="/logo/paw.png" /></div>
        </div>
    );
};

export const Comment = ({ _id, text, createdAt, user, isReplyDisabled }: IComment & { isReplyDisabled: boolean }) => {
    const { likeToggle, unlikeToggle, getEntityMetadata } = useEntityMetadata({
        entity: _id!,
        type: EntityType.COMMENT,
    });
    const { isLiked, isUnliked } = getEntityMetadata();
    const [isReplyInputDisplayed, setIsCommentInputDisplayed] = useState(false);

    const [postedReplies, setPostedReplies] = useState([] as IComment[]);
    const { data, isFetching } = useInfiniteQuery({
        queryKey: ['entity-comments', _id, isReplyInputDisplayed],
        queryFn: ({ pageParam }) =>
            !isReplyInputDisplayed ? [] : commentsFetch(EntityType.COMMENT, _id!, { page: pageParam }),
        initialPageParam: 0,
        getNextPageParam: getNextPageFn,
    });
    const onReply = useCallback(
        (comment: IComment) => {
            setPostedReplies((comments) => [comment, ...comments]);
        },
        [setPostedReplies],
    );
    const replies = useMemo(() => [...postedReplies, ...(data?.pages?.flat(1) || [])], [data?.pages, postedReplies]);

    const date = useMemo(() => fromNow(createdAt)?.text, [createdAt]);
    return (
        <div className="flex flex-col gap-1">
            <div className="flex gap-2">
                <Avatar avatar={user?.avatar} />
                <div className="flex flex-col backdrop-contrast-75 rounded-lg px-2 py-1">
                    <div className="text-p4 text-primary font-medium">{user?.name}</div>
                    <div className="text-p2 text-primary">{text}</div>
                </div>
            </div>
            <div className="flex gap-4">
                <span className="ml-2 text-p4 text-gray-500">{date}</span>
                <button
                    onClick={() => (isLiked ? {} : likeToggle())}
                    className={classNames(
                        'px-1 group flex justify-center items-center text-xl rounded-md text-gray-500',
                        {
                            'hover:bg-gray-100': !isLiked,
                            'cursor-default': isLiked,
                        },
                    )}
                >
                    <i
                        className={classNames('bx bx-like text-p3 group-hover:hidden', {
                            'group-hover:hidden animate-pulse': !isLiked,
                            hidden: isLiked,
                        })}
                    ></i>
                    <i
                        className={classNames('group-hover:block bx bxs-like text-p3', {
                            hidden: !isLiked,
                            'text-accent-600': isLiked,
                        })}
                    ></i>
                    <div className="text-p4 font-semibold ml-2">Patinka</div>
                </button>
                {!isReplyDisabled && (
                    <button
                        onClick={() => setIsCommentInputDisplayed(true)}
                        className={classNames(
                            'px-1group flex justify-center items-center text-xl rounded-md text-gray-500',
                            {
                                'hover:bg-gray-100': !isReplyInputDisplayed,
                                'cursor-default': isReplyInputDisplayed,
                            },
                        )}
                    >
                        <i className="bx bx-reply text-p3 animate-pulse"></i>
                        <div className="text-p4 font-semibold ml-2">Atsakymai</div>
                    </button>
                )}
                <button
                    onClick={() => (isUnliked ? {} : unlikeToggle())}
                    className={classNames(
                        'px-1 group flex justify-center items-center text-xl rounded-md text-gray-500',
                        {
                            'hover:bg-gray-100': !isUnliked,
                            'cursor-default': isUnliked,
                        },
                    )}
                >
                    <i
                        className={classNames('bx bx-block text-p3 group-hover:hidden', {
                            'group-hover:hidden': !isUnliked,
                            hidden: isUnliked,
                        })}
                    ></i>
                    <i
                        className={classNames('group-hover:block bx bx-block text-p3', {
                            hidden: !isUnliked,
                            'text-red-600': isUnliked,
                        })}
                    ></i>
                    <div className="text-p4 font-semibold ml-2">Pranešti</div>
                </button>
            </div>
            <If condition={isReplyInputDisplayed}>
                <Then>
                    <div className="flex mb-2">
                        <div className="w-1 mr-2 backdrop-contrast-75 rounded-lg"></div>
                        <div className="pt-2 flex-1">
                            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                                {!replies.length && (
                                    <span className="text-center">No replies, Write a reply.</span>
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
                                    placeholder="Atsakyti"
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
        queryKey: ['entity-comments', entity],
        queryFn: ({ pageParam }) => commentsFetch(type, entity, { page: pageParam }),
        initialPageParam: 0,
        getNextPageParam: getNextPageFn,
    });
    const onComment = useCallback(
        (comment: IComment) => {
            setPostedComments((comments) => [comment, ...comments]);
        },
        [setPostedComments],
    );
    const comments = useMemo(() => [...postedComments, ...(data?.pages?.flat(1) || [])], [data?.pages, postedComments]);

    return (
        <div className="fixed left-0 right-0 top-0 bottom-0 w-full z-50 flex justify-center h-full">
            <div
                onClick={close}
                className="z-40 h-full w-full absolute inset-0 bg-yellow-100 opacity-[0.75]"
            ></div>
            <div className="z-50 w-full md:w-[480px] transition-from-bottom-animation max-w-full mt-safe absolute bg-yellow-50 absolute top-32 bottom-0 rounded-t-[22px] shadow flex flex-col pb-8 pt-6 px-2">
                <div className="text-center mb-6">Meows</div>
                <div className="flex flex-col gap-4 mb-6 overflow-y-auto flex-1">
                    {!comments.length && <span className="text-center">No meows, write a meow and press a paw.</span>}
                    {comments.map((comment) => (
                        <Comment key={comment._id!} {...comment} />
                    ))}
                </div>
                <SafeInput entity={entity} type={type} onComment={onComment} placeholder="Write a meow" />
                <div className="pb-safe"></div>
                <button onClick={close} className="absolute right-3 top-2 group">
                    <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
                </button>
            </div>
        </div>
    );
};
