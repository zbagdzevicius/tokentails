import { FeedArticle } from "@/components/blog/feed/FeedArticle";
import { FeedGroup } from "@/components/blog/feed/FeedGroup";
import { FeedPublication } from "@/components/blog/feed/FeedPublication";
import { FeedQuiz } from "@/components/blog/feed/FeedQuiz";
import { IRouteOption } from "@/constants/api";
import { getEntityType } from "@/constants/utils";
import { IArticleExcerpt } from "@/models/article";
import { IQuiz } from "@/models/quiz";
import { EntityType } from "@/models/save";
import { useEffect, useState } from "react";

interface IProps {
  items: any[];
  options?: IRouteOption[];
}

const entityTypeComponent: Record<
  Exclude<
    EntityType,
    EntityType.VIDEO | EntityType.VIDEO_SLIDER | EntityType.COMMENT
  >,
  any
> = {
  [EntityType.ARTICLE]: FeedArticle,
  [EntityType.QUIZ]: FeedQuiz,
  [EntityType.PUBLICATION]: FeedPublication,
  [EntityType.GROUP]: FeedGroup,
};

export const Feed = ({ items }: IProps) => {
  const [entitiesWithMetadata, setEntitiesWithMetadata] = useState<
    (IQuiz | IArticleExcerpt)[]
  >([]);
  useEffect(() => {
    const entitiesWithMetadata = items.map((item) => ({
      ...item,
      type: getEntityType(item),
    }));
    setEntitiesWithMetadata(entitiesWithMetadata);
  }, [items]);

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      {entitiesWithMetadata.map((item, i) => {
        const Component = entityTypeComponent[item.type];
        return <Component key={i} {...item} />;
      })}
    </div>
  );
};
