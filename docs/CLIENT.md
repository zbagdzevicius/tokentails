# Web and Mobile Client (`client/`)

The client is one Next.js codebase that ships two ways: the public website at tokentails.com and
the iOS and Android apps through Capacitor. It has no API routes of its
own. Every server call goes to the NestJS backend described in [BACKEND.md](BACKEND.md).

Related docs: [GAMES.md](GAMES.md) for the Phaser game modes, [MOBILE.md](MOBILE.md) for
Capacitor builds and store releases.

## Stack

| Item | Value |
|---|---|
| Framework | Next.js 16.1 (Pages Router, Webpack builds), React 19.2, TypeScript 5 (`strict`) |
| Styling | Tailwind CSS 3 with `tailwindcss-convert-px-to-rem`, SCSS globals, framer-motion |
| Data | TanStack React Query 5, plain `fetch` wrappers in `api/` |
| Auth | Firebase Web SDK 11 (Google, Apple, email), Capacitor Firebase Authentication on native |
| Games | Phaser 4 (release candidate), WebGL, arcade physics |
| Web3 | Stellar Wallets Kit 2, Stellar SDK 15 |
| Payments | Stripe.js and React Stripe Elements |
| Visuals | d3 and topojson (pixel globe), swiper, vaul drawers, sonner toasts, Radix primitives. `three` and `@types/three` remain in `package.json` with no importers (follow-up chore: remove) |
| Mobile | Capacitor 7 with app, browser, clipboard, and Firebase authentication plugins |
| SEO | next-seo, next-sitemap |
| Tests | Jest 30, ts-jest, Testing Library (jsdom component suites for the homepage and the proof section) |

Path alias `@/*` maps to the `client/` root.

## Scripts

```bash
npm run dev            # next dev --webpack
npm run dev:turbo      # next dev (Turbopack)
npm run dev:https      # local HTTPS, uses the ignored certificates/ folder
npm run build          # next build --webpack, then postbuild sitemap
npm run build:prod     # build with .env.production
npm run build:app      # build with .env.app: static export to out/ (Capacitor bundle)
npm run check:app-export  # fail if out/index.html or key app routes are missing
npm run start          # next start
npm test               # jest
npm run coverage       # cobertura report to coverage.xml
npm run extrude:<set>  # regenerate an extruded tileset (see GAMES.md)
npm run app:*          # Capacitor sync, open, build, run (see MOBILE.md)
```

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BE_URL` | Backend base URL |
| `NEXT_PUBLIC_AI_URL` | Separate airdrop score service used by `api/ai-api.ts` |
| `NEXT_PUBLIC_DOMAIN` | Canonical site origin for SEO tags, share links, and the sitemap |
| `NEXT_PUBLIC_SITE_NAME` | Brand name for Open Graph and JSON-LD |
| `NEXT_PUBLIC_IS_PROD` | Switches Stellar mainnet vs testnet and CDN vs local assets |
| `NEXT_PUBLIC_IS_APP` | Marks a Capacitor build: static export, no ISR, no robots or sitemap extras, no feed ad slots, web checkout hidden, app-only profile UI |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager container, loaded only after analytics consent. Omit to disable GTM |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key (EU host `eu.i.posthog.com`, fixed in code). Omit to turn product analytics and its consent banner off |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Passed to `loadStripe` |
| `NEXT_PUBLIC_FB_APP_ID`, `NEXT_PUBLIC_FB_PAGES`, `NEXT_PUBLIC_TWITTER_PAGE` | Social meta tags |
| `NEXT_PUBLIC_THEME` | Legacy asset-path prefix |

Environment files: `.env.development` is ignored by git. `.env.app` and `.env.production` are
tracked and must only hold public values. The Firebase web config is hardcoded in
`context/FirebaseAuthContext.tsx` rather than read from environment variables.

`next.config.js` uses a custom pass-through image loader (`loader.js`) so Next image optimisation
is disabled, allows any HTTPS image host, and transpiles the Stellar Wallets Kit. The
`output` is `"export"` only when `NEXT_PUBLIC_IS_APP` is set, so `build:app` writes the
Capacitor bundle to `out/`; app builds also drop the server redirects. Web builds keep the Node
server, ISR, and redirects. See MOBILE.md for the app routes and the export check.

## Directory map

| Path | Purpose |
|---|---|
| `pages/` | Routes. |
| `api/` | Fetch wrappers grouped into `*_API` objects, plus `routing.ts` for feed categories and paging. |
| `components/` | All UI and all Phaser game code. About 190 files. |
| `components/Phaser/` | Shared game plumbing: event bus, tileset map, mobile controls, player movement, trampoline, and `hazards/` (spikes, saws, portals, floating platforms, morgenstern traps). |
| `components/CatnipChaos/`, `PixelRescue/`, `Match3/`, `base/`, `shelter/` | One folder per game mode. |
| `components/catbassadors/objects/` | The player cat class and abilities shared across platformers. |
| `components/tailsCard/`, `cardEffects/` | Collectible card rendering and per-tier effects. |
| `components/codex/` | Airdrop progression hub and in-game portrait purchase flow. |
| `components/web3/` | Stellar transfer, Stripe payment, payment chooser, rates hook. |
| `components/blog/` | Feed, article, comments, likes. |
| `components/marketplace/` | Cat store listing and detail. |
| `components/shared/` | Modals (sign in, quests, packs, invite, support, wheel), leaderboards, music, joystick. |
| `components/seo/` | `SeoHead`, article meta and JSON-LD. |
| `components/landing/` | Homepage sections: `Sponsors.tsx` logo slider, `ProofSection.tsx` Paris event video and creator-reel marquee with an IntersectionObserver playback controller (styles in `styles/globals.scss` under `.reel-*`). |
| `features/portrait/` | Self-contained slice for the AI pet portrait product. |
| `analytics/` | Consent-gated PostHog EU events. `events.ts` is the shared event scheme with Catnip Heist, `consent.ts` the stored choice, `client.ts` the gate, `gtm.ts` the Google Tag Manager gate, `game-run.ts` the GameContext hook, `platform.ts` `web`/`ios`/`android`. |
| `context/` | Providers: query client, toast, profile, cat, game, Firebase auth, web3, entity metadata. |
| `constants/` | Utilities, catnip accounting (with its only real test), rewards, static props helper. |
| `models/` | Domain types and enums. |
| `web3/` | Stellar recipient and asset addresses, Wallets Kit and Horizon setup. |
| `layouts/` | Main, blog, and airdrop layouts, header, footer, sidebar. |
| `styles/` | Global SCSS including the portrait-page theme and ambient effects. |
| `public/` | Around 1300 assets: Tiled level JSON for both platformers, tilesets, cards, cats, mascots, portrait samples, audio. |
| `scripts/` | Android release wrapper and two ad-hoc Tiled map editing tools with hardcoded Windows paths. |
| `docs/` | Android Play automation notes and the Paw Match execution plan. |
| `android/`, `ios/` | Capacitor native projects. See MOBILE.md. |
| `cats/`, `icons/`, `hooks/` | Empty or nearly empty. |

## Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/index.tsx` | Gaming landing: hero with store buttons and PLAY, Rescue Mission Hub (sample card linking to packs, portrait video linking to the portrait funnel), proof section (Paris cat café event video with Bybit and ChainforGood, marquee of creator reels; videos load and play only while on screen and never under reduced motion), pixel globe. Canonical is `NEXT_PUBLIC_DOMAIN/`. |
| `/old-landing` | `pages/old-landing.tsx` | Previous pixel-art landing. |
| `/gaming` | `pages/gaming.tsx` | Legacy URL. Permanent (308) redirect to `/` via `next.config.js`; the page itself is a `noindex` stub that does `router.replace("/")` for static exports, and is excluded from the sitemap. |
| `/game` | `pages/game.tsx` | Main web game shell: Firebase auth, game provider, game selector. |
| `/catbassadors` | none | Legacy URL of the retired game shell. Permanent redirect to `/game` via `next.config.js`; redirects do not apply to the static export, so the Capacitor bundle has no page there. |
| `/box` | `pages/box.tsx` | Mystery box opening, with Stellar payment. |
| `/packs` | `pages/packs.tsx` | Card pack store. |
| `/cats`, `/cats/:cat` | `pages/cats/*` | Marketplace listing and cat detail (ISR, revalidate hourly; web builds only emit the detail on demand). |
| `/cats/view?id=` | `pages/cats/view.tsx` | Client-rendered cat detail used by app builds instead of `/cats/:cat`. `noindex`, excluded from the sitemap. |
| `/feed`, `/feed/:category`, `/feed/:category/:article` | `pages/feed/*` | Blog feed, category, and article (ISR). |
| `/feed/article?category=&slug=` | `pages/feed/article.tsx` | Client-rendered article used by app builds instead of `/feed/:category/:article`. `noindex`, excluded from the sitemap. |
| `/portrait` | `pages/portrait.tsx` | Current AI pet portrait funnel. |
| `/portraits` | `pages/portraits.tsx` | Older duplicate of the portrait funnel. |
| `/payment-success` | `pages/payment-success.tsx` | Stripe redirect handler, confirms the intent, returns to `/game`. |
| `/stats` | `pages/stats.tsx` | Public traction stats from `GET /count`. |
| `/marketing` | `pages/marketing.tsx` | Partnership form embed. |
| `/giveaway` | `pages/giveaway.tsx` | Redirect to a social post with a Zealy embed. |
| `/404` | `pages/404.tsx` | Not found. |

`pages/_document.js` sets the mobile viewport and Apple web-app meta. It no longer injects Google
Tag Manager; GTM loads only after analytics consent (see "Analytics"). `pages/_app.tsx` wraps
everything in `MainLayout`.

## Authentication

Firebase is the only login. The token lives in one storage slot: `sessionStorage["accesstoken"]`.

1. **Firebase** (web and native). Google, Apple, and email with password. On native platforms the Capacitor Firebase plugin performs the sign-in and the web SDK receives the credential. The ID token is stored prefixed with `fb` and refreshed every 29 minutes. The sign-in modal opens automatically when a loaded profile has no cat.
2. **Stellar wallet**. Not a login. Used only to sign payment transactions.

Every authenticated call sends the stored value as a lowercase `accesstoken` header. A helper
polls session storage once per second until the token exists, with no timeout.

## Product features

### Cats and cards

Collectible "Tails Cards" with a 3D flip, per-tier effects (common, rare, epic, legendary), and
ten elemental types each with its own colours, background, and icon. Packs cost 5, 25, or 400 USD
for Starter, Influencer, and Legendary. Cards can be adopted, staked for a week, activated as the
player's cat, redeemed with promo codes, and gifted.

### AI pet portraits

The monetised flagship. Upload a photo, pick a style (Highness, Monarch, Aristocrat, Commander),
poll for the generated image, then buy. Purchase options are digital at 6 USD, fine art print at
49 USD, and gallery canvas at 69 USD. The in-game "Immortalize" flow in the codex offers the
digital portrait with Stripe or crypto payment; app builds hide that codex tab. Portrait pages switch the page theme through
`data-portrait-page` attributes on the document.

### Feed

Backend-driven blog under `/feed` with infinite scroll, likes, comments, sharing, and three
hardcoded categories: `cats-nft`, `announcements`, `all-about-cats`. Non-app builds inject an ad
placeholder every ten items. Article HTML from the backend has `[img-<id>]` placeholders rewritten
into figures pointing at an external image resizer inherited from a predecessor project.

### Marketplace

`/cats` lists cats for sale grouped by shelter slug with "shelter cats" and "famous cats" tabs.
Cat detail shows the card and shelter benefits and opens the payment flow.

### Economy

$TAILS is the soft currency. Catnip is the capped per-level score total. The client mirrors the
backend caps in `constants/catnip-accounting.ts`: Catnip Chaos level `01` caps at 420, every other
Catnip Chaos level at 10, and each Paw Match level at its configured cap up to 85. Loot boxes open
through the web3 module, paid or free.

### Progression and rewards

- **Daily spin wheel**: segments 1, 5, 10, 25, 50, 100, 250, 1000 $TAILS. The backend rolls the value and the wheel animates to it.
- **Quests**: hardcoded social follows, $TAILS milestones, friend invites, and a Pixel Rescue level quest, plus dynamic quests from the backend.
- **Codex**: the airdrop hub with overview, missions, tiers, pet art, and badges tabs, a countdown to the token generation event on 2026-11-19, and claim buttons for tiers, challenges, and milestones.
- **Leaderboards**: $TAILS, catnip, rescuer (currently backed by the catnip endpoint), and per-level Paw Match with exact self rank.
- **Referrals**: web links carry `?ref=<profileId>`. Both sides earn 100 $TAILS.

### Payments

`components/web3/Payment.tsx` chooses between Stripe and crypto. Stripe uses Payment Elements
with a debounced PaymentIntent, confirms without redirect where possible, and returns to
`/payment-success`. Crypto uses the Stellar flow below. Hosted Checkout Session variants exist for
the portrait pages. App builds hide all of it (store rules; IAP is deferred): `Payment`,
`StripePayment`, and `Web3Transfer` render `components/web3/AppCheckoutNotice.tsx` instead, and
Stripe.js is not loaded. Screens that show prices outside `Payment` (packs, mystery box, the codex
PET ART tab) hide them too. Details in MOBILE.md.

### Web3 (Stellar only)

`web3/contracts.ts` declares the Stellar chain, XLM and USDC as accepted currencies, the payment
recipient account, and the USDC issuer. `web3/web3-config.tsx` initialises the Stellar Wallets Kit
with LOBSTR as default and picks mainnet or testnet from `NEXT_PUBLIC_IS_PROD`.

Transfer flow in `components/web3/transfer/useWeb3Transfer.tsx`:

1. Open the wallet modal and connect.
2. Load the account from Horizon and build a payment transaction with a 300 second timeout.
3. Sign the XDR in the wallet, submit to Horizon.
4. Send only the transaction hash and order details to `POST /web3/confirm`. The backend verifies the transaction and grants the item.

USD prices convert to XLM using `GET /cat/rates`. No EVM, Solana, or WalletConnect code remains;
Solana was removed in March 2026. Cat documents still carry `token.sei` and `tokenId` fields from
an earlier chain.

### Other

Support tickets, share modal (native clipboard on Capacitor), stats page, pixel globe of partner
countries, discount codes, ambient effects (snow, fireflies), music player, and a separate
airdrop score service client in `api/ai-api.ts`.

## API client layer

Base URL from `NEXT_PUBLIC_BE_URL` in `api/api.ts`. Plain `fetch`, no interceptors, no retry.
Most functions log non-OK responses and return a neutral value; a few throw.

| Object | File | Backend paths |
|---|---|---|
| `ARTICLE_API` | `api/article-api.ts` | `/article/search`, `/feed/search`, `/article/:slug`, `/user/like`, `/user/entity-metadata`, `/comment`, `/comment/:type/:id` |
| `CAT_API` | `api/cat-api.ts` | `/cat/stake/:id`, `/cat/stake-reward/:id`, `/user/opened-pack/:id`, `/user/cats`, `/cat/:id`, `/cat/sale`, `PUT /cat/:id`, `/cat/:id/activate`, `/cat/redeem/:code` |
| `ORDER_API` | `api/order-api.ts` | `/cat/adopt/:id`, `/web3/confirm`, `/cat/rates`, `/cat/rate/:currency`, `/web3/raised`, `/web3/validate-discount` |
| `QUEST_API` | `api/quest-api.ts` | `/user/friends/invited`, `/count`, `/web3/open`, `/user/catbassadors/referralw/:profileId`, `/quest/complete/:quest`, `/quest/contest/:contest`, `/quest/search` |
| `USER_API` | `api/user-api.ts` | `/user/profile`, leaderboards and positions, `/user/leaderboard/paw-match/:level`, `/user/codex`, `PUT /user/profile/:id/twitter`, `/user/catbassadors/live`, `/user/catbassadors/lives/redeem`, airdrop progression and claims |
| `IMAGE_API` | `api/image-api.ts` | `/image/portrait`, `PUT /image/portrait/:id/regenerate`, `/image/:id`, `/image/order/status` |
| `STRIPE_API` | `api/stripe-api.ts` | `/web3/create-payment`, `/web3/confirm-payment`, `/image/create-checkout-session`, `/image/create-checkout-session-signed` |
| `TICKET_API` | `api/ticket-api.ts` | `POST /ticket`, `GET /ticket` |
| `ai-api.ts` | `api/ai-api.ts` | `/users/score`, `/users/search/:username` on the AI service |

The client calls `/user/like`, `/user/friends/invited`, `/web3/open`, and `/web3/raised`, which
do not exist in the current backend controllers. Those calls fail silently.

## State management

Provider tree from `layouts/MainLayout`: query client, Google Tag Manager, toast, profile, cat,
and the analytics consent banner (`next/dynamic`, `ssr: false`).
Pages add Firebase auth, the game provider, web3 (always dynamically imported with
`ssr: false`), and entity metadata inside blog layouts.

| Context | Role |
|---|---|
| `ProfileContext` | The hub: profile, share URL, platform utilities, logout, profile modal, leaderboard positions. |
| `FirebaseAuthContext` | Identity and profile query. |
| `CatContext` | Active cat and optimistic feeding. |
| `GameContext` | Game orchestrator: subscribes to Phaser events, saves scores, patches the profile, invalidates leaderboard queries, renders all global modals and end-game screens. Also forwards `GAME_START`, `GAME_LOADED` and `GAME_STOP` to `gameRun` for analytics (see "Analytics"). |
| `Web3Context` | Wallet connection, currency, rates, price, transaction status. |
| `EntityMetadataContext` | Batched like and save lookups. |
| `ToastContext` | FIFO toasts, 2.5 seconds each. |

React Query is used with a bare `QueryClient` and no default options.

## Analytics

Per-mode product events go to PostHog EU through `analytics/`. Nothing loads or sends until the
player presses ACCEPT on `components/shared/AnalyticsConsentBanner.tsx`; the default is off and
events from before consent are dropped, not queued. The choice is stored in `localStorage` under
`tt-analytics-consent` (reads and writes are wrapped in try/catch). Players change or revoke it
from the ANALYTICS button in the profile modal or the "Analytics settings" footer link; revoking
calls `reset()` and `opt_out_capturing()`. `posthog-js` is imported dynamically only after
consent. Autocapture, pageviews, session replay, surveys, flags and remote scripts are off,
`person_profiles` is `never`, and `identify` is never called, so the only id is PostHog's random
anonymous one. Events carry no user id, email, name or wallet.

Google Tag Manager (`NEXT_PUBLIC_GTM_ID`) sits behind the same choice through `analytics/gtm.ts`.
Before ACCEPT nothing is sent: `gtm.js` is not requested, no `dataLayer` exists, and `page_view`
and `trackEvent` pushes are dropped, not queued. On ACCEPT (or on load with consent stored)
`components/GoogleTagManager.tsx` pushes Consent Mode v2 defaults (all `denied`), then an update
granting `analytics_storage` only, then loads the container and records the current page. Ad
storage, ad user data and ad personalisation stay `denied` because the banner asks about
analytics only. Revoking stops all pushes and sends `analytics_storage: denied`; the loaded script
stays until the next page load. There is no `<noscript>` iframe. The banner only renders when
`NEXT_PUBLIC_POSTHOG_KEY` is set, so a build with a GTM id but no PostHog key never loads GTM.

| Event | Sent when | Properties |
|---|---|---|
| `game_start` | `GAME_START` with a mode selected | `mode`, `level`, `platform`, `is_restart` |
| `game_loaded` | First `GAME_LOADED` after a mode or level pick | `mode`, `level`, `platform`, `load_ms` |
| `game_finish` | `GAME_STOP` with `completedLevel`, a Purrsuit stop with `outcome: won`, or a Purrsuit stop with no outcome (older builds, `run_end`) | `mode`, `level`, `platform`, `outcome` (`win` or `run_end`), `duration_s`, `score`, `catnip` |
| `game_fail` | `GAME_STOP` without `completedLevel` in a level mode, or a Purrsuit stop with `outcome: died` or `quit` | same as `game_finish`, `outcome: fail` |
| `game_quit` | Leaving the mode while a run is in progress (Home and Shelter only ever quit) | `mode`, `level`, `platform`, `duration_s` |

Every event also carries the super properties `app` (`core`), `platform` and `device_tier`
(`low` at 4 GB `deviceMemory` or less). `mode` is the `GameType` value. Telemetry never writes
scores; `saveMatch` stays the only write path and now adds `platform` to the `/live` body.

## SEO

`components/seo/SeoHead.tsx` renders title, canonical, Open Graph, Twitter card, and Facebook
meta from environment variables. Feed pages add `WebPageJsonLd` and `ArticleJsonLd`. The sitemap
is generated after build by `next-sitemap`, which fetches `GET /feed/slugs` for article URLs
(`/feed/<category>/<slug>`, matching `pages/feed/[category]/[article].tsx`; entries missing a
category or slug are skipped) and
returns nothing when the backend is unreachable or in app builds. Generated `robots.txt` and
sitemap files are gitignored but currently present in `public/`.

## Testing

Three real suites exist. `constants/catnip-accounting.test.ts` covers cap normalisation, count
sums, and the total cap. `__test__/landing-routing.test.tsx` covers the root landing, the
`/gaming` redirect in both hosting modes, the sitemap exclusion, and stale anchors; it opts into
jsdom with a docblock and mocks the page's heavy components. `__test__/proof-section.test.tsx` covers the
homepage proof section: copy guard, video attributes, marquee duplication, the lazy motion-aware
playback controller (stubbed `IntersectionObserver`, `matchMedia`, and `HTMLMediaElement`
`play`/`pause`), and that every video and poster points at the deck originals on the pitch site. `__test__/analytics.test.ts` covers the consent gate (nothing
loaded or sent before consent, no queueing, revoke, no key), the `GAME_*` to event mapping, the
run tracker and `getPlatform`. `__test__/gtm-consent.test.ts` covers the GTM gate (no script,
`dataLayer` or events before consent, Consent Mode order, no replay, revoke, no id, no window,
no snippet in `_document.js`), the `GoogleTagManager` component, and `/feed`-prefixed article URLs
in the sitemap config. `__test__/app-export.test.ts` covers the app-build switches
(`output: "export"` and no redirects, no ISR or fallback, client-route links and `webPath`), and
`__test__/app-route-restore.test.tsx` covers routing a cold app load to the page the URL names.
`__test__/test.ts` is a placeholder
so coverage runs. Jest defaults to the `node` environment, so component tests need the
`@jest-environment jsdom` docblock. React 19 hoists `<title>`, `<meta>`, and `<link>` into
`document.head`, so head assertions query the document. `jest-util` 30 is pinned as a
devDependency because `ts-jest` 29 cannot resolve it under Jest 30 otherwise. Coverage is
collected only from `components/CatnipChaos/**`, which has no tests, so the reported figure is
misleading.

## Known issues

Build and SSR:

- The Stellar Wallets Kit and Stellar SDK are not SSR safe. `Web3Providers` must stay behind `next/dynamic` with `ssr: false` on `/box` and `/cats/[cat]`. This replaced an earlier AppKit prerender crash that blocked builds for weeks.
- `/feed` renders nothing until mount, losing server-rendered HTML.

Privacy:

- The consent banner copy describes game-event counting only. It does not name Google Tag Manager or the portrait `view_item`/`add_to_cart`/`begin_checkout`/`purchase` events that GTM now receives after ACCEPT, and it only appears when `NEXT_PUBLIC_POSTHOG_KEY` is set. A build with `NEXT_PUBLIC_GTM_ID` but no `NEXT_PUBLIC_POSTHOG_KEY` never shows the banner, so players cannot grant consent and GTM/GA receive no data at all. The current local build is in that state (GTM id compiled in, no PostHog key); the production environment must set the PostHog key.

Auth and storage:

- Tokens live in `sessionStorage` and die with the tab. The wait helper polls forever.

Hygiene:

- ESLint disables `react-hooks/rules-of-hooks` globally.
- `npm` itself is listed as a runtime dependency.
- `pages/portraits.tsx` duplicates most of `pages/portrait.tsx`.
- Empty folders: `cats/`, `icons/`. `gg.js` is an empty file.
- `components/storyMode/Managers/` still holds six unused managers (`DroppingSpike`, `FanManager`, `HiddenSpikeManager`, `LeverAndDoorManager`, `PlumbDoorManager`, `SawHalfManager`) that nothing imports. They are due for removal.
- `tsconfig.json` excludes directories that no longer exist.
- Card power on `CardBack` is a hardcoded placeholder (`POWER = 1`).
- The rescuer leaderboard is fed by the catnip endpoint.
- `.DS_Store` files are tracked in several folders.
