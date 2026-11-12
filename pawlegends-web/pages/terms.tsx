import {
  PAWLEGENDS_CONSENT_VERSION,
  PAWLEGENDS_STORE_CONSENT_VERSION,
  UNDER_16_MESSAGE,
} from "@/components/pawlegends/checkout";
import { PAWLEGENDS_CONTACT, PAWLEGENDS_PRIVACY_URL } from "@/components/pawlegends/flags";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import Link from "next/link";

export { PAWLEGENDS_CONTACT };

export const PAWLEGENDS_TERMS_SEO = Object.freeze({
  // NO-TOKENTAILS.md: the share card and tab name Paw Legends, not the site
  siteName: PAWLEGENDS_TITLE,
  title: `${PAWLEGENDS_TITLE} terms`,
  description: `What you can buy in ${PAWLEGENDS_TITLE}, the EU withdrawal notice, age limits and contact.`,
  path: "/terms",
  image: PAWLEGENDS_OG_IMAGE,
});

/** One section of the terms. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-primary text-h6 text-tt-gold-400">{title}</h2>
    {children}
  </section>
);

/**
 * `/terms` (launch item U5): the terms for the game's store items and the
 * Legends Pass. The named-cat purchase ("Meet <cat>", $5) left the game on 2026-11-12 (docs/plans/moba/NO-TOKENTAILS.md);
 * earlier cat buyers keep the terms of their version ("Earlier purchases"). The operator is named only where the law
 * needs it (the "Who runs it" section). Default wording; the founder's legal OK is pending.
 */
export default function PawlegendsTermsPage() {
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
              {PAWLEGENDS_TITLE} is free to play in the browser: you never have to pay to play it. It is still in
              development, so it changes over time.
            </p>
          </Section>

          <Section title={`What you can buy: store items and the Legends Pass (version ${PAWLEGENDS_STORE_CONSENT_VERSION}, draft)`}>
            <p>
              On the web, signed-in players can buy cosmetic store items (coats, frames with titles, sets) and the
              Legends Pass from the game&apos;s Store. Each item, its price and every pass reward are shown before
              checkout; nothing is random. Items belong to your account and are bought once. They are
              cosmetic: they do not make any hero stronger and do not change how a match is played or scored.
            </p>
            <p>
              The Legends Pass opens a season&apos;s premium reward row. You reach tiers with Season XP from finished
              matches; Pass+ also moves you 15 tiers ahead (up to tier 30) and adds one extra coat, Eclipse. Season XP
              is progress only: it is not money, cannot be bought, sold or exchanged, and has no cash value. A
              season&apos;s rewards stay claimable after the season ends. A refunded pass removes its premium rewards.
            </p>
          </Section>

          <Section title="Delivery and your 14-day withdrawal right (EU)">
            <p>
              Store items and the pass are digital content and are delivered right away, as soon as the payment is
              confirmed. Under EU law you can normally withdraw from an online purchase within 14 days. The purchase
              button reads &ldquo;Buy now · delivered instantly&rdquo;, and the line right under it says the 14-day
              withdrawal right ends at delivery. By pressing that button you ask us to deliver the item right away and
              confirm that you lose the 14-day withdrawal right once it is delivered. We record when you pressed it. If
              you do not want that, do not press the button.
            </p>
          </Section>

          <Section title="If something goes wrong">
            <ul className="list-disc pl-5">
              <li>
                If the payment goes through but the item does not reach your account, or you are charged twice, write to
                us and we put it right or refund that payment.
              </li>
              <li>Your legal rights for digital content that is faulty or not as described are not affected.</li>
            </ul>
          </Section>

          <Section title="Age and spending limits">
            <ul className="list-disc pl-5">
              <li>Under 16: no purchases. {UNDER_16_MESSAGE}</li>
              <li>
                The purchase sheet does not ask your age. Every account can spend at most €30 in any 30 days, the limit
                for players aged 16 or 17.
              </li>
              <li>
                If you told us earlier that you are 18 or older, your limit stays at €200 in any 30 days. Write to us to
                raise a limit.
              </li>
            </ul>
            <p>Limits count every purchase made with the same account or device. US dollar prices count one to one.</p>
          </Section>

          <Section title="Earlier purchases">
            <p>
              A purchase made under an earlier version of these terms keeps the terms of that version. Write to us for
              a copy.
            </p>
          </Section>

          <Section title="Who runs it">
            <p>
              {PAWLEGENDS_TITLE} is operated by Token Tails MB, Vilnius, Lithuania, the seller of every purchase.
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
            <Link href="/play" className="font-bold text-tt-gold-400 underline underline-offset-4">
              Back to {PAWLEGENDS_TITLE}
            </Link>
          </p>
        </article>
      </main>
    </>
  );
}
