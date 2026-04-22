import { Feed } from "@/components/blog/Feed";
import { FeedLanding } from "@/components/blog/feed/FeedLanding";
import { replaceRefsWithImages } from "@/constants/content-utils";
import { IArticle, IArticleExcerpt } from "@/models/article";
import { useMemo } from "react";
import { ArticleDetails } from "./ArticleDetails";

interface IProps {
  article: IArticle;
  randomArticles: IArticleExcerpt[];
}

export function ArticleContainer({ article }: IProps) {
  const content = useMemo(() => {
    const html = replaceRefsWithImages(article.content, article.images);

    return html;
  }, [article]);
  return (
    <div className="flex flex-col gap-8">
      <span>
        <ArticleDetails {...article} content={content} />
      </span>
      {article.relatedArticles?.length && (
        <Feed items={article.relatedArticles} />
      )}
      <FeedLanding category={article.category.slug} hasCategory={true} />
    </div>
  );
}
