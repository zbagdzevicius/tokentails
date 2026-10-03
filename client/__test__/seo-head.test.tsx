/**
 * @jest-environment jsdom
 *
 * SeoHead, the single meta source (plan F12): absolute URLs built with `new URL()` (no
 * `https:/host` from the old `.replace("//", "/")`), no `@undefined` Twitter handles, keyed tags,
 * absolute og:image with its size, and `noindex`.
 */
import React from "react";
import { render } from "@testing-library/react";
import type { IArticle } from "@/models/article";

// Production-like CDN: shared site assets (the default share image) must stay same origin anyway.
jest.mock("@/constants/utils", () => ({
  cdnFile: (path: string) => `https://cdn.example.test/w/${path}`,
}));

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ENV_KEYS = [
  "NEXT_PUBLIC_DOMAIN",
  "NEXT_PUBLIC_SITE_NAME",
  "NEXT_PUBLIC_TWITTER_PAGE",
  "NEXT_PUBLIC_FB_APP_ID",
  "NEXT_PUBLIC_FB_PAGES",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  ENV_KEYS.forEach((key) => {
    saved[key] = process.env[key];
    delete process.env[key];
  });
  process.env.NEXT_PUBLIC_DOMAIN = "https://tokentails.com";
  process.env.NEXT_PUBLIC_SITE_NAME = "Token Tails";
});
afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  });
  document.head.innerHTML = "";
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require("@/components/seo/SeoHead") as typeof import("@/components/seo/SeoHead");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const site = () => require("@/components/seo/site") as typeof import("@/components/seo/site");

const article = (overrides: Partial<IArticle> = {}): IArticle =>
  ({
    _id: "a1",
    title: "Pink Paw's winter drive",
    slug: "winter-drive",
    excerpt: "How the heist helped.",
    content: "<p>Body</p>",
    images: [],
    featuredImage: { url: "https://cdn.example.com/drive.jpg", caption: "Cats in a row" },
    category: { name: "News", slug: "news" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  }) as unknown as IArticle;

const tagMap = (props: Parameters<ReturnType<typeof load>["buildSeoTags"]>[0]) =>
  Object.fromEntries(load().buildSeoTags(props).map((tag) => [tag.key, tag.content]));

describe("siteOrigin", () => {
  it("normalises NEXT_PUBLIC_DOMAIN to one origin", () => {
    const { siteOrigin, DEFAULT_SITE_ORIGIN } = site();
    expect(siteOrigin("https://tokentails.com")).toBe("https://tokentails.com");
    expect(siteOrigin("https://tokentails.com/")).toBe("https://tokentails.com");
    expect(siteOrigin("tokentails.com")).toBe("https://tokentails.com");
    expect(siteOrigin("http://localhost:3001/")).toBe("http://localhost:3001");
    expect(siteOrigin("https://tokentails.com/feed")).toBe("https://tokentails.com");
    expect(siteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN);
    expect(siteOrigin("undefined")).toBe(DEFAULT_SITE_ORIGIN);
    expect(siteOrigin("")).toBe(DEFAULT_SITE_ORIGIN);
    expect(siteOrigin("javascript://x")).toBe(DEFAULT_SITE_ORIGIN);
  });

  it("joins paths with new URL() and never produces https:/", () => {
    const { absoluteUrl } = site();
    const origin = "https://tokentails.com";
    expect(absoluteUrl("/feed", origin)).toBe("https://tokentails.com/feed");
    expect(absoluteUrl("feed", origin)).toBe("https://tokentails.com/feed");
    expect(absoluteUrl("/feed//news/", origin)).toBe("https://tokentails.com/feed/news");
    // Protocol-relative values name another host, so they are refused rather than guessed.
    expect(absoluteUrl("//evil.example/x", origin)).toBeNull();
    // Empty is not the root (the old /feed passed page=""): only "/" is.
    expect(absoluteUrl("", origin)).toBeNull();
    expect(absoluteUrl("   ", origin)).toBeNull();
    expect(absoluteUrl("/", origin)).toBe("https://tokentails.com/");
    expect(absoluteUrl("https://cdn.example.com/a.png", origin)).toBe("https://cdn.example.com/a.png");
    // A title passed as a path is not a URL: the tag is left out instead.
    expect(absoluteUrl("Token Tails - your page went meow", origin)).toBeNull();
    expect(absoluteUrl("javascript:alert(1)", origin)).toBeNull();
    expect(absoluteUrl(undefined, origin)).toBeNull();
  });

  it("reads the Twitter handle only when it is a real handle", () => {
    const { twitterHandle } = site();
    expect(twitterHandle(undefined)).toBeNull();
    expect(twitterHandle("undefined")).toBeNull();
    expect(twitterHandle("  ")).toBeNull();
    expect(twitterHandle("@tokentails")).toBe("tokentails");
    expect(twitterHandle("tokentails")).toBe("tokentails");
    expect(twitterHandle("https://x.com/tokentails")).toBe("tokentails");
    expect(twitterHandle("not a handle")).toBeNull();
  });
});

describe("buildSeoTags", () => {
  it("makes canonical, og:url and og:image absolute", () => {
    const tags = tagMap({ title: "Feed", description: "News", path: "/feed" });
    expect(tags.canonical).toBe("https://tokentails.com/feed");
    expect(tags["og:url"]).toBe("https://tokentails.com/feed");
    expect(tags["og:image"]).toBe("https://tokentails.com/logo/og-v2-1200x630.jpg");
    expect(tags["og:image:width"]).toBe("1200");
    expect(tags["og:image:height"]).toBe("630");
    Object.values(tags).forEach((value) => {
      expect(value).not.toMatch(/https?:\/[^/]/);
      expect(value).not.toContain("undefined");
    });
  });

  it("builds the article URL on the /feed route", () => {
    const tags = tagMap({ article: article() });
    expect(tags.canonical).toBe("https://tokentails.com/feed/news/winter-drive");
    expect(tags["og:type"]).toBe("article");
    expect(tags.title).toBe("Pink Paw's winter drive");
    expect(tags.description).toBe("How the heist helped.");
    expect(tags["og:image"]).toBe("https://cdn.example.com/drive.jpg");
    expect(tags["og:image:alt"]).toBe("Cats in a row");
    // An article image has no known size, so no dimensions are claimed.
    expect(tags["og:image:width"]).toBeUndefined();
  });

  it("keeps the legacy name prop but never builds a URL from the legacy page prop", () => {
    // `/feed` passed page="" (canonical became the homepage) and a feed category passed
    // page="/news" (a 404). Without `path` there is no canonical and no og:url.
    const category = tagMap({ name: "Category", page: "/news" });
    expect(category.title).toBe("Category");
    expect(category.canonical).toBeUndefined();
    expect(category["og:url"]).toBeUndefined();
    const feed = tagMap({ name: "Feed", page: "" });
    expect(feed.canonical).toBeUndefined();
    expect(feed["og:url"]).toBeUndefined();
    expect(tagMap({ name: "Feed", page: "/news", path: "/feed" }).canonical).toBe(
      "https://tokentails.com/feed",
    );
  });

  it("renders no per-page favicon (G14: one icon set in _document)", () => {
    const tags = load().buildSeoTags({ title: "Impact", path: "/impact" });
    expect(tags.filter((tag) => tag.kind === "link").map((tag) => tag.id)).toEqual(["canonical"]);
  });

  it("leaves canonical out when the legacy page is not a path", () => {
    const tags = tagMap({ name: "Not found", page: "Token Tails - your page went meow" });
    expect(tags.canonical).toBeUndefined();
    expect(tags["og:url"]).toBeUndefined();
  });

  it("sends no Twitter or Facebook tags unless configured", () => {
    const keys = load().buildSeoTags({ title: "Game", path: "/game" }).map((tag) => tag.key);
    expect(keys.filter((key) => key.startsWith("twitter:"))).toEqual([]);
    expect(keys.filter((key) => key.startsWith("fb:"))).toEqual([]);
  });

  it("sends Twitter tags with the handle when configured, never @undefined", () => {
    process.env.NEXT_PUBLIC_TWITTER_PAGE = "@tokentails";
    process.env.NEXT_PUBLIC_FB_APP_ID = "123";
    const tags = tagMap({ title: "Game", path: "/game", image: { url: "/og/game.png", width: 1200, height: 630 } });
    expect(tags["twitter:card"]).toBe("summary_large_image");
    expect(tags["twitter:site"]).toBe("@tokentails");
    expect(tags["twitter:creator"]).toBe("@tokentails");
    expect(tags["twitter:image"]).toBe("https://tokentails.com/og/game.png");
    expect(tags["og:image:width"]).toBe("1200");
    expect(tags["fb:app_id"]).toBe("123");
    expect(tags["fb:pages"]).toBeUndefined();
  });

  it("marks noindex pages and drops their canonical", () => {
    const tags = tagMap({ title: "Receipt", path: "/shelter-payouts/receipt", noindex: true });
    expect(tags.robots).toBe("noindex, follow");
    expect(tags.canonical).toBeUndefined();
    expect(tagMap({ title: "Home", path: "/" }).robots).toBe("index, follow");
  });

  it("uses one key per tag", () => {
    process.env.NEXT_PUBLIC_TWITTER_PAGE = "tokentails";
    const keys = load().buildSeoTags({ article: article() }).map((tag) => tag.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("<SeoHead />", () => {
  it("renders absolute, keyed tags into the document head", () => {
    const { SeoHead } = load();
    render(<SeoHead title="Catnip Heist" description="Sneak in, free the cats." path="/heist" />);
    const content = (selector: string) =>
      document.head.querySelector(selector)?.getAttribute("content") ??
      document.querySelector(selector)?.getAttribute("content");
    expect(document.title).toBe("Catnip Heist");
    expect(content('meta[property="og:url"]')).toBe("https://tokentails.com/heist");
    expect(content('meta[property="og:image"]')).toBe("https://tokentails.com/logo/og-v2-1200x630.jpg");
    expect(content('meta[name="description"]')).toBe("Sneak in, free the cats.");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://tokentails.com/heist");
    expect(document.querySelector('meta[name^="twitter:"]')).toBeNull();
    expect(document.documentElement.innerHTML).not.toContain("@undefined");
    expect(document.documentElement.innerHTML).not.toMatch(/https:\/[^/]/);
  });

  it("adds the article tags for an article", () => {
    const { SeoHead } = load();
    render(<SeoHead article={article()} />);
    expect(
      document.querySelector('meta[property="article:section"]')?.getAttribute("content"),
    ).toBe("News");
    expect(
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    ).toBe("2026-09-01T00:00:00.000Z");
    expect(document.querySelector('meta[property="article:tag"]')).toBeNull();
  });

  it("renders every tag as a direct element child of <Head>", () => {
    // Next's client head manager syncs only title/meta/link/etc. elements that are direct
    // children of <Head>; a nested component (the old <ArticleMeta/>) is skipped on navigation.
    const { SeoHead } = load();
    const tree = SeoHead({ article: article() }) as React.ReactElement<{ children: React.ReactNode }>;
    const children = React.Children.toArray(tree.props.children) as React.ReactElement[];
    expect(children.length).toBeGreaterThan(0);
    children.forEach((child) => expect(typeof child.type).toBe("string"));
    const props = children.map((child) => (child.props as { property?: string }).property);
    expect(props).toEqual(
      expect.arrayContaining([
        "article:published_time",
        "article:modified_time",
        "article:author",
        "article:section",
      ]),
    );
    expect(props).not.toContain("article:tag");
  });
});
