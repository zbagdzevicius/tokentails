import { cdnFile } from "@/constants/utils";
import { BlessingStatus, ICat } from "@/models/cats";

// Pink Paw (Rožinė pėdutė), the showcase shelter: its real logo, its public social pages and the
// pick of its real cats (the storefront's `rozine-pedute` key, the same data /cats shows). Every
// image here is the shelter's own: the logo, the photos it uploaded, and the card art made from
// them. No numbers about the shelter are stated here: a figure would need a facts-registry entry.

/** The storefront key of the shelter's cats (GET /cat/sale). */
export const PINK_PAW_SLUG = "rozine-pedute";

/** The shelter's English name: display headings use it alone (their face has no "ė"). */
export const PINK_PAW_NAME = "Pink Paw";

/** The shelter's own (Lithuanian) name, shown under the English one in the body font. */
export const PINK_PAW_LOCAL_NAME = "Rožinė pėdutė";

/**
 * The shelter's wallet (client/public/shelter-payouts/campaign.json). The logo, cats and photos
 * are shown only when a campaign or payout is for this wallet: under another shelter's name they
 * would be an untrue claim.
 */
export const PINK_PAW_WALLET = "0xe299299b846ba629f5a591dbf4f562bcc07a0f37";

/** True when `addr` is Pink Paw's wallet (any letter case). */
export const isPinkPawWallet = (addr: string | null | undefined) =>
  !!addr && addr.toLowerCase() === PINK_PAW_WALLET;

/** A shelter name for a display heading: the part before a bracketed local name ("Pink Paw (Rožinė pėdutė)" → "Pink Paw"). */
export const headingName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;

/** The shelter's real logo (the one the old landing used; on the CDN under logo/shelters). */
export const PINK_PAW_LOGO = cdnFile("logo/shelters/pink-paw.webp");

/** Alt text for the logo: what the image shows, by the shelter's own name. */
export const PINK_PAW_LOGO_ALT = "Rožinė pėdutė (Pink Paw) shelter logo: a cat's paw holding a daisy";

/** The shelter's own pages (as linked on the old landing). */
export const PINK_PAW_SOCIALS = [
  { label: "Facebook", href: "https://www.facebook.com/rozine.pedute", icon: cdnFile("icons/social/facebook.webp") },
  { label: "Instagram", href: "https://www.instagram.com/rozine.pedute/", icon: cdnFile("icons/social/ig.webp") },
  { label: "TikTok", href: "https://www.tiktok.com/@rozine.pedute", icon: cdnFile("icons/social/tiktok.webp") },
] as const;

/** A cat the showcase can show: it has a real photo and its card art. */
export type ShowcaseCat = ICat & {
  blessing: NonNullable<ICat["blessing"]> & { image: { url: string }; catAvatar: { url: string } };
};

const hasArt = (cat: ICat): cat is ShowcaseCat =>
  !!cat?._id && !!cat.blessing?.image?.url && !!cat.blessing?.catAvatar?.url;

// Cats still at the shelter come first: they are the ones a treat helps today. Cats that died
// (HEAVEN) are never shown in a "meet the cats" row.
const RANK: Partial<Record<BlessingStatus, number>> = {
  [BlessingStatus.WAITING]: 0,
  [BlessingStatus.RECOVERING]: 0,
  [BlessingStatus.ADOPTED]: 1,
};

/** Days since the Unix epoch (UTC): the row rotates once a day, and stays put within a day. */
export const dayIndex = (now: Date = new Date()) => Math.floor(now.getTime() / 86_400_000);

/**
 * `n` real Pink Paw cats for the showcase: only cats with a photo and card art, never a cat in
 * HEAVEN, the shelter's current cats before adopted ones, starting at a daily offset so the row
 * changes from day to day without reshuffling on every render.
 */
export function pickShowcaseCats(cats: readonly ICat[] | undefined, n: number, day: number = dayIndex()): ShowcaseCat[] {
  if (!cats?.length || n <= 0) return [];
  const usable = cats.filter(hasArt).filter((c) => (c.blessing.status ? RANK[c.blessing.status] !== undefined : true));
  const rank = (c: ShowcaseCat) => (c.blessing.status ? RANK[c.blessing.status] ?? 1 : 1);
  const out: ShowcaseCat[] = [];
  for (const tier of [0, 1]) {
    const group = usable.filter((c) => rank(c) === tier);
    if (!group.length) continue;
    const start = ((day % group.length) + group.length) % group.length;
    for (let i = 0; i < group.length && out.length < n; i++) out.push(group[(start + i) % group.length]);
    if (out.length >= n) break;
  }
  return out;
}

/** Alt text for a cat's real photo. */
export const photoAlt = (name: string) => `${name}, a cat at the Pink Paw shelter (photo from the shelter)`;

/** The cat's name as the shelter typed it, with a capital first letter ("judas" → "Judas", "RAUDVIS" → "Raudvis"). */
export function catName(cat: Pick<ICat, "name"> & { blessing?: { name?: string } | null }): string {
  const raw = (cat.blessing?.name || cat.name || "").trim();
  if (!raw) return "This cat";
  const base = raw === raw.toUpperCase() ? raw.toLowerCase() : raw;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
