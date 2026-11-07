# Token Tails on Google Cloud: migration runbook

How to move the backend API, the Pawlegends party relay, the website and the CMS from DigitalOcean and Vercel to
Google Cloud, one region (europe-west3, Frankfurt), with Cloudflare staying in front. What runs today is in
[INVENTORY.md](INVENTORY.md). Everything in this folder was built and tested **without touching a cloud**; every
billable step below is yours to run, in your own terminal.

Contents: [Architecture](#architecture) · [Guardrails](#guardrails) · [What is in this folder](#what-is-in-this-folder) ·
[Testing without a cloud](#testing-without-a-cloud) · [Migration steps](#migration-steps) · [Deploys](#deploys) ·
[Operations](#operations) · [Cost](#cost) · [Decisions and defaults](#decisions-and-defaults) ·
[Known gaps](#known-gaps-and-things-to-verify-on-the-first-apply)

## Architecture

```
players, browsers, apps
        │  (DNS, proxy, WAF, cache; SSL Full (strict); cf-connecting-ip)
    Cloudflare
        │
 regional external ALB  europe-west3  (static IP, Certificate Manager cert, Cloud Armor: Cloudflare ranges only)
  ├─ api.tokentails.com, gcp-api.*   /pawlegends/ws, /pawlegends/ws/*  ──► relay VM  (MIG of 1, t2d-standard-2, COS,
  │                                                                          BACKEND_ROLE=relay, HTTP/1.1, 24 h sockets)
  │                                  everything else                   ──► Cloud Run tt-api (BACKEND_ROLE=api, crons)
  ├─ tokentails.com, www, gcp.*      ──► Cloud Run tt-web  (Next standalone)
  └─ cats.tokentails.com, gcp-cats.* ──► Cloud Run tt-cms
        any host + header x-tt-canary: 1 ──► the revision tagged `canary` (pre-traffic smoke tests)

 egress (Cloud Run direct VPC egress, relay VM) ──► Cloud NAT, one static IP ──► MongoDB Atlas, RPCs, Stripe, ...
 stays where it is: MongoDB Atlas, Firebase news-ccd33, SendGrid, Zoho, DigitalOcean Spaces (read-only URLs)
```

Why the relay is a VM and not Cloud Run: no 60-minute socket cap (a party can last 3 h), no 1,000-socket cap, no 10 s
SIGTERM limit, and a stop-then-start order, so the relay's existing handoff (SIGTERM checkpoints rooms to Mongo) and
`restore()` at boot work unchanged. On Cloud Run the new revision boots before the old one hands off, so `restore()`
would find nothing. One VM owns every party, so there is no session affinity to get wrong.

Client IP: Cloudflare sets `cf-connecting-ip`; the backend's peer is the ALB proxy-only subnet (10.129.0.0/23) for the
relay or Cloud Run's link-local hop for the API. `backend/src/shared/trust-proxy.ts` already trusts both, so the relay's
`clientIp()` and `shared/client-ip.ts` see the real player with **no code change**. Cloud Armor admits only Cloudflare
and Cloud Run ingress is load-balancer-only, so the header cannot be forged from outside. That closes the
`cf-connecting-ip` forgery known issue in docs/BACKEND.md once DigitalOcean is gone. **Never** move the relay behind a
global ALB without adding the GFE ranges (35.191.0.0/16, 130.211.0.0/22) to trust-proxy.

## Guardrails

- The project is **`tokentails-prod`** on the founder's own billing account. The gcloud default on the founder's
  Mac is `motored-497708`, which belongs to another company: **never target it**. Terraform's `project_id` has no
  default and a validation refuses anything that is not `tokentails-*` (and that id by name); `bootstrap/` does the
  same; `deploy-gcp.yml`, `deploy-run.sh` and `deploy-relay.sh` refuse any other project; `preflight.sh` refuses to run
  when an env var or tfvars file targets it.
- Use a separate gcloud configuration for every command in this runbook, so a missing `--project` can never land on
  the other company's project:

  ```bash
  gcloud config configurations create tokentails --no-activate
  export CLOUDSDK_ACTIVE_CONFIG_NAME=tokentails          # in each shell you use for Token Tails
  gcloud config set project tokentails-prod
  gcloud config set compute/region europe-west3
  gcloud auth login                                     # the founder's Token Tails Google account
  gcloud config get project                             # must print tokentails-prod
  ```
- Terraform creates secret **containers and IAM only**, never secret versions. Values are added by you with
  `gcloud secrets versions add` (step 3). Terraform state never holds a secret value.
- No automatic billing shutdown: the budget only emails.
- House rules: no feature flags (`BACKEND_ROLE` is a process role, not a flag), fix forward instead of rolling back.

## What is in this folder

| Path | What |
|---|---|
| `terraform/bootstrap/` | The versioned, private state bucket `tokentails-prod-tfstate` (local state, run once) |
| `terraform/envs/prod/` | The production stack: `main.tf`, `variables.tf` (validations), `versions.tf` (google and google-beta `~> 6.0`, terraform `>= 1.9`), `backend.tf` (partial GCS config), `terraform.tfvars.example` |
| `terraform/modules/` | `project_services`, `network` (VPC, subnet, proxy-only subnet, router, NAT + static IP, firewall), `artifact_registry`, `secrets`, `service_accounts`, `cloud_run_service`, `cloud_run_job` (`tt-migrate`), `relay_vm` (template, cloud-init, regional MIG, health checks, autohealing), `edge_lb_regional` (IP, cert, NEGs, backends, URL map, proxy, forwarding rule, Cloud Armor), `wif_github`, `monitoring` (log metrics, uptime checks, alerts, latency SLO), `budget`, `static_assets` (private media bucket, off by default) |
| `tests/` | `terraform test` suites with mocked providers (no credentials): `prod.tftest.hcl`, `guard.tftest.hcl`, `bootstrap/` |
| `tools/ws-latency.mjs` | Relay latency check: N sockets, hello/welcome and ping/pong p50/p95/p99; also the forged-header test |
| `tools/ws-origin-shim.mjs` | Lets `pawlegends/tests/e2e/mp/load.mjs` run against a production-mode relay (Origin header, `/healthz` counters) |
| `scripts/preflight.sh` | Every offline check below in one command |
| `scripts/deploy-run.sh`, `scripts/deploy-relay.sh` | Called by `.github/workflows/deploy-gcp.yml` |
| `../../backend/Dockerfile`, `../../client/Dockerfile`, `../../cms/Dockerfile` | Images (multi-stage, non-root, tini, `PORT`) |

Backend changes for deployment only: `BACKEND_ROLE` (`all` default = DigitalOcean unchanged, `api`, `relay`) in
`backend/src/shared/runtime/`, `backend/src/relay.module.ts`, `GET /healthz` and `GET /readyz`, a one-line-a-minute
`relay_stats` JSON log, and a startup check that exits a split role when `IS_PROD` is set without `NODE_ENV=production`.
`client/next.config.js` and `cms/next.config.ts` build `output: "standalone"` for the web (the Capacitor app build is
still a static export).

## Testing without a cloud

```bash
infra/gcp/scripts/preflight.sh          # guard, fmt, init -backend=false + validate (every root and module),
                                         # terraform test (mocked), static guards, tflint, trivy, cloud-init schema,
                                         # tool tests, actionlint
infra/gcp/scripts/preflight.sh --all    # + backend lint/build/tests, backend image build, local smoke on mongo:7
```

What the runs assert (all passing on 2026-11-07):

- **Project guard**: `motored-497708`, `acme-prod` and `tokentails` are refused; `tokentails-prod` is accepted.
- **Relay**: MIG size ≥ 1, never two at once (`max_surge 0`), `MIGRATE` on host maintenance, no external IP, Shielded
  VM, autoheal delay ≥ 120 s, `NODE_ENV=production` + `BACKEND_ROLE=relay`, systemd unit with `docker stop -t 60`, no
  konlet.
- **API**: ingress internal-and-cloud-load-balancing, default URL disabled, min instances ≥ 1, CPU always allocated
  (no throttling), `NODE_ENV=production`, all egress through NAT; web and CMS also LB-only.
- **Edge**: relay backend `HTTP` (HTTP/1.1), timeout 86,400 s (≥ 3,600), no session affinity, draining 600 s;
  `/pawlegends/ws` exact and `/pawlegends/ws/` prefix go to the relay first; Cloud Armor on all 7 backends, default
  rule `deny(403)`, ≤ 10 ranges per rule, every Cloudflare v4 and v6 range admitted once, a per-IP throttle on
  `/pawlegends/ws`; the ranges match `backend/src/shared/cloudflare-ips.ts`.
- **Secrets and IAM**: no `google_secret_manager_secret_version` anywhere; hot-wallet keys (`SHELTER_DONATE_PRIVATE_KEY`,
  `INVALIDATE_CACHE_SECRET`, `SHELTER_TRY_PRIVATE_KEY`) readable by `sa-api` only; `sa-relay` reads only the relay's
  keys; web, CMS and CI read none; no owner/editor/project-wide secret access; sa-deploy's IAP and OS Login rights are
  conditioned to SSH on `tt-relay*`; WIF pinned to `zbagdzevicius/tokentails`, repo id `835381356`, `refs/heads/main`.
- **Network**: health checkers only on 8080 to the relay tag, player traffic only from the proxy-only subnet, SSH only
  from IAP. **Regions** follow `var.region` everywhere. **Buckets**: state and media buckets enforce public access
  prevention. **Budget**: 50/90/100 % actual and 100 % forecast.
- **Images and roles (Docker, local)**: the backend image builds; `BACKEND_ROLE=relay` on `--cpus=2` answers
  `/healthz` and `/readyz`, maps only the health and relay routes, logs no cron; `ws-latency` gets 20/20 welcomes;
  `mp/load.mjs` runs rooms through it; `BACKEND_ROLE=api` maps 280 routes and answers `/pawlegends/ws` with 404 (no
  relay, no stray `restore()`); SIGTERM stops the relay cleanly. The web image serves `/`, `/heist`, game builds,
  `/sitemap.xml`, `/feed/rss.xml` and ISR pages; the CMS image serves `/`.

Docker Desktop numbers are not a sizing result. `MAX_LIVE_ROOMS` is set from the run on the real VM (step 5).

## Migration steps

Times are Europe/Vilnius. Do the cutover flips in a quiet hour (live matches are few around 05:00–07:00).

### Step 0. Confirm MongoDB Atlas (before anything is created)

1. In Atlas, note the cluster's **cloud, region and tier**. The code needs Atlas (`$search`), so it stays.
2. Target: Atlas on **GCP europe-west3**. If it is elsewhere, move it first (Atlas "Edit configuration", cloud provider
   and region change is rolling) and watch the API on DigitalOcean for a day. Moving the app to Frankfurt while the
   database stays far away would add a round trip to every request.
3. Private Service Connect only if the tier is M10 or above, as a later phase. Until then the NAT static IP goes on the
   Atlas IP access list (step 4).

### Step 1. Project, billing, state bucket

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=tokentails
gcloud projects create tokentails-prod --name="Token Tails"          # no organization, or Token Tails' own
gcloud billing accounts list                                          # pick the founder's Token Tails account
gcloud billing projects link tokentails-prod --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config get project                                             # tokentails-prod
gcloud auth application-default login                                 # Terraform uses ADC
gcloud auth application-default set-quota-project tokentails-prod

cd infra/gcp/terraform/bootstrap
terraform init
terraform apply -var project_id=tokentails-prod                       # creates tokentails-prod-tfstate (versioned)
```

### Step 2. First images, then Terraform apply

Terraform creates the Cloud Run services, so the first images must exist. The registry is created by Terraform, so
apply in two passes:

```bash
cd infra/gcp/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars        # fill billing_account, alert_email; tags come next
terraform init -backend-config="bucket=tokentails-prod-tfstate" -backend-config="prefix=envs/prod"

# pass 1: APIs, registry, accounts, secrets containers, network (no services yet)
terraform apply -target=module.project_services -target=module.artifact_registry -target=module.service_accounts \
  -target=module.secrets -target=module.network -target=google_project_iam_custom_role.relay_deployer

# first images, pushed by you (or by a deploy-gcp.yml run once the WIF variables exist)
gcloud auth configure-docker europe-west3-docker.pkg.dev
SHA=$(git rev-parse HEAD); REG=europe-west3-docker.pkg.dev/tokentails-prod/tokentails
docker build --platform linux/amd64 -t $REG/backend:$SHA backend && docker push $REG/backend:$SHA
docker build --platform linux/amd64 --secret id=public_env,src=public.env -t $REG/web:$SHA client && docker push $REG/web:$SHA
docker build --platform linux/amd64 --secret id=public_env,src=public-cms.env -t $REG/cms:$SHA cms && docker push $REG/cms:$SHA
# set backend_tag, web_tag, cms_tag = $SHA in terraform.tfvars
```

`public.env` holds the web's `NEXT_PUBLIC_*` values as `KEY='value'` lines (names in docs/CLIENT.md; they are public,
they ship in the browser bundle). The committed `client/.env.production` is the fallback, as on Vercel.

**Before pass 2, add the secret values (step 3)**: Cloud Run refuses to create a revision whose pinned secret version
does not exist.

```bash
terraform plan -out tfplan        # read it: nothing outside tokentails-prod, no secret values
terraform apply tfplan
terraform output                  # lb_ip, nat_ip, dns_authorization_records, workload_identity_provider, ...
```

### Step 3. Secret values (you, in your own terminal)

One secret per env key, same names as today. Copy each value **byte for byte** from the DigitalOcean app (App
Platform > Settings > Environment, or `doctl apps spec get` in your own terminal). Never paste a value into a chat, a
file in the repo, or shell history:

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=tokentails
add() { printf 'value for %s: ' "$1"; IFS= read -rs v; echo; printf '%s' "$v" | gcloud secrets versions add "$1" --data-file=- --project=tokentails-prod; unset v; }
add MONGODB_URI
# multi-line values (FB_PRIVATE_KEY): write to a temp file outside the repo, then
#   gcloud secrets versions add FB_PRIVATE_KEY --data-file=/path/to/tmpfile --project=tokentails-prod && rm -P /path/to/tmpfile
```

Carried over 1:1 from DigitalOcean (21, mounted on `tt-api`, version 1):
`MONGODB_URI`, `OPENAI_API_KEY`, `ML_ACCESS_TOKEN`, `FRONT_END_URLS`, `DO_SPACES_ENDPOINT`, `DO_SPACES_CDN`,
`DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `MAIN_FE_DOMAIN`, `INVALIDATE_CACHE_SECRET` (byte-exact, never
rotated), `IS_PROD`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `GOOGLE_AI_API_KEY`, `STRIPE_WEBHOOK_SECRET`,
`GTM_ID`, `FB_PRIVATE_KEY`, `SENDGRID_API_KEY`, `PRINTIFY_API_KEY`, `SHELTER_DONATE_PRIVATE_KEY`.

Empty containers for keys the code reads but DigitalOcean never set (you decide one by one; AI never generates
values): `PAWLEGENDS_PARTY_TICKET_SECRET`, `PAWLEGENDS_STRIPE_SECRET_KEY`, `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`,
`PAWLEGENDS_ENTITLEMENT_SECRET`, `BADCAT_STRIPE_SECRET_KEY`, `BADCAT_STRIPE_WEBHOOK_SECRET`,
`BADCAT_ENTITLEMENT_SECRET`, `BADCAT_VAPID_PRIVATE_KEY`, `CLUB_STRIPE_WEBHOOK_SECRET`, `CLUB_TOKEN_SECRET`,
`RAVE_STRIPE_WEBHOOK_SECRET`, `SHELTER_RELAY_IP_PEPPER`, `SHELTER_TREAT_IP_SALT`, `AI_UPLOAD_IP_SALT`,
`SHELTER_X402_FACILITATOR_AUTH`, `SHELTER_TRY_PRIVATE_KEY`, `APPLE_PRIVATE_KEY`.
To mount one on `tt-api` after you add its value, add it to `api_secret_versions` in `terraform.tfvars` (the full map:
the 21 keys plus the new one, each with its version) and apply.

The relay reads only `MONGODB_URI`, `PAWLEGENDS_PARTY_TICKET_SECRET` and `FRONT_END_URLS` (versions in
`relay_secret_versions`). The ticket secret must be the **same value on tt-api and the relay** (the API mints tickets,
the relay verifies them): when you set it, add it to `api_secret_versions` too. Until it is set, party rooms are
unscored, exactly as on DigitalOcean today. Relay secret values must be one line.

Rotation: add a new version, change the pinned version in `terraform.tfvars`, apply (a new Cloud Run revision picks
it up; the relay reads its pinned versions at every start, so `systemctl restart tt-relay` after the apply). Disable
the old version only after the new revision serves. Secret reads are in the Data Access audit log.

Plain (non-secret) env that DigitalOcean sets and Cloud Run must also get, if any is set there today: copy it into the
`env` map of `module "api"` in `envs/prod/main.tf`. Terraform already sets `NODE_ENV=production`, `BACKEND_ROLE=api`,
`NO_COLOR=1`.

### Step 4. DNS validation, Atlas access, GitHub

1. Certificate: for each row of `terraform output dns_authorization_records`, add the CNAME at Cloudflare **DNS only
   (grey cloud)**. The regional certificate covers `api`, `gcp-api`, `tokentails.com`, `www`, `gcp`, `cats`,
   `gcp-cats`. Wait until `gcloud certificate-manager certificates describe tt-edge-cert --location=europe-west3`
   shows `ACTIVE` (minutes to an hour).
2. Atlas: add `terraform output nat_ip` to the IP access list. Keep the current entries (DigitalOcean) until step 9.
3. GitHub repository variables (Settings > Secrets and variables > Actions > Variables; these are not secrets):
   `GCP_PROJECT_ID=tokentails-prod`, `GCP_WIF_PROVIDER` (= `terraform output workload_identity_provider`),
   `GCP_DEPLOY_SA` (= `sa-deploy@tokentails-prod.iam.gserviceaccount.com`), optional `GCP_REGION`, `GCP_API_HOST`,
   `GCP_WEB_HOST`, `GCP_CMS_HOST`, every `NEXT_PUBLIC_*` the web build needs, and `CMS_NEXT_PUBLIC_*` for CMS-only
   values. For the plan job: `TF_PROJECT_ID`, `TF_STATE_BUCKET`, `TF_BILLING_ACCOUNT`, `TF_ALERT_EMAIL`,
   `TF_BACKEND_TAG`, `TF_WEB_TAG`, `TF_CMS_TAG`, `GCP_TF_PLAN_SA` (`sa-tf-plan@...`). Create the GitHub environments
   `gcp-plan` and `gcp-prod` (with you as required reviewer).

### Step 5. Shadow hosts and tests (nothing user-facing changes)

At Cloudflare add **proxied** (orange) A records for `gcp-api`, `gcp` and `gcp-cats` → `terraform output lb_ip`. Add
`https://gcp.tokentails.com` to the `FRONT_END_URLS` secret (new version, pin it, apply), to Firebase Auth authorized
domains and to the App Check site's allowed domains. Then:

```bash
# health through Cloudflare
curl -s https://gcp-api.tokentails.com/healthz                 # {"ok":true,"role":"api","revision":...}
curl -s https://gcp-api.tokentails.com/readyz                  # 200, mongo true
curl -s https://gcp-api.tokentails.com/pawlegends/ws/healthz   # {"ok":true,"role":"relay"}: the route reaches the VM

# relay latency through Cloudflare (from your machine, then from a phone hotspot)
node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com --n 20 --pings 30
node infra/gcp/tools/ws-latency.mjs https://api.tokentails.com --n 20 --pings 30     # DigitalOcean today, to compare

# forged client IP straight at the LB address: Cloud Armor must answer 403 (only Cloudflare may connect)
node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com --connect "$(terraform -chdir=infra/gcp/terraform/envs/prod output -raw lb_ip)" \
  --header cf-connecting-ip:203.0.113.7 --expect-status 403 --insecure
curl -sk -o /dev/null -w '%{http_code}\n' --resolve gcp-api.tokentails.com:443:<lb_ip> https://gcp-api.tokentails.com/healthz   # 403
```

Then, in order:

1. **e2e and Stripe test mode**: point a client build (or Playwright, `client/e2e`) at `gcp-api` / `gcp`; send Stripe
   test-mode webhooks to `https://gcp-api.tokentails.com/...` (same paths as today) and check they verify.
2. **Load test on the real VM** to set `MAX_LIVE_ROOMS` (`backend/src/pawlegends/party/party-limits.ts`): one machine
   is one IP (50 sockets, 16 rooms), so run from 3–4 hosts at once:
   ```bash
   cd pawlegends
   ORIGIN=https://tokentails.com RELAY=https://gcp-api.tokentails.com ROOMS=16 SECONDS=120 \
     node --import ../infra/gcp/tools/ws-origin-shim.mjs tests/e2e/mp/load.mjs
   ```
   Raise the total until `turn_overrun_ms_p99` or `loop_delay_p99` breaks budget (overrun < 5 ms, loop < 15 ms), take
   70 % of the last good room count (30 % headroom), set it in `party-limits.ts` (a backend PR, coordinated with the
   netcode workflow) and in `max_live_rooms` (alerts at 80 %). If t2d-standard-2 cannot hold the expected peak, set
   `relay_machine_type = "t2d-standard-4"` and apply (the MIG replaces the VM; do it in a quiet hour).
3. **Per-IP test from 2 networks**: open a party from Wi-Fi and join from mobile data; the relay log
   (`gcloud compute ssh` + `docker logs tt-relay`, or Logs Explorer) must show two distinct `ipKey`s. One `ipKey` for
   both means the client IP is not reaching the relay: stop and check `TrustProxy` log lines.
4. **Relay restart drill**: start a guest match, then run the relay deploy (`deploy-gcp.yml` with `targets=relay-only`,
   `relay=yes`) or on the VM `sudo systemctl restart tt-relay`. Clients must get `room_gone`, reconnect in 3–15 s and
   continue the same match (`restored` in the log).
5. **65-minute soak**: keep one party socket open in a lobby for 65 minutes through Cloudflare (proves no 60-minute
   cap anywhere on the path): `node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com --n 2 --pings 800 --gap 5000`
   (about 67 min), with zero errors.

Crons: `tt-api` runs all 26 leased jobs; with DigitalOcean still running, both pick jobs from the same Mongo
`jobruns` leases, so each tick runs once. Keep this overlap short (hours, not days): the traction refresh has no lease
and the `rave-stripe-events` cursor is per process.

### Step 6. API and relay cutover (quiet hour)

1. Cloudflare: lower nothing (proxied records switch in seconds). Edit `api.tokentails.com`: from the DigitalOcean
   CNAME to an A record → `lb_ip`, **proxied**. API and relay move together. Hostnames never change, so NFT
   `tokenURI`s, Stripe webhooks and installed apps keep working.
2. Watch for 15 minutes: `curl https://api.tokentails.com/healthz` (role api), `/pawlegends/ws/healthz` (role relay),
   Cloud Run request logs, `ws-latency` against `api.tokentails.com`.
3. DigitalOcean: scale `tokentails-backend` to **1 instance** and turn **auto-deploy off** (App Platform settings).
   The scale-down sends SIGTERM: those rooms hand off to Mongo. Then on GCP adopt them:
   `gcloud compute ssh <relay vm> --zone <zone> --tunnel-through-iap --command 'sudo systemctl restart tt-relay'`
   (`restored N room(s)` in the log). Players resume within the 120 s window.
4. If something is wrong, fix forward on GCP. A DNS flip back to the DigitalOcean CNAME is possible for 14 days and
   takes seconds, but rooms would hand off again; prefer a fix.

### Step 7. Web and CMS cutover (about a week later)

1. Cloudflare Cache Rules (keep for a year at the edge): `/_next/static/*`, the game build folders
   (`/heist-game/*`, `/badcat-game/*`, `/formula-meow-game/*`, `/ultracat-game/*`, `/meowrun-game/*`,
   `/pawlegends-game/*`, `/swordcat-game/*`) and `/home/media/*`. Origin headers already mark the immutable ones.
2. Flip `tokentails.com`, `www` and `cats.tokentails.com` from Vercel to `lb_ip` (proxied A records).
3. Check: home, `/heist`, `/pawlegends`, a cat page, `/impact`, login (Firebase), a Stripe test checkout, the CMS login.
4. Leave Vercel projects `cats` and `tokentails-cms` running for 14 days (no deletes yet). The Pawlegends landing
   experiments, `tokentails-landing-lab` and `tokentails-pitch` stay on Vercel (or are retired).

### Step 8. Atlas lock-down

After step 9, remove `0.0.0.0/0` and the DigitalOcean entries from the Atlas access list, leaving only the NAT IP.

### Step 9. Decommission (after 14 clean days)

1. Delete the DigitalOcean app `tokentails-be` (after a last `doctl apps spec get` saved privately, keys only).
2. Delete the Vercel projects `cats` and `tokentails-cms`.
3. **Keep DigitalOcean Spaces** (`tokentails-nfts`, `tokentails`, `tokentails-apps`): stored URLs, NFT metadata and
   installed apps point at it. New uploads move to GCS behind `cdn.tokentails.com` only as a separate, later step
   (`static_bucket_enabled = true`).
4. Update docs/ARCHITECTURE.md, docs/BACKEND.md (Deployment, Known issues: the `cf-connecting-ip` forgery is closed)
   and CLAUDE.md (backend now on Google Cloud).

## Deploys

`.github/workflows/deploy-gcp.yml` is **manual (`workflow_dispatch`) until the cutover**; then add `push: branches:
[main]` with path filters. Until then DigitalOcean and Vercel keep deploying from their integrations.

- Order: backend tests → backend image `backend:<sha>` (built once, tags are immutable) → `tt-api` → relay (if
  changed) → web → CMS.
- Cloud Run (`scripts/deploy-run.sh`): `gcloud run deploy --no-traffic --tag canary`, smoke through Cloudflare and the
  LB with `x-tt-canary: 1` (the API's `/healthz` must name the new revision), `update-traffic` to 100 %, smoke again.
  A failed canary leaves traffic untouched. Rollback exists (`gcloud run services update-traffic tt-api
  --to-revisions <old>=100`), but the house rule is fix forward.
- Relay (`scripts/deploy-relay.sh`), only when relay files changed since the running image or with `relay=yes`, in a
  quiet hour: set the image on the MIG (so an autoheal also comes up on it), refresh the VM metadata, then over IAP
  SSH run `/var/lib/tt-relay/deploy.sh`: pre-pull, `POST /pawlegends/relay/drain` and wait up to 30 min for live rooms
  to reach 0 **if the relay offers that endpoint** (the netcode workflow may add it; until then it is skipped), then
  `systemctl restart tt-relay` (`docker stop -t 60`: SIGTERM → handoff and checkpoint; the new container restores the
  rooms; clients resume in about 3–15 s), then wait for `/readyz`. API deploys never touch live matches.
- Migrations: `gcloud run jobs execute tt-migrate --region europe-west3 --project tokentails-prod --wait` (runs `npx
  migrate-mongo up` in the backend image currently set on the job; update the job image first with `gcloud run jobs
  update tt-migrate --image ...`).
- Terraform: `terraform.yml` checks every PR; plan on main as `sa-tf-plan`; apply locally (or the gated job with
  `ci_apply_enabled = true`). Terraform ignores Cloud Run images, traffic and the relay image metadata: CI owns those.

## Operations

- **Logs**: Cloud Run logs per service; relay container logs under `resource.type="gce_instance"`,
  `logName:"cos_containers"`. Health-check request logs are excluded.
- **Log-based metrics**: `relay_loop_p99_ms`, `relay_rooms_live` (from the per-minute `relay_stats` line),
  `relay_events` by name (`refused_busy`, `checkpoint_lost`, `restored`, `party_not_found`, `mp_verify_failed`
  (desync), ...), `cron_lease_failures`, `armor_denied`.
- **Uptime checks** through Cloudflare: `api /healthz`, `/pawlegends/ws/healthz` (the relay route), `tokentails.com /`.
- **Alerts** (email to the founder): relay loop p99 > 15 ms for 5 min; live rooms > 80 % of `max_live_rooms`; relay
  CPU > 70 % for 10 min; relay autohealed/recreated; refused rooms or lost checkpoints; tt-api 5xx > 2 %; p95 > 1.5 s;
  latency SLO (95 % under 1.5 s, 28 days) burning > 10× over 1 h; tt-api at max instances; NAT allocation failures;
  Cloud Armor denials spike; uptime failures; leased cron failures.
- **Relay VM by hand**: `gcloud compute ssh $(gcloud compute instance-groups managed list-instances tt-relay
  --region europe-west3 --format='value(name)') --tunnel-through-iap`, then `curl -s localhost:8080/healthz`,
  `sudo journalctl -u tt-relay -f`, `docker logs -f tt-relay`.
- **Scaling the relay**: `relay_machine_type = "t2d-standard-4"` (4 cores: 3 referee workers) and raise
  `MAX_LIVE_ROOMS` after a new load run. More regions (us-east4, asia-southeast1) are a `relay_vm` module instance
  per region behind its own regional ALB, after the netcode workflow ships region-prefixed party codes.
- **Phase 2** (separate changes): move the signer crons (treat reconcile, shelter-share keeper, paw settlement) into a
  min=max=1 service or job with its own `sa-signer`, so the public API holds no hot-wallet key; Private Service
  Connect to Atlas (M10+); new uploads to GCS + `cdn.tokentails.com`.

## Cost

europe-west3 list prices, today's scale, per month:

| Item | Monthly |
|---|---|
| Relay VM t2d-standard-2 | ~$79 (~$50 with a 1-year CUD) |
| tt-api, 1 vCPU / 2 GiB, always on | ~$75–95 |
| tt-web, min 1 | ~$30–45 |
| tt-cms (scales to zero) | ~$0–5 |
| Regional ALB (forwarding rule and proxy) | ~$20–40 |
| Cloud Armor | ~$10–15 |
| Cloud NAT and static IPs | ~$8–12 |
| Egress | ~$20–35 |
| Artifact Registry, Secret Manager, logging, monitoring | ~$5–15 |
| **Total** | **≈ $250–340** |

With the web staying on Vercel: about $210–290. Each extra relay region later: about $70–76. Budget alert: $400.

## Decisions and defaults

Each is a variable or a step above; the default is what the code does unless you change it.

| Question | Default (as built) | Where |
|---|---|---|
| Project, org and billing | New project `tokentails-prod` on the founder's own personal or Token Tails MB billing account, no organization (or Token Tails' own). Never Nortal's org or `motored-497708` | `project_id`, `billing_account` |
| Staging | No permanent staging. Create `tokentails-staging` with the same Terraform for the rehearsal (load test, soak, IP tests), then destroy it; the prod shadow hosts cover the final check | `project_id = "tokentails-staging"` |
| Region | europe-west3 (Frankfurt), the same metro as DigitalOcean fra. If Atlas is elsewhere, move Atlas to GCP europe-west3 first | `region`, `zones` |
| Database | Keep MongoDB Atlas on GCP europe-west3, NAT static IP on the access list, remove `0.0.0.0/0` after cutover; Private Service Connect only at M10+, phase 2 | step 0, step 8 |
| Move web and CMS off Vercel now? | Yes, phase 2 of the same migration, about a week after API and relay are stable; Vercel warm for 14 days; Pawlegends landing experiments, landing-lab and pitch stay on Vercel or retire | step 7 |
| DigitalOcean Spaces | Keep running, read-only, no URL changes; new uploads to GCS behind `cdn.tokentails.com` later, separately | `static_bucket_enabled = false` |
| Extra relay regions | EU only; add us-east4 and asia-southeast1 when > 15 % of a continent's parties have RTT p95 > 120 ms, after region-prefixed party codes | phase 3 |
| Budget and CUDs | $400/month alert at 50/90/100 % actual and 100 % forecast, no automatic shutdown; no committed-use discount until 2 months of steady usage | `budget_amount` |
| Keys the code reads but DigitalOcean never set | Carry the 21 DigitalOcean keys 1:1; empty containers for the rest; the founder decides one by one; AI never generates values | `do_secret_keys`, `extra_secret_keys` |
| Hot-wallet signing crons in their own service now? | No: they stay in tt-api, leased, for the cutover; split into a signer service with its own account in phase 2 | phase 2 |
| Relay deploy policy | Only when relay code changes or on manual dispatch, in a quiet hour; drain up to 30 min when the relay offers it, then restart; handoff and resume cover the rest | `deploy-gcp.yml` input `relay` |
| Relay machine | t2d-standard-2; t2d-standard-4 if the load run calls for it | `relay_machine_type` |
| `MAX_LIVE_ROOMS` | 60 (placeholder) until the load run on the VM, then 70 % of the measured limit | `party-limits.ts`, `max_live_rooms` |
| CI apply | Off: the founder applies locally | `ci_apply_enabled = false` |

## Known gaps and things to verify on the first apply

- **Not applied anywhere yet.** The Terraform is validated, linted, scanned and tested with mocked providers; a few
  things only a real API can confirm: the regional Cloud Armor throttle keyed on `cf-connecting-ip`, the serverless
  NEG `tag` (canary) on a regional ALB, the OS Login IAM condition on `resource.name`, and the uptime-check/SLO
  metric filters. Read the first `terraform plan` carefully and fix forward.
- The COS logging agent must parse the `relay_stats` lines into `jsonPayload` for the two relay metrics. If Logs
  Explorer shows them as `textPayload`, change those two metric filters to a `REGEXP_EXTRACT` on `textPayload`.
- The canary header route is reachable by anyone who sends `x-tt-canary: 1`; it only ever serves the revision about
  to go live (same code), but do not leave a broken canary tagged for long.
- `client/next.config.js` now builds `output: "standalone"` for the web. Vercel supports it; check the first Vercel
  deploy after this merges.
- `mp/load.mjs` lives in `pawlegends/` (owned by the netcode workflow); `tools/ws-origin-shim.mjs` adapts it from the
  outside instead of editing it. The drain endpoint `POST /pawlegends/relay/drain` is optional and not in the backend
  yet; `deploy.sh` skips the drain until it exists.
- Known backend issues listed at the end of docs/BACKEND.md are unchanged by this work, apart from the
  `cf-connecting-ip` forgery, which this topology closes at the edge once DigitalOcean is gone.
