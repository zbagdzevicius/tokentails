import { MEET_PERKS, PAWLEGENDS_CONSENT_VERSION, UNDER_16_MESSAGE } from "@/components/pawlegends/checkout";
import { PAWLEGENDS_CONTACT, PAWLEGENDS_PRIVACY_URL, pawlegendsEnabled } from "@/components/pawlegends/flags";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { Prices } from "@/models/cats";

export { PAWLEGENDS_CONTACT };

export const PAWLEGENDS_TERMS_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} terms - Token Tails`,
  description: `What a named cat bought from ${PAWLEGENDS_TITLE} delivers, the EU withdrawal notice, age limits and contact.`,
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
 * `/pawlegends/terms` (launch item U5): the terms for the one thing the game sells, the $5 named cat
 * (`Prices.shelterCat`) opened from its "Meet <cat>" card (`PawlegendsCatSheet`). Default wording; the founder's
 * legal OK is pending. The version shown here is the one the cat sheet sends as `consentVersion` when the buyer ticks the consent box, and
 * the backend records it with the payment; a change to the text needs a new version in
 * `components/pawlegends/checkout.ts` and in `backend/src/pawlegends/pawlegends.contracts.ts`. Readable even while
 * the game's kill switch is on, so buyers can always find it.
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
            <h1 className="font-primary text-h5">{PAWLEGENDS_TITLE}: terms</h1>
            <p className="text-p6">Version {PAWLEGENDS_CONSENT_VERSION}</p>
          </header>

          <Section title="The game">
            <p>
              {PAWLEGENDS_TITLE} is free to play in the browser: you never have to pay to play it. It is made by Token
              Tails and is still in development, so it changes over time.
            </p>
          </Section>

          <Section title="What you can buy">
            <p>
              The only thing for sale is a named cat, from its &quot;Meet&quot; card in the game, for $
              {Prices.shelterCat}. You see the cat, its name and its element before checkout, and nothing is random. The
              Token Tails checkout takes cards and supported stablecoins. The cat is added to your
              Token Tails account as a Common card. In {PAWLEGENDS_TITLE} it brings:
            </p>
            <ul className="list-disc pl-5">
              {MEET_PERKS.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            <p>
              These are cosmetic. They do not make any hero stronger, and they do not change how a match is played or
              scored.
            </p>
          </Section>

          <Section title="Delivery and your 14-day withdrawal right (EU)">
            <p>
              The cat is digital content and is delivered right away, as soon as the payment is confirmed. Under EU law
              you can normally withdraw from an online purchase within 14 days. Before checkout, you tick a box to ask
              for delivery right away and to confirm that you lose this 14-day withdrawal right once the cat is
              delivered. Without that tick the checkout does not start.
            </p>
          </Section>

          <Section title="If something goes wrong">
            <ul className="list-disc pl-5">
              <li>
                If the payment goes through but the cat does not reach your account, or you are charged twice, write to
                us and we put it right or refund that payment.
              </li>
              <li>Your legal rights for digital content that is faulty or not as described are not affected.</li>
            </ul>
          </Section>

          <Section title="Age limits">
            <ul className="list-disc pl-5">
              <li>Under 16: no purchases. {UNDER_16_MESSAGE}</li>
              <li>16 or 17: at most €30 in any 30 days.</li>
              <li>18 or older: at most €200 in any 30 days. Write to us to raise it.</li>
            </ul>
            <p>Limits count every purchase made with the same account or device. US dollar prices count one to one.</p>
          </Section>

          <Section title="Earlier purchases">
            <p>
              A purchase made under an earlier version of these terms keeps the terms of that version. Write to us for
              a copy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions, a problem with a purchase or a higher limit:{" "}
              <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_CONTACT}
              </a>
              . How we handle your email and data:{" "}
              <a href={PAWLEGENDS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-tt-gold-400 underline underline-offset-4">
                Privacy Policy
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
