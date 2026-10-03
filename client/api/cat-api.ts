import { ICat, ICatStatus } from "@/models/cats";
import {
  ParsedStorefront,
  parseStorefrontDetailed,
  Storefront,
} from "@/shared-contracts/storefront";
import { apiUrl } from "./api";

const stake = async (
  _id: string
): Promise<{ success: boolean; message: string }> => {
  return fetch(`${apiUrl}/cat/stake/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as HeadersInit,
  }).then((response) => {
    return response.json();
  });
};

const stakingRedeem = async (
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
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const setAsOpened = async (
  _id: string
): Promise<{
  success: boolean;
  message: string;
}> => {
  return fetch(`${apiUrl}/user/opened-pack/${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

/**
 * The signed-in user's cats. Always an array: Base and the pet list call array methods on it, so
 * an error, a non-JSON body or a non-array body (an old or failing backend) gives `[]`.
 */
const cats = async (): Promise<ICat[]> => {
  try {
    const response = await fetch(`${apiUrl}/user/cats`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        accesstoken: sessionStorage.getItem("accesstoken"),
      } as HeadersInit,
    });
    if (!response.ok) {
      console.warn(`GET /user/cats failed with ${response.status}`);
      return [];
    }
    const body: unknown = await response.json();
    return Array.isArray(body)
      ? (body.filter((cat) => !!cat && typeof cat === "object") as ICat[])
      : [];
  } catch {
    return [];
  }
};

const cat = async (id: string): Promise<ICat | null> => {
  return fetch(`${apiUrl}/cat/${id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

/** Why a storefront load could not use the response (`storefront_degraded.reason`). */
export type StorefrontFailure = "network" | "http" | "malformed_json" | "shape";

export interface StorefrontResult extends ParsedStorefront<ICat> {
  /**
   * Set when the request failed or the body was not a storefront object: the cats are then the
   * empty storefront and the UI offers a retry. Missing or non-array keys in an otherwise valid
   * object are only `degraded` (an old backend drops a shelter's key once its cats are adopted).
   */
  failure: StorefrontFailure | null;
  /** HTTP status when the backend answered, for telemetry. */
  status?: number;
}

const failedStorefront = (
  failure: StorefrontFailure,
  status?: number
): StorefrontResult => ({
  ...parseStorefrontDetailed<ICat>({}),
  degraded: true,
  failure,
  status,
});

/**
 * `GET /cat/sale` through the shared contract (plan G13). Never throws and never returns an array:
 * every required shelter key is an array, whatever the backend sends. Public endpoint, so no
 * `accesstoken` is sent.
 */
const storefront = async (): Promise<StorefrontResult> => {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/cat/sale`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    return failedStorefront("network");
  }
  if (!response.ok) {
    return failedStorefront("http", response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failedStorefront("malformed_json", response.status);
  }
  const parsed = parseStorefrontDetailed<ICat>(body);
  const isObject = !!body && typeof body === "object" && !Array.isArray(body);
  return {
    ...parsed,
    failure: isObject ? null : "shape",
    status: response.status,
  };
};

/** The storefront cats only, every required key an array. Prefer `useStorefront` in components. */
const catsForSale = async (): Promise<Storefront<ICat>> =>
  (await storefront()).cats;

const update = async (
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
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const setActive = async (id: string): Promise<void> => {
  return fetch(`${apiUrl}/cat/${id}/activate`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

const redeem = async (
  code: string
): Promise<{ cat: ICat; message: string; success: boolean }> => {
  return fetch(`${apiUrl}/cat/redeem/${code}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken"),
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return;
  });
};

export const CAT_API = {
  stake,
  stakingRedeem,
  cats,
  catsForSale,
  storefront,
  update,
  cat,
  setActive,
  redeem,
  setAsOpened,
};
