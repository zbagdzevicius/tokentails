import { analytics, buildEvent } from "@/analytics";
import type { AuthStatus, SessionProfile } from "@/context/auth/types";
import type { CrewCtaState } from "./TeamSection";

/**
 * The landing's view of the player (plan G3 "Landing tie-back", 2.13 row 34): signed in or not,
 * whether Meet your cat is still pending, and the cat's name. It drives the crew CTA label, so the
 * label always matches what `/game` will show.
 *
 * Read with an `optional` auth provider: an existing session (a guest's included) is reused and its
 * profile read with `GET /user/profile`, which never creates anything. A visitor without a session
 * stays signed out; no anonymous sign-in, no guest document. The provider runs `passive` here, so
 * the landing sends no writes either (no pending guest-merge retry, no stored referral); `/game`
 * runs both.
 */
export function playerStateFrom(
  status: AuthStatus,
  profile: Partial<SessionProfile> | null | undefined
): CrewCtaState {
  const signedIn = (status === "ready" || status === "guest") && !!profile && !profile.transient;
  if (!signedIn) return { signedIn: false };
  // A missing onboarding field means done (legacy accounts, plan G3), like the game's gate.
  const onboardingState = profile?.onboarding?.state ?? "done";
  return { signedIn: true, onboardingState, catName: profile?.cat?.name ?? null };
}

/** Where on the landing a CTA was tapped (`landing_cta {from}`). */
export type LandingCtaFrom = "hero" | "hero_fallback" | "sample_card" | "crew";

const LANDING_CTA_FROMS: readonly LandingCtaFrom[] = ["hero", "hero_fallback", "sample_card", "crew"];

/** The `?from=` prefix on `/game` that marks a landing CTA (`/game?from=landing_hero`). */
const FROM_PREFIX = "landing_";

/**
 * The `/game` link for a landing CTA. The source rides in the URL and `landing_cta {from}` is sent
 * from `/game` once it has loaded (`trackLandingArrival`): a click handler here would be the
 * landing's first analytics call, and the full page load to `/game` cancels the posthog-js import
 * before it can send (Task 6b review #1). The Heist pill uses `/heist?from=landing`, which feeds
 * `heist_open {from}` the same way.
 */
export const landingCtaHref = (from: LandingCtaFrom) => `/game?from=${FROM_PREFIX}${from}`;

/** The landing CTA a `/game` query names, or null (anything else in `from` is ignored). */
export function landingCtaFromSearch(search: string): LandingCtaFrom | null {
  const raw = new URLSearchParams(search).get("from");
  if (!raw?.startsWith(FROM_PREFIX)) return null;
  const from = raw.slice(FROM_PREFIX.length) as LandingCtaFrom;
  return LANDING_CTA_FROMS.includes(from) ? from : null;
}

/** On `/game`: sends `landing_cta {from}` when the URL names a landing CTA; never throws. */
export function trackLandingArrival(search: string): LandingCtaFrom | null {
  const from = landingCtaFromSearch(search);
  if (!from) return null;
  try {
    analytics.track(buildEvent("landing_cta", { from }));
  } catch {
    // Analytics off or not loaded: the game still opens.
  }
  return from;
}
