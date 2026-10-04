import { CatsGallery, type CatsTab } from "@/components/cats/CatsGallery";
import { isAppBuild } from "@/components/claims/build";
import { Claim } from "@/components/claims/Claim";
import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { SeoHead } from "@/components/seo/SeoHead";
import { cdnFile } from "@/constants/utils";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import Link from "next/link";
import { useState } from "react";

// Same frame as /impact: night backdrop, gold-framed cards, Passion One headings, Nunito body.
const CARD =
  "rounded-2xl border-4 border-tt-gold-400/60 bg-tt-night-900/80 p-4 md:p-6 lg:p-8";
const H2 =
  "font-primary uppercase text-p2 md:text-h5 lg:text-h4 leading-none text-tt-cream glow";
const LEAD = "mt-2 max-w-3xl font-sans text-p5 md:text-p4 text-tt-cream/85";

const Cats = () => {
  const [type, setType] = useState<CatsTab>("shelter");

  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead
        title="Cats · Token Tails"
        description="Meet the shelter cats and famous cats in Token Tails. Shelter cats come from partner shelters, and each card shows the shelter's own adoption status."
        path="/cats"
      />
      <div
        className="relative min-h-screen w-full overflow-hidden bg-tt-night-900 text-tt-cream"
        data-testid="cats-page"
      >
        <img
          src={cdnFile("landing/card-bg.webp")}
          alt=""
          aria-hidden
          className="pointer-events-none fixed inset-0 h-full w-full object-cover pixelated opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-gradient-to-b from-tt-night-900/70 via-tt-night-900/60 to-tt-night-900/90"
        />
        <Header />
        <main className="relative z-10 mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-28 md:gap-8 md:px-8 md:pb-16 md:pt-36">
          <header className="flex flex-col gap-3">
            <h1 className="pl-1 font-paws uppercase leading-none text-h4 md:text-h2 text-tt-cream glow">
              Cats
            </h1>
            <p className="max-w-3xl font-sans text-p4 md:text-p3 text-tt-cream/90">
              Real shelter cats from our partner shelters, plus the famous cats
              of Token Tails. Tap a card to flip it, or meet the cat for its
              story.
            </p>
            <p className="flex flex-wrap items-center gap-2 font-sans text-p5 text-tt-cream/85">
              <Claim id="F-026" />
              <Link
                href="/impact"
                className="font-primary uppercase text-p5 text-tt-gold-400 underline underline-offset-2 hover:text-tt-cream"
              >
                See every number on Impact ›
              </Link>
            </p>
          </header>

          <section id="cats" className={`${CARD} scroll-mt-28`} aria-labelledby="cats-title">
            <h2 id="cats-title" className={H2}>
              {type === "shelter" ? "Shelter cats" : "Famous cats"}
            </h2>
            <p className={LEAD}>
              {type === "shelter"
                ? "Cats listed by partner shelters. Portraits of players' own pets never appear here."
                : "The Token Tails house cats."}
            </p>
            {type === "shelter" && (
              <p className="mt-2 flex flex-wrap items-center gap-2 font-sans text-p6 text-tt-cream/75">
                <EvidenceChip kind="shelter-reported" isApp={isAppBuild()} />
                Adoption status comes from the shelters&apos; own records.
              </p>
            )}
            <div className="mt-5">
              <CatsGallery type={type} setType={setType} />
            </div>
          </section>
        </main>
        <Footer tone="night" />
      </div>
    </FirebaseAuthProvider>
  );
};

export default Cats;
