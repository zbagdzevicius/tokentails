# pawlegends-web: Paw Legends' own Next app on pawlegends.app

Status: inventory done 2026-11-12 (worktree `tokentails-pawlegends-web`, branch `feat/pawlegends-web` from origin/main
846ca484). Founder asks (verbatim): "I don't want it to be on client, it should hold token tails core only I think or
NOT ?", then, on the separate-app proposal: "ok I'll set it up on verce. for now execute this plan fully ultracode just
make sure to migrate ongoing work that's happening in other dynamic workflows afterwards once you'll be finished and
dynamic workflows will be finished".

Goal: a new package `pawlegends-web/` (Next.js 16.1.x, React 19.2, pages router like `client/`) that holds only Paw
Legends: landing, `/play` host, legal, account, support, `/legends` A/B arm, OG cards, the built game at
`public/pawlegends-game`. Own Vercel project (Root Directory `pawlegends-web`, domains `pawlegends.app` +
`www.pawlegends.app`). `client/` goes back to Token Tails only. Shared Firebase project (news-ccd33) and the backend
(`api.tokentails.com`) are unchanged.

## 0. Phase A status (2026-11-12, branch `feat/pawlegends-web`)

Done, not pushed yet:
- `pawlegends-web/` exists: Next 16.1.1, React 19.2.3, pages router, Tailwind 3, Jest (ts-jest, as client), Playwright.
  Pages `/`, `/legends`, `/play`, `/terms`, `/privacy`, `/account`, `/support`; own `_app` (no Firebase on the landings
  and legal pages; sign-in is mounted by `/play` and `/account`) and `_document` (Paw Legends favicons, GTM noscript).
  Redirects: www to the apex, game keys on `/`, `/legends` and `/pawlegends` to `/play`, `/pawlegends` to `/`,
  `/pawlegends/<page>` to `/<page>` (all permanent except the game-key ones, which stay 307 like client's).
  Header `x-pawlegends-web: 1` on every response (the Phase B gate below).
- Trimmed while copying: no kill switches (`pawlegendsEnabled`, `pawlegendsPickerEnabled`, `NEXT_PUBLIC_PAWLEGENDS*`),
  no Token Tails AuthSheet branch, hero cat or Catnip Heist link, no referral (`?ref`) capture or leaderboard reads,
  no Tails toast symbol, `SeoHead` with pawlegends.app hardcoded, GTM with only GTM-K6RTRKSR, `api/user-api.ts` with
  the 8 calls, `lib/accountDeletion.ts` instead of ProfileModal, `isApp` always false (the app has its own host),
  `cdnFile` always the CDN, trimmed `globals.scss` (no Token Tails cursor). `shareUrlOf` also accepts `/` and `/play`
  (a dare shared on pawlegends.app is `https://pawlegends.app/?dare=`; the old check wanted a `/pawlegends` path).
- Game sync (the simple option): `build:client` writes `pawlegends-web/public/pawlegends-game` and
  `tools/mirror-client.mjs` copies it verbatim to `client/public/pawlegends-game`; CI (`pawlegends-web` job) runs
  `mirror-client.mjs --check`. No rewrite in client, so tokentails.com keeps serving exactly what it serves today.
  The new folder was seeded with a byte-identical copy (release history kept).
- pawlegends-app bundles, typechecks and tests against `../pawlegends-web`; the OTA workflow also triggers on the
  pawlegends-web host modules. Backend CORS allows the `pawlegends-web-<hash>-zbagdzevicius-projects.vercel.app`
  previews; the game's `DEFAULT_EMBED_ORIGINS` lists pawlegends.app (ships with the next `build:client`).
- `scripts/cdn-cache.mjs game` takes `--root` and `--no-purge`; `pawlegends-cdn.yml` warms tokentails.com (purge as
  before) and then pawlegends.app (no purge: assumed outside the CF_ZONE_ID zone; the step cannot fail the job).
- Copied tests fixed for drift that also fails on main in client: `replayOf` caps (sim v21 raised them),
  `/legends` facts (`C_LANES`, `C_TOWER_SPOTS`, `COOP_HUMANS`), the landing e2e (no Cats/Dogs switch since the
  2026-11-12 landing), the dare e2e (the lobby's dare markup), the account e2e (skipped on a portrait phone: the game
  shows its rotate overlay).

Founder: create the Vercel project (settings in `pawlegends-web/README.md` "Vercel project"), check its preview, then
move `pawlegends.app` and `www.pawlegends.app` to it. Then Phase B (section 3).

Still open for the founder: the support address shown on `/account`, `/support` and the store sheets is
`info@tokentails.com` (`PAWLEGENDS_CONTACT`; no pawlegends.app mailbox exists) [keep until one exists].

## 1. What is in client today (the move map)

### 1.1 Pages (7) → pawlegends-web/pages

| client | pawlegends-web | URL on pawlegends.app |
|---|---|---|
| `pages/pawlegends/index.tsx` (landing, A arm) | `pages/index.tsx` | `/` |
| `pages/pawlegends/play.tsx` (iframe host) | `pages/play.tsx` | `/play` |
| `pages/pawlegends/privacy.tsx` | `pages/privacy.tsx` | `/privacy` (App Store privacy URL) |
| `pages/pawlegends/terms.tsx` | `pages/terms.tsx` | `/terms` |
| `pages/pawlegends/account.tsx` | `pages/account.tsx` | `/account` (Play Data safety deletion page) |
| `pages/pawlegends/support.tsx` | `pages/support.tsx` | `/support` (App Store support URL) |
| `pages/legends/index.tsx` (landing B arm, canonical `/pawlegends`) | `pages/legends.tsx` | `/legends` (canonical `/`) |

Old-path compatibility on pawlegends.app (permanent redirects in pawlegends-web `next.config.js`): `/pawlegends` → `/`,
`/pawlegends/:page(play|privacy|terms|account|support)` → `/:page` (query kept). Needed because the game builds
`${referrer origin}/pawlegends/terms` (`pawlegends/src/ui/store.ts` `termsUrl()`), older game builds and share links
use `/pawlegends?party=`, and `components/pawlegends/flags.ts` `PAWLEGENDS_TERMS_PATH` is `/pawlegends/terms`.
Repoint those constants to `/terms` in the new app; keep the redirects for old builds.

### 1.2 Components, analytics (all move; ~9,400 lines)

`components/pawlegends/`: `PawlegendsHost.tsx` (865), `bridge.ts` (1325), `checkout.ts` (644), `saves.ts` (474),
`apiBridge.ts` (337), `PawlegendsAccount.tsx`, `PawlegendsConsent.tsx`, `PawlegendsStoreSheet.tsx`,
`championsBridge.ts`, `claim.ts`, `flags.ts`, `landingVariant.ts`, `noZoom.ts`, `partySaves.ts`, `routes.json`,
`routes.ts`, `session.ts`, `title.ts`, `landing/*` (8 files incl. `motion.js`, `landingCss.ts`, `markup.ts`,
`roster.ts`, `motionChunk.ts`), `legends/*` (6 files).
`analytics/pawlegends-datalayer.ts`, `analytics/pawlegends-events.ts`, `analytics/pawlegends-site.ts`.
Target layout: `pawlegends-web/components/**` and `pawlegends-web/analytics/**` with the same relative names, so the
`@/` alias and the pawlegends-app imports keep their paths (see 1.6).

Changes while moving (no Token Tails in the new app; no feature flags):
- `flags.ts`: drop `pawlegendsEnabled` / `pawlegendsPickerEnabled` and the `NEXT_PUBLIC_PAWLEGENDS*` kill switches
  (memory: no feature flags); `PAWLEGENDS_EXIT_PATH` `/game` (a Token Tails page) → `/`; `PAWLEGENDS_TERMS_PATH` → `/terms`.
  Keep `OPERATOR_PRIVACY_URL` and `PAWLEGENDS_CONTACT` (legal operator line, terms/privacy only).
- `pawlegends-site.ts`: every page of the app is a Paw Legends page; `isPawlegendsPath` / `pagePathOf` collapse.
- `routes.json`: `landingPath` `/`, `playPath` `/play`, `legendsPath` `/legends`.
- `title.ts` comment, `PawlegendsConsent.tsx` (no "Token Tails page" case any more).

### 1.3 Shared client code they import, and what to do with each

Measured with an esbuild metafile: the 7 pages pull in **334 client files** today. Almost all of that comes from
`components/shared/ProfileModal.tsx` (289 files on its own: impact, codex, Phaser, web3, tailsCard). The rest is small.

| client module | used for | action |
|---|---|---|
| `components/shared/ProfileModal.tsx` | `requestAccountDeletion`, `signedInWith` only (PawlegendsAccount) | **extract** the two functions into `pawlegends-web/lib/accountDeletion.ts`; never copy ProfileModal |
| `context/FirebaseAuthContext.tsx` (1108) + `context/auth/*` (18 files) | sign-in, guest sessions, merge, App Check | **copy and trim**: drop the Token Tails brand branch, leaderboard/referral calls, Tails credit; keep guest session, guest merge, link, lastMethod, pendingMerge, appCheck, firebaseConfig, authErrors, platform, sessions, sessionHint, shareLink, accountGate, adapter, types, profileError, guestProfile, pendingRef. `brand.ts` goes (always Paw Legends) |
| `components/shared/auth/AuthSheet.tsx` (+ `BrandSignInButton.tsx`) | the sign-in sheet | **copy, keep only the `pawlegends` branch** (no TT logo, no Tails, no Heist link, `/terms` `/privacy`, support subject) |
| `context/ProfileContext.tsx`, `context/ToastContext.tsx`, `components/shared/Toast.tsx` | profile query, toasts | copy (needs `@tanstack/react-query`) |
| `api/api.ts` | `apiUrl`, `currentAccessToken` | copy (277 lines; keep the token helpers only) |
| `api/user-api.ts` (617) | `profile`, `guestSession`, `guestMerge`, `deleteMe`, `deleteGuest`, `saveMatchDetailed`, `pawlegendsApiCall`, `pawlegendsPartyTicket` | **re-implement minimally** as `pawlegends-web/api/user-api.ts` with those 8 calls and the same `USER_API` names (pawlegends-app imports it) |
| `components/heist/heistSaves.ts` | `backoffMs`, `QueueStorage` (saves.ts); pawlegends-app imports it too | copy the save-queue helpers into `pawlegends-web/components/heist/heistSaves.ts` (path kept for pawlegends-app) or rename and update the app import |
| `components/heist/suspension.ts` + `lib/game/gameRegistry.ts` | pause on hide | copy (2 files) |
| `components/ui/GameModal.tsx` + `ui/modal/*` + `ui/PixelFrame.tsx`, `ui/lowfx.ts`, `ui/useScrollFade.ts`, `shared/CloseButton.tsx`, `shared/PixelIcon.tsx` + `shared/icons/*`, `errors/ModalBoundary.tsx` + `ErrorBoundary`, `CrashPanel`, `copy.ts`, `crash-probe.tsx`, `hooks/useSuspendGame.ts`, `design/tokens.ts`, `constants/utils.ts` | sheets (store, account, sign-in) | copy (~26 files, no TT branding; check `errors/copy.ts` text) |
| `components/audio/settings.ts` | mute toggle | copy (180 lines, no imports) |
| `components/claims/build.ts` | `isAppBuild` | re-implement in 3 lines (no app export in pawlegends-web: always false) |
| `components/seo/SeoHead.tsx` + `seo/site.ts` | meta, canonical, OG | copy, hardcode origin `https://pawlegends.app` and site name `Paw Legends` (drops `NEXT_PUBLIC_DOMAIN`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_TWITTER_PAGE`) |
| `components/GoogleTagManager.tsx`, `analytics/gtm.ts` | GTM-K6RTRKSR + Consent Mode v2 | copy, keep only the Paw Legends container (drop `tokenTailsGtm`, `NEXT_PUBLIC_GTM_ID`, the router) |
| `analytics/index.ts`, `client.ts`, `errors.ts`, `events.ts`, `game-run.ts`, `platform.ts`, `scrub.ts`, `shared-contracts/analytics-core.ts` | PostHog relay of game events, error capture | copy (8 files); `events.ts` trimmed to core + Paw Legends events |
| `context/auth/lastMethod.ts` | last sign-in method | copied with auth |
| `components/shelter/catSale.ts` + `models/cats.ts` (+ `image`, `order`, `status`) | `isCatForSale`, `ownsCopy` for the shelter champions' cards | copy `catSale.ts` and a trimmed `models/cats.ts` (types only). Open question for the founder (memory "no TT cats-as-skins"): champions cards are Pink Paw shelter cats from the public API; behaviour unchanged by this move |
| `models/game.ts` | `GameType.PAWLEGENDS` | copy (from `shared-contracts/enums`) |
| `lib/flags.ts` | `isFlagOff` helper | drop with the kill switches |
| `shared-contracts/caps.ts`, `errors.ts`, `enums.ts`, `heist-bridge.ts` (types for saves), `analytics-core.ts` | caps, error codes | add target `"pawlegends-web": "pawlegends-web/shared-contracts"` to `shared/manifest.json` for these files and run `node scripts/sync-contracts.mjs` (CI checks it) |
| `public/pawlegends-game/build-releases.json` | landing roster (`roster.ts` imports it) | moves with the game build |
| `pages/_app.tsx`, `layouts/MainLayout.tsx`, `pages/_document.js` | shell | **write new**: `_app` = QueryClientProvider + ToastProvider + `PawlegendsConsent` + GTM + RootBoundary; `_document` keeps the landing's font/chunk-watch rules (`BODY_FONT_ONLY_PATHS`, `CHUNK_WATCH_PATHS` for `/` and `/legends`), GTM noscript always, and **Paw Legends icons** (today the pages show the Token Tails favicon): use `brand/pawlegends` favicon.ico, favicon-32.png, apple-touch-icon.png (same files as `pawlegends/public/`) |
| `styles/globals.scss`, `tailwind.config.ts`, `postcss.config.js`, fonts | `tt-*` Tailwind classes in the sheets | copy a trimmed `globals.scss` (tokens, fonts used by the sheets) and the Tailwind theme keys the copied components use. The landings bring their own CSS (`landingCss.ts`, `legendsCss.ts`) |

npm dependencies the closure needs (no stellar, web3, phaser, framer-motion): `next@16.1.1`, `react@19.2.3`,
`react-dom`, `firebase@^11`, `@capacitor/core` + `@capacitor-firebase/authentication` (imported by the account page
for the native-platform check; can be replaced by a `false` constant since pawlegends-web never runs in Capacitor),
`@tanstack/react-query`, `@radix-ui/react-dialog`, `clsx`, `gsap@3.13.0`, `posthog-js`, `tailwindcss@^3.3`,
`sass`, test: `jest` + Testing Library (as client) or vitest, `@playwright/test`.

### 1.4 Public assets

| client | action |
|---|---|
| `public/pawlegends/landing/**` (60 files, content-hashed) | move to `pawlegends-web/public/pawlegends/landing/**` (same path keeps `markup.ts`/`roster.ts` URLs). `tt-logo.19b6c796*.webp` is unreferenced: do not copy |
| `public/pawlegends/og.jpg` (share card) | move, same path |
| `public/pawlegends-game/**` (488 files, 14 MB, committed) | move to `pawlegends-web/public/pawlegends-game/**` (same URL `/pawlegends-game/**`, iframe and links unchanged) |
| `public/pawlegends-app/updates/**` (38 MB, OTA) | **stays in client** (installed apps fetch `https://tokentails.com/pawlegends-app/updates/...`, `pawlegends-app/scripts/lib/app-config.mjs` `UPDATES_URL`) |
| `public/game-select/pawlegends-preview@2x.webp`, `public/home/media/pawlegends-*.{mp4,jpg}`, `public/home/media/t/tab-pawlegends.webp` | **stay in client**: Token Tails' PLAY picker card and home hub tab advertise the game |
| `public/game/controls/jump-moba.png` | Token Tails game control, not Paw Legends: stays |

### 1.5 Config, SEO, tests in client

- `client/next.config.js`: `pawlegendsHeaders` (immutable `/pawlegends-game/build/*`, `/pawlegends/landing/*`, revalidate
  `/pawlegends-game/index.html`, `/pawlegends-game/assets/*`) → copy into pawlegends-web; the three OTA header rules
  (`/pawlegends-app/updates/...`) **stay in client**. `pawlegendsRedirects` (`/pawlegends`, `/legends` + game query
  keys → `/pawlegends/play`) → pawlegends-web as `/` and `/legends` + keys → `/play`. `pawlegendsDomainRedirects`
  (www → apex, `/?party=` etc. → `/play`) → pawlegends-web (host-free: `/` + key → `/play`; www → apex by a host rule
  or the Vercel domain redirect). `pawlegendsDomainRewrites` (host `pawlegends.app` → `/pawlegends/*`) are removed in
  Phase B.
- `client/next-sitemap.config.js`: excludes `/pawlegends*`, `/legends` (removed in Phase B). pawlegends-web gets its own
  sitemap/robots: `/` stays `noindex` until the trademark search passes (LAUNCH.md a.8 step 1), `/play`, `/terms`,
  `/privacy`, `/support`, `/account` noindex as today.
- `client/scripts/check-meta.mjs` rows for `/pawlegends` and `/pawlegends/play` → pawlegends-web's own meta check.
- `client/scripts/prune-app-export.mjs`: `game-select/pawlegends-preview@2x.webp` stays, `pawlegends/landing` entry removed in Phase B.
- `client/eslint.config.mjs` ignores `public/pawlegends-game/**` → move the ignore.
- Shared client files with Paw Legends branches that **stay** (Token Tails keeps using them): `context/auth/brand.ts`
  and the `brand` branches in `AuthSheet.tsx`/`FirebaseAuthContext.tsx` (removed in Phase B), `components/GoogleTagManager.tsx`
  and `analytics/gtm.ts` (Paw Legends container + `DEFERRED_PATHS`, removed in Phase B), `pages/_document.js`
  (Paw Legends noscript, font and chunk-watch paths, removed in Phase B), `layouts/MainLayout.tsx` (`PawlegendsConsent`,
  removed in Phase B), `api/user-api.ts` (`PawlegendsMatch`, `pawlegendsApiCall`, `pawlegendsPartyTicket`: removed in
  Phase B unless a Token Tails page uses them; it does not), `api/stripe-api.ts` + `components/web3/{Payment,StripePayment,crypto/CryptoCheckout}.tsx`
  `context: "pawlegends"` purchase context (backend guard for the Token Tails cat checkout; leave, it is a Token Tails
  checkout feature), `components/shared/EndGameModal.tsx` and `components/audio/tracks.ts` (`GameType.PAWLEGENDS`
  entries: keep, the enum is shared), `analytics/events.ts` (`PawlegendsEvent` union, removed in Phase B),
  `components/shelter/catSale.ts` (comment only).
- Client tests: move `__test__/pawlegends/*` (16 files; `purchase-context.test.ts` stays in client, it tests the Token
  Tails checkout), `__test__/pawlegends-{bridge,host,saves,units}.test.ts(x)`, `__test__/auth-sheet-pawlegends.test.tsx`,
  `e2e/pawlegends-{account,dare,landing,legends}.spec.ts`. Update in Phase B: `__test__/gtm.test.ts`,
  `game-select-modal.test.tsx`, `landing-routing.test.tsx`, `check-meta.test.ts`, `home-static.test.ts`,
  `typography-callsites.test.ts`, `e2e/heist-host.spec.ts` (picker href).

### 1.6 Everything that writes or reads `client/public/pawlegends-game`

| place | today | change |
|---|---|---|
| `pawlegends/package.json` `build:client` | `--outDir ../client/public/pawlegends-game` | `--outDir ../pawlegends-web/public/pawlegends-game` (Phase A also mirrors to client, see 2) |
| `pawlegends/tools/lib/keep-releases.mjs` | keeps the last 3 releases' `build/` in the out dir | seed the new dir with a verbatim copy of `client/public/pawlegends-game` first, so `build-releases.json` history and open tabs keep working |
| `pawlegends/tools/measure.mjs` | default `--dist ../client/public/pawlegends-game`; OTA zips from `client/public/pawlegends-app/updates/ios` | `--dist` → pawlegends-web; OTA path unchanged |
| `pawlegends/tools/budget.mjs`, `tools/lib/budget-lib.mjs` | comments | text |
| `pawlegends/tests/unit/audio-registry.test.ts` | reads `../client/public/pawlegends-game/voice` | → `../pawlegends-web/public/pawlegends-game/voice` |
| `pawlegends/tests/unit/mp-analytics.test.ts` | reads `client/analytics/pawlegends-events.ts` | → `pawlegends-web/analytics/pawlegends-events.ts` |
| `pawlegends/tools/landing-portraits.mjs` | writes `client/public/pawlegends/landing/portrait-*`, prints entries for `client/components/pawlegends/landing/roster.ts` | → pawlegends-web paths |
| `pawlegends/README.md`, `docs/CLIENT.md` (`/pawlegends-game/` row, "Pawlegends" section), `docs/GAMES.md`, `docs/DEVELOPMENT.md`, root `CLAUDE.md` table, `docs/plans/moba/*` release steps | "commit `client/public/pawlegends-game`" | new path; new `CLAUDE.md` row for `pawlegends-web/` |
| `.github/workflows/pawlegends-cdn.yml` | triggers on `client/public/pawlegends-game/**`, runs `scripts/cdn-cache.mjs game` | path → `pawlegends-web/public/pawlegends-game/**`; `SITE=https://pawlegends.app` after Phase B |
| `scripts/cdn-cache.mjs` (+ `scripts/__tests__/cdn-cache.test.mjs`) | `SITE` default tokentails.com, regex `^client/public(/pawlegends-game/build/...)`, git diff path | path-parametrised; the Cloudflare purge only works if pawlegends.app is in the `CF_ZONE_ID` zone (**founder: is pawlegends.app on Cloudflare?** default: skip purge for it, warm-up still runs) |
| `.github/workflows/pawlegends-ota.yml` | builds `pawlegends/dist-app` (its own build, `PAWLEGENDS_BASE=./`), writes `client/public/pawlegends-app/updates` | **does not read `client/public/pawlegends-game`**. OTA output stays. Add `pawlegends-web/{components,context,api,analytics,lib}/**` to its `push.paths` once the app imports from pawlegends-web |
| `.github/workflows/ci.yml` | client job | add a `pawlegends-web` job (`npm ci`, `tsc --noEmit`, `eslint`, tests, `next build`) |
| `infra/gcp/RUNBOOK.md`, `INVENTORY.md` | Cloudflare cache rules for `/pawlegends-game/*` on tokentails.com | note the new origin |
| `pawlegends-app/store/SCREENSHOT-PLAN.md` | reference renders | text |

**pawlegends-app depends on client source, not on the game build**: `scripts/build-web.mjs` (`clientDir =
../client`, esbuild `@/` resolver), `tsconfig.json` paths `../client/*`, `vitest.config.ts` alias `../client`. It
imports `@/api/user-api`, `@/components/heist/heistSaves`, `@/components/pawlegends/{apiBridge,bridge,championsBridge,claim,partySaves,saves,session}`,
`@/context/auth/{authErrors,firebaseConfig,lastMethod,link}`. Repoint all three to `../pawlegends-web` in Phase A
(after the copies land) so there is one source of truth before Phase B deletes the client copies.

### 1.7 Links into Paw Legends from Token Tails

- `client/components/shared/GameSelectModal.tsx`: PLAY picker card `PAWLEGENDS_PICKER_HREF = "/pawlegends/play"`
  (`?mode=blitz&from=picker`), title from `components/pawlegends/title.ts`, gated by `pawlegendsPickerEnabled()`.
  Phase B: href `https://pawlegends.app/play`, inline the title string, drop the flag import (web builds only, as today).
- `client/public/home/index.html` (static home hub, line ~1562): tab `pawlegends`, `play: '/pawlegends'`. Phase B:
  `https://pawlegends.app/`.
- No nav/footer links elsewhere. `cms/layout/pageLayout.tsx` `/pawlegends-reports` is a CMS page, unrelated.
- Trailer end cards `pawlegends/tools/trailer/**/copy*.json` say `tokentails.com/pawlegends` (still works via the
  redirect; change to `pawlegends.app` on the next re-cut, not now).

### 1.8 What the native app and the game point at

- OTA: `https://tokentails.com/pawlegends-app/updates/<platform>/<compat>/manifest*.json` and bundles (app-config.mjs,
  `src/shell/manifest.ts` requires that origin). **Must keep working from client forever** (installed binaries).
- API: `https://api.tokentails.com` (unchanged).
- Store metadata: `pawlegends.app/privacy`, `pawlegends.app/support`, `pawlegends.app/` (fastlane metadata); in-app
  sign-in sheet text `pawlegends.app/privacy`. Served by pawlegends-web after Phase B; must not 404 at any point.
- Game: `PUBLIC_GAME_URL https://pawlegends.app/`, `inviteUrl https://pawlegends.app/?party=CODE`, `WEB_PRIVACY_URL
  https://pawlegends.app/privacy`, store terms `${origin}/pawlegends/terms` (needs the 1.1 redirect),
  `partyLink.ts` API map already lists pawlegends.app. Embed origin check (`src/embed/bridge.ts`): default allowlist is
  tokentails.com only, but `withSameOrigin` adds the page's own origin when the parent is same-origin, which
  pawlegends-web is. Add `https://pawlegends.app` to `DEFAULT_EMBED_ORIGINS` anyway (cheap, covers previews with
  `VITE_EMBED_ORIGINS`).
- Text with a Token Tails address inside the app: `pawlegends-app/src/host/nativeHost.ts` `DELETE_ERROR` names
  `hello@tokentails.com` (out of scope; flag only).

### 1.9 Backend

- CORS (`backend/src/shared/cors-origins.ts`) already allows `https://pawlegends.app` and `https://www.pawlegends.app`.
  Add the new Vercel project's preview pattern, anchored like the landing lab one, e.g.
  `/^https:\/\/pawlegends-web-[a-z0-9]+-zbagdzevicius-projects\.vercel\.app$/` (exact project slug to confirm when the
  founder creates the project), plus the relay origin check reuses the list.
- Stripe return and email links: `PAWLEGENDS_PUBLIC_URL` (default `https://tokentails.com`) + `/pawlegends?checkout=…`,
  `/pawlegends?restore=…`, `/pawlegends?notify=…` (`pawlegends-stripe.service.ts`, `pawlegends-account.service.ts`).
  Keep the path (pawlegends-web redirects `/pawlegends` → `/` → `/play` with the keys). In Phase B the founder sets
  `PAWLEGENDS_PUBLIC_URL=https://pawlegends.app` on the backend; better: change the default in code to
  `https://pawlegends.app` in the Phase B commit (no env needed). Until then tokentails.com redirects them.
- Firebase authorized domains: already set (founder).

## 2. Env for pawlegends-web (names only; never read `.env*`)

| name | needed | note |
|---|---|---|
| `NEXT_PUBLIC_BE_URL` | yes | backend base URL (same value as client) |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional | host relays the game's PostHog events; omit = off (same project key as client) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | optional | default `news-ccd33.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | optional | reCAPTCHA Enterprise key; must list pawlegends.app |
| `NEXT_PUBLIC_E2E` | test only | E2E hooks, defaults to "" in next.config |

Not needed: Firebase web config (public, in `context/auth/firebaseConfig.ts`), GTM id (hardcoded `GTM-K6RTRKSR`),
Stripe publishable key (Checkout is a server-created redirect), `NEXT_PUBLIC_DOMAIN`/`SITE_NAME`/`TWITTER_PAGE`
(hardcoded), `NEXT_PUBLIC_PAWLEGENDS*` (kill switches dropped). Document in `pawlegends-web/README.md` and a new
`docs/CLIENT.md` cross-reference (or `docs/PAWLEGENDS-WEB.md`).

## 3. Two-phase release (nothing breaks)

### Phase A: ship pawlegends-web next to the client pages

1. Create `pawlegends-web/` (package.json, next.config.js, tsconfig `@/*`, tailwind/postcss, jest/playwright config,
   `.gitignore`, README). `npm ci` inside it only (disk checked: 77 GB free).
2. Copy/trim per 1.2–1.4; add the `shared/manifest.json` target; seed `public/pawlegends-game` with a verbatim copy of
   `client/public/pawlegends-game`.
3. `pawlegends/package.json` `build:client` writes to `../pawlegends-web/public/pawlegends-game` and then mirrors the
   result into `../client/public/pawlegends-game` (a small `tools/mirror-client.mjs`, deleted in Phase B), so
   tokentails.com/pawlegends keeps getting the same build while it still serves the game. Update the tests, tools and
   docs in 1.6. `pawlegends-cdn.yml` triggers on both paths.
4. Repoint pawlegends-app (`build-web.mjs`, tsconfig, vitest) to `../pawlegends-web`; run its tests and
   `node scripts/build-web.mjs --seq 1`.
5. Backend: CORS preview pattern; `DEFAULT_EMBED_ORIGINS` gets `https://pawlegends.app`.
6. Checks: pawlegends-web `tsc`, eslint, unit tests, `next build`, Playwright (landing, `/play` loads the iframe and the
   bridge hello, `/?party=ABC234` → `/play`, `/pawlegends/terms` → `/terms`, no "Token Tails" outside terms/privacy
   operator line: a guard test); client `tsc`, eslint, `npm test`, `next build` unchanged; pawlegends unit tests;
   backend lint/build/test for the CORS change. Browser runs: no persistent profile, kill dev servers.
7. Merge into main, push (fetch and rebase first). client still serves tokentails.com/pawlegends* and pawlegends.app
   until the founder points pawlegends.app at the new Vercel project.

Founder step between phases: create the Vercel project (Root Directory `pawlegends-web`, framework Next.js, env from
section 2), move the `pawlegends.app` and `www.pawlegends.app` domains from the tokentails project to it, check
`https://pawlegends.app/`, `/play`, `/privacy`, `/support` return 200.

### Phase B: cutover (only after pawlegends.app serves pawlegends-web)

Gate: `curl -sI https://pawlegends.app/play` shows the new deployment (e.g. a `x-pawlegends-web` header or a build id
meta the new app sets) and `/pawlegends-game/index.html` 200 there.

1. client: delete `pages/pawlegends/**`, `pages/legends/**`, `components/pawlegends/**`, `analytics/pawlegends-*.ts`,
   `public/pawlegends/**`, `public/pawlegends-game/**`, the moved tests and e2e specs.
2. client `next.config.js`: remove `pawlegendsDomainRedirects`, `pawlegendsDomainRewrites`, `pawlegendsRedirects`,
   the `/pawlegends-game` and `/pawlegends/landing` headers (keep the OTA headers). Add permanent redirects:
   `/pawlegends` → `https://pawlegends.app/`, `/pawlegends/:page*` → `https://pawlegends.app/:page*`, `/legends` →
   `https://pawlegends.app/legends`, `/pawlegends-game/:path*` → `https://pawlegends.app/pawlegends-game/:path*`
   (308; query kept by Next). `/pawlegends-app/**` is untouched.
3. Remove the Paw Legends branches from `brand.ts`/`AuthSheet.tsx`/`FirebaseAuthContext.tsx`, `GoogleTagManager.tsx`,
   `analytics/gtm.ts`, `analytics/events.ts`, `_document.js`, `MainLayout.tsx`, `api/user-api.ts`,
   `next-sitemap.config.js`, `check-meta.mjs`, `prune-app-export.mjs`, `eslint.config.mjs`; picker card and home hub
   tab link to `https://pawlegends.app/...` (1.7). Update the client tests listed in 1.5.
4. `pawlegends` `build:client`: drop the client mirror; `pawlegends-cdn.yml` only the new path, `SITE=https://pawlegends.app`.
5. Backend default `PAWLEGENDS_PUBLIC_URL` → `https://pawlegends.app`.
6. Checks: client `tsc`, eslint, `npm test`, `next build`; pawlegends-web full checks; backend tests. Merge, push.

## 4. Migrating the other workflows' work (after they finish)

Running now: sim v24 Boing Beds (`feat/pawlegends-v24-boing`, worktree `tokentails-pawlegends-boing`: game src,
backend vendor sim v24, docs; no client host code) and the phone score bar with K/D/A
(`fix/pawlegends-mobile-scorebar`, worktree `tokentails-pawlegends-scorebar`: uncommitted `pawlegends/src` HUD files +
an e2e spec; no client host code). Both will commit `client/public/pawlegends-game` when they ship. Never touch their
worktrees.

After each lands on main: rebase `feat/pawlegends-web`; resolve `client/public/pawlegends-game` by taking theirs, then
rebuild with the new `build:client` (writes pawlegends-web + the Phase A mirror) and commit both, so pawlegends-web
carries their release (keep-releases history included). If a workflow lands after Phase B, its commit to
`client/public/pawlegends-game` is moved: take its tree into `pawlegends-web/public/pawlegends-game` (or rebuild) and
delete the client copy again. Also re-check `client/components/pawlegends/**` in their diffs (none today) and port any
change to pawlegends-web.

## 5. Open founder calls (defaults in brackets)

1. Is pawlegends.app on the same Cloudflare zone as tokentails.com? [assume no: CDN purge skipped for it, warm-up runs]
2. Shelter champions' Token Tails cat cards in Paw Legends (memory "no TT cats-as-skins")? [keep as is; not part of this move]
3. Backend `PAWLEGENDS_PUBLIC_URL`: change the code default to pawlegends.app in Phase B [yes]
4. `/legends` A/B arm on pawlegends.app [keep at `/legends`]
