import type { GetServerSideProps } from "next";
import Head from "next/head";
import { partyCodeOfPath } from "@/components/pawlegends/flags";
import { PAWLEGENDS_PLAY_PATH } from "@/components/pawlegends/routes";
import { PAWLEGENDS_OG_IMAGE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { CLIENT_POLICY_STORE_URLS } from "@/shared-contracts/client-policy";

/** The App Store id of the iPhone app (CLIENT_POLICY_STORE_URLS.ios), for Safari's Smart App Banner. */
export const IOS_APP_ID = /\/id(\d+)$/.exec(CLIENT_POLICY_STORE_URLS.ios)?.[1] ?? "";

/** Where the Join button goes: the web game, which joins the party (`?party=`, MULTIPLAYER.md §5.3). */
export const partyPlayHref = (code: string): string => `${PAWLEGENDS_PLAY_PATH}?party=${code}`;

/** "K7Q X2M", as the game shows codes. */
const display = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

interface Props {
  /** The party code, upper-cased; null when the link's code is broken. */
  code: string | null;
}

/**
 * `/p/<code>`: the party invite link (docs/plans/moba/DEEP-LINKS.md), the URL the lobby's QR and Share carry.
 *
 * - A phone with the app never sees this page: iOS Universal Links and Android App Links open the app, which joins
 *   the party itself (pawlegends-app/src/shell/links.ts).
 * - Without the app, and on a desktop: one tap on "Join the party" opens the web game in the party (the tap also lets
 *   the game play sound at once). On iPhone, Safari's Smart App Banner offers "Open" when the app is installed (a
 *   link opened from Safari itself stays in Safari) and "Get" when it is not.
 * - A broken code: say so and offer the player their own party.
 *
 * Server-rendered so the share preview and the first paint carry the code; the answer depends on the URL only, so
 * the CDN keeps it. Whether the party still exists is the game's call (it shows "This party has ended" with "Start
 * your own party").
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ params, res }) => {
  const code = partyCodeOfPath(params?.code);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
  return { props: { code } };
};

export default function PartyInvitePage({ code }: Props) {
  const title = code ? `Join my ${PAWLEGENDS_TITLE} party` : `${PAWLEGENDS_TITLE} party`;
  return (
    <>
      <SeoHead
        siteName={PAWLEGENDS_TITLE}
        title={title}
        description={code ? `Party code ${display(code)}. Tap to join: cats vs dogs, 3v3, in your browser or the app.` : `Make a party and play with friends.`}
        path={code ? `/p/${code}` : "/play"}
        image={PAWLEGENDS_OG_IMAGE}
        noindex
      />
      {code && IOS_APP_ID ? (
        <Head>
          <meta name="apple-itunes-app" content={`app-id=${IOS_APP_ID}, app-argument=https://pawlegends.app/p/${code}`} key="apple-itunes-app" />
        </Head>
      ) : null}
      <main
        className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-tt-night-900 px-4 py-8 font-sans text-p5 text-tt-cream"
        data-testid="party-invite"
      >
        <article className="flex w-full max-w-[26rem] flex-col items-center gap-5 text-center">
          <p className="font-primary text-h6 text-tt-gold-400">{PAWLEGENDS_TITLE}</p>
          {code ? (
            <>
              <h1 className="font-primary text-h5">You&apos;re invited to a party</h1>
              <p className="flex flex-col gap-1">
                <span className="text-p6 opacity-80">Party code</span>
                <span className="font-primary text-h4 tracking-widest" data-testid="party-invite-code">
                  {display(code)}
                </span>
              </p>
              <a
                href={partyPlayHref(code)}
                className="w-full rounded-xl bg-tt-gold-400 px-6 py-4 font-primary text-h6 text-tt-night-900 shadow-lg"
                data-testid="party-invite-join"
              >
                Join the party
              </a>
              <p className="text-p6 opacity-80">Plays in your browser. No download, no sign-up.</p>
            </>
          ) : (
            <>
              <h1 className="font-primary text-h5" data-testid="party-invite-bad">
                This party link is broken
              </h1>
              <p>Ask your friend for a new link, or start your own party and invite them.</p>
              <a
                href={PAWLEGENDS_PLAY_PATH}
                className="w-full rounded-xl bg-tt-gold-400 px-6 py-4 font-primary text-h6 text-tt-night-900 shadow-lg"
                data-testid="party-invite-own"
              >
                Start your own party
              </a>
            </>
          )}
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-p6" data-testid="party-invite-stores">
            <span className="opacity-80">Get the app:</span>
            <a href={CLIENT_POLICY_STORE_URLS.ios} className="underline underline-offset-4">
              App Store
            </a>
            <a href={CLIENT_POLICY_STORE_URLS.android} className="underline underline-offset-4">
              Google Play
            </a>
          </p>
        </article>
      </main>
    </>
  );
}
