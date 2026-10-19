/**
 * The blog engine (docs/CLIENT.md "Blog"): reads client/content/feed/*.md at build time, validates
 * the frontmatter, renders the Markdown and computes everything the pages need (reading time, TOC,
 * related articles, prev/next, redirects, app safety).
 *
 * Server side only. It runs in getStaticProps / getStaticPaths, and in plain Node from
 * next.config.js (redirects), next-sitemap.config.js and scripts/build-feed-rss.mjs. Node loads this
 * file through its built-in type stripping (Node >= 22.18), so it keeps to erasable TypeScript only
 * (no enums, namespaces or parameter properties), imports nothing through the `@/` alias and reads
 * its JSON data with `fs`. Never import it from a component: import its types with `import type`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";
import { parse as parseYaml } from "yaml";

// ---------- data ----------

export interface FeedCategory {
  slug: string;
  name: string;
  /** The category page's h1. */
  headline: string;
  seoTitle: string;
  description: string;
  intro: string;
  /** The closing call to action of the category page (a `cta` value). */
  cta: string;
  /** Old category slugs that 301 to this one. */
  legacy: string[];
  /** About payments, coins or code: app builds leave the category and its articles out. */
  webOnly: boolean;
}

interface Taxonomy {
  categories: FeedCategory[];
  ctas: string[];
  intents: string[];
  authors: string[];
}

export interface LegacyRedirect {
  from: string;
  to: string;
}

/** Root of the client package: Next, Jest, next-sitemap and the scripts all run from it. */
export const clientRoot = (): string => process.env.FEED_CLIENT_ROOT || process.cwd();

export const DEFAULT_CONTENT_DIR = (): string => join(clientRoot(), "content", "feed");

let taxonomyCache: Taxonomy | null = null;
export function taxonomy(): Taxonomy {
  if (!taxonomyCache) {
    taxonomyCache = JSON.parse(readFileSync(join(clientRoot(), "lib", "feed", "taxonomy.json"), "utf8")) as Taxonomy;
  }
  return taxonomyCache;
}

export function legacyRedirectTable(): LegacyRedirect[] {
  return JSON.parse(readFileSync(join(clientRoot(), "lib", "feed", "legacy-redirects.json"), "utf8")) as LegacyRedirect[];
}

export const categories = (): FeedCategory[] => taxonomy().categories;
export const categoryBySlug = (slug: string): FeedCategory | null =>
  categories().find((c) => c.slug === slug) ?? null;

// ---------- types ----------

export interface HeroImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface FeedFrontmatter {
  title: string;
  seoTitle?: string;
  description: string;
  excerpt: string;
  slug: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  heroImage: HeroImage;
  keywords: string[];
  intent: string;
  cta: string;
  faq?: FaqItem[];
  sources?: SourceLink[];
  related?: string[];
  legacySlugs?: string[];
  claims?: string[];
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export type FeedSegment =
  | { type: "html"; html: string }
  | { type: "cta"; cta: string }
  | { type: "payouts-live" }
  | { type: "key-takeaways"; html: string };

/** What cards, lists, the sitemap and the RSS need: no body. */
export interface FeedSummary {
  slug: string;
  category: string;
  title: string;
  seoTitle: string | null;
  description: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  heroImage: HeroImage;
  keywords: string[];
  intent: string;
  cta: string;
  readingMinutes: number;
  path: string;
  /** False when the text names a coin, chain, wallet or explorer: app builds leave it out (copy-lint R10). */
  appSafe: boolean;
}

export interface FeedArticle extends FeedSummary {
  segments: FeedSegment[];
  toc: TocItem[];
  wordCount: number;
  faq: FaqItem[];
  sources: SourceLink[];
  related: string[];
  legacySlugs: string[];
  claims: string[];
  /** Plain text of the body, for search and the RSS description. */
  plainText: string;
}

export interface FeedWarning {
  file: string;
  message: string;
}

export class FeedValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid blog content (client/content/feed):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "FeedValidationError";
    this.problems = problems;
    // ES5 targets (ts-jest) break `instanceof` on Error subclasses without this.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------- frontmatter ----------

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const CLAIM_ID = /^[CFLP]-[A-Za-z0-9-]+$/;
const KNOWN_KEYS = new Set([
  "title",
  "seoTitle",
  "description",
  "excerpt",
  "slug",
  "category",
  "publishedAt",
  "updatedAt",
  "author",
  "heroImage",
  "keywords",
  "intent",
  "cta",
  "faq",
  "sources",
  "related",
  "legacySlugs",
  "claims",
]);

/** Hard limits (the build fails). The contract's ideal ranges are warnings (see `contractWarnings`). */
export const LIMITS = Object.freeze({
  title: 100,
  seoTitle: 70,
  descriptionMin: 70,
  descriptionMax: 200,
  excerpt: 320,
  ctaDirectives: 2,
  keywordsMax: 8,
  faqMax: 8,
});

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isUrlOrPath = (v: string) => /^https:\/\//.test(v) || /^http:\/\//.test(v) || /^\/(?!\/)/.test(v);

/** YAML turns unquoted dates into Date objects: keep them as ISO strings. */
function dateString(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "string" && ISO_DATE.test(v.trim()) && !Number.isNaN(Date.parse(v.trim()))) return v.trim();
  return null;
}

/** Splits `---\nyaml\n---\nbody`. */
export function splitFrontmatter(source: string): { data: unknown; body: string } | null {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return null;
  return { data: parseYaml(m[1]), body: text.slice(m[0].length) };
}

/**
 * Checks one file's frontmatter against the contract. Returns the typed frontmatter and the
 * problems (empty when valid). `fileSlug` is the file name without `.md`.
 */
export function validateFrontmatter(data: unknown, fileSlug: string): { value: FeedFrontmatter | null; problems: string[] } {
  const problems: string[] = [];
  const tax = taxonomy();
  if (!isRecord(data)) return { value: null, problems: ["frontmatter is missing or not a mapping"] };
  for (const key of Object.keys(data)) if (!KNOWN_KEYS.has(key)) problems.push(`unknown field "${key}"`);

  const str = (key: string, max?: number): string => {
    const v = data[key];
    if (!nonEmpty(v)) {
      problems.push(`"${key}" is required (a non-empty string)`);
      return "";
    }
    if (max && v.trim().length > max) problems.push(`"${key}" is ${v.trim().length} characters (at most ${max})`);
    return v.trim();
  };
  const optStr = (key: string, max?: number): string | undefined => (data[key] === undefined ? undefined : str(key, max));

  const title = str("title", LIMITS.title);
  const seoTitle = optStr("seoTitle", LIMITS.seoTitle);
  const description = str("description");
  if (description && (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax)) {
    problems.push(`"description" is ${description.length} characters (${LIMITS.descriptionMin}-${LIMITS.descriptionMax}; aim for 140-158)`);
  }
  const excerpt = str("excerpt", LIMITS.excerpt);
  const slug = str("slug");
  if (slug && !KEBAB.test(slug)) problems.push(`"slug" must be kebab-case, got "${slug}"`);
  if (slug && slug !== fileSlug) problems.push(`"slug" (${slug}) must equal the file name (${fileSlug}.md)`);
  const category = str("category");
  if (category && !tax.categories.some((c) => c.slug === category)) {
    problems.push(`"category" must be one of ${tax.categories.map((c) => c.slug).join(", ")}, got "${category}"`);
  }
  const publishedAt = dateString(data.publishedAt);
  if (!publishedAt) problems.push(`"publishedAt" must be an ISO date (2026-10-19 or 2026-10-19T10:00:00Z)`);
  const updatedAt = dateString(data.updatedAt);
  if (!updatedAt) problems.push(`"updatedAt" must be an ISO date`);
  if (publishedAt && updatedAt && Date.parse(updatedAt) < Date.parse(publishedAt)) {
    problems.push(`"updatedAt" (${updatedAt}) is before "publishedAt" (${publishedAt})`);
  }
  const author = str("author");
  if (author && !tax.authors.includes(author)) problems.push(`"author" must be one of: ${tax.authors.join(", ")}`);

  let heroImage: HeroImage | null = null;
  if (!isRecord(data.heroImage)) {
    problems.push(`"heroImage" is required: { src, alt, width, height }`);
  } else {
    const h = data.heroImage;
    for (const key of Object.keys(h)) if (!["src", "alt", "width", "height"].includes(key)) problems.push(`unknown field "heroImage.${key}"`);
    const okSrc = nonEmpty(h.src) && isUrlOrPath(h.src.trim());
    if (!okSrc) problems.push(`"heroImage.src" must be an https URL or a root path under client/public`);
    if (!nonEmpty(h.alt)) problems.push(`"heroImage.alt" is required (describe the image)`);
    const w = Number(h.width);
    const hh = Number(h.height);
    if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(hh) || hh <= 0) {
      problems.push(`"heroImage.width" and "heroImage.height" must be positive integers (the real pixel size)`);
    }
    if (okSrc && nonEmpty(h.alt)) heroImage = { src: String(h.src).trim(), alt: String(h.alt).trim(), width: w, height: hh };
  }

  let keywords: string[] = [];
  if (!Array.isArray(data.keywords) || !data.keywords.length || !data.keywords.every(nonEmpty)) {
    problems.push(`"keywords" must be a non-empty list of strings (primary keyword first)`);
  } else {
    keywords = (data.keywords as string[]).map((k) => k.trim());
    if (keywords.length > LIMITS.keywordsMax) problems.push(`"keywords" has ${keywords.length} entries (at most ${LIMITS.keywordsMax})`);
  }

  const intent = str("intent");
  if (intent && !tax.intents.includes(intent)) problems.push(`"intent" must be one of ${tax.intents.join(", ")}, got "${intent}"`);
  const cta = str("cta");
  if (cta && !tax.ctas.includes(cta)) problems.push(`"cta" must be one of ${tax.ctas.join(", ")}, got "${cta}"`);

  let faq: FaqItem[] | undefined;
  if (data.faq !== undefined) {
    if (!Array.isArray(data.faq) || !data.faq.every((f) => isRecord(f) && nonEmpty(f.q) && nonEmpty(f.a))) {
      problems.push(`"faq" must be a list of { q, a } with non-empty strings`);
    } else {
      faq = (data.faq as { q: string; a: string }[]).map((f) => ({ q: f.q.trim(), a: f.a.trim() }));
      if (faq.length > LIMITS.faqMax) problems.push(`"faq" has ${faq.length} entries (at most ${LIMITS.faqMax})`);
    }
  }

  let sources: SourceLink[] | undefined;
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources) || !data.sources.every((s) => isRecord(s) && nonEmpty(s.label) && nonEmpty(s.url) && isUrlOrPath(String(s.url).trim()))) {
      problems.push(`"sources" must be a list of { label, url } (url: https://… or a root path)`);
    } else {
      sources = (data.sources as { label: string; url: string }[]).map((s) => ({ label: s.label.trim(), url: s.url.trim() }));
    }
  }

  const slugList = (key: "related" | "legacySlugs", allowPath: boolean): string[] | undefined => {
    const v = data[key];
    if (v === undefined) return undefined;
    const ok = Array.isArray(v) && v.every((s) => nonEmpty(s) && (KEBAB.test(s.trim()) || (allowPath && /^\/feed\/[a-z0-9-]+\/[a-z0-9-]+$/.test(s.trim()))));
    if (!ok) {
      problems.push(`"${key}" must be a list of kebab-case slugs${allowPath ? " (or /feed/<category>/<slug> paths)" : ""}`);
      return undefined;
    }
    return (v as string[]).map((s) => s.trim());
  };
  const related = slugList("related", false);
  if (related && slug && related.includes(slug)) problems.push(`"related" lists the article itself`);
  const legacySlugs = slugList("legacySlugs", true);

  let claims: string[] | undefined;
  if (data.claims !== undefined) {
    if (!Array.isArray(data.claims) || !data.claims.every((c) => typeof c === "string" && CLAIM_ID.test(c))) {
      problems.push(`"claims" must be a list of registry ids such as C-004 or F-026`);
    } else {
      claims = data.claims as string[];
    }
  }

  if (problems.length || !heroImage || !publishedAt || !updatedAt) return { value: null, problems };
  return {
    value: {
      title,
      ...(seoTitle ? { seoTitle } : {}),
      description,
      excerpt,
      slug,
      category,
      publishedAt,
      updatedAt,
      author,
      heroImage,
      keywords,
      intent,
      cta,
      ...(faq ? { faq } : {}),
      ...(sources ? { sources } : {}),
      ...(related ? { related } : {}),
      ...(legacySlugs ? { legacySlugs } : {}),
      ...(claims ? { claims } : {}),
    },
    problems,
  };
}

/** The contract's ideal ranges: printed during the build, never fatal. */
export function contractWarnings(fm: FeedFrontmatter, wordCount: number): string[] {
  const out: string[] = [];
  if (fm.title.length > 60) out.push(`title is ${fm.title.length} characters (ideal at most 60; set seoTitle)`);
  if (fm.seoTitle && fm.seoTitle.length > 60) out.push(`seoTitle is ${fm.seoTitle.length} characters (ideal at most 60)`);
  if (fm.description.length < 140 || fm.description.length > 158) out.push(`description is ${fm.description.length} characters (ideal 140-158)`);
  const long = fm.intent !== "news";
  if (long && (wordCount < 700 || wordCount > 1600)) out.push(`${wordCount} words (guides: 700-1,600)`);
  if (!long && (wordCount < 300 || wordCount > 700)) out.push(`${wordCount} words (news: 300-700)`);
  return out;
}

// ---------- Markdown ----------

/** Body directives: `<!-- cta:heist -->`, `<!-- payouts-live -->`, `<!-- key-takeaways -->`. */
const DIRECTIVE = /^\s*<!--\s*(cta:[a-z-]+|payouts-live|key-takeaways)\s*-->\s*$/;
/** Looks like a directive but is not one of the forms above: a typo the build must catch. */
const DIRECTIVE_LIKE = /^\s*<!--\s*(cta|payouts|key)\b/i;
const COMMENT_LINE = /^\s*<!--[\s\S]*?-->\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** "Hello, world: 2!" -> "hello-world-2". */
export function slugifyHeading(text: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
  return s || "section";
}

function createMarkdown(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

  md.renderer.rules.heading_open = (list, idx, options, env, self) => {
    const token = list[idx];
    const inline = list[idx + 1];
    const text = inline?.children?.map((c) => c.content).join("") ?? inline?.content ?? "";
    const used: Map<string, number> = env.ids;
    const base = slugifyHeading(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const id = n ? `${base}-${n + 1}` : base;
    token.attrSet("id", id);
    const level = Number(token.tag.slice(1));
    if (level === 2 || level === 3) (env.toc as TocItem[]).push({ id, text, level });
    return self.renderToken(list, idx, options);
  };

  md.renderer.rules.link_open = (list, idx, options, _env, self) => {
    const token = list[idx];
    const href = token.attrGet("href") || "";
    if (/^https?:\/\//i.test(href) && !/^https:\/\/(www\.)?tokentails\.com(\/|$)/i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return self.renderToken(list, idx, options);
  };

  md.renderer.rules.image = (list, idx, options, env, self) => {
    const token = list[idx];
    token.attrSet("alt", self.renderInlineAsText(token.children || [], options, env));
    token.attrSet("loading", "lazy");
    token.attrSet("decoding", "async");
    return self.renderToken(list, idx, options);
  };

  // Wide tables scroll inside their own box, never the page.
  md.renderer.rules.table_open = (list, idx, options, _env, self) =>
    `<div class="feed-table" role="region" aria-label="Table" tabindex="0">${self.renderToken(list, idx, options)}`;
  md.renderer.rules.table_close = (list, idx, options, _env, self) => `${self.renderToken(list, idx, options)}</div>`;

  return md;
}

let mdCache: MarkdownIt | null = null;
const markdown = () => (mdCache ??= createMarkdown());

interface RenderEnv {
  ids: Map<string, number>;
  toc: TocItem[];
}

/** Top-level paragraphs in a Markdown chunk (CTA placement rule). */
function countParagraphs(chunk: string): number {
  const tokens = markdown().parse(chunk, { ids: new Map(), toc: [] });
  return tokens.filter((t) => t.type === "paragraph_open" && t.level === 0).length;
}

export interface ParsedBody {
  segments: FeedSegment[];
  toc: TocItem[];
  plainText: string;
  wordCount: number;
  problems: string[];
}

/** Renders a body into segments: Markdown HTML between the directive components. */
export function renderBody(body: string, ctas: string[] = taxonomy().ctas): ParsedBody {
  const problems: string[] = [];
  const env: RenderEnv = { ids: new Map(), toc: [] };
  const segments: FeedSegment[] = [];
  const lines = body.split("\n");
  let chunk: string[] = [];
  let inFence = false;
  let paragraphsSoFar = 0;
  let ctaCount = 0;
  let payoutsCount = 0;

  const flush = () => {
    const text = chunk.join("\n");
    chunk = [];
    if (!text.trim()) return;
    paragraphsSoFar += countParagraphs(text);
    const html = markdown().render(text, env).trim();
    if (html) segments.push({ type: "html", html });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence || FENCE.test(line)) {
      chunk.push(line);
      continue;
    }
    if (/^#\s/.test(line)) problems.push(`line ${i + 1}: "# " is the page title (h1); start body headings at "##"`);
    const m = DIRECTIVE.exec(line);
    if (!m) {
      if (DIRECTIVE_LIKE.test(line)) problems.push(`line ${i + 1}: malformed directive ${line.trim()} (use <!-- cta:heist -->, <!-- payouts-live --> or <!-- key-takeaways -->)`);
      // Any other HTML comment is an author note: dropped, never rendered.
      if (!COMMENT_LINE.test(line)) chunk.push(line);
      continue;
    }
    flush();
    const name = m[1];
    if (name.startsWith("cta:")) {
      const cta = name.slice(4);
      ctaCount += 1;
      if (!ctas.includes(cta)) problems.push(`line ${i + 1}: unknown cta "${cta}" (one of ${ctas.join(", ")})`);
      if (paragraphsSoFar < 2) problems.push(`line ${i + 1}: a cta card must come after the first 2 paragraphs`);
      segments.push({ type: "cta", cta });
    } else if (name === "payouts-live") {
      payoutsCount += 1;
      segments.push({ type: "payouts-live" });
    } else {
      // key-takeaways: the bullet list that follows (blank lines before it are skipped).
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const list: string[] = [];
      while (j < lines.length && (LIST_ITEM.test(lines[j]) || (list.length && /^\s{2,}\S/.test(lines[j])))) {
        list.push(lines[j]);
        j++;
      }
      if (!list.length) {
        problems.push(`line ${i + 1}: <!-- key-takeaways --> must be followed by a bullet list`);
      } else {
        segments.push({ type: "key-takeaways", html: markdown().render(list.join("\n"), { ids: new Map(), toc: [] }).trim() });
      }
      i = j - 1;
    }
  }
  if (inFence) problems.push("a code fence is never closed");
  flush();
  if (ctaCount > LIMITS.ctaDirectives) problems.push(`${ctaCount} cta cards (at most ${LIMITS.ctaDirectives})`);
  if (payoutsCount > 1) problems.push(`${payoutsCount} payouts-live widgets (at most 1)`);

  const plainText = toPlainText(body);
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  return { segments, toc: env.toc, plainText, wordCount, problems };
}

/** Markdown to plain words (search, word count, RSS). */
export function toPlainText(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|~]/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minutes at 230 words a minute, at least 1. */
export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 230));

// ---------- app safety (copy-lint R10) ----------

/**
 * The app-build words of tools/copy-lint/lib/rules.mjs APP_WORDS (R10). The Capacitor app must not
 * show coins, chains, wallets or explorers; an article that names one ships on the web only.
 */
export const APP_WORDS: readonly RegExp[] = [
  /\bUSDC\b/,
  /\b0x[0-9a-fA-F]{6,}/,
  /\b(?:block|chain|tx)[\s-]?explorers?\b|\b(?:on|in|the|an?|via)\s+explorers?\b|\bexplorers?\s+(?:links?|pages?|url)\b|\b(?:etherscan|arcscan|blockscout|stellar\.expert|stellarchain)\b/i,
  /\bwallets?\b/i,
  /\b(?:Stellar|Soroban|SEI|Ethereum|Solana|SKALE|Polygon|Mantle|Arbitrum|Monad|Mezo|Avalanche)\b|\bArc\b(?!\w)/,
  /\bon-?chain\b/i,
  // Not in R10, but the same rule in spirit: stablecoins and crypto stay on the web.
  /\b(?:EURC|USDG|stablecoins?|crypto(?:currency)?|blockchain)\b/i,
];

export const isAppSafeText = (text: string): boolean => !APP_WORDS.some((re) => re.test(text));

// ---------- loading ----------

export const articlePathFor = (category: string, slug: string) => `/feed/${category}/${slug}`;

function toSummary(fm: FeedFrontmatter, words: number, appSafe: boolean): FeedSummary {
  return {
    slug: fm.slug,
    category: fm.category,
    title: fm.title,
    seoTitle: fm.seoTitle ?? null,
    description: fm.description,
    excerpt: fm.excerpt,
    publishedAt: fm.publishedAt,
    updatedAt: fm.updatedAt,
    author: fm.author,
    heroImage: fm.heroImage,
    keywords: fm.keywords,
    intent: fm.intent,
    cta: fm.cta,
    readingMinutes: readingMinutes(words),
    path: articlePathFor(fm.category, fm.slug),
    appSafe,
  };
}

/** Parses one file. Throws nothing: problems come back as strings. */
export function parseArticle(source: string, fileSlug: string): { article: FeedArticle | null; problems: string[]; warnings: string[] } {
  let split: { data: unknown; body: string } | null;
  try {
    split = splitFrontmatter(source);
  } catch (e) {
    return { article: null, problems: [`frontmatter is not valid YAML: ${(e as Error).message.split("\n")[0]}`], warnings: [] };
  }
  if (!split) return { article: null, problems: ["no frontmatter (the file must start with --- and a YAML block closed by ---)"], warnings: [] };
  const { value: fm, problems } = validateFrontmatter(split.data, fileSlug);
  const body = renderBody(split.body);
  problems.push(...body.problems);
  if (!body.plainText) problems.push("the body is empty");
  if (!fm || problems.length) return { article: null, problems, warnings: [] };
  const appSafe = isAppSafeText([fm.title, fm.description, fm.excerpt, body.plainText, ...(fm.faq || []).map((f) => `${f.q} ${f.a}`)].join(" \n "));
  const article: FeedArticle = {
    ...toSummary(fm, body.wordCount, appSafe),
    segments: body.segments,
    toc: body.toc,
    wordCount: body.wordCount,
    faq: fm.faq ?? [],
    sources: fm.sources ?? [],
    related: fm.related ?? [],
    legacySlugs: fm.legacySlugs ?? [],
    claims: fm.claims ?? [],
    plainText: body.plainText,
  };
  return { article, problems: [], warnings: contractWarnings(fm, body.wordCount) };
}

export interface FeedStore {
  articles: FeedArticle[];
  warnings: FeedWarning[];
}

const storeCache = new Map<string, FeedStore>();

/**
 * Every article in `dir`, newest first. Throws FeedValidationError listing every problem in every
 * file, so one bad file fails the build loudly. A missing or empty folder is an empty blog.
 */
export function loadFeed(dir: string = DEFAULT_CONTENT_DIR(), { cache = true }: { cache?: boolean } = {}): FeedStore {
  const hit = cache ? storeCache.get(dir) : undefined;
  if (hit) return hit;
  const problems: string[] = [];
  const warnings: FeedWarning[] = [];
  const articles: FeedArticle[] = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && !f.startsWith(".")).sort() : [];
  for (const file of files) {
    const fileSlug = file.replace(/\.md$/, "");
    const { article, problems: p, warnings: w } = parseArticle(readFileSync(join(dir, file), "utf8"), fileSlug);
    p.forEach((message) => problems.push(`${file}: ${message}`));
    w.forEach((message) => warnings.push({ file, message }));
    if (article) articles.push(article);
  }
  const seen = new Map<string, string>();
  for (const a of articles) {
    if (seen.has(a.slug)) problems.push(`${a.slug}.md: slug already used by ${seen.get(a.slug)}`);
    seen.set(a.slug, `${a.slug}.md`);
  }
  if (problems.length) throw new FeedValidationError(problems);
  articles.sort(byNewest);
  const store = { articles, warnings };
  if (cache) storeCache.set(dir, store);
  return store;
}

/** Test hook. */
export const resetFeedCache = () => {
  storeCache.clear();
  taxonomyCache = null;
};

export const byNewest = (a: FeedSummary, b: FeedSummary) =>
  Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.title.localeCompare(b.title);

/** The articles a build ships: app builds keep the app-safe ones only. */
export function visibleArticles(store: FeedStore, isApp: boolean): FeedArticle[] {
  if (!isApp) return store.articles;
  const shown = new Set(visibleCategories(isApp).map((c) => c.slug));
  return store.articles.filter((a) => a.appSafe && shown.has(a.category));
}

/** The categories a build ships: app builds skip the web-only ones (giving, build). */
export const visibleCategories = (isApp: boolean): FeedCategory[] => categories().filter((c) => !isApp || !c.webOnly);

export function summaryOf(a: FeedArticle): FeedSummary {
  return {
    slug: a.slug,
    category: a.category,
    title: a.title,
    seoTitle: a.seoTitle,
    description: a.description,
    excerpt: a.excerpt,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    author: a.author,
    heroImage: a.heroImage,
    keywords: a.keywords,
    intent: a.intent,
    cta: a.cta,
    readingMinutes: a.readingMinutes,
    path: a.path,
    appSafe: a.appSafe,
  };
}

// ---------- relations ----------

const keywordSet = (a: FeedSummary) =>
  new Set(a.keywords.flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)));

/**
 * Up to `limit` related articles: the frontmatter `related` list first (unknown slugs skipped),
 * then the best of the rest by same category, keyword overlap and same intent, newest first on ties.
 */
export function relatedFor(article: FeedArticle, pool: FeedArticle[], limit = 3): FeedSummary[] {
  const bySlug = new Map(pool.map((a) => [a.slug, a]));
  const picked: FeedArticle[] = [];
  for (const slug of article.related) {
    const a = bySlug.get(slug);
    if (a && a.slug !== article.slug && !picked.includes(a)) picked.push(a);
  }
  if (picked.length < limit) {
    const mine = keywordSet(article);
    const scored = pool
      .filter((a) => a.slug !== article.slug && !picked.includes(a))
      .map((a) => {
        let overlap = 0;
        keywordSet(a).forEach((w) => {
          if (mine.has(w)) overlap += 1;
        });
        const score = (a.category === article.category ? 3 : 0) + overlap + (a.intent === article.intent ? 1 : 0);
        return { a, score };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || byNewest(x.a, y.a));
    for (const { a } of scored) {
      if (picked.length >= limit) break;
      picked.push(a);
    }
  }
  return picked.slice(0, limit).map(summaryOf);
}

/** The older and newer article in the same category (by publishedAt). */
export function neighboursFor(article: FeedArticle, pool: FeedArticle[]): { prev: FeedSummary | null; next: FeedSummary | null } {
  const list = pool.filter((a) => a.category === article.category).sort((a, b) => -byNewest(a, b));
  const i = list.findIndex((a) => a.slug === article.slug);
  return {
    prev: i > 0 ? summaryOf(list[i - 1]) : null,
    next: i >= 0 && i < list.length - 1 ? summaryOf(list[i + 1]) : null,
  };
}

// ---------- redirects ----------

export interface FeedRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

/**
 * Every legacy blog URL as a redirect: the table in legacy-redirects.json, each article's
 * `legacySlugs`, and the old category landings. A destination article that does not exist (yet)
 * sends visitors to its category with a temporary redirect, so no old URL ever lands on a 404 and
 * nothing is cached as permanent before the article ships.
 */
export function feedRedirects(store: FeedStore, table: LegacyRedirect[] = legacyRedirectTable()): FeedRedirect[] {
  const existing = new Set(store.articles.map((a) => a.path));
  const cats = categories();
  const out = new Map<string, FeedRedirect>();
  const problems: string[] = [];
  const add = (source: string, to: string) => {
    if (source === to) return;
    let destination = to;
    let permanent = true;
    if (/^\/feed\/[^/]+\/[^/]+$/.test(to) && !existing.has(to)) {
      destination = `/feed/${to.split("/")[2]}`;
      permanent = false;
    }
    const prior = out.get(source);
    if (prior && prior.destination !== destination) {
      problems.push(`${source} redirects to both ${prior.destination} and ${destination}`);
      return;
    }
    out.set(source, { source, destination, permanent });
  };
  for (const r of table) add(r.from, r.to);
  const oldCategories = cats.flatMap((c) => c.legacy);
  for (const a of store.articles) {
    for (const legacy of a.legacySlugs) {
      if (legacy.startsWith("/feed/")) {
        add(legacy, a.path);
        continue;
      }
      for (const c of [...oldCategories, ...cats.map((x) => x.slug)]) add(`/feed/${c}/${legacy}`, a.path);
    }
  }
  if (problems.length) throw new FeedValidationError(problems);
  // A live article URL must never redirect away.
  existing.forEach((path) => out.delete(path));
  const list = Array.from(out.values()).sort((a, b) => a.source.localeCompare(b.source));
  // Old category landings, then any other old article URL, go to the new category.
  for (const c of cats) {
    for (const old of c.legacy) {
      list.push({ source: `/feed/${old}`, destination: `/feed/${c.slug}`, permanent: true });
      list.push({ source: `/feed/${old}/:slug`, destination: `/feed/${c.slug}`, permanent: true });
    }
  }
  return list;
}

/** Old slug (any category) -> current article path, for the app's /feed/article?slug= route. */
export function slugMap(store: FeedStore, articles: FeedArticle[] = store.articles, table: LegacyRedirect[] = legacyRedirectTable()): Record<string, string> {
  const map: Record<string, string> = {};
  const live = new Set(articles.map((a) => a.path));
  for (const r of table) {
    if (live.has(r.to)) map[r.from.split("/").pop() as string] = r.to;
  }
  for (const a of articles) {
    for (const legacy of a.legacySlugs) map[legacy.split("/").pop() as string] = a.path;
    map[a.slug] = a.path;
  }
  return map;
}

// ---------- RSS ----------

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** RSS 2.0 of the newest `limit` articles. `origin` is https://tokentails.com. */
export function buildRss(articles: FeedSummary[], origin: string, { limit = 50, title = "Token Tails Blog", now = new Date() } = {}): string {
  const items = [...articles].sort(byNewest).slice(0, limit);
  const lastBuild = items.length ? new Date(Math.max(...items.map((a) => Date.parse(a.updatedAt)))) : now;
  const abs = (p: string) => (/^https?:\/\//.test(p) ? p : `${origin}${p}`);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `<channel>`,
    `<title>${xmlEscape(title)}</title>`,
    `<link>${origin}/feed</link>`,
    `<atom:link href="${origin}/feed/rss.xml" rel="self" type="application/rss+xml"/>`,
    `<description>${xmlEscape("Cat games, giving that anyone can check, and the open-source code behind Pink Paw's payouts.")}</description>`,
    `<language>en</language>`,
    `<lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`,
  ];
  for (const a of items) {
    const url = abs(a.path);
    const cat = categoryBySlug(a.category);
    lines.push(
      `<item>`,
      `<title>${xmlEscape(a.title)}</title>`,
      `<link>${url}</link>`,
      `<guid isPermaLink="true">${url}</guid>`,
      `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>`,
      `<description>${xmlEscape(a.description)}</description>`,
      ...(cat ? [`<category>${xmlEscape(cat.name)}</category>`] : []),
      `<enclosure url="${xmlEscape(abs(a.heroImage.src))}" type="${/\.png($|\?)/i.test(a.heroImage.src) ? "image/png" : /\.webp($|\?)/i.test(a.heroImage.src) ? "image/webp" : "image/jpeg"}" length="0"/>`,
      `</item>`
    );
  }
  lines.push(`</channel>`, `</rss>`);
  return `${lines.join("\n")}\n`;
}

// ---------- sitemap ----------

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  images?: { loc: string }[];
}

/** Sitemap rows for /feed, every category with articles and every article (real lastmod, no priority). */
export function sitemapEntries(store: FeedStore, origin: string): SitemapEntry[] {
  const abs = (p: string) => (/^https?:\/\//.test(p) ? p : `${origin}${p}`);
  const iso = (d: string) => new Date(d).toISOString();
  const newest = (list: FeedSummary[]) => list.reduce((m, a) => (Date.parse(a.updatedAt) > Date.parse(m) ? a.updatedAt : m), list[0].updatedAt);
  const rows: SitemapEntry[] = [];
  if (store.articles.length) rows.push({ loc: abs("/feed"), lastmod: iso(newest(store.articles)) });
  for (const c of categories()) {
    const list = store.articles.filter((a) => a.category === c.slug);
    if (list.length) rows.push({ loc: abs(`/feed/${c.slug}`), lastmod: iso(newest(list)) });
  }
  for (const a of store.articles) {
    rows.push({ loc: abs(a.path), lastmod: iso(a.updatedAt), images: [{ loc: abs(a.heroImage.src) }] });
  }
  return rows;
}
