const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const getRecord = (url, date) => {
    return {
        loc: url,
        lastmod: new Date(date).toISOString(),
        changefreq: 'daily',
        priority: 1,
    };
};

/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.NEXT_PUBLIC_DOMAIN,
    generateRobotsTxt: !process.env.NEXT_PUBLIC_IS_APP,
    robotsTxtOptions: {},
    sitemapSize: 1000,
    additionalPaths: async () => {
        if (process.env.NEXT_PUBLIC_IS_APP) {
            return [];
        }
        const slugs = await fetch(`${process.env.NEXT_PUBLIC_BE_URL}/feed/slugs`).then((response) => response.json());
        return [
            ...slugs.article.map((article) => ({
                ...getRecord(`/${article.category}/${article.slug}`, article.updatedAt),
                images: [{ loc: article.featuredImage }],
                news: {
                    title: article.title,
                    publicationName: article.title,
                    publicationLanguage: 'lt',
                    date: new Date(article.updatedAt).toISOString(),
                },
            })),
        ];
    },
    // ...other options
};
