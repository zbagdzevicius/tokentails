# Deployment

What the repository tells us about how Token Tails ships. Hosting for the backend and the two
Next.js apps is not described anywhere in the repo, so those sections list what the code expects
rather than a specific provider.

## Environments and hostnames

| Surface | Hostname |
|---|---|
| Website | `https://tokentails.com` |
| Earlier web app | `https://cats.tokentails.com` |
| Test | `https://test.tokentails.com` |
| API | `https://api.tokentails.com` (used as NFT metadata base URI by the contracts) |
| Asset CDN | `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com` |
| Android | Google Play, `com.tokentails.app` |
| iOS | App Store, id `6745582489` |

## Backend

Build and run:

```bash
cd backend
npm ci
npm run build          # dist/
npm run start          # node dist/main, listens on PORT (default 3005)
```

Requirements:

- MongoDB reachable at `MONGODB_URI`. Atlas is expected for the `$search` endpoints.
- All variables in BACKEND.md set. `FRONT_END_URLS` must list every frontend origin, otherwise CORS falls back to `*`.
- Stripe webhook endpoint registered as `https://<api>/image/webhook` for `checkout.session.completed`.
- Outbound access to Firebase, OpenAI, Google GenAI, Stripe, Stellar Horizon, DigitalOcean Spaces, SendGrid, and Binance.
- A single instance, or accept that in-memory caches diverge across replicas. Cron jobs take a lease in `jobruns`, so more than one instance runs each job once per tick.
- `TRUST_PROXY` set to the proxy hop count when the API runs behind a load balancer or reverse proxy, otherwise every client shares one rate-limit bucket and every Heist replay is refused with 503 (see BACKEND.md, "Production checklist for the flags").
- `IMPACT_JOBS_ENABLED=true` (and `CRONS_ENABLED=true` unless `NODE_ENV=production`) on the instance(s) that run jobs.
- Deploy the backend before any client that sends `outcome` or a Heist `replay`, then run the migrations, then deploy the client (plan F6). Run the data scripts in the order listed in BACKEND.md, "Data scripts".
- For the 2026-10 codex cycle: deploy before 2026-10-01 00:00 server time, or run `backend/scripts/skip-codex-cycle.js --period 2026-10 --apply` before 2026-10-08T23:00Z (BACKEND.md known issues).

There is no Dockerfile, process manager config, or health probe beyond `GET /`.

Cron jobs run inside the process, each behind a lease (or, for the codex reset, a period claim) in
the `jobruns` collection.

## Client website

`npm run build:prod` builds with `.env.production` and runs `next-sitemap`, which needs the
backend reachable to include article URLs. Serve with `npm run start` or deploy to any Node host.
No `vercel.json` or platform config is present. ISR pages (`/cats/:cat`, `/feed/:category/:article`)
need a Node runtime, not a pure static host.

## Client assets to CDN

`.github/workflows/cdn-sync.yml` (decision #59) syncs `client/public/` to `s3://tokentails-nfts/w/`
with a public ACL on pushes to `main` that touch `client/public/**`, or by hand. In production
`cdnFile()` resolves to that prefix.

- It needs the repository secrets `DO_SPACES_KEY` and `DO_SPACES_SECRET` (optional `DO_API_TOKEN` and
  `DO_CDN_ENDPOINT_ID` for a cache flush). On a push without them it warns and skips every step; a
  manual run fails.
- Pass 1 uploads only versioned files (`-vN-`, `.vN.`, `heist-game/build/`) with
  `Cache-Control: public, max-age=31536000, immutable`; pass 2 the rest with `public, max-age=3600`,
  so the Heist `index.html` never goes live before its hashed bundles. It never deletes remote files
  (installed native builds still load old ones).
- Inputs: `dry_run` (lists what would be uploaded and the versioned matches), `reheader` (rewrites
  the headers of files already on the CDN, for the files the GitLab job uploaded without
  `Cache-Control`) and `flush`.
- After the sync it reads back one file per risky extension and fails when its Content-Type is empty
  or `octet-stream` or the ACL is not public.

`client/.gitlab-ci.yml` is deprecated: GitLab does not run from the GitHub remote. Retire it in the
GitLab settings and delete the file once the GitHub workflow has run (manual step). If it is ever
re-enabled, run cdn-sync with `reheader` afterwards.

First run (manual, not done): add the secrets, run cdn-sync with `reheader` and `dry_run`, check the
printed files, run it with `reheader` alone, then verify a few files with `curl -I`. The new art of
this build (catnip sprigs, night skins, plates, posters, icons, the share card) is served from the
app origin, so the site works before this runs; legacy names loaded through `cdnFile()`
(`logo/catnip.webp`, `catnip-chaos/items/catnip-coin.png`) show the old art until it does. The old
pixel fonts (`pixel-rescue/fonts/pixel-text*.ttf`) can be deleted from the CDN only after installed
app builds that load them have aged out (decision #81).

Homepage proof media (Paris event clip, creator reels) are the original deck files served from
the pitch site on Vercel (`https://token-tails-pitch.vercel.app/deck-assets/videos/`), so no
upload to the Space is needed for them.

## Catnip Heist

`npm run build:client` in `catnip-heist/` writes the build to `client/public/heist-game/`, which
ships with the client (web and app export). Whenever the Heist simulation changes, run
`npm run vendor-sim`, deploy the backend first, then the client. The manual
`.github/workflows/catnip-heist-pages.yml` publishes the standalone build to GitHub Pages under
`/<repo>/heist-game/` after `vendor-sim:check-remote` confirms that `GET
/user/catbassadors/heist-sim` on the target backend serves the same bundle hash.

## Facts and campaign

`client/public/facts/facts.json` and `client/public/shelter-payouts/campaign.json` are generated by
`fund facts build` (CLAIMS.md). `node funding/framework/bin/fund.mjs facts gate` is the release gate:
it fails on drift or a stale surfaced fact. The C-001 campaign goal (90 USDC for Pink Paw, counting
from 2026-10-02, ending 2027-01-31) is published by the next client deploy and CDN sync; the
ShelterSplit rail must pay the held Pink Paw wallet on Arc by 2026-11-03 or the goal stops being
reachable. `.github/workflows/facts-weekly.yml` runs the weekly report on Mondays once it is on the
default branch and Actions may open issues.

## CMS

```bash
cd cms
npm ci
npm run build
npm run start
```

Needs `NEXT_PUBLIC_BE_URL` at build time. Firebase web config is compiled in.

## Mobile

Android: `./client/scripts/android-play-release.sh` builds a release bundle and uploads to the
Play internal track via Fastlane. Promote to production in the Play Console.

iOS: Xcode Cloud runs `ios/App/ci_scripts/ci_post_clone.sh` to build the web bundle and sync
Capacitor, then archives and uploads to TestFlight. Promote in App Store Connect.

Both build the static export from `.env.app`, which must set `NEXT_PUBLIC_IS_APP`; that flag is
what turns on `output: "export"` in `next.config.js`. `app:ios:ci` runs `check:app-export` before
syncing, so Xcode Cloud stops if `out/` is incomplete. Details in MOBILE.md.

## Contracts

Soroban deploys are manual with the Stellar CLI; the exact commands and the deployed IDs are in
CONTRACTS.md and in `contracts/stellar/soroban-nft/README.md`. A self-hosted Soroban RPC node was
run on Kubernetes with the Helm values in that folder. SKALE deploys are manual through Remix.

## Faucets

`contracts/stellar/stellar-fuel` and `contracts/sfuel` are plain Express apps started with
`npm start` on port 8888. Each needs a funded faucet wallet private key, an RPC URL, and the shared
`ML_ACCESS_TOKEN`. Run behind TLS; the token is sent as a plain header.

## Database operations

Backups with `mongodump` and restores with `mongorestore` are documented in BACKEND.md. Schema
migrations use `migrate-mongo` with scripts that currently exist only on developer machines.

## Release checklist

1. Backend: run `npm run build`, deploy, confirm `GET /`, `GET /count`, `GET /impact` and `GET /user/catbassadors/heist-sim` respond. Check the startup log for the `TRUST_PROXY` and "Impact jobs are off" warnings.
2. Migrations and data scripts, dry run first (BACKEND.md, "Data scripts").
3. CMS: `npm run build`, deploy (before or with the backend when the user form changed), log in and open `/blessings`.
4. Client: bump nothing (the web app has no version), refresh `public/impact/snapshot.json` from production, run `fund facts gate`, `npm run build:prod`, deploy, check `/game`, `/heist`, `/impact`, `/portrait`, `/feed`, and run `npm run meta:check -- --base https://tokentails.com`.
5. Mobile: follow the native release train in MOBILE.md, bump `releaseVersion` and `releaseVersionName` in `android/variables.gradle` and `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the Xcode project, then run the Android script and trigger Xcode Cloud.
6. Assets: cdn-sync runs on the push to `main` once its secrets exist (see "Client assets to CDN").
