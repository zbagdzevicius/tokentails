import { IArticle } from '@/models/article';
import Script from 'next/script';

interface IProps extends IArticle {}

export const ArticleMeta = ({
    title,
    slug,
    category,
    content,
    excerpt,
    featuredImage,
    keyword,
    createdAt,
    updatedAt,
}: IProps) => {
    const url = `${process.env.NEXT_PUBLIC_DOMAIN}/${category.slug}/${slug}`;
    return (
        <>
            <meta property="og:article:published_time" content={createdAt} />
            <meta property="og:article:modified_time" content={updatedAt || createdAt} />
            <meta property="og:article:author" content={process.env.NEXT_PUBLIC_SITE_NAME} />
            <meta property="og:article:tag" content={keyword?.name || ''} />
            <meta property="og:article:section" content={category?.name || ''} />
            <Script
                key="article-json-ld"
                id="article-json-ld"
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                        {
                            '@context': 'https://schema.org/',
                            '@type': 'Article',
                            url,
                            headline: title,
                            description: excerpt,
                            image: featuredImage.url,
                            recipeCategory: category.slug,
                            keywords: [keyword?.name || ''],
                            author: {
                                '@type': 'Organization',
                                '@id': process.env.NEXT_PUBLIC_DOMAIN,
                                '@context': 'http://schema.org',
                                name: process.env.NEXT_PUBLIC_SITE_NAME,
                                logo: {
                                    '@type': 'ImageObject',
                                    url: `${process.env.NEXT_PUBLIC_DOMAIN}/logo.svg`,
                                    width: 490,
                                    height: 490,
                                },
                            },
                            aggregateRating: {
                                '@type': 'AggregateRating',
                                ratingValue: '5',
                                ratingCount: '250',
                            },
                            datePublished: createdAt,
                            coverageStartTime: createdAt,
                            coverageEndTime: createdAt,
                            dateModified: updatedAt || createdAt,
                            articleBody: content,
                        },
                        null,
                        '\n',
                    ),
                }}
            />
            <Script
                key="organization-json-ld"
                id="organization-json-ld"
                type="application/ld+json"
                data-schema="Organization"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                        {
                            name: process.env.NEXT_PUBLIC_SITE_NAME,
                            url: process.env.NEXT_PUBLIC_DOMAIN,
                            logo: {
                                '@type': 'ImageObject',
                                url: `${process.env.NEXT_PUBLIC_DOMAIN}/logo.svg`,
                                width: 490,
                                height: 490,
                            },
                            sameAs: ['https://facebook.com/sveikauk.lt', 'https://twitter.com/sveikauk'],
                            '@type': 'Organization',
                            '@context': 'http://schema.org',
                        },
                        null,
                        '\n',
                    ),
                }}
            />
            <Script
                key="webpage-json-ld"
                id="webpage-json-ld"
                type="application/ld+json"
                data-schema="WebPage"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                        {
                            '@id': url,
                            '@type': 'WebPage',
                            '@context': 'http://schema.org',
                        },
                        null,
                        '\n',
                    ),
                }}
            />
        </>
    );
};
