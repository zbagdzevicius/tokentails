import Link from "next/link";
import { OPERATOR_PRIVACY_URL, PAWLEGENDS_CONTACT } from "@/components/pawlegends/flags";
import { ConsentChoiceButton } from "@/components/pawlegends/PawlegendsConsent";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

/** The date this notice last changed. Update it with every change to the text. */
export const PAWLEGENDS_APP_PRIVACY_UPDATED = "2026-11-12";

export const PAWLEGENDS_PRIVACY_SEO = Object.freeze({
  // NO-TOKENTAILS.md: the share card and tab name Paw Legends, not the site
  siteName: PAWLEGENDS_TITLE,
  title: `${PAWLEGENDS_TITLE} privacy`,
  description: `What the ${PAWLEGENDS_TITLE} app for iPhone and Android keeps on your phone, what signing in and party play send to our server, what the website measures with Google Analytics, and how long we keep it.`,
  path: "/privacy",
  image: PAWLEGENDS_OG_IMAGE,
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
 * `/privacy`: the privacy policy URL of the Pawlegends iOS and Android apps (App Store Connect "Privacy Policy
 * URL", `pawlegends-app/fastlane/metadata/en-US/privacy_url.txt`, the Google Play listing and Data safety form, and the
 * app build's Settings link). Written from what
 * the app build does (`pawlegends-app/scripts/build-web.mjs`: no analytics key, no purchases; sign-in is optional and
 * runs in the app's in-page host, `pawlegends-app/src/host`) and what
 * the party relay keeps (`backend/src/pawlegends/party/room-store.ts`: parties 3 h after the last change, ended
 * rooms 30 days). The answers in `docs/plans/moba/APP-STORE-ANSWERS.md` must say the same thing: change both
 * together. The shared account stays under the operator's general policy (one link, "Links out of the app": the law
 * needs it; NO-TOKENTAILS.md Your call 3); the "On the website" section covers the Paw Legends GTM container
 * (analytics/gtm.ts) and its consent bar. Since 2026-11-12 this is also the web game's Settings privacy link.
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
              <li>
                Signing in is optional (Apple, Google or email). Without it the game asks for no name, no email and
                no account.
              </li>
              <li>In the app: no ads, no purchases, no analytics, no tracking, no advertising identifier.</li>
              <li>
                On the website (pawlegends.app and tokentails.com/pawlegends) we use Google Analytics through Google
                Tag Manager to count visits. In Europe it stays off until you allow it.
              </li>
              <li>Playing against bots offline sends nothing to us.</li>
              <li>
                You can delete your account in the app (Settings → Account) or at{" "}
                <a href="https://pawlegends.app/account" className="text-tt-gold-400 underline underline-offset-4">
                  pawlegends.app/account
                </a>
                .
              </li>
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

          <Section title="Signing in (optional)">
            <p>
              You can sign in with Apple, Google or an email address and password, from the title screen or Settings.
              Signing in is never needed to play. When you sign in we receive and keep:
            </p>
            <ul className="list-disc pl-5">
              <li>
                your email address (with Sign in with Apple you may choose Hide My Email: we then get an Apple relay
                address) and, if Apple or Google share it, your name;
              </li>
              <li>an account id from our sign-in provider (Google Firebase Authentication);</li>
              <li>
                your profile: a player name, your match results and grades, the Treat Track (Legends Pass)
                progress you earn by playing, and, if you use them, your friends, ranked results and reports.
              </li>
            </ul>
            <p>
              We use this only to run your account: save your progress, show it on your other devices and on
              tokentails.com, and run friends and ranked play. Your password goes to Firebase, never to us.
            </p>
            <p>
              Once you have played online, the app also keeps an anonymous guest account (a random Firebase id with no
              name or email) so the server can save your matches and Treat Track before you sign in. When you sign in,
              the app asks before it adds that guest progress, and the matches played on this phone, to your account.
            </p>
            <p>
              We keep your account until you delete it: in the app (Settings → Account → Delete account) or at{" "}
              <a href="https://pawlegends.app/account" className="text-tt-gold-400 underline underline-offset-4">
                pawlegends.app/account
              </a>
              . Deleting removes your sign-in and email, revokes Sign in with Apple, renames the profile to
              &quot;Deleted player&quot; and takes it off the leaderboards.
            </p>
          </Section>

          <Section title="Playing with friends (optional)">
            <p>When you make or join a party, the app connects to our game server and sends:</p>
            <ul className="list-disc pl-5">
              <li>the random party key from your phone (it is not linked to your name, email, Apple ID or Google account);</li>
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
            <p>If you are signed in (or playing as the guest above), the party also knows that account, so the match counts for it.</p>
          </Section>

          <Section title="Game updates">
            <p>
              The app checks tokentails.com for a newer version of the game and downloads it. That request carries
              nothing about you beyond what any web request carries (your network address and the device type). Our
              web host keeps short standard request logs; we do not use them to identify you.
            </p>
          </Section>

          <section id="web-analytics" className="flex flex-col gap-2">
            <h2 className="font-primary text-h6 text-tt-gold-400">On the website: Google Analytics</h2>
            <p>
              The {PAWLEGENDS_TITLE} web pages (pawlegends.app, tokentails.com/pawlegends and the game in your browser)
              load Google Tag Manager, which runs Google Analytics. It tells us how many people visit, which pages and
              links bring them, and how they use the game: pressing play or the App Store badge, starting and finishing
              a match, opening the store and starting a checkout. These events carry no name, email or account id, and
              no amounts tied to you. The apps for iPhone and Android do not load it.
            </p>
            <p>
              In Europe (the EU, the EEA, the UK and Switzerland) we ask first: Google Tag Manager does not run, and
              Google Analytics sets no cookies and receives nothing, until you press Allow on the bar at the bottom of the page. If
              you press No thanks, it stays off. We also use Google Consent Mode, so if your browser is set to a time
              zone outside Europe while you are in Europe, Google Analytics sets no cookies and receives only cookieless
              signals without an identifier. Elsewhere cookies are on unless you say no. Your choice is kept in your
              browser, and you can change it here at any time.
            </p>
            <ConsentChoiceButton />
            <p>
              Google processes this data for us as described in{" "}
              <A href="https://policies.google.com/technologies/partner-sites">How Google uses information from sites that use its services</A>.
              Google Analytics keeps this data for at most 14 months.
            </p>
          </section>

          <Section title="Links out of the app">
            <p>
              A shared invite or challenge link opens pawlegends.app in your browser. Your account is shared with our
              other games and follows our{" "}
              <A href={OPERATOR_PRIVACY_URL}>general privacy policy</A>.
            </p>
          </Section>

          <Section title="Who else gets data">
            <p>
              Nobody buys or receives your data from us. Our server runs at our hosting provider (DigitalOcean), the
              website at Vercel, sign-in at Google Firebase Authentication, and website analytics at Google Analytics
              (see above); they process it only to run those
              services for us. If you choose Sign in with Apple or Google, Apple or Google confirm who you are to us. We
              do not sell or share data for advertising.
            </p>
          </Section>

          <Section title="Children">
            <p>
              The app asks nobody for personal details to play, at any age. Signing in is optional; party play sends
              only the game data listed above.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Under the GDPR you can ask to see or delete data about you. Signed in, you can delete your account
              yourself (see above). Without an account we can only find a match if you tell us its party code and
              roughly when you played: write to{" "}
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
              and the app&apos;s App Store privacy details and Google Play data safety section before that version is released.
            </p>
          </Section>

          <p>
            <Link href="/" className="font-bold text-tt-gold-400 underline underline-offset-4">
              About {PAWLEGENDS_TITLE}
            </Link>
          </p>
        </article>
      </main>
    </>
  );
}
