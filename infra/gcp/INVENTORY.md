# Google Cloud migration inventory

Everything Token Tails runs in production today, what it depends on, and what has to move for a full
migration to Google Cloud. Taken on 2026-11-06 from `origin/main` (eaba6ae7), the docs, the code, a
read-only `doctl apps spec get` (environment values stripped, keys only), `doctl` listings, `vercel
project ls`, public DNS and the founder's launchd agents (labels and arguments only). No secret value was
read or printed.

Legend for the tables: **State** = what the component keeps between requests. **Scale-out** = can it run as
N identical replicas behind a plain load balancer.

## 1. Current hosting at a glance

| Surface | Host today | Region | Size | Deploy trigger |
|---|---|---|---|---|
| Backend API + crons + party relay (`backend/`) | DigitalOcean App Platform, app `tokentails-be`, service `tokentails-backend` | `fra` (Frankfurt) | `apps-s-1vcpu-1gb` x **2 instances** | `deploy_on_push` from GitHub `zbagdzevicius/tokentails` `main`, `source_dir: backend`, build `npx @nestjs/cli build`, run `npm start` (`node dist/main`), `http_port: 8080`, buildpack `ubuntu-22` node-js |
| Website + games (`client/`) | Vercel project `cats` -> `tokentails.com` (Node 20.x) | Vercel edge | serverless | Vercel Git integration on `main` |
| Admin CMS (`cms/`) | Vercel project `tokentails-cms` -> `cats.tokentails.com` (Node 24.x) | Vercel edge | serverless | Vercel Git integration |
| Landing lab (`landing-poc/`) | Vercel project `tokentails-landing-lab` (CORS-allowed by the backend) | Vercel | static | Vercel |
| Pitch site (deck videos used on the homepage) | Vercel project `tokentails-pitch` (`docs` say `token-tails-pitch.vercel.app`) | Vercel | static | Vercel |
| Pawlegends landing experiments | ~12 Vercel projects `pawlegends-*` | Vercel | static | Vercel (not in this repo's deploy path) |
| Object storage + CDN | DigitalOcean Spaces `tokentails-nfts` (fra1, CDN on, TTL 3600), `tokentails` (fra1, CDN on), `tokentails-apps` (sfo3, CDN on) | fra1 / sfo3 | – | backend uploads; GitHub Action `cdn-sync.yml` |
| Database | MongoDB, **not on DigitalOcean** (no managed DB in `doctl databases list`). Almost certainly MongoDB Atlas: the code uses Atlas `$search` (`blessing`, `user`, `article` controllers), DEPLOYMENT.md says "Atlas is expected" | unknown (see Unknowns) | unknown | – |
| DNS / edge | Cloudflare (NS `noah`/`roxy.ns.cloudflare.com`); `tokentails.com`, `www`, `api`, `cats`, `test` all orange-cloud proxied | global | – | manual |
| Mail (inbound) | Zoho Mail EU (MX `mx*.zoho.eu`, SPF `include:zohomail.eu`) | EU | – | – |
| Mail (outbound, transactional) | SendGrid (API key) | – | – | – |
| Auth | Firebase Auth project `news-ccd33` (already Google) + App Check | Google | – | – |
| Mobile | Google Play `com.tokentails.app` (Fastlane), App Store id `6745582489` (Xcode Cloud) | – | – | manual release train |
| Standalone Heist | GitHub Pages via manual `catnip-heist-pages.yml` | – | – | manual |
| CI | GitHub Actions: `ci.yml` (push/PR to `main`), `cdn-sync.yml` (push to `main` touching `client/public/**`), `facts-weekly.yml` (cron `0 6 * * 1`), `catnip-heist-pages.yml` (manual). `client/.gitlab-ci.yml` is deprecated | – | – | – |

There are no droplets, no Kubernetes clusters and no DigitalOcean domains in this account (the old
Soroban RPC node on Kubernetes and the faucets are not running on DigitalOcean today).

## 2. Deployables

| # | Deployable | Code | Runtime needs | State | Scale-out | GCP target (proposal) |
|---|---|---|---|---|---|---|
| D1 | **Backend HTTP API** (NestJS 9, Express) | `backend/`, `node dist/main`, listens on `PORT` (default 3005; DO sets 8080) | Node 22-ish, `sharp` + `heic-convert` native deps (postinstall reinstalls sharp), 50 MB JSON body parser, raw body for Stripe webhooks, 64 KB limit on `POST /user/catbassadors/live`. Health: only `GET /` (returns `1`); no readiness endpoint. `enableShutdownHooks()` is on | In-memory caches: traction counters, storefront, featured, Paw Match leaderboard, `@nestjs/throttler` buckets, per-IP limiters, AI budget day keys partly in Mongo. All durable data is in MongoDB. No local disk writes in `src/` | **Yes, with caveats**: caches diverge across replicas (known issue, accepted); throttler limits become per-replica | Cloud Run service (europe-west3) or a GCE managed instance group; see D3 for why the relay should not share it |
| D2 | **In-process cron jobs** (`@nestjs/schedule`, 26 jobs, table in section 4) | inside D1 | Need a continuously running process with CPU between requests | Lease per job in Mongo `jobruns` (`runLeased`, `claimJobPeriod`), so N replicas run each job once per tick. Exceptions: the traction refresh (no lease, per replica by design) and the `rave-stripe-events` cursor (in memory, 72 h look-back on boot) | **Yes** (leases) | Keep in-process on an instance with **CPU always allocated** and `min-instances >= 1` (Cloud Run instance-based billing), or move to Cloud Scheduler -> authenticated HTTP endpoints later (code change, out of scope) |
| D3 | **Pawlegends party relay** (WebSocket `wss://api.tokentails.com/pawlegends/ws`) | `backend/src/pawlegends/party/*` on the same Nest HTTP server (`ws` 8.21, `noServer` upgrade, `perMessageDeflate: false`, `maxPayload` 1 KB) | Long-lived sockets; 15 Hz turns; pings every 5 s in match / 15 s in lobby (Cloudflare idles out at 100 s); referee sim in a `worker_threads` pool of `max(1, min(4, cpus-1))` workers (on 1 vCPU: **1 worker sharing the only core with the event loop**); event-loop p99 > 20 ms refuses new rooms; `MAX_LIVE_ROOMS = 60` placeholder; 2,000 sockets per instance cap | **Stateful in memory**: parties (`byCode`, `parties`, `memberParty` maps), live rooms, sockets, resume tokens. Rooms checkpoint every 10 s to Mongo with an owner/epoch lease and hand off on SIGTERM (restore within 120 s at the next boot). Parties are looked up **only** in the local map | **No.** A friend whose socket lands on another replica gets `party_not_found`. Today DO runs **2 instances without affinity**, so party joins already fail about half the time when the two players hit different instances | Dedicated relay service, separate from the API: one instance (or shard-prefixed party codes + a `where` lookup, MULTIPLAYER.md section 15) with >= 2 vCPU so the referee has its own cores, CPU always on, europe-west3, HTTP/1.1 upgrade allowed, timeout 3600 s, session affinity |
| D4 | **Pawlegends / Heist / Bad Cat replay verification** | `pawlegends-replay.worker.ts`, vendored sims under `backend/src/vendor/*` | CPU-bound worker threads (a Pawlegends match takes up to 1.5 s to re-simulate) inside `POST /user/catbassadors/live` | Stateless | Yes | Same as D1; size CPU for it |
| D5 | **Client website** (Next.js 16, pages router) | `client/`, `npm run build:prod` (env from `.env.production`, runs `next-sitemap`, which calls the backend) then `next start` | Node runtime for ISR (`revalidate` in `index`, `impact`, `yourcat`, `pawlegends/play`, `swordcat`; `/cats/:cat`, `/feed/...`), many redirects and rewrites (`/heist`, `/badcat`, `/meow-race`, `/ultra-cat`, `/meow-run`, `/rave`, `/home`, optional Firebase auth proxy `/__/auth/*` -> `news-ccd33.firebaseapp.com`). `next/image` uses a custom loader (no Vercel image optimizer dependency). `NEXT_PUBLIC_*` values are inlined at build time | ISR cache on the instance filesystem (per instance on Cloud Run; global on Vercel) | Yes (ISR pages may differ per instance until revalidated) | Cloud Run service (container `next start`) behind an HTTPS load balancer with Cloud CDN, or keep on Vercel (see Unknowns: "full migration" scope) |
| D6 | **Static game builds served by the client** | `client/public/` (412 MB): `heist-game` 4.8 MB, `badcat-game` 25 MB, `formula-meow-game` 2.8 MB, `ultracat-game` 0.8 MB, `meowrun-game` 1.1 MB, `pawlegends-game` 6.8 MB, `swordcat-game` 63 MB, `rave` 1.3 MB, `home` media 147 MB, `rail/widget.js`, `facts/`, `shelter-payouts/`, `match-desk/` | Static files with long-cache headers for versioned names | None | Yes | Cloud Storage bucket + Cloud CDN (backend bucket on the same LB as D5), or served by D5 through Cloud CDN |
| D7 | **Admin CMS** (Next.js 16) | `cms/`, needs `NEXT_PUBLIC_BE_URL` at build time; Firebase web config compiled in | Node runtime | None | Yes | Cloud Run service `cats.tokentails.com` (low traffic, can scale to zero) |
| D8 | **Mobile web bundle** | `client` static export (`NEXT_PUBLIC_IS_APP`, `output: "export"`) inside Capacitor | none at runtime on our side; installed apps call `api.tokentails.com` and the Spaces CDN host directly | – | – | Nothing to host; **hostnames baked into installed builds must keep working** (`api.tokentails.com`, `tokentails-nfts.fra1.cdn.digitaloceanspaces.com`) |
| D9 | Landing lab, pitch site, Pawlegends landing experiments | `landing-poc/` and outside repos | static | none | yes | Optional: Cloud Storage + CDN, or leave on Vercel |
| D10 | Faucets `contracts/stellar/stellar-fuel`, `contracts/sfuel` (Express, port 8888) | repo | funded faucet key, RPC URL, `ML_ACCESS_TOKEN` | none | yes | Not running on DO today; migrate only if still needed (Unknowns) |
| D11 | Treat agent / Match Desk (`agents/treat-agent/`) | repo | `ANTHROPIC_API_KEY`, `TREAT_AGENT_*`, Foundry keystore, `forge`/`cast` | run logs on disk (`runs/decisions.jsonl`) | single | Run by hand today (refuses mainnet inside an AI session). Candidate Cloud Run Job + Cloud Scheduler only if it should run unattended |
| D12 | Motored event gift runner (launchd) | **private** `funding/framework/tracks/motored-event/run.mjs` on the founder's Mac, agent `com.tokentails.motored-event-r3` loaded (every 120 s, `--once`, key dirs under `~/.tokentails-wallets/`); r1 and r2 plists still on disk, unloaded | Node + ethers, funder and per-wallet keys on local disk, `MOTORED_CONFIRM_MAINNET` | out-dir state files on disk | single | Round 3 ends 2026-11-12, before any migration. Not a migration target unless a round 4 is planned; if so, a Cloud Run Job + Cloud Scheduler (every 2 min) with keys in Secret Manager and state in a bucket, and it must stay out of this public repo |

## 3. Data stores and stateful services

| Store | Used by | Where | State / notes | Migration |
|---|---|---|---|---|
| MongoDB `tokentails` (`MONGODB_URI`) | backend (Mongoose 6, driver 6), CMS via API, migrations `migrate-mongo` | Atlas inferred (Atlas `$search` indexes on articles, blessings, users autocomplete). Region and tier unknown | All durable data incl. `jobruns` leases, party rooms (`PawlegendsRoom` with TTL 30 d) and parties (TTL 3 h), impact snapshots, chain cursors. `MONGO_TRANSACTIONS` off by default (replica set needed) | Stay on Atlas and **move/pick the Atlas region to GCP europe-west3** (Atlas on GCP) so the backend-to-DB round trip stays < 2 ms; private connectivity via Private Service Connect or a static egress IP (Cloud NAT) in the Atlas IP access list. Firestore/Cloud SQL are not drop-in (Mongoose, `$search`) |
| DigitalOcean Spaces `tokentails-nfts` (fra1) | backend uploads (blessing photos as WebP, AI art, `/yourcat` originals and faces, cameo images, rave ad images, optional `impact/impact.json` mirror), `cdn-sync.yml` mirrors `client/public` to prefix `w/`, `cdnFile()` in the client, cat sprites under `assets/` | S3 API via `@aws-sdk/client-s3` (`DO_SPACES_ENDPOINT/KEY/SECRET/NAME/CDN`) | Public-read objects; **URLs are stored in Mongo documents and NFT metadata and baked into installed native builds**; old files must never be deleted (decision #81). 92 code references to `tokentails-nfts.fra1.cdn.digitaloceanspaces.com` | GCS bucket in `europe-west3` with interoperability (HMAC) keys so the S3 client keeps working via `DO_SPACES_ENDPOINT=https://storage.googleapis.com`; Cloud CDN in front; copy with Storage Transfer Service. The old Spaces host must keep serving (or redirect) for installed apps and stored URLs; rewrite stored URLs only with a data script |
| Spaces `tokentails` (fra1) | 11 references: `rescue-goal.constants.ts`, `client/pages/portrait*.tsx`, `ProofSection`, `tailsCard/data.ts` | public CDN | Static art | Same as above |
| Spaces `tokentails-apps` (sfo3) | no reference found in this repo | – | Unknown content | Inventory before migrating (Unknowns) |
| Vercel ISR cache | client | Vercel | Rebuildable | Rebuilt by the new host |
| In-memory relay state | D3 | process memory | parties, rooms, sockets, resume tokens | Must stay single-owner: one relay instance, or sharded codes |
| Local disk | none in `backend/src`; D11 and D12 write logs/state locally | – | – | Bucket if those jobs move |

Caches and queues: **none external.** No Redis, no Pub/Sub, no job queue; AI generation runs inside the
request ("Synchronous AI" in ARCHITECTURE.md). Rate limits and caches are in process memory.

## 4. Scheduled jobs (all inside the backend process)

Defaults follow `NODE_ENV=production`: guest jobs need `CRONS_ENABLED`, impact/treat/paw jobs need
`IMPACT_JOBS_ENABLED` (both default on only under production). Lease = Mongo `jobruns`.

| Job (lease) | File | Schedule | Notes |
|---|---|---|---|
| Traction refresh | `app.controller.ts` | daily 10:00 + at boot | no lease, per replica |
| `user-check-in-reset` | `user.controller.ts` | daily 01:00 | |
| `user-status-reset` | `user.controller.ts` | daily 01:00 | |
| `guest-cleanup` | `user.controller.ts` | daily 03:00 | deletes anonymous Firebase users too (needs Firebase Admin) |
| `guest-merge-resume` | `user.controller.ts` | every 10 min | |
| `weekly-top-rewards` | `user.controller.ts` | weekly | |
| codex reset (period claim) | `user.controller.ts` | `0 0 23 8 * *` UTC | |
| `cat-status-reset` | `cat.controller.ts` | daily 01:00 | |
| `shelter-donate-reconcile` | `shelter-donate-reconcile.service.ts` | `*/2 * * * *` | signs txs with the hot wallet |
| `shelter-payout-index` | `payout-index.service.ts` | `*/2 * * * *` | RPC `eth_getLogs` on 7 chains x 2 networks |
| `impact-indexer` | `impact-indexer.service.ts` | `*/5 * * * *` | RPC |
| `impact-snapshot` | `impact.service.ts` | `7 * * * *` | optional CDN mirror write |
| `impact-compact` | `impact.service.ts` | `20 0 * * *` | |
| `paw-settlement` | `paws.service.ts` | `30 0 * * *` UTC | sends txs only with `PAWS_SETTLEMENT_ENABLED` |
| `paw-reconcile` | `paws.service.ts` | `*/10 * * * *` | |
| `rescue-goal-pledge-sweeper` | `rescue-goal-pledge.service.ts` | every minute | |
| `shelter-goal-scan` | `shelter-goal.service.ts` | every minute | up to 40 `eth_getLogs` windows, 300 ms apart (long-running tick) |
| crypto grant recovery | `crypto-checkout.service.ts` | `*/5 * * * *` | |
| crypto shelter-share keeper | `crypto-shelter-share.service.ts` | `*/5 * * * *` | **on-chain keeper, signs with the hot wallet** |
| `yourcat-retention` | `yourcat-retention.job.ts` | `15 3 * * *` | deletes bucket objects |
| `yourcat-portrait-delivery-sweep` | `portrait-delivery.service.ts` | `*/10 * * * *` | Gemini + SendGrid |
| `badcat-seen-email` | `badcat-seen-email.job.ts` | Mon 09:00 UTC | SendGrid |
| `badcat-push` | `badcat-push.service.ts` | hourly :00 UTC | web push (VAPID) |
| `badcat-streak-email` | `badcat-push.service.ts` | daily 18:00 UTC | SendGrid |
| `rave-refresh` | `rave.service.ts` | every minute at :15 s | |
| `rave-stripe-events` | `rave-webhook.service.ts` | every minute at :40 s | Stripe Events API pull, production only, in-memory cursor |

Other repeating work: the relay's turn clock and ping timers (`setInterval`), the party checkpoint every
10 s. GitHub Actions cron: `facts-weekly.yml` Mondays 06:00 UTC (stays on GitHub).

Implication: the backend must not scale to zero and must keep CPU between requests. On Cloud Run that
means instance-based billing ("CPU always allocated") with `min_instance_count >= 1`.

## 5. Inbound endpoints that third parties call

| Caller | Endpoint | Secret (name) |
|---|---|---|
| Stripe (portraits, legacy checkout) | `POST https://api.tokentails.com/image/webhook` | `STRIPE_WEBHOOK_SECRET` |
| Stripe (Tails Club) | `POST /club/stripe/webhook` | `CLUB_STRIPE_WEBHOOK_SECRET` |
| Stripe (Bad Cat Club) | `POST /badcat/stripe/webhook` | `BADCAT_STRIPE_WEBHOOK_SECRET` |
| Stripe (Pawlegends store) | `POST /pawlegends/stripe/webhook` | `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` |
| Stripe (Moon Rave, optional) | `POST /rave/stripe/webhook` | `RAVE_STRIPE_WEBHOOK_SECRET` (falls back to `STRIPE_WEBHOOK_SECRET`) |
| Soroban and SKALE NFT contracts | `tokenURI` -> `https://api.tokentails.com/...` metadata (`cat.controller.ts`) | none; **the hostname is immutable on chain** |
| Browsers and native apps | REST with `accesstoken` header, WebSocket `/pawlegends/ws` | Firebase ID tokens |
| x402 agents | `GET /shelter/agent/cat-card` (headers `PAYMENT-*`, `X-PAYMENT-RESPONSE` exposed by CORS) | facilitator config |

All of these keep working unchanged if `api.tokentails.com` keeps its name and only its origin moves
behind Cloudflare. That is the core reason to keep the hostnames and switch origins.

## 6. Outbound dependencies (egress)

Firebase Admin / Identity Toolkit and App Check; OpenAI; Google GenAI (Gemini, `GOOGLE_AI_API_KEY`);
Stripe API; SendGrid; Printify; Apple Sign in with Apple revocation; Stellar Horizon; Binance ticker;
EVM JSON-RPC for Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain, Monad (public RPCs by default,
`SHELTER_*_RPC_URL`, `CRYPTO_PAY_RPC_<chainId>` overrides); x402 facilitator (`SHELTER_X402_FACILITATOR_URL`);
DigitalOcean Spaces (until moved); MongoDB Atlas.

Outbound IP allow-lists: none found in code. The only likely allow-list is the **Atlas IP access list**
(its current content is unknown; DO App Platform has no static egress IP in this spec, so it is probably
`0.0.0.0/0` or the DO ranges). On GCP: Cloud NAT with a reserved static IP, then allow only that IP in
Atlas (or Private Service Connect). Public RPC providers may rate-limit a single NAT IP that both the
payout indexers and the goal scan use; watch for 429s.

## 7. Network edge, client IPs and the relay

- Cloudflare proxies every hostname. The backend trusts `X-Forwarded-For` hops that are loopback,
  RFC 1918, link-local, CGNAT (100.64/10) or Cloudflare (`shared/trust-proxy.ts`), and the relay uses
  `cf-connecting-ip` only when the socket peer is a Cloudflare IP or such a trusted hop
  (`PartyRelay.clientIp`). Per-IP caps (50 sockets, 4 live rooms, 10 live parties, join-fail budgets),
  the guest/session throttles, AI upload limits and the Heist IP throttle all depend on this.
- **Cloud Run**: the peer seen by the container is a link-local/private Google front end address, which
  is trusted, so the Cloudflare header keeps working **as long as Cloudflare stays in front**. Exposing
  the `*.run.app` URL directly would let anyone forge `cf-connecting-ip`: restrict ingress
  (`internal-and-cloud-load-balancing`) and front it with the load balancer, plus Cloudflare's
  Authenticated Origin Pulls or an origin secret header.
- **External Application Load Balancer / GCE**: the proxies come from `35.191.0.0/16` and
  `130.211.0.0/22`, which are **not** in the trusted list, and the LB appends its own address to
  `X-Forwarded-For`. Without a `TRUST_PROXY` setting (or adding those ranges in code) every visitor
  would get the same IP and the per-IP caps would lock players out. This is a deployment-blocking item
  for any LB-fronted design; verify with the startup `first request: req.ip is ...` line.
  **Resolved in the migration branch**: the relay reads `cf-connecting-ip` from the proxy-only subnet (a
  trusted private hop); on tt-api `req.ip` is still the balancer's address, so every per-IP path now goes
  through `shared/client-ip.ts` (`clientIp`, `visitorIp`), which reads `cf-connecting-ip` first. The
  account and guest-session throttles and the donation relay hash read `req.ip` directly before
  (RUNBOOK.md, Architecture).
- `cf-ipcountry` (Rave buyer flags) needs Cloudflare IP geolocation; it is lost if Cloudflare is
  removed.
- WebSockets: Cloudflare's 100 s idle limit is covered by the 5 s/15 s pings. Cloud Run caps a request
  (so a socket) at 3600 s, counts each socket against `max_instance_request_concurrency` (max 1000), and
  sends SIGTERM with 10 s grace; the relay's handoff and 3 s client retry already handle restarts.
  The relay's own cap of 2,000 sockets per instance cannot be reached on Cloud Run (1,000).
- Body size: Cloud Run HTTP/1 requests are limited to 32 MiB, the backend accepts JSON up to 50 MB.
  Uploads above 32 MiB would start failing (Cloudflare free/pro already caps uploads at 100 MB).
- Latency: today API and relay run in Frankfurt (`fra`). Keep europe-west3 (Frankfurt) so players and
  Atlas stay close, unless Atlas is elsewhere (Unknowns).

## 8. Secrets and configuration (names only)

**Set on the DO app today (21 keys, all as plain `RUN_AND_BUILD_TIME` env, none marked SECRET):**
`MONGODB_URI`, `OPENAI_API_KEY`, `ML_ACCESS_TOKEN`, `FRONT_END_URLS`, `DO_SPACES_ENDPOINT`,
`DO_SPACES_CDN`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `MAIN_FE_DOMAIN`,
`INVALIDATE_CACHE_SECRET`, `IS_PROD`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `GOOGLE_AI_API_KEY`,
`STRIPE_WEBHOOK_SECRET`, `GTM_ID` (unused), `FB_PRIVATE_KEY`, `SENDGRID_API_KEY`, `PRINTIFY_API_KEY`,
`SHELTER_DONATE_PRIVATE_KEY`.

Observations on that list (not fixed here, reported):
- Secrets are stored as general env vars (type not `SECRET`), so they are visible in the app spec to
  anyone with read access to the DO team. On GCP they go to Secret Manager.
- `NODE_ENV` is not in the spec; production behaviour (mainnet defaults for the shelter rail and crypto
  checkout, crons on, live-only Stripe) relies on the buildpack setting `NODE_ENV=production`. A
  container on GCP must set `NODE_ENV=production` explicitly, otherwise the backend silently switches to
  Arc **testnet** and turns the guest and impact jobs off.
- Not set on DO although the code reads them: `PAWLEGENDS_PARTY_TICKET_SECRET` (party rooms run
  unscored), `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`, `BADCAT_STRIPE_WEBHOOK_SECRET`, `CLUB_STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CLUB_PRICE_MONTH/YEAR`, `BADCAT_VAPID_*`, `SENDGRID_FROM_EMAIL`, `IMPACT_JOBS_ENABLED`,
  `SHELTER_RELAY_*`, `SHELTER_MATCH_*`, `SHELTER_X402_EXACT_*`, `AI_UPLOAD_IP_SALT`, `APPLE_*`. The
  migration should carry the current set 1:1 and add new ones only on the founder's decision.

**Backend secrets (Secret Manager candidates):** `MONGODB_URI`, `FB_PRIVATE_KEY`, `OPENAI_API_KEY`,
`GOOGLE_AI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLUB_STRIPE_WEBHOOK_SECRET`,
`CLUB_TOKEN_SECRET`, `BADCAT_STRIPE_SECRET_KEY`, `BADCAT_STRIPE_WEBHOOK_SECRET`, `BADCAT_ENTITLEMENT_SECRET`,
`BADCAT_VAPID_PRIVATE_KEY`, `PAWLEGENDS_STRIPE_SECRET_KEY`, `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`,
`PAWLEGENDS_ENTITLEMENT_SECRET`, `PAWLEGENDS_PARTY_TICKET_SECRET`, `RAVE_STRIPE_WEBHOOK_SECRET`,
`SENDGRID_API_KEY`, `PRINTIFY_API_KEY`, `DO_SPACES_KEY`, `DO_SPACES_SECRET` (become GCS HMAC keys),
`INVALIDATE_CACHE_SECRET` (**seeds the AES key of custodial Stellar wallet secrets: must be copied
exactly, never rotated**), `SHELTER_DONATE_PRIVATE_KEY` (hot wallet, signs on 7 mainnets),
`SHELTER_TRY_PRIVATE_KEY`, per-chain keys named by `SHELTER_CHAIN_<id>_KEY_ENV`, `SHELTER_RELAY_IP_PEPPER`,
`SHELTER_TREAT_IP_SALT`, `AI_UPLOAD_IP_SALT`, `SHELTER_X402_FACILITATOR_AUTH`, `APPLE_PRIVATE_KEY`,
`ML_ACCESS_TOKEN`.

**Backend plain config:** `PORT`, `NODE_ENV`, `IS_PROD`, `FRONT_END_URLS`, `MAIN_FE_DOMAIN`, `TRUST_PROXY`,
`DO_SPACES_ENDPOINT`, `DO_SPACES_NAME`, `DO_SPACES_CDN`, `STRIPE_PUBLISHABLE_KEY`, `SENDGRID_FROM_EMAIL`,
`CRONS_ENABLED`, `IMPACT_JOBS_ENABLED`, `IMPACT_CDN_*`, `SHELTER_CHAIN_ID`, `SHELTER_NETWORK`,
the remaining `SHELTER_*`, `CRYPTO_PAY_*`, `RAVE_*`, `CLUB_*`, `BADCAT_*` URLs and limits, `PAWLEGENDS_PUBLIC_URL`,
`AI_*` budgets, `YOURCAT_*`, `PORTRAIT_*`, `TAILS_*`, `STELLAR_*`, `APPLE_TEAM_ID/KEY_ID/CLIENT_ID/AUDIENCE`,
`AUTH_*`, `APP_CHECK_ENFORCE`, `NEW_ACCOUNTS_PER_IP_PER_HOUR`, `GUEST_SESSIONS_PER_IP_PER_HOUR`,
`DISPOSABLE_EMAIL_DOMAINS`, `MONGO_TRANSACTIONS`, `IDENTITY_BACKFILL_DONE`, `TAILS_EARNED_BACKFILL_DONE`.
Full groups: docs/BACKEND.md "Environment variables".

**Client build-time (`NEXT_PUBLIC_*`, inlined, public):** `NEXT_PUBLIC_BE_URL`, `NEXT_PUBLIC_IS_PROD`,
`NEXT_PUBLIC_IS_APP`, `NEXT_PUBLIC_DOMAIN`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_PROXY`, `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`, `NEXT_PUBLIC_AI_URL`,
`NEXT_PUBLIC_IMPACT_URL`, `NEXT_PUBLIC_WALLET_DONATE`, `NEXT_PUBLIC_WALLET_DONATE_CHAIN(S)`,
`NEXT_PUBLIC_HEIST_*`, `NEXT_PUBLIC_PAWLEGENDS*`, `NEXT_PUBLIC_SWORDCAT*`, `NEXT_PUBLIC_YOURCAT_ENTRY`,
`NEXT_PUBLIC_THEME`, `NEXT_PUBLIC_SNOWFALL`, `NEXT_PUBLIC_FB_APP_ID`, `NEXT_PUBLIC_FB_PAGES`,
`NEXT_PUBLIC_TWITTER_PAGE`, `NEXT_PUBLIC_CAPTURE`, `NEXT_PUBLIC_E2E`; server-side at build:
`FIREBASE_AUTH_ORIGIN`. The client reads `.env.production` (committed) plus Vercel project env; the Vercel
env list was not read.

**CMS:** `NEXT_PUBLIC_BE_URL`, `NEXT_PUBLIC_THEME`.

**GitHub Actions secrets:** `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_API_TOKEN`, `DO_CDN_ENDPOINT_ID`;
variable `FACTS_IMPACT_URL`. For GCP: replace with Workload Identity Federation (no JSON keys) and a
deployer service account; `cdn-sync.yml` would target GCS.

**Off-repo / local:** treat agent `ANTHROPIC_API_KEY`, `TREAT_AGENT_*`; motored runner key files under
`~/.tokentails-wallets/` and `MOTORED_CONFIRM_MAINNET`; Foundry keystores. Not part of the cloud
migration unless the jobs move.

## 9. Domains and DNS records to repoint

| Hostname | Today (origin behind Cloudflare) | After |
|---|---|---|
| `api.tokentails.com` | DO App Platform (default ingress `*.ondigitalocean.app`) | GCP LB IP (or Cloud Run domain mapping); keep orange cloud. Also used in NFT `tokenURI`, `CLUB_API_PUBLIC_URL`, `BADCAT_API_PUBLIC_URL`, `BADCAT_SHORT_LINK_BASE` defaults, mobile builds |
| `tokentails.com`, `www.tokentails.com` | Vercel `cats` | GCP LB (client + static buckets) if the website moves |
| `cats.tokentails.com` | Vercel `tokentails-cms` (CORS-allowed) | Cloud Run CMS if it moves |
| `test.tokentails.com` | unknown target (CORS-allowed) | decide |
| Spaces CDN hosts (`*.fra1.cdn.digitaloceanspaces.com`) | DO | **cannot be repointed** (DO-owned names); keep the Spaces CDN alive read-only, or put a `cdn.tokentails.com` in front and migrate stored URLs gradually |
| MX/SPF/DKIM (Zoho, SendGrid, Google site verification) | Cloudflare DNS | unchanged |

Firebase Auth authorised domains and App Check (reCAPTCHA Enterprise) site key domains must include
every new hostname, and the Firebase auth proxy rewrite keeps working only on the client host.

## 10. Build and release pipeline

- Backend: DO builds from GitHub `main` on push (no Dockerfile in the repo). For GCP: a Dockerfile for
  `backend/` (Node 22, `npm ci`, `nest build`, `sharp` prebuilt for linux-x64), Artifact Registry, Cloud
  Build trigger or GitHub Actions with Workload Identity Federation. Order constraints from DEPLOYMENT.md
  stay: backend before client when the sim or `/live` contract changes; vendored sims must match.
- Client and CMS: Vercel Git builds today. On GCP: container `next start` (or standalone output) per
  app, built with the right `.env.production`; `next-sitemap` needs the backend reachable during the build.
- `cdn-sync.yml` (Spaces) and `catnip-heist-pages.yml` (GitHub Pages) stay on GitHub Actions.
- Mobile: unchanged (Fastlane, Xcode Cloud).
- Migrations: `migrate-mongo` scripts live on developer machines only; data scripts are run by a person.

## 11. Statefulness and horizontal-scaling summary

| Component | Durable state | In-process state | Horizontal | Needs |
|---|---|---|---|---|
| API (HTTP) | MongoDB, Spaces | caches, throttlers | yes (accepted divergence) | min 1 instance, CPU always on for crons |
| Cron jobs | Mongo leases | rave cursor, traction counts | yes (leased) | process up between requests |
| Party relay | Mongo checkpoints (rooms, parties) | parties, rooms, sockets, tokens | **no** (single owner; needs affinity or sharded codes) | dedicated CPU, 1 instance or shard routing, long timeouts |
| Replay verify | none | worker threads | yes | CPU |
| Client web | none (ISR cache) | ISR | yes | Node runtime |
| Static games | bucket | none | yes | CDN |
| CMS | none | none | yes | – |
| MongoDB | all | – | managed (Atlas) | same region as compute |
| Object storage | all uploads | – | managed | URL continuity |

## 12. "No lag in multiplayer": what the inventory implies

1. Run the relay on its own service, not on the shared 1 vCPU API box: today the referee worker pool is a
   single worker sharing one core with the HTTP API, crons and replay verification, and the relay refuses
   rooms when event-loop p99 exceeds 20 ms.
2. Exactly one relay owner per party: one relay instance (scale up, not out) until shard-prefixed codes
   exist. This also fixes today's 2-instance `party_not_found` split on DO.
3. CPU always allocated, no scale-to-zero, no CPU throttling between frames, `perMessageDeflate` stays off,
   TCP_NODELAY stays on (defaults).
4. Same region as the players and Atlas (europe-west3), premium network tier.
5. Keep Cloudflare in front for `cf-connecting-ip` and WebSocket proxying, but route `/pawlegends/ws` to
   the relay backend with a 3600 s timeout and session affinity.
6. After the move, run `mp/load.mjs` on the chosen machine type and replace `MAX_LIVE_ROOMS = 60` with the
   measured value (MULTIPLAYER.md section 3.3).

## Unknowns

See the structured list returned with this file; the same items:

- MongoDB host and region (Atlas assumed from `$search`; tier, cloud provider, region, IP access list,
  backup policy and whether it is a replica set are not visible without reading the connection string).
- Contents and users of the `tokentails-apps` Space in sfo3 (no reference in this repo).
- Whether "full migration" includes moving the Vercel projects (`cats`, `tokentails-cms`, landing lab,
  pitch, Pawlegends experiments) or only the DigitalOcean backend and Spaces.
- Vercel project env var names for `cats` and `tokentails-cms` (not read).
- What `test.tokentails.com` points to.
- Whether the faucets (`stellar-fuel`, `sfuel`) or the Soroban RPC node still need to run anywhere.
- Whether the treat agent / Match Desk or a motored-event round 4 should run unattended in the cloud.
- Current Cloudflare settings (SSL mode, Authenticated Origin Pulls, WAF rules, IP geolocation, any
  Transform Rule such as the planned `x-tt-origin-auth`).
- Target GCP project id, billing account and organisation (must not be `motored-497708`).
- Production traffic and party-play concurrency numbers to size the relay.
