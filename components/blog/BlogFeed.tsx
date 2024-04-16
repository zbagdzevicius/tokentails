import { Loader } from "@/components/shared/Loader";
import { NoMore } from "@/components/shared/NoMore";
import {
  findCategoryArticlesFetch,
  findGroupPublicationsFetch,
  getNextPageFn,
} from "@/constants/api";
import { insertObjectEveryN } from "@/constants/utils";
import { EntityType } from "@/models/save";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { When } from "react-if";
import { useInView } from "react-intersection-observer";
import { Feed } from "./Feed";
import { FeedCta } from "./feed/FeedCta";

export interface LandingPageProps {
  category?: string;
  group?: string;
  hasCategory?: boolean;
  entryRecords?: any[];
}

export const BlogFeed = ({
  category,
  group,
  hasCategory,
  entryRecords,
}: LandingPageProps) => {
  const queryFunction = useCallback(
    async ({ pageParam = 0 }) => {
      let articles = [];
      if (hasCategory && !(category || group)) {
        return [];
      }
      articles.push(
        ...(await (group
          ? findGroupPublicationsFetch
          : findCategoryArticlesFetch)({
          searchObject: { category, group },
          page: pageParam,
        }))
      );
      if (pageParam === 0) {
        articles.push({ type: EntityType.VIDEO_SLIDER, category: "sveikauk" });
      }
      return articles;
    },
    [hasCategory, category, group]
  );
  const { data, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["articles", category, group],
    queryFn: queryFunction,
    initialPageParam: 0,
    getNextPageParam: getNextPageFn,
  });
  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView) {
      fetchNextPage();
    }
  }, [inView, fetchNextPage]);

  const articles = useMemo(() => {
    let items = [...(entryRecords || []), ...(data?.pages?.flat(1) || [])];
    if (!process.env.NEXT_PUBLIC_IS_APP) {
      items = insertObjectEveryN(items, 10, { isAd: true });
    }
    return items;
  }, [data?.pages, entryRecords]);

  return (
    <>
      <FeedCta category={category} />
      <Feed items={articles} />
      <div ref={ref}>
        <When condition={isFetching}>
          <Loader />
        </When>
      </div>
      <When condition={!hasNextPage && !isFetching}>
        <NoMore
          title="We are out of meows"
          subtitle="Click the paw to continue"
        />
      </When>
    </>
  );
};
