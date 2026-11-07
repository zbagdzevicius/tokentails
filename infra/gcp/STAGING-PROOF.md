# Staging proof (tokentails-staging, 2026-11-07)

The Terraform in `terraform/envs/staging` (the production modules plus staging-only overrides: self-signed
certificate, HTTP listener, operator /32 on Cloud Armor, throwaway `mongo:7` VM) was applied to the throwaway project
`tokentails-staging`, exercised from the founder's machine in Vilnius, and destroyed the same day. No production
project, secret, database or DNS record was touched. Secrets were generated for the test (`scripts/staging-secrets.sh`).

All numbers come from this machine (Vilnius, home connection). The machine was heavily loaded by other work during
the run (load average 17 to 100), which slows the browser tests and adds timer jitter to the client-side numbers. The
relay-side counters (`relay_stats` in Cloud Logging) do not depend on it.

## Verdict

| Question | Answer |
|---|---|
| Does the stack come up from the Terraform and serve? | Yes: API, relay, web and CMS through the regional ALB on :80 and :443, Mongo ready |
| Will multiplayer lag more than today? | No sign of it. Relay ping RTT p50 42–45 ms straight to Frankfurt; through Cloudflare it should land within a few ms of today's path (below) |
| How many rooms does one relay hold? | t2d-standard-2: budgets held at 150 rooms (450 players); the busy gate refused new rooms at ~250. e2-standard-2 was already at budget with 60 |
| Do rooms survive a relay restart or deploy? | Yes: 3.3–3.9 s stall, same room, turns continue. A forced VM replacement restored the room too, after a 68 s stall |
| Do API rollouts drop requests? | No: 0 failed of 5,730 requests across two Cloud Run rollouts |
| Can someone skip Cloudflare by forging `cf-connecting-ip`? | No: from an address not on the list, every request and WebSocket upgrade got 403 from Cloud Armor |

## 1. API

Through the ALB (`--resolve api.staging.tokentails.test:443:34.40.85.237 -k`):

| Request | Result |
|---|---|
| `GET /healthz` | 200 `{"ok":true,"role":"api","revision":"tt-api-00001-b5g"}` (0.41–0.48 s total, new TLS each time) |
| `GET /readyz` | 200 `{"ready":true,"role":"api","mongo":true,"stopping":false}` |
| `GET /pawlegends/sim` | 200, `simVersion` 14, `simVersions` [10, 11, 12, 13, 14], a bundle hash for each |
| `GET /pawlegends/status`, `GET /count` | 200 (empty database: all counts 0) |
| `GET /user/profile`, `POST /pawlegends/party/ticket`, `POST /user/guest/session` without a token, or with a fake `fb…` token | 401 |
| `GET /pawlegends/ws/healthz` | 200 `{"ok":true,"role":"relay"}` (the path reaches the VM) |

The guest party path (no ticket, `guestKey` only) works end to end through the relay (sections 2 to 4). A Firebase
guest session and sign-in were not tested: staging has a throwaway Firebase key, so token checks fail by design.

## 2. Relay latency over WSS (regional ALB, self-signed certificate)

`tools/ws-latency.mjs https://api.staging.tokentails.test --connect 34.40.85.237 --insecure`, 10 sockets x 30 pings:

| Run | Relay VM | Handshake p50 / p95 | hello→welcome p50 / p95 | Ping RTT p50 / p95 / p99 / max | Welcomed |
|---|---|---|---|---|---|
| 1 | e2-standard-2 | 155 / 181 ms | 47 / 56 ms | 42.0 / 52.3 / 55.9 / 61 ms | 10/10 |
| 2 | e2-standard-2 | 151 / 167 ms | 48 / 54 ms | 43.7 / 54.2 / 59.1 / 87 ms | 10/10 |
| 3 | e2-standard-2 | 155 / 186 ms | 46 / 64 ms | 44.8 / 55.1 / 60.9 / 65 ms | 10/10 |
| 4 | t2d-standard-2 | 157 / 360 ms | 47 / 59 ms | 44.2 / 52.9 / 56.8 / – | 10/10 |

ICMP to the LB address: 35–48 ms (avg 42). The handshake (TCP + TLS + upgrade) is about 3 RTTs; TLS at the regional
ALB alone took 90–380 ms in `curl` timings, more variable than the 40–50 ms TLS at Cloudflare's edge. It is paid once
per connect, not per message.

Today's production for comparison (HTTP only, no WebSockets opened against production): `api.tokentails.com` is
served by Cloudflare's Warsaw PoP (`colo=WAW`, `loc=LT`), ICMP 19–39 ms (avg 25). `GET /pawlegends/sim`: TCP 23–37 ms,
TLS done at 49–87 ms, first byte at 96–173 ms, so the Cloudflare-to-DigitalOcean leg plus the app is about 50–100 ms.

Expected path after the cutover: player → Cloudflare's nearest PoP (Warsaw from Vilnius, ~25 ms RTT; TLS and the
WebSocket terminate there) → Cloudflare to the GCP regional ALB in Frankfurt (europe-west3, roughly 20–25 ms RTT from
Warsaw; Cloudflare keeps origin connections warm for HTTP, a WebSocket opens its own) → Envoy proxy → relay VM in the
same zone (<1 ms). Expected relay RTT about 45–55 ms from Lithuania: the same order as the 42–45 ms measured straight
to the LB, and the same shape as today (Cloudflare → DigitalOcean Frankfurt). The extra handshake at the regional ALB
only affects connect time. Re-measure through Cloudflare at step 5 of the RUNBOOK (`gcp-api` shadow host).

## 3. The real game through staging

**Two clients, game net code.** A Node harness built from `pawlegends/src/net` (`PartySocket`, `NetCore`,
`LockstepRunner`) plays a 2-player party over WSS through the ALB: create, join, pick, load, then client A sends a move
every 450–600 ms and the harness times when it is applied on A (own input) and on B (peer sees). 30 s per run:

| Run | RTT estimate | Send → turn back at A, median / p95 | Turn → applied (buffer + pacing) | Own input median / p95 | Peer sees median / p95 |
|---|---|---|---|---|---|
| 1 | 48 ms | 71 / 106 ms | 124 ms | 196 / 232 ms | 199 / 234 ms |
| 2 | 51 ms | 81 / 111 ms | 55 ms | 136 / 166 ms | 136 / 166 ms |
| 3 | 49 ms | 83 / 115 ms | 18 ms | 101 / 134 ms | 102 / 134 ms |

The network part is steady (send to turn back 71–83 ms median: one RTT plus the wait for the next 66.7 ms turn). The
spread in own-input latency (101 to 196 ms) is the client's pacing phase against the turn stream (the buffer holds
0–2 turns), the same behaviour as on a local relay; the pacing work on the `feat/pawlegends-mp` worktree targets it.
It does not come from GCP.

**Browser e2e.** The game was built with `VITE_PAWLEGENDS_API=https://api.staging.tokentails.test`, served at
`https://staging.tokentails.test` (a local TLS front, so the relay sees an allowed Origin) and run with the party
specs (`tests/e2e/mp`, Chromium mapped to the LB address, certificate errors ignored; the config was a scratch file).
Passed: `party-pick` (lock, greyed hero, side switch, timer auto-lock), `party-rematch` (full match, Play again
together), `party-screens` title, and `party-drop` in the first attempt. Failed on timing under the machine's load
(each test took 2–6 minutes): `party-drop` (a 9 s poll) in the second attempt, `party-jip` (a `data-mp-turn` read right
after joining), `party-screens` lobby (the title did not render within 120 s). A third attempt at load average 110–133
failed `party-drop` and `party-jip` on page-render timeouts (`waitForSelector` 120–150 s) before reaching the relay
steps, and was stopped. The relay counted the rooms and the harness above plays the same flow, so these failures point
at the local CPU, not the relay; re-run `party-drop`, `party-jip`, `party-start`, `party-social` and `party-surrender`
on a quiet machine against the `gcp-api` shadow host before the cutover.

## 4. Relay load (rooms per VM)

`load-staging` (a copy of `pawlegends/tests/e2e/mp/load.mjs` for WSS through the ALB): rooms of 3 clients that
create, join, pick, load and then BEAT every 500 ms. Each room used its own `cf-connecting-ip` (possible only on
staging, where Cloud Armor admits the operator /32) so the per-IP caps did not bound a one-host run, and ticketed
rooms (tickets minted with the throwaway staging secret) so the 50 % guest share did not either. Counters from the
relay's `relay_stats` lines, one a minute (loop delay is the p99 beyond the 10 ms sample interval after the fix in
section 6; e2-standard-2 rows are the raw value minus 10):

| VM | Rooms (players) | Loop delay p99 | Turn overrun p99 | Referee lag | Relay CPU (of 200 %) | Turns per client |
|---|---|---|---|---|---|---|
| e2-standard-2 | 60 (180), 3 min hold | ~4 ms | 4.7–5.7 ms | 0 | – | 2,656–2,701 of 2,700 |
| t2d-standard-2 | 92 (276), ramp | 1.4 ms | 2 ms | 0 | ~60 % | – |
| t2d-standard-2 | 121 (363), ramp | 2.0 ms | 2.3 ms | 0 | – | – |
| t2d-standard-2 | 150 (450), 2.5 min hold | 3.8–7.2 ms | 5–7.7 ms | 0 | ~75 % (ramp) | 2,206–2,251 of 2,250 |
| t2d-standard-2 | 207 (621), ramp | 2.5 ms | 8 ms | 0 | ~100 % | – |
| t2d-standard-2 | 248–253 (~760) | 18.5–19.2 ms | 18.7–19.7 ms | 20 turns | 125–155 % | some clients starved (181 of 1,800) |

At 253 rooms the busy gate refused the next match (`server_busy`, retry in 15 s), as designed. Memory stayed under
900 MiB of 7.8 GiB.

Sizing: t2d-standard-2 holds about 150 rooms within the `load.mjs` budget (overrun p99 < 5 ms, referee lag < 5), with
the hold at 150 just over it. 70 % of that is **100 rooms (300 players)**, now the prod default of `max_live_rooms`
(Terraform sets the relay's `PARTY_MAX_LIVE_ROOMS` and the 80 % alert from it). e2-standard-2 reached the budget at 60
rooms, which confirms t2d for production. Caveat: load clients send BEATs, not commands; real players send up to a
few commands a second, so re-check the counters in the first busy week.

## 5. Resilience

**Relay restart with a live match** (2-player match, both clients reconnect with their resume token):

| Action | Script time | Turn stall A / B | Room after |
|---|---|---|---|
| `sudo systemctl restart tt-relay` (same image) | 3.7 s (restart on the VM 1.0 s) | 3.5 / 3.9 s | same party, turns 166 → 176 / 181, `room_gone` then `welcome` + `match` |
| `scripts/deploy-relay.sh` 8f94e113 → 1bc9a051 (pre-pull, restart, ready check, MIG metadata commit) | 20.9 s | 3.7 / 3.3 s | same party, turns 307 → 318 / 312 |
| `scripts/replace-relay.sh` with `FORCE=1` (VM recreated, e2 → t2d) | 83 s | 67.6 / 68.5 s | restored on the new VM within the 120 s window, turns 554 → 813 / 826 |

A replacement freezes a live match for over a minute, which is why `replace-relay.sh` waits for zero live rooms unless
forced. Restarts and deploys are within a few seconds.

**Cloud Run rollout.** Two `scripts/deploy-run.sh tt-api` runs (8f94e113, then 1bc9a051: canary revision with no
traffic, canary smoke, traffic to LATEST, live smoke) while 4 workers sent `/healthz` and `/readyz` through the ALB:
5,730 requests in 83 s, **0 failed**, latency p50 57 ms, p95 73 ms, p99 85 ms, max 188 ms. Each rollout took about
26 s; the serving revision changed at 40.7 s and 66.6 s into the loop.

**Forged `cf-connecting-ip`.** A one-off Cloud Run job in the VPC (egress through the NAT address 34.159.102.66, not on
the Cloud Armor list) sent `/healthz` and a WebSocket upgrade with `cf-connecting-ip: 203.0.113.7` (and once with
`cf-ray` and `x-forwarded-for` too): **403 for all four**. The job was deleted. On staging the operator /32 is
allowed, and from it the relay does honour a forged header (the load run relied on it); in production only Cloudflare
ranges pass Cloud Armor and Cloudflare overwrites the header.

## 6. Problems found and fixed (committed, not pushed)

| Commit | Problem | Fix |
|---|---|---|
| 1bc9a051 | The relay's event-loop gate read Node's histogram raw. It records the whole 10 ms sample interval, so an idle relay read ~11.5 ms p99 on the VM: the 20 ms busy gate would refuse rooms at ~9 ms of real delay and the 15 ms alert fired at ~5 ms | `loop-gate.ts` subtracts the interval (idle relay now reads 0.8–1.6 ms); spec added |
| 1bc9a051 | `MAX_LIVE_ROOMS` was a code constant (60), so a load run or a sizing change needed a backend release | `PARTY_MAX_LIVE_ROOMS` (1..1000) on the relay, set by Terraform from `max_live_rooms`, the same variable as the 80 % alert |
| 362a0fde | Every plan showed tt-api, tt-web and tt-cms as changed (the API echoes the service-level `scaling` block back as zeros) | the module ignores that block |
| 362a0fde | `deploy-run.sh` smoke tests cannot reach a host without DNS | `SMOKE_CURL_ARGS` (staging only) |
| this commit | Prod `max_live_rooms` was the 60 placeholder | 100 from the load run; RUNBOOK load step, decision row and the staging OS Login note updated |

## 7. Not proven here

- Cloudflare in front (no DNS access): the real path, the Cloudflare WebSocket behaviour and the latency through it.
  RUNBOOK step 5 (`gcp-api` shadow host) does this before the cutover.
- Firebase sign-in, guest sessions and App Check (throwaway key); Stripe webhooks; real web and CMS images (staging
  served the Cloud Run sample image); MongoDB Atlas (staging used an in-VPC `mongo:7`).
- `tt-migrate`: still exits 1 because `backend/.gitignore` ignores `/migrations` (founder decision, unchanged).
- SSH for relay operations: OS Login refuses the personal Google account on an organization project without
  `roles/compute.osLoginExternalUser` at organization level (not granted). Staging used `enable-oslogin=FALSE` on the
  relay VM only, for the restart and deploy tests.
- Alerts actually firing and the uptime checks (monitoring was off in staging).
- Load with real commands, from several hosts and through Cloudflare; mobile networks.

## 8. Cost

Billing data is not readable from here (no billing export), so this is an estimate from resources x hours, at
europe-west3 list prices. The stack ran from about 07:25 to about 12:15 UTC (destroy).

| Resource | Rate | Hours | Cost |
|---|---|---|---|
| Relay VM e2-standard-2, then t2d-standard-2 | ~$0.08–0.10/h | ~5 | ~$0.45 |
| Mongo VM e2-small, disks | ~$0.025/h | ~5 | ~$0.13 |
| Regional ALB (2 forwarding rules, proxy) and Cloud Armor policy + rules | ~$0.08/h | ~5 | ~$0.40 |
| Cloud NAT, static addresses | ~$0.02/h | ~5 | ~$0.10 |
| Cloud Run tt-api (min 1 instance, 1 vCPU, 1 GiB) and request time; web and CMS scale to zero | ~$0.05/h | ~5 | ~$0.25 |
| Egress (load runs, tests), Artifact Registry, Secret Manager, logging (within free tiers) | – | – | < $0.50 |
| **Total** | | | **about $2 (well under the $15 budget)** |

## 9. Teardown

`terraform destroy` (same local state, same `-var`s) removed every billable resource: the relay and Mongo VMs and
disks, instance templates, the MIG, the ALB, forwarding rules and addresses, Cloud Armor, NAT and router, firewall
rules, Cloud Run services and the job, secrets, the Artifact Registry repository and its images, the service accounts
and the relay's project metadata. Checked afterwards with `gcloud`: no instances, disks, templates, forwarding rules,
firewalls, routers, security policies, repositories, secrets, buckets or project metadata left.

It stopped, as the RUNBOOK warns, on the subnet: Cloud Run's direct VPC egress still holds
`serverless-ipv4-cloudrun-…` (an internal address that cannot be deleted by hand; Google releases it 1–2 hours after
the last revision is gone). What is left costs nothing: the `vpc-main` network and its subnet, that reserved internal
address, the enabled APIs and the default compute service account. To finish (the state file stays in the scratch
directory until then):

```bash
cd infra/gcp/terraform/envs/staging
terraform destroy -var relay_machine_type=t2d-standard-2 -var max_live_rooms=300    # an hour or more later
gcloud compute networks list --project tokentails-staging                           # empty
rm -f "$S"/staging.tfstate* "$S"/*.tfplan
```

Deleting the project itself (`gcloud projects delete tokentails-staging`) is the founder's call.
