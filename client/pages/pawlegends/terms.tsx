import { PAWLEGENDS_CONSENT_VERSION, PAWLEGENDS_MVP_TARGET, UNDER_16_MESSAGE } from "@/components/pawlegends/checkout";
import { pawlegendsEnabled } from "@/components/pawlegends/flags";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

/** The date after which a Founder buyer may ask for a full refund (GDD §8.3). */
export const PAWLEGENDS_REFUND_DATE = "2027-06-30";
export const PAWLEGENDS_REFUND_DAYS = 60;
export const PAWLEGENDS_CONTACT = "info@tokentails.com";

export const PAWLEGENDS_TERMS_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} presale terms - Token Tails`,
  description: `What ${PAWLEGENDS_TITLE} packs deliver now and at launch, refunds, withdrawal, age limits and contact.`,
  path: "/pawlegends/terms",
});

/** One section of the terms. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-primary text-h6 text-tt-gold-400">{title}</h2>
    {children}
  </section>
);

/**
 * `/pawlegends/terms` (POC.md §8.6, GDD §8.3): the presale terms and refund policy. Live before Stripe live
 * mode. The version shown here is the one the purchase sheet sends as `consentVersion` and Stripe stores as
 * `terms_version`; a change to the text needs a new version in `components/pawlegends/checkout.ts` and in
 * `backend/src/pawlegends/pawlegends.contracts.ts`. Readable even while the game's kill switch is on, so buyers
 * can always find it.
 */
export default function PawlegendsTermsPage() {
  const open = pawlegendsEnabled();
  return (
    <>
      <SeoHead {...PAWLEGENDS_TERMS_SEO} noindex />
      <main
        className="fixed inset-0 overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 leading-relaxed text-tt-cream"
        data-testid="pawlegends-terms"
      >
        <article className="mx-auto flex max-w-[44rem] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-primary text-h5">{PAWLEGENDS_TITLE}: presale terms and refunds</h1>
            <p className="text-p6">Version {PAWLEGENDS_CONSENT_VERSION}</p>
          </header>

          <Section title="What you buy">
            <p>
              {PAWLEGENDS_TITLE} is an early version of the game. Every pack shows two lines before you pay: what is
              delivered now, and what is delivered at MVP launch (target {PAWLEGENDS_MVP_TARGET}). Items delivered now
              appear in the game as soon as the payment is confirmed. Prices include VAT.
            </p>
            <p>
              The Starter pack holds only items delivered now. Its 3-day club trial is a bonus, not the paid item.
              Founder Legend seats are limited to the first 500 sold, gifts included.
            </p>
          </Section>

          <Section title="Refunds">
            <ul className="list-disc pl-5">
              <li>
                If the MVP is not live by {PAWLEGENDS_REFUND_DATE}, any Founder buyer can ask for a full refund for{" "}
                {PAWLEGENDS_REFUND_DAYS} days after that date, by email, no questions asked. Items delivered now stay
                with you.
              </li>
              <li>If we stop the game earlier, we email every Founder buyer within 7 days with the same refund offer.</li>
              <li>A refund under these terms returns the whole pack price, including the part for items delivered now.</li>
            </ul>
          </Section>

          <Section title="Your 14-day withdrawal right (EU)">
            <p>
              At checkout you agree to receive the items delivered now at once, and you accept that you lose the 14-day
              withdrawal right for those items only. Items delivered at MVP launch keep the withdrawal right until they
              are delivered.
            </p>
          </Section>

          <Section title="Age limits">
            <ul className="list-disc pl-5">
              <li>Under 16: no purchases. {UNDER_16_MESSAGE}</li>
              <li>16 or 17: at most €30 in any 30 days.</li>
              <li>18 or older: at most €200 in any 30 days. Write to us to raise it.</li>
            </ul>
            <p>Limits count every purchase made with the same email or device. US dollar prices count one to one.</p>
          </Section>

          <Section title="Restoring items">
            <p>
              Items are kept with your email and this browser. In the store, ask for a restore link to get them back in
              any browser. The game app does not show items bought on the web.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions, refunds or a higher limit:{" "}
              <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_CONTACT}
              </a>
              .
            </p>
          </Section>

          <p>
            <a href={open ? "/pawlegends" : "/game"} className="font-bold text-tt-gold-400 underline underline-offset-4">
              {open ? `Back to ${PAWLEGENDS_TITLE}` : "Back to games"}
            </a>
          </p>
        </article>
      </main>
    </>
  );
}
