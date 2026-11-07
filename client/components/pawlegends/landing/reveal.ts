import { LANDING_READY_EVENT } from "@/components/GoogleTagManager";

/**
 * No motion after all (the chunk failed, or the engine threw): show the finished hero now instead of after the 5 s
 * CSS fallback, and tell the deferred work (analytics) the page is ready.
 */
export function revealLanding(landing: Element | null = document.querySelector(".pll")): void {
  landing?.classList.remove("js-intro");
  try {
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
  } catch {
    // An old browser without the Event constructor: analytics still starts on its own cap.
  }
}
