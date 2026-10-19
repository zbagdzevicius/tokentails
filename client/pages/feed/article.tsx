import { BlogFrame } from "@/components/blog/BlogFrame";
import { slugMapProps } from "@/lib/feed/props";
import { isApp } from "@/models/app";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";

interface Props {
  /** Every known slug (current and legacy) to its article path. */
  map: Record<string, string>;
  liveCategories: string[];
}

/** Where an old `/feed/article?slug=` link should go: the article, else the blog hub. */
export const resolveArticleQuery = (map: Record<string, string>, slug: string | undefined): string =>
  (slug && map[slug]) || "/feed";

/**
 * /feed/article?category=&slug=: the old client route of the app export, kept so saved links and
 * app deep links still land. Articles are prerendered in both builds now, so it only forwards to the
 * article's own path (or to /feed for an unknown slug). Never indexed.
 */
export default function ArticleForward({ map, liveCategories }: Props) {
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : undefined;
  const target = resolveArticleQuery(map, slug);
  useEffect(() => {
    if (!router.isReady) return;
    router.replace(target);
  }, [router, target]);
  return (
    <>
      <Head>
        <title>Token Tails Blog</title>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogFrame liveCategories={liveCategories}>
        <p className="mx-auto max-w-[40rem] px-4 py-24 text-center text-[1.1rem]">
          Opening the article… <Link href={target} className="font-bold underline underline-offset-4">Continue</Link>
        </p>
      </BlogFrame>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({ props: slugMapProps(isApp) });
