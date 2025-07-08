import { IRouteOption } from "@/api/routing";
import { FeedArticle } from "@/components/blog/feed/FeedArticle";
import { getEntityType } from "@/constants/utils";
import { IArticleExcerpt } from "@/models/article";
import { EntityType } from "@/models/save";
import { useEffect, useState } from "react";

interface IProps {
  items: any[];
  options?: IRouteOption[];
}

const entityTypeComponent: Record<
  Exclude<EntityType, EntityType.COMMENT | EntityType.LOOT_BOX>,
  any
> = {
  [EntityType.ARTICLE]: FeedArticle,
  [EntityType.CAT]: <></>,
  [EntityType.PRESALE]: <></>,
  [EntityType.MYSTERY_BOX]: <></>,
};

export const Feed = ({ items }: IProps) => {
  const [entitiesWithMetadata, setEntitiesWithMetadata] = useState<
    IArticleExcerpt[]
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
      {entitiesWithMetadata
        .filter((item) => !!item.slug)
        .map((item, i) => {
          const Component = entityTypeComponent[item.type];
          return <Component key={i} {...item} />;
        })}
    </div>
  );
};
