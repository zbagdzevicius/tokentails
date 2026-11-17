# Step 6 cutover: api.tokentails.com from DigitalOcean to Google Cloud

The quiet-hour checklist for [RUNBOOK.md](RUNBOOK.md) step 6 (API, crons and the Paw Legends party relay). Web and CMS
stay where they are (step 7, separate). Times are Vilnius. Until Oct 25 Vilnius is UTC+3; from Oct 25 it is EET,
UTC+2, so **05:00–07:00 Vilnius = 03:00–05:00 UTC**. Every gcloud command runs in a shell with the Guardrails exports;
nothing here uses `gcloud config set` or any `motored-*` project.

```bash
export CLOUDSDK_CONFIG="$HOME/.config/gcloud-tokentails" CLOUDSDK_CORE_PROJECT=gleaming-medium-480114-g5 CLOUDSDK_COMPUTE_REGION=europe-west3
export GOOGLE_APPLICATION_CREDENTIALS="$CLOUDSDK_CONFIG/application_default_credentials.json"
G="--project=gleaming-medium-480114-g5 --account=zbagdzevicius@gmail.com"
LB_IP=34.107.92.132                     # terraform -chdir=infra/gcp/terraform/envs/prod output -raw lb_ip
DO_APP=2d200c50-57b8-4709-b5e6-f8fcc71dcdce   # tokentails-be; origin https://stingray-app-6t3d9.ondigitalocean.app
```

## Go / no-go (the day before; every line must be true)

- [ ] gcloud logged in (`gcloud auth list $G` shows the account; ADC works: `gcloud auth application-default print-access-token >/dev/null`).
- [ ] Certificate `ACTIVE`: `gcloud certificate-manager certificates describe tt-edge-cert --location=europe-west3 $G --format='value(managed.state)'`. It covers `api.tokentails.com`, so the flip is safe with SSL Full (strict).
- [ ] `infra/gcp/scripts/step5-checks.sh` passed (health, sim parity with DigitalOcean, relay latency, Cloud Armor 403) and `--soak` passed once (65 minutes, zero errors).
- [ ] tt-api and the relay run the **same commit as DigitalOcean** (`step5-checks.sh` sim parity line; `doctl apps list-deployments $DO_APP` shows the active commit). If not: `gh workflow run deploy-gcp.yml --ref main -f targets=backend -f relay=yes` and wait for green.
- [ ] Atlas access list contains the NAT IP `34.141.46.203` (it does since Nov 11; `0.0.0.0/0` stays until step 8).
- [ ] App Platform "Archive app" is offered for `tokentails-be` (Settings > Destroy/Archive). If not, plan B: delete the backend component after `doctl apps spec get $DO_APP > ~/private/tokentails-be-spec.json` (outside the repo).
- [ ] The workflows that push to main (sim, render, OTA) are paused **04:30–06:30 Vilnius**: every push redeploys DigitalOcean while it still runs, and after the flip a backend change reaches users only through `deploy-gcp.yml`.
- [ ] Stripe, Firebase and App Check need nothing: the hostname does not change.

## The hour

| Vilnius | UTC | Step | Done when |
|---|---|---|---|
| 04:45 | 02:45 | Open: Cloudflare DNS for `tokentails.com`, App Platform app `tokentails-be` (Archive dialog ready, not confirmed), a terminal with the exports above, Logs Explorer for `tt-api` and the relay. | |
| 04:50 | 02:50 | No DigitalOcean deploy in flight or in the last 3 minutes: `doctl apps list-deployments $DO_APP -o json \| jq -r '.[0] \| .phase, .updated_at'` shows `ACTIVE` and a time ≥ 3 min ago. If one is running, wait for it plus 3 minutes. | |
| 04:52 | 02:52 | Baseline: `infra/gcp/scripts/step5-checks.sh` (must pass), `node infra/gcp/tools/ws-latency.mjs https://api.tokentails.com --n 4 --pings 20` (DigitalOcean numbers to compare). Live rooms on DigitalOcean: `curl -s https://api.tokentails.com/pawlegends/status`. | all green |
| **05:00** | **03:00** | **Flip.** Cloudflare > DNS > `api` record: edit. Today it is a CNAME to the DigitalOcean app; change Type to **A**, IPv4 **34.107.92.132**, Proxy status **Proxied (orange)**, TTL Auto. Save. (Cloudflare may require deleting the CNAME and adding the A record: do both within the same minute.) | |
| 05:01 | 03:01 | `curl -s https://api.tokentails.com/healthz` returns `"role":"api"` and a `revision` (DigitalOcean answers `"role":"all"`, no revision). `curl -s https://api.tokentails.com/pawlegends/ws/healthz` returns `"role":"relay"`. Repeat each a few times: proxied records switch in seconds, so every answer should be GCP within 1–2 minutes. | role api, role relay |
| 05:03 | 03:03 | **Hand DigitalOcean's matches over and archive it** (RUNBOOK 6.3): `PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3 DO_APP_URL=https://stingray-app-6t3d9.ondigitalocean.app infra/gcp/scripts/cutover-relay.sh`. When it says so, confirm "Archive app" in the dialog. It pauses autohealing, stops the serving relay slot, waits for the archive (DigitalOcean drains and hands off), starts the slot (restore pass adopts the handed-off rooms within 300 s) and resumes autohealing. Players see one disconnect of 1–2 minutes. | script prints done; DO app archived |
| 05:10 | 03:10 | `node infra/gcp/tools/ws-latency.mjs https://api.tokentails.com --n 10 --pings 30` (all welcomed, p95 near the step 5 numbers); `node infra/gcp/tools/party-probe.mjs https://api.tokentails.com` (create/join ok); `curl -s https://api.tokentails.com/pawlegends/sim` equals the pre-flip answer. | |
| 05:10–05:25 | 03:10–03:25 | **Watch** (15 min, list below). | no red |
| 05:25 | 03:25 | One real sign-in on tokentails.com and one Paw Legends party from a phone on mobile data (the relay log must show the phone's `ipKey`, not the LB's). | |
| 05:25–06:00 | 03:25–04:00 | Keep watching, lighter (every 10 min). First leased cron ticks run on tt-api only now: `cron_lease_failures` stays 0. | |
| **06:00** | **04:00** | **Clean hour reached.** DigitalOcean deploys switched off for good (below). Un-pause the pushing workflows. | |
| 06:05 | 04:05 | Turn on GCP deploys from main: add `push: branches: [main]` with backend path filters to `.github/workflows/deploy-gcp.yml` (RUNBOOK "Deploys"); push. From now on a backend push is live only after deploy-gcp is green. | first push run green |
| 06:30 | 04:30 | Update `RUNBOOK.md` Production status (cutover time, revisions) and `CLAUDE.local.md` tracker. Uptime checks in Monitoring green. | |

### What to watch (05:10–06:00)

- `curl -s -o /dev/null -w '%{http_code} %{time_total}\n' https://api.tokentails.com/readyz` every minute: 200, under 0.5 s.
- Cloud Run tt-api: Metrics > Request count by response class (5xx under 2 %), Latency p95 under 1.5 s, instance count (not stuck at max 4).
  `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="tt-api" AND severity>=ERROR' $G --freshness=10m --limit=20 --format='value(timestamp,textPayload)'`
  Known noise (same as DigitalOcean): testnet RPC `ENOTFOUND`/`SERVER_ERROR`, shelter-goal `RPC_-32602`/`HTTP_429`, shelter-share `execution reverted`.
- Relay: `relay_stats` once a minute: `rooms_live` rises as players arrive, `loop_delay_p99` < 15 ms, `turn_overrun_ms_p99` < 5 ms; events `restored` (expected right after 05:03), no `checkpoint_lost`, no `refused_busy`, few `mp_verify_failed`.
  `gcloud logging read 'resource.type="gce_instance" AND logName:"cos_containers" AND jsonPayload.event="relay_stats"' $G --freshness=10m --limit=5`
- Cloud Armor: `armor_denied` must not spike (a spike means Cloudflare is not in front of a request path, or a range changed).
- Leases: `cron_lease_failures` 0; Stripe dashboard > Webhooks: deliveries to `https://api.tokentails.com/...` keep returning 2xx.
- PostHog `mp_net` (if open): `rtt_p95` by country not worse than yesterday's same hour.

### Switching DigitalOcean deploys off (06:00, after the clean hour)

An archived app does not deploy. This is the switch for the restore window (14 days) and for plan B (component kept
instead of archived), so a push can never start frozen code that races tt-api for leases and wallet signers. Show,
then run in your own terminal (a spec update starts one deployment of a running app; on an archived app run it only
if a restore is ever needed, before restoring):

```bash
umask 077; SPEC=$(mktemp -d)/do-spec.json             # outside the repo; the spec holds encrypted EV[...] values only
doctl apps spec get "$DO_APP" --format json > "$SPEC"
jq '(.services[] | select(.github) | .github.deploy_on_push) = false' "$SPEC" > "$SPEC.new" \
  && doctl apps update "$DO_APP" --spec "$SPEC.new" \
  && doctl apps spec get "$DO_APP" --format json | jq '[.services[] | {name, deploy_on_push: .github.deploy_on_push}]'
rm -P "$SPEC" "$SPEC.new"
```

## If something breaks: fix forward (house rule), in this order

1. **api.tokentails.com answers 5xx / Cloudflare 52x** right after the flip: `curl -s https://gcp-api.tokentails.com/readyz` (same origin). If that is fine too, it is DNS/proxy: check the `api` record is A 34.107.92.132, proxied, and SSL/TLS mode is Full (strict). If `readyz` is 503 `mongo:false`: Atlas access list must hold 34.141.46.203; tt-api logs show the Mongo error.
2. **403 for real users**: Cloud Armor admits Cloudflare ranges only. A grey-cloud (DNS only) `api` record sends users straight to the LB: turn the orange cloud on.
3. **Relay route 404 / sockets refused**: `/pawlegends/ws/healthz` must say `role relay`. `gcloud compute instance-groups managed list-instances tt-relay --region europe-west3 $G` (HEALTHY?), then over IAP (`RUNBOOK` Operations, "Relay VM by hand") `cat /var/lib/tt-relay/active` and `curl -s localhost:9101/readyz` (9102 for slot b). Origin refused (403 on upgrade): `FRONT_END_URLS` misses the page's origin; new secret version, pin, apply, relay deploy `relay=yes`.
4. **cutover-relay.sh stops midway**: re-run it; it resumes autohealing at the end. If DigitalOcean archived but rooms were not adopted, the players' clients reconnect and the running relay pulls their room across (`relay_handoff {reason: pull}`); `restored` in `relay_stats` counts them.
5. **A bug in the GCP build**: fix on main, `gh workflow run deploy-gcp.yml --ref main -f targets=backend -f relay=if-changed`; the canary (`x-tt-canary: 1`) is checked before traffic moves. A one-command traffic move back to the previous revision exists (`gcloud run services update-traffic tt-api --to-revisions <old>=100 --region europe-west3 $G`) but the house rule is fix forward.
6. **Sim mismatch** (`update_required` toasts, `mp_verify_failed` rising): the web shipped a newer sim than the API. Deploy GCP from the commit Vercel runs (point 5).
7. **Last resort only** (the GCP stack cannot serve at all and no fix is in reach within the hour): restore the archived DigitalOcean app, wait for it to serve, then set the `api` record back to the CNAME `stingray-app-6t3d9.ondigitalocean.app` (proxied). Rooms hand off again; record why in the runbook.
