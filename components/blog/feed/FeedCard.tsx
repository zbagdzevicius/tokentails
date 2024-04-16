import React, { PropsWithChildren } from 'react';
import { FeedActions, IFeedActionsProps } from './FeedActions';
import { FeedAuthor, IFeedAuthorProps } from './FeedAuthor';

type IProps = PropsWithChildren<{ description?: string } & IFeedAuthorProps & IFeedActionsProps>;

export const FeedCard = ({
    children,
    description,
    author,
    authorLink,
    authorSubtitle,
    authorImage,
    date,
    ...rest
}: IProps) => {
    return (
        <div className="shadow transition-animation bg-yellow-50 rounded-lg relative">
            <div className="flex justify-between items-center pr-4">
                <FeedAuthor
                    author={author}
                    authorSubtitle={authorSubtitle}
                    authorLink={authorLink}
                    authorImage={authorImage}
                    date={date}
                />
            </div>

            {description && (
                <div className="text-justify px-4 pb-2 leading-[1.35em] break-words whitespace-break-spaces">
                    {description}
                </div>
            )}

            {children}

            <FeedActions {...rest} />
        </div>
    );
};
