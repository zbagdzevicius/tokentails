import { catPath } from "@/api/routing";
import { CardAction } from "@/components/tailsCard/CardAction";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { useStorefront } from "@/hooks/useStorefront";
import { nameFont } from "@/lib/glyphs";
import { BlessingStatusTexts, ICat } from "@/models/cats";
import NextLink from "next/link";

/*
 * The /cats grid, in the /impact night style: the same scaled Tails card as the Pink Paw row
 * (cards size their insides in cqw, so a fixed width is enough), a gold "Meet" link, and the
 * shelter's own adoption status. The card itself is a link too, with the gold "open" badge.
 * Only /cats uses it.
 */

export type CatsTab = "shelter" | "famous";

const CARD_PX = 208;
const CARD_RATIO = 23 / 17;
// Two columns on a phone (the card scales to its column), fixed 208 px columns from sm up.
const CARD_STYLE = { width: "100%", maxWidth: CARD_PX } as const;
const CARD_FRAME =
  "overflow-hidden rounded-[20px] [contain:paint] motion-reduce:[&_*]:!animate-none motion-reduce:[&_*]:!transition-none";
const NOTE =
  "mt-4 rounded-xl border-2 border-dashed border-tt-cream/30 p-4 font-sans text-p5 text-tt-cream/80";

const TABS: [CatsTab, string][] = [
  ["shelter", "Shelter cats"],
  ["famous", "Famous cats"],
];

const CardSkeleton = () => (
  <li
    aria-hidden="true"
    className="w-full max-w-[208px] justify-self-center rounded-[20px] border-4 border-tt-cream/20 bg-tt-cream/5 motion-safe:animate-pulse"
    style={{ aspectRatio: `${1 / CARD_RATIO}` }}
  />
);

const CatCard = ({ cat, ping }: { cat: ICat; ping: boolean }) => {
  const name = cat.name || "Cat";
  const status = cat.blessing?.status;
  return (
    <li className="flex min-w-0 flex-col items-center gap-2 text-center" data-testid="cats-card">
      {/* The whole card opens the cat's page, like the "Meet" link under it. */}
      <CardAction
        href={catPath(cat._id ?? "")}
        clientNav
        size="md"
        ping={ping}
        ariaLabel={`Meet ${name}`}
        fill
        className="max-w-[208px]"
      >
        <span className={`${CARD_FRAME} block w-full`} aria-hidden="true">
          <TailsCard cat={cat} cardStyle={CARD_STYLE} className="!block w-full" />
        </span>
      </CardAction>
      <p className={`${nameFont(name)} text-p4 uppercase leading-none text-tt-cream`}>{name}</p>
      {status && <p className="font-sans text-p6 md:text-p5 text-tt-cream/75">{BlessingStatusTexts[status]}</p>}
      <NextLink
        href={catPath(cat._id ?? "")}
        className={`inline-flex min-h-11 items-center px-2 ${nameFont(name)} text-p5 uppercase tracking-wide text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400`}
      >
        Meet {name} ›
      </NextLink>
    </li>
  );
};

export const CatsGallery = ({ type, setType }: { type: CatsTab; setType: (t: CatsTab) => void }) => {
  const { partnerCats, famousCats, isLoading, failure, isRetrying, retry } = useStorefront();
  const cats = type === "shelter" ? partnerCats : famousCats;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Which cats" className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={type === key}
            onClick={() => setType(key)}
            className={`min-h-[44px] rounded-lg border-2 px-3 font-primary uppercase text-p5 md:text-p4 ${
              type === key
                ? "border-tt-gold-400 bg-tt-gold-400 text-tt-night-900"
                : "border-tt-cream/40 text-tt-cream/85 hover:border-tt-gold-400 hover:text-tt-gold-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {failure ? (
        <div role="alert" data-testid="storefront-degraded" className={`${NOTE} flex flex-col items-start gap-3`}>
          <p>We couldn&apos;t load the cats just now.</p>
          <button
            type="button"
            disabled={isRetrying}
            onClick={retry}
            className="min-h-[44px] rounded-lg border-2 border-tt-gold-400 px-3 font-primary uppercase text-p5 text-tt-gold-400 disabled:opacity-60"
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : !isLoading && !cats.length ? (
        <p data-testid="storefront-empty" className={NOTE}>
          {type === "shelter"
            ? "All adopted, thank you! New shelter cats arrive soon."
            : "No famous cats right now. Check back soon."}
        </p>
      ) : (
        <ul
          className="grid grid-cols-2 justify-center gap-x-3 gap-y-6 sm:gap-x-4 sm:[grid-template-columns:repeat(auto-fill,208px)]"
          aria-label={type === "shelter" ? "Shelter cats" : "Famous cats"}
          aria-busy={isLoading}
          data-testid="cats-grid"
        >
          {isLoading
            ? Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)
            : cats.map((cat, i) => <CatCard key={cat._id ?? `cat-${i}`} cat={cat} ping={i === 0} />)}
        </ul>
      )}
    </div>
  );
};

export default CatsGallery;
