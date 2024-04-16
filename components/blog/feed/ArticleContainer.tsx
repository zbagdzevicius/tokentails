import { Feed } from "@/components/blog/Feed";
import { FeedLanding } from "@/components/blog/feed/FeedLanding";
import { IArticle, IArticleExcerpt } from "@/models/article";
import { If, Then } from "react-if";
import { ArticleDetails } from "./ArticleDetails";
import { useMemo } from "react";
import { replaceRefsWithImages } from "@/constants/content-utils";

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
      <If condition={article.relatedArticles?.length}>
        <Then>
          <Feed items={article.relatedArticles} />
        </Then>
      </If>
      <FeedLanding category={article.category.slug} hasCategory={true} />
    </div>
  );
}
