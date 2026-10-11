/**
 * Growth events (bet #3 `/yourcat`, docs/plans/yourcat-v2.md §7.1).
 *
 * A client-only extension of the event catalog: these names are not in `shared/analytics-core.ts`,
 * which syncs into `catnip-heist/`. `analytics.track` accepts them because `AnalyticsEvent` in
 * `./events` is the union of the core events and these.
 *
 * No property carries personal data: no cat name, photo or avatar URL, record id, user id or email.
 * `family` is a breed bucket. The avatar state is `avatarStatus`, never a URL.
 */
import type { YourcatErrorCode, YourcatPortraitStyle } from "@/models/yourcat";

export const GROWTH_EVENTS = {
  UPLOAD_STARTED: "upload_started",
  UPLOAD_DONE: "upload_done",
  CARD_SHARED: "card_shared",
  PORTRAIT_CHECKOUT_STARTED: "portrait_checkout_started",
  PORTRAIT_PAID: "portrait_paid",
} as const;

export type GrowthEventName = (typeof GROWTH_EVENTS)[keyof typeof GROWTH_EVENTS];

type AvatarStatusAtEvent = "ready" | "pending" | "failed" | "none";

export interface GrowthEventProperties {
  upload_started: {
    surface: "yourcat";
    source: "picker" | "drop" | "manual";
    fileType: "jpeg" | "png" | "webp" | "heic" | "other" | "none";
    sizeBucket: "lt1mb" | "1to5mb" | "5to10mb" | "none";
    resized: boolean;
    utmSource?: string;
    utmMedium?: string;
    utmContent?: string;
  };
  upload_done: {
    surface: "yourcat";
    outcome: "ready" | "error";
    errorCode?: YourcatErrorCode | "NETWORK" | "RATE_LIMITED";
    family?: string;
    avatarStatus?: AvatarStatusAtEvent;
    seconds: number;
  };
  card_shared: {
    surface: "yourcat";
    format: "story" | "post" | "none";
    method: "web-share" | "download" | "copy-link" | "long-press";
    withShelterCat: boolean;
    avatarStatus: AvatarStatusAtEvent;
    /**
     * Seconds from the file selection to the S3 reveal, rounded. `null` when this page view did not
     * measure one (a returning visitor, a manual cat): the p75 behind the "about 30 seconds" copy
     * rule must only count measured reveals.
     */
    secondsToReveal: number | null;
  };
  portrait_checkout_started: {
    surface: "yourcat";
    style: YourcatPortraitStyle;
    priceCents: number;
    currency: "EUR";
  };
  portrait_paid: {
    surface: "yourcat";
    priceCents: number;
    currency: "EUR";
    status: "painting" | "ready";
  };
}

export type GrowthEvent = {
  [K in GrowthEventName]: { name: K; properties: GrowthEventProperties[K] };
}[GrowthEventName];

/** Typed constructor, so call sites never spell a name or shape by hand. */
export function buildGrowthEvent<K extends GrowthEventName>(
  name: K,
  properties: GrowthEventProperties[K],
): { name: K; properties: GrowthEventProperties[K] } {
  return { name, properties };
}

/** Whole seconds between two `Date.now()` readings (never negative). */
export function elapsedSeconds(fromMs: number, toMs: number = Date.now()): number {
  return Math.max(0, Math.round((toMs - fromMs) / 1000));
}
