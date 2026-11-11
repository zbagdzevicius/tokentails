# Token Tails on Google Cloud: migration runbook

How to move the backend API, the Pawlegends party relay, the website and the CMS from DigitalOcean and Vercel to
Google Cloud, one region (europe-west3, Frankfurt), with Cloudflare staying in front. What runs today is in
[INVENTORY.md](INVENTORY.md). Everything in this folder was built and tested **without touching a cloud**; every
billable step below is yours to run, in your own terminal.

Contents: [Architecture](#architecture) · [Guardrails](#guardrails) · [What is in this folder](#what-is-in-this-folder) ·
[Testing without a cloud](#testing-without-a-cloud) · [Staging](#staging-throwaway-rehearsal) · [Migration steps](#migration-steps) · [Deploys](#deploys) ·
[Operations](#operations) · [Cost](#cost) · [Decisions and defaults](#decisions-and-defaults) ·
[Known gaps](#known-gaps-and-things-to-verify-on-the-first-apply)

## Production status (2026-11-11, shadow phase)

Steps 1–3 are done in `gleaming-medium-480114-g5`; nothing user-facing changed (DigitalOcean still serves
`api.tokentails.com`, Vercel the web).

- Applied: bootstrap (state bucket `gleaming-medium-480114-g5-tfstate`), pass 1 (130 resources), pass 2 (90). A final
  `terraform plan` shows no changes. Nothing outside this stack was touched; the project's `default` network, n8n and
  `motored-dev` SQL were left as they are (deleting `default` is the founder's call in this shared project).
- Images: `backend` at `9f1ec6ce` (main with live-match deploys; `tt-api` revision `tt-api-00002-7t5`, relay committed
  in the MIG metadata), `web` and `cms` at `8b9d86d4` (linux/amd64, built from the committed `.env.production`; rebuild
  before the web cutover). The relay VM runs the blue/green template (`tt-relay@a|b`, control ports 9101/9102).
- Shadow run (08:12–09:25 UTC): 12 read-only API endpoints identical to DigitalOcean (status and body size; median
  35–50 ms vs 43–110 ms from the relay VM, both leaderboards ~1.7 s on both sides); 12 rounds of relay checks, 3
  sockets each, all 101; bot rooms of 3 delivered every TURN (15/s per client) for 30–150 s; a blue/green relay deploy
  during 2 live bot matches kept all 6 sockets and 900 TURNs per 10 s (`relay_drain_start` → `relay_drain_done` after
  126 s, parties handed off and restored); CPU p99 under 5 % (tt-api, relay VM), memory 10 %. Error logs match
  DigitalOcean's (testnet RPC `ENOTFOUND`/`SERVER_ERROR`, shelter-goal `RPC_-32602`/`HTTP_429`, the known
  shelter-share `execution reverted`). Leases alternate between DigitalOcean and tt-api as designed.
- The 21 DigitalOcean keys are version 1 of their secrets (piped from `doctl apps spec get`, never printed). The 17
  extra containers are empty: party rooms stay unscored, as on DigitalOcean.
- Live and checked: `tt-api` ready (`/readyz` mongo true and `/pawlegends/status` 200 from inside the VPC; leased crons
  share the Mongo leases with DigitalOcean), `tt-web`, `tt-cms` ready, relay `tt-relay-*` HEALTHY in the MIG,
  `/readyz` mongo true, guest hello/welcome and party create/join pass over an IAP tunnel.
- Egress (Cloud NAT) IP `34.141.46.203`; LB IP `34.107.92.132`. Atlas needed no change (the current access list
  admits the NAT IP); add `34.141.46.203` before step 8 removes `0.0.0.0/0`.
- Local `terraform.tfvars` (gitignored): `budget_currency = "EUR"`, `budget_amount = 600` (the whole-project budget
  also counts motored-dev SQL and n8n), and `web.min_instances = 0` while Vercel serves the web: set it back to 1 before
  step 7 (the `prod.tftest.hcl` web check expects 1).
- Org IAM: `roles/compute.osLoginExternalUser` for the founder's gmail on organization 933172974862 (IAP SSH to the
  relay). GitHub variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` are set (deploy-gcp.yml is
  manual-dispatch only).
- Open: Cloudflare (step 4.1 DNS authorization CNAMEs, grey cloud; step 5 proxied `gcp-api`, `gcp`, `gcp-cats` →
  `34.107.92.132`); the certificate stays PROVISIONING until then, so nothing has been measured through Cloudflare
  yet (step 5 and the `relay-ab.sh` gap are still to do). DigitalOcean still has `deploy_on_push` on, so every push to
  main redeploys it: never restart a relay slot within 3 minutes of a DigitalOcean deploy.

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
SIGTERM limit (no room to drain), and no revision swap that shuts instances down whatever sockets they hold. One VM owns
every party, so there is no session affinity to get wrong. Relay deploys are blue/green inside that VM: two processes
share the relay port (`SO_REUSEPORT`), the new one becomes ready, the old one drains and its live matches end there or
move to the new process in about a second (`docs/plans/moba/LIVE-MATCH-DEPLOYS.md`).

Client IP: Cloudflare sets `cf-connecting-ip`. The relay's peer is the ALB proxy-only subnet (10.129.0.0/23), a hop
`backend/src/shared/trust-proxy.ts` trusts, so the relay's `clientIp()` reads the header. **The API is different**: the
ALB appends its own public forwarding-rule address to X-Forwarded-For before Cloud Run, and Express stops at that
untrusted address, so `req.ip` / `req.ips[0]` on tt-api is the same balancer IP for every visitor. Everything per-IP
must therefore read `cf-connecting-ip` first: `shared/client-ip.ts` (`clientIp`, `visitorIp`) does; the new-account and
guest-session throttles and the donation relay hash were moved onto `visitorIp` in this branch (they read `req.ip`
directly, which would have made them one site-wide bucket of 10 accounts and 30 guests an hour). `visitorIp` reads the
header only in the split roles (`api`, `relay`); under role `all` (DigitalOcean, whose origin URL is reachable
directly) it keeps the Express address, so those caps cannot be forged there. Any new per-IP code must use
`clientIp`/`visitorIp`, never `req.ip`. Cloud Armor admits only Cloudflare and Cloud Run ingress is
load-balancer-only, so the header cannot be forged from outside. That closes the `cf-connecting-ip` forgery known issue
in docs/BACKEND.md once DigitalOcean is gone. **Never** move the relay behind a global ALB without adding the GFE ranges
(35.191.0.0/16, 130.211.0.0/22) to trust-proxy.

## Guardrails

- Production is the project **`gleaming-medium-480114-g5`** (already created by the founder) on the founder's own
  billing account; **`tokentails-staging`** is a throwaway project for the rehearsal ([Staging](#staging-throwaway-rehearsal)).
  The gcloud default on the founder's Mac is `motored-497708`, which belongs to another company: **never target it,
  nor any `motored-*` project**. Terraform's `project_id` has no default and a validation admits only the allow-list
  `gleaming-medium-480114-g5`, `tokentails-staging` and refuses anything starting with `motored` (`envs/prod` and
  `bootstrap/`; `envs/staging` admits `tokentails-staging` only); `deploy-run.sh`, `deploy-relay.sh`,
  `replace-relay.sh` and `cutover-relay.sh` refuse any project off that list; `deploy-gcp.yml` and `terraform.yml`
  accept the production project only; `preflight.sh` refuses to run when an env var or tfvars file targets a project
  off the list.
- Use an isolated gcloud state directory for every command in this runbook, so a missing `--project` (or a shell
  without the setup) can never land on the other company's project, and nothing here ever writes to the default
  `~/.config/gcloud`. In each shell you use for Token Tails:

  ```bash
  export CLOUDSDK_CONFIG="$HOME/.config/gcloud-tokentails"   # Token Tails' own gcloud state (accounts, ADC, config)
  export CLOUDSDK_CORE_PROJECT=gleaming-medium-480114-g5     # project and region from the environment: no `gcloud config set`
  export CLOUDSDK_COMPUTE_REGION=europe-west3
  gcloud auth login                                          # once: the founder's Token Tails Google account
  gcloud auth application-default login                      # once: Terraform's credentials, kept in $CLOUDSDK_CONFIG
  export GOOGLE_APPLICATION_CREDENTIALS="$CLOUDSDK_CONFIG/application_default_credentials.json"
  gcloud config get project                                  # must print gleaming-medium-480114-g5
  ```

  A shell without these exports uses the default gcloud state, which belongs to the other company: close it.
- Terraform creates secret **containers and IAM only**, never secret versions. Values are added by you with
  `gcloud secrets versions add` (step 3). Terraform state never holds a secret value.
- No automatic billing shutdown: the budget only emails.
- House rules: no feature flags (`BACKEND_ROLE` is a process role, not a flag), fix forward instead of rolling back.

## What is in this folder

| Path | What |
|---|---|
| `terraform/bootstrap/` | The versioned, private state bucket `gleaming-medium-480114-g5-tfstate` (local state, run once) |
| `terraform/envs/staging/` | The throwaway rehearsal stack in `tokentails-staging`: the same modules, no DNS (self-signed certificate, HTTP on :80, the operator's /32 in Cloud Armor), a mongo:7 VM instead of Atlas, deletion protection off, local state outside the repo ([Staging](#staging-throwaway-rehearsal)) |
| `terraform/envs/prod/` | The production stack: `main.tf`, `variables.tf` (validations), `versions.tf` (google and google-beta `~> 6.0`, terraform `>= 1.9`), `backend.tf` (partial GCS config), `terraform.tfvars.example` |
| `terraform/modules/` | `project_services`, `network` (VPC, subnet, proxy-only subnet, router, NAT + static IP, firewall), `artifact_registry`, `secrets`, `service_accounts`, `cloud_run_service`, `cloud_run_job` (`tt-migrate`), `relay_vm` (template, cloud-init, regional MIG, health checks, autohealing), `edge_lb_regional` (IP, cert, NEGs, backends, URL map, proxy, forwarding rule, Cloud Armor), `wif_github`, `monitoring` (log metrics, uptime checks, alerts, latency SLO), `budget`, `static_assets` (private media bucket, off by default) |
| `tests/` | `terraform test` suites with mocked providers (no credentials): `prod.tftest.hcl`, `guard.tftest.hcl`, `bootstrap/`, `staging/` |
| `tools/ws-latency.mjs` | Relay latency check: N sockets, hello/welcome and ping/pong p50/p95/p99; also the forged-header test |
| `tools/ws-origin-shim.mjs` | Lets `pawlegends/tests/e2e/mp/load.mjs` run against a production-mode relay (Origin header, `/healthz` counters) |
| `scripts/preflight.sh` | Every offline check below in one command |
| `scripts/deploy-run.sh`, `scripts/deploy-relay.sh` | Called by `.github/workflows/deploy-gcp.yml` |
| `scripts/staging-secrets.sh` | Throwaway secret values for `tokentails-staging` only (openssl rand, a fresh RSA key; never a production value) |
| `scripts/replace-relay.sh` | Rolls a changed relay instance template out: drains the relay (no new matches, live ones end, the rest hand off at 30 min), then replaces the VM |
| `scripts/cutover-relay.sh` | Step 6.3: hands DigitalOcean's live matches to the Google relay while you archive DigitalOcean |
| `../../backend/Dockerfile`, `../../client/Dockerfile`, `../../cms/Dockerfile` | Images (multi-stage, non-root, tini, `PORT`) |

Backend changes for deployment only: `BACKEND_ROLE` (`all` default = DigitalOcean unchanged, `api`, `relay`) in
`backend/src/shared/runtime/`, `backend/src/relay.module.ts`, `GET /healthz` and `GET /readyz`, a one-line-a-minute
`relay_stats` JSON log, and a startup check that exits a split role when `IS_PROD` is set without `NODE_ENV=production`.
`client/next.config.js` and `cms/next.config.ts` build `output: "standalone"` for the web images (the Capacitor app build
is still a static export; a Vercel build, `VERCEL=1`, keeps Next's default output).

## Testing without a cloud

```bash
infra/gcp/scripts/preflight.sh          # guard, fmt, init -backend=false + validate (every root and module),
                                         # terraform test (mocked), static guards, tflint, trivy, checkov, cloud-init schema,
                                         # tool tests, actionlint
infra/gcp/scripts/preflight.sh --all    # + backend lint/build/tests, backend image build, local smoke on mongo:7
```

What the runs assert (all passing on 2026-11-07):

- **Project guard**: `motored-497708`, `motored-dev`, `acme-prod`, `tokentails`, `tokentails-prod` and the look-alike
  `gleaming-medium-480114-g6` are refused; `gleaming-medium-480114-g5` and `tokentails-staging` are accepted;
  `envs/staging` refuses the production project, an operator range of `0.0.0.0/0` and real (non-`.test`) hostnames.
- **Relay**: MIG size ≥ 1, never two at once (`max_surge 0`), `MIGRATE` on host maintenance, no external IP, Shielded
  VM, autoheal delay ≥ 120 s, `NODE_ENV=production` + `BACKEND_ROLE=relay`, systemd template unit `tt-relay@a|b`
  with `docker stop -t 90` and `RELAY_DRAIN_MAX_MS=60000` (the SIGTERM drain ends 30 s before SIGKILL), blue/green
  `deploy.sh` (the new slot is ready before the old one drains), LB check `/readyz`, autoheal check `/healthz`, no
  konlet; `OPPORTUNISTIC` updates (a template change never replaces the VM by itself); env and secret pins in project
  metadata, not in the template; each slot runs the image `deploy.sh` wrote for it.
- **API**: ingress internal-and-cloud-load-balancing, default URL disabled, min instances ≥ 1, CPU always allocated
  (no throttling), `NODE_ENV=production`, all egress through NAT; web and CMS also LB-only.
- **Edge**: relay backend `HTTP` (HTTP/1.1), timeout 86,400 s (≥ 3,600), no session affinity, no connection draining
  (≤ 30 s: the relay drains itself);
  `/pawlegends/ws` exact and `/pawlegends/ws/` prefix go to the relay first; Cloud Armor on all 7 backends, default
  rule `deny(403)`, ≤ 10 ranges per rule, every Cloudflare v4 and v6 range admitted once, a per-IP throttle on
  `/pawlegends/ws`; the ranges match `backend/src/shared/cloudflare-ips.ts`.
- **Secrets and IAM**: no `google_secret_manager_secret_version` anywhere; hot-wallet keys (`SHELTER_DONATE_PRIVATE_KEY`,
  `INVALIDATE_CACHE_SECRET`, `SHELTER_TRY_PRIVATE_KEY`) readable by `sa-api` only; `sa-relay` reads only the relay's
  keys; web, CMS and CI read none; no owner/editor/project-wide secret access; sa-deploy's IAP and OS Login rights are
  conditioned to SSH on `tt-relay*`; sa-deploy has Cloud Run write rights only on `tt-api`, `tt-web`, `tt-cms` and
  `tt-migrate` (project-wide it can only read), never `compute.instances.setMetadata`; WIF pinned to
  `zbagdzevicius/tokentails`, repo id `835381356`, `refs/heads/main`, and sa-deploy only to
  `.github/workflows/deploy-gcp.yml@refs/heads/main`; the party ticket secret is one variable mounted on tt-api and the
  relay at the same version; sa-tf-plan can read the budget.
- **Network**: health checkers only on 8080 to the relay tag, player traffic only from the proxy-only subnet, SSH only
  from IAP. **Regions** follow `var.region` everywhere. **Buckets**: state and media buckets enforce public access
  prevention. **Budget**: 50/90/100 % actual and 100 % forecast.
- **Images and roles (Docker, local)**: the backend image builds; `BACKEND_ROLE=relay` on `--cpus=2` answers
  `/healthz` and `/readyz`, maps only the health and relay routes, logs no cron; `ws-latency` gets 20/20 welcomes;
  `mp/load.mjs` runs rooms through it; `BACKEND_ROLE=api` maps 280 routes and answers `/pawlegends/ws` with 404 (no
  relay, no stray `restore()`); both roles boot on a read-only root filesystem (`--read-only --tmpfs /tmp`,
  `PORT=8080`); SIGTERM with 20 players connected (10 in parties) closes every socket with `1012 restart` in about
  0.1 s and the relay exits in under a second (`tools/ws-sigterm.mjs`), well inside the 60 s `docker stop` grace; the
  API exits in under a second (Cloud Run allows 10 s). The web image serves `/`, `/heist`, game builds,
  `/sitemap.xml`, `/feed/rss.xml` and ISR pages; the CMS image serves `/`.
- **Second scanner**: checkov (66 passed, 4 skips justified inline: access-log buckets, CMEK on Artifact Registry, and
  a false positive on the WIF condition that it cannot resolve from a local).

Docker Desktop numbers are not a sizing result. `MAX_LIVE_ROOMS` is set from the run on the real VM (step 5).

## Staging (throwaway rehearsal)

`terraform/envs/staging` deploys the same modules into **`tokentails-staging`** to prove the setup works, then
everything is destroyed. Budget: under about $15, torn down within a few hours. What differs from production:

| | Production (`envs/prod`) | Staging (`envs/staging`) |
|---|---|---|
| Project | `gleaming-medium-480114-g5` | `tokentails-staging` only (validation) |
| Hosts and DNS | real hosts, Cloudflare, managed certificate (DNS authorization) | fake `*.staging.tokentails.test` hosts, no DNS; a self-signed certificate (Terraform `tls`), plain HTTP on :80 too |
| Cloud Armor | Cloudflare ranges only, default deny | the same rules plus the operator's own `/32` (`operator_cidrs`, never `0.0.0.0/0`), default deny |
| Cloud Run ingress | load balancer only | the same (reached through the load balancer IP) |
| Database | MongoDB Atlas | a throwaway `mongo:7` VM (`tt-mongo`, e2-small, COS, no external IP, no auth, port 27017 from the main subnet only, fixed IP 10.10.0.50) |
| Secrets | the founder's real values | throwaway values from `scripts/staging-secrets.sh` (openssl rand, a fresh RSA key as `FB_PRIVATE_KEY`); 6 secrets, each at version 1 |
| Sizes | api 1 vCPU/2 GiB min 1, web min 1, relay t2d-standard-2, 3 zones | api 1 vCPU/1 GiB min 1 max 1, web and cms min 0 max 1, relay e2-standard-2, one zone |
| CI, WIF, deploy/plan accounts, custom role | yes | none (the operator deploys with their own owner credentials) |
| Monitoring, budget | on | off by default (`monitoring_enabled`, `budget_enabled`) |
| Deletion protection | on | off; `force_destroy` on the optional media bucket |
| State | GCS bucket from `bootstrap/` | local state **outside the repo** (`-backend-config=path=...`) |

Crons are off on staging by default (`api_extra_env`: `CRONS_ENABLED=false`, `IMPACT_JOBS_ENABLED=false`), since no
real keys exist there. Firebase sign-in cannot work (the key is a throwaway), so the test covers health, readiness,
Mongo, the relay WebSocket path, Cloud Armor, web and CMS, not signed-in flows.

The budget is optional because a billing budget needs billing-account rights; with `monitoring_enabled = false` a
budget mails the billing account's admins by default, which on this account includes a mailbox of another company,
so keep it off unless `monitoring_enabled` (with your own `alert_email`) is on too.

Run it from your own terminal. Every gcloud call names the project; nothing changes the gcloud default:

```bash
export P=tokentails-staging S=/path/outside/the/repo     # S: state, plan and logs
export GOOGLE_CLOUD_QUOTA_PROJECT=$P                      # quota and billing headers on the staging project
gcloud auth application-default print-access-token >/dev/null || \
  export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)   # without ADC; refresh hourly
cd infra/gcp/terraform/envs/staging
cp terraform.tfvars.example terraform.tfvars              # operator_cidrs = ["$(curl -s https://api.ipify.org)/32"]
terraform init -backend-config="path=$S/staging.tfstate"

# 0. the provider bills API calls to $P (user_project_override): a fresh project needs these two on first
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project $P

# 1. APIs, registry, accounts, secret containers, network, mongo VM (tags can be placeholders for this pass)
terraform apply -target=module.project_services -target=module.artifact_registry -target=module.service_accounts \
  -target=module.secrets -target=module.network -target=google_compute_instance.mongo \
  -target=google_compute_firewall.mongo_from_subnet -target=google_compute_firewall.mongo_iap_ssh

# 2. throwaway secret values (version 1 of each)
../../../scripts/staging-secrets.sh

# 3. images (linux/amd64), then set backend_tag, web_tag, cms_tag in terraform.tfvars
gcloud auth configure-docker europe-west3-docker.pkg.dev --quiet
SHA=$(git rev-parse --short HEAD); REG=europe-west3-docker.pkg.dev/$P/tokentails
docker build --platform linux/amd64 -t $REG/backend:$SHA ../../../../../backend && docker push $REG/backend:$SHA
#   web: build with a public.env whose API URL is https://api.staging.tokentails.test (no real values needed)
#   infra-only rehearsal: push Google's sample image as web and cms instead (it listens on $PORT)
#   docker pull --platform linux/amd64 us-docker.pkg.dev/cloudrun/container/hello
#   for s in web cms; do docker tag us-docker.pkg.dev/cloudrun/container/hello $REG/$s:placeholder && docker push $REG/$s:placeholder; done
# (on Docker Desktop, plain `docker build --platform` works; `docker buildx build --builder default` is refused there)

# 3b. enabling Compute created a `default` network with 0.0.0.0/0 SSH and RDP rules; nothing uses it, delete it
gcloud compute firewall-rules delete default-allow-icmp default-allow-internal default-allow-rdp default-allow-ssh --project $P --quiet
gcloud compute networks delete default --project $P --quiet

# 4. everything else
terraform plan -out "$S/staging.tfplan" && terraform apply "$S/staging.tfplan"
terraform output smoke                                     # curl / ws-latency commands with the LB IP filled in
```

Checks (each command is in `terraform output smoke`): `/healthz` and `/readyz` on tt-api through :80 and :443 (`-k`),
the relay through `/pawlegends/ws` (`ws-latency.mjs --connect <lb_ip> --insecure`), web and CMS answer, a request
from another address gets 403 from Cloud Armor, `gcloud run jobs execute tt-migrate --region europe-west3 --project
$P --wait` runs against the staging Mongo, and a relay deploy (`deploy.sh IMAGE` over IAP SSH) moves a live match to
the new slot without the players noticing.

What the first real staging run (2026-11-07, all four steps) showed; each one applies to production too:

- **HTTPS needs a few minutes.** Right after the apply, :443 answers with a TLS handshake failure (curl exit 35,
  alert 40, no certificate sent) while :80 already works. The certificate reached the proxy about 3 minutes later.
  Retry before calling it broken; in production the managed certificate takes longer still (DNS authorization).
- **`tt-migrate` cannot succeed from a git-built image.** `backend/.gitignore` ignores `/migrations`, so the
  migration files exist only in a local checkout, the image has none, and the job exits 1 with `migrations directory
  does not exist: /app/migrations/tokentails`. Until the founder decides whether to commit `migrations/tokentails/`
  (it sits next to a `data/` folder that stays private), run migrations by hand as today; the job is the hook for later.
- **IAP SSH with a personal Google account is refused** when the project belongs to an organization (tokentails-staging
  is in `tokentails.com`): OS Login wants `roles/compute.osLoginExternalUser` on the organization for an account outside
  it. Grant that at organization level, or operate the relay from a `tokentails.com` account, before you rely on
  `gcloud compute ssh` for relay restarts and deploys. On staging only, `gcloud compute instances add-metadata
  INSTANCE --metadata enable-oslogin=FALSE` on the relay VM let `deploy-relay.sh` and `replace-relay.sh` run (a VM
  replacement drops it; never do this in production). Without SSH, a one-off Cloud Run job in the VPC
  (`curlimages/curl`, `--network vpc-main --subnet vpc-main-europe-west3 --vpc-egress all-traffic`) can still probe
  internal addresses; delete it afterwards.
- **The default network** (step 3b) appears in any project where Compute is enabled, with SSH and RDP open to the
  internet. Delete it in production too, after pass 1 (or set `constraints/compute.skipDefaultNetworkCreation` on the
  organization).
- Results of that run: `/healthz` and `/readyz` (`mongo: true`) 200 on :80 and :443; `ws-latency.mjs` 5/5 sockets
  `101` and welcomed (ping p50 44 ms from Vilnius); web and CMS (placeholder images) 200 on every host; a request from
  the NAT address (not on the list) got 403 from Cloud Armor; the relay port is closed to the subnet; `tt-migrate`
  failed as above.

Tear down the same day:

```bash
terraform destroy                                          # deletion protection is off, so this removes everything
gcloud compute addresses list --project $P; gcloud run services list --project $P --region europe-west3   # empty
rm -f "$S"/staging.tfstate* "$S"/staging.tfplan
```

If the destroy stops on the subnet ("in use by a serverless address"), Cloud Run direct VPC egress still holds
addresses for a while after the services are gone: run `terraform destroy` again an hour later. Secret Manager
containers (with their versions) and the Artifact Registry repository (with its images) go with the destroy; the
enabled APIs stay enabled, which costs nothing. Deleting the whole project (`gcloud projects delete tokentails-staging`) is the founder's call.

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
export CLOUDSDK_CONFIG="$HOME/.config/gcloud-tokentails"   # the Guardrails exports (top of this runbook), in every shell
export CLOUDSDK_CORE_PROJECT=gleaming-medium-480114-g5
export CLOUDSDK_COMPUTE_REGION=europe-west3
export GOOGLE_APPLICATION_CREDENTIALS="$CLOUDSDK_CONFIG/application_default_credentials.json"
# the project gleaming-medium-480114-g5 already exists (created by the founder); check billing is linked:
gcloud billing projects describe gleaming-medium-480114-g5            # billingEnabled: true
# if not: gcloud billing projects link gleaming-medium-480114-g5 --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config get project                                             # gleaming-medium-480114-g5
gcloud auth application-default login                                 # Terraform uses ADC
gcloud auth application-default set-quota-project gleaming-medium-480114-g5

cd infra/gcp/terraform/bootstrap
terraform init
terraform apply -var project_id=gleaming-medium-480114-g5                       # creates gleaming-medium-480114-g5-tfstate (versioned)
```

### Step 2. First images, then Terraform apply

Terraform creates the Cloud Run services, so the first images must exist. The registry is created by Terraform, so
apply in two passes:

```bash
cd infra/gcp/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars        # fill billing_account, alert_email; tags come next
terraform init -backend-config="bucket=gleaming-medium-480114-g5-tfstate" -backend-config="prefix=envs/prod"

# pass 1: APIs, registry, accounts, secrets containers, network (no services yet)
terraform apply -target=module.project_services -target=module.artifact_registry -target=module.service_accounts \
  -target=module.secrets -target=module.network -target=google_project_iam_custom_role.relay_deployer
# enabling Compute created a `default` network with SSH and RDP open to 0.0.0.0/0; nothing uses it (seen on staging)
gcloud compute firewall-rules delete default-allow-icmp default-allow-internal default-allow-rdp default-allow-ssh \
  --project gleaming-medium-480114-g5 --quiet && gcloud compute networks delete default --project gleaming-medium-480114-g5 --quiet

# first images, pushed by you (or by a deploy-gcp.yml run once the WIF variables exist)
gcloud auth configure-docker europe-west3-docker.pkg.dev
SHA=$(git rev-parse HEAD); REG=europe-west3-docker.pkg.dev/gleaming-medium-480114-g5/tokentails
docker build --platform linux/amd64 -t $REG/backend:$SHA backend && docker push $REG/backend:$SHA
docker build --platform linux/amd64 --secret id=public_env,src=public.env -t $REG/web:$SHA client && docker push $REG/web:$SHA
docker build --platform linux/amd64 --secret id=public_env,src=public-cms.env -t $REG/cms:$SHA cms && docker push $REG/cms:$SHA
# set backend_tag, web_tag, cms_tag = $SHA in terraform.tfvars
```

`public.env` holds the web's `NEXT_PUBLIC_*` values as `KEY='value'` lines (names in docs/CLIENT.md; they are public,
they ship in the browser bundle). The committed `client/.env.production` is the fallback, as on Vercel.

**Before pass 2**:

1. Add the secret values (step 3): Cloud Run refuses to create a revision whose pinned secret version does not exist.
2. Put the NAT IP on the Atlas IP access list (it exists after pass 1): `terraform output -raw nat_ip` (or
   `gcloud compute addresses list --filter='name~nat'`). Pass 2 starts tt-api and the relay against production Mongo
   through that IP; without the entry tt-api never becomes ready (`terraform apply` fails) and the relay VM
   autoheal-loops. Keep the existing entries (DigitalOcean) until step 8.
3. Pass 2 boots the relay VM against the production database while DigitalOcean still serves every match. The relay
   now only claims rooms that were handed off or whose lease went stale, and only abandons rooms nobody checkpoints,
   so it leaves DigitalOcean's live matches alone. It can still claim a match a DigitalOcean instance handed off in
   the same two minutes (a DigitalOcean deploy), which those players then cannot reach. So: turn DigitalOcean
   auto-deploy off from pass 2 until step 6 (deploy DigitalOcean by hand, never within 3 minutes of a `tt-relay`
   start: pass 2, relay deploys, the step 5 drills).

```bash
terraform plan -out tfplan        # read it: nothing outside gleaming-medium-480114-g5, no secret values
terraform apply tfplan
terraform output                  # lb_ip, nat_ip, dns_authorization_records, workload_identity_provider, ...
```

### Step 3. Secret values (you, in your own terminal)

One secret per env key, same names as today. Copy each value **byte for byte** from the DigitalOcean app (App
Platform > Settings > Environment, or `doctl apps spec get` in your own terminal). Never paste a value into a chat, a
file in the repo, or shell history:

```bash
export CLOUDSDK_CONFIG="$HOME/.config/gcloud-tokentails"   # the Guardrails exports (top of this runbook), in every shell
export CLOUDSDK_CORE_PROJECT=gleaming-medium-480114-g5
export CLOUDSDK_COMPUTE_REGION=europe-west3
export GOOGLE_APPLICATION_CREDENTIALS="$CLOUDSDK_CONFIG/application_default_credentials.json"
add() { printf 'value for %s: ' "$1"; IFS= read -rs v; echo; printf '%s' "$v" | gcloud secrets versions add "$1" --data-file=- --project=gleaming-medium-480114-g5; unset v; }
add MONGODB_URI
# multi-line values (FB_PRIVATE_KEY): write to a temp file outside the repo, then
#   gcloud secrets versions add FB_PRIVATE_KEY --data-file=/path/to/tmpfile --project=gleaming-medium-480114-g5 && rm -P /path/to/tmpfile
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

The relay reads only `MONGODB_URI`, `PAWLEGENDS_PARTY_TICKET_SECRET` and `FRONT_END_URLS`, and follows tt-api's pins
for the first and the last (override one in `relay_secret_versions` only if you must). The ticket secret has its own
variable, `party_ticket_secret_version`, which mounts it on tt-api (it mints tickets) and the relay (it verifies them)
at the same version; putting it in `api_secret_versions` or `relay_secret_versions` is refused. Until it is set, the
ticket endpoint answers 503 and party rooms are unscored, as on DigitalOcean today. Tickets are no longer bound to the
minting process's boot id (that made every ticket minted on tt-api fail on the relay); a ticket issued before the
verifying process started is refused instead. Relay secret values must be one line.

Rotation: add a new version, change the pinned version in `terraform.tfvars`, apply. tt-api: the apply creates a new
revision, which serves as soon as it is ready (traffic is on LATEST; `deploy-run.sh` leaves it there). Relay: the pins
live in project metadata (`tt-relay-secrets`, `tt-relay-env`), read at every container start, so after the apply run
`RELAY_MODE=yes` relay deploy of the running image (blue/green: a new slot starts with the new env, the old one drains;
no player notices) or let the next relay deploy pick it up. Disable the old version only after both serve. Secret reads are in the Data Access audit log.

Plain (non-secret) env that DigitalOcean sets and Cloud Run must also get, if any is set there today: copy it into the
`env` map of `module "api"` in `envs/prod/main.tf`. Terraform already sets `NODE_ENV=production`, `BACKEND_ROLE=api`,
`NO_COLOR=1`.

### Step 4. DNS validation, Atlas access, GitHub

1. Certificate: for each row of `terraform output dns_authorization_records`, add the CNAME at Cloudflare **DNS only
   (grey cloud)**. The regional certificate covers `api`, `gcp-api`, `tokentails.com`, `www`, `gcp`, `cats`,
   `gcp-cats`. Wait until `gcloud certificate-manager certificates describe tt-edge-cert --location=europe-west3`
   shows `ACTIVE` (minutes to an hour).
2. Atlas: the NAT IP is already on the access list (before pass 2). Keep the DigitalOcean entries until step 8.
3. GitHub repository variables (Settings > Secrets and variables > Actions > Variables; these are not secrets):
   `GCP_PROJECT_ID=gleaming-medium-480114-g5`, `GCP_WIF_PROVIDER` (= `terraform output workload_identity_provider`),
   `GCP_DEPLOY_SA` (= `sa-deploy@gleaming-medium-480114-g5.iam.gserviceaccount.com`), optional `GCP_REGION`, `GCP_API_HOST`,
   `GCP_WEB_HOST`, `GCP_CMS_HOST`, every `NEXT_PUBLIC_*` the web build needs, and `CMS_NEXT_PUBLIC_*` for CMS-only
   values. For the plan job: `TF_PROJECT_ID`, `TF_STATE_BUCKET`, `TF_BILLING_ACCOUNT`, `TF_ALERT_EMAIL`,
   `TF_BACKEND_TAG`, `TF_WEB_TAG`, `TF_CMS_TAG`, `GCP_TF_PLAN_SA` (`sa-tf-plan@...`). Create the GitHub environments
   `gcp-plan` and `gcp-prod` (with you as required reviewer).

### Step 5. Shadow hosts and tests (nothing user-facing changes)

At Cloudflare add **proxied** (orange) A records for `gcp-api`, `gcp` and `gcp-cats` → `terraform output lb_ip`. Add
`https://gcp.tokentails.com` to the `FRONT_END_URLS` secret (new version, pin it in `api_secret_versions`, apply; the
relay follows that pin, so also run a relay deploy (`relay=yes`), else its Origin check refuses the shadow web's
WebSocket), to Firebase Auth authorized domains and to the App Check site's allowed domains. Then:

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
   70 % of the last good room count (30 % headroom) and set `max_live_rooms` (Terraform: the relay's
   `PARTY_MAX_LIVE_ROOMS` and the 80 % alert; apply, then restart the relay). The staging run on the same machine
   type (`STAGING-PROOF.md`, 2026-11-07) held budget at 150 rooms and tripped the busy gate at ~250, so the prod
   default is 100; this run only confirms it through Cloudflare. Through Cloudflare one host is one IP
   (`roomsLivePerIp` 4), so use several hosts. If t2d-standard-2 cannot hold the expected peak, set
   `relay_machine_type = "t2d-standard-4"` and apply. The apply only creates a new instance template (the MIG never
   replaces the VM by itself); then run `PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3
   infra/gcp/scripts/replace-relay.sh`, which waits until no room is live and replaces the VM. Re-run the load test
   after it: until the replacement the relay is still on 2 cores.
3. **Per-IP test from 2 networks**: open a party from Wi-Fi and join from mobile data; the relay log
   (`gcloud compute ssh` + `docker logs tt-relay-a` (or `-b`, see `/var/lib/tt-relay/active`), or Logs Explorer) must show two distinct `ipKey`s. One `ipKey` for
   both means the client IP is not reaching the relay: stop and check `TrustProxy` log lines.
4. **Relay deploy and crash drills** (LIVE-MATCH-DEPLOYS.md §10): start a guest match and a signed-in one, then run the
   relay deploy (`deploy-gcp.yml` with `targets=relay-only`, `relay=yes`). The matches must continue with no toast
   (log: `relay_drain_start`, then `mp_match_end` on the old slot, or `relay_handoff {reason: pull}` and
   `relay_restore` on the new one). Then the crash drill: `sudo docker kill tt-relay-<active>` mid-match; systemd
   restarts the slot, players see "Reconnecting…" for a few seconds and continue from the last checkpoint (at most
   2 s replayed; measure `restore_gap_ms_p99` in `relay_stats`).
5. **65-minute soak**: keep one party socket open in a lobby for 65 minutes through Cloudflare (proves no 60-minute
   cap anywhere on the path): `node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com --n 2 --pings 800 --gap 5000`
   (about 67 min), with zero errors.

Crons: `tt-api` runs all 26 leased jobs; with DigitalOcean still running, both pick jobs from the same Mongo
`jobruns` leases, so each tick runs once. Keep the shadow phase short (days, not weeks): the traction refresh has no
lease and the `rave-stripe-events` cursor is per process. Step 6 ends the overlap: DigitalOcean is archived right after
the DNS flip.

### Step 6. API and relay cutover (quiet hour)

1. Cloudflare: lower nothing (proxied records switch in seconds). Edit `api.tokentails.com`: from the DigitalOcean
   CNAME to an A record → `lb_ip`, **proxied**. API and relay move together. Hostnames never change, so NFT
   `tokenURI`s, Stripe webhooks and installed apps keep working.
2. Watch for 15 minutes: `curl https://api.tokentails.com/healthz` (role api), `/pawlegends/ws/healthz` (role relay),
   Cloud Run request logs, `ws-latency` against `api.tokentails.com`.
3. Right after the flip (minutes, not hours), hand DigitalOcean's matches over and **archive the DigitalOcean app**,
   in one go, from your terminal, with the App Platform "Archive app" dialog already open:
   ```bash
   PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3 DO_APP_URL=https://<app>.ondigitalocean.app \
     infra/gcp/scripts/cutover-relay.sh
   ```
   It pauses autohealing, stops the serving relay slot, waits while you archive the app (DigitalOcean gets SIGTERM,
   drains and hands off), then starts the slot again, whose first restore pass adopts every handed-off room within the
   300 s window, and restores autohealing. Players see one disconnect of 1–2 minutes. (Since live-match deploys a
   running relay also pulls a reconnecting player's room across pools, so stopping it is belt and braces.)
   Archiving matters beyond the relay: DigitalOcean runs role `all`, so as long as it runs it also runs the 26 leased
   crons, including the hot-wallet signers, on frozen code, racing tt-api for every lease, and its relay keeps
   parties that players can no longer reach after a reconnect. Verify the archive option in the console before the
   quiet hour (if it is missing, delete the backend component instead, after `doctl apps spec get` saved privately).
4. If something is wrong, fix forward on GCP. For 14 days the archived app can be restored and the DNS flipped back,
   but rooms would hand off again; prefer a fix.

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

1. Delete the archived DigitalOcean app `tokentails-be` (after a last `doctl apps spec get` saved privately, keys only).
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
  LB with `x-tt-canary: 1` (the API's `/healthz` must name the new revision), `update-traffic --to-latest` (refused if
  another revision appeared meanwhile), smoke again. Traffic stays on LATEST, so a revision a Terraform apply creates
  (rotated secret, env, sizing) serves as soon as it is ready.
  A failed canary leaves traffic untouched. Rollback exists (`gcloud run services update-traffic tt-api
  --to-revisions <old>=100`), but the house rule is fix forward.
- Relay (`scripts/deploy-relay.sh`), only when relay files changed since the image the serving slot reports or with
  `relay=yes`, at any hour (`docs/plans/moba/LIVE-MATCH-DEPLOYS.md` §8.2): over IAP SSH run
  `/var/lib/tt-relay/deploy.sh IMAGE`: pre-pull, start IMAGE in the idle slot (`tt-relay@a` or `@b`) next to the serving
  one on the same port, wait up to 120 s for its `/readyz` on its loopback control port (9101 or 9102). Not ready: the
  idle slot is stopped and the job fails; the serving slot was never touched (zero player impact). Ready: it becomes
  the active slot, the old slot gets `POST /pawlegends/relay/drain {maxMs: 1800000}` (its listener closes, so every
  new connection reaches the new process; no new match starts on it; live matches play to their end there, or move to
  the new process within about a second when a player's socket reconnects; whatever runs at 30 min is handed off and
  claimed by the new process within a second), deploy.sh waits for 0 live rooms and stops it. Only after success is
  IMAGE committed to the MIG metadata, which a new or autohealed VM starts; a crash restart keeps the verified image
  (`/var/lib/tt-relay/image-<slot>`). A re-run after a failure deploys again (the check reads the container, not the
  metadata). The first deploy on a VM still on the single-unit template hands rooms off once (stop, then start);
  after `scripts/replace-relay.sh` rolled the blue/green template out, deploys are invisible. API deploys never touch
  live matches.
- Migrations: `gcloud run jobs execute tt-migrate --region europe-west3 --project gleaming-medium-480114-g5 --wait` (runs `npx
  migrate-mongo up` in the backend image currently set on the job; update the job image first with `gcloud run jobs
  update tt-migrate --image ...`).
- Terraform: `terraform.yml` checks every PR; plan on main as `sa-tf-plan` (it has Billing Account Viewer on the
  billing account to refresh the budget: the founder must be a billing account administrator when applying that
  binding); apply locally (or the gated job with `ci_apply_enabled = true`: sa-tf-apply then also gets the IAM admin
  roles Editor lacks and Billing Account Costs Manager). Terraform ignores Cloud Run images, traffic and the relay
  image metadata: CI owns those. A change to the relay instance template (cloud-init, machine type) needs
  `scripts/replace-relay.sh` afterwards; relay deploys warn while one is pending.

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
  --region europe-west3 --format='value(name)') --tunnel-through-iap`, then `cat /var/lib/tt-relay/active` (a or b),
  `curl -s localhost:9101/healthz` (slot a; 9102 for b), `sudo journalctl -u tt-relay@a -f`, `docker logs -f tt-relay-a`.
- **Scaling the relay**: `relay_machine_type = "t2d-standard-4"` (4 cores: 3 referee workers), apply, then
  `scripts/replace-relay.sh` (it drains the relay first; new PvP matches wait for the few minutes the new VM takes to
  boot, live ones are not lost), and raise `MAX_LIVE_ROOMS` after a new load run.
- **Relay env or secret pins**: change them in Terraform and apply (project metadata), then a relay deploy
  (`relay=yes`, blue/green: no player notices). No VM replacement. More regions (us-east4, asia-southeast1) are a `relay_vm` module instance
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

## Latency (LATENCY-PLAN; next steps in docs/plans/moba/LATENCY-NEXT.md)

What the code already does, and what only the founder can switch on.

**Measure.** The relay logs `relay_stats` once a minute in every role (DigitalOcean `all` included): `rtt_ms_p50`,
`rtt_ms_p95`, `rtt_ms_p95_<region>` (server-measured WebSocket ping to pong, region from `cf-ipcountry`),
`turn_overrun_ms_p99` and `loop_delay_p99`. Log-based metrics and alerts (`modules/monitoring`): turn overrun p99 > 5 ms,
loop delay p99 > 15 ms, EU RTT p95 > 80 ms. The client sends `mp_net` with the real `rtt_p95`, `jitter_p95`,
`margin_m` and `late_turns` (PostHog, by country and platform). The `Relay latency probe` workflow runs every 30 minutes
from a US runner; for one-off checks from your machine:

```bash
node infra/gcp/tools/ws-latency.mjs https://api.tokentails.com --n 4 --pings 30
```

**Relay runtime (R3).** The relay process runs with `NODE_OPTIONS=--max-semi-space-size=64` and `UV_THREADPOOL_SIZE=8`
(`relay_node_options`, `relay_uv_threadpool_size`). `relay_region` exists but must equal `region` while the relay is
served by the regional ALB (validated).

**Budget (C3).** The budget counts the whole project, which also holds `motored-dev`, `n8n-db` and `n8n`. Either raise
`budget_amount` by their measured monthly cost (default; nothing else changes), or set `budget_labels = { app =
"tokentails" }`: the labelled Terraform resources (Cloud Run, the relay VM, buckets) count, but unlabelled costs (network egress, Cloud NAT, logging)
then drop out of the budget.

**Cloudflare cache rules (C5, founder, dashboard → Caching → Cache Rules, zone tokentails.com).** The origin headers are
already in `client/next.config.js`; Cloudflare caches HTML only when a rule makes it eligible:

1. Rule "Paw Legends game HTML": URI path equals `/pawlegends-game/index.html` → Eligible for cache; Edge TTL: use
   cache-control header if present, else 60 s (the origin sends `Cloudflare-CDN-Cache-Control: max-age=60,
   stale-while-revalidate=300`; Vercel strips `s-maxage` from `Cache-Control`, so that header is what Cloudflare
   reads); Browser TTL: respect origin (`max-age=0, must-revalidate`); Cache key → Query string → **Ignore** (the page is
   static, the game reads `?embed=1`, `&party=`, `&dare=` in the browser; one edge copy, one purge).
2. Rule "Paw Legends OTA": URI path starts with `/pawlegends-app/updates/` → Eligible for cache; Edge TTL: use
   cache-control header if present (`Cloudflare-CDN-Cache-Control: max-age=30` on the manifests; `Cache-Control`
   a year, immutable, on the versioned bundles); Browser TTL: respect origin.
3. Leave `/pawlegends-game/build/*` and `/pawlegends-game/assets/*` on the default rules: they are static file types and
   already cached by extension.
4. Speed → Optimization → Protocol: HTTP/3 (with QUIC) **on**, 0-RTT Connection Resumption **on** (E5). 0-RTT replays
   only idempotent GETs at the edge; the API's POSTs are not affected.
5. API token for the purge (C5): My Profile → API Tokens → Create → "Custom", permission Zone → Cache Purge → Purge,
   zone tokentails.com only. Add it as the GitHub secret `CF_API_TOKEN` and the zone id as `CF_ZONE_ID`. Then
   `pawlegends-ota.yml` purges each new manifest once Vercel serves it, and `pawlegends-cdn.yml` purges the game
   `index.html` and warms the new `build/` files after each game deploy. Without the secrets both skip the purge.

Check after each step (expect `cf-cache-status: HIT` on the second request, `cache-control: public, max-age=0,
must-revalidate` and the `cloudflare-cdn-cache-control` header):

```bash
for p in /pawlegends-game/index.html /pawlegends-app/updates/ios/1/manifest.json; do
  curl -sI "https://tokentails.com$p" | grep -iE '^(cache-control|cloudflare-cdn-cache-control|cf-cache-status|age)'; done
```

Baseline on 2026-11-10 (before the new headers deploy): index.html and manifest.json `max-age=0, must-revalidate`,
`cf-cache-status: DYNAMIC`, first byte 330–420 ms from Vilnius.

**Cloudflare vs direct (E4, after step 6).** No new host: B is the same `gcp-api` URL with its TCP pinned to the load
balancer IP, so the Host, the SNI, the certificate and the relay route all stay the ones the load balancer knows. Cloud
Armor admits Cloudflare ranges only, so first add your own address through your own apply (`terraform.tfvars` in
`envs/prod`):

```bash
test_source_cidrs = ["<curl -s https://api.ipify.org>/32"]   # then: terraform plan, terraform apply (yours)
```

then:

```bash
infra/gcp/scripts/relay-ab.sh https://gcp-api.tokentails.com https://gcp-api.tokentails.com \
  --connect-b "$(terraform -chdir=infra/gcp/terraform/envs/prod output -raw lb_ip)"
```

A ping p50 gap above 10 ms against Cloudflare means: evaluate Argo Smart Routing before any bypass. Afterwards set
`test_source_cidrs = []` and apply again (the default is empty, so removing the line works too).

## Decisions and defaults

Each is a variable or a step above; the default is what the code does unless you change it.

| Question | Default (as built) | Where |
|---|---|---|
| Project, org and billing | Production project `gleaming-medium-480114-g5` (created by the founder) on the founder's own billing account. Never Nortal's org or any `motored-*` project | `project_id`, `billing_account` |
| Staging | No permanent staging. `tokentails-staging` gets `envs/staging` (same modules) for the rehearsal, then is destroyed; the prod shadow hosts cover the final check | `envs/staging` |
| Region | europe-west3 (Frankfurt), the same metro as DigitalOcean fra. If Atlas is elsewhere, move Atlas to GCP europe-west3 first | `region`, `zones` |
| Database | Keep MongoDB Atlas on GCP europe-west3, NAT static IP on the access list, remove `0.0.0.0/0` after cutover; Private Service Connect only at M10+, phase 2 | step 0, step 8 |
| Move web and CMS off Vercel now? | Yes, phase 2 of the same migration, about a week after API and relay are stable; Vercel warm for 14 days; Pawlegends landing experiments, landing-lab and pitch stay on Vercel or retire | step 7 |
| DigitalOcean Spaces | Keep running, read-only, no URL changes; new uploads to GCS behind `cdn.tokentails.com` later, separately | `static_bucket_enabled = false` |
| Extra relay regions | EU only; add us-east4 and asia-southeast1 when > 15 % of a continent's parties have RTT p95 > 120 ms, after region-prefixed party codes | phase 3 |
| Budget and CUDs | $400/month alert at 50/90/100 % actual and 100 % forecast, no automatic shutdown; no committed-use discount until 2 months of steady usage | `budget_amount` |
| Keys the code reads but DigitalOcean never set | Carry the 21 DigitalOcean keys 1:1; empty containers for the rest; the founder decides one by one; AI never generates values | `do_secret_keys`, `extra_secret_keys` |
| Hot-wallet signing crons in their own service now? | No: they stay in tt-api, leased, for the cutover; split into a signer service with its own account in phase 2 | phase 2 |
| Relay deploy policy | Only when relay code changes or on manual dispatch, any hour: blue/green in the VM, the old slot drains up to 30 min, the rest moves to the new slot (LIVE-MATCH-DEPLOYS.md) | `deploy-gcp.yml` input `relay` |
| Relay machine | t2d-standard-2; t2d-standard-4 if the load run calls for it | `relay_machine_type` |
| `MAX_LIVE_ROOMS` | 100 on t2d-standard-2: 70 % of the 150 rooms that held budget in the staging load run (`STAGING-PROOF.md`; e2-standard-2 was at budget with 60). The code default (60) stays for DigitalOcean | `max_live_rooms` -> `PARTY_MAX_LIVE_ROOMS` |
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
- `client/next.config.js` and `cms/next.config.ts` build `output: "standalone"` for the web images only. Vercel sets
  `VERCEL=1` at build time and keeps Next's default output, so its production build is unchanged by this branch.
- `mp/load.mjs` lives in `pawlegends/` (owned by the netcode workflow); `tools/ws-origin-shim.mjs` adapts it from the
  outside instead of editing it. The drain endpoint `POST /pawlegends/relay/drain` exists since live-match deploys
  (2026-11-10, loopback callers only); `deploy.sh` still copes with an image without it (handoff on stop).
- Fixed on the way (2026-11-07): the relay's SIGTERM handoff ran in `onApplicationShutdown`, after Nest's
  `server.close()`, which waits for every open WebSocket, so with players connected nothing closed and `docker stop`
  would SIGKILL at 60 s without the handoff checkpoint (the same on DigitalOcean). It now runs in
  `beforeApplicationShutdown`, while Mongo is still connected. Rooms in a live match (`room_gone` + checkpoint) are not
  exercised across processes since live-match deploys (`live-deploy.e2e.spec.ts`); check one on the VM (step 5).
- Also fixed: `/healthz` and `/readyz` were behind the app's global throttler (a burst of probes from one IP got 429,
  which a health check reads as unhealthy); the health controller now skips it.
- Fixed (live-match deploys, 2026-11-10): signed-in players keep their seat across a relay move or restart. The client
  re-sends its spent ticket with the resume token; the relay accepts that pair when the token belongs to the ticket's
  account (`resumedTicket`), so the account survives (`relay-drain.spec.ts`, "a signed-in player keeps the account").
- **VM recreate vs the restore window**: an autoheal (60 s of failed checks first), a host failure or a replacement
  boots a fresh COS VM, runs cloud-init and pulls the image uncached before the restore loop runs. The window is now
  300 s (`PARTY_LIMITS.restoreWithinMs`, was 120 s); measure the first real replacement (step 5). `replace-relay.sh`
  drains first, so a planned replacement hands nothing off unless a match outlives the 30 min drain.
- **Crash takeover**: a relay that dies without SIGTERM (OOM, SIGKILL, host failure) leaves its rooms with a lease that
  goes stale after 8 s (`staleLeaseMs`); any serving relay claims them within a second after that, and the players
  resume from the last checkpoint (every 2 s): at most 2 s of play is replayed differently. Covered by
  `live-deploy.e2e.spec.ts` (a real SIGKILL across processes).
- Fixed in this branch (2026-11-07 review): party tickets minted on tt-api never verified on the relay VM (boot-id
  binding; also failed about half the time on DigitalOcean's 2 instances); every relay boot marked all other live rooms
  in the shared database abandoned (`abandonLive` had no owner filter; also hit DigitalOcean's second instance); the
  account and guest throttles read the balancer IP on tt-api (`visitorIp`).
- Known backend issues listed at the end of docs/BACKEND.md are unchanged by this work, apart from the
  `cf-connecting-ip` forgery, which this topology closes at the edge once DigitalOcean is gone.
