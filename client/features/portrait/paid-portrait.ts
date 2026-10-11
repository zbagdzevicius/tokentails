import { IImage } from "@/models/image";

/**
 * The paid portrait file (CR1-02). Before payment `GET /image/:id` answers with the watermarked
 * ~1024 px preview as `aiUrl` (`aiUrl === previewUrl`); once the order is COMPLETE it answers with the
 * public copy of the full-resolution PNG (backend image.controller.ts `portraitView`). The order can turn
 * COMPLETE a moment before that copy exists, so the pages fetch the image again with a short backoff
 * and keep the download button on "preparing" until the paid URL arrives.
 */
export type PaidDownloadStatus = "preparing" | "ready" | "unavailable";

type ImageView = Pick<IImage, "aiUrl" | "url"> & { previewUrl?: string };

/** The paid file's URL in a `GET /image/:id` answer, or null while it still carries the preview. */
export function paidPortraitUrl(image: ImageView | null | undefined): string | null {
  const aiUrl = image?.aiUrl;
  if (!aiUrl) {
    return null;
  }
  // Older portraits have no preview: their public aiUrl is already the full file.
  if (image.previewUrl && aiUrl === image.previewUrl) {
    return null;
  }
  return aiUrl;
}

/** Delays between attempts: 1 s, 2 s, 4 s, 8 s (5 attempts, about 15 s). */
export const PAID_PORTRAIT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the image until it carries the paid URL. Returns that URL, or null when every attempt still
 * returned the preview (or failed), or when `isCancelled()` turns true.
 */
export async function fetchPaidPortraitUrl(
  imageId: string,
  getImage: (imageId: string) => Promise<ImageView | null>,
  {
    delaysMs = PAID_PORTRAIT_RETRY_DELAYS_MS,
    isCancelled = () => false,
    sleep = wait,
  }: {
    delaysMs?: readonly number[];
    isCancelled?: () => boolean;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<string | null> {
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (isCancelled()) {
      return null;
    }
    try {
      const url = paidPortraitUrl(await getImage(imageId));
      if (url) {
        return isCancelled() ? null : url;
      }
    } catch (error) {
      console.error("Error fetching the paid portrait:", error);
    }
    if (attempt < delaysMs.length) {
      await sleep(delaysMs[attempt]);
    }
  }
  return null;
}

/** The download name, with the paid file's extension (the paid copy is a PNG). */
export function portraitDownloadName(imageId: string | undefined, url: string): string {
  let extension = "png";
  try {
    const path = new URL(url, "https://tokentails.com").pathname;
    const match = path.match(/\.(png|jpe?g|webp)$/i);
    if (match) {
      extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    }
  } catch {
    // keep png
  }
  return `portrait-${imageId || "download"}.${extension}`;
}
