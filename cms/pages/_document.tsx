import { Head, Html, Main, NextScript } from 'next/document';
import { PRELOAD_FONT_FILES } from '../styles/fonts.preload.generated';

// Self-hosted brand faces (plan F4, decision #83). The CMS headings and nav use Passion One and
// Bebas Neue; preload their latin files so the first paint does not flash the fallback. The
// @font-face rules are in styles/fonts.generated.scss and the preload list in
// styles/fonts.preload.generated.ts, both written by client/scripts/sync-fonts.mjs with the same
// `?v=` content-hash URLs (a preload is reused only when its URL matches the @font-face one).

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {PRELOAD_FONT_FILES.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
