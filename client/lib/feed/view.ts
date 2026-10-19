/**
 * Client-safe helpers for the blog pages (no fs): category data, date formatting and the page
 * title rule. The engine (lib/feed/engine.ts) is build-time only.
 */
import taxonomy from "./taxonomy.json";
import type { FeedCategory, FeedSummary } from "./engine";

export const FEED_CATEGORIES: readonly FeedCategory[] = taxonomy.categories;

export const feedCategory = (slug: string): FeedCategory | null =>
  FEED_CATEGORIES.find((c) => c.slug === slug) ?? null;

/** "19 Oct 2026" in UTC, the same on the server and in the browser (no hydration drift). */
export function formatFeedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** `<time dateTime>`: the date part only for date-only values. */
export const machineDate = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toISOString());

const BRAND_SUFFIX = " | Token Tails";

/** The `<title>`: seoTitle, else the title with the brand when it still fits in 60 characters. */
export function articleTitleTag(a: Pick<FeedSummary, "title" | "seoTitle">): string {
  if (a.seoTitle) return a.seoTitle;
  return a.title.length + BRAND_SUFFIX.length <= 60 ? `${a.title}${BRAND_SUFFIX}` : a.title;
}

export const sameDay = (a: string, b: string) => machineDate(a).slice(0, 10) === machineDate(b).slice(0, 10);
