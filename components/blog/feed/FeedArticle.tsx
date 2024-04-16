import { IArticleExcerpt as Props } from '@/models/article';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { FeedCard } from './FeedCard';
import { EntityRouteOption } from '@/constants/api';

export const FeedArticle = ({ _id, title, slug, featuredImage, excerpt, category, createdAt, ...rest }: Props) => {
    const link = useMemo(() => EntityRouteOption.ARTICLE.details([category.slug, slug]), [slug, category.slug]);

    return (
        <FeedCard
            entity={_id}
            description={excerpt}
            author={category.name}
            authorImage={'/logo/coin.png'}
            authorLink={category.slug}
            date={createdAt}
            link={link}
            {...rest}
        >
            <Link href={link} className="rem:h-[350px] relative flex">
                <Image
                    loading="lazy"
                    height={350}
                    width={720}
                    src={featuredImage?.url}
                    className="object-cover z-0 rem:h-[350px]"
                    alt={featuredImage?.caption || title}
                />

                <div className="absolute bottom-0 left-0 right-0 p-6 min-h-[6rem] xl:min-h-0 pt-12 flex items-end z-10 mt-40 bg-gradient-to-b from-transparent to-black h-full">
                    <h2
                        className="word-break font-secondary text-h6 text-white font-bold"
                        dangerouslySetInnerHTML={{ __html: title }}
                    ></h2>
                </div>
            </Link>
        </FeedCard>
    );
};
