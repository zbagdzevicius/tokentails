# pawlegends-web

Paw Legends' own website on **pawlegends.app**: a Next.js 16 app (pages router, the same versions as `client/`) that
holds only Paw Legends. No Token Tails pages, branding or env; the operator is named only where the law needs it (the
terms and privacy pages). The move plan and its two release phases are in
[`docs/plans/moba/PAWLEGENDS-WEB.md`](../docs/plans/moba/PAWLEGENDS-WEB.md).

| Path | Page | Notes |
|---|---|---|
| `/` | `pages/index.tsx` | the landing (A/B arm A). `noindex` until the trademark search passes |
| `/legends` | `pages/legends.tsx` | the scroll-lane-map landing (A/B arm B) |
| `/play` | `pages/play.tsx` | the game host: the built game in a same-origin iframe (`/pawlegends-game/index.html?embed=1`) |
| `/terms`, `/privacy` | | store terms; privacy notice (the App Store and Google Play privacy URL) |
| `/account` | | sign in, sign out, delete the account (Google Play's account deletion URL) |
| `/support` | | the App Store support URL |
| `/pawlegends-game/**` | `public/pawlegends-game` | the committed game build, same URLs as before |

Redirects (`next.config.js`): `www.pawlegends.app` goes to the apex; `/` and `/legends` with a game key (`party`,
`dare`, `checkout`, `restore`, `notify`, `from`, `mode`) go on to `/play` with their query; the old tokentails.com paths
keep working: `/pawlegends` goes to `/` (or straight to `/play` with a game key) and `/pawlegends/<page>` to `/<page>`.
The game opens `${origin}/pawlegends/terms`, and the backend's Stripe returns and account emails use
`/pawlegends?checkout=...`, so keep these redirects. Every response carries `x-pawlegends-web: 1`.

## Run and check

```bash
npm ci
npm run dev            # http://localhost:3006
npx tsc --noEmit
npx eslint .
npm test               # jest, the same runner as client/
npm run build && npm start
npm run test:e2e       # Playwright against E2E_BASE_URL (default http://localhost:3006); build with NEXT_PUBLIC_E2E=1
```

## Environment (names only)

| Name | Needed | What |
|---|---|---|
| `NEXT_PUBLIC_BE_URL` | yes | the backend base URL (the same value as client: the shared account backend) |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional | the host relays the game's PostHog events; unset = no PostHog |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | optional | Firebase auth domain; default `news-ccd33.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | optional | reCAPTCHA Enterprise key for App Check (its domain list must include pawlegends.app) |
| `NEXT_PUBLIC_E2E` | tests only | `1` compiles the E2E hooks in; unset everywhere else |

Not needed: the Firebase web config is public and in `context/auth/firebaseConfig.ts`; the GTM container
(`GTM-K6RTRKSR`) is in `analytics/pawlegends-site.ts`; there is no Stripe publishable key (checkout is a redirect the
backend creates); the site origin and name are fixed (`components/seo/site.ts`). No feature flags.

## Vercel project

- Root Directory `pawlegends-web`, Framework Preset Next.js, Node.js 24.x.
- Install `npm ci`, Build `npm run build`, Output: the Next.js default.
- Domains: `pawlegends.app` (production) and `www.pawlegends.app` (redirects to the apex; `next.config.js` does it too).
- Backend CORS allows `https://pawlegends.app`, `https://www.pawlegends.app` and this project's preview URLs
  (`pawlegends-web-<hash>-zbagdzevicius-projects.vercel.app`, `backend/src/shared/cors-origins.ts`).

## Where the code comes from

Copied from `client/` and trimmed (Phase A of the move; the client copies are deleted at the cutover):
`components/pawlegends/**` and `analytics/pawlegends-*.ts` as they were, plus the sign-in runtime
(`context/FirebaseAuthContext.tsx`, `context/auth/*`, `components/shared/auth/AuthSheet.tsx` with only its Paw Legends
copy), the modal kit (`components/ui/*`), the analytics core, and `api/user-api.ts` with only the calls Paw Legends
makes. `lib/accountDeletion.ts` holds the two functions the account page used from client's ProfileModal.
`shared-contracts/` is generated from `shared/` (`node scripts/sync-contracts.mjs`).

`pawlegends-app` bundles the React-free host modules from here (`@/` resolves to `../pawlegends-web` in its
`scripts/build-web.mjs`, `tsconfig.json` and `vitest.config.ts`): keep `components/pawlegends/{bridge,saves,partySaves,
apiBridge,championsBridge,session,claim}.ts`, `components/heist/heistSaves.ts`, `api/user-api.ts` (types) and
`context/auth/{link,authErrors,lastMethod,firebaseConfig}.ts` free of React and Next.

The game build: `npm run build:client` in `pawlegends/` writes `public/pawlegends-game` here and, until the cutover,
mirrors it to `client/public/pawlegends-game` (`pawlegends/tools/mirror-client.mjs`). Commit both.
