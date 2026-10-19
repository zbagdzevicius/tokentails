// Capacitor builds (`npm run build:app`, env from .env.app) ship a static
// export in out/. Web builds keep the Node server for ISR and redirects.
const isApp = !!process.env.NEXT_PUBLIC_IS_APP;

// Catnip Heist is a static build in public/heist-game (catnip-heist: `npm run build:client`, plan
// F12). `/heist` is the Next host page (pages/heist.tsx, plan G2 layer 1) that embeds it, so it is
// not redirected. The old static entry `/heist/index.html` moves permanently to the host page, and
// asset URLs from the previous public/heist build (cached pages, shared links) move permanently to
// the new build path. Next.js does not serve a directory's index.html on its own, so `/heist-game`
// goes to its file.
const heistRedirects = [
  { source: "/heist/index.html", destination: "/heist", permanent: true },
  { source: "/heist-game", destination: "/heist-game/index.html", permanent: false },
  { source: "/heist/:path+", destination: "/heist-game/:path+", permanent: true },
];

// Cat Rave (cat-rave/, CHECKOUT-SPEC.md section 10) is a static build in public/rave (cat-rave:
// `npm run build:client`, base /rave/). A rewrite keeps the URL at /rave (Next strips the trailing
// slash of /rave/ first); assets load from /rave/build/. Web builds only (the export has no rewrites).
const raveRewrites = [{ source: "/rave", destination: "/rave/index.html" }];

// Firebase auth helper paths, proxied so sign-in can use tokentails.com as its authDomain
// (decision #6: behind a flag, preview first). Off unless NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY is
// set; FIREBASE_AUTH_ORIGIN overrides the Firebase project's own auth host.
const FIREBASE_AUTH_ORIGIN = (
  process.env.FIREBASE_AUTH_ORIGIN || "https://news-ccd33.firebaseapp.com"
).replace(/\/+$/, "");
const authProxyOn = /^(1|true|yes|on)$/i.test(
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY || "",
);
const firebaseAuthRewrites = authProxyOn
  ? [
      { source: "/__/auth/:path*", destination: `${FIREBASE_AUTH_ORIGIN}/__/auth/:path*` },
      { source: "/__/firebase/init.json", destination: `${FIREBASE_AUTH_ORIGIN}/__/firebase/init.json` },
    ]
  : [];

// Bad Cat Daily (bad-cat/, GDD 6.6, docs/CLIENT.md "Bad Cat Daily (/badcat)"): the static game build in
// public/badcat-game (bad-cat: `npm run build:client`, then `npm run og:pages -- ../client/public/badcat-game`)
// served top level at /badcat, no iframe. Always on in web builds (the Capacitor export has no rewrites). Every
// page loads the same bundle; d/<n>.html and the link shells only carry their own OG tags. A day without a
// pre-rendered page falls back to index.html (the game reads the path).
const BADCAT = "/badcat-game";
const badcatRewrites = [
  { source: "/badcat", destination: `${BADCAT}/index.html` },
  { source: "/badcat/d/:n(\\d{1,4})", destination: `${BADCAT}/d/:n.html` },
  // Pre-launch preview days ("p30" = 30 days before Day #1, link.ts daySlug) and old negative links have no
  // pre-rendered page: the SPA shell reads the day from the path.
  { source: "/badcat/d/:n(p\\d{1,5})", destination: `${BADCAT}/index.html` },
  { source: "/badcat/d/:n(-\\d{1,5})", destination: `${BADCAT}/index.html` },
  { source: "/badcat/c/:cat", destination: `${BADCAT}/c.html` },
  ...["glass", "pick", "r", "c", "thanks", "redeem", "restore", "maker"].map((page) => ({
    source: `/badcat/${page}`,
    destination: `${BADCAT}/${page}.html`,
  })),
  ...["club", "archive", "rapsheet", "brand", "cameo", "settings", "gift", "shop"].map((route) => ({
    source: `/badcat/${route}`,
    destination: `${BADCAT}/index.html`,
  })),
  { source: "/badcat/:path*", destination: `${BADCAT}/:path*` },
];
// Checked after pages and public files: a day past the pre-rendered range (its d/<n>.html is missing) still
// opens the game with the generic tags.
const badcatFallbackRewrites = [
  { source: "/badcat/d/:n(\\d{1,4})", destination: `${BADCAT}/index.html` },
  { source: `${BADCAT}/d/:n(\\d{1,4}).html`, destination: `${BADCAT}/index.html` },
];
// The service worker ships at /badcat-game/sw.js; this header lets it control the /badcat/* pages too.
const badcatHeaders = [`${BADCAT}/sw.js`, "/badcat/sw.js"].map((source) => ({
  source,
  headers: [
    { key: "Service-Worker-Allowed", value: "/badcat/" },
    { key: "Cache-Control", value: "no-cache" },
  ],
}));

// The blog (docs/CLIENT.md "Blog"): every legacy CMS article URL and old category answers with a
// redirect to its repo-content replacement (lib/feed/legacy-redirects.json plus each article's
// `legacySlugs`). lib/feed/engine.ts is TypeScript that Node loads by type stripping (Node >= 22.18);
// it validates every article, so a broken file fails here, loudly, before the build starts.
// Web builds only: the static export has no redirects (pages/feed/article.tsx forwards old app links).
const feedRedirects = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config
  const feed = require("./lib/feed/engine.ts");
  return feed.feedRedirects(feed.loadFeed());
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_DIST_DIR lets a second build (the bundle guards, task 7b) write next to a running dev
  // server without touching its .next. Unset everywhere else.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The E2E and capture hooks are gated on these flags (scripts/check-bundle-hooks.mjs). Next.js
  // inlines a NEXT_PUBLIC_ variable only when it is set; an unset one stays a runtime lookup, so the
  // minifier cannot drop the gated code and its strings reach the bundle. Defaulting both to "" makes
  // every build without them (web and app export) compile the hooks out.
  env: {
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? "",
    NEXT_PUBLIC_CAPTURE: process.env.NEXT_PUBLIC_CAPTURE ?? "",
  },
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
  output: isApp ? "export" : undefined,
  transpilePackages: ["@creit.tech/stellar-wallets-kit"],
  // Not supported under output: "export", so app builds skip them;
  // pages/gaming.tsx covers /gaming client-side there.
  ...(isApp
    ? {}
    : {
        async redirects() {
          return [
            { source: "/gaming", destination: "/", permanent: true },
            // Legacy /catbassadors game shell; the same game runs at /game.
            { source: "/catbassadors", destination: "/game", permanent: true },
            // Retired with its FeedbackSlider and Preview (plan decision #43).
            { source: "/old-landing", destination: "/", permanent: true },
            // Dead token-era links (plan G5 P7): the rewards page now lives on the shelter payouts.
            { source: "/airdrop", destination: "/shelter-payouts", permanent: true },
            { source: "/airdrop/:path*", destination: "/shelter-payouts", permanent: true },
            // Retired giveaway and box pages (decision #43); pages/giveaway.tsx and pages/box.tsx
            // cover the static app export the same way.
            { source: "/giveaway", destination: "/game", permanent: true },
            { source: "/box", destination: "/game", permanent: true },
            // The proof page moved into /impact (plan F7.6, 2.13 row 23).
            { source: "/proof", destination: "/impact", permanent: true },
            ...heistRedirects,
            ...feedRedirects(),
            // The Sponsor Match Desk statement is a static page in public/match-desk. Next.js does
            // not serve a directory's index.html, and it strips the trailing slash of
            // `/match-desk/` before this rule runs.
            { source: "/match-desk", destination: "/match-desk/index.html", permanent: false },
            // The Pink Paw Knight embed's og:url is https://tokentails.com/swordcat-game/ (Next strips
            // the slash). Scrapers treat og:url as canonical, so the bare folder goes to the host page.
            // Assets such as /swordcat-game/og.jpg and /swordcat-game/index.html are not matched.
            { source: "/swordcat-game", destination: "/swordcat", permanent: false },
          ];
        },
        async rewrites() {
          return {
            beforeFiles: [],
            afterFiles: [...firebaseAuthRewrites, ...badcatRewrites, ...raveRewrites],
            fallback: badcatFallbackRewrites,
          };
        },
        async headers() {
          return badcatHeaders;
        },
      }),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
        port: "",
        pathname: "/**",
      },
    ],
    loader: "custom",
    loaderFile: "loader.js",
    deviceSizes: [240, 320, 400, 480, 600, 640, 720, 1000, 1200],
  },
};

module.exports = nextConfig;
