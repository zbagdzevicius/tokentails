/**
 * `utils.shareURL` (FirebaseAuthContext): opens the system share sheet with the link and its text
 * where the browser has one (`navigator.share`), else copies the link. A share the player cancels
 * (AbortError) does nothing; any other share failure falls back to copying.
 */
export const COPIED_INVITE_MESSAGE =
  "Your invite link is copied to your clipboard. Share it with your friends.";

export function shareLink(
  url: string,
  text: string | undefined,
  toast: (options: { message: string }) => void,
): void {
  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast({ message: COPIED_INVITE_MESSAGE }))
      .catch(() => toast({ message: url }));
  };
  if (typeof navigator.share === "function") {
    navigator.share(text ? { url, text } : { url }).catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== "AbortError") copy();
    });
    return;
  }
  copy();
}
