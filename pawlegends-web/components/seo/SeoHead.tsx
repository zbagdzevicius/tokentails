import Head from "next/head";
import { absoluteUrl, SITE_NAME, SITE_ORIGIN } from "./site";

export interface SeoImage {
  /** Site path or full URL. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SeoHeadProps {
  /** Page title. */
  title: string;
  description?: string;
  /** Share image. */
  image: SeoImage;
  /** Path of the page on the site, for example `/play`. */
  path?: string;
  /** Keep the page out of search results (`robots: noindex, follow`); a noindex page sends no canonical. */
  noindex?: boolean;
  /** The name for `og:site_name` and `author`. Default: Paw Legends. */
  siteName?: string;
}

export interface SeoTag {
  key: string;
  kind: "title" | "meta" | "link";
  attr?: "name" | "property" | "rel";
  id?: string;
  content: string;
}

/**
 * The tags SeoHead renders, as data so they are testable without a DOM: title, description, robots, canonical, Open
 * Graph and the Twitter card. Every URL is absolute (https://pawlegends.app); empty values are left out.
 */
export function buildSeoTags(props: SeoHeadProps): SeoTag[] {
  const site = props.siteName || SITE_NAME;
  const title = props.title || site;
  const description = props.description || "";
  const url = absoluteUrl(props.path, SITE_ORIGIN);
  const imageUrl = absoluteUrl(props.image.url, SITE_ORIGIN);
  const imageAlt = props.image.alt || title;

  const tags: SeoTag[] = [];
  const meta = (attr: "name" | "property", id: string, content?: string | null) => {
    if (content) tags.push({ key: id, kind: "meta", attr, id, content });
  };

  tags.push({ key: "title", kind: "title", content: title });
  meta("name", "description", description);
  meta("name", "author", site);
  meta("name", "robots", props.noindex ? "noindex, follow" : "index, follow");
  if (url && !props.noindex) tags.push({ key: "canonical", kind: "link", attr: "rel", id: "canonical", content: url });

  meta("property", "og:site_name", site);
  meta("property", "og:type", "website");
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:url", url);
  meta("property", "og:image", imageUrl);
  if (imageUrl?.startsWith("https://")) meta("property", "og:image:secure_url", imageUrl);
  if (props.image.width && props.image.height) {
    meta("property", "og:image:width", String(props.image.width));
    meta("property", "og:image:height", String(props.image.height));
  }
  meta("property", "og:image:alt", imageAlt);

  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", description);
  meta("name", "twitter:image", imageUrl);
  meta("name", "twitter:image:alt", imageAlt);
  return tags;
}

/**
 * The single meta source for a page. Every tag is a direct child of `<Head>` (Next's client head manager syncs only
 * those), and tags are keyed, so a page keeps one copy of each.
 */
export const SeoHead = (props: SeoHeadProps) => {
  const tags = buildSeoTags(props);
  return (
    <Head>
      {tags.map((tag) => {
        if (tag.kind === "title") return <title key={tag.key}>{tag.content}</title>;
        if (tag.kind === "link") return <link key={tag.key} rel={tag.id} href={tag.content} />;
        return tag.attr === "property" ? (
          <meta key={tag.key} property={tag.id} content={tag.content} />
        ) : (
          <meta key={tag.key} name={tag.id} content={tag.content} />
        );
      })}
    </Head>
  );
};
