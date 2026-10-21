const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Articles are served by pages/feed/[category]/[article].tsx.
const getArticlePath = (article) =>
    `/feed/${encodeURIComponent(article.category)}/${encodeURIComponent(article.slug)}`;

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
    // /gaming is a noindex redirect stub for legacy links; /cats/view and
    // /feed/article are the app export's client routes (noindex).
    // /swordcat (Pink Paw Knight) is on by default (NEXT_PUBLIC_SWORDCAT=0 turns it off) but stays
    // noindex in SeoHead, so it stays out of the sitemap until it is indexed.
    // /yourcat is paused until launch (YOURCAT_ENABLED off, docs/YOURCAT.md): remove it here as a
    // launch checklist step.
    // /pawlegends and its terms are noindex until the trademark search passes (POC.md §11.4). Launch day
    // (docs/plans/moba/LAUNCH.md a.8 step 1) removes '/pawlegends' here together with the page's `noindex`;
    // '/pawlegends/terms' stays out (its page stays noindex).
    exclude: ['/gaming', '/cats/view', '/feed/article', '/swordcat', '/yourcat', '/pawlegends', '/pawlegends/terms'],
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
        } catch {
            // Keep build resilient when API is unavailable during CI/local builds.
            return [];
        }

        const articles = (Array.isArray(slugs?.article) ? slugs.article : []).filter(
            (article) => article?.category && article?.slug,
        );
        return [
            ...articles.map((article) => ({
                ...getRecord(getArticlePath(article), article.updatedAt),
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
