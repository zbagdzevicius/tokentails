import { EntityRouteOption, findArticlesFetch } from "@/constants/api";
import { IArticleExcerpt as Props } from "@/models/article";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Slider } from "../shared/Slider";
const BlogPreviewCard = ({ title, slug, featuredImage, category }: Props) => {
  const link = useMemo(
    () => EntityRouteOption.ARTICLE.details([category?.slug, slug]),
    [slug, category?.slug]
  );
  return (
    <Link href={link} target="_blank" className="relative flex aspect-square min-h-[280px] hover:brightness-110 hover:animate-hover">
      <Image
        loading="lazy"
        height={350}
        width={720}
        src={featuredImage?.url}
        className="object-cover z-0 rounded-2xl overflow-hidden"
        alt={featuredImage?.caption || title}
      />

      <div className="absolute rounded-2xl overflow-hidden bottom-0 left-0 right-0 p-6 min-h-[6rem] xl:min-h-0 pt-12 flex items-end z-10 mt-40 bg-gradient-to-b from-transparent to-white h-full">
        <h2
          className="word-break font-secondary text-p5 lg:text-p3 font-bold"
          dangerouslySetInnerHTML={{ __html: title }}
        ></h2>
      </div>
    </Link>
  );
};

export const BlogPreview = () => {
  const { data } = useQuery({
    queryKey: ["todos"],
    queryFn: () => findArticlesFetch({ page: 0, perPage: 16 }),
  });

  const items = data?.map((article) => (
    <BlogPreviewCard key={article._id} {...article} />
  ));
  return (
    <div>
      <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
        LATEST NEWS
      </h2>
      <Slider items={items || []} mobileSlides={1} />
    </div>
  );
};
