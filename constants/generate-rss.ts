import { findArticlesFetch } from '@/constants/api';
import RSS from 'rss';
import fs from 'fs';

export default async function generateRssFeed() {
    const site_url = 'https://tokentails.com';

    const feedOptions = {
        title: 'Tokentails.com | RSS Feed',
        description: 'play to save',
        site_url: site_url,
        feed_url: `${site_url}/rss.xml`,
        image_url: `${site_url}/logo.svg`,
        pubDate: new Date(),
        copyright: `All rights reserved ${new Date().getFullYear()}, tokentails.com`,
    };

    const allArticles = await findArticlesFetch({ page: 0, perPage: 200 });

    const feed = new RSS(feedOptions);
    allArticles
        .map((article) => ({
            title: article.title,
            description: article.title,
            url: `${site_url}/${article.category.slug}/${article.slug}`,
            date: new Date().toISOString(),
        }))
        .forEach((feedItem) => feed.item(feedItem));
    fs.writeFileSync('./public/rss.xml', feed.xml({ indent: true }));
}
