import { IArticle, IArticleExcerpt } from "@/models/article";
import { ICategory } from "@/models/category";
import { CatType, ICat, ICatStatus } from "@/models/cats";
import { IComment } from "@/models/comment";
import { GameModal } from "@/models/game";
import { IGroup } from "@/models/group";
import { IOrder } from "@/models/order";
import { IProfile } from "@/models/profile";
import { IPublication } from "@/models/publication";
import { IQuiz } from "@/models/quiz";
import { EntityType, ISave, ISaved } from "@/models/save";
import { IGenericSearchParams } from "@/models/search";
import { CurrencyType } from "@/web3/contracts";

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
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
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

export const submitComment = (
  comment: Pick<IComment, "text" | "type" | "entity">
) => {
  return fetch(`${apiUrl}/comment`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
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
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    return response.json();
  });
};

export const stakeFetch = async (
  _id: string
): Promise<{ success: boolean; message: string }> => {
  return fetch(`${apiUrl}/cat/stake/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    return response.json();
  });
};

export const stakeRedeemFetch = async (
  _id: string
): Promise<{
  success: boolean;
  message: string;
}> => {
  return fetch(`${apiUrl}/cat/stake-reward/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const catsFetch = async (): Promise<ICat[]> => {
  return fetch(`${apiUrl}/user/cats`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const catsForSaleFetch = async (catType: CatType): Promise<ICat[]> => {
  return fetch(`${apiUrl}/cat/sale/${catType}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const adoptCatFetch = async (
  _id: string
): Promise<{ success: boolean; message: string }> => {
  return fetch(`${apiUrl}/cat/adopt/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return [];
  });
};

export const saveProfile = (profile: IProfile) => {
  return fetch(`${apiUrl}/user/profile`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
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

export const redeemCat = async (code: string): Promise<ICat | null> => {
  if (!code) {
    return null;
  }
  return fetch(`${apiUrl}/cat/redeem/${code}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
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
): Promise<ICat | null> => {
  if (!id || !status.EAT) {
    return null;
  }
  return fetch(`${apiUrl}/cat/${id}`, {
    method: "PUT",
    body: JSON.stringify(status),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const getLeaderboard = async (
  gameModal: GameModal
): Promise<IProfile[]> => {
  return fetch(
    `${apiUrl}/user/leaderboard${
      gameModal === GameModal.LEADERBOARD_DAILY ? "/daily" : ""
    }`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      } as any,
    }
  )
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

export const getLeaderboardPosition = async (): Promise<number> => {
  return fetch(`${apiUrl}/user/leaderboard/position`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
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

export const getCurrencyRate = async (
  currencyType: CurrencyType
): Promise<string> => {
  return fetch(`${apiUrl}/cat/rate/${currencyType}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { price: 1000 };
    })
    .then((v) => v.price);
};

export const getRaised = async (): Promise<number> => {
  return fetch(`${apiUrl}/web3/raised`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { raised: 0 };
    })
    .then((v) => Math.floor(v?.raised));
};

export const confirmTransaction = async (
  order: IOrder
): Promise<Pick<IOrder, "cat">> => {
  return fetch(`${apiUrl}/web3/confirm`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
    body: JSON.stringify(order),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

export const setActiveCat = async (id: string): Promise<void> => {
  return fetch(`${apiUrl}/cat/${id}/activate`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

export const setAdventDay = async (): Promise<void> => {
  return fetch(`${apiUrl}/user/advent`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

export const getAddressTokens = async (
  walletAddress: string
): Promise<string> => {
  return fetch(`${apiUrl}/web3/presale/${walletAddress}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.text();
    }

    return "0";
  });
};
