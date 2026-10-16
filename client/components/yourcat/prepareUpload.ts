/**
 * Client-side preparation of the photo before any request (docs/plans/yourcat-v2.md §1 S1):
 *
 * 1. Type: accepted when `file.type` is one of the five photo types, or when it is empty and the name
 *    ends in `.heic`/`.heif` (Android and Windows often report HEIC that way; the server's byte check
 *    decides).
 * 2. Shrink: when the browser can decode the file, draw it at most 1600 px on the long edge and send
 *    a JPEG at quality 0.88 as `photo.jpg` (faster on 4G, and the canvas drops EXIF). When decoding
 *    fails, the original file is sent.
 * 3. Size: the file actually sent must be at most 10 MB. Anything over 40 MB is refused before
 *    decoding.
 */

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** The `accept` attribute of the file input (no `capture`: the native apps have no camera permission). */
export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const MAX_SEND_BYTES = 10 * 1024 * 1024;
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.88;

export type UploadFileType = "jpeg" | "png" | "webp" | "heic" | "other";
export type SizeBucket = "lt1mb" | "1to5mb" | "5to10mb";

export interface PreparedUpload {
  ok: true;
  file: Blob;
  filename: string;
  resized: boolean;
  /** The chosen file's type (for `upload_started`). */
  fileType: UploadFileType;
  /** The size of the file actually sent. */
  sizeBucket: SizeBucket;
}

export interface RefusedUpload {
  ok: false;
  reason: "type" | "size";
}

/** A decoded image the shrink step can draw. */
export interface DecodedImage {
  width: number;
  height: number;
  close?: () => void;
}

export interface PrepareDeps {
  /** Decodes the file with EXIF orientation applied; rejects when the browser cannot. */
  decode: (file: Blob) => Promise<DecodedImage>;
  /** Draws the image at `width` x `height` and encodes a JPEG; null when the browser cannot. */
  encode: (image: DecodedImage, width: number, height: number) => Promise<Blob | null>;
}

const HEIC_NAME = /\.(heic|heif)$/i;

/** The type rule of step 1. */
export function isAcceptedFile(file: { type: string; name: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type) return (ACCEPTED_TYPES as readonly string[]).indexOf(type) !== -1;
  return HEIC_NAME.test(file.name || "");
}

export function uploadFileType(file: { type: string; name: string }): UploadFileType {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg") return "jpeg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic" || type === "image/heif" || (!type && HEIC_NAME.test(file.name || ""))) return "heic";
  return "other";
}

export function sizeBucket(bytes: number): SizeBucket {
  if (bytes < 1024 * 1024) return "lt1mb";
  if (bytes < 5 * 1024 * 1024) return "1to5mb";
  return "5to10mb";
}

/** The size that fits `MAX_EDGE` on the long edge, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge || long <= 0) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const browserDeps: PrepareDeps = {
  decode: async (file) => {
    if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap is not available");
    return createImageBitmap(file, { imageOrientation: "from-image" });
  },
  encode: (image, width, height) =>
    new Promise<Blob | null>((resolve) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY);
      } catch {
        resolve(null);
      }
    }),
};

/** Runs the three steps. Never rejects. */
export async function prepareUpload(file: File, deps: PrepareDeps = browserDeps): Promise<PreparedUpload | RefusedUpload> {
  if (!isAcceptedFile(file)) return { ok: false, reason: "type" };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, reason: "size" };
  const fileType = uploadFileType(file);

  let sent: Blob = file;
  let filename = file.name || "photo";
  let resized = false;
  try {
    const image = await deps.decode(file);
    try {
      const size = fitWithin(image.width, image.height);
      const jpeg = await deps.encode(image, size.width, size.height);
      if (jpeg && jpeg.size > 0) {
        sent = jpeg;
        filename = "photo.jpg";
        resized = true;
      }
    } finally {
      image.close?.();
    }
  } catch {
    // Not decodable here (older browsers, HEIC outside Safari): the server decides.
  }

  if (sent.size > MAX_SEND_BYTES) return { ok: false, reason: "size" };
  return { ok: true, file: sent, filename, resized, fileType, sizeBucket: sizeBucket(sent.size) };
}
