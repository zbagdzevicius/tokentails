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
| Telegram | `t.me/CatbassadorsBot/app` |

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
- Outbound access to Firebase, Telegram, OpenAI, Google GenAI, Stripe, Stellar Horizon, DigitalOcean Spaces, SendGrid, and Binance.
- A single instance, or accept that in-memory caches diverge across replicas.

There is no Dockerfile, process manager config, or health probe beyond `GET /`.

Cron jobs run inside the process. Two instances would run every job twice.

## Client website

`npm run build:prod` builds with `.env.production` and runs `next-sitemap`, which needs the
backend reachable to include article URLs. Serve with `npm run start` or deploy to any Node host.
No `vercel.json` or platform config is present. ISR pages (`/cats/:cat`, `/feed/:category/:article`)
need a Node runtime, not a pure static host.

## Client assets to CDN

`client/.gitlab-ci.yml` defines one job on pushes to `main`: install `s3cmd`, configure it from
the masked `DO_SPACES_KEY` and `DO_SPACES_SECRET` variables, and sync `client/public/` to
`s3://tokentails-nfts/w/` with public ACL. In production `cdnFile()` resolves to that prefix.
Because the pipeline file lives inside `client/`, it only runs if GitLab is configured to use that
path or the client was the repository root when the pipeline was set up.

The repository's only remote is GitHub (`git remote -v`), so that GitLab job does not run on push
today. New files under `client/public/` therefore reach the CDN only by a manual sync from a machine
with the Space credentials:

```bash
cd client && s3cmd sync --acl-public ./public/landing/proof/ s3://tokentails-nfts/w/landing/proof/
```

Until that runs, a production build (`cdnFile()` -> CDN prefix) requests `w/landing/proof/*` and
the Space returns 403; the homepage proof section then shows black video tiles. Check with
`curl -I https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/w/landing/proof/paris-event.mp4`.

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

Both require static export enabled in `next.config.js` and an `.env.app` with
`NEXT_PUBLIC_IS_APP` set. Details in MOBILE.md.

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

1. Backend: run `npm run build`, deploy, confirm `GET /` and `GET /count` respond.
2. Client: bump nothing (the web app has no version), run `npm run build:prod`, deploy, check `/game`, `/portrait`, `/feed`.
3. CMS: `npm run build`, deploy, log in and open `/blessings`.
4. Mobile: bump `releaseVersion` and `releaseVersionName` in `android/variables.gradle` and `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the Xcode project, then run the Android script and trigger Xcode Cloud.
5. Assets: sync new `client/public/` files to the Space (see "Client assets to CDN"); the GitLab job does not run from the GitHub remote.
