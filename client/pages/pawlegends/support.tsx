import Link from "next/link";
import { PAWLEGENDS_CONTACT } from "@/components/pawlegends/flags";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";

export const PAWLEGENDS_SUPPORT_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} help - Token Tails`,
  description: `How to play ${PAWLEGENDS_TITLE}, play with friends, and reach us.`,
  path: "/pawlegends/support",
});

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-primary text-h6 text-tt-gold-400">{title}</h2>
    {children}
  </section>
);

const Mail = () => (
  <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
    {PAWLEGENDS_CONTACT}
  </a>
);

/**
 * `/pawlegends/support`: the support URL of the Pawlegends iOS app (App Store Connect "Support URL",
 * `pawlegends-app/fastlane/metadata/en-US/support_url.txt`). Apple wants a page with a way to reach us. It describes
 * what the app does (optional sign-in, no purchases), so nothing here may point at a checkout.
 */
export default function PawlegendsSupportPage() {
  return (
    <>
      <SeoHead {...PAWLEGENDS_SUPPORT_SEO} noindex />
      <main
        className="fixed inset-0 overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 leading-relaxed text-tt-cream"
        data-testid="pawlegends-support"
      >
        <article className="mx-auto flex max-w-[44rem] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-primary text-h5">{PAWLEGENDS_TITLE}: help</h1>
          </header>

          <Section title="Contact us">
            <p>
              A bug, a question or an idea: write to <Mail />. Tell us your phone model and roughly when it
              happened. We answer in English.
            </p>
          </Section>

          <Section title="How to play">
            <ul className="list-disc pl-5">
              <li>Tap the big Play button to start a match against bots right away. Easy, Normal and Hard set how strong they are.</li>
              <li>Move with your left thumb; tap the skill buttons with your right. ATK is your basic attack.</li>
              <li>Knock down the dog towers along a lane, then their core, before they reach yours.</li>
              <li>Change hero picks one of the cat heroes. Each has a passive, three skills and an ultimate from level 4.</li>
              <li>A match lasts about seven minutes and never more than eleven.</li>
            </ul>
          </Section>

          <Section title="Play with friends">
            <ul className="list-disc pl-5">
              <li>Tap Play with friends to make a party; it shows a 6-letter code.</li>
              <li>Friends tap Join with code and type it in. Up to three players share one team; bots fill empty seats.</li>
              <li>Party play needs the internet. Playing against bots alone works offline.</li>
            </ul>
          </Section>

          <Section title="Updates">
            <p>
              The app updates the game by itself while you are on the title screen, never during a match. If an update
              ever fails to start, the app goes back to the version that worked.
            </p>
          </Section>

          <Section title="Your data">
            <p>
              Signing in is optional (Apple, Google or email); without it there is no account. No ads, no tracking. To
              sign out or delete your account: Settings → Account in the app, or{" "}
              <Link href="/pawlegends/account" className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_TITLE} account
              </Link>
              . Details:{" "}
              <Link href="/pawlegends/privacy" className="text-tt-gold-400 underline underline-offset-4">
                {PAWLEGENDS_TITLE} app privacy
              </Link>
              .
            </p>
          </Section>
        </article>
      </main>
    </>
  );
}
