import { EntityRouteOption, findArticlesFetch } from "@/constants/api";
import { IArticleExcerpt as Props } from "@/models/article";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

const BlogPreviewCard = ({ title, slug, featuredImage, category }: Props) => {
  const link = useMemo(
    () => EntityRouteOption.ARTICLE.details([category?.slug, slug]),
    [slug, category?.slug]
  );
  return (
    <Link
      href={link}
      className="rem:h-[350px] border-4 border-yellow-300 relative flex"
    >
      <Image
        loading="lazy"
        height={350}
        width={720}
        src={featuredImage?.url}
        className="object-cover z-0 rem:h-[350px]"
        alt={featuredImage?.caption || title}
      />

      <div className="absolute bottom-0 left-0 right-0 p-6 min-h-[6rem] xl:min-h-0 pt-12 flex items-end z-10 mt-40 bg-gradient-to-b from-transparent to-black h-full">
        <h2
          className="word-break font-secondary text-p5 md:text-p4 lg:text-h6 text-white font-bold"
          dangerouslySetInnerHTML={{ __html: title }}
        ></h2>
      </div>
    </Link>
  );
};

export const BlogPreview = () => {
  const { data } = useQuery({
    queryKey: ["todos"],
    queryFn: () => findArticlesFetch({ page: 0, perPage: 4 }),
  });
  return (
    <div className="">
      <h2 className="text-center font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
        Some Paw-some news
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {data?.map((article) => (
          <BlogPreviewCard key={article._id} {...article} />
        ))}
      </div>
    </div>
  );
};
