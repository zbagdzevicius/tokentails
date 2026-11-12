import Document, { Html, Head, Main, NextScript } from "next/document";
import { PRELOAD_FONT_FILES } from "../components/typography/fonts.generated";
import { THEME_COLOR } from "../design/tokens";
import { CHUNK_ERROR_WATCH } from "../components/pawlegends/landing/motionChunk";
import { PAWLEGENDS_GTM_ID } from "../analytics/pawlegends-site";

// First paint is night on every page: this inline rule paints before the stylesheet arrives.
const FIRST_PAINT = `html,body{background-color:${THEME_COLOR}}`;

// The two landings (`/`, its A/B arm `/legends`) use Fredoka (their own preload) and Nunito: preloading the display
// faces there would only take bandwidth from the page's own font and scripts.
const LANDING_PATHS = new Set(["/", "/legends"]);
export const preloadFontsFor = (path) =>
  LANDING_PATHS.has(path) ? PRELOAD_FONT_FILES.filter((href) => href.includes("/nunito-")) : PRELOAD_FONT_FILES;

// The landings' hydration waits for a server-rendered next/dynamic chunk (their motion): an inline watcher records
// failed chunk scripts so the page can give up on them at once (landing/motionChunk.ts).
export const watchesChunksFor = (path) => LANDING_PATHS.has(path);

// The Paw Legends GTM container's noscript part (the official snippet's body iframe; the head part loads on mount from
// components/GoogleTagManager.tsx, analytics/gtm.ts).
export const GTM_NOSCRIPT = `https://www.googletagmanager.com/ns.html?id=${PAWLEGENDS_GTM_ID}`;

/** Paw Legends' icons (brand/pawlegends, the same files as pawlegends/public). */
export const ICON_LINKS = [
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
];

class PawlegendsDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    // ctx.pathname is the page pattern (`/play`).
    const path = ctx.pathname || "/";
    return { ...initialProps, preloadFonts: preloadFontsFor(path), watchChunks: watchesChunksFor(path) };
  }

  render() {
    const { preloadFonts = PRELOAD_FONT_FILES, watchChunks = false } = this.props;
    return (
      <Html lang="en">
        <Head>
          {/* First, so it is listening before any chunk script can fail. */}
          {watchChunks && <script dangerouslySetInnerHTML={{ __html: CHUNK_ERROR_WATCH }} />}
          <style id="pl-first-paint" dangerouslySetInnerHTML={{ __html: FIRST_PAINT }} />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content={THEME_COLOR} />
          {ICON_LINKS.map((link) => (
            <link key={link.href} {...link} />
          ))}
          <meta name="format-detection" content="telephone=no" />
          {preloadFonts.map((href) => (
            <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
          ))}
        </Head>
        <body>
          <noscript>
            <iframe src={GTM_NOSCRIPT} height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
          </noscript>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default PawlegendsDocument;
