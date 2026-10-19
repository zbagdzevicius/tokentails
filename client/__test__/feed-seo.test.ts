/**
 * The blog's SEO outputs: legacy redirects (every old CMS URL), JSON-LD shapes, the sitemap rows,
 * the RSS feed and the page title rule. Fixtures: __test__/fixtures/feed.
 */
import path from "path";
import { buildRss, feedRedirects, loadFeed, resetFeedCache, sitemapEntries, slugMap, legacyRedirectTable, categories } from "@/lib/feed/engine";
import { blogJsonLd, blogPostingJsonLd, breadcrumbJsonLd, collectionJsonLd, faqJsonLd, ldJson, organizationJsonLd } from "@/lib/feed/jsonld";
import { articleTitleTag, formatFeedDate } from "@/lib/feed/view";
import { buildSeoTags } from "@/components/seo/SeoHead";

const FIXTURES = path.join(__dirname, "fixtures", "feed");
const ORIGIN = "https://tokentails.com";
const load = () => loadFeed(FIXTURES, { cache: false });

beforeEach(() => resetFeedCache());

describe("legacy redirects", () => {
  const table = legacyRedirectTable();

  it("covers every one of the 61 legacy CMS articles, once", () => {
    expect(table).toHaveLength(61);
    const sources = table.map((r) => r.from);
    expect(new Set(sources).size).toBe(61);
    const counts = { "cats-nft": 0, "all-about-cats": 0, announcements: 0 } as Record<string, number>;
    for (const s of sources) counts[s.split("/")[2]] += 1;
    expect(counts).toEqual({ "cats-nft": 9, "all-about-cats": 8, announcements: 44 });
  });

  it("points every legacy URL at a new section", () => {
    const sections = new Set(categories().map((c) => c.slug));
    for (const r of table) {
      expect(r.from).toMatch(/^\/feed\/(cats-nft|all-about-cats|announcements)\/[a-z0-9-]+$/);
      expect(r.to).toMatch(/^\/feed\/[a-z]+\/[a-z0-9-]+$/);
      expect(sections.has(r.to.split("/")[2])).toBe(true);
    }
  });

  it("sends a legacy URL to its category with a temporary redirect while the article is not written", () => {
    const list = feedRedirects({ articles: [], warnings: [] });
    const heist = list.find((r) => r.source === "/feed/announcements/token-tails-x-stellar");
    expect(heist).toEqual({ source: "/feed/announcements/token-tails-x-stellar", destination: "/feed/news", permanent: false });
  });

  it("is permanent once the article exists, and adds frontmatter legacySlugs", () => {
    const store = load();
    const list = feedRedirects(store, [{ from: "/feed/cats-nft/old-guide", to: "/feed/games/sample-heist-guide" }]);
    expect(list).toContainEqual({ source: "/feed/cats-nft/old-guide", destination: "/feed/games/sample-heist-guide", permanent: true });
    expect(list).toContainEqual({ source: "/feed/announcements/old-sample-guide", destination: "/feed/games/sample-heist-guide", permanent: true });
    // A live article URL never redirects away.
    expect(list.some((r) => r.source === "/feed/games/sample-heist-guide")).toBe(false);
  });

  it("sends the old category landings and any unlisted old article to the new section", () => {
    const list = feedRedirects({ articles: [], warnings: [] });
    expect(list).toContainEqual({ source: "/feed/cats-nft", destination: "/feed/games", permanent: true });
    expect(list).toContainEqual({ source: "/feed/all-about-cats", destination: "/feed/cats", permanent: true });
    expect(list).toContainEqual({ source: "/feed/announcements", destination: "/feed/news", permanent: true });
    expect(list).toContainEqual({ source: "/feed/announcements/:slug", destination: "/feed/news", permanent: true });
    // Specific rules come before the catch-alls (Next applies the first match).
    const specific = list.findIndex((r) => r.source === "/feed/announcements/token-tails-x-stellar");
    const catchAll = list.findIndex((r) => r.source === "/feed/announcements/:slug");
    expect(specific).toBeLessThan(catchAll);
  });

  it("are wired into next.config.js on the web", async () => {
    jest.resetModules();
    const saved = process.env.NEXT_PUBLIC_IS_APP;
    delete process.env.NEXT_PUBLIC_IS_APP;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../next.config.js");
    const redirects = (await config.redirects()) as { source: string; destination: string; permanent: boolean }[];
    if (saved !== undefined) process.env.NEXT_PUBLIC_IS_APP = saved;
    for (const r of table) expect(redirects.some((x) => x.source === r.from)).toBe(true);
    expect(redirects).toContainEqual({ source: "/feed/cats-nft", destination: "/feed/games", permanent: true });
  });

  it("maps old slugs to live paths for the app's /feed/article?slug= route", () => {
    const store = load();
    const map = slugMap(store, store.articles, [{ from: "/feed/cats-nft/old-guide", to: "/feed/games/sample-heist-guide" }, { from: "/feed/cats-nft/gone", to: "/feed/games/missing" }]);
    expect(map["old-guide"]).toBe("/feed/games/sample-heist-guide");
    expect(map["old-sample-guide"]).toBe("/feed/games/sample-heist-guide");
    expect(map["sample-cat-care"]).toBe("/feed/cats/sample-cat-care");
    expect(map.gone).toBeUndefined();
  });
});

describe("JSON-LD", () => {
  it("describes an article as a BlogPosting with dates, image, author and publisher", () => {
    const [guide] = load().articles;
    const ld = blogPostingJsonLd(guide, categories()[0], ORIGIN);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: guide.title,
      description: guide.description,
      url: `${ORIGIN}/feed/games/sample-heist-guide`,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${ORIGIN}/feed/games/sample-heist-guide` },
      datePublished: "2026-10-10T00:00:00.000Z",
      dateModified: "2026-10-19T00:00:00.000Z",
      author: { "@type": "Organization", name: "Token Tails team" },
      publisher: { "@type": "Organization", name: "Token Tails", logo: { "@type": "ImageObject", url: `${ORIGIN}/icons/icon-512.png` } },
      articleSection: "Games",
      inLanguage: "en",
    });
    expect((ld.image as { url: string; width: number }[])[0]).toMatchObject({ url: `${ORIGIN}/game-select/heist-og.jpg`, width: 1200, height: 630 });
  });

  it("builds breadcrumbs, FAQ and the hub", () => {
    expect(breadcrumbJsonLd([{ name: "Blog", path: "/feed" }, { name: "Games", path: "/feed/games" }], ORIGIN)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: `${ORIGIN}/feed` },
        { "@type": "ListItem", position: 2, name: "Games", item: `${ORIGIN}/feed/games` },
      ],
    });
    expect(faqJsonLd([])).toBeNull();
    expect(faqJsonLd([{ q: "Free?", a: "Yes." }])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Free?", acceptedAnswer: { "@type": "Answer", text: "Yes." } }],
    });
    const articles = load().articles;
    const hub = blogJsonLd(articles, ORIGIN);
    expect(hub).toMatchObject({ "@type": "Blog", url: `${ORIGIN}/feed`, publisher: organizationJsonLd(ORIGIN) });
    expect(hub.blogPost).toHaveLength(3);
    expect(collectionJsonLd(categories()[0], articles.slice(0, 1), ORIGIN)).toMatchObject({ "@type": "CollectionPage", url: `${ORIGIN}/feed/games` });
  });

  it("escapes < so article text can never close the script tag", () => {
    expect(ldJson({ headline: "</script><b>" })).toBe('{"headline":"\\u003c/script>\\u003cb>"}');
  });
});

describe("sitemap rows", () => {
  it("lists the hub, each section with articles and every article with its real lastmod and image", () => {
    const rows = sitemapEntries(load(), ORIGIN);
    expect(rows.map((r) => r.loc)).toEqual([
      `${ORIGIN}/feed`,
      `${ORIGIN}/feed/games`,
      `${ORIGIN}/feed/cats`,
      `${ORIGIN}/feed/news`,
      `${ORIGIN}/feed/games/sample-heist-guide`,
      `${ORIGIN}/feed/cats/sample-cat-care`,
      `${ORIGIN}/feed/news/sample-shelter-news`,
    ]);
    expect(rows[0].lastmod).toBe("2026-10-19T00:00:00.000Z");
    const guide = rows.find((r) => r.loc.endsWith("sample-heist-guide"));
    expect(guide).toEqual({ loc: `${ORIGIN}/feed/games/sample-heist-guide`, lastmod: "2026-10-19T00:00:00.000Z", images: [{ loc: `${ORIGIN}/game-select/heist-og.jpg` }] });
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(r.images ? ["images", "lastmod", "loc"] : ["lastmod", "loc"]);
  });

  it("has no Google News block, priority or changefreq in the config", () => {
    const source = jest.requireActual<typeof import("fs")>("fs").readFileSync(path.join(__dirname, "../next-sitemap.config.js"), "utf8");
    expect(source).not.toMatch(/publicationLanguage|news:\s*\{|priority:\s*1|changefreq:\s*'daily'/);
  });
});

describe("RSS", () => {
  it("is valid RSS 2.0 with one item per article, newest first, escaped", () => {
    const articles = load().articles;
    const xml = buildRss(articles, ORIGIN);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml).toContain(`<atom:link href="${ORIGIN}/feed/rss.xml" rel="self" type="application/rss+xml"/>`);
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml.indexOf("sample-heist-guide")).toBeLessThan(xml.indexOf("sample-cat-care"));
    expect(xml).toContain(`<guid isPermaLink="true">${ORIGIN}/feed/news/sample-shelter-news</guid>`);
    expect(xml).toContain("<pubDate>Mon, 10 Mar 2025 09:00:00 GMT</pubDate>");
    // Enclosures carry the real byte length: local files only, remote images are left out.
    const size = jest.requireActual<typeof import("fs")>("fs").statSync(path.join(__dirname, "../public/game-select/heist-og.jpg")).size;
    expect(xml).toContain(`<enclosure url="${ORIGIN}/game-select/heist-og.jpg" type="image/jpeg" length="${size}"/>`);
    expect(xml).not.toContain("sample.jpeg");
    expect(xml).not.toContain('length="0"');
    expect(buildRss([{ ...articles[0], title: "Cats & <dogs>" }], ORIGIN)).toContain("<title>Cats &amp; &lt;dogs&gt;</title>");
  });
});

describe("titles and dates", () => {
  it("uses seoTitle, else adds the brand when it fits in 60 characters", () => {
    expect(articleTitleTag({ title: "Short", seoTitle: null })).toBe("Short | Token Tails");
    expect(articleTitleTag({ title: "x".repeat(50), seoTitle: null })).toBe("x".repeat(50));
    expect(articleTitleTag({ title: "Long", seoTitle: "Custom" })).toBe("Custom");
  });

  it("formats dates in UTC so server and browser agree", () => {
    expect(formatFeedDate("2026-10-19")).toBe("19 Oct 2026");
    expect(formatFeedDate("2025-03-10T23:30:00Z")).toBe("10 Mar 2025");
  });
});

describe("article meta tags", () => {
  it("sends the share title, article dates, section and one tag per keyword", () => {
    const tags = buildSeoTags({
      title: "Guide | Token Tails",
      ogTitle: "Guide",
      description: "D",
      path: "/feed/games/guide",
      image: { url: "/game-select/heist-og.jpg", width: 1200, height: 630, alt: "Art" },
      articleMeta: { publishedTime: "2026-10-10", modifiedTime: "2026-10-19", section: "Games", tags: ["cat stealth game", "browser game"] },
    });
    const get = (id: string) => tags.filter((t) => t.id === id || (id === "title" && t.kind === "title")).map((t) => t.content);
    expect(get("title")).toEqual(["Guide | Token Tails"]);
    expect(get("og:title")).toEqual(["Guide"]);
    expect(get("og:type")).toEqual(["article"]);
    expect(get("canonical")).toEqual(["https://tokentails.com/feed/games/guide"]);
    expect(get("article:published_time")).toEqual(["2026-10-10"]);
    expect(get("article:modified_time")).toEqual(["2026-10-19"]);
    expect(get("article:section")).toEqual(["Games"]);
    expect(get("article:tag")).toEqual(["cat stealth game", "browser game"]);
    expect(get("og:image:width")).toEqual(["1200"]);
  });
});
