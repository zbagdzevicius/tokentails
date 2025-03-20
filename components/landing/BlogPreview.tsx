import { ARTICLE_API } from "@/api/article-api";
import { EntityRouteOption } from "@/api/routing";
import { IArticleExcerpt as Props } from "@/models/article";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Slider } from "../shared/Slider";
import { PixelButton } from "../shared/PixelButton";

const BlogPreviewCard = ({ title, slug, featuredImage, category }: Props) => {
  const link = useMemo(
    () => EntityRouteOption.ARTICLE.details([category?.slug, slug]),
    [slug, category?.slug]
  );
  return (
    <Link
      href={link}
      target="_blank"
      className="relative flex aspect-square min-h-[280px] hover:brightness-110 hover:animate-hover"
    >
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
    queryFn: () => ARTICLE_API.getPage({ page: 0, perPage: 16 }),
  });

  const items = data?.map((article) => (
    <BlogPreviewCard key={article._id} {...article} />
  ));
  return (
    <div>
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance my-3 text-center">
        What's new ?
      </h2>
      <Slider items={items || []} mobileSlides={1} />
      <a href="/game" className="flex mt-4 justify-center">
        <PixelButton text="PLAY TO SAVE" />
      </a>
    </div>
  );
};
