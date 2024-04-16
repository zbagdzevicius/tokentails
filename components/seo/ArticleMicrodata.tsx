import { IArticle } from '@/models/article';
import { ArticleJsonLd } from 'next-seo';
import { useMemo } from 'react';

export const ArticleMicrodata = ({
    category,
    title,
    excerpt,
    slug,
    images,
    featuredImage,
    createdAt,
    updatedAt,
    keyword,
}: IArticle) => {
    const url = useMemo(() => {
        const middleUrl = category?.slug;
        const childUrl = slug || '';
        return [process.env.NEXT_PUBLIC_DOMAIN, middleUrl, childUrl].filter((value) => !!value).join('/');
    }, [category, slug]);

    return (
        <ArticleJsonLd
            url={url}
            title={title}
            images={[featuredImage.url, ...images.map((image) => image.url)]}
            datePublished={createdAt}
            dateModified={updatedAt}
            section={category.name}
            keywords={keyword?.name!}
            authorName={[
                {
                    name: process.env.NEXT_PUBLIC_SITE_NAME,
                    url: process.env.NEXT_PUBLIC_DOMAIN,
                },
            ]}
            publisherName={process.env.NEXT_PUBLIC_SITE_NAME}
            publisherLogo={`${process.env.NEXT_PUBLIC_DOMAIN}/logo.svg`}
            description={excerpt}
            isAccessibleForFree={true}
        />
    );
};
