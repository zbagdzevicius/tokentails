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
        const baseUrl = process.env.NEXT_PUBLIC_BE_URL;
        if (!baseUrl) {
            return [];
        }

        let slugs = { article: [] };
        try {
            const response = await fetch(`${baseUrl}/feed/slugs`);
            if (!response.ok) {
                return [];
            }
            slugs = await response.json();
        } catch (error) {
            // Keep build resilient when API is unavailable during CI/local builds.
            return [];
        }

        const articles = Array.isArray(slugs?.article) ? slugs.article : [];
        return [
            ...articles.map((article) => ({
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
