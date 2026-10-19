import { BlogFrame } from "@/components/blog/BlogFrame";
import { CategoryView } from "@/components/blog/CategoryView";
import { FeedJsonLd } from "@/components/blog/FeedJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import { breadcrumbJsonLd, collectionJsonLd } from "@/lib/feed/jsonld";
import { categoryPaths, categoryProps, type CategoryProps } from "@/lib/feed/props";
import { isApp } from "@/models/app";
import type { GetStaticPaths, GetStaticProps } from "next";

/** /feed/<category>: an indexable section landing (its own title, description and intro). */
export default function FeedCategoryPage({ category, articles, others, liveCategories }: CategoryProps) {
  const path = `/feed/${category.slug}`;
  return (
    <>
      <SeoHead title={category.seoTitle} description={category.description} path={path} />
      <FeedJsonLd
        items={[
          collectionJsonLd(category, articles),
          breadcrumbJsonLd([
            { name: "Blog", path: "/feed" },
            { name: category.name, path },
          ]),
        ]}
      />
      <BlogFrame liveCategories={liveCategories}>
        <CategoryView category={category} articles={articles} others={others} />
      </BlogFrame>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({ paths: categoryPaths(isApp), fallback: false });

export const getStaticProps: GetStaticProps<CategoryProps, { category: string }> = async ({ params }) => {
  const props = categoryProps(params?.category ?? "", isApp);
  return props ? { props } : { notFound: true };
};
