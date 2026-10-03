import { IArticle } from "@/models/article";
import { ArticleJsonLd } from "next-seo";
import {
  absoluteUrl,
  articleSitePath,
  siteName,
  siteOrigin,
  SITE_LOGO,
} from "./site";

export const ArticleMicrodata = ({
  category,
  title,
  excerpt,
  slug,
  images,
  featuredImage,
  createdAt,
  updatedAt,
  keyword,
}: IArticle) => {
  const origin = siteOrigin();
  const name = siteName();
  const url =
    absoluteUrl(articleSitePath(category?.slug, slug), origin) ?? `${origin}/feed`;
  const imageUrls = [featuredImage?.url, ...(images || []).map((image) => image?.url)]
    .map((image) => absoluteUrl(image, origin))
    .filter((image): image is string => !!image);

  return (
    <ArticleJsonLd
      url={url}
      title={title}
      images={imageUrls}
      datePublished={createdAt}
      dateModified={updatedAt || createdAt}
      section={category?.name}
      keywords={keyword?.name}
      authorName={[{ name, url: `${origin}/` }]}
      publisherName={name}
      publisherLogo={absoluteUrl(`/${SITE_LOGO.path}`, origin) ?? undefined}
      description={excerpt}
      isAccessibleForFree={true}
    />
  );
};
