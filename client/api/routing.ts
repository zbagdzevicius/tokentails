import { isApp } from "@/models/app";
import { ICategory } from "@/models/category";
import { EntityType } from "@/models/save";
import taxonomy from "@/lib/feed/taxonomy.json";

/** The blog sections (lib/feed/taxonomy.json, the one source). */
export const categories: ICategory[] = taxonomy.categories.map(({ name, slug }) => ({ name, slug }));

export interface IRouteOption {
  name: string;
  href: string;
  icon?: string;
}

// A static export (app builds) cannot serve dynamic routes it did not
// prerender, so app cat links go to a client route that reads the id from the
// query string: pages/cats/view.tsx. Blog articles are repo content now and
// are prerendered in both builds, so their links are the real paths;
// /feed/article?slug= only forwards old links (pages/feed/article.tsx).
export const catPath = (id: string) =>
  isApp ? `/cats/view?id=${encodeURIComponent(id)}` : `/cats/${id}`;

export const articlePath = (category: string, slug: string) =>
  `/feed/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`;

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
// /cats/<id> is not prerendered in the export, so it maps to the query-param
// client route. Blog articles in a current section are prerendered and stay;
// an old-section article (/feed/announcements/<slug>) goes to the forwarder,
// which knows every legacy slug (pages/feed/article.tsx). Others are unchanged.
export const appPath = (path: string) => {
  const url = new URL(path, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 2 && parts[0] === "cats" && parts[1] !== "view") {
    return catPath(parts[1]) + url.hash;
  }
  if (parts.length === 3 && parts[0] === "feed" && parts[1] !== "article" && !categories.some((c) => c.slug === parts[1])) {
    return `/feed/article?category=${encodeURIComponent(parts[1])}&slug=${encodeURIComponent(parts[2])}${url.hash}`;
  }
  return path;
};

/** The blog hub and its sections, for menus. */
export const FEED_OPTION: { HOME: IRouteOption; SECTIONS: IRouteOption[] } = {
  HOME: { name: "Blog", href: "/feed" },
  SECTIONS: categories.map(({ name, slug }) => ({ name, href: `/feed/${slug}` })),
};

export const articlesCategories: IRouteOption[] = FEED_OPTION.SECTIONS;

export const feedOptions: IRouteOption[] = [FEED_OPTION.HOME, ...FEED_OPTION.SECTIONS];

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
