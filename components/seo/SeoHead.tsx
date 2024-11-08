import { IArticle } from "@/models/article";
import { getFilePath } from "@/constants/utils";
import Head from "next/head";
import { useMemo } from "react";
import { ArticleMeta } from "./ArticleMeta";

interface IProps {
  article?: IArticle;
  name?: string;
  description?: string;
  image?: string;
  page?: string;
}

export const SeoHead = ({
  name,
  description,
  image = `${process.env.NEXT_PUBLIC_DOMAIN}/logo.webp`,
  article,
  page,
}: IProps) => {
  const url = useMemo(() => {
    const parentUrl = page || "";
    const middleUrl = article?.category?.slug || "";
    const childUrl = article?.slug || "";
    return [process.env.NEXT_PUBLIC_DOMAIN, parentUrl, middleUrl, childUrl]
      .filter((value) => !!value)
      .join("/")
      .replace("//", "/");
  }, [article, page]);
  const mainImage = useMemo(() => {
    return article?.featuredImage?.url || image;
  }, [image, article]);
  const mainDescription = useMemo(() => {
    return article?.excerpt || description;
  }, [description, article]);
  const mainTitle = useMemo(() => {
    return article?.title || name;
  }, [name, article]);
  const imageAlt = useMemo(() => {
    return article?.featuredImage.caption || name;
  }, [name, article]);
  const ogType = useMemo(() => {
    if (article) {
      return "article";
    }

    return "website";
  }, [article]);

  return (
    <Head>
      {!!article && <ArticleMeta {...article} />}
      <title>{mainTitle}</title>
      <link rel="icon" href={"/logo/coin.webp"} />
      <meta name="description" content={mainDescription} />
      <meta name="author" content={process.env.NEXT_PUBLIC_SITE_NAME} />
      <meta name="robots" content="index, follow"></meta>
      <link rel="canonical" href={url} />
      <meta property="fb:app_id" content={process.env.NEXT_PUBLIC_FB_APP_ID} />
      <meta property="fb:pages" content={process.env.NEXT_PUBLIC_FB_PAGES} />
      <meta property="og:image" content={mainImage} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:title" content={mainTitle} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={ogType} />
      <meta property="og:description" content={mainDescription} />
      <meta
        property="og:site_name"
        content={process.env.NEXT_PUBLIC_SITE_NAME}
      />

      <meta name="twitter:card" content="summary_large_image" />
      <meta
        name="twitter:site"
        content={`@${process.env.NEXT_PUBLIC_TWITTER_PAGE}`}
      />
      <meta
        name="twitter:creator"
        content={`@${process.env.NEXT_PUBLIC_TWITTER_PAGE}`}
      />
      <meta name="twitter:title" content={mainTitle} />
      <meta name="twitter:description" content={mainDescription} />
      <meta name="twitter:image" content={mainImage} />
      <link rel="shortcut icon" href="/logo/coin.webp" />
    </Head>
  );
};
