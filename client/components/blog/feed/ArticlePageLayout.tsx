import { ArticleContainer } from "@/components/blog/feed/ArticleContainer";
import { ArticleMicrodata } from "@/components/seo/ArticleMicrodata";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import BlogLayout from "@/layouts/BlogLayout";
import { IArticle, IArticleExcerpt } from "@/models/article";

interface Props {
  article: IArticle;
  randomArticles: IArticleExcerpt[];
}

// Shared by the prerendered web route (/feed/[category]/[article]) and the
// client route the static app export uses (/feed/article?category=&slug=).
export const ArticlePageLayout = ({ article, randomArticles }: Props) => {
  return (
    <>
      <SeoHead article={article} />
      <ArticleMicrodata {...article} />

      <FirebaseAuthProvider authMode="optional">
        <BlogLayout>
          <ArticleContainer article={article} randomArticles={randomArticles} />
        </BlogLayout>
      </FirebaseAuthProvider>
    </>
  );
};
