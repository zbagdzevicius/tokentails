import { ICategory } from "@/models/category";
import { EntityType } from "@/models/save";

export const categories: ICategory[] = [
  { name: "Cats NFT", slug: "cats-nft" },
  { name: "Announcements", slug: "announcements" },
  { name: "All About Cats", slug: "all-about-cats" },
] as ICategory[];

export interface IRouteOption {
  name: string;
  href: string;
}

export const urlPrefix = process.env.NEXT_PUBLIC_IS_APP ? "" : "";

export const FEED_OPTION: Record<
  | "HOME"
  | "ARTICLES_CATS_NFT"
  | "ARTICLES_ANNOUNCEMENTS"
  | "ARTICLES_ALL_ABOUT_CATS",
  IRouteOption
> = {
  HOME: { name: "Feed", href: "/feed" },
  ARTICLES_CATS_NFT: {
    name: "Cats NFT",
    href: "/feed/cats-nft",
  },
  ARTICLES_ANNOUNCEMENTS: {
    name: "Announcements",
    href: "/feed/announcements",
  },
  ARTICLES_ALL_ABOUT_CATS: {
    name: "All About Cats",
    href: "/feed/all-about-cats",
  },
};

export const articlesCategories: IRouteOption[] = [
  FEED_OPTION.ARTICLES_CATS_NFT,
  FEED_OPTION.ARTICLES_ANNOUNCEMENTS,
  FEED_OPTION.ARTICLES_ALL_ABOUT_CATS,
];

export const feedOptions = [
  ...Object.keys(FEED_OPTION).map((k) => (FEED_OPTION as any)[k]),
];
export const getNextPageFn = (
  lastPage: any[],
  allPages: any[][],
  lastPageParam: number,
  allPageParams: Array<number>,
  perPage = 20
) => {
  if (!Math.floor(lastPage.length / perPage)) {
    return undefined;
  }
  return lastPageParam + 1;
};

export const EntityRouteOption: Omit<
  Record<
    EntityType,
    {
      details: (slugs: string[]) => string;
      list?: (slugs: string[]) => string;
    }
  >,
  EntityType.COMMENT | EntityType.LOOT_BOX
> = {
  [EntityType.ARTICLE]: {
    details: ([category, article]) =>
      `/feed/${category}${urlPrefix}/${article}`,
  },
  [EntityType.CAT]: {
    details: ([]) => `/`,
  },
  [EntityType.PRESALE]: {
    details: ([]) => `/`,
  },
  [EntityType.MYSTERY_BOX]: {
    details: ([]) => `/`,
  },
};
