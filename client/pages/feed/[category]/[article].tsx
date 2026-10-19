import { ARTICLE_BODY_ID, ArticleView } from "@/components/blog/ArticleView";
import { BlogFrame } from "@/components/blog/BlogFrame";
import { FeedJsonLd } from "@/components/blog/FeedJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import { blogPostingJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/feed/jsonld";
import { articlePaths, articleProps, type ArticleProps } from "@/lib/feed/props";
import { articleTitleTag } from "@/lib/feed/view";
import { isApp } from "@/models/app";
import type { GetStaticPaths, GetStaticProps } from "next";

/** /feed/<category>/<slug>: one article, rendered at build time from client/content/feed/<slug>.md. */
export default function FeedArticlePage({ article, category, related, prev, next, liveCategories }: ArticleProps) {
  return (
    <>
      <SeoHead
        title={articleTitleTag(article)}
        ogTitle={article.title}
        description={article.description}
        path={article.path}
        image={{ url: article.heroImage.src, width: article.heroImage.width, height: article.heroImage.height, alt: article.heroImage.alt }}
        articleMeta={{ publishedTime: article.publishedAt, modifiedTime: article.updatedAt, section: category.name, tags: article.keywords }}
      />
      <FeedJsonLd
        items={[
          blogPostingJsonLd(article, category),
          breadcrumbJsonLd([
            { name: "Blog", path: "/feed" },
            { name: category.name, path: `/feed/${category.slug}` },
            { name: article.title, path: article.path },
          ]),
          faqJsonLd(article.faq),
        ]}
      />
      <BlogFrame liveCategories={liveCategories} progressTarget={ARTICLE_BODY_ID}>
        <ArticleView article={article} category={category} related={related} prev={prev} next={next} />
      </BlogFrame>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({ paths: articlePaths(isApp), fallback: false });

export const getStaticProps: GetStaticProps<ArticleProps, { category: string; article: string }> = async ({ params }) => {
  const props = articleProps(params?.category ?? "", params?.article ?? "", isApp);
  return props ? { props } : { notFound: true };
};
