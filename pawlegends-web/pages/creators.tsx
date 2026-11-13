import Link from "next/link";
import { PAWLEGENDS_CONTACT } from "@/components/pawlegends/flags";
import { PAWLEGENDS_PLAY_PATH } from "@/components/pawlegends/routes";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

export const PAWLEGENDS_CREATORS_SEO = Object.freeze({
  siteName: PAWLEGENDS_TITLE,
  title: `${PAWLEGENDS_TITLE} creator program`,
  description: `Make videos or stream ${PAWLEGENDS_TITLE}, get your own creator code and earn a share of every web store purchase made with it.`,
  path: "/creators",
  image: PAWLEGENDS_OG_IMAGE,
});

/** The creator's share and how long a code stays on a player's purchases (backend `pawlegends/growth/growth.rules.ts`). */
export const CREATOR_SHARE_PERCENT = 20;
export const CREATOR_LINK_DAYS = 30;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-primary text-h6 text-tt-gold-400">{title}</h2>
    {children}
  </section>
);

const Mail = ({ subject }: { subject: string }) => (
  <a
    href={`mailto:${PAWLEGENDS_CONTACT}?subject=${encodeURIComponent(subject)}`}
    className="text-tt-gold-400 underline underline-offset-4"
  >
    {PAWLEGENDS_CONTACT}
  </a>
);

/**
 * `/creators`: the creator program (gaps.md $1 and CR1; Brawl Stars Creator Boost, Wild Rift Partner Program). Creators
 * get a code; players type it at the web store checkout; the creator earns a share of those purchases. Codes are for the
 * web store only: the iOS and Android apps sell nothing, so this page never points into an app purchase.
 */
export default function PawlegendsCreatorsPage() {
  return (
    <>
      <SeoHead {...PAWLEGENDS_CREATORS_SEO} />
      <main
        className="fixed inset-0 overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 leading-relaxed text-tt-cream"
        data-testid="pawlegends-creators"
      >
        <article className="mx-auto flex max-w-[44rem] flex-col gap-6">
          <header className="flex flex-col gap-2">
            <p className="font-bold uppercase tracking-wider text-tt-gold-400">Creator program</p>
            <h1 className="font-primary text-h4">Make {PAWLEGENDS_TITLE} videos. Get your own code.</h1>
            <p>
              Stream it, clip it, teach it. Your viewers type your creator code when they buy something in the web store,
              and you earn {CREATOR_SHARE_PERCENT}% of what they pay.
            </p>
          </header>

          <Section title="How it works">
            <ol className="list-decimal pl-5">
              <li>Write to us with a link to your channel. We send you a code, like PIXELQUEEN.</li>
              <li>
                A player opens the store on{" "}
                <Link href={PAWLEGENDS_PLAY_PATH} className="text-tt-gold-400 underline underline-offset-4">
                  pawlegends.app
                </Link>
                , taps &ldquo;Have a creator code?&rdquo; and types yours.
              </li>
              <li>
                Your code stays on that player&rsquo;s purchases for {CREATOR_LINK_DAYS} days. A new code replaces it.
              </li>
              <li>
                Every month we total the paid orders with your code and pay you {CREATOR_SHARE_PERCENT}% of the price
                (VAT included). Refunded orders do not count.
              </li>
            </ol>
          </Section>

          <Section title="What players get">
            <ul className="list-disc pl-5">
              <li>Nothing costs more with a code. It only tells us who brought them.</li>
              <li>Everything in the store is cosmetic: coats, frames and the Legends Pass. Nothing changes a match.</li>
              <li>A player&rsquo;s first purchase also lets them pick 1 Rare coat from 5, with or without a code.</li>
            </ul>
          </Section>

          <Section title="Who can join">
            <ul className="list-disc pl-5">
              <li>Anyone 18 or older who makes videos, streams or guides about the game, on any platform.</li>
              <li>Say clearly in your videos that you use a creator code (most platforms ask for a paid-partnership label).</li>
              <li>No fake giveaways, no promises of free items, no content aimed at children under 13.</li>
              <li>We can end a code that breaks these rules. Earnings already confirmed are still paid.</li>
            </ul>
          </Section>

          <Section title="Apply">
            <p>
              Write to <Mail subject="Creator program" /> with your channel link, the platforms you post on, and the code
              you would like (3 to 16 letters or digits). We answer in English, usually within a week.
            </p>
          </Section>

          <Section title="Invite friends instead">
            <p>
              Not a creator? Every player has an invite link in the game&rsquo;s Friends sheet. When a new friend, or one
              who has been away for 21 days, finishes 3 matches, you both get a coat. Invites are free and work in the
              apps too.
            </p>
          </Section>
        </article>
      </main>
    </>
  );
}
