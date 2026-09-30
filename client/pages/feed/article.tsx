import { ARTICLE_API } from "@/api/article-api";
import { ArticlePageLayout } from "@/components/blog/feed/ArticlePageLayout";
import Custom404 from "@/pages/404";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";

// Client-rendered article for the static app export, which cannot serve
// /feed/[category]/[article]. Links reach it through articlePath() in
// api/routing.ts. The article is fetched by slug; category only shapes the URL.
export default function ArticleView() {
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : "";

  const { data, isFetched } = useQuery({
    queryKey: ["article", slug],
    queryFn: () => ARTICLE_API.articleFetch(slug),
    enabled: !!slug,
  });

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      {data?.article ? (
        <ArticlePageLayout
          article={data.article}
          randomArticles={data.randomArticles}
        />
      ) : (
        router.isReady && (!slug || isFetched) && <Custom404 />
      )}
    </>
  );
}
