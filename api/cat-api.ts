import { ICat, ICatStatus } from "@/models/cats";
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
    } as any,
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
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
};

const cats = async (): Promise<ICat[]> => {
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

const cat = async (id: string): Promise<ICat | null> => {
  return fetch(`${apiUrl}/cat/${id}`, {
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

const catsForSale = async (): Promise<Record<string, ICat[]>> => {
  return fetch(`${apiUrl}/cat/sale`, {
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
    } as any,
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
    } as any,
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
    } as any,
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
  update,
  cat,
  setActive,
  redeem,
};
