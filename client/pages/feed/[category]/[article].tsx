import { ARTICLE_API } from "@/api/article-api";
import { GetStaticPropsContext } from "next";
import { ArticlePageLayout } from "@/components/blog/feed/ArticlePageLayout";
import {
  getAppStaticPaths,
  getAppStaticProps,
} from "@/constants/props-functions";
import { IArticle, IArticleExcerpt } from "@/models/article";
import Custom404 from "@/pages/404";

interface Props {
  article: IArticle;
  randomArticles: IArticleExcerpt[];
}

export default function ArticlePage({ article, randomArticles }: Props) {
  return (
    <>
      {article && (
        <ArticlePageLayout article={article} randomArticles={randomArticles} />
      )}

      {!article && <Custom404 />}
    </>
  );
}

async function fetchProps(slug: string): Promise<Props> {
  const singleArticle = await ARTICLE_API.articleFetch(slug);

  return singleArticle;
}

export const getStaticProps = async (
  params: GetStaticPropsContext<{ article: string }>
) =>
  getAppStaticProps<Promise<Props>>(() => fetchProps(params.params!.article));

export const getStaticPaths = getAppStaticPaths;
