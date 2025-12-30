import { ARTICLE_API } from "@/api/article-api";
import { getNextPageFn } from "@/api/routing";
import { Feed } from "@/components/blog/Feed";
import { Loader } from "@/components/shared/Loader";
import { NoMore } from "@/components/shared/NoMore";
import { insertObjectEveryN } from "@/constants/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useInView } from "react-intersection-observer";

export interface LandingPageProps {
  category?: string;
  hasCategory?: boolean;
  entryRecords?: any[];
}

export const FeedLanding = ({
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
    if (!process.env.NEXT_PUBLIC_IS_APP) {
      items = insertObjectEveryN(items, 10, { isAd: true });
    }
    return items;
  }, [data?.pages, entryRecords]);

  return (
    <>
      <Feed items={articles} />
      <div ref={ref}>{isFetching && <Loader />}</div>
      {!hasNextPage && !isFetching && (
        <NoMore
          title="We are out of meows"
          subtitle="Click the paw to continue"
        />
      )}
    </>
  );
};
