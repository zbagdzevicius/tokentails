/**
 * Player-facing fallback copy (decision #89: approve the "Something went
 * wrong. Your cats are safe." set). One place, so every boundary says the
 * same thing and the copy lint can check it.
 */
export const FALLBACK_COPY = {
  title: "Something went wrong.",
  reassurance: "Your cats are safe.",
  scene: "This game stopped. Try it again, or head back to the menu.",
  page: "This page hit a snag. Try again, or reload the page.",
  root: "Token Tails hit a snag. Reload to get back in.",
  modal: "This window hit a snag. Try again, or close it and keep playing.",
  tryAgain: "TRY AGAIN",
  backToMenu: "BACK TO MENU",
  reload: "RELOAD",
  close: "CLOSE",
} as const;
