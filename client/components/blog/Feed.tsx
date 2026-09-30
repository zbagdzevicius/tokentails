import { IRouteOption } from "@/api/routing";
import { FeedArticle } from "@/components/blog/feed/FeedArticle";
import { getEntityType } from "@/constants/utils";
import { IArticleExcerpt } from "@/models/article";
import { EntityType } from "@/models/save";
import { ComponentType, useMemo } from "react";

// Articles, possibly interleaved with ad placeholders ({ isAd: true }).
export type IFeedItem = Partial<IArticleExcerpt> & { isAd?: boolean };

interface IProps {
  items: IFeedItem[];
  options?: IRouteOption[];
}

// getEntityType only ever returns ARTICLE, so CAT and PACK are unreachable.
const NoFeedComponent = () => null;

const entityTypeComponent: Record<
  Exclude<
    EntityType,
    EntityType.COMMENT | EntityType.LOOT_BOX | EntityType.IMAGE
  >,
  ComponentType<IArticleExcerpt>
> = {
  [EntityType.ARTICLE]: FeedArticle,
  [EntityType.CAT]: NoFeedComponent,
  [EntityType.PACK]: NoFeedComponent,
};

export const Feed = ({ items }: IProps) => {
  const entitiesWithMetadata = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        type: getEntityType(item),
      })),
    [items]
  );

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      {entitiesWithMetadata
        .filter((item): item is IArticleExcerpt => !!item.slug)
        .map((item, i) => {
          const Component = entityTypeComponent[item.type];
          return <Component key={i} {...item} />;
        })}
    </div>
  );
};
