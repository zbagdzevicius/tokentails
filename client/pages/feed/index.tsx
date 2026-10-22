import { BlogFrame } from "@/components/blog/BlogFrame";
import { FeedHub } from "@/components/blog/FeedHub";
import { FeedJsonLd } from "@/components/blog/FeedJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import { blogJsonLd, breadcrumbJsonLd } from "@/lib/feed/jsonld";
import { hubProps, type HubProps } from "@/lib/feed/props";
import { isApp } from "@/models/app";
import type { GetStaticProps } from "next";

export const FEED_SEO = Object.freeze({
  title: "Token Tails Blog: Cat Games, Giving and Proof",
  description:
    "Guides to free cat games in your browser, how giving reaches Pink Paw in Kaunas, Lithuania, and the open-source code that lets anyone check every payout.",
  path: "/feed",
});

/** /feed: the blog hub, built from client/content/feed (no API). */
export default function FeedPage({ articles, categories, featuredSlug }: HubProps) {
  return (
    <>
      <SeoHead {...FEED_SEO} />
      <FeedJsonLd items={[blogJsonLd(articles), breadcrumbJsonLd([{ name: "Blog", path: "/feed" }])]} />
      <BlogFrame liveCategories={categories.map((c) => c.slug)}>
        <FeedHub articles={articles} categories={categories} featuredSlug={featuredSlug} />
      </BlogFrame>
    </>
  );
}

export const getStaticProps: GetStaticProps<HubProps> = async () => ({ props: hubProps(isApp) });
