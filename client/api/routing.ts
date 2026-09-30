import { isApp } from "@/models/app";
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
  icon?: string;
}

// A static export (app builds) cannot serve dynamic routes it did not
// prerender, so app links go to client routes that read the slug from the
// query string: pages/cats/view.tsx and pages/feed/article.tsx.
export const catPath = (id: string) =>
  isApp ? `/cats/view?id=${encodeURIComponent(id)}` : `/cats/${id}`;

export const articlePath = (category: string, slug: string) =>
  isApp
    ? `/feed/article?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(slug)}`
    : `/feed/${category}/${slug}`;

// Canonical website path for a link built by either kind of build, for sharing.
export const webPath = (path: string) => {
  const url = new URL(path, "http://localhost");
  const params = url.searchParams;
  if (url.pathname === "/cats/view" && params.get("id")) {
    return `/cats/${params.get("id")}`;
  }
  if (
    url.pathname === "/feed/article" &&
    params.get("category") &&
    params.get("slug")
  ) {
    return `/feed/${params.get("category")}/${params.get("slug")}`;
  }
  return path;
};

// Route an app build exported for a website path: the inverse of webPath.
// /cats/<id> and /feed/<category>/<slug> are not prerendered in the export,
// so they map to the query-param client routes. Other paths are unchanged.
export const appPath = (path: string) => {
  const url = new URL(path, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 2 && parts[0] === "cats" && parts[1] !== "view") {
    return catPath(parts[1]) + url.hash;
  }
  if (parts.length === 3 && parts[0] === "feed") {
    return articlePath(parts[1], parts[2]) + url.hash;
  }
  return path;
};

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
  ...Object.keys(FEED_OPTION).map(
    (k) => FEED_OPTION[k as keyof typeof FEED_OPTION],
  ),
];
export const getNextPageFn = <T,>(
  lastPage: T[],
  allPages: T[][],
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
    details: ([category, article]) => articlePath(category, article),
  },
  [EntityType.CAT]: {
    details: ([]) => `/`,
  },
  [EntityType.PACK]: {
    details: ([]) => `/`,
  },
  [EntityType.IMAGE]: {
    details: ([]) => `/`,
  },
};
