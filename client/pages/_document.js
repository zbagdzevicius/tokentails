import Document, { Html, Head, Main, NextScript } from "next/document";
import { PRELOAD_FONT_FILES } from "../components/typography/fonts.generated";
import { isZoomLocked, skyForPath } from "../components/shared/skyScope";
import { THEME_COLOR } from "../design/tokens";
import { CHUNK_ERROR_WATCH } from "../components/pawlegends/landing/motionChunk";
import { isPawlegendsPath, PAWLEGENDS_GTM_ID } from "../analytics/pawlegends-site";

// Once the page has loaded, resolve the three brand faces the game roles use (the preloaded files,
// so this costs no extra request). The landing itself mostly renders Passion One 400 and Nunito;
// warming Passion One 900 and Bebas Neue here means /game's first canvas text never waits.
// document.fonts.load (never .check) is the only reliable signal (plan F4).
// With `afterPaint` (the body-font-only pages below) it also waits for the first contentful paint, 3 s at most: the
// Pawlegends landing paints nothing until its intro starts, often after load, and these font requests (highest
// priority) would otherwise queue ahead of that paint. Other pages keep the plain on-load warm.
export const warmBrandFonts = (afterPaint) =>
  `(function(){var f=document.fonts;if(!f||!f.load)return;var done=0;function go(){if(done)return;done=1;['900 1em "Passion One"','400 1em "Bebas Neue"','700 1em "Nunito"'].forEach(function(d){f.load(d).catch(function(){})})}` +
  (afterPaint
    ? `function soon(){try{if(performance.getEntriesByName('first-contentful-paint').length)return go();var o=new PerformanceObserver(function(l){if(l.getEntriesByName('first-contentful-paint').length){o.disconnect();go()}});o.observe({type:'paint',buffered:true});setTimeout(function(){o.disconnect();go()},3000)}catch(e){go()}}`
    : `var soon=go;`) +
  `if(document.readyState==='complete')soon();else window.addEventListener('load',soon,{once:true})})();`;

// First paint is night on every route (plan G6): this inline rule paints before globals.css
// arrives, so no white or gray frame flashes between the native splash, the landing and /game.
// Only the background is global; cream ink and the dark colour scheme stay under [data-sky].
const FIRST_PAINT = `html,body{background-color:${THEME_COLOR}}html[data-sky]{color-scheme:dark}`;

// Pages that never draw the brand display faces (Passion One, Bebas Neue) before load: preloading them there only takes
// bandwidth from the page's own font and scripts. The Pawlegends landings (`/pawlegends`, its A/B arm `/legends`) use
// Fredoka (their own preload) and Nunito.
// warmBrandFonts still fetches them after load (after the first paint here), so /game's first canvas text is unchanged.
const BODY_FONT_ONLY_PATHS = new Set(["/pawlegends", "/legends"]);
export const preloadFontsFor = (path) =>
  BODY_FONT_ONLY_PATHS.has(path) ? PRELOAD_FONT_FILES.filter((href) => href.includes("/nunito-")) : PRELOAD_FONT_FILES;

// Pages whose hydration waits for a server-rendered next/dynamic chunk (the Pawlegends landing's motion): an inline
// watcher records failed chunk scripts so the page can give up on them at once (landing/motionChunk.ts).
const CHUNK_WATCH_PATHS = new Set(["/pawlegends", "/legends"]);
export const watchesChunksFor = (path) => CHUNK_WATCH_PATHS.has(path);

// The Paw Legends GTM container's noscript part (the official snippet's body iframe; the head part loads on mount from
// components/GoogleTagManager.tsx, analytics/gtm.ts). Paw Legends web pages only (pawlegends.app's pages are these
// pages, rewritten): never on Token Tails pages and never in an app build (no analytics in the apps).
export const pawlegendsNoscriptFor = (path, isApp = !!process.env.NEXT_PUBLIC_IS_APP) =>
  !isApp && isPawlegendsPath(path)
    ? `https://www.googletagmanager.com/ns.html?id=${PAWLEGENDS_GTM_ID}`
    : null;

/** Favicon (16, 32 and 48 frames), PNG icons for browsers that prefer them, and the iOS home icon. */
export const ICON_LINKS = [
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "icon", href: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
];

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    // ctx.pathname is the page pattern (`/game`, `/feed/[category]`), also during `next export`.
    const path = ctx.pathname || "/";
    return { ...initialProps, sky: skyForPath(path), zoomLocked: isZoomLocked(path), preloadFonts: preloadFontsFor(path), warmAfterPaint: BODY_FONT_ONLY_PATHS.has(path), watchChunks: watchesChunksFor(path), gtmNoscript: pawlegendsNoscriptFor(path) };
  }

  render() {
    const { sky, zoomLocked, preloadFonts = PRELOAD_FONT_FILES, watchChunks = false, warmAfterPaint = false, gtmNoscript = null } = this.props;
    // The viewport meta lives in _app (next/head), so it follows client-side navigation:
    // zoom stays enabled everywhere except /game (WCAG 1.4.4, plan G6).
    return (
      <Html
        lang="en"
        data-sky={sky || undefined}
        data-zoom={zoomLocked ? "locked" : undefined}
      >
        <Head>
          {/* First, so it is listening before any chunk script can fail. */}
          {watchChunks && <script dangerouslySetInnerHTML={{ __html: CHUNK_ERROR_WATCH }} />}
          <style
            id="tt-first-paint"
            dangerouslySetInnerHTML={{ __html: FIRST_PAINT }}
          />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content={THEME_COLOR} />
          {/* The one icon set (plan G14): generated by scripts/build-icons.mjs. No page renders
              its own icon tags; scripts/check-meta.mjs fails if one does. */}
          {ICON_LINKS.map((link) => (
            <link key={link.href} {...link} />
          ))}
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="format-detection" content="telephone=no" />
          {/* Self-hosted brand faces (plan F4): Passion One 900, Bebas Neue, Nunito, latin. */}
          {preloadFonts.map((href) => (
            <link
              key={href}
              rel="preload"
              href={href}
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
          ))}
          <script dangerouslySetInnerHTML={{ __html: warmBrandFonts(warmAfterPaint) }} />
          {/* Google Tag Manager is not injected here: it loads on mount
              from components/GoogleTagManager.tsx. */}
        </Head>
        <body>
          {gtmNoscript && (
            <noscript>
              <iframe src={gtmNoscript} height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
            </noscript>
          )}
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
