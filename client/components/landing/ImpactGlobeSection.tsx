import type { PublicImpact } from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { PixelGlobe } from "@/components/globe/Globe";
import { countryName } from "@/components/globe/iso";
import { useReducedMotion } from "@/components/globe/useReducedMotion";
import { cdnFile } from "@/constants/utils";
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
 */
export const ImpactGlobeSection = ({ impact }: ImpactGlobeSectionProps) => {
  const countries = impact?.shelters.countries ?? [];
  // Prospects have no cats in the game yet (review 3f #9); past partners' cats still are.
  const shelters = (impact?.shelters.items ?? []).filter(
    (s) => s.role !== "house" && s.partnerStatus !== "prospect" && s.name
  );
  const reducedMotion = useReducedMotion();
  const asOf = impact?.asOf.mongo ?? impact?.generatedAt ?? null;

  return (
    <section
      className="relative min-h-screen w-full overflow-hidden"
      data-testid="impact-globe"
    >
      <img
        src={cdnFile("landing/globe.webp")}
        className="w-full h-full object-cover inset-0 absolute"
        alt=""
      />
      <div className="absolute inset-x-0 top-0 z-[35] h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center z-30 overflow-hidden">
        <PixelGlobe countries={countries} />
      </div>

      <div className="absolute z-40 flex flex-col max-md:inset-x-4 max-md:bottom-[150px] max-md:items-center max-md:text-center md:pt-20 md:left-8 lg:left-16 md:top-1/2 md:-translate-y-1/2 md:items-start md:max-w-[min(38vw,520px)]">
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
                    key={s.slug}
                    className="font-primary uppercase leading-none text-p4 md:text-h5 lg:text-h4 text-tt-cream glow drop-shadow-lg"
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>

      <div className="absolute bottom-8 md:bottom-12 lg:bottom-16 left-1/2 -translate-x-1/2 z-40 w-full px-4 text-center">
        <Link
          href="/impact"
          className="inline-block rounded-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400 motion-safe:transition-transform motion-safe:hover:scale-[1.02]"
          data-testid="impact-link"
        >
          <span className="block text-p1 md:text-h4 xl:text-h1 2xl:text-[142px] 3xl:text-[196px] font-bold uppercase drop-shadow-lg font-primary text-balance md:whitespace-nowrap text-white leading-none">
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
