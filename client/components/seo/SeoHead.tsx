import { IArticle } from "@/models/article";
import Head from "next/head";
import {
  absoluteUrl,
  articleSitePath,
  configured,
  DEFAULT_OG_IMAGE,
  siteName,
  siteOrigin,
  twitterHandle,
} from "./site";

export interface SeoImage {
  /** Site path, CDN path from `cdnFile`, or full URL. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SeoHeadProps {
  article?: IArticle;
  /** Page title. */
  title?: string;
  /** @deprecated Old spelling of `title`. */
  name?: string;
  description?: string;
  /** Share image. A string has no known size, so no `og:image:width/height` is sent for it. */
  image?: string | SeoImage;
  /** Path of the page on the site, for example `/game`. */
  path?: string;
  /**
   * @deprecated Old prop. It is never used for a URL: callers passed titles, `""` (on `/feed`) and
   * wrong paths (`/news` on a feed category), which published wrong canonicals. Pass `path`.
   */
  page?: string;
  /** Keep the page out of search results (`robots: noindex, follow`). */
  noindex?: boolean;
  /** Open Graph type; `article` when an article is passed. */
  type?: "website" | "article";
}

export interface SeoTag {
  key: string;
  kind: "title" | "meta" | "link";
  /** `name`, `property`, or `rel` attribute value. */
  attr?: "name" | "property" | "rel";
  id?: string;
  content: string;
}

/**
 * The tags SeoHead renders, as data so they are testable without a DOM (plan F12). One source for
 * title, description, robots, canonical, Open Graph, Facebook and Twitter tags. Every URL is
 * absolute; tags whose value is not configured are left out, never sent as `undefined`.
 */
export function buildSeoTags(props: SeoHeadProps): SeoTag[] {
  const origin = siteOrigin();
  const site = siteName();
  const { article } = props;

  const title = article?.title || props.title || props.name || site;
  const description = article?.excerpt || props.description || "";
  const articlePath = article
    ? articleSitePath(article.category?.slug, article.slug)
    : null;
  // Canonical and og:url come only from `path` or the article, never from the deprecated `page`
  // prop. No path means no canonical and no og:url, which is safer than a wrong one.
  const url = absoluteUrl(articlePath ?? props.path, origin);

  const articleImage = article?.featuredImage?.url
    ? { url: article.featuredImage.url, alt: article.featuredImage.caption }
    : null;
  const given: SeoImage | null =
    typeof props.image === "string" ? { url: props.image } : props.image ?? null;
  const image: SeoImage = articleImage ??
    given ?? {
      // Same origin, not CDN, like SITE_LOGO: the file ships in public/logo/, so link previews work
      // on deploy without waiting for the CDN sync.
      url: `/${DEFAULT_OG_IMAGE.path}`,
      width: DEFAULT_OG_IMAGE.width,
      height: DEFAULT_OG_IMAGE.height,
      alt: DEFAULT_OG_IMAGE.alt,
    };
  const imageUrl =
    absoluteUrl(image.url, origin) ?? `${origin}/${DEFAULT_OG_IMAGE.path}`;
  const imageAlt = image.alt || title;
  const type = article ? "article" : props.type ?? "website";

  const tags: SeoTag[] = [];
  const meta = (attr: "name" | "property", id: string, content?: string | null) => {
    if (content) {
      tags.push({ key: id, kind: "meta", attr, id, content });
    }
  };

  tags.push({ key: "title", kind: "title", content: title });
  // No favicon here: G14 puts one icon set in `_document` and deletes every per-page icon tag.
  meta("name", "description", description);
  meta("name", "author", site);
  meta("name", "robots", props.noindex ? "noindex, follow" : "index, follow");
  if (url && !props.noindex) {
    tags.push({ key: "canonical", kind: "link", attr: "rel", id: "canonical", content: url });
  }

  meta("property", "og:site_name", site);
  meta("property", "og:type", type);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:url", url);
  meta("property", "og:image", imageUrl);
  if (imageUrl.startsWith("https://")) {
    meta("property", "og:image:secure_url", imageUrl);
  }
  if (image.width && image.height) {
    meta("property", "og:image:width", String(image.width));
    meta("property", "og:image:height", String(image.height));
  }
  meta("property", "og:image:alt", imageAlt);

  if (article) {
    // Rendered as direct `<meta>` children of `<Head>`: Next's client head manager only syncs
    // meta/link/title/etc. elements, so a nested component's tags would be missed on client
    // navigation and left stale after navigating away.
    meta("property", "article:published_time", article.createdAt);
    meta("property", "article:modified_time", article.updatedAt || article.createdAt);
    meta("property", "article:author", site);
    meta("property", "article:section", article.category?.name);
    meta("property", "article:tag", article.keyword?.name);
  }

  meta("property", "fb:app_id", configured(process.env.NEXT_PUBLIC_FB_APP_ID));
  meta("property", "fb:pages", configured(process.env.NEXT_PUBLIC_FB_PAGES));

  const handle = twitterHandle();
  if (handle) {
    meta("name", "twitter:card", "summary_large_image");
    meta("name", "twitter:site", `@${handle}`);
    meta("name", "twitter:creator", `@${handle}`);
    meta("name", "twitter:title", title);
    meta("name", "twitter:description", description);
    meta("name", "twitter:image", imageUrl);
    meta("name", "twitter:image:alt", imageAlt);
  }
  return tags;
}

/**
 * The single meta source for a page (plan F12). Every tag is a direct child of `<Head>` (never a
 * nested component, which Next's client head manager does not sync), and tags are keyed, so a page
 * that renders SeoHead twice, or a layout and a page that both render it, keep one copy of each tag.
 */
export const SeoHead = (props: SeoHeadProps) => {
  const tags = buildSeoTags(props);
  return (
    <Head>
      {tags.map((tag) => {
        if (tag.kind === "title") {
          return <title key={tag.key}>{tag.content}</title>;
        }
        if (tag.kind === "link") {
          return <link key={tag.key} rel={tag.id} href={tag.content} />;
        }
        return tag.attr === "property" ? (
          <meta key={tag.key} property={tag.id} content={tag.content} />
        ) : (
          <meta key={tag.key} name={tag.id} content={tag.content} />
        );
      })}
    </Head>
  );
};
