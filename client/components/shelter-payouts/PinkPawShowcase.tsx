import { catPath } from "@/api/routing";
import { CardAction } from "@/components/tailsCard/CardAction";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { useStorefront } from "@/hooks/useStorefront";
import { BlessingStatusTexts } from "@/models/cats";
import { nameFont } from "@/lib/glyphs";
import NextLink from "next/link";
import { type ReactNode, useMemo } from "react";
import { PinkPawGallery } from "./PinkPawGallery";
import {
  PINK_PAW_LOGO,
  PINK_PAW_LOCAL_NAME,
  PINK_PAW_LOGO_ALT,
  PINK_PAW_SLUG,
  PINK_PAW_SOCIALS,
  ShowcaseCat,
  catName,
  headingName,
  photoAlt,
  pickShowcaseCats,
} from "./pinkPaw";

// Pink Paw's real face on the payout pages: the shelter's logo, its real cats as the same Tails
// cards the landing shows, and the photos the shelter took of them. The cats come from the one
// storefront query (useStorefront), so this adds no request on pages that already read it.

/** The shelter's logo on a white disc with a cream rim and the landing's gold glow. */
export const PinkPawLogo = ({ className = "h-28 w-28 md:h-32 md:w-32" }: { className?: string }) => (
  <span
    className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-tt-cream bg-white shadow-[0_0_28px_rgb(var(--tt-gold-400)/.35)] ${className}`}
    data-testid="pink-paw-logo"
  >
    <img src={PINK_PAW_LOGO} alt={PINK_PAW_LOGO_ALT} draggable={false} className="h-full w-full object-contain" />
  </span>
);

const SocialLinks = ({ target }: { target?: string }) => (
  <ul className="flex flex-wrap justify-center gap-2 sm:justify-start" aria-label="Pink Paw on social media">
    {PINK_PAW_SOCIALS.map((s) => (
      <li key={s.label}>
        <a
          href={s.href}
          target={target ?? "_blank"}
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-tt-cream/50 bg-tt-night-900/70 px-3 py-1 font-primary text-p5 uppercase tracking-wide text-tt-cream transition hover:border-tt-gold-400 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
        >
          <img src={s.icon} alt="" aria-hidden="true" className="h-6 w-6" draggable={false} />
          {s.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
    ))}
  </ul>
);

/** The shelter's own name, under the English one: body font, so "ė" renders in the face. */
const LocalName = ({ className = "" }: { className?: string }) => (
  <span lang="lt" className={`normal-case tracking-normal ${className}`} data-testid="pink-paw-local-name">
    {PINK_PAW_LOCAL_NAME}
  </span>
);

/** Logo, name, where it is and its own pages. */
export const PinkPawIdentity = ({ name, target }: { name: string; target?: string }) => (
  <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left" data-testid="pink-paw-identity">
    <PinkPawLogo />
    <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
      <h3 className="flex flex-col items-center gap-1 sm:items-start">
        <span className="font-primary text-h6 md:text-h5 uppercase leading-none text-tt-cream text-balance">{headingName(name)}</span>
        <LocalName className="text-p4 md:text-p3 font-bold text-tt-cream/90" />
      </h3>
      <p className="text-p5 md:text-p4 text-tt-cream/85">A cat shelter in Lithuania. Every cat below is one of theirs.</p>
      <SocialLinks target={target} />
    </div>
  </div>
);

const CARD_RATIO = 23 / 17;
const CARD_PX = 208;
// Tails cards size everything inside in cqw (see tailsCard/cardScale.ts), so a card renders
// correctly at any width: no draw-big-then-scale wrapper is needed.
const CARD_STYLE = { width: CARD_PX, maxWidth: "none" } as const;

// The card is decoration here (the caption and the "Meet" link name the cat), so it is hidden
// from screen readers. Its particle effects are clipped to the card (they would widen the row
// and give it a scrollbar), and every animation inside stops under reduced motion.
const CARD_FRAME =
  "overflow-hidden rounded-[20px] [contain:paint] motion-reduce:[&_*]:!animate-none motion-reduce:[&_*]:!transition-none";

const CardSkeleton = () => (
  <li
    aria-hidden="true"
    className="shrink-0 rounded-[20px] border-4 border-tt-cream/20 bg-tt-cream/5 motion-safe:animate-pulse"
    style={{ width: CARD_PX, height: Math.round(CARD_PX * CARD_RATIO) }}
  />
);

/** A row of real Pink Paw cards; scrolls sideways on a phone. */
export const PinkPawCards = ({ cats, loading, target }: { cats: ShowcaseCat[]; loading?: boolean; target?: string }) => (
  <div className="-mx-4 md:mx-0">
    <ul
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-4 [scrollbar-width:thin] md:flex-wrap md:justify-center md:overflow-visible md:px-0"
      aria-label="Pink Paw cats"
      data-testid="pink-paw-cards"
    >
      {loading && !cats.length
        ? Array.from({ length: 5 }, (_, i) => <CardSkeleton key={i} />)
        : cats.map((cat, i) => (
            <li key={cat._id} className="flex shrink-0 snap-start flex-col items-center gap-2" data-testid="pink-paw-card">
              {/* The whole card opens the cat's page; the badge wraps outside the clipped frame. */}
              <CardAction href={catPath(cat._id as string)} clientNav target={target} size="md" ping={i === 0} ariaLabel={`Meet ${catName(cat)}`}>
                <span className={`${CARD_FRAME} block`} aria-hidden="true" data-testid="pink-paw-card-art">
                  <TailsCard cat={{ ...cat, name: catName(cat) }} cardStyle={CARD_STYLE} />
                </span>
              </CardAction>
              <p className={`${nameFont(catName(cat))} text-p4 uppercase leading-none text-tt-cream`}>{catName(cat)}</p>
              {cat.blessing.status && (
                <p className="text-p6 md:text-p5 text-tt-cream/75">{BlessingStatusTexts[cat.blessing.status]}</p>
              )}
              <NextLink
                href={catPath(cat._id as string)}
                target={target}
                className={`inline-flex min-h-11 items-center px-2 ${nameFont(catName(cat))} text-p5 uppercase tracking-wide text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400`}
              >
                Meet {catName(cat)} ›
              </NextLink>
            </li>
          ))}
    </ul>
  </div>
);

// Full class names, so Tailwind sees them.
const TILT = ["motion-safe:-rotate-2", "motion-safe:rotate-1", "motion-safe:-rotate-1", "motion-safe:rotate-2"];

/** The shelter's own photos, as small polaroids. */
export const PinkPawPhotos = ({ cats, compact = false }: { cats: ShowcaseCat[]; compact?: boolean }) =>
  cats.length ? (
    <ul
      className={`mx-auto grid w-full gap-3 md:gap-5 ${compact ? "max-w-xl grid-cols-3" : "max-w-4xl grid-cols-2 md:grid-cols-4"}`}
      aria-label="Photos from the Pink Paw shelter"
      data-testid="pink-paw-photos"
    >
      {cats.map((cat, i) => (
        <li key={cat._id}>
          <figure
            className={`rounded-xl border-4 border-tt-cream bg-tt-cream p-1.5 pb-2 shadow-[0_8px_24px_rgb(0_0_0/.45)] transition-transform ${TILT[i % TILT.length]} motion-safe:hover:rotate-0 motion-safe:hover:scale-[1.03]`}
          >
            <img
              src={cat.blessing.image.url}
              alt={photoAlt(catName(cat))}
              loading="lazy"
              draggable={false}
              className="aspect-[3/4] w-full rounded-lg object-cover"
            />
            <figcaption className={`mt-1.5 text-center ${nameFont(catName(cat))} text-p5 md:text-p4 uppercase leading-none text-tt-gold-ink`}>
              {catName(cat)}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  ) : null;

/** The shelter's cats from the shared storefront query: `cards` picks, then `photos` more after them. */
export function usePinkPawCats(cards: number, photos: number) {
  const { cats, isLoading, failure } = useStorefront();
  const list = cats[PINK_PAW_SLUG];
  return useMemo(() => {
    const picked = pickShowcaseCats(list, cards + photos);
    return {
      cards: picked.slice(0, cards),
      photos: picked.slice(cards, cards + photos),
      loading: isLoading,
      failed: !!failure,
    };
  }, [list, cards, photos, isLoading, failure]);
}

/** The cats block: heading, note and the full gallery (card art + photo pairs with Meet links). */
export const PinkPawCatsSection = ({ target, title = true }: { target?: string; title?: boolean }) => (
  <div className="flex flex-col gap-3 scroll-mt-28" id="pink-paw-cats" data-testid="pink-paw-cats-section">
    {title && (
      <h3 className="font-primary text-p3 md:text-p2 uppercase leading-none text-white">
        Meet the cats <span className="glow text-tt-cream">your treats help</span>
      </h3>
    )}
    <p className="text-p6 md:text-p5 text-tt-cream/75">
      Real cats from the shelter: each one&apos;s Token Tails card, and the photo the shelter took.
    </p>
    <PinkPawGallery target={target} />
    <NextLink
      href="/cats"
      target={target}
      className="self-center font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream"
    >
      See every shelter cat ›
    </NextLink>
  </div>
);

/** The full showcase block for /shelter-payouts. */
export const PinkPawShowcase = ({
  name,
  target,
  children,
}: {
  name: string;
  target?: string;
  /** Shown between the shelter's identity and its cats (the payout page's wallet and goal). */
  children?: ReactNode;
}) => (
  // The gallery is the Heist modal's: card art and the shelter's photo of every real cat.
  <div className="flex flex-col gap-6 md:gap-8" data-testid="pink-paw-cats">
    <PinkPawIdentity name={name} target={target} />
    {children}
    <PinkPawCatsSection target={target} />
  </div>
);

/** Compact block for the give and receipt pages: logo, name and three real photos. */
export const PinkPawStrip = ({
  name,
  title,
  showLogo = true,
}: {
  name: string;
  title: string;
  /** Off where the page hero already shows the logo (/give). */
  showLogo?: boolean;
}) => {
  const { photos } = usePinkPawCats(0, 3);
  return (
    <section className="flex w-full flex-col items-center gap-4" data-testid="pink-paw-strip">
      <h2 className="font-primary text-p2 md:text-p1 uppercase leading-none text-white text-center">{title}</h2>
      <div className="flex items-center gap-3">
        {showLogo && <PinkPawLogo className="h-14 w-14 md:h-16 md:w-16 !border-2" />}
        <p className={`flex flex-col gap-0.5 ${showLogo ? "items-start text-left" : "items-center text-center"}`}>
          <span className="font-primary text-p4 md:text-p3 uppercase leading-tight text-tt-cream">{headingName(name)}</span>
          <LocalName className="text-p6 md:text-p5 font-bold text-tt-cream/85" />
        </p>
      </div>
      <PinkPawPhotos cats={photos} compact />
      <NextLink
        href="/cats"
        className="font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream"
      >
        Meet more shelter cats ›
      </NextLink>
    </section>
  );
};

export default PinkPawShowcase;
