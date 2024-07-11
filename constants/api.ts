import { IArticle, IArticleExcerpt } from "@/models/article";
import { ICategory } from "@/models/category";
import { ICatStatus, IProfileCat } from "@/models/cats";
import { IComment } from "@/models/comment";
import { IGroup } from "@/models/group";
import { IProfile } from "@/models/profile";
import { IPublication } from "@/models/publication";
import { IQuiz } from "@/models/quiz";
import { EntityType, ISave, ISaved } from "@/models/save";
import { IGenericSearchParams } from "@/models/search";
import { IVideo } from "@/models/video";

const apiUrl = process.env.NEXT_PUBLIC_BE_URL;

export const categories: ICategory[] = [
  { name: "Cats NFT", slug: "cats-nft" },
  { name: "Announcements", slug: "announcements" },
  { name: "All About Cats", slug: "all-about-cats" },
] as ICategory[];

export interface IRouteOption {
  name: string;
  href: string;
}

export const urlPrefix = process.env.NEXT_PUBLIC_IS_APP ? "/app" : "";

export const FEED_OPTION: Record<
  | "HOME"
  | "ARTICLES_CATS_NFT"
  | "ARTICLES_ANNOUNCEMENTS"
  | "ARTICLES_ALL_ABOUT_CATS"
  | "GROUP"
  | "QUIZ",
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
  GROUP: {
    name: "Groups",
    href: "g",
  },
  QUIZ: {
    name: "QUIZ",
    href: "quiz",
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
  EntityType.COMMENT | EntityType.VIDEO_SLIDER | EntityType.VIDEO
> = {
  [EntityType.ARTICLE]: {
    details: ([category, article]) =>
      `/feed/${category}${urlPrefix}/${article}`,
  },
  [EntityType.GROUP]: {
    details: ([slug]) => `/feed/${FEED_OPTION.GROUP.href}${urlPrefix}/${slug}`,
  },
  [EntityType.PUBLICATION]: {
    details: ([slug]) => `/${FEED_OPTION.GROUP.href}/p/${slug}`,
  },
  [EntityType.QUIZ]: {
    details: ([quiz]) => `/${FEED_OPTION.QUIZ.href}${urlPrefix}/${quiz}`,
  },
};

export interface ISearchProps {
  query?: string;
  category?: string;
  initialRecords?: any[];
}

export interface ISearchFetchProps extends ISearchProps {
  perPage?: number;
  page: number;
}

export const findArticlesFetch = (
  props: ISearchFetchProps
): Promise<IArticleExcerpt[]> =>
  fetch(`${apiUrl}/article/search`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });

export const findCategoryArticlesFetch = (
  params?: IGenericSearchParams
): Promise<IArticleExcerpt[]> => {
  return fetch(
    params?.searchObject?.category
      ? `${apiUrl}/feed/search/${EntityType.ARTICLE}`
      : `${apiUrl}/feed/search`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params || {}),
    }
  ).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const findGroupPublicationsFetch = async (
  params?: IGenericSearchParams
): Promise<IPublication[]> => {
  if (!params?.searchObject?.group) {
    return [] as IPublication[];
  }
  return fetch(`${apiUrl}/feed/search/${EntityType.PUBLICATION}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params || {}),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const publicationFetch = async (slug: string): Promise<IPublication> => {
  return fetch(`${apiUrl}/publication/${slug}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const quizFetch = (name: string): Promise<IQuiz> =>
  fetch(`${apiUrl}/quiz/${name}`).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });

export const getArticlesSlugs = (): Promise<
  { slug: string; category: string }[]
> =>
  fetch(`${apiUrl}/article/slugs`).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });

export const articleFetch = (
  name: string
): Promise<{ article: IArticle; randomArticles: IArticleExcerpt[] }> =>
  fetch(`${apiUrl}/article/${name}`).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });

export const savePost = (props: ISave): Promise<void> =>
  fetch(`${apiUrl}/user/save`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });

export const saveDelete = (props: ISave): Promise<void> =>
  fetch(`${apiUrl}/user/unsave`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });

export const likePost = (props: ISave): Promise<void> =>
  fetch(`${apiUrl}/user/like`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });

export const unlikePost = (props: ISave): Promise<void> =>
  fetch(`${apiUrl}/user/unlike`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });

export const entityMetadataFetch = async (
  props: ISave[]
): Promise<ISaved[]> => {
  if (!props?.length) {
    return [];
  }
  return fetch(`${apiUrl}/user/entity-metadata`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

export const findEntitiesFetch = <T>(
  entityType: EntityType,
  params?: IGenericSearchParams
): Promise<T[]> => {
  return fetch(`${apiUrl}/feed/search/${entityType}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params || {}),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const videoFetch = async (slug: string): Promise<IVideo> => {
  return fetch(`${apiUrl}/video/${slug}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

export const submitComment = (
  comment: Pick<IComment, "text" | "type" | "entity">
) => {
  return fetch(`${apiUrl}/comment`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(comment),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

export const submitPublication = (
  publication: Pick<IPublication, "content"> & { group: string }
) => {
  return fetch(`${apiUrl}/publication`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(publication),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

export const commentsFetch = (
  entityType: EntityType,
  entityId: string,
  props: ISearchFetchProps
) => {
  return fetch(`${apiUrl}/comment/${entityType}/${entityId}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
    body: JSON.stringify(props),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

export const profileFetch = async (): Promise<IProfile> => {
  return fetch(`${apiUrl}/user/profile`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const saveProfile = (profile: IProfile) => {
  return fetch(`${apiUrl}/user/profile`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(profile),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

export const groupFetch = async (slug: string): Promise<IGroup> => {
  return fetch(`${apiUrl}/group/${slug}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const redeemCat = async (code: string): Promise<IProfileCat | null> => {
  if (!code) {
    return null;
  }
  return fetch(`${apiUrl}/cat/redeem/${code}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};
export const redeemFreeTrial = async (): Promise<IProfileCat | null> => {
  return fetch(`${apiUrl}/cat/redeem/free`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const updateCatStatus = async (
  id: string | number,
  status: ICatStatus
): Promise<IProfileCat | null> => {
  if (!id || !(status.EAT || status.PLAY)) {
    return null;
  }
  return fetch(`${apiUrl}/cat/${id}`, {
    method: "PUT",
    body: JSON.stringify(status),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const deleteProfileRequest = async (): Promise<void> => {
  return fetch(`${apiUrl}/user/meal-plan`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return;
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

export const getLeaderboard = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const getLeaderboardPosition = async (): Promise<number> => {
  return fetch(`${apiUrl}/user/leaderboard/position`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: localStorage.getItem("accesstoken"),
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { position: "999" };
    })
    .then((v) => v.position);
};
