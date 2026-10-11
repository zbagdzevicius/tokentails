/**
 * Web Share helper (docs/plans/yourcat-v2.md §5.6).
 *
 * `shareCardFile` is called synchronously from the tap handler with an already rendered `File`, and
 * `navigator.share` is its first call, with no `await` before it: iOS drops the user activation after
 * an await. The URL travels in `text`, never as `url` next to `files` (several share targets then drop
 * the file).
 */

export type ShareOutcome = "web-share" | "download" | "copy-link" | "long-press" | "cancelled" | "failed";

const IN_APP = /Instagram|FBAN|FBAV|musical_ly|TikTok|BytedanceWebview/i;

/** In-app browsers have no Web Share with files and block `<a download>`: S3 shows the long-press view. */
export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.test(userAgent || "");
}

/** True when the browser can share this exact file. Never throws. */
export function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === "undefined") return false;
  try {
    return typeof navigator.share === "function" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/** Saves the file with a temporary `<a download>`; the object URL is revoked after 1 s. */
export function downloadFile(file: File): boolean {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

const isAbort = (error: unknown) =>
  !!error && typeof error === "object" && (error as { name?: string }).name === "AbortError";

/**
 * Web Share with the file when the browser can share it; otherwise a download. `cancelled` when the
 * visitor closed the share sheet (no `card_shared` event then).
 */
export function shareCardFile(file: File, text: string): Promise<ShareOutcome> {
  if (canShareFile(file)) {
    let pending: Promise<void>;
    try {
      pending = navigator.share({ files: [file], title: "Token Tails", text });
    } catch (error) {
      return Promise.resolve(isAbort(error) ? "cancelled" : "failed");
    }
    return Promise.resolve(pending).then(
      (): ShareOutcome => "web-share",
      (error): ShareOutcome => (isAbort(error) ? "cancelled" : "failed"),
    );
  }
  return Promise.resolve(downloadFile(file) ? "download" : "failed");
}

/** "Copy link": the share text to the clipboard. `failed` means the page shows the select-and-copy field. */
export async function copyShareText(text: string): Promise<"copy-link" | "failed"> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return "failed";
    await navigator.clipboard.writeText(text);
    return "copy-link";
  } catch {
    return "failed";
  }
}
