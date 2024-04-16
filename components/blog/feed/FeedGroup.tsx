import { IGroup as Props } from '@/models/group';
import { EntityRouteOption } from '@/constants/api';
import Link from 'next/link';
import { useMemo } from 'react';
import { FeedCard } from './FeedCard';
import Image from 'next/image';
import { EntityType } from '@/models/save';

export const FeedGroup = ({ _id, slug, name, image, bgImage, description, comments }: Props) => {
    const link = useMemo(() => EntityRouteOption.GROUP.details([slug]), [slug]);

    return (
        <FeedCard
            entity={_id}
            description={description}
            author={name}
            authorLink={link}
            authorImage={image.url}
            date={new Date().toString()}
            link={link}
            type={EntityType.GROUP}
            comments={comments}
        >
            <Link href={link} className="rem:h-[350px] relative flex">
                <Image
                    loading="lazy"
                    height={350}
                    width={720}
                    src={bgImage?.url}
                    className="object-cover z-0 rem:h-[350px]"
                    alt={bgImage?.caption || name}
                />

                <div className="absolute bottom-0 left-0 right-0 p-6 min-h-[6rem] xl:min-h-0 pt-12 flex items-end z-10 mt-40 bg-gradient-to-b from-transparent to-black h-full">
                    <h2
                        className="word-break text-h6 text-white font-bold capitalize"
                        dangerouslySetInnerHTML={{ __html: name }}
                    ></h2>
                </div>
            </Link>
        </FeedCard>
    );
};
