import { getApp } from "firebase/app";
import { getLimitedUseAppCheckToken } from "@/context/auth/appCheck";
import { IImage } from "@/models/image";
import { apiUrl, currentAccessToken, getAuthBridge } from "./api";
import { IOrder } from "@/models/order";

/**
 * Plain messages for the preview caps of `POST /image/portrait` and regenerate (bet #3,
 * yourcat-v2.md sections 2.1 and 3.1). The backend sends `{ statusCode, code, message }`; these codes
 * are local to /yourcat and /image/portrait, so they are read here, not through the shared errors.
 */
const PREVIEW_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  YOURCAT_IP_DAILY_CAP: "You have made all your previews for today. Please come back tomorrow.",
  YOURCAT_USER_DAILY_CAP: "You have made all your previews for today. Please come back tomorrow.",
  YOURCAT_FAILURE_DAILY_CAP: "You have made all your previews for today. Please come back tomorrow.",
  YOURCAT_BUDGET_EXHAUSTED: "We have made all the previews we can for today. Please come back tomorrow.",
  YOURCAT_PORTRAIT_DISABLED: "Portrait previews are paused right now. Please come back later.",
  YOURCAT_DISABLED: "Portrait previews are paused right now. Please come back later.",
  YOURCAT_NO_CLIENT_IP: "Portrait previews are paused right now. Please come back later.",
  YOURCAT_APP_CHECK_REQUIRED: "We could not check your browser. Please reload the page and try again.",
  YOURCAT_APP_CHECK_INVALID: "We could not check your browser. Please reload the page and try again.",
  YOURCAT_FILE_TOO_LARGE: "That photo is too large. Please choose one under 10 MB.",
  YOURCAT_FILE_TYPE: "Please choose a JPEG, PNG, WebP or HEIC photo.",
  YOURCAT_FILE_REQUIRED: "Please choose a photo first.",
  YOURCAT_NOT_DECODABLE: "We could not open that photo. Please try another one.",
  YOURCAT_PORTRAIT_EXISTS: "This portrait has already been bought, so it cannot be painted again.",
};

/** Burst limit (a throttler 429 has no `code`). */
const BURST_MESSAGE = "Too many tries at once. Please wait a moment and try again.";

/** Thrown when a portrait preview is refused for a reason the visitor should read (caps, file, browser check). */
export class PortraitPreviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string
  ) {
    super(message);
    this.name = "PortraitPreviewError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, PortraitPreviewError.prototype);
  }
}

async function bodyCode(response: Response): Promise<string | null> {
  try {
    const copy = typeof response.clone === "function" ? response.clone() : response;
    const body = await copy.json();
    if (!body || typeof body !== "object") return null;
    if (typeof body.code === "string") return body.code;
    // Some Nest exceptions nest the object under `message`.
    const nested = body.message;
    return nested && typeof nested === "object" && typeof nested.code === "string" ? nested.code : null;
  } catch {
    return null;
  }
}

/** The preview error a refused response maps to, or null when it has no plain message. */
async function previewErrorOf(response: Response): Promise<PortraitPreviewError | null> {
  const code = await bodyCode(response);
  if (code && PREVIEW_ERROR_MESSAGES[code]) {
    return new PortraitPreviewError(response.status, code, PREVIEW_ERROR_MESSAGES[code]);
  }
  if (response.status === 429) {
    return new PortraitPreviewError(429, code, BURST_MESSAGE);
  }
  return null;
}

/**
 * The headers of a paid AI call: the caller's token (a guest session is created first) and a
 * limited-use App Check token when App Check is configured (yourcat-v2.md section 6.6).
 */
async function aiCallHeaders(extra: Record<string, string>): Promise<Record<string, string>> {
  try {
    await getAuthBridge().ensureGuestSession?.();
  } catch {
    // No session: the backend answers 401/428 and the caller shows its message.
  }
  const headers: Record<string, string> = { ...extra, accesstoken: currentAccessToken() };
  let appCheckToken: string | null = null;
  try {
    appCheckToken = await getLimitedUseAppCheckToken(getApp());
  } catch {
    appCheckToken = null; // no default Firebase app on this page
  }
  if (appCheckToken) {
    headers["x-firebase-appcheck"] = appCheckToken;
  }
  return headers;
}

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

  const headers = await aiCallHeaders({ Accept: "application/json" });
  const response = await fetch(`${apiUrl}/image/portrait`, {
    method: "POST",
    headers: headers as HeadersInit,
    body: formData,
  });
  if (response.ok) {
    return response.json();
  }
  const previewError = await previewErrorOf(response);
  if (previewError) {
    throw previewError;
  }

  console.warn(JSON.stringify(response));
  return null as unknown as IImage;
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

/** Thrown when the backend answers 401 or 403 GUEST_FORBIDDEN: regeneration needs a signed-in user. */
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
  // Regeneration is a paid generation: a guest may regenerate only an image it owns (the backend
  // answers 403 GUEST_FORBIDDEN for older images without an owner), a signed-out visitor gets 401.
  const headers = await aiCallHeaders({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const response = await fetch(`${apiUrl}/image/portrait/${imageId}/regenerate`, {
    method: "PUT",
    headers: headers as HeadersInit,
    body: style ? JSON.stringify({ style }) : null,
  });
  if (response.ok) {
    return response.json();
  }
  if (response.status === 401) {
    throw new SignInRequiredError();
  }
  if (response.status === 403 && (await bodyCode(response)) === "GUEST_FORBIDDEN") {
    throw new SignInRequiredError();
  }
  const previewError = await previewErrorOf(response);
  if (previewError) {
    throw previewError;
  }

  console.warn(JSON.stringify(response));
  return null as unknown as IImage;
}

export const IMAGE_API = {
  uploadImage,
  generatePortrait,
  regeneratePortrait,
  get,
  getOrderById,
};
