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
| Styling | Tailwind CSS 3 with `tailwindcss-convert-px-to-rem`, SCSS globals, framer-motion. Design tokens in `design/tokens.ts` generate `styles/tokens.css` (`tt-*` colours and z layers) |
| UI primitives | `components/ui/GameModal.tsx` (Radix Dialog 1.1), `PixelFrame`, `components/shared/CloseButton.tsx`, `PixelButton`, `PixelIcon` (pixelarticons 2.4.1, MIT) |
| Fonts | Self-hosted through `@fontsource` (Passion One, Bebas Neue, Nunito variable, Roboto 500) with metric-matched fallback faces (`@capsizecss/metrics`); no Google Fonts requests |
| Data | TanStack React Query 5, plain `fetch` wrappers in `api/` |
| Auth | Firebase Web SDK 11 (Google, Apple, email), Capacitor Firebase Authentication on native |
| Games | Phaser 4 (release candidate), WebGL, arcade physics |
| Web3 | Stellar Wallets Kit 2, Stellar SDK 15 |
| Payments | Stripe.js and React Stripe Elements |
| Visuals | d3 and topojson (pixel globe), swiper, vaul drawers, Radix primitives. Toasts are the custom `components/shared/Toast.tsx` (`sonner` is still in `package.json` with no importers). `three` and `@types/three` remain in `package.json` with no importers (follow-up chore: remove) |
| Mobile | Capacitor 7.2 with app, browser, clipboard, status bar, keyboard, haptics and Firebase authentication plugins |
| SEO | next-seo, next-sitemap |
| Tests | Jest 30, ts-jest, Testing Library, axe-core; Playwright 1.63 with `@axe-core/playwright` for end-to-end suites in `e2e/` |

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
npm run test:e2e       # Playwright (DEVELOPMENT.md, "Client")
npm run tokens:build   # design/tokens.ts -> styles/tokens.css (tokens:check in CI)
npm run fonts:sync     # self-hosted fonts and @font-face rules (fonts:check)
npm run icons:build    # favicon, PWA, apple-touch and store icons (icons:check)
npm run meta:check -- --base <url>   # served meta, icons, canonicals and OG tags
npm run palette:check  # night palette guard (blocking; --warn reports only)
npm run codemod:night-tokens         # yellow-300 / text-yellow-900 to tt-* tokens
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
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase `authDomain`; falls back to the Firebase project's default host. Moving it to tokentails.com is decision #6 (preview first) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY` | `1`, `true`, `yes` or `on` adds the `/__/auth/*` and `/__/firebase/init.json` rewrites to the Firebase auth host (`next.config.js`). Default off |
| `FIREBASE_AUTH_ORIGIN` | Build-time target of those rewrites (default the project's `firebaseapp.com` host) |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key; when set, the guest session request carries `x-firebase-appcheck`. Off by default |
| `NEXT_PUBLIC_HEIST_PICKER` | `1` shows the Catnip Heist card in the PLAY picker in production (always on in development and E2E builds). Off until the Poki carve-out (decision #15) |
| `NEXT_PUBLIC_HEIST_LANDING_PILL` | `1`, `true` or `on` shows "Or play Catnip Heist now, no sign-up" under the landing hero. Default off (decision #15) |
| `NEXT_PUBLIC_IMPACT_URL` | CDN URL of the impact snapshot mirror (default `impact/impact.json` on the asset CDN) |
| `NEXT_PUBLIC_SNOWFALL` | `on` turns the seasonal Snowfall on (off by default, decision #47; month-day windows in `SNOWFALL_SEASONS`) |
| `NEXT_PUBLIC_WALLET_DONATE` | `true` shows the optional donate-from-your-own-wallet button on the shelter payouts page (web only) |
| `NEXT_PUBLIC_E2E` | `1` compiles in the E2E-only hooks (fake Firebase adapter, crash probes, `window.__ttGames`, `window.__TT_E2E_GAME__`). CI's e2e build only; never deploy it |
| `NEXT_PUBLIC_CAPTURE` | `1` compiles in the frame-stepping capture hooks (`window.__TT_CAPTURE__`) for the reel. Capture builds only |

Script-only variables: `IMPACT_SOURCE_URL` (`scripts/snapshot-impact.mjs`), the `E2E_*` variables of the
Playwright harness (DEVELOPMENT.md), `REEL_CLIPS`, `REEL_DRY_RUN`, `REEL_FRAMES_DIR` (reel capture).

Environment files: `.env.development` is ignored by git. `.env.app` and `.env.production` are
tracked and must only hold public values. The Firebase web config is hardcoded in
`context/FirebaseAuthContext.tsx` rather than read from environment variables (only `authDomain`
reads one).

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
| `components/codex/` | PROGRESS (the CODEX modal): IMPACT tab (`impact/`), rewards, missions, tiers, badges, the web-only Vault, the Tails explainer, and the in-game portrait purchase flow. |
| `components/web3/` | Stellar transfer, Stripe payment, payment chooser, rates hook. |
| `components/blog/` | Feed, article, comments, likes. |
| `components/marketplace/` | Cat store listing and detail. |
| `components/shared/` | Modals (quests, packs, invite, support, wheel), leaderboards, music, joystick, `PixelButton`, `PixelIcon`, `CloseButton`, `CatnipIcon`, `Toast`, the AuthSheet (`auth/`). |
| `components/ui/` | `GameModal`, `PixelFrame`, `lowfx.ts`. |
| `components/errors/` | Root, page, scene, modal and section boundaries, `CrashPanel`, crash probes (RESILIENCE.md). |
| `components/claims/` | `Claim`, `ProofDrawer`, evidence chips, the web and app label sets, money formatting, fact helpers (plan G11, CLAIMS.md). |
| `components/impact/` | Lobby RESCUE tile, impact strip, `PawProgress`, MY IMPACT summary, end-of-run paw line. |
| `components/onboarding/` | Meet your cat (step machine, altar, starters, names, draft, commit, hand-off), `RenameSheet`. |
| `components/heist/` | The `/heist` host: bridge, suspension stand-in, saves queue, save chip. |
| `components/audio/` | Audio settings store, music engine, system mute, tracks, Settings modal, mute toggle, graphics control. |
| `components/typography/`, `components/Phaser/typography/` | Type roles, `loadGameFonts`, `ttCanvasFont`; the Phaser side (`TTFontsFile`, `ttText`, `ttFit`, font healing, `ttWorldText`). |
| `components/Phaser/look/` | Render foundation, tiers, camera rig, world look, backdrop, ambience, look manifest and settings, capture hooks. |
| `components/Phaser/onboarding/` | Run gate, first hazard, checkpoints, save policy, progress and hints (GAMES.md). |
| `components/reel/` | The landing gameplay reel. |
| `components/native/` | `NativeChrome` (status bar). |
| `design/` | `tokens.ts`: night, gold, ink, state, dusk and parchment colours, `LAYERS`, type roles, `THEME_COLOR`. |
| `lib/game/gameRegistry.ts` | Registered Phaser games, the suspension, the form-field key guard. |
| `hooks/` | `useStorefront`, `useImpact`, `useAccountAction`, `useSuspendGame`. |
| `shared-contracts/` | Generated copies of `shared/` (never edit). |
| `art/` | Art sources and masters: the catnip matrices, the palette, `art/src/` (Aseprite and Tiled sources). |
| `e2e/` | Playwright specs and fixtures, `e2e/capture/` for the reel. |
| `components/seo/` | `SeoHead`, `site.ts` URL helpers, article JSON-LD. |
| `components/landing/` | Homepage sections: `Sponsors.tsx` logo slider, `ProofSection.tsx` Paris event video and creator-reel marquee with an IntersectionObserver playback controller (styles in `styles/globals.scss` under `.reel-*`). |
| `features/portrait/` | Self-contained slice for the AI pet portrait product. |
| `analytics/` | Consent-gated PostHog EU events. `events.ts` is the typed F9 event catalog (names and areas come from `shared/analytics-core.ts`, which the Heist reads too), `consent.ts` the stored choice, `client.ts` the gate, `errors.ts` the scrubbed `app_error` reporter, `scrub.ts` the scrubber, `gtm.ts` the Google Tag Manager gate, `game-run.ts` the GameContext hook, `platform.ts` `web`/`ios`/`android`. |
| `context/` | Providers: query client, toast, profile, cat, game, Firebase auth, web3, entity metadata. |
| `constants/` | Utilities, catnip accounting (with its only real test), rewards, static props helper. |
| `models/` | Domain types and enums. |
| `web3/` | Stellar recipient and asset addresses, Wallets Kit and Horizon setup. |
| `layouts/` | Main, blog, and airdrop layouts, header, footer, sidebar. |
| `styles/` | Global SCSS including the portrait-page theme and ambient effects. |
| `public/` | Around 1300 assets: Tiled level JSON for both platformers, tilesets, cards, cats, mascots, portrait samples, audio. |
| `scripts/` | Android release wrapper, token/palette/font builders, and `scripts/art/` (the G7 art build `build.mjs`, the Tiled tool `tile-legend.mjs`, the catnip exporter). |
| `docs/` | Android Play automation notes and the Paw Match execution plan. |
| `android/`, `ios/` | Capacitor native projects. See MOBILE.md. |
| `cats/`, `icons/` | Empty or nearly empty. |

## Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/index.tsx` | Gaming landing: hero with store buttons and PLAY, proof section (Paris cat café video, SEI track record and "Now: Stellar NFTs" claims, an Arc rail note, a published-outcomes chip hidden while zero, reach cards as claims; videos load and play only while on screen and never under reduced motion), impact globe lighting the active partner countries from the impact snapshot, Rescue Mission Hub, team. Every number is a `components/claims/Claim` with a registry id. One `getStaticProps` (revalidate 300 on web) reads the impact snapshot (CDN, API, bundled baseline). Each section sits in a `SectionBoundary`. Canonical is `NEXT_PUBLIC_DOMAIN/`. |
| `/impact` | `pages/impact.tsx` | Public proof page (plan F7.6): money per currency and evidence tier, custody, treat rail, outcome timeline, pledged vs paid, paw settlements, rescue cats, reach, method, and every public claim with value, date, status and source (an `id` anchor per claim). Web: ISR every 600 s; app export: the committed `public/impact/snapshot.json`, app labels. |
| `/proof` | none | Legacy URL. Permanent redirect to `/impact` on the web (`next.config.js`). |
| `/old-landing` | (retired) | Redirects permanently to `/` on the web (decision #43); the page, `FeedbackSlider` and `Preview` were deleted. |
| `/gaming` | `pages/gaming.tsx` | Legacy URL. Permanent (308) redirect to `/` via `next.config.js`; the page itself is a `noindex` stub that does `router.replace("/")` for static exports, and is excluded from the sitemap. |
| `/game` | `pages/game.tsx` | Main web game shell: auth in `guest` mode (a silent anonymous session, no sign-in wall), game provider, the night intro curtain, Meet your cat for a pending player, the lobby. `?meet=1` replays Meet your cat (read once `router.isReady`, then removed); `?ref=` is captured for the referral. Canonical `/game` without the query. |
| `/heist` | `pages/heist.tsx` | Catnip Heist host: optional auth, SeoHead, the `/heist-game/index.html?embed=1` iframe in the server HTML, the bridge and the save chip. `?from=` feeds `heist_open` and is stripped. `/heist/index.html` redirects here; `/heist/:path+` redirects to `/heist-game/:path+` (old asset links) |
| `/heist-game/` | `public/heist-game/` | The static Heist build (`npm run build:client` in `catnip-heist/`); `public/heist/index.html` forwards app builds to `/heist`. |
| `/shelter-payouts`, `/shelter-payouts/give`, `/shelter-payouts/receipt` | `pages/shelter-payouts*` | Treats and payouts on Arc, the give page (`requireAccount('give-treat')`), one receipt per donation (`noindex`). App builds show a proof notice that opens web `/impact`. |
| `/airdrop`, `/airdrop/*` | none | Redirect to `/shelter-payouts` (task 5e). |
| `/catbassadors` | none | Legacy URL of the retired game shell. Permanent redirect to `/game` via `next.config.js`; redirects do not apply to the static export, so the Capacitor bundle has no page there. |
| `/box` | `pages/box.tsx` | Retired (decision #43): redirects to `/game` (server redirect on the web, a client redirect in the static export). |
| `/packs` | `pages/packs.tsx` | Card pack store. |
| `/cats`, `/cats/:cat` | `pages/cats/*` | Marketplace listing and cat detail (ISR, revalidate hourly; web builds only emit the detail on demand). |
| `/cats/view?id=` | `pages/cats/view.tsx` | Client-rendered cat detail used by app builds instead of `/cats/:cat`. `noindex`, excluded from the sitemap. |
| `/feed`, `/feed/:category`, `/feed/:category/:article` | `pages/feed/*` | Blog feed, category, and article (ISR). |
| `/feed/article?category=&slug=` | `pages/feed/article.tsx` | Client-rendered article used by app builds instead of `/feed/:category/:article`. `noindex`, excluded from the sitemap. |
| `/portrait` | `pages/portrait.tsx` | Current AI pet portrait funnel. |
| `/portraits` | `pages/portraits.tsx` | Older duplicate of the portrait funnel. |
| `/payment-success` | `pages/payment-success.tsx` | Stripe redirect handler, confirms the intent, returns to `/game`. |
| `/stats` | `pages/stats.tsx` | Public numbers from the hourly impact snapshot (`useImpact`, the same source as `/impact`), each through `<Claim>`. |
| `/marketing` | `pages/marketing.tsx` | Partnership form embed. |
| `/giveaway` | `pages/giveaway.tsx` | Retired (decision #43): redirects to `/game`. |
| `/404` | `pages/404.tsx` | Not found. |

`pages/_document.js` writes `data-sky="night"` (and `data-zoom="locked"` on `/game`) into the server
HTML for the night routes (`/`, `/packs`, `/shelter-payouts/*`, `/impact`, `/heist`, `/game`;
`components/shared/skyScope.ts`), an inline first-paint night background, `theme-color` `#0b0820`,
one icon set (`favicon.ico`, the 32 and 192 PNGs, the apple-touch icon), the manifest link and the
font preloads. It no longer injects Google Tag Manager; GTM loads only after analytics consent (see
"Analytics"). `pages/_app.tsx` wraps everything in the `RootBoundary` and `MainLayout`, renders one
keyed viewport tag per route (zoom is allowed everywhere except `/game`, which adds
`maximum-scale=1, user-scalable=no`), re-applies `data-sky` on client navigation and mounts
`NativeChrome`. The PWA manifest (`public/manifest.webmanifest`) is night, PNG-only, `start_url: /game`,
with separate maskable icons.

## Authentication

Firebase is the only login (plan F5.7, G1, G9). The token lives in one storage slot:
`sessionStorage["accesstoken"]`, stored prefixed with `fb`, kept current by `onIdTokenChanged`
(linking does not fire `onAuthStateChanged`) with a 29-minute refresh as a safety net.

- **Auth modes** (`context/FirebaseAuthContext.tsx`): `authMode="guest"` on `/game` signs in anonymously and silently (one single-flight promise, `context/auth/sessions.ts`) and shows the transient template profile until the backend answers; nothing walls the lobby. `authMode="optional"` (the default: `/heist`, feed, cats, payouts, the landing reader) reuses any session, creates none and never opens the sheet by itself. Logging out on `/game` starts a fresh lazy guest.
- **Status** (`context/auth/authStatus.ts`): `unknown`, `guest`, `signed-out`, `needs-verification` (403 `EMAIL_UNVERIFIED`), `loading-profile`, `ready`, `profile-error`, plus `authReady` and `authSettled` for the intro curtain.
- **`requireAccount(reason)`** (`context/auth/accountGate.ts`) is the only way the sign-in sheet opens for an action. It resolves `signed-in` only for a fresh profile with `isGuest !== true`, or `dismissed` when the player closes the sheet; concurrent callers share one sheet. Lobby actions use `hooks/useAccountAction.ts` (`runWithAccount(reason, action)`). Reasons pick the sheet title (decision #64): "SAVE YOUR CAT" (`save-progress`), "CLAIM YOUR REWARDS" (`claim-rewards`), "WELCOME TO TOKEN TAILS" (everything else).
- **AuthSheet** (`components/shared/auth/AuthSheet.tsx`): a GameModal sheet on the auth layer with one static hero cat (decision #65) and night brand buttons for Google and Apple (`BrandSignInButton.tsx`, Roboto 500 for Google). Views: choose, email (separate sign-in and Create account tabs, labelled inputs, show-password, inline validation), verify-email (resend with a 60 s cooldown, poll every 5 s), reset (neutral copy, a toast only after the request resolves), link-account, linking, busy, profile-error, conflict (a selectable reference for support), merged, fallback (when the anonymous sign-in fails; it links the Heist) and an in-app-browser notice. It is closable in every view except needs-verification and profile-error. Sign-in never creates an account; only the Create account tab does.
- **Linking** (`context/auth/link.ts`): web `linkWithPopup` on the anonymous user, opened synchronously in the tap; native `linkWithCredential`; email through `EmailAuthProvider.credential` and `sendEmailVerification`. `credential-already-in-use` signs in to the existing account and merges the guest (`POST /user/guest/merge` with `x-guest-token`); a retryable merge failure is kept in `sessionStorage["tt.pendingMerge"]` for up to an hour, bound to the target uid.
- **Guest pill** (`components/shared/auth/GuestPill.tsx`): "Guest · Save your cat" in the lobby, or "Not signed in · Sign in" after a failed anonymous sign-in. Save nudges (`context/auth/saveNudge.ts`, decision #10) appear once a session as a bubble on the pill: at the first clear, the first PROGRESS visit and after 10 minutes.
- **Referral**: `?ref=<24-hex id>` is stored once in `localStorage["tt.pendingRef"]` on any page and sent to `POST /user/catbassadors/referral` only when a profile arrives with `promotedNow: true`.
- **App Check**: `x-firebase-appcheck` is sent with the guest session only when `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set.
- **Account**: guests get SAVE PROGRESS and ERASE GUEST PROGRESS in ABOUT ME; accounts get Logout and DELETE ACCOUNT (a confirm step, a fresh Sign in with Apple authorization code on iOS, then `DELETE /user/me`), and RENAME for the committed starter.
- **E2E hook** (`context/auth/adapter.ts`): `window.__TT_E2E_AUTH__` swaps the Firebase client for a fake, only in development or a `NEXT_PUBLIC_E2E=1` build. Backend calls stay real requests; there is no server bypass.
- **Stellar wallet**: not a login. Used only to sign payment transactions.

Every authenticated call sends the stored value as a lowercase `accesstoken` header. The old helper
`waitForLocalStorageKey` (`api/api.ts`) still polls session storage once per second until the token
exists, with no timeout; new code paths never use it (known issue).

The Firebase console must have the Anonymous provider enabled for guest play; without it a new
visitor sees the dismissible fallback over a playable lobby and nothing saves.

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

Tails are rescue points (decision #34), never "$TAILS": the shared `formatTails` writes "1,500 Tails",
and the small print says Tails have no cash value. Catnip is the capped per-level score total. The client mirrors the
backend caps in `constants/catnip-accounting.ts`: Catnip Chaos level `01` (endless) caps at 500 (`CATNIP_CHAOS_ENDLESS_CAP`), every other
Catnip Chaos level at 10, and each Paw Match level at its configured cap up to 85. Loot boxes open
through the web3 module, paid or free.

### Progression and rewards

- **Daily spin wheel**: segments 1, 5, 10, 25, 50, 100, 250, 1000 Tails with the published odds from `GET /user/catbassadors/lives/odds`. The backend rolls the value and the wheel animates to it; the wheel cannot be closed between SPIN and the reveal. Guests are asked to sign in first.
- **Cat nap**: staking a cat for a week pays a flat 50 Tails, at most 3 cats (the CatsModal shows the Tails the backend paid).
- **Quests**: hardcoded social follows, Tails milestones, friend invites, and a Pixel Rescue level quest, plus dynamic quests from the backend.
- **PROGRESS (Codex)**: tabs IMPACT (default: season band, current Rescue Goal with 100 / 1,000 / MAX gives and a confirm sheet, the treat card, today's paw, MY IMPACT, DELIVERED), REWARDS, MISSIONS, TIERS, PET ART (web only), BADGES and VAULT (web only, only when `GET /user/token-status` says TOKEN). The lobby RESCUE tile and MY IMPACT deep-link to IMPACT. Claim buttons for tiers, challenges and milestones are on REWARDS, MISSIONS and TIERS.
- **Leaderboards**: earned Tails, catnip ("TOP CATNIP COLLECTORS", no payout promise), rescuers (Tails given, `GET /user/leaderboard/rescuers`), and per-level Paw Match with exact self rank. Guests see "you would be #N".
- **Referrals**: web links carry `?ref=<profileId>`. Both sides earn 100 Tails once the referred player's account exists.
- **Meet your cat** (`components/onboarding/`, plan G3): after the night intro curtain, a pending player (guests included) meets their cat on the landing's altar: the painted tabby crossfades to pixel Scout, then choose one of five starters (decision #19), name it (shared `normalizeCatName`, "Surprise me", featured real-cat names reserved), the reveal ("Meet {name}!"), and three featured rescue cats to follow. SKIP commits the default at any step. The commit is `POST /user/starter` (409 means done); an offline commit is kept as `localStorage["tt.starterDraft"]` (per uid, 30 days) and retried silently. The lobby hero slot shows the cat at an integer scale. `RenameSheet` renames later (one free rename per 30 days).
- **Impact in the game** (plan G4, G5): the lobby RESCUE tile (badge: lifetime paws, or NEW), MEET SHELTER CATS, the md+ impact strip (today's paw, treats, payouts as claims), MY IMPACT in ABOUT ME, and the end-of-run paw line ("Paw earned: tonight Token Tails pays a treat to Pink Paw." only when the paw is earned and paw sends are on).

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

Base URL from `NEXT_PUBLIC_BE_URL` in `api/api.ts`. Most functions log non-OK responses and return a
neutral value; a few throw.

`apiFetch` (and `installApiInterceptor`, which routes plain `fetch` calls to the backend through the
same handling, opt-in per route) maps the F5.6 codes: 428 `GUEST_SESSION_REQUIRED` creates the guest
session once (single-flight per uid) and retries once; 403 `GUEST_FORBIDDEN` calls
`requireAccount(reason)` and retries once with the new token; 403 `EMAIL_UNVERIFIED` opens the
verification view; 409 `ACCOUNT_CONFLICT` the conflict view. The guest session is allowed only for the
guest writes (`/user/catbassadors/live`, `/user/starter`, `/user/following/:id`, `PUT /cat/:id[/name]`);
the sheet opens only for player actions, named by the route (purchase, give-treat, adopt, sign-in,
support); every other call gets its 403 or 428 back untouched, and GETs are never retried.
`USER_API.saveMatch` is unchanged; the Heist uses `saveMatchDetailed`, which never throws and returns
`{ok, status, code, body, retryAfter}`. `CAT_API.storefront()` passes `/cat/sale` through the shared
`parseStorefrontDetailed` and never returns an array or throws; `CAT_API.cats()` always returns an
array.

| Object | File | Backend paths |
|---|---|---|
| `ARTICLE_API` | `api/article-api.ts` | `/article/search`, `/feed/search`, `/article/:slug`, `/user/like`, `/user/entity-metadata`, `/comment`, `/comment/:type/:id` |
| `CAT_API` | `api/cat-api.ts` | `/cat/stake/:id`, `/cat/stake-reward/:id`, `/user/opened-pack/:id`, `/user/cats`, `/cat/:id`, `/cat/sale`, `PUT /cat/:id`, `/cat/:id/activate`, `/cat/redeem/:code` |
| `ORDER_API` | `api/order-api.ts` | `/cat/adopt/:id` (retired on the backend, no caller), `/web3/confirm`, `/cat/rates`, `/cat/rate/:currency`, `/web3/raised`, `/web3/validate-discount` |
| `QUEST_API` | `api/quest-api.ts` | `/user/friends/invited`, `/count`, `/web3/open`, `/quest/complete/:quest`, `/quest/contest/:contest`, `/quest/search` (the per-load `referralw` call is gone) |
| `USER_API` | `api/user-api.ts` | `/user/profile`, `/user/guest/session`, `/user/guest/merge`, `DELETE /user/guest`, `DELETE /user/me`, `/user/catbassadors/referral`, leaderboards and positions, `/user/leaderboard/paw-match/:level`, `/user/codex`, `PUT /user/profile/:id/twitter`, `/user/catbassadors/live`, `/user/catbassadors/lives/redeem` and `/odds`, progression and claims |
| `STARTER_API` | `api/starter-api.ts` | `/user/starter`, `/blessing/featured`, `/blessing/featured/names`, `/user/following/:id`, `PUT /cat/:id/name`, `POST /cat/:id/report` |
| impact | `api/impact-api.ts`, `hooks/useImpact.ts` | The snapshot chain: CDN `impact.json`, then `GET /impact`, then the bundled `public/impact/snapshot.json` (3 s per source, 429 never retried); `normalizeImpact` validates `_v: 1` and drops bad values; `/impact/me` |
| `SHELTER_API` | `api/shelter-api.ts` | `/shelter/donate` (reads the error `code`: `signed-out`, `not-eligible` with `reason` and `eligibleAt`, `already-sent`), `/shelter/donate/status`, `/shelter/donate/me` |
| rescue goals, token status | `api/rescue-goals-api.ts`, `api/token-status-api.ts` | `/rescue-goals`, gives with `pledgeWithRetry` (same UUID up to 3 tries), `/user/token-status` (web only; any failure means POINTS) |
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
| `FirebaseAuthContext` | Identity, auth mode, auth status, `requireAccount`, the AuthSheet, guest session and merge, `eraseGuest`, `refreshProfile`. |
| `CatContext` | Active cat and optimistic feeding. |
| `GameContext` | Game orchestrator: subscribes to Phaser events, applies the save policy, saves scores, patches the profile (cleared arrays included), keeps `lastOutcome`, sends `GAME_RESTART` for PLAY AGAIN, renders all global modals, the DeathCard and the end-of-run panels. Forwards `RUN_BEGIN`, `GAME_LOADED`, `LIFE_LOST` and `GAME_STOP` to `gameRun` for analytics (see "Analytics"). |
| `Web3Context` | Wallet connection, currency, rates, price, transaction status. |
| `EntityMetadataContext` | Batched like and save lookups. |
| `ToastContext` | FIFO toasts, 2.5 seconds each, on the `z-toast` layer (500). An always-mounted `sr-only` `role="status" aria-live="polite"` copy of the current toast keeps it readable to screen readers while a Radix modal hides the rest of the page. While the AuthSheet holds toasts (`useToastHold`) none renders; they queue, their text shows in the sheet's alert region, and they play after it closes. The context value is memoised, so `useToast()` is stable. |

React Query is used with a bare `QueryClient` and no default options.

## UI system (plan F3, F4, G6, G12)

- **Tokens** (`design/tokens.ts`, pure data): `NIGHT` 950 to 500 (`#0b0820` is 900), `GOLD` (400, 500, ink, shadow), `INK` (cream, lilac, muted), `STATES` (rust, pink, ember, mint, sky), `DUSK`, `PARCHMENT`, `LAYERS` and `THEME_COLOR`. `npm run tokens:build` writes `styles/tokens.css` (`--tt-<name>: r g b`); Tailwind exposes them as `bg-tt-night-900`, `text-tt-gold-ink`, `text-tt-cream` and so on, plus the variants `lowfx:` (Android or 4 cores and fewer) and `reduced-transparency:`. The `yellow.300` override stays until the last class users move to `tt-cream`.
- **Layers** (`LAYERS`, Tailwind `z-*`): `hud` 40, `gate` 80, `modal` 100, `modal-nested` 110, `auth` 200, `intro` 300, `reveal` 400, `celebration` 450, `toast` 500, `system` 600. The scene fallback sits at 90 and the page fallback at 590.
- **Night scope**: `data-sky="night"` on the night routes gives cream ink, `color-scheme: dark` and surface-aware ink on panels; other routes keep the old ink on a night background. `--tt-sky-dusk` grades the Shelter lobby. Snowfall is seasonal and off by default. Stripe Elements and the Stellar Wallets Kit use night themes (`components/web3/nightTheme.ts`; system font stacks, since their iframes cannot load our fonts). `scripts/check-palette.mjs` flags full-screen cream or white overlays, arbitrary `z-[N]` overlays and night hex literals outside the tokens (allowlist with a `max` count).
- **GameModal** (`components/ui/GameModal.tsx`): every lobby and end-of-run modal. Radix Dialog with a night scrim, a Passion One gold title, focus returned to the opener, surfaces `panel` (PixelFrame, scrolling body), `sheet` (a bottom sheet on phones) and `art` (no frame, the X outside). `dismissible={false}` hides the X; `canClose={false}` shows it disabled and blocks Esc and the scrim. `modal={false}` drops the focus trap (the Packs checkout, so Stripe and the wallet kit stay clickable). Children render inside a `ModalBoundary`; by default it suspends the games (`useSuspendGame`). Do not put `filter`, `transform` or `backdrop-filter` classes on its content: they make the panel the containing block of fixed children.
- **CloseButton** (`components/shared/CloseButton.tsx`): a real `<button aria-label>` of at least 44 px (64 px from `lg`; px, not rem, because phones scale rem), `placement` `inside` (default), `outside`, `viewport` (safe-area aware, used over the Paw Match canvas) or `sticky`. The legacy `absolute` prop is gone.
- **PixelButton** (`size` `sm`/`md`/`lg`, `fullWidth`, `icon`, `busy`, `disabled`, `type` default `button`, `pressed`, `as="span"` for use inside a link: a span accepts no `busy`, `disabled` or `type`) and **PixelIcon** (inline SVG from pixelarticons path data, `aria-hidden` unless labelled; `messenger` is hand-drawn). An ESLint rule fails on any boxicons class.
- **CatnipIcon** (`size` 16 to 96): the botanical sprig with an exact 1x/2x/3x srcset from `public/catnip/`; decorative next to a visible "catnip" label (`alt=""`).
- **Typography** (`components/typography/`, roles in `design/tokens.ts` `TYPE_ROLES`): `title` (Passion One 900), `hud` and `label` (Bebas Neue, upper case), `caption` (Nunito 700), `hint` (Nunito 800, sentence case, at least 14 px), `burst` (Passion One 900, upper case) and `code` (monospace, tx hashes only). DOM text uses `font-primary` (Passion One) and the html Nunito stack. Fonts are self-hosted with metric-matched fallback faces (`"<Family> Fallback"`, and `"<Family> Fallback Android"` for Roboto Bold), `font-display: swap`, latin and latin-ext subsets, and versioned `?v=` URLs. `loadGameFonts` waits for both subsets for at most 3 s, never rejects, retries the missing faces twice per page and sends at most one `game_font_fallback`. The ESLint rule `tt/no-raw-font` is an error on raw font families (`public/rail/**` is exempt: the embeddable widget runs in a shadow root on other sites); `components/typography/**` may not import Phaser.
- **Look settings** (`components/Phaser/look/settings.ts`): render tier (`tt-render-tier`: auto, high, low), the reduced-motion override (`tt-reduced-motion`: system, on, off) and the look version override (`tt-look-version`, also read as `tt.lookVersion`). Every value has a memory fallback when storage is blocked and applies on the next game mount; changes fire `tt-look-settings`. Settings shows them under Graphics.

## Audio (plan G14)

`components/audio/`: one `<audio>` element per page (`musicEngine.ts`), created only after the first
input (autoplay policy). It plays when a track is set, the music volume is above 0 and not muted, no
GameModal suspension holds audio, and the tab is visible; a refused play is retried on the next
input. Defaults: music 0.4, effects 0.6, not muted, stored in `localStorage["tt:audio:v1"]` (a failed
read gives the defaults; the old `gameMusic` off setting is read once as muted). Effects volume and
mute also reach every Phaser sound manager and the PixelButton click and hover sounds. On iOS 16.4+
`navigator.audioSession.type = "ambient"` follows the silent switch; older iOS WebViews keep music off.
The lobby theme is `LOBBY_MUSIC_TRACK` in `tracks.ts` (the commissioned night theme is deferred; drop
the file in `public/music/` and change the constant). The Heist maps to no track. Controls: a Settings
gear and a mute toggle in the lobby HUD (44 px, `aria-pressed`), and the Settings modal (mute, music
and effects sliders, Graphics); the profile sheet has the same sound panel.

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
| `game_start` | `RUN_BEGIN` (the first input behind the RunGate; plan F6). `GAME_START` no longer sends it | `mode`, `level`, `platform`, `is_restart` (true after PLAY AGAIN / RETRY) |
| `game_loaded` | First `GAME_LOADED` after a mode or level pick | `mode`, `level`, `platform`, `load_ms` |
| `game_finish` | `GAME_STOP` with `completedLevel`, a Purrsuit stop with `outcome: won`, or a Purrsuit stop with no outcome (older builds, `run_end`) | `mode`, `level`, `platform`, `outcome` (`win` or `run_end`), `duration_s`, `score`, `catnip` |
| `game_fail` | `GAME_STOP` without `completedLevel` in a level mode, or a Purrsuit stop with `outcome: died` or `quit` | same as `game_finish`, `outcome: fail` |
| `game_quit` | Leaving the mode while a run is in progress (Home and Shelter only ever quit) | `mode`, `level`, `platform`, `duration_s` |
| `life_lost` | `LIFE_LOST` (a Paw Guard was spent) | `mode`, `level`, `lives_left` (absent when unlimited) |
| `ftue_gate_shown`, `ftue_hint_shown`, `ftue_hint_done`, `ftue_first_clear`, `ftue_abandon` | The full RunGate, a first-run hint and its completion, a first clear, leaving from the gate | `mode`, `level`, plus `hint` or `step` |
| `intro_lifted` | The intro curtain lifts | `ms` |
| `guest_session_created`, `auth_sheet_shown`, `auth_linked`, `auth_merged`, `auth_error` | Identity funnel (F9 catalog) | reason or error kind; never a user id or email |
| `onboarding_shown`, `onboarding_step_viewed`, `starter_selected`, `starter_named`, `starter_committed`, `onboarding_skipped`, `featured_cat_followed`, `cat_name_rejected` | Meet your cat | step, breed; `starter_named` carries only `length` |
| `landing_cta` | A landing call to action | `from` (`hero`, `hero_fallback`, `sample_card`, `crew`, `heist_pill`) |
| `heist_open`, `heist_save`, `heist_signin_prompt`, `heist_guest_claim` | The `/heist` host | `from`, `status` |
| `impact_tab_viewed`, `pledge_made`, `treat_sent` | PROGRESS IMPACT tab | `status` for treats |
| `storefront_degraded` | A `/cat/sale` failure (per fetch) or a legacy shape (once per session) | `reason` |
| `game_font_fallback` | A brand face did not load within 3 s (once per page) | faces |
| `app_error` | A boundary, the crash guard, a listener or a same-origin window error (RESILIENCE.md) | `code` (`<level>_crash:<name>`, `scene_stall`, `listener_error:<event>`, ...), scrubbed message and stack, route |

Every event also carries the super properties `app` (`core`), `platform` and `device_tier`
(`low` at 4 GB `deviceMemory` or less). `mode` is the `GameType` value. Telemetry never writes
scores; `saveMatch` stays the only write path and now adds `platform` to the `/live` body.

`analytics/events.ts` is one typed catalog of every F9 event (areas: entry, identity, onboarding,
runs, heist, impact, health) with property shapes that never carry a user id, email or cat name;
`buildEvent` builds them. The scrubber (`shared/analytics-core.ts`, re-exported by `analytics/scrub.ts`)
removes emails, JWTs and `fb` tokens, Stellar seeds and addresses, `0x` values, ObjectIds, long hex,
phone numbers and national-id-like digit runs, IBANs, `did:` ids, opaque tokens, URL queries and
quoted names (code-shaped quoted identifiers stay), and cuts stacks to 8 frames without the origin.
`app_error` reports go through the same consent gate, at most 5 per tab session and one per code
(counts in `sessionStorage["tt-app-error-session"]`), and never call `posthog.captureException`.
Catnip Heist sends its own consent-gated events with the same core (GAMES.md); it reads consent from
the same `tt-analytics-consent` key on the same origin.

## SEO

`components/seo/SeoHead.tsx` is the single meta source (plan F12): `siteOrigin()` and `new URL()`
joins in `components/seo/site.ts` (no more `https:/host` or `@undefined`), keyed tags, an absolute
`og:image` with its size, Twitter and Facebook tags only when configured, and a `noindex` prop. Feed pages add `WebPageJsonLd` and `ArticleJsonLd`. The sitemap
is generated after build by `next-sitemap`, which fetches `GET /feed/slugs` for article URLs
(`/feed/<category>/<slug>`, matching `pages/feed/[category]/[article].tsx`; entries missing a
category or slug are skipped) and
returns nothing when the backend is unreachable or in app builds. Generated `robots.txt` and
sitemap files are gitignored but currently present in `public/`.

## Testing

Jest suites live in `__test__/` and next to their code (around 120 suites); Playwright specs in
`e2e/` (smoke, auth-guest, auth-sheet, meet-your-cat, intro, lobby-impact, progress-impact,
purrsuit-ftue, cupid-ftue, pawmatch-ftue, heist-host, modals-a, modals-b, impact, resilience,
render-foundation, world-look, typography, audio, landing-cta, meta). The older suites below are
still the reference for the landing and analytics. `constants/catnip-accounting.test.ts` covers cap normalisation, count
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
collected only from `components/CatnipChaos/**`, so the reported figure is misleading.

## Known issues

Build and SSR:

- The Stellar Wallets Kit and Stellar SDK are not SSR safe. `Web3Providers` must stay behind `next/dynamic` with `ssr: false` on `/box` and `/cats/[cat]`. This replaced an earlier AppKit prerender crash that blocked builds for weeks.
- `/feed` renders nothing until mount, losing server-rendered HTML.

Privacy:

- The consent banner copy describes game-event counting only. It does not name Google Tag Manager or the portrait `view_item`/`add_to_cart`/`begin_checkout`/`purchase` events that GTM now receives after ACCEPT, and it only appears when `NEXT_PUBLIC_POSTHOG_KEY` is set. A build with `NEXT_PUBLIC_GTM_ID` but no `NEXT_PUBLIC_POSTHOG_KEY` never shows the banner, so players cannot grant consent and GTM/GA receive no data at all. The current local build is in that state (GTM id compiled in, no PostHog key); the production environment must set the PostHog key.

Auth and storage:

- Tokens live in `sessionStorage` and die with the tab. The wait helper `waitForLocalStorageKey` (`api/api.ts`) polls forever (mentioned in the alignment plan, not fixed): new auth paths never use it, `redeem` and the airdrop claims check the token first, but `saveMatch`, `airdropProgression`, `quest-api` and `ticket-api` still await it, so a visitor whose anonymous sign-in failed waits silently on a save.
- `GameContext` still awaits that helper before `saveMatch` when there is no token; it should skip the save or call `requireAccount("save-progress")` instead (open).
- With the AuthSheet open over a GameModal, Esc closes the GameModal underneath and leaves the sheet open (task 4c, open).
- A guest who closes the sheet after tapping SPIN gets the sheet first now, but a "Sign in to spin" label would read better (task 3a, open).
- `EntityMetadataContext` still calls `ARTICLE_API.getMetadata` for guest and transient profiles; it fails quietly (open).
- Legacy password accounts made by the old auto-create path never got a verification email; they now see "Confirm your email" on `/game` and cannot close it until verified (decision #3; the heads-up email is a deferred manual step).

Authentication and guest play (fixed in task 3a, plan G1, G9, F5.7):

- Fixed: the forced, unclosable sign-in (`<SignIn close={() => {}} />` and the force-open effect in `FirebaseAuthContext.tsx`). `/game` starts a silent guest; the sheet opens only through `requireAccount`, and it is closable.
- Fixed: sign-in auto-created an account on `auth/user-not-found`; only the Create account tab creates one.
- Fixed: the Apple icon on the Password button (`SignIn.tsx` is deleted; the AuthSheet has proper brand buttons).
- Fixed: the reset toast fired before the request resolved, and a 1 to 5 character password failed silently.
- Fixed: sign-in toasts rendered behind the sign-in modal (task 1d moved toasts to `z-toast`; the AuthSheet holds toasts and shows their text in its alert region).
- Fixed: `USER_API.profile()` returned 401 and 403 error bodies as if they were profiles; native logout signed out only the Capacitor layer.
- Fixed: `?ref` was sent on every page load through a side-effecting GET; it is stored once and sent as a POST on promotion.
- Fixed (task 3a round 4): `shelter-payouts/chains.ts` chain names reached app builds through `GiveTreat`; the app branch shows no USDC, chain or explorer wording.
- Fixed (task 1c, plan F3.5): Phaser key capture swallowed typing in forms (W, A, D, Z, Q and space); letter keys are added without capture and the game registry turns the keyboard off for any event aimed at a field.

Resilience and telemetry (fixed in tasks 1e and 2f, plan F9, G13):

- Fixed: no error boundaries anywhere (`_app.tsx`, `MainLayout.tsx`), so one error blanked the app, native included. Root, page, scene, modal and section boundaries, a Phaser stall and startup watchdog and a listener guard are in place (RESILIENCE.md).
- Fixed: the Heist analytics parity comment in `analytics/events.ts` overstated what the Heist sent; it now states the shared core and the Heist's own events.
- Fixed: the Shelter crashed on a missing `rozine-pedute` key (`Shelter.tsx:103-106`), `catsForSale` returned `[]` for a Record, and the sample shuffle mutated the query cache (`utils.ts`). The storefront goes through `parseStorefront`, `useStorefront` and a non-mutating `sample`; the Shelter shows signs and a degraded RETRY notice.
- Fixed: `CAT_API.cats()` could return a non-array and crash HOME.
- Fixed: `FeedbackSlider.tsx:50` rendered a literal `0`; it was deleted with `old-landing` and `Preview` (decision #43), and the dead `CatsInNeed.tsx` too.
- Fixed: SeoHead built `https:/` URLs and `@undefined` handles, and `ArticleMeta` referenced a non-existent `/logo.svg` and was nested inside `next/head` (lost on client navigation). Tags are built by `buildSeoTags`; the publisher logo is the 512 icon.
- Fixed (7b integration): `components/web3/StripePayment.tsx` called `loadStripe()` at module load and nothing handled the rejection, so a blocked Stripe (ad blocker, strict network) threw an uncaught error on `/game`. `getStripe()` now loads Stripe.js with the first card form, resolves null on failure (the form shows a notice) and retries on the next payment.
- Open: with all of `localStorage` blocked, `/game` never leaves the loading curtain: the Stellar Wallets Kit reads `localStorage` unguarded when its module loads and the `SecurityError` stops the app. Load the kit behind a storage probe or wrap its import.
- Fixed (task 7b): the forced listener crash (`guardListener` hid its env check inside `isCrashForced`) and the `__TT_E2E_GAME__` modal hook in `GameContext` shipped in production bundles. Every hook now has an inline `NODE_ENV` / `NEXT_PUBLIC_E2E` check, and `scripts/check-bundle-hooks.mjs` fails CI (`bundle-guards`, web build and app export) on any `__TT_TEST__`, `__TT_E2E*`, `__TT_CAPTURE__` or `crash (E2E)` marker in the built `static` directory.
- Open: Paw Match installs `window.render_game_to_text()` and `window.advanceTime()` in production builds too.

Render, scenes and the Shelter (fixed in task 2e, plan F10, G13):

- Fixed: Phaser textures and animations were keyed by cat name (`ShelterScene.ts`, `Catbassador.ts`, `NpcCat.ts`), so two cats named "Luna" shared one sprite. Keys are id plus sprite hash.
- Fixed: `CatNpc` (`base/objects/Cat.ts`) destroyed and recreated the global `PlayerAnimation.*` keys; animations are per texture.
- Fixed: the NPC loader raced the shared loader, collided on names and spawned `__MISSING` sprites after a 404; one load pass per batch, 404s skipped and reported, `anims.exists` guards.
- Fixed (new): cat names were written unescaped into the speech bubble's `innerHTML`.
- Fixed: the canvas never followed a resize or rotation, and the backing store ignored the pixel ratio.
- Fixed (task 2e review): a mid-run cat switch restarted Purrsuit and Cupid with the wrong payload; a Shelter visit leaked its `CAT_SPAWN` listener.
- Open: in landscape (844x390) the mobile controls bar (`z-30`) covers GO BACK, SHELTER and HOME in Home and the Shelter (the specs dispatch the click).
- Open: Purrsuit plays a `"hit"` animation that is never created and builds `speed-effect` from a texture that is never loaded; the Shelter pushes `GAME_LOADED` twice.
- Open: `components/Phaser/look/loadTextures.ts` counts a sheet that answers 200 with a non-image body only at the 20 s timeout.
- Open: portals in Purrsuit un-hide every collected sprig on teleport (the cap clamp keeps saves valid).

Night design (fixed in task 3d, plan G6):

- Fixed: zoom was disabled on every route (`_document.js:10`, WCAG 1.4.4). Only `/game` locks zoom; the static Heist shell keeps its own `user-scalable=no` (a second, deliberate game-shell lock, recorded as a deviation for the founder).
- Fixed: the dead `[data-testid="modal-content"]` override (`globals.scss:230-232`) and the global gray background and ink; the background is night everywhere and the old ink applies only outside the night scope.
- Fixed: theme-color `#1f2937`, the coral native icon and splash, the cream PWA manifest colours, and the hot-pink Shelter lobby background (now the dusk grade).
- Fixed (task 4c, 4d): every lobby, end-of-run, payment, card, video and style-picker overlay is a GameModal; the palette allowlist holds only the genuine exceptions.
- Fixed (task 7b): the `yellow.300` Tailwind override is removed; the last uses moved to `tt-cream`, and a jest test fails if `yellow-300` returns to app source.
- Open: `pages/shelter-payouts.tsx` still has a daytime background behind its night content panel; `/cats` keeps the day palette.
- Open (task 3d acceptance): the landing-to-`/game` screencast measured above the night luminance target (mean 0.35) on the intro pinwheel and the daytime lobby art. The night intro curtain (task 4a) and the night look (task 6e) replace both; the screencast was not re-measured.

Meet your cat, intro and the lobby (fixed in task 4a, plan G3, G14):

- Fixed: "Your cat awaits" on the landing had no payoff; Meet your cat is the first thing a new player sees after the curtain.
- Fixed: the fixed 2 s brown pinwheel intro (`Game.tsx`); the night `IntroCurtain` lifts on readiness (at least 700 ms, at most 2.5 s; tap or key to skip).
- Fixed: `RevealAnimation` had no reduced-motion path; `output: 'export'` emptied `router.query` on the first render, so `?meet=1` is read once `router.isReady`.
- Fixed: the lobby Home tile was a clickable `div` with an image without `alt`.

Catnip Heist host (task 4b, plan G2):

- Fixed: the Heist was not reachable from the game; the picker card (behind `NEXT_PUBLIC_HEIST_PICKER`) and `/heist` host it, and won runs save to the account.
- Open: a 409 for another account's log shows the neutral "Already saved" because the backend 409 body carries no `mine` flag yet.
- Open: Heist audio keeps playing under the host pause; the claim prompt asks once per page view.

Audio (task 6c, plan G14):

- Fixed: the lobby had no music and the in-mode player played at 0.05 with no volume control or mute.
- Open: `WheelModal.tsx` keeps its own click and hover sounds at 0.5 and ignores the effects volume and mute; `Match3Scene.ts` synthesises its tones through its own `AudioContext`, outside the effects volume.

Typography leftovers (tasks 2d, 3e):

- Open: the Tailwind `font-*` utilities (client and CMS) do not name the `"<Family> Fallback"` faces, so DOM text swapping fonts can shift; `/fonts/*` needs a long-lived `Cache-Control` header (and a CORS header before Stripe Elements could use Nunito); Passion One has no `Ė`, so "ROŽINĖ PĖDUTĖ" falls back for that glyph; WebKit latin-ext loading is untested.
- Open: sentence case can lowercase names in shouted hint copy; write named hints in sentence case at the source or pass `keepCase`.

Claims and impact pages (task 3f, plan G11):

- Fixed: "800+ strays saved" and "120+ countries served" were shown from unverified figures; the globe counted a hardcoded country list (`Globe.tsx:29-32`); present-tense support claims in `ProofSection.tsx` and `AboutUsModal.tsx`; the world-atlas fetch had no `catch`.
- Open: the committed `public/impact/snapshot.json` was written from the local dev backend; `snapshot-impact.mjs --check` fails on it by design until it is regenerated from production (before merging and before every app build).
- Open: `campaignProgress` (`components/shelter-payouts/`) filters by `fromBlock` only, never by `startDate`; the facts schema refuses a wallet without `fromBlock`, but the page should also drop payouts dated before `startDate`.
- Open: the money, payouts, outcomes, pledges and paw sections of `/impact` show their empty states until the ShelterSplit deploy and the first data; the paw proof checker needs the keccak `hashPair` wired in.

Hygiene:

- ESLint disables `react-hooks/rules-of-hooks` globally (mentioned in the alignment plan, kept).
- `client/models/order.ts` keeps its own `OrderStatus` without `LOCKED` and `FAILED_GRANT`; it should re-export the shared enum.
- `InviteModal` (the SHOP) has no opener in the lobby.
- `sonner` and `three` remain in `package.json` with no client importers.
- `npm` itself is listed as a runtime dependency.
- `pages/portraits.tsx` duplicates most of `pages/portrait.tsx`.
- Empty folders: `cats/`, `icons/`. `gg.js` is an empty file.
- `components/storyMode/Managers/` still holds six unused managers (`DroppingSpike`, `FanManager`, `HiddenSpikeManager`, `LeverAndDoorManager`, `PlumbDoorManager`, `SawHalfManager`) that nothing imports. They are due for removal.
- `tsconfig.json` excludes directories that no longer exist.
- Card power on `CardBack` is a hardcoded placeholder (`POWER = 1`).
- `.DS_Store` files are tracked in several folders.

Typography and catnip art (fixed in task 3e, plan G12 and G8):

- Fixed: undeclared font families fell back silently: "Pixelify Sans" in the Paw Match HUD, `proxima-nova` in the Wheel, Space Grotesk and Plus Jakarta Sans on `/portrait`, Arial Black and Arial in Cupid Cat and its enemies. Every scene now gates `create()` on `preloadTTFonts(this)` and draws text with `ttText` roles; canvases use `ttCanvasFont`. `__test__/typography-callsites.test.ts` keeps it that way.
- Fixed: the unlicensed CDN pixel font (`pixel-rescue/fonts/pixel-text2.ttf`, loaded by `PixelRescueScene`) and the unreferenced `pixel-text.ttf`/`pixel-text1.ttf` are gone from `public/`. The CDN copies still exist until the deferred CDN cleanup runs (alignment log 3e).
- Fixed: the Paw Match streak line overlapped the stat cards on phones, the first-move tutorial line ran off a 390 px screen, and labels could shrink to 7 px. `components/Match3/hudLayout.ts` gives every HUD text its own slot box (`__test__/match3-layout.test.ts`).
- Fixed: the catnip currency used a cannabis-leaf raster. It is now the botanical sprig from `client/art/catnip/` (`scripts/art/catnip-export.mjs`); legacy names are overwritten and hash-pinned (`__test__/catnip-art.test.ts`).

Paw Match first run (fixed in task 5c, plan G10, G12, G14):

- Fixed: the Paw Match clock started in `create()` while the tutorial played. It now starts, with `RUN_BEGIN`, on the first valid swap (`components/Match3/match3Rules.ts`); an uncleared level 1 gets a one-time +15 s grace when the clock runs out.
- Fixed: the first-move hint was a 15 px monospace line that collided with the combo and mission lines, was clipped and ghosted, and `applyHintPulse` always wrote a message. The tutorial is a `hint` role plate sized to its text inside the safe area, with combo and mission hidden until the tutorial swap lands, a 32x32 glove pointer (`public/match3/pointer/glove.png`) and texture badges for special tiles (`__test__/match3-tutorial.test.ts`, `e2e/pawmatch-ftue.spec.ts`).

Cupid Cat first run (fixed in task 5b, plan G10):

- Fixed: a plain `GAME_START` teleported the cat to (0, -400) and started a second countdown on top of the one from `create()` (`PixelRescueScene.ts:781-784` before the fix). The scene ignores a non-restart `GAME_START`; one `RunClock` per run counts only after `RUN_BEGIN` (the first input behind the RunGate) and holds through tutorial steps and notices (`components/PixelRescue/ftue.ts`).
- Fixed: the tutorial was reset on every retry (`TutorialManager.resetTutorial`). It plays once per level per player (ftue-store, the old `pixelrescue_tutorial_completed_level_*` key counts as seen) and comes back only through "Replay tutorial" in the HUD.
- Fixed: deaths and timeouts pushed no outcome. Every `GAME_STOP` carries `won`, `died` or `timeout`; level select uses `seasonEventCleared` with the `i === 0 || cleared[i-1]` rule, so a death with hearts no longer unlocks the next day.
- Fixed: Cupid had no way out mid-run except the gate's Back. A "Leave level" close button sits above the gate (`z-[90]`) and below GameModal.
- Fixed (task 5a): `GameContext` forwards the outcome to `/live`.

Run lifecycle and Purrsuit first run (fixed in task 5a, plan F6, G10):

- Fixed: Purrsuit started auto-running on spawn and killed new players in 2 to 4 s. The spawn is frozen behind a RunGate until the first input, which is consumed (no jump); on a first visit the world freezes before the first spike with "JUMP!" and the jump that answers it clears the run at any frame rate (`e2e/purrsuit-ftue.spec.ts` at 30, 60 and 120 fps). New mechanics get a slow-motion teach (freeze-and-prompt under reduced motion).
- Fixed: both spike paths ended the run with no check (`CatnipChaos.ts:605`, `:1207` before). Hits go through Paw Guard: unlimited on uncleared 1-1, three per attempt on other uncleared levels, none on cleared ones; a soft death restores the last checkpoint (`PlayerMovement.snapshot`/`restore`) and respawns catnip taken after it.
- Fixed: `endGame` cleared `catDto`, and a plain `GAME_START` teleported the cat to (0, -400). The scene restarts only on `GAME_RESTART` and keeps its cat.
- Fixed: level unlocks counted the INFINITE slot and any score, so INFINITE catnip unlocked 1-2 and a death with one catnip unlocked the next level. Unlocks use `unlocked(i) = i === 0 || cleared[i-1]` over `catnipChaosCleared` (local clears as a cache, points > 0 when the profile has no cleared array); INFINITE opens after 1-1.
- Fixed: `GameContext.gameStopCallback` dropped `outcome` and returned early without a profile. It sends `outcome`, saves a hard death only when it beats the best, never saves a soft stop, keeps the mode on screen behind the DeathCard (no GameSelect flash) and shows the DeathCard to signed-out players without saving.
- Fixed: a long endless run (over 500 catnip) lost its save to a 400 (alignment log 1a, bug #4). Points are clamped to the level cap before `/live`.
- Fixed: `MobileControls.ts:44` bailed on `closest("div")`, so taps outside the canvas never jumped. It now ignores only controls, dialogs and the canvas itself (labelled change; the device pass is on the native-release checklist).
- Fixed: the Purrsuit map promised "MORE COMING SOON" with a countdown to a past date. It shows an all-cleared notice only when every level is cleared, with no promise of new levels (decision #94).
- Fixed (task 7a): `docs/GAMES.md` listed the endless cap as 420 (it is 500, decision #57) and said Purrsuit "is frozen".

Lobby impact and rescue tone (fixed in task 5e, plan G4, G5):

- Fixed: the only in-game impact view was gated on `profile.spent > 0` and converted spend into surgeries (`calculateDonationBreakdown`, deleted). ABOUT ME's MY IMPACT shows paws from `GET /impact/me` and renders with `spent=0` and `cat=null`; the lobby has a RESCUE tile (opens PROGRESS on IMPACT), MEET SHELTER CATS and an md+ impact strip (`components/impact/`).
- Fixed: `/airdrop` links in Stats and the Footer were dead. `/airdrop` redirects to `/shelter-payouts`, `/old-landing` to `/`, and the retired `/giveaway` and `/box` to `/game` (`next.config.js`, plus client redirects for the static export).
- Fixed: "TOP 100 SHARE 3000 MNT" on the rescuers board (and the board read the catnip endpoint); `LeaderboardCatnip` promised a weekly payout no cron makes. The rescuers board reads `/user/leaderboard/rescuers`, the catnip board is "TOP CATNIP COLLECTORS" with no payout line.
- Fixed: `$TAILS`, airdrop and allocation wording in the Wheel, quests, mystery box, Tails card, leaderboards and options; the Wheel shows the published odds from `GET /user/catbassadors/lives/odds`; the cat nap claim shows the Tails the backend actually paid.
- Fixed: `/stats` read in-process counters (`GET /quest/statistics`); it now reads the impact snapshot.
- Fixed: `/shelter-payouts` empty states were present tense with no date and the Heist link failed contrast; app builds now get a proof notice instead of wallet and explorer wording.
- Fixed (task 3a round 4): `shelter-payouts/chains.ts` chain display names reached app builds through `GiveTreat`.

Lobby modals (fixed in task 4c, plan G6, G9, G14):

- Fixed: Cats, Wheel, Packs, Pack, Profile, Shop (`InviteModal`), Events (`QuestsModal`), Codex, Support and Share were ad hoc `fixed inset-0` overlays on a cream scrim with z values up to 100000. They are GameModals now: titled dialogs on the night surface that suspend the game, close on Esc, X and scrim, and return focus.
- Fixed: a tap on the scrim during a Daily Spin closed the wheel and killed the reveal. The X is `aria-disabled` and Esc and the scrim do nothing from the SPIN tap until the won value has been shown.
- Fixed: "Delete Account" (app builds only) showed a toast and contacted no one. Every registered account now has Delete account, a confirm step, then `DELETE /user/me` (with a fresh Sign in with Apple code on iOS) and sign-out. Guests get Save progress and Erase guest progress instead.
- Fixed: claims, purchases, stake, quest claims, the invite link, X/Discord linking and tickets fired as a guest and failed or did nothing. They open the AuthSheet first and go on after sign-in (`hooks/useAccountAction.ts`).
- Fixed: the share sheet closed itself when the clipboard permission query was refused (always on Safari, which also threw).
- Fixed: the Wheel threw when the mascot video's duration was not loaded yet (`currentTime = NaN`).
- Fixed: a non-modal GameModal (the Packs checkout) put its scrim above the panel, so the X and the checkout could not be tapped.
- Still open: `InviteModal` (the SHOP) has no opener in the lobby. The Codex TGE countdown is gone (task 6a, see below).
- Fixed (task 4d): PLAY AGAIN passed the click event as `nextLevel`; the end-of-run panels clipped (`EndGameModal.tsx:101`, `PixelRescueEndGameModal.tsx:46`); the Paw Match close button was a raw `<button><img alt="close">` that overlapped the HUD on phones (now a 44 px `viewport` CloseButton with a reserved header strip, task 5c).

PROGRESS (fixed in task 6a, plan G5 P6, decision #39):

- Fixed: the Codex counted down to a hardcoded TGE date (`TGE_TARGET_DATE`, 2026-11-19) and to the 1st of the month (`getNextMonthStartUtc`), while the season really freezes at 22:00 UTC on the 8th. Both are deleted; the season band shows the backend's `season.freezeAt` / `anchorAt` in local time, and the badge reset reads `season.frozen` instead of a client-computed 9th.
- Fixed: "AIRDROP COMMAND CENTER", "maximize your allocation", `$TAILS` and airdrop wording in the Codex and the portrait flow (copy lint R9 clean in `components/codex/**`).
- Still open: Rescue Goal gives answer 503 `PLEDGES_PAUSED` until the backend's `TAILS_EARNED_BACKFILL_DONE=true` (task 4e manual step 3); the IMPACT card then says "Giving to goals opens soon".
- Fixed: the staking reward was hidden behind a hardcoded `+1` (`CatsModal.tsx:747`); the cat nap shows the Tails from the response.

UI primitives (fixed in task 1d, plan F3.6):

- Fixed: boxicons classes (`bx bx-*`) were used in 13 files but the stylesheet was never loaded, so 26 icons rendered empty. Icons are now `components/shared/PixelIcon.tsx` (pixelarticons path data, generated by `scripts/codemods/sync-pixel-icons.mjs`), and an ESLint `no-restricted-syntax` rule fails on any boxicons class.
- Fixed: `PixelButton` rendered without `type`, so inside a form it submitted it (the sign-in "I FORGOT PASSWORD" button submitted the sign-in form). The default is now `type="button"`. It also dropped its `width: 100% !important` style, emitted `false`/`undefined` class tokens and had a stray quote in a class.
- Fixed: `ToastProvider` passed a new context value every render, so effects that listed the toast function re-ran on every toast.
- Fixed: every touch tap on a `PixelButton` played the hover sound as well as the click sound. Hover sound is now mouse-only.
- `PixelButton as="span"` (for use inside a link) does not accept `busy`, `disabled` or `type`: the link owns focus and Enter, so a span cannot make it inert. Show an inert call to action as a plain disabled button instead.

Icons, meta and the landing CTAs (fixed in task 6b, plan G14, G3, G2):

- Fixed: favicons were set per page in 12 places from three sources (`logo/logo.webp`, `logo/coin.webp`, the Heist's `paw.png`), the manifest was typed `image/png` for `.webp` files that did not exist, combined `any maskable`, and had no name or `start_url`. One icon set is generated by `scripts/build-icons.mjs` from `resources/source/logo.png` (`npm run icons:build`, `icons:check`) and linked once in `pages/_document.js` with the manifest; the manifest is night, PNG, `start_url: /game`, with separate maskable icons. The Heist build links the same files (decision #93).
- Fixed: `/`, `/game`, `/packs`, `/shelter-payouts`, `/stats`, `/marketing` and the give and receipt pages set hand-written meta (no canonical on `/game`, a 1257x631 share card). They use `SeoHead`; the default card is `logo/og-v2-1200x630.jpg`; `/game`'s canonical never carries `?ref=`. The JSON-LD publisher logo is the 512 icon (the old `/logo.svg` did not exist).
- `scripts/check-meta.mjs` (`npm run meta:check -- --base <url>`) checks the served pages: 200 with no redirect for `/heist`, one icon family, night theme-color, absolute 1200x630 OG tags, canonicals, and no `@undefined`, `https:/` or `%VITE_`. `e2e/meta.spec.ts` runs it.
- Fixed: the crew CTA ("JOIN THE CREW") nested a button in a link. Every link on the landing wraps `PixelButton as="span"` (one tab stop). The label follows the player ("MEET YOUR CAT" signed out or pending, "{CAT} IS WAITING" when done; "YOUR CAT IS WAITING" for names over 10 characters, since the pixel button never wraps) from an optional, non-creating profile read (`components/landing/LandingPlayer.tsx`, browser only), which also shows "{cat} is waiting for you" in the hero. Each landing CTA sends `landing_cta {from}`.
- The Heist landing pill ("Or play Catnip Heist now, no sign-up") is built but off until `NEXT_PUBLIC_HEIST_LANDING_PILL=1` (decision #15: the Poki carve-out and the 40% completion gate come first).
- Fixed: the default share card (`logo/og-v2-1200x630.jpg`) was built with `cdnFile`, so production unfurls pointed at a CDN file that only exists after the sync. It is same origin now, like the icons. Standalone Heist exports (itch, Poki, Anitya) linked the site-root `/favicon.ico` and `/icons/*`, which 404 there; every build except `build:client` now links the game's own paw icon (`iconLinksFor`, `catnip-heist/vite.config.ts`).
- Known: `resources/logo.png` (the Capacitor splash and icon input) is the bust cut flat at the bottom; on the splash it floats with that cut. Check after `npm run app:assets`; an uncut bust needs new art. Native icons and splashes are generated with `npm run app:assets` and ship with the next store submission (decision #95).

G7 art pipeline (fixed in task 6d, plan G7):

- Fixed: `scripts/a.js` and `scripts/b.js` hard-coded a contributor's Windows paths. They are deleted; `node scripts/art/tile-legend.mjs legend|count|replace <map.json>` takes paths as arguments (`__test__/art-tile-legend.test.ts`).
- Fixed: art sources shipped publicly (`public/base/*.aseprite`, `base.tmx`, `base.tiled-session`). They moved to `client/art/src/`; nothing loaded them. Still public and owned elsewhere: `public/story/spiked-wall.aseprite`, `public/catbassadors/catbassadors.tmx` and the Tiled project/session files under `public/pixel-rescue/levels/` and `public/purrquest/levels/` (listed in `__test__/art-pipeline.test.ts`).
- Known: four authored sheets (`public/base/{summer,camp,sei,cat-winter}-original.png`) are stale against the runtime sheets the game loads; the night skins are built from the runtime sheets for that reason.

