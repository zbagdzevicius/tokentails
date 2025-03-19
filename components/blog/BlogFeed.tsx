import { Loader } from "@/components/shared/Loader";
import { NoMore } from "@/components/shared/NoMore";
import { insertObjectEveryN } from "@/constants/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { When } from "react-if";
import { useInView } from "react-intersection-observer";
import { Feed } from "./Feed";
import { FeedCta } from "./feed/FeedCta";
import { ARTICLE_API } from "@/api/article-api";
import { getNextPageFn } from "@/api/routing";
import { isApp } from "@/models/app";

export interface LandingPageProps {
  category?: string;
  hasCategory?: boolean;
  entryRecords?: any[];
}

export const BlogFeed = ({
  category,
  hasCategory,
  entryRecords,
}: LandingPageProps) => {
  const queryFunction = useCallback(
    async ({ pageParam = 0 }) => {
      let articles = [];
      if (hasCategory && !category) {
        return [];
      }
      articles.push(
        ...(await ARTICLE_API.getCategoryPage({
          searchObject: { category },
          page: pageParam,
        }))
      );
      return articles;
    },
    [hasCategory, category]
  );
  const { data, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["articles", category],
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
    if (!isApp) {
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
