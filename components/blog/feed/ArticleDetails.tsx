import { EntityRouteOption } from "@/api/routing";
import { FeedCard } from "@/components/blog/feed/FeedCard";
import { cdnFile } from "@/constants/utils";
import { IArticle } from "@/models/article";
import { EntityType } from "@/models/save";
import Image from "next/image";
import { useMemo } from "react";

type Props = Omit<IArticle, "images">;

export function ArticleDetails({
  _id,
  title,
  slug,
  category,
  content,
  excerpt,
  featuredImage,
  createdAt,
  comments,
  updatedAt,
}: Props) {
  const link = useMemo(
    () => EntityRouteOption.ARTICLE.details([category?.slug, slug]),
    [slug, category?.slug]
  );

  return (
    <FeedCard
      entity={_id}
      type={EntityType.ARTICLE}
      link={link}
      author={category.name}
      authorSubtitle="Andrius Žiužnys"
      authorImage={cdnFile("logo/coin.webp")}
      description={excerpt}
      authorLink={category.slug}
      date={createdAt}
      comments={comments}
    >
      <article className="article w-full m-auto">
        <Image
          priority
          alt={featuredImage?.caption || title}
          src={featuredImage?.url}
          className="object-cover w-full overflow-hidden mb-4 md:mb-6"
          height={400}
          width={640}
        />
        <h1
          dangerouslySetInnerHTML={{ __html: title }}
          className="text-main-black px-4 capitalize text-balance text-center text-p1 font-paws md:text-h5 font-normal mb-6 md:mb-8"
        ></h1>

        <div
          className="article-content text-main-black px-4 lg:text-p4 max-w-[44rem] m-auto mt-6 md:mt-8"
          dangerouslySetInnerHTML={{ __html: content }}
        ></div>
      </article>
    </FeedCard>
  );
}
