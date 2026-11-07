import Link from "next/link";
import { PAWLEGENDS_CONTACT, PAWLEGENDS_PRIVACY_URL } from "@/components/pawlegends/flags";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

/** The date this notice last changed. Update it with every change to the text. */
export const PAWLEGENDS_APP_PRIVACY_UPDATED = "2026-11-07";

export const PAWLEGENDS_PRIVACY_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} app privacy - Token Tails`,
  description: `What the ${PAWLEGENDS_TITLE} app for iPhone keeps on your phone, what party play sends to our server, and how long we keep it.`,
  path: "/pawlegends/privacy",
});

/** One section of the notice. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-primary text-h6 text-tt-gold-400">{title}</h2>
    {children}
  </section>
);

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="text-tt-gold-400 underline underline-offset-4" target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/**
 * `/pawlegends/privacy`: the privacy policy URL of the Pawlegends iOS app (App Store Connect "Privacy Policy URL",
 * `pawlegends-app/fastlane/metadata/en-US/privacy_url.txt`, and the app build's Settings link). Written from what
 * the app build does (`pawlegends-app/scripts/build-web.mjs`: no analytics key, no account, no purchases) and what
 * the party relay keeps (`backend/src/pawlegends/party/room-store.ts`: parties 3 h after the last change, ended
 * rooms 30 days). The answers in `docs/plans/moba/APP-STORE-ANSWERS.md` must say the same thing: change both
 * together. The web game and Token Tails accounts stay under the general Token Tails policy.
 */
export default function PawlegendsPrivacyPage() {
  return (
    <>
      <SeoHead {...PAWLEGENDS_PRIVACY_SEO} noindex />
      <main
        className="fixed inset-0 overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 leading-relaxed text-tt-cream"
        data-testid="pawlegends-privacy"
      >
        <article className="mx-auto flex max-w-[44rem] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-primary text-h5">{PAWLEGENDS_TITLE} app: privacy</h1>
            <p className="text-p6">Last updated {PAWLEGENDS_APP_PRIVACY_UPDATED}</p>
          </header>

          <Section title="In short">
            <ul className="list-disc pl-5">
              <li>No account, no sign-in, no email, no ads, no purchases.</li>
              <li>No analytics, no tracking, no advertising identifier.</li>
              <li>Playing against bots works offline and sends nothing to us.</li>
              <li>
                Only if you play with friends does the app talk to our server, and then only what the match needs. We
                delete it after at most 30 days.
              </li>
            </ul>
          </Section>

          <Section title="Who we are">
            <p>
              {PAWLEGENDS_TITLE} is made by Token Tails MB, Vilnius, Lithuania. Write to us at{" "}
              <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_CONTACT}
              </a>
              .
            </p>
          </Section>

          <Section title="What stays on your phone">
            <p>
              Your settings, your chosen hero, your progress and grades, and a random party key are saved in the
              app&apos;s own storage on your phone. They are not sent to us (the party key only when you play with
              friends, see below). Deleting the app deletes them.
            </p>
          </Section>

          <Section title="Playing with friends (optional)">
            <p>When you make or join a party, the app connects to our game server and sends:</p>
            <ul className="list-disc pl-5">
              <li>the random party key from your phone (it is not linked to your name, email or Apple ID);</li>
              <li>a player name the game picks for you (you cannot type your own);</li>
              <li>your hero, your picks and your moves in the match, and the quick-chat phrases and pings you send.</li>
            </ul>
            <p>We use this only to run the party and the match, let you rejoin after a dropped connection, check the result, and stop abuse such as flooding the server. On the server:</p>
            <ul className="list-disc pl-5">
              <li>a party is deleted 3 hours after its last change;</li>
              <li>
                a finished match (the players&apos; names, a one-way hash of each party key, the moves and the result)
                is deleted 30 days after it ends;
              </li>
              <li>
                your network address is used to connect you, and a one-way hash of part of it is kept with the party
                (3 hours at most) to limit how many parties one network can open.
              </li>
            </ul>
            <p>Your friends in the party see your player name, your hero and your moves.</p>
          </Section>

          <Section title="Game updates">
            <p>
              The app checks tokentails.com for a newer version of the game and downloads it. That request carries
              nothing about you beyond what any web request carries (your network address and the device type). Our
              web host keeps short standard request logs; we do not use them to identify you.
            </p>
          </Section>

          <Section title="Links out of the app">
            <p>
              A shared invite or challenge link opens tokentails.com in your browser. The website and Token Tails
              accounts follow the{" "}
              <A href={PAWLEGENDS_PRIVACY_URL}>Token Tails privacy policy</A>.
            </p>
          </Section>

          <Section title="Who else gets data">
            <p>
              Nobody buys or receives your data from us. Our server runs at our hosting provider (DigitalOcean) and the
              website at Vercel; they process it only to run those services for us. We do not sell or share data for
              advertising.
            </p>
          </Section>

          <Section title="Children">
            <p>
              The app asks nobody for personal details, at any age. Party play sends only the game data listed above.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Under the GDPR you can ask to see or delete data about you. As there is no account, we can only find a
              match if you tell us its party code and roughly when you played: write to{" "}
              <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_CONTACT}
              </a>
              . You can also complain to the Lithuanian State Data Protection Inspectorate (
              <A href="https://vdai.lrv.lt">vdai.lrv.lt</A>) or the authority where you live.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If the app starts collecting anything new (for example accounts or play statistics), we update this page
              and the app&apos;s App Store privacy details before that version is released.
            </p>
          </Section>

          <p>
            <Link href="/pawlegends" className="font-bold text-tt-gold-400 underline underline-offset-4">
              About {PAWLEGENDS_TITLE}
            </Link>
          </p>
        </article>
      </main>
    </>
  );
}
