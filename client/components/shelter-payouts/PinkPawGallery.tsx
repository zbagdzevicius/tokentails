import { apiUrl } from "@/api/api";
import { catPath } from "@/api/routing";
import { useStorefront } from "@/hooks/useStorefront";
import { nameFont, needsBodyFont } from "@/lib/glyphs";
import {
  PINK_PAW_SLUG,
  parsePinkPawGalleryBody,
  pinkPawGalleryPath,
  storefrontGalleryResult,
  type PinkPawGalleryCat,
  type PinkPawGalleryResult,
} from "@/shared-contracts/pink-paw";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { photoAlt } from "./pinkPaw";

// Every real Pink Paw cat as a pair: its Token Tails card art and the photo the shelter took, with a
// "Meet <name>" link to the cat's page. The same pairs as the Catnip Heist's payouts modal: both read
// GET /shelter/rozine-pedute/gallery (every cat, uncapped) through shared/pink-paw.ts, so the lists
// never differ. Until that answers (an older backend, or an error) the page falls back to the
// storefront (GET /cat/sale), which stops at the newest 200 cats per shelter: then the counts are
// not shown as the shelter's totals.

/** How long one gallery read is reused on the page (the backend caches it for 45 s too). */
export const GALLERY_TTL_MS = 45_000;

let cached: { at: number; value: Promise<PinkPawGalleryResult | null> } | null = null;

/** Test hook: forget the cached gallery. */
export const resetPinkPawGalleryCache = () => {
  cached = null;
};

/** GET /shelter/rozine-pedute/gallery, or null when it cannot be had. Never rejects. */
export async function fetchPinkPawGallery(
  base: string | undefined = apiUrl,
  f: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined
): Promise<PinkPawGalleryResult | null> {
  if (!base || !f) return null;
  try {
    const res = await f(`${base.replace(/\/+$/, "")}${pinkPawGalleryPath(PINK_PAW_SLUG)}`, { credentials: "omit" });
    if (!res.ok) return null;
    const body = await res.json();
    const gallery = parsePinkPawGalleryBody(body);
    if (!gallery) return null;
    return { ...gallery, source: "gallery", complete: (body as { truncated?: unknown }).truncated !== true };
  } catch {
    return null;
  }
}

/** The uncapped gallery, read once per GALLERY_TTL_MS on the page; null until it answers or fails. */
function useGalleryEndpoint(): { gallery: PinkPawGalleryResult | null; done: boolean } {
  const [state, setState] = useState<{ gallery: PinkPawGalleryResult | null; done: boolean }>({ gallery: null, done: false });
  useEffect(() => {
    let alive = true;
    if (!cached || Date.now() - cached.at > GALLERY_TTL_MS) cached = { at: Date.now(), value: fetchPinkPawGallery() };
    const mine = cached;
    mine.value.then((gallery) => {
      if (!gallery && cached === mine) cached = null; // a failure is tried again on the next mount
      if (alive) setState({ gallery, done: true });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Tiles shown at first, and added by each "Show more". */
export const GALLERY_PAGE = 12;

type Tab = "atShelter" | "adopted";

const TAB_LABEL: Record<Tab, string> = { atShelter: "At the shelter", adopted: "Adopted" };

const STATUS_CHIP: Partial<Record<NonNullable<PinkPawGalleryCat["status"]>, string>> = {
  RECOVERING: "Recovering",
  ADOPTED: "Adopted",
};

/** The two images share one size and one frame, so a card and its photo read as a pair. */
const IMG =
  "block aspect-[671/1000] w-full rounded-xl border-2 border-tt-cream object-cover shadow-[0_3px_0_rgb(var(--tt-night-950))] motion-safe:transition-transform motion-safe:duration-200";

/** One cat: card art and photo side by side, then the Meet link. */
export const PinkPawPair = ({ cat, target }: { cat: PinkPawGalleryCat; target?: string }) => {
  const chip = cat.status ? STATUS_CHIP[cat.status] : undefined;
  return (
    <li data-testid="pink-paw-pair">
      <NextLink
        href={catPath(cat.id)}
        target={target}
        className="group block rounded-2xl p-1 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
        data-testid="pink-paw-pair-link"
      >
        <figure className="m-0">
          <div className="relative grid grid-cols-2 gap-1.5">
            <img
              src={cat.art}
              alt={`${cat.name}'s Token Tails card`}
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`${IMG} bg-tt-night-700 motion-safe:group-hover:-translate-y-0.5`}
            />
            <img
              src={cat.photo}
              alt={photoAlt(cat.name)}
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`${IMG} bg-tt-cream motion-safe:group-hover:-translate-y-0.5`}
            />
            {chip && (
              <span className="absolute right-1 top-1 rounded-md border-2 border-tt-cream bg-tt-night-900/90 px-1.5 py-0.5 font-primary text-[11px] uppercase leading-none tracking-wide text-tt-cream">
                {chip}
              </span>
            )}
          </div>
          <figcaption
            // The body face (Lithuanian letters, lib/glyphs.ts) runs wider than Passion One: a size
            // down and tighter tracking keep "MEET ANKŠTĖ" level with the display captions beside it.
            className={`mt-2 text-center ${nameFont(cat.name)} ${
              needsBodyFont(cat.name) ? "text-p6 md:text-p5 tracking-normal" : "text-p5 md:text-p4 tracking-wide"
            } uppercase leading-none text-tt-gold-400 underline decoration-dotted underline-offset-4 group-hover:text-tt-cream`}
          >
            Meet {cat.name} ›
          </figcaption>
        </figure>
      </NextLink>
    </li>
  );
};

const PairSkeleton = () => (
  <li aria-hidden="true" className="p-1">
    <div className="grid grid-cols-2 gap-1.5">
      <div className="aspect-[671/1000] rounded-xl border-2 border-tt-cream/20 bg-tt-cream/5 motion-safe:animate-pulse" />
      <div className="aspect-[671/1000] rounded-xl border-2 border-tt-cream/20 bg-tt-cream/5 motion-safe:animate-pulse" />
    </div>
    <div className="mx-auto mt-2 h-4 w-24 rounded bg-tt-cream/10" />
  </li>
);

const GRID = "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4";

/**
 * The gallery: cats still at the shelter first (a tab switches to adopted cats), a page of tiles at a
 * time. `target="_top"` when the page sits in a frame.
 */
export const PinkPawGallery = ({ target, initial = GALLERY_PAGE }: { target?: string; initial?: number }) => {
  const endpoint = useGalleryEndpoint();
  const { cats, isLoading, failure } = useStorefront();
  const list = cats[PINK_PAW_SLUG];
  const fallback = useMemo(() => storefrontGalleryResult(list), [list]);
  const gallery = endpoint.gallery ?? fallback;
  // null: the first tab that has cats (an empty "At the shelter" tab never opens first).
  const [picked, setPicked] = useState<Tab | null>(null);
  const [shown, setShown] = useState(initial);
  const tab: Tab = picked ?? (gallery.atShelter.length || !gallery.adopted.length ? "atShelter" : "adopted");
  const items = gallery[tab];
  const total = gallery.atShelter.length + gallery.adopted.length;
  const loading = !endpoint.done || (!endpoint.gallery && isLoading);

  if (!total && loading) {
    return (
      <ul className={GRID} aria-label="Loading Pink Paw cats" data-testid="pink-paw-gallery-loading">
        {Array.from({ length: 4 }, (_, i) => (
          <PairSkeleton key={i} />
        ))}
      </ul>
    );
  }
  if (!total) {
    return (
      <p className="rounded-xl border-2 border-dashed border-tt-cream/30 p-4 text-p5 text-tt-cream/85" data-testid="pink-paw-gallery-empty">
        {failure ? "The shelter's cats could not be loaded right now. " : "No cats to show right now. "}
        <NextLink href="/cats" target={target} className="text-tt-gold-400 underline decoration-dotted underline-offset-2">
          See every shelter cat ›
        </NextLink>
      </p>
    );
  }

  const pick = (next: Tab) => {
    setPicked(next);
    setShown(initial);
  };
  // A list the storefront may have cut (its newest 200) never shows its counts as the shelter's totals.
  const complete = gallery.complete;
  return (
    <div className="flex flex-col gap-4" data-testid="pink-paw-gallery" data-source={gallery.source} data-complete={complete ? "true" : "false"}>
      <div role="tablist" aria-label="Pink Paw cats" className="flex flex-wrap gap-2">
        {(["atShelter", "adopted"] as Tab[]).map((t) =>
          gallery[t].length ? (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => pick(t)}
              data-testid={`pink-paw-tab-${t}`}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 py-1 font-primary text-p5 uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 ${
                tab === t
                  ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                  : "border-tt-cream/50 bg-tt-night-900/70 text-tt-cream hover:border-tt-gold-400"
              }`}
            >
              {TAB_LABEL[t]}
              {complete ? " " : ""}
              {complete && <span className="font-sans font-extrabold">{gallery[t].length}</span>}
            </button>
          ) : null
        )}
      </div>
      <ul className={GRID} aria-label={`${TAB_LABEL[tab]}: Pink Paw cats`} data-testid="pink-paw-pairs">
        {items.slice(0, shown).map((cat) => (
          <PinkPawPair key={cat.id} cat={cat} target={target} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {shown < items.length && (
          <button
            type="button"
            onClick={() => setShown((n) => n + GALLERY_PAGE)}
            data-testid="pink-paw-more"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-tt-gold-400/70 bg-tt-night-900/70 px-5 py-2 font-primary text-p5 uppercase tracking-wide text-tt-gold-400 hover:bg-tt-night-900 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
          >
            Show {Math.min(GALLERY_PAGE, items.length - shown)} more ({items.length - shown} left)
          </button>
        )}
        <p className="text-p6 md:text-p5 text-tt-cream/75" aria-live="polite" data-testid="pink-paw-count">
          {complete
            ? `Showing ${Math.min(shown, items.length)} of ${items.length}`
            : `Showing ${Math.min(shown, items.length)} of the newest ${items.length}`}
        </p>
      </div>
    </div>
  );
};

export default PinkPawGallery;
