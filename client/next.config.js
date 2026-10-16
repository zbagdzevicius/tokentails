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
          return firebaseAuthRewrites;
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
