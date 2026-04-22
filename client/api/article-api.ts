import { IArticle, IArticleExcerpt } from "@/models/article";
import { IComment } from "@/models/comment";
import { EntityType, ISave, ISaved } from "@/models/save";
import { IGenericSearchParams } from "@/models/search";
import { apiUrl } from "./api";

interface ISearchProps {
  query?: string;
  category?: string;
  initialRecords?: any[];
}

interface ISearchFetchProps extends ISearchProps {
  perPage?: number;
  page: number;
}

const getPage = (props: ISearchFetchProps): Promise<IArticleExcerpt[]> =>
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

const getCategoryPage = (
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

const articleFetch = (
  name: string
): Promise<{ article: IArticle; randomArticles: IArticleExcerpt[] }> =>
  fetch(`${apiUrl}/article/${name}`).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });

const like = (props: ISave): Promise<void> =>
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

const getMetadata = async (props: ISave[]): Promise<ISaved[]> => {
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

const comment = (comment: Pick<IComment, "text" | "type" | "entity">) => {
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

const getComments = (
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

export const ARTICLE_API = {
  getPage,
  getCategoryPage,
  articleFetch,
  like,
  getMetadata,
  comment,
  getComments,
};
