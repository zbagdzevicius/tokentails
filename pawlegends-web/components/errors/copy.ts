/**
 * Player-facing fallback copy (decision #89, reworded for Paw Legends: "Something went
 * wrong. Your progress is safe."). One place, so every boundary says the
 * same thing and the copy lint can check it.
 */
export const FALLBACK_COPY = {
  title: "Something went wrong.",
  reassurance: "Your progress is safe.",
  scene: "The game stopped. Try again, or go back to the menu.",
  page: "This page hit a snag. Try again, or reload it.",
  root: "Paw Legends hit a snag. Reload to get back in.",
  modal: "This window hit a snag. Try again, or close it and keep playing.",
  tryAgain: "TRY AGAIN",
  backToMenu: "BACK TO MENU",
  reload: "RELOAD",
  close: "CLOSE",
} as const;
