import type { PublicImpact } from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import { Claim } from "@/components/claims/Claim";
import { PixelGlobe } from "@/components/globe/Globe";
import { countryName } from "@/components/globe/iso";
import { useReducedMotion } from "@/components/globe/useReducedMotion";
import { cdnFile } from "@/constants/utils";
import { nameFont } from "@/lib/glyphs";
import { PINK_PAW_LOCAL_NAME, PINK_PAW_NAME } from "@/components/shelter-payouts/pinkPaw";
import { landingShelterEntries } from "./shelterNames";
import dynamic from "next/dynamic";
import Link from "next/link";

// Fireflies lays itself out with Math.random(); rendering it only on the client keeps the server
// HTML and the first client render identical (no hydration warning on the landing).
const Fireflies = dynamic(
  () => import("@/components/shared/Fireflies").then((m) => m.Fireflies),
  { ssr: false }
);

interface ImpactGlobeSectionProps {
  impact: PublicImpact | null;
}

/**
 * The globe section (plan G4, G11; decisions #29, #30). The headline counts the countries of the
 * active partner shelters in the impact snapshot (L-countries) and the globe lights exactly those.
 * While no shelter has an active partner status and a country code, it lists the shelters whose cats
 * are in the game instead of a number. "800+ strays saved" is gone until confirmed in writing (F-024).
 * Under it, on the web, what Token Tails reports giving directly (F-026), kept apart from the rail.
 */
export const ImpactGlobeSection = ({ impact }: ImpactGlobeSectionProps) => {
  const countries = impact?.shelters.countries ?? [];
  // Prospects have no cats in the game yet (review 3f #9); past partners' cats still are.
  // Pink Paw is Rožinė pėdutė: one entry, whichever name or slug the snapshot rows use.
  const shelters = landingShelterEntries(
    (impact?.shelters.items ?? []).filter(
      (s) => s.role !== "house" && s.partnerStatus !== "prospect" && s.name
    )
  );
  const reducedMotion = useReducedMotion();
  const asOf = impact?.asOf.mongo ?? impact?.generatedAt ?? null;
  const isApp = isAppBuild();

  return (
    <section
      // Phones stack globe, stats and link in normal flow (no text drawn over the globe); from
      // md up the stats sit beside the globe and the link under it.
      className="relative min-h-screen w-full overflow-hidden max-md:flex max-md:flex-col"
      data-testid="impact-globe"
    >
      <img
        src={cdnFile("landing/globe.webp")}
        className="w-full h-full object-cover inset-0 absolute"
        alt=""
      />
      <div className="absolute inset-x-0 top-0 z-[35] h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center z-30 overflow-hidden max-md:relative max-md:h-auto max-md:pt-36 max-md:pb-2 md:-translate-y-[4%]">
        <PixelGlobe countries={countries} />
      </div>

      <div className="relative z-40 flex flex-col max-md:mt-4 max-md:px-4 max-md:items-center max-md:text-center md:absolute md:pt-20 md:left-8 lg:left-16 md:top-1/2 md:-translate-y-1/2 md:items-start md:max-w-[min(30vw,440px)]">
        {countries.length > 0 ? (
          <Claim
            id="L-countries"
            values={{ n: countries.length }}
            liveAsOf={asOf}
            variant="stat"
            className="!text-left [&_.claim-figure]:text-[100px] lg:[&_.claim-figure]:text-[200px] [&_.claim-figure]:text-tt-cream [&_.claim-figure]:[text-shadow:0_0_5px_#ffe89a,0_0_12px_#ffcf66,0_0_25px_#ffb84d] [&_.claim-text]:text-p3 md:[&_.claim-text]:text-p1 [&_.claim-text]:font-primary [&_.claim-text]:text-tt-cream [&>span]:justify-start"
          >
            <span className="mt-2 block font-sans text-p6 normal-case text-tt-cream/80">
              {countries.map(countryName).join(" · ")}
            </span>
          </Claim>
        ) : (
          shelters.length > 0 && (
            <div data-testid="partner-shelters">
              <p className="font-primary uppercase tracking-wide text-p5 md:text-p3 text-tt-cream/90 drop-shadow-lg">
                Cats in the game come from
              </p>
              <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 md:flex-col md:justify-start">
                {shelters.map((s) => (
                  <li
                    key={s.key}
                    data-testid="partner-shelter"
                    className={`${nameFont(s.pinkPaw ? PINK_PAW_NAME : s.name)} uppercase leading-none text-p4 md:text-h5 lg:text-h4 text-tt-cream glow drop-shadow-lg`}
                  >
                    {s.pinkPaw ? (
                      // One entry with the same face, size and glow as the others. The display face
                      // has no "ė", so the shelter's own name in brackets is set in the body face,
                      // extra-bold and a step smaller (Nunito runs wider), as it is spelled. It stays
                      // on the same line where the column has room and wraps as one unit otherwise.
                      <>
                        {PINK_PAW_NAME}{" "}
                        <span lang="lt" className="font-sans font-extrabold normal-case whitespace-nowrap text-[0.6em]">
                          ({PINK_PAW_LOCAL_NAME})
                        </span>
                      </>
                    ) : (
                      s.name
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
        {/* claim: F-026 (web only, as it was in Track record; the app shows it in the lobby strip) */}
        {!isApp && (
          <div data-testid="given-directly-landing" className="mt-6 w-full md:mt-8">
            <Claim
              id="F-026"
              variant="hero"
              isApp={false}
              className="max-md:!text-center [&_.claim-figure]:text-[3.5rem] md:[&_.claim-figure]:text-[5rem] [&_.claim-text]:text-p4 md:[&_.claim-text]:text-p3 [&_.claim-text]:drop-shadow-lg max-md:[&>span:last-of-type]:justify-center"
            />
          </div>
        )}
      </div>

      <div className="relative z-40 w-full px-4 pb-20 pt-10 text-center md:absolute md:bottom-12 md:left-1/2 md:-translate-x-1/2 md:p-0 md:px-4 lg:bottom-16">
        <Link
          href="/impact"
          className="inline-block rounded-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400 motion-safe:transition-transform motion-safe:hover:scale-[1.02]"
          data-testid="impact-link"
        >
          <span className="block text-p1 md:text-h4 xl:text-h2 2xl:text-h1 3xl:text-[142px] font-bold uppercase drop-shadow-lg font-primary text-balance md:whitespace-nowrap text-white leading-none">
            SEE THE <span className="glow text-tt-cream">REAL-WORLD</span>{" "}
            <span className="text-tt-cream">IMPACT</span>
          </span>
          <span className="mt-2 block font-primary uppercase tracking-widest text-p6 md:text-p4 text-tt-cream/80">
            Every number, its date and its source ›
          </span>
        </Link>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[35] h-40 md:h-64 bg-gradient-to-b from-transparent via-tt-night-900/60 to-tt-night-900 pointer-events-none" />
      {/* Fireflies has no reduced-motion mode of its own; leave it out instead. */}
      {!reducedMotion && <Fireflies />}
    </section>
  );
};

export default ImpactGlobeSection;
