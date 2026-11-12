import Link from "next/link";
import { PawlegendsAccountPanel } from "@/components/pawlegends/PawlegendsAccount";
import { PAWLEGENDS_CONTACT } from "@/components/pawlegends/flags";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";

export const PAWLEGENDS_ACCOUNT_SEO = Object.freeze({
  // NO-TOKENTAILS.md: the share card and tab name Paw Legends, not the site
  siteName: PAWLEGENDS_TITLE,
  title: `${PAWLEGENDS_TITLE} account`,
  description: `Sign in to ${PAWLEGENDS_TITLE}, sign out, or delete your account and its data.`,
  path: "/account",
  image: PAWLEGENDS_OG_IMAGE,
});

/**
 * `/account`: the account page of the Paw Legends apps and web game (sign-in). Google Play's Data safety
 * form asks for a web page where a player can ask to delete their account without the app: this is it, also linked
 * from `/support` and `/privacy`. Sign in, sign out, and Delete account (`DELETE /user/me`, the
 * same deletion as the app's Settings → Account → Delete account). Auth is `optional`: an existing session is reused,
 * none is created.
 */
export default function PawlegendsAccountPage() {
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead {...PAWLEGENDS_ACCOUNT_SEO} noindex />
      <main
        className="fixed inset-0 overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 leading-relaxed text-tt-cream"
        data-testid="pawlegends-account-page"
      >
        <article className="mx-auto flex max-w-[44rem] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-primary text-h5">{PAWLEGENDS_TITLE}: your account</h1>
            <p className="text-p6 opacity-80">Signing in is optional. The game plays without an account.</p>
          </header>

          <PawlegendsAccountPanel />

          <section className="flex flex-col gap-2" data-testid="pawlegends-account-deletion">
            <h2 className="font-primary text-h6 text-tt-gold-400">Deleting your account</h2>
            <ul className="list-disc pl-5">
              <li>In the app: Settings → Account → Delete account, or tap your name on the title screen.</li>
              <li>Here: sign in with the same Apple, Google or email sign-in, then Delete account.</li>
              <li>
                By email: write to{" "}
                <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="text-tt-gold-400 underline underline-offset-4">
                  {PAWLEGENDS_CONTACT}
                </a>{" "}
                from the account&apos;s address. We answer within 30 days.
              </li>
            </ul>
            <p>
              Deleting removes your sign-in (and revokes Sign in with Apple) and your email address, renames your
              profile to &quot;Deleted player&quot;, takes it off every leaderboard, and sends your cats back to the
              shelter pool. We keep an audit record with no personal data (the account id and counts), and payment
              records the law requires us to keep. Matches played on your phone without an account stay on your phone
              until you delete the app.
            </p>
          </section>

          <p className="flex flex-wrap gap-4">
            <Link href="/privacy" className="font-bold text-tt-gold-400 underline underline-offset-4">
              Privacy
            </Link>
            <Link href="/support" className="font-bold text-tt-gold-400 underline underline-offset-4">
              Help
            </Link>
            <Link href="/" className="font-bold text-tt-gold-400 underline underline-offset-4">
              About {PAWLEGENDS_TITLE}
            </Link>
          </p>
        </article>
      </main>
    </FirebaseAuthProvider>
  );
}
