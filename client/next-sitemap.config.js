// The blog's rows come from the repo content (lib/feed/engine.ts, loaded by Node's type stripping):
// the hub, each section with articles and each article, with its real last-modified date and hero
// image. No changefreq or priority (search engines ignore them), and no Google News block (the blog
// is evergreen guides, not a news publication).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config
const feed = require('./lib/feed/engine.ts');

const origin = () => {
    try {
        return new URL(process.env.NEXT_PUBLIC_DOMAIN || 'https://tokentails.com').origin;
    } catch {
        return 'https://tokentails.com';
    }
};

/** Pages outside the blog: just the URL (next-sitemap adds nothing we can stand behind). */
const plain = (config, path) => ({ loc: path });

/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.NEXT_PUBLIC_DOMAIN,
    generateRobotsTxt: !process.env.NEXT_PUBLIC_IS_APP,
    robotsTxtOptions: {},
    sitemapSize: 1000,
    autoLastmod: false,
    // /gaming is a noindex redirect stub for legacy links; /cats/view and
    // /feed/article are the app export's client routes (noindex).
    // /swordcat (Pink Paw Knight) is on by default (NEXT_PUBLIC_SWORDCAT=0 turns it off) but stays
    // noindex in SeoHead, so it stays out of the sitemap until it is indexed.
    // /yourcat is paused until launch (YOURCAT_ENABLED off, docs/YOURCAT.md): remove it here as a
    // launch checklist step.
    // /feed/* auto-detected pages are replaced by the rows below (same set, with real dates).
    // /pawlegends and its terms are noindex until the trademark search passes (POC.md §11.4). Launch day
    // (docs/plans/moba/LAUNCH.md a.8 step 1) removes '/pawlegends' here together with the page's `noindex`;
    // '/pawlegends/terms' stays out (its page stays noindex).
    exclude: ['/gaming', '/cats/view', '/feed/article', '/swordcat', '/yourcat', '/feed', '/feed/*', '/pawlegends', '/pawlegends/terms'],
    transform: async (config, path) => plain(config, path),
    additionalPaths: async () => {
        if (process.env.NEXT_PUBLIC_IS_APP) {
            return [];
        }
        const base = origin();
        // Static games served by next.config.js rewrites (not pages, so next-sitemap cannot see them).
        const games = [{ loc: '/meow-race' }];
        return games.concat(feed.sitemapEntries(feed.loadFeed(), base).map((row) => ({
            // next-sitemap prefixes siteUrl itself: pass the path.
            loc: row.loc.slice(base.length) || '/',
            lastmod: row.lastmod,
            ...(row.images ? { images: row.images.map((img) => ({ loc: new URL(img.loc) })) } : {}),
        })));
    },
};
