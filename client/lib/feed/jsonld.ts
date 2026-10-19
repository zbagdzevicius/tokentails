/**
 * Structured data for the blog (schema.org JSON-LD): BlogPosting, BreadcrumbList, FAQPage,
 * VideoGame (game guides), Organization and the Blog hub. Pure functions, so tests check the shape
 * without a DOM. Every URL is absolute on the site origin (components/seo/site.ts).
 */
import { absoluteUrl, siteName, siteOrigin, SITE_LOGO } from "@/components/seo/site";
import type { FaqItem, FeedCategory, FeedSummary } from "./engine";

type Json = Record<string, unknown>;

const abs = (pathOrUrl: string, origin: string) => absoluteUrl(pathOrUrl, origin) ?? `${origin}${pathOrUrl}`;

/** The publisher and author of every article: Token Tails MB, Lithuania. */
export function organizationJsonLd(origin: string = siteOrigin()): Json {
  return {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: siteName(),
    legalName: "Token Tails MB",
    url: `${origin}/`,
    logo: {
      "@type": "ImageObject",
      url: abs(`/${SITE_LOGO.path}`, origin),
      width: SITE_LOGO.width,
      height: SITE_LOGO.height,
    },
    address: { "@type": "PostalAddress", addressCountry: "LT" },
    sameAs: ["https://x.com/tokentails", "https://github.com/zbagdzevicius/tokentails"],
  };
}

export function blogPostingJsonLd(article: FeedSummary & { faq?: FaqItem[] }, category: FeedCategory | null, origin: string = siteOrigin()): Json {
  const url = abs(article.path, origin);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: article.title,
    description: article.description,
    image: [
      {
        "@type": "ImageObject",
        url: abs(article.heroImage.src, origin),
        width: article.heroImage.width,
        height: article.heroImage.height,
        caption: article.heroImage.alt,
      },
    ],
    datePublished: new Date(article.publishedAt).toISOString(),
    dateModified: new Date(article.updatedAt).toISOString(),
    author: { "@type": "Organization", name: article.author, url: `${origin}/` },
    publisher: organizationJsonLd(origin),
    ...(category ? { articleSection: category.name } : {}),
    keywords: article.keywords.join(", "),
    inLanguage: "en",
    isAccessibleForFree: true,
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[], origin: string = siteOrigin()): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: abs(c.path, origin),
    })),
  };
}

export function faqJsonLd(faq: FaqItem[]): Json | null {
  if (!faq.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** The browser games a guide can be about (frontmatter `cta`). */
const GAMES: Record<string, { name: string; path: string; genre: string[] }> = {
  heist: { name: "Catnip Heist", path: "/heist", genre: ["Stealth", "Puzzle"] },
  game: { name: "Token Tails", path: "/game", genre: ["Casual", "Pet simulation"] },
  swordcat: { name: "Pink Paw Knight", path: "/swordcat", genre: ["Adventure"] },
  badcat: { name: "Bad Cat Daily", path: "/badcat", genre: ["Casual", "Arcade"] },
};

/** VideoGame for a guide in the games category whose main call to action is a game; null otherwise. */
export function videoGameJsonLd(article: FeedSummary, origin: string = siteOrigin()): Json | null {
  const game = article.category === "games" ? GAMES[article.cta] : undefined;
  if (!game) return null;
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.name,
    url: abs(game.path, origin),
    genre: game.genre,
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    publisher: { "@id": `${origin}/#organization` },
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
  };
}

/** The /feed hub: a Blog with its newest posts, plus the publisher. */
export function blogJsonLd(articles: FeedSummary[], origin: string = siteOrigin()): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${origin}/feed#blog`,
    url: `${origin}/feed`,
    name: `${siteName()} Blog`,
    description: "Cat games, giving that anyone can check, and the open-source code behind Pink Paw's payouts.",
    inLanguage: "en",
    publisher: organizationJsonLd(origin),
    blogPost: articles.slice(0, 20).map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: abs(a.path, origin),
      datePublished: new Date(a.publishedAt).toISOString(),
      dateModified: new Date(a.updatedAt).toISOString(),
    })),
  };
}

/** A category landing: a CollectionPage of its posts. */
export function collectionJsonLd(category: FeedCategory, articles: FeedSummary[], origin: string = siteOrigin()): Json {
  const url = `${origin}/feed/${category.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: category.name,
    description: category.description,
    isPartOf: { "@id": `${origin}/feed#blog` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(a.path, origin) })),
    },
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` escaped so text can never close the tag. */
export const ldJson = (data: Json): string => JSON.stringify(data).replace(/</g, "\\u003c");
