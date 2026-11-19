import Link from "next/link";
import { OPERATOR_PRIVACY_URL, PAWLEGENDS_CONTACT } from "@/components/pawlegends/flags";
import { ConsentChoiceButton } from "@/components/pawlegends/PawlegendsConsent";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

/** The date this notice last changed. Update it with every change to the text. */
export const PAWLEGENDS_APP_PRIVACY_UPDATED = "2026-11-19";

export const PAWLEGENDS_PRIVACY_SEO = Object.freeze({
  // NO-TOKENTAILS.md: the share card and tab name Paw Legends, not the site
  siteName: PAWLEGENDS_TITLE,
  title: `${PAWLEGENDS_TITLE} privacy`,
  description: `What ${PAWLEGENDS_TITLE} on iPhone, Android and the web keeps on your device, what signing in and party play send to our server, the play statistics we collect with PostHog only if you allow them, what the website measures with Google Analytics, and how long we keep it.`,
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
 * the app build does (no purchases; sign-in is optional and runs in the app's in-page host, `pawlegends-app/src/host`;
 * from 2026-11-19 the PostHog play statistics, `pawlegends/src/analytics/posthog.ts`, run in the app too, only after
 * the player allows them) and what
 * the party relay keeps (`backend/src/pawlegends/party/room-store.ts`: parties 3 h after the last change, ended
 * rooms 30 days). The answers in `docs/plans/moba/APP-STORE-ANSWERS.md` must say the same thing: change both
 * together. The shared account stays under the operator's general policy (one link, "Links out of the app": the law
 * needs it; NO-TOKENTAILS.md Your call 3); the "On the website" section covers the Paw Legends GTM container
 * (analytics/gtm.ts) and its consent bar. Since 2026-11-12 this is also the web game's Settings privacy link.
 *
 * `#play-stats` (2026-11-19, docs/plans/moba/POSTHOG-PRIVACY.md): PostHog play statistics in the game, the app and
 * from our server, consent only. FOUNDER (legally uncertain, check before relying on it): (1) the PostHog DPA is
 * accepted in the PostHog organisation settings and PostHog, Inc.'s Data Privacy Framework listing is current
 * (dataprivacyframework.gov); otherwise only the SCCs sentence holds; (2) the retention below (events 12 months,
 * recordings 30 days) must match the PostHog plan and project settings; (3) "PostHog does not store your network
 * address" holds only once Project settings → "Discard client IP data" is on; (4) the parental-consent sentence for
 * under-16s is the minimum GDPR Art. 8 reading, not legal advice; (5) server-side events must follow the same consent
 * (the backend sends them only for a player whose stored choice is granted).
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
              <li>No ads, no advertising identifier, no tracking across other companies&apos; apps or sites, and we never sell your data.</li>
              <li>
                Play statistics (PostHog) in the app and the game are collected only if you press Allow (on the
                website, see below). Turn them off any time in Settings. <a href="#play-stats" className="text-tt-gold-400 underline underline-offset-4">More below</a>.
              </li>
              <li>
                On the website (pawlegends.app and tokentails.com/pawlegends) we also use Google Analytics through
                Google Tag Manager to count visits. In Europe it stays off until you allow it.
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
                progress you earn by playing, and, if you use them, your friends, ranked results and reports;
              </li>
              <li>
                if you use an invite: whose invite you accepted (or who accepted yours), how many of the 3 matches are
                done, and the random device id of the browser that accepted it, so one device accepts one invite;
              </li>
              <li>
                on the web store only: a creator code you type at checkout (kept with your purchases for 30 days, so we
                can pay that creator their share) and the coat you pick as your first-purchase gift.
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

          <Section title="Your country flag and match chat">
            <p>
              Other players see a small flag of your country next to your name (in parties, matches, friends and
              leaderboards). We get the country from our network provider (Cloudflare), which works it out from your
              connection. We keep only the two-letter country code with your account or guest id; we do not keep your
              network address for this. Turn it off in Settings (&quot;Show my country flag&quot;): others then see a
              paw. The code is deleted with your account.
            </p>
            <p>
              Registered players aged 16 or over can type short messages to their team, and to everyone in the match
              when every player there is 16+ and registered. Messages pass a filter (links, contact details, abuse),
              are rate-limited, can be muted or reported, and are kept with the match for moderation for at most 30
              days. Everyone else sends fixed quick-chat phrases and pings only.
            </p>
          </Section>

          <Section title="Game updates">
            <p>
              The app checks tokentails.com for a newer version of the game and downloads it. That request carries
              nothing about you beyond what any web request carries (your network address and the device type). Our
              web host keeps short standard request logs; we do not use them to identify you.
            </p>
          </Section>

          <section id="play-stats" className="flex flex-col gap-2">
            <h2 className="font-primary text-h6 text-tt-gold-400">Play statistics (PostHog): only if you allow them</h2>
            <p>
              To find bugs and make the game better we measure how it is played, with PostHog, our product analytics
              service. In the iPhone and Android app and in the game on its own, this happens only after you press
              Allow. On the website it follows the bar below: in Europe nothing is sent until you press Allow;
              elsewhere it is on unless you say no. If you press No thanks, or never answer where we ask, nothing is
              sent and the waiting events are dropped. Your choice is kept on your device or in your browser.
            </p>
            <p>When you allow it, we collect:</p>
            <ul className="list-disc pl-5">
              <li>
                <b>what you do in the game</b>: screens you open, buttons such as Play, the mode, champion and
                difficulty you pick, when a match starts and ends, its length and result, tips, shares, store and pass
                screens;
              </li>
              <li>
                <b>device and app details</b>: device type, operating system and version, browser, screen size,
                language, app or game version and the graphics quality setting;
              </li>
              <li>
                <b>diagnostics</b>: error and crash codes, load times and frame rate, so we can fix crashes and slow
                devices;
              </li>
              <li>
                <b>from our server</b>: when a match you played is saved, when you earn or spend Yarn, and when a web
                store purchase completes (the item, its price and currency), so the numbers are right even if the game
                was closed early;
              </li>
              <li>
                <b>session recordings and heatmaps</b>, when we turn them on: a replay of what happens on the screen of
                the website or the game menus (taps, clicks, scrolls, screen changes) and where people tap. Every text
                field is masked, so we never see what you type, passwords or emails;
              </li>
              <li>
                <b>surveys</b>: if we ask you a short question in the game and you answer it, the answer.
              </li>
            </ul>
            <p>
              These events carry no name, no email and no account id. They are linked to a random code made on your
              device. If you sign in, we use instead a code made from your account id by a one-way hash (not the id
              itself), so we can count one player across devices; signing out starts a new random code. Because we
              could link that code back to your account, the law still treats it as personal data, and we treat it so.
              PostHog does not store your network address with these events, so they hold no location. We do not
              use them for advertising and do not combine them with data from other companies.
            </p>
            <p>
              <b>Why:</b> your consent (Article 6(1)(a) GDPR, and the ePrivacy rules for reading and storing on your
              device). <b>How long:</b> events are deleted after 12 months, session recordings after 30 days.
            </p>
            <p>
              <b>Changing your mind:</b> turn off &quot;Share play stats&quot; in the game&apos;s Settings (the app
              too), or press the button in the website section below. From then on nothing more is sent and the code
              on your device is forgotten. Withdrawing does not undo what was already sent: to delete that, write to{" "}
              <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_CONTACT}
              </a>{" "}
              (or delete your account and ask us to remove its statistics too).
            </p>
            <p>
              PostHog, Inc. processes these events for us as our processor, on servers in the United States, under a
              data processing agreement. See{" "}
              <A href="https://posthog.com/privacy">the PostHog privacy policy</A> and the transfer note under
              &quot;Who else gets data&quot;.
            </p>
          </section>

          <section id="web-analytics" className="flex flex-col gap-2">
            <h2 className="font-primary text-h6 text-tt-gold-400">On the website: Google Analytics and PostHog</h2>
            <p>
              The {PAWLEGENDS_TITLE} web pages (pawlegends.app, tokentails.com/pawlegends and the game in your browser)
              load Google Tag Manager, which runs Google Analytics. It tells us how many people visit, which pages and
              links bring them, and how they use the game: pressing play or the App Store badge, starting and finishing
              a match, opening the store and starting a checkout. We send the same events, and the play statistics
              above, to PostHog. These events carry no name or email. The apps for iPhone and Android never load
              Google Analytics or Google Tag Manager.
            </p>
            <p>
              In Europe (the EU, the EEA, the UK and Switzerland) we ask first: Google Tag Manager and PostHog do not
              run, and Google Analytics and PostHog set no cookies and receive nothing, until you press Allow on the bar at the bottom of the page. If
              you press No thanks, they stay off. We also use Google Consent Mode, so if your browser is set to a time
              zone outside Europe while you are in Europe, Google Analytics sets no cookies and receives only cookieless
              signals without an identifier. Elsewhere cookies are on unless you say no. Your choice is kept in your
              browser, and you can change it here at any time.
            </p>
            <ConsentChoiceButton />
            <p>
              Google processes this data for us as described in{" "}
              <A href="https://policies.google.com/technologies/partner-sites">How Google uses information from sites that use its services</A>.
              Google Analytics keeps this data for at most 14 months. PostHog (PostHog, Inc.) processes the events for
              us in the United States, as described in{" "}
              <A href="https://posthog.com/privacy">the PostHog privacy policy</A>.
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
              Nobody buys or receives your data from us. These companies process it for us, only to run their
              service for us:
            </p>
            <ul className="list-disc pl-5">
              <li>DigitalOcean (our game server and database);</li>
              <li>Vercel (the website and game files);</li>
              <li>Cloudflare (network delivery and the country for your flag);</li>
              <li>Google Firebase Authentication (sign-in);</li>
              <li>PostHog, Inc., United States (play statistics, only with your consent);</li>
              <li>Google Analytics, United States (website visits, only with your consent in Europe);</li>
              <li>Stripe (card payments on the web store; the app sells nothing).</li>
            </ul>
            <p>
              If you choose Sign in with Apple or Google, Apple or Google confirm who you are to us. When data goes to
              the United States, the transfer relies on the EU–US Data Privacy Framework where the company is
              certified under it, and otherwise on the European Commission&apos;s Standard Contractual Clauses in its
              data processing terms. We do not sell or share data for advertising, and we show no ads.
            </p>
          </Section>

          <Section title="Children">
            <p>
              {PAWLEGENDS_TITLE} is made for players aged 13 and over. It asks nobody for personal details to play.
              Signing in is optional; party play sends only the game data listed above. If you are under 16, ask a
              parent before you allow play statistics: in some countries (in the EU between 13 and 16, in Lithuania
              14) a parent has to agree for you.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Under the GDPR you can ask to see, correct, export or delete data about you, object to how we use it,
              and withdraw a consent at any time (that does not affect what was done before). Signed in, you can delete your account
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
              If the game or the app starts collecting anything new, we update this page and the app&apos;s App Store
              privacy details and Google Play data safety section before that version is released, and we ask again
              where your consent is needed.
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
