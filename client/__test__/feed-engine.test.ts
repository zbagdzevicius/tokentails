/**
 * The blog engine (lib/feed/engine.ts): loading repo Markdown, frontmatter validation (a bad file
 * fails the build loudly), directives, TOC, reading time, related articles, app safety.
 * Fixtures: __test__/fixtures/feed (never the real client/content/feed).
 */
import path from "path";
import {
  contractWarnings,
  FeedValidationError,
  forApp,
  loadFeed,
  localImageSize,
  neighboursFor,
  parseArticle,
  readingMinutes,
  relatedFor,
  renderBody,
  resetFeedCache,
  slugifyHeading,
  splitFrontmatter,
  unlinkMissing,
  validateFrontmatter,
  visibleArticles,
  visibleCategories,
} from "@/lib/feed/engine";

const FIXTURES = path.join(__dirname, "fixtures", "feed");
const load = () => loadFeed(FIXTURES, { cache: false });

const FRONT = `---
title: "A valid title"
description: "${"A description long enough to pass the hard limit of the engine, written for the tests only, and nothing else at all here."}"
excerpt: "Short."
slug: test-article
category: cats
publishedAt: 2026-01-01
updatedAt: 2026-02-01
author: Token Tails team
heroImage: { src: /logo/shelter.webp, alt: "A shelter", width: 800, height: 735 }
keywords: [cats]
intent: learn
cta: heist
---
`;

const article = (body: string, front = FRONT) => parseArticle(`${front}${body}`, "test-article");

beforeEach(() => resetFeedCache());

describe("loadFeed", () => {
  it("loads every fixture, newest first, with summaries and paths", () => {
    const { articles } = load();
    expect(articles.map((a) => a.slug)).toEqual(["sample-heist-guide", "sample-cat-care", "sample-shelter-news"]);
    const guide = articles[0];
    expect(guide.path).toBe("/feed/games/sample-heist-guide");
    expect(guide.publishedAt).toBe("2026-10-10");
    expect(guide.seoTitle).toBe("Sample Cat Stealth Guide");
    expect(guide.faq).toHaveLength(2);
    expect(guide.sources[0]).toEqual({ label: "Payout ledger", url: "/shelter-payouts" });
    expect(guide.claims).toEqual(["C-004"]);
  });

  it("is an empty blog when the folder is missing or empty", () => {
    expect(loadFeed(path.join(FIXTURES, "does-not-exist"), { cache: false }).articles).toEqual([]);
  });

  it("reports contract style notes as warnings, never errors", () => {
    const { warnings } = load();
    expect(warnings.some((w) => /words/.test(w.message))).toBe(true);
  });

  it("throws one error listing every problem of every bad file", () => {
    const fs = jest.requireActual<typeof import("fs")>("fs");
    const os = jest.requireActual<typeof import("os")>("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-"));
    fs.writeFileSync(path.join(dir, "bad-one.md"), "no frontmatter at all");
    fs.writeFileSync(path.join(dir, "bad-two.md"), FRONT.replace("slug: test-article", "slug: other") + "Body.");
    let error: unknown;
    try {
      loadFeed(dir, { cache: false });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FeedValidationError);
    const problems = (error as FeedValidationError).problems.join("\n");
    expect(problems).toMatch(/bad-one\.md: no frontmatter/);
    expect(problems).toMatch(/bad-two\.md: "slug" \(other\) must equal the file name/);
  });
});

describe("validateFrontmatter", () => {
  const valid = () => ({
    title: "T",
    description: "x".repeat(150),
    excerpt: "E",
    slug: "a-b",
    category: "games",
    publishedAt: "2026-10-01",
    updatedAt: "2026-10-19",
    author: "Token Tails team",
    heroImage: { src: "https://cdn.example.test/a.jpeg", alt: "Alt", width: 10, height: 10 },
    keywords: ["k"],
    intent: "play",
    cta: "heist",
  });

  it("accepts the contract", () => {
    expect(validateFrontmatter(valid(), "a-b").problems).toEqual([]);
  });

  it.each([
    ["unknown field", { tags: ["x"] }, /unknown field "tags"/],
    ["bad category", { category: "cats-nft" }, /"category" must be one of/],
    ["bad cta", { cta: "airdrop" }, /"cta" must be one of/],
    ["bad intent", { intent: "earn" }, /"intent" must be one of/],
    ["bad author", { author: "Someone" }, /"author" must be one of/],
    ["bad date", { publishedAt: "yesterday" }, /"publishedAt" must be an ISO date/],
    ["updated before published", { updatedAt: "2026-09-01" }, /before "publishedAt"/],
    ["image without size", { heroImage: { src: "/a.png", alt: "A" } }, /positive integers/],
    ["image without alt", { heroImage: { src: "/a.png", alt: "", width: 1, height: 1 } }, /heroImage.alt/],
    ["image on another scheme", { heroImage: { src: "javascript:alert(1)", alt: "A", width: 1, height: 1 } }, /heroImage.src/],
    ["short description", { description: "too short" }, /"description" is 9 characters/],
    ["related to itself", { related: ["a-b"] }, /lists the article itself/],
    ["bad claim id", { claims: ["X-1"] }, /registry ids/],
    ["bad source", { sources: [{ label: "x", url: "ftp://x" }] }, /"sources"/],
    ["empty keywords", { keywords: [] }, /"keywords"/],
  ])("rejects %s", (_name, patch, message) => {
    const { value, problems } = validateFrontmatter({ ...valid(), ...patch }, "a-b");
    expect(value).toBeNull();
    expect(problems.join("\n")).toMatch(message);
  });

  it("keeps YAML dates as ISO strings", () => {
    const { value } = validateFrontmatter({ ...valid(), publishedAt: new Date("2025-03-10T00:00:00Z") }, "a-b");
    expect(value?.publishedAt).toBe("2025-03-10");
  });
});

describe("body directives", () => {
  it("renders cta, payouts-live and key-takeaways as their own segments", () => {
    const [guide] = load().articles;
    expect(guide.segments.map((s) => s.type)).toEqual(["html", "key-takeaways", "html", "cta", "html", "payouts-live", "html"]);
    expect(guide.segments.find((s) => s.type === "cta")).toEqual({ type: "cta", cta: "heist" });
    const takeaways = guide.segments.find((s) => s.type === "key-takeaways");
    expect(takeaways && "html" in takeaways && takeaways.html).toMatch(/<li>Watch the guards.<\/li>/);
  });

  it("drops author notes and never renders raw HTML", () => {
    const html = load()
      .articles[0].segments.map((s) => ("html" in s ? s.html : ""))
      .join("");
    expect(html).not.toMatch(/note for editors/);
    const { segments } = renderBody("Hello <script>alert(1)</script> there.\n\nTwo.");
    expect(segments[0]).toEqual({ type: "html", html: expect.stringContaining("&lt;script&gt;") });
  });

  it.each([
    ["a cta in the first two paragraphs", "One.\n\n<!-- cta:heist -->\n\nTwo.", /after the first 2 paragraphs/],
    ["more than two cta cards", "One.\n\nTwo.\n\n<!-- cta:heist -->\n\n<!-- cta:game -->\n\n<!-- cta:rave -->", /3 cta cards/],
    ["an unknown cta", "One.\n\nTwo.\n\n<!-- cta:casino -->", /unknown cta "casino"/],
    ["a malformed directive", "One.\n\nTwo.\n\n<!-- cta: heist -->", /malformed directive/],
    ["key-takeaways without a list", "<!-- key-takeaways -->\n\nJust text.", /must be followed by a bullet list/],
    ["an h1 in the body", "# Second title\n\nText.", /h1/],
    ["two payouts widgets", "A.\n\n<!-- payouts-live -->\n\n<!-- payouts-live -->", /2 payouts-live/],
  ])("rejects %s", (_name, body, message) => {
    const { problems } = article(body);
    expect(problems.join("\n")).toMatch(message);
  });

  it("leaves directives inside code fences alone", () => {
    const { article: a, problems } = article("One.\n\nTwo.\n\n```md\n<!-- cta:casino -->\n```\n");
    expect(problems).toEqual([]);
    expect(a?.segments).toHaveLength(1);
  });

  it("accepts a cta after two paragraphs", () => {
    expect(renderBody("One.\n\nTwo.\n\n<!-- cta:heist -->").problems).toEqual([]);
  });
});

describe("headings, TOC and reading time", () => {
  it("gives every h2/h3 a unique id and lists them in order", () => {
    const [guide] = load().articles;
    expect(guide.toc).toEqual([
      { id: "how-do-the-guards-work", text: "How do the guards work?", level: 2 },
      { id: "vision-cones", text: "Vision cones", level: 3 },
      { id: "how-do-i-open-the-vault", text: "How do I open the vault?", level: 2 },
      { id: "how-do-i-open-the-vault-2", text: "How do I open the vault?", level: 2 },
      // The FAQ renders after the body: the contents list ends with it.
      { id: "faq", text: "Frequently asked questions", level: 2 },
    ]);
    const html = guide.segments.map((s) => ("html" in s ? s.html : "")).join("");
    expect(html).toMatch(/<h2 id="how-do-the-guards-work">/);
    expect(html).toMatch(/<h2 id="how-do-i-open-the-vault-2">/);
  });

  it("slugifies accents and punctuation", () => {
    expect(slugifyHeading("Rožinė Pėdutė: who are they?")).toBe("rozine-pedute-who-are-they");
    expect(slugifyHeading("!!!")).toBe("section");
  });

  it("wraps tables for horizontal scroll and opens external links in a new tab", () => {
    const html = load()
      .articles[0].segments.map((s) => ("html" in s ? s.html : ""))
      .join("");
    expect(html).toMatch(/<div class="feed-table" role="region" aria-label="Table" tabindex="0"><table>/);
    expect(html).toMatch(/<a href="https:\/\/github.com\/zbagdzevicius\/tokentails" target="_blank" rel="noopener noreferrer">/);
    expect(html).toMatch(/<a href="\/shelter-payouts">/);
  });

  it("reads at 230 words a minute, at least one", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(230 * 7)).toBe(7);
  });
});

describe("relations and builds", () => {
  it("puts frontmatter related first, then the closest by section and keywords", () => {
    const { articles } = load();
    const [guide, care, news] = articles;
    expect(relatedFor(guide, articles).map((a) => a.slug)).toEqual(["sample-shelter-news", "sample-cat-care"]);
    // sample-cat-care shares "browser game" with the guide.
    expect(relatedFor(care, articles)[0].slug).toBe("sample-heist-guide");
    expect(relatedFor(news, articles, 1)).toHaveLength(1);
  });

  it("links older and newer articles within a section only", () => {
    const { articles } = load();
    expect(neighboursFor(articles[0], articles)).toEqual({ prev: null, next: null });
  });

  it("leaves coin, chain and wallet articles and web-only sections out of app builds", () => {
    const store = load();
    expect(store.articles.find((a) => a.slug === "sample-shelter-news")?.appSafe).toBe(false);
    expect(visibleArticles(store, false)).toHaveLength(3);
    expect(visibleArticles(store, true).map((a) => a.slug)).toEqual(["sample-heist-guide", "sample-cat-care"]);
    expect(visibleCategories(true).map((c) => c.slug)).toEqual(["games", "cats", "news"]);
  });
});

describe("review fixes", () => {
  it("only asks for a seoTitle when there is none", () => {
    const fm = validateFrontmatter(splitFrontmatter(FRONT)!.data, "test-article").value!;
    const long = { ...fm, title: "x".repeat(70) };
    expect(contractWarnings(long, 800).join(" ")).toMatch(/set seoTitle/);
    expect(contractWarnings({ ...long, seoTitle: "Short" }, 800).join(" ")).not.toMatch(/set seoTitle/);
    expect(contractWarnings({ ...fm, heroImage: { ...fm.heroImage, src: "https://cdn.example.com/a.png" } }, 800).join(" ")).toMatch(/remote PNG/);
  });

  it("reads the real size of local images and gives inline images their box", () => {
    expect(localImageSize("/logo/shelter.webp")).toEqual({ width: 800, height: 735 });
    expect(localImageSize("/landing/heist-reel-poster-v1.jpg")).toEqual({ width: 1280, height: 720 });
    expect(localImageSize("https://example.com/a.png")).toBeNull();
    const html = renderBody("One.\n\n![A shelter](/logo/shelter.webp)").segments.map((x) => ("html" in x ? x.html : "")).join("");
    expect(html).toMatch(/<img src="\/logo\/shelter.webp" alt="A shelter" width="800" height="735"/);
  });

  it("keeps an article that links a web-only page or uses a pruned image out of app builds", () => {
    expect(article("One.\n\nPlay [Bad Cat Daily](/badcat).").article?.appSafe).toBe(false);
    expect(article("One.\n\n![Poster](/landing/badcat/badcat-poster-v1.webp)").article?.appSafe).toBe(false);
    expect(article("One.\n\nSee [the payouts](/shelter-payouts) and [the game](/game).").article?.appSafe).toBe(true);
  });

  it("turns links to blog pages an app build does not ship into text", () => {
    const html = '<p><a href="/feed/games/a">A</a> and <a href="/feed/news/b">B</a> and <a href="/game">C</a></p>';
    expect(unlinkMissing(html, new Set(["/feed/games/a"]))).toBe('<p><a href="/feed/games/a">A</a> and <span>B</span> and <a href="/game">C</a></p>');
    const [guide] = load().articles;
    const app = forApp(guide, new Set());
    expect(app.segments.filter((x) => "html" in x).map((x) => ("html" in x ? x.html : "")).join("")).not.toMatch(/href="\/feed\//);
  });

  it("never puts the article's own hero, or one hero twice, under Keep reading", () => {
    const { articles } = load();
    const [guide, care, news] = articles;
    const same = [guide, { ...care, heroImage: guide.heroImage }, news];
    expect(relatedFor(same[0], same).map((a) => a.slug)).toEqual(["sample-shelter-news"]);
  });

  it("notes a hero image used by more than two articles", () => {
    const fs = jest.requireActual<typeof import("fs")>("fs");
    const os = jest.requireActual<typeof import("os")>("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-hero-"));
    for (const slug of ["a-one", "a-two", "a-three"]) {
      fs.writeFileSync(path.join(dir, `${slug}.md`), `${FRONT.replace("slug: test-article", `slug: ${slug}`)}One.\n`);
    }
    const warnings = loadFeed(dir, { cache: false }).warnings.filter((w) => /hero of 3 articles/.test(w.message));
    expect(warnings).toHaveLength(3);
  });
});
