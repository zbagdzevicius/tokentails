import { IImage } from "@/models/image";
import { apiUrl } from "./api";
import { IOrder } from "@/models/order";

async function uploadImage(
  blob: File,
  { name, style }: { name?: string; style?: string } = {}
): Promise<IImage> {
  const formData: FormData = new FormData();
  formData.append("file", blob);
  formData.append("name", name || "");
  formData.append("isTemporary", "true");
  if (style) {
    formData.append("style", style);
  }

  return fetch(`${apiUrl}/image/portrait`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    } as HeadersInit,
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
  { name, style }: { name?: string; style?: string } = {}
): Promise<IImage> {
  return uploadImage(blob, { name, style });
}

async function get(imageId: string): Promise<IImage> {
  return fetch(`${apiUrl}/image/${imageId}`, {
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
}

async function getOrderById(_id: string): Promise<IOrder> {
  return fetch(`${apiUrl}/image/order/status?_id=${_id}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    } as HeadersInit,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

/** Thrown when the backend answers 401: regeneration needs a signed-in user. */
export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in to generate another version of your portrait.");
    this.name = "SignInRequiredError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, SignInRequiredError.prototype);
  }
}

async function regeneratePortrait(
  imageId: string,
  style?: string
): Promise<IImage> {
  // Regeneration is a paid generation, so the backend requires a signed-in user.
  return fetch(`${apiUrl}/image/portrait/${imageId}/regenerate`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accesstoken: sessionStorage.getItem("accesstoken") || "",
    } as HeadersInit,
    body: style ? JSON.stringify({ style }) : null,
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }
    if (response.status === 401) {
      throw new SignInRequiredError();
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
