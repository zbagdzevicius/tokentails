import { useEntityMetadata } from '@/context/EntityMetadataContext';
import { ISave } from '@/models/save';
import classNames from 'classnames';
import { useState } from 'react';

export const FeedBlock = (props: ISave) => {
    const { unlikeToggle, getEntityMetadata } = useEntityMetadata(props);
    const { isUnliked } = getEntityMetadata();
    const [isHidden, setIsHidden] = useState(true);

    if (isHidden) {
        return (
            <button onClick={() => setIsHidden(false)} className="group flex items-center text-gray-500">
                <i className="bx bx-dots-vertical-roundedt text-h5"></i>
            </button>
        );
    }

    return (
        <button
            onClick={() => unlikeToggle()}
            className={classNames('group flex items-center', {
                'cursor-default': isUnliked,
            })}
        >
            <i
                className={classNames('bx bx-blockt text-h5', {
                    'text-gray-500 hover:text-red-600': !isUnliked,
                    'text-red-600': isUnliked,
                })}
            ></i>
        </button>
    );
};
