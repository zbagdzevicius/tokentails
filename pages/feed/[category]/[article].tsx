import { ARTICLE_API } from "@/api/article-api";
import { ArticleContainer } from "@/components/blog/feed/ArticleContainer";
import { ArticleMicrodata } from "@/components/seo/ArticleMicrodata";
import { SeoHead } from "@/components/seo/SeoHead";
import { getAppStaticProps } from "@/constants/props-functions";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import BlogLayout from "@/layouts/BlogLayout";
import { IArticle, IArticleExcerpt } from "@/models/article";
import Custom404 from "@/pages/404";
import { Else, If, Then } from "react-if";

interface Props {
  article: IArticle;
  randomArticles: IArticleExcerpt[];
}

export default function ArticlePage({ article, randomArticles }: Props) {
  return (
    <If condition={Boolean(article)}>
      <Then>
        <SeoHead article={article} />
        <ArticleMicrodata {...article!} />

        <FirebaseAuthProvider>
          <BlogLayout>
            <ArticleContainer
              article={article}
              randomArticles={randomArticles}
            />
          </BlogLayout>
        </FirebaseAuthProvider>
      </Then>
      <Else>
        <Custom404 />
      </Else>
    </If>
  );
}

async function fetchProps(slug: string): Promise<Props> {
  const singleArticle = await ARTICLE_API.articleFetch(slug);

  return singleArticle;
}

export const getStaticProps = async (params: any) =>
  getAppStaticProps<Promise<Props>>(() => fetchProps(params.params.article));

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: "blocking",
  };
}
