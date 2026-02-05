import { IImage } from "@/models/image";
import { apiUrl } from "./api";
import { IOrder } from "@/models/order";

async function uploadImage(
  blob: File,
  { name }: { name?: string } = {}
): Promise<IImage> {
  const formData: FormData = new FormData();
  formData.append("file", blob);
  formData.append("name", name || "");
  formData.append("isTemporary", "true");

  return fetch(`${apiUrl}/image/portrait`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    } as any,
    body: formData,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

async function generatePortrait(
  blob: File,
  { name }: { name?: string } = {}
): Promise<IImage> {
  return uploadImage(blob, { name });
}

async function get(imageId: string): Promise<IImage> {
  return fetch(`${apiUrl}/image/${imageId}`, {
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
}

async function getOrderById(hash: string): Promise<IOrder> {
  return fetch(`${apiUrl}/image/order/status?hash=${hash}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    } as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

async function regeneratePortrait(imageId: string): Promise<IImage> {
  return fetch(`${apiUrl}/image/portrait/${imageId}/regenerate`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
    } as any,
    body: null as any,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

export const IMAGE_API = {
  uploadImage,
  generatePortrait,
  regeneratePortrait,
  get,
  getOrderById,
};
