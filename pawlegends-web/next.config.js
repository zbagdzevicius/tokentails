// pawlegends-web: Paw Legends' own Next app on pawlegends.app (docs/plans/moba/PAWLEGENDS-WEB.md). Its own Vercel
// project (Root Directory `pawlegends-web`). Pages: `/` landing, `/legends` landing arm B, `/play` the game host,
// `/terms`, `/privacy`, `/account`, `/support`. The game is the static build in public/pawlegends-game
// (pawlegends: `npm run build:client`), served at the same `/pawlegends-game/**` URLs as before.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config
const routes = require("./components/pawlegends/routes.json");

const HOST = "pawlegends.app";
/** The pages that kept their name when they moved from tokentails.com/pawlegends/<page>. */
const PAGES = ["play", "privacy", "terms", "account", "support"];

// Links that need the game carry one of its query keys (party invites, dares, Stripe returns, account emails, `from`),
// so `/` and `/legends` with one go on to `/play` with their query (Next carries it over). Marketing links (`?utm_*`)
// stay on the landing. The landing repeats the check in the browser for client-side navigation.
const gameRedirects = ["/", routes.legendsPath, "/pawlegends"].flatMap((source) =>
  routes.playQueryKeys.map((key) => ({
    source,
    has: [{ type: "query", key }],
    destination: routes.playPath,
    permanent: false,
  }))
);

// The old tokentails.com paths, for links already out there and older game builds: the game opens
// `${origin}/pawlegends/terms`, and the backend's Stripe returns and account emails go to `/pawlegends?checkout=...`
// (those carry a game key, so gameRedirects sends them straight to /play first).
const legacyRedirects = [
  { source: "/pawlegends", destination: "/", permanent: true },
  { source: `/pawlegends/:page(${PAGES.join("|")})`, destination: "/:page", permanent: true },
];

// www goes to the apex, keeping the path and query.
const wwwRedirect = {
  source: "/:path*",
  has: [{ type: "host", value: `www.${HOST}` }],
  destination: `https://${HOST}/:path*`,
  permanent: true,
};

// Caching (LATENCY-PLAN §3.3 / C5). The game keeps the previous releases' hashed build/ files (pawlegends
// tools/lib/keep-releases.mjs), so a tab opened before a redeploy still loads its chunks: cached for good. The landing
// media carry a content hash in their names: cached for good too. The game's index.html changes on a release: the
// browser revalidates every time; Cloudflare (when in front) keeps a copy 60 s through `Cloudflare-CDN-Cache-Control`.
// The game's assets/ names are not content-hashed yet: an hour in the browser, a week stale-while-revalidate.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=0, must-revalidate";
const cache = (source, value) => ({ source, headers: [{ key: "Cache-Control", value }] });
const headers = [
  // Lets the cutover check (`curl -sI https://pawlegends.app/play`) tell this app from the old client deployment.
  { source: "/:path*", headers: [{ key: "x-pawlegends-web", value: "1" }] },
  cache("/pawlegends-game/build/:path*", IMMUTABLE),
  cache("/pawlegends/landing/:path*", IMMUTABLE),
  {
    source: "/pawlegends-game/index.html",
    headers: [
      { key: "Cache-Control", value: REVALIDATE },
      { key: "Cloudflare-CDN-Cache-Control", value: "max-age=60, stale-while-revalidate=300" },
    ],
  },
  // Force update (docs/plans/moba/FORCE-UPDATE.md §5.1): the live build's sha and sim. Open tabs read it on the title
  // and reload when it changed, so it follows index.html exactly (a tab never sees a newer version.json than index.html
  // for longer than the edge copy).
  {
    source: "/pawlegends-game/version.json",
    headers: [
      { key: "Cache-Control", value: REVALIDATE },
      { key: "Cloudflare-CDN-Cache-Control", value: "max-age=60, stale-while-revalidate=300" },
    ],
  },
  cache("/pawlegends-game/assets/:path*", "public, max-age=3600, stale-while-revalidate=604800"),
  // The skin art (pawlegends tools/import-skin-art.mjs, outside the game's 10 MB budget): the game asks for it lazily
  // with the build's `?v=` and falls back to the hero's own picture when it is missing. A day in the browser.
  cache("/pawlegends-art/:path*", "public, max-age=86400, stale-while-revalidate=604800"),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The E2E hooks are gated on this flag. Next inlines a NEXT_PUBLIC_ variable only when it is set; defaulting it to
  // "" makes every build without it compile the hooks out.
  env: {
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? "",
  },
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
  poweredByHeader: false,
  async redirects() {
    return [wwwRedirect, ...gameRedirects, ...legacyRedirects];
  },
  async headers() {
    return headers;
  },
  // The team hub (founder, Nov 13: "it must be in pawlegends.app/index page"): every link we made for Paw Legends,
  // a static page in public/hub (noindex). beforeFiles so it wins over the pages router's reserved /index.
  async rewrites() {
    return { beforeFiles: [{ source: "/index", destination: "/hub/index.html" }] };
  },
};

module.exports = nextConfig;
