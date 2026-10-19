/**
 * getStaticPaths / getStaticProps data for the blog pages (build time only; Next drops these
 * imports from the browser bundle). App builds get the app-safe subset (engine.visibleArticles).
 */
import {
  categoryBySlug,
  loadFeed,
  neighboursFor,
  relatedFor,
  slugMap,
  summaryOf,
  visibleArticles,
  visibleCategories,
  type FeedArticle,
  type FeedCategory,
  type FeedStore,
  type FeedSummary,
} from "./engine";

/** The hub's featured article: the first of these that exists, else the newest. */
export const FEATURED_ORDER = ["how-token-tails-works", "catnip-heist-guide", "free-cat-games-online", "moon-rave"];

let warned = false;
function store(): FeedStore {
  const s = loadFeed();
  if (!warned && s.warnings.length && process.env.NODE_ENV !== "test") {
    warned = true;
    console.warn(`[feed] ${s.warnings.length} style note(s) (not fatal):\n${s.warnings.map((w) => `  - ${w.file}: ${w.message}`).join("\n")}`);
  }
  return s;
}

const liveCategories = (articles: FeedArticle[], isApp: boolean): FeedCategory[] =>
  visibleCategories(isApp).filter((c) => articles.some((a) => a.category === c.slug));

export interface HubProps {
  articles: FeedSummary[];
  categories: FeedCategory[];
  featuredSlug: string | null;
}

export function hubProps(isApp: boolean, s: FeedStore = store()): HubProps {
  const articles = visibleArticles(s, isApp);
  const featured = FEATURED_ORDER.find((slug) => articles.some((a) => a.slug === slug)) ?? articles[0]?.slug ?? null;
  return { articles: articles.map(summaryOf), categories: liveCategories(articles, isApp), featuredSlug: featured };
}

/** Every category page of the build (all visible categories, so a section link never 404s). */
export function categoryPaths(isApp: boolean): { params: { category: string } }[] {
  return visibleCategories(isApp).map((c) => ({ params: { category: c.slug } }));
}

export interface CategoryProps {
  category: FeedCategory;
  articles: FeedSummary[];
  others: FeedCategory[];
  liveCategories: string[];
}

export function categoryProps(slug: string, isApp: boolean, s: FeedStore = store()): CategoryProps | null {
  const category = categoryBySlug(slug);
  if (!category || !visibleCategories(isApp).some((c) => c.slug === slug)) return null;
  const articles = visibleArticles(s, isApp);
  const live = liveCategories(articles, isApp);
  return {
    category,
    articles: articles.filter((a) => a.category === slug).map(summaryOf),
    others: live.filter((c) => c.slug !== slug),
    liveCategories: live.map((c) => c.slug),
  };
}

export function articlePaths(isApp: boolean, s: FeedStore = store()): { params: { category: string; article: string } }[] {
  return visibleArticles(s, isApp).map((a) => ({ params: { category: a.category, article: a.slug } }));
}

export interface ArticleProps {
  article: FeedArticle;
  category: FeedCategory;
  related: FeedSummary[];
  prev: FeedSummary | null;
  next: FeedSummary | null;
  liveCategories: string[];
}

export function articleProps(categorySlug: string, slug: string, isApp: boolean, s: FeedStore = store()): ArticleProps | null {
  const pool = visibleArticles(s, isApp);
  const article = pool.find((a) => a.slug === slug && a.category === categorySlug);
  const category = article ? categoryBySlug(article.category) : null;
  if (!article || !category) return null;
  const { prev, next } = neighboursFor(article, pool);
  return {
    article,
    category,
    related: relatedFor(article, pool),
    prev,
    next,
    liveCategories: liveCategories(pool, isApp).map((c) => c.slug),
  };
}

/** For /feed/article?slug= (the app's old client route): every known slug to its page. */
export function slugMapProps(isApp: boolean, s: FeedStore = store()): { map: Record<string, string>; liveCategories: string[] } {
  const pool = visibleArticles(s, isApp);
  return { map: slugMap(s, pool), liveCategories: liveCategories(pool, isApp).map((c) => c.slug) };
}
