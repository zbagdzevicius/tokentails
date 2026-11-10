# Live-match deploys: no player notices a backend deploy

Status: built, 2026-11-10, on branch `feat/pawlegends-live-match-deploys` (§12 lists what was built, what
differs from this design and what is left). Nothing is applied to DigitalOcean or GCP: the DO spec change
(`infra/digitalocean/live-match-spec.sh`) and the Terraform (`infra/gcp`) wait for the founder.

Founder ask (verbatim): "ultracode there was an issue where match paused disconnected - was it redeployment or smt like
that? we want gcloud terraform to handle gracefully any live matches that are ongoing, make sure our users won't face
any impact".

## 1. What happened on 2026-11-09

Yes, it was the redeploy. Three container swaps on DigitalOcean app `2d200c50-57b8-4709-b5e6-f8fcc71dcdce`
(api.tokentails.com): about 18:47:20, 18:56:33 and 19:02:50 UTC (deploys 1818f53d, d46f2a2f, da2e2309; 96b734f7 was
canceled).

The relay already hands rooms off on SIGTERM (`PartyRelay.shutdown()`, `backend/src/pawlegends/party/party-relay.ts`
~1713: `room_gone` with a 3 s retry, final checkpoint with `handoff:true`, sockets closed with 1012). Three gaps lost
the matches:

1. **Wrong order on DigitalOcean.** `restore()` runs once, at boot (`party-relay.service.ts` `onApplicationBootstrap`).
   DO boots the new container first and only then sends SIGTERM to the old one. The handoff rows are written after the
   only `restore()` has already run, so nothing claims them. `room-restore.spec.ts` calls `relayB.restore()` after
   `relayA.shutdown()`, the opposite of DO's order, which is why it passes.
2. **Two instances, in-memory rooms.** The spec has `instance_count: 2` (since deploy b1476743, 2026-10-08). The DO load
   balancer has no room affinity, so a reconnect can land on the instance that does not hold the room. Resume tokens,
   rooms, party codes and the Quick Play queue are each split across the two processes. A plain network blip can lose a
   match this way, deploy or not.
3. **Nothing claims a room for an unknown resume token.** `hello` (`party-relay.ts` ~508) on an instance without the
   room makes a fresh member with no party; the client then waits forever ("Reconnecting…", then "Waiting for
   server…"; the word "disconnected" is not in the client, so that is most likely what the founder saw).

Ruled out: a pause vote (PvP never pauses), a sim version mismatch (refused at `hello`, never mid-match; the backend
vendors v10–v19) and OTA (applied on the title screen only). Bot matches run in the client (`LocalHost`) and are not
affected by deploys at all; only PvP and 5v5 Classic go through the relay.

The logs of the old containers are gone (`final_cleanup`), so the exact rooms lost cannot be listed from logs. A
read-only query on `pawlegendsrooms` (`handoff:true` rows that became `abandoned`, 18:45–19:05 UTC) would confirm it;
it needs `MONGODB_URI`, which an agent must not read. The founder can run it.

## 2. Goal and budget

| Event | Player-visible budget |
|---|---|
| Planned deploy (DO push to `main`, GCP relay deploy, template change) | No toast for rooms that end during the drain; for a room moved mid-match, one freeze of at most 2 s, no "Reconnecting…" toast (it shows only after 1.5 s), no lost input |
| Process crash, OOM, VM autoheal or host failure | One freeze, "Reconnecting…" while the relay comes back, the match continues from the last checkpoint (at most 2 s of play replayed differently), both teams frozen equally |
| Rollback of a bad image | No impact: the old process is never drained until the new one is ready |

The match clock is a turn counter, not wall time: a frozen room is frozen for both teams, and nobody's cooldowns or
respawns run while it is frozen.

## 3. The design in one paragraph

**One serving relay owns every room at steady state. A deploy is an overlap: the new process comes up and becomes
ready, the old process drains (no new rooms, parties or queue entries; existing rooms play on until they end), a player
whose socket lands on the new process for a room still on the old one makes the old one hand over that single room at
once (pull handoff), and at the drain deadline the old process hands over whatever is left (push handoff). Every
serving relay runs `restore()` every second, not only at boot, so handoffs are claimed whatever the order of events.
Checkpoints every 2 s plus a 300 s restore window cover crashes. The client reconnects fast and quietly and catches up
deterministically.** The same mechanism serves DigitalOcean today and the GCP relay VM tomorrow.

Pieces, in the order the task lists them:

- A. Server drain (§4)
- B. Match continuity through any process end (§5)
- C. Client (§6)
- D. Infra: DigitalOcean now (§7), GCP Terraform (§8)
- E. Tests (§9)

## 4. A. Server drain

### 4.1 Lifecycle

`PartyRelay` gets a state: `serving → draining → stopped`. One method, `drain({ reason, deadlineMs })`, used by three
triggers:

| Trigger | When | Deadline |
|---|---|---|
| SIGTERM (`beforeApplicationShutdown`) | DO swap, `docker stop`, systemd stop | `RELAY_DRAIN_MAX_MS`, default 90 000 (fits any default grace); DO sets 540 000 with a 600 s grace, the GCP VM docker's stop timeout minus 30 s |
| `POST /pawlegends/relay/drain` | `deploy.sh` on the GCP VM | the body's `maxMs`, capped at 1 800 000 |
| A newer relay generation is ready (§4.4) | the new process passed readiness | `RELAY_DRAIN_MAX_MS` |

Entering `draining`:

1. Readiness flips first. `HealthController` currently sets `stopping` in its own `beforeApplicationShutdown`, but Nest
   awaits hooks in sequence and the relay's hook will now wait minutes. Readiness must read the relay state
   (`relay.draining`) directly, so `/readyz` answers 503 within the same tick.
2. Row flag: `pawlegendsrooms.updateMany({owner: boot, status: 'live'}, {$set: {draining: true}})` and one
   `pawlegendsrelays` row `{_id: boot, state: 'draining', deadline}` (§4.4). This is what lets the new relay pull a room.
3. The listener closes: `server.close()` stops new TCP connections (upgraded sockets stay open), and the `upgrade`
   handler answers any upgrade that still arrives with close 1012 `moving`. On the GCP VM this sends every new
   connection to the new process (§8.2). On DO the load balancer has already stopped routing new requests to the old
   container (`drain_seconds`).
4. No new work: `create party`, `join by code`, Quick Play enqueue and room start answer `{t: 'error', code:
   'server_moving', retryMs: 250}`. `mm.shutdown()` already runs in `shutdown()`; it moves to the start of the drain.
5. Lobby-only parties (no live room) move now: write them with `handoff: true` on the party row, close their sockets
   with 1012. Their clients reconnect to the new relay, whose restore loop has claimed the party, and their resume
   tokens work (`restoreParty` already rebuilds `resume` from `doc.members[].resume`). New: a party-only claim path in
   `restore()` (today parties are rebuilt only as part of a room).
6. Live rooms keep playing: clock, checkpoints, referee, sockets all unchanged.

While draining:

- A room that ends is finished as today (`finish`, scores via the client's POST to `/live`, never from the relay).
- A pull request on one of its rooms (§5.4) is handed off within 500 ms.
- When `rooms_live` reaches 0, or at the deadline (push handoff of the rest, §5.3), the relay runs today's
  `shutdown()` minus the parts already done, and the process exits 0.

### 4.2 Drain endpoint

`POST /pawlegends/relay/drain` with optional `{maxMs}`, answer `202 {rooms_live, deadline}`. It is reachable from
loopback only (`req.socket.remoteAddress` in `127.0.0.1`/`::1`, checked in the controller), and it is not exposed by
the GCP load balancer (only `/pawlegends/ws` goes to the relay) or useful on DO (public API, refused for non-loopback).
Idempotent: a second call returns the same deadline. `deploy.sh` already calls it and polls `rooms_live` on `/healthz`
(`cloud-init.yaml.tftpl` 106–117); it starts working the day the endpoint ships.

### 4.3 Health

| Endpoint | Serving | Draining | Use it for |
|---|---|---|---|
| `/healthz` | 200 | 200 (process alive, adds `state: draining`) | liveness, autoheal, DO `health_check` |
| `/readyz` | 200 when Mongo is up and the restore loop ran once | 503 | deploy scripts, the GCP LB health check (§8.3) |

DO's `health_check` must use `/healthz`, not `/readyz`: a draining container answering 503 to DO's checker could be
marked unhealthy and restarted mid-drain. (Unverified whether DO restarts on a failing `health_check` after the deploy;
`/healthz` is safe either way.)

### 4.4 Generations: the newest ready relay wins

At steady state there is one serving relay per database. When a relay becomes ready it upserts
`pawlegendsrelays {_id: boot, state: 'serving', readyAt, simVersions}`. Every relay checks this collection in its 1 s
loop; a serving relay that sees another serving relay with a later `readyAt` starts its own drain. This makes the order
of DO's swap irrelevant: the old process starts draining the moment the new one is ready, whether SIGTERM came yet or
not, and the pull path (§5.4) has a draining owner to pull from.

Rows expire (TTL index on `heartbeatAt`, 30 s, refreshed every 5 s), so a crashed relay never blocks anything. This rule
is also why DO must run one instance: two healthy instances would make the older one drain forever. That is intended:
two in-memory relays behind an affinity-free balancer cannot both own rooms (§1, gap 2).

## 5. B. Match continuity through any process end

### 5.1 What is stored (exists today)

`pawlegendsrooms`: config (seed, picks, tricks, map, mode, sim version and hash), occupants, an append-only turn log
(`chunks`, appended under `{_id, epoch, lastTurn}`), `pilotTicks`, `owner` + `epoch` lease (`room-store.ts`).
`pawlegendsparties`: members with identity and the hashed resume token. The sim is deterministic, so the log is the
authoritative state; the referee re-sims it on restore. No snapshot of sim state is needed: fast-forward is 19 800
ticks in under 1.5 s on Node (`net-rejoin.test.ts`, perf-ff). Redis is not used in this repo; Mongo stays the store.

### 5.2 Changes to the numbers (`party-limits.ts`)

| Limit | Today | New | Why |
|---|---|---|---|
| `checkpointEveryMs` | 10 000 | 2 000 | a crash replays at most 2 s; appends are small (one `$push` of ~60 turns) |
| `staleLeaseMs` | 15 000 | 8 000 | must stay above checkpoint interval + a slow Mongo write; a crash is claimed after 8 s, not 15 s |
| `restoreWithinMs` | 120 000 | 300 000 | a VM recreate (autoheal after 60 s of failures + cold COS boot + image pull) can pass 120 s (RUNBOOK "VM recreate vs the 120 s restore window") |
| new `restoreEveryMs` | – | 1 000 | the restore loop (§5.3) |
| new `restoreHoldMs` | – | 5 000 | clock held after a restore until the humans are back (§5.5) |
| new `pullHoldMs` | – | 3 000 | how long a `hello` waits for a pulled room (§5.4) |

Load at the GCP cap of 100 live rooms: 50 small appends per second plus one indexed query per second per relay. Measure
it in the staging load run (`STAGING-PROOF.md`) before raising the cap.

### 5.3 Restore loop (push handoff and crashes)

`restore()` runs on a 1 s timer on every relay in state `serving` (never while draining), and once at boot as today. It
claims rows that are `live`, owned by someone else, inside the window, and either `handoff: true` or stale
(`room-store.ts` `restorable`). Claims stay fenced by `epoch` (`claim`), so two relays never both own a room; the loser of
a race simply sees `null`.

`abandonLive` changes: today it runs at the end of every `restore()` and abandons every `handoff`/stale row this relay
did not take. With a periodic loop that would abandon rooms another relay (one carrying the right sim bundle) could still
claim. New rule: abandon only rows older than `restoreWithinMs`, and only rows whose sim version no running relay
carries (read from `pawlegendsrelays.simVersions`).

Push handoff (deadline, SIGTERM with no time left) is today's `shutdown()` per room: `room_gone` with `retryMs: 0`,
final checkpoint with `handoff: true`, close 1012. The serving relay claims it within 1 s.

### 5.4 Pull handoff (a player reaches the new relay first)

When `hello` carries a resume token this relay does not know:

1. Look it up: `pawlegendsparties.findOne({'doc.members.resume': hash})` (new index on that field), then the room row
   of `doc.room`.
2. Room `live`, owner `draining` (row flag or relay row): set `want: {by: boot, at: now}` on the room row.
3. The draining owner polls `{owner: boot, want: {$exists: true}}` every 500 ms and push-hands that single room off
   (§5.3). Its other players get `room_gone retryMs: 0` and reconnect to the new relay too.
4. The new relay claims it in its next loop tick (the loop runs at 250 ms while any `want` it wrote is pending).
5. The `hello` is held (no `welcome` yet) up to `pullHoldMs`; once the room is in `this.rooms`, `hello` continues as
   today: `findResume` matches the restored token, `resumedTicket` keeps the account, `bindSeat` binds the slot.
6. If the owner is serving (not draining), never pull: answer `{t: 'error', code: 'room_elsewhere', retryMs: 500}` and
   close 4013; the client retries. With one serving relay this only happens in the first seconds of a DO swap, before
   §4.4 has made the old one drain.
7. If nothing is found (room ended, row abandoned), answer as today (fresh member) plus `room_over` so the client leaves
   the match screen instead of waiting.

Worst case for a moved room: pull detection 0–500 ms + claim 250 ms + client reconnect 100–300 ms + catch-up of a few
seconds of turns. Inside the 2 s budget, and the clock is held (§5.5), so nobody loses ground.

### 5.5 Fair freeze on restore

Today a restored room restarts its clock immediately and pilots every slot (reason `restore`) until its client sends
`back`. That is symmetric when all humans drop together, but a fast reconnecting team plays against bots for a moment.
New: a restored room holds its clock until every human who was connected at the checkpoint is bound again, or
`restoreHoldMs` passes; then it runs as today (absent humans piloted, both teams treated the same). Clients show the
frozen frame; the scheduler starts the room on release with `startMs = now`, so no turn is skipped.

### 5.6 Crash rollback

After a crash the restored log ends at the last checkpoint, up to 2 s behind what the clients have applied. On `bind`,
if the client's `lastSeq`/last applied turn is past the room's `nextTurn`, the relay sends `{t: 'resync', reason:
'restore'}`; the client already handles `resync` (`net-host.ts` ~441: rebuild, then `sync fromTurn: 0`). The inputs of
those last 2 s are lost and replayed differently. Planned deploys never hit this path: the final checkpoint is written
before any socket closes.

### 5.7 Version pinning

- A room keeps its sim version for life. Every relay image carries the frozen bundles (`pawlegends/tools/vendor-sim.mjs`
  writes `backend/src/vendor/pawlegends-sim`, v10–v19 today), and `restore()` picks `partySimFor(row.simVersion,
  row.simHash)` per room, so a v19 room moves to a v20 server unchanged.
- Release rule, enforced by a CI check in `vendor-sim.mjs`: a deploy may drop a sim version, or raise `PROTO_MIN`, only
  when it is at least 7 days older than the newest OTA bundle (so no client in a live room still speaks it). Dropping a
  version with live rooms makes them unrestorable (§5.3 abandons them).
- The client never changes bundles mid-match (OTA applies on the title screen), so a reconnect after a server version
  change sends the same `sim`/`proto` it started with.

## 6. C. Client (`pawlegends/src/net/`)

Today: infinite reconnect, backoff 250 ms to 5 s with jitter (`socket.ts` `onClose`), "Reconnecting…" toast at once
(`net-host.ts` ~248), `room_gone` toast (~476), "Waiting for server…" (~555).

Changes:

1. **Fast retry for a planned move.** Close code 1012, `room_gone` and `server_moving` reset `attempt` and retry after
   `retryMs` (0–250 ms + 0–100 ms jitter). Exponential backoff stays for real network errors, capped at 2 s while in a
   match (5 s in the lobby).
2. **Quiet first 1.5 s.** "Reconnecting…" shows only if the socket has not reached `welcome` + `bind` within 1 500 ms;
   "Waiting for server…" only after 5 s. A deploy move is then invisible apart from the frozen frame.
3. **`room_elsewhere`** (§5.4 step 6): retry after `retryMs`, no toast.
4. **`room_over`**: leave the match to the results or title screen with "The match ended while you were away", instead
   of waiting forever.
5. **Lobby and queue.** On `server_moving` while queued for Quick Play, reconnect and re-enqueue with the same options
   and the original queue start time (the timer on screen keeps counting). A party in the lobby reconnects with its
   resume token and finds the party on the new relay (§4.1 step 5).
6. **Version change.** No user action: the client sends its own `sim`/`proto` and the new relay carries them (§5.7).
   `update_required` stays reserved for a client older than `PROTO_MIN` at the start of a match.

No feature flag: all of this is on by default (founder rule).

## 7. D. DigitalOcean now

### 7.1 Spec change (prepared, not applied)

Fragment for the backend service in the app spec:

```yaml
services:
  - name: backend            # the existing service name in the spec
    instance_count: 1        # was 2: one relay owns every room (§1 gap 2, §4.4)
    instance_size_slug: apps-s-1vcpu-1gb
    run_command: npm start
    health_check:
      http_path: /healthz    # liveness only; never /readyz (§4.3)
      initial_delay_seconds: 10
      period_seconds: 10
      timeout_seconds: 5
      failure_threshold: 6
      success_threshold: 1
    termination:
      drain_seconds: 10            # LB stops new requests to the old container, then SIGTERM
      grace_period_seconds: 600    # SIGTERM to SIGKILL: the relay drains up to 540 s, then pushes the rest
```

`instance_count: 1` also fixes split party codes and a split Quick Play queue. The API part of the backend loses its
second instance: the HTTP API has had 1 vCPU headroom per instance; watch CPU for a day, and size up to
`apps-s-1vcpu-2gb` or `apps-s-2vcpu-4gb` rather than adding an instance (relay rooms must stay in one process until
the relay moves to GCP).

Exact commands for the founder (the first is read-only):

```bash
doctl apps spec get 2d200c50-57b8-4709-b5e6-f8fcc71dcdce > do-app.yaml
# edit do-app.yaml: in the backend service set instance_count, health_check and termination as above
doctl apps spec validate do-app.yaml
doctl apps update 2d200c50-57b8-4709-b5e6-f8fcc71dcdce --spec do-app.yaml
```

Order (corrected while building, §12): apply the spec **before or together with** the first deploy of the code from
§4–§5. The old code hands off at once on SIGTERM and ignores the longer grace, so it is no worse with one instance; the
new code on two instances makes one of them drain for good (§4.4) and bounces about half of all reconnects once. DO limits from memory, to check in the DO docs before applying:
`drain_seconds` 1–110 (default 15), `grace_period_seconds` 1–600 (default 120). Also unverified: whether DO keeps an
already open WebSocket to the old container after `drain_seconds`; if it cuts it, the clients reconnect to the new
container and pull their room (§5.4), so the design holds either way.

### 7.2 What a DO deploy looks like after the change

1. New container boots, restores nothing, becomes ready, writes its generation row as `standby` (§12: DO
   health-checks it before routing to it, so it must not drain the old one yet).
2. DO routes to the new container; its first player socket makes it `serving`. The old container sees the newer
   generation (≤ 1 s) and drains: new rooms and queue go to the new container.
3. DO stops routing to the old container, waits 10 s, sends SIGTERM (already draining: no-op).
4. Rooms on the old container finish there; a player who drops and reconnects lands on the new container and pulls
   the room.
5. At 540 s the old container pushes what is left, the new one claims within 1 s, the old exits before 600 s.

Until this ships: avoid pushing backend changes to `main` while PvP or 5v5 matches are live, or batch them.

## 8. D. GCP Terraform

### 8.1 Runtime choice: keep the relay on the single-VM managed instance group

Cloud Run was rejected for the relay:

- A request (a WebSocket) lives at most 3 600 s, so long sessions are cut every hour.
- SIGTERM gives 10 s before SIGKILL: no drain, and a 2 s checkpoint is the most it can rely on.
- Session affinity is best-effort, cookie based, and does not apply to a new WebSocket opened by a reconnect; instances
  of an old revision are shut down when traffic moves off it, whatever sockets they hold. Revision tags do not pin a
  reconnecting player to the instance that owns the room.
- Several instances behind it bring back gap 2 of §1.

A MIG of 2+ VMs with a surge rolling update and LB connection draining was also weighed: every update boots a whole VM
(minutes), the balancer has no room affinity, and two VMs are two owners. It works with §4.4 and §5.4, but a second
process on the same VM gives the same overlap in seconds and costs nothing.

Decision: one VM (`modules/relay_vm`, `target_size = 1`, MIGRATE on host maintenance), **blue/green inside the VM**: two
containers share the relay port with `SO_REUSEPORT`, the new one comes up next to the old one, the old one drains. The
Cloud Run service `tt-api` (`BACKEND_ROLE=api`) keeps the HTTP API; it holds no rooms.

### 8.2 Blue/green on the VM

- Backend (`main.ts`): replace `app.listen(port)` with `app.init()` + `server.listen({ port, host: '0.0.0.0', reusePort:
  process.platform === 'linux' })`. Node supports `reusePort` from 22.12 (and 23.1); the image is
  `node:22-bookworm-slim`, so pin `NODE_IMAGE` to `node:22.12+-bookworm-slim` or later. macOS raises on `reusePort`,
  hence the platform check. Containers already run with `--network host` (`cloud-init` `run.sh`).
- Per-slot control port on loopback, `RELAY_CONTROL_PORT` (slot a: 9101, slot b: 9102), serving `/healthz`, `/readyz`
  and `/pawlegends/relay/drain`, so `deploy.sh` can talk to one process while both share the public port.
- systemd template unit `tt-relay@.service` (`%i` = `a` or `b`), container name `tt-relay-%i`, `docker stop -t
  ${stop_timeout_seconds}`; `/var/lib/tt-relay/active` names the serving slot; `tt-relay@<active>` is the one enabled
  at boot.
- `deploy.sh IMAGE` becomes:
  1. pull `IMAGE`;
  2. start the idle slot on `IMAGE`, wait up to 120 s for its `/readyz` on its control port (restore loop ran, Mongo up);
     if not ready, stop it and exit 1. The old slot was never touched: rollback with zero impact;
  3. write the active slot; the new process's generation row makes the old one drain (§4.4); `deploy.sh` also calls
     `POST /pawlegends/relay/drain {maxMs: DRAIN_MAX_S*1000}` on the old control port, which closes its listener so
     the kernel sends every new connection to the new process;
  4. poll the old slot's `rooms_live` every 20 s until 0 or `drain_max_seconds` (1 800); the old process then exits by
     itself after the push handoff; `systemctl stop tt-relay@<old>` is the backstop;
  5. exit 0; CI commits `IMAGE` to the MIG metadata as today.
- A VM boot (autoheal, recreate, `replace-relay.sh`) starts the active slot only; it restores from Mongo within the
  300 s window.

Load balancer health check: `/readyz` on the shared port. While both slots listen, either answers ready; once the old
one drains, its listener is closed and only the new one answers. The autoheal check stays on `/healthz` with its lenient
60 s threshold.

### 8.3 Terraform changes

| File | Change |
|---|---|
| `modules/relay_vm/templates/cloud-init.yaml.tftpl` | `tt-relay@.service` template unit; `run.sh` takes the slot and passes `RELAY_CONTROL_PORT`; `deploy.sh` blue/green as §8.2; `prepare.sh` unchanged |
| `modules/relay_vm/variables.tf` | `control_ports` (default `{a = 9101, b = 9102}`); `stop_timeout_seconds` default 60 → 90 (push handoff of up to 100 rooms); `drain_max_seconds` stays 1 800 |
| `modules/relay_vm/main.tf` | LB health check `request_path = "/readyz"`; autoheal stays `/healthz`; `update_policy` unchanged (OPPORTUNISTIC, no surge; the in-VM swap needs no template change) |
| `modules/edge_lb_regional/variables.tf` | `relay_draining_sec` validation: allow up to 300 (window is now 300 s); keep the default 30 |
| `modules/relay_vm/main.tf` (as built) | `plain_env` gets `RELAY_DRAIN_MAX_MS = (stop_timeout_seconds - 30) * 1000` (60 000); the deploy's 30 min drain goes through the endpoint body, never through SIGTERM (§12) |
| `scripts/replace-relay.sh` | before replacing the VM, `POST /pawlegends/relay/drain` on the active slot and wait for 0 rooms (cap 30 min), then replace; matches that run past the cap are pushed and restored by the new VM within 300 s |
| `scripts/deploy-relay.sh` | unchanged interface; prints the drain progress from `deploy.sh` |
| `RUNBOOK.md` | replace "Known gaps" items on the drain endpoint, the 120 s window and ticketed seats with this design; add "Relay deploys are zero-impact" to the relay deploy section |

Workflow order in `.github/workflows/deploy-gcp.yml` stays test → image → `tt-api` (canary, then 100 %) → relay
(new slot ready → old slot drains → old slot exits → commit image) → web → cms. The relay deploy no longer needs a quiet
hour; `if-changed` stays so unrelated pushes do not touch the relay.

Validation only: `terraform fmt -check -recursive` and `terraform validate` in `envs/staging` and `envs/prod`
(`-backend=false`), plus `scripts/check-cloud-init.sh`. No `plan` against prod, no `apply` anywhere: prod project
`gleaming-medium-480114-g5` changes need the founder's approval.

## 9. E. Tests

Backend (`backend/src/pawlegends/party/`):

| Test | Asserts |
|---|---|
| `relay-drain.spec.ts` (unit) | `drain()` flips `/readyz` to 503 in the same tick; `create`/`join`/enqueue answer `server_moving`; live rooms keep advancing turns; a room that ends is finished; at `rooms_live == 0` the relay stops; at the deadline every remaining room gets a `handoff` checkpoint and `room_gone retryMs: 0`; the endpoint refuses a non-loopback address and is idempotent |
| `room-restore.spec.ts` (extend) | **DO order**: relay B boots and runs `restore()` first, then relay A shuts down; B's loop claims within 1.5 s (fails today). Lobby-only party handed off and found by its resume token. `abandonLive` leaves an in-window `handoff` row alone |
| `room-pull.spec.ts` (new) | B serving, A draining with a live PvP room; a client resumes on B: B sets `want`, A hands that room off, B claims, the held `hello` gets `welcome` + bind with the same slot; the other client gets `room_gone` and rejoins on B. Owner serving (not draining): `room_elsewhere`, no claim |
| `relay-generation.spec.ts` (new) | a newer ready generation makes the older relay drain; a stale generation row (TTL) does not |
| `room-hold.spec.ts` (new) | a restored room's turn counter stays put until all humans bind or 5 s pass, then advances for both teams |
| `crash-resync.spec.ts` (new) | a relay killed without `shutdown()`; another relay claims after `staleLeaseMs`; a client whose last turn is past the restored log gets `resync` and ends on the same state hash as a fresh catch-up |

Integration, `backend/test/pawlegends-live-deploy.e2e-spec.ts` (new; real WebSockets, in-memory Mongo as in the
existing relay specs, two relay processes spawned with `child_process.fork` on the same port with `reusePort` on Linux,
on two ports behind a tiny test proxy on macOS):

1. Process A starts a bot-filled PvP room (2 humans via `relay-test-client.helper-spec.ts`, the rest bots) and plays
   300 turns with scripted inputs.
2. Process B starts; A drains (planned deploy). One client's socket is dropped and reconnects to B (pull path); the
   other stays on A until the 10 s deadline (push path).
3. Assert: both clients bound to their original slots within 2 s of their reconnect; no turn number repeats or skips;
   the final state hash on both clients equals a single-process run of the same inputs; the score payload is the same.
4. Variant: `SIGKILL` A at turn 300 (crash). Assert both clients rejoin B within `staleLeaseMs` + 2 s and end on the
   hash of the restored log plus the later inputs.
5. Variant: room on sim v18, B carries v18 and v19: the room restores on v18.

Client (`pawlegends/tests/unit/`):

| Test | Asserts |
|---|---|
| `net-reconnect-quiet.test.ts` | 1012 / `room_gone` / `server_moving` retry within 350 ms with `attempt` reset; no "Reconnecting…" note when `welcome` + bind arrive within 1.5 s; the note appears at 1.5 s otherwise |
| `net-rejoin.test.ts` (extend) | `resync` after a restore with the client 60 turns ahead ends on the restored hash |
| `mp-queue-move.test.ts` | Quick Play re-enqueues after `server_moving` with the original start time |

The machine is loaded: `perf-sim`, `net-rejoin`, `anim/root` and `tools/trailer` copy-gate flake on timing; rerun them
alone before calling a failure.

## 10. Rollout

1. Backend and client changes (§4–§6) with the tests (§9), merged to `main`. The client part ships through OTA; the
   server part works with old clients too (they reconnect slower, with the toast, but now find their room).
2. Founder applies the DO spec (§7.1) after step 1 is live. Check in the logs on the next push: `relay_drain_start`,
   `relay_handoff {reason}`, `relay_restore {room, gapMs}`.
3. GCP: Terraform and cloud-init changes (§8.3) validated on this branch; applied by the founder with the relay
   cutover (RUNBOOK step 5 already does a `systemctl restart` mid-match; repeat it with `deploy.sh` and with a
   `SIGKILL` of the container to measure the crash gap).
4. Docs: `docs/BACKEND.md` ~1086 and `docs/plans/moba/MULTIPLAYER.md` ~730 say "single instance"; true again after
   step 2, and they get the drain and restore-loop description.

New log lines (one JSON object each, for alerts later): `relay_drain_start {trigger, rooms, deadline}`,
`relay_handoff {room, reason: pull|deadline|sigterm}`, `relay_restore {room, simVersion, gapMs}`,
`relay_abandon {room, why}`, `relay_drain_done {ms}`. Counter `restore_gap_ms_p99` in `counters()`.

## 11. Open questions (defaults in brackets)

- DO behaviour to confirm in the DO docs before applying §7.1: termination limits; whether open WebSockets to the old
  container survive `drain_seconds`; whether a failing `health_check` restarts a live container. [Design does not
  depend on any of them; apply as written.]
- One DO instance for the HTTP API too. [Yes, size up instead of out until the relay leaves DO.]
- Restore window 300 s: a match frozen for 5 minutes after a VM recreate is still resumed rather than lost. [Yes; the
  client shows "Waiting for server…" and players may leave; their slots are piloted.]
- The pull hold delays the `welcome` of the first reconnecting player by up to 3 s in the worst case. [Accept.]

## 12. As built (2026-11-10)

### What was built

| Piece | Where |
|---|---|
| Relay states `serving → draining → stopped`, `drain(trigger, maxMs)` for SIGTERM, the endpoint and a newer generation; lobby parties and idle sockets move at once (`server_moving`, 1012); live rooms play on; pull handoff on `want` (500 ms poll); push at the deadline | `backend/src/pawlegends/party/party-relay.ts` |
| Restore loop every 1 s on a serving relay (one pass at a time), lobby-party claims, the 5 s fair hold, crash rollback (`resync` when a client is past the restored log), lease-lost detection (a relay whose checkpoint is refused because another relay claimed the room stops running it) | same |
| Relay rows (`pawlegendsrelays`: state, readyAt, heartbeat, sim versions, pool), `want`, party `owner`/`handoff`, the resume-token index, `abandonLive` only past the 300 s window | `room-store.ts` |
| Limits: checkpoint 2 s, stale lease 8 s, window 300 s, hold 5 s, pull hold 3 s, `RELAY_DRAIN_MAX_MS`, `RELAY_POOL` | `party-limits.ts` |
| `/readyz` 503 while draining (same tick), `/healthz` stays 200 and adds `state`; `POST /pawlegends/relay/drain` (loopback peers only); `SO_REUSEPORT` listen on Linux; `RELAY_CONTROL_PORT` | `health.controller.ts`, `relay-drain.controller.ts`, `main.ts` |
| Client: a planned move (1012, 4013, `room_gone`, `server_moving`, `room_elsewhere`) retries after `retryMs` + up to 100 ms jitter (6 quick tries, then the backoff); in-match backoff capped at 2 s; "Reconnecting…" only after 1.5 s, "Waiting for server…" not within 5 s of a move; `room_over` leaves the match screen ("The match ended while you were away") | `pawlegends/src/net/socket.ts`, `net-host.ts`, `party/partyClient.ts`, `party/ui/copy.ts` |
| Three new error codes (additive, no PROTO or SIM_VERSION bump; older clients ignore them and still find their room, only slower and with the toast) | `pawlegends/src/net/proto.ts`, vendored net bundle |
| GCP: blue/green slots `tt-relay@a|b` on one port, `boot.sh`, `deploy.sh` (idle slot ready, then drain the old one through its control port), LB check `/readyz`, autoheal `/healthz`, `stop_timeout_seconds` 90, `control_ports`, LB draining validation up to 300 s; `replace-relay.sh` drains before replacing; `cutover-relay.sh` slot-aware | `infra/gcp/terraform/modules/relay_vm`, `modules/edge_lb_regional`, `infra/gcp/scripts`, `infra/gcp/tests/prod.tftest.hcl`, `RUNBOOK.md` |
| DO: spec patch script (instance_count 1, `/healthz` check, drain 10 s, grace 600 s, `RELAY_DRAIN_MAX_MS=540000`), dry-run validated against the live app, not applied | `infra/digitalocean/live-match-spec.sh` |

### Differences from the design above

- **Standby until the first socket (new).** A relay is ready (Mongo up, boot restore pass done) well before DigitalOcean
  routes to it (health check delay, then the switch). Under §4.4 as written, the old relay would drain in that gap and
  bounce lobby players and the Quick Play queue back to itself for 10 to 30 s. So a ready relay's row says `standby`
  until a player's socket first reaches it; only then is it `serving` with `readyAt` = that moment, and only a
  `serving` row makes an older relay drain. A pull to a `standby` or `serving` owner answers `room_elsewhere` (the
  socket that reached the new relay has already announced it, so the old one drains within a second and the retry
  pulls). The deploy.sh drain on the GCP VM does not depend on it (it calls the endpoint).
- **Relay pools (new).** During the migration the DO app and the GCP relay VM share one database. Under §4.4 as written,
  the GCP relay coming up in the shadow phase would have drained the DO relay that serves players, and its 1 s restore
  loop would have taken DO's deploy handoffs (whose players reconnect to DO by DNS). So relays carry a pool
  (`RELAY_POOL`, default `vm` for `BACKEND_ROLE=relay`, `app` otherwise): only a newer relay of the same pool drains
  one, and after its boot pass a relay claims only rooms and parties a relay of its own pool left, plus a room a
  player here is waiting for (pull), which works across pools. The cutover therefore also works without stopping the
  GCP relay (players who reach it after the DNS flip pull their rooms from the draining DO relay).
- **SIGTERM drain default 90 s, not 540 s.** A default above the platform grace would SIGKILL the relay before its push
  handoff (DO's default grace is 120 s). DO gets 540 s through the spec script; the GCP VM gets docker's stop timeout
  minus 30 s from the module. The deploy's 30-minute drain uses the endpoint's `maxMs`, never SIGTERM.
- **DO spec order.** Before or with the code, not after (§7.1, corrected).
- **Integration test.** `backend/src/pawlegends/party/live-deploy.e2e.spec.ts` (runs in `npm test`): two relays in
  forked processes (`backend/test/relay-proc.harness.ts`, ts-node) share a `MemoryRoomStore` held by the test over the
  IPC channel (the repo has no in-memory Mongo). Clients dial the relay a balancer would pick, so no `SO_REUSEPORT` or
  proxy is needed. It covers a real SIGTERM (drain, push, both players rebound to their slots, no turn skipped or
  repeated, every turn served by both relays carries the same inputs, restore gap under 2 s) and a real SIGKILL at
  about turn 100 (the next relay claims after the stale lease, the client past the checkpoint gets `resync`, both
  players share one log again and are human after `back`). Identical inputs per turn stand for the state hash: the sim
  is deterministic and the test client does not run it.
- **Unit specs** live in `relay-drain.spec.ts` (DO order, pull, endpoint drain, generations and pools, a signed-in
  player keeping the account, the 5 s hold, `abandonLive`) and `relay-drain.controller.spec.ts`; client specs in
  `pawlegends/tests/unit/net-reconnect-quiet.test.ts`. No separate `mp-queue-move` test: Quick Play already keeps its
  search through `mm.cancel{server}` and re-joins on the next welcome (`partyClient.ts`, `mm-client.test.ts`).

### Limits (what can still reach a player)

- **A crash before the first checkpoint of a room** (its first 2 s): the room row is written when the room starts and the
  party within 100 ms, so the room restores from turn 0 (the start countdown replays). Only a crash inside those
  first 100 ms, before the party row exists, leaves a room nobody can rejoin: it is abandoned after 300 s and a
  reconnecting client gets `room_over`. A failed `create` (Mongo down at the start) makes the room unscored and
  unrestorable, as before.
- **A crash** (OOM, SIGKILL, host failure) freezes the match for the stale lease plus a loop tick (about 8–10 s, shown
  as "Reconnecting…") and replays at most the last 2 s differently. A crash restart of the same slot on the VM is the
  same path.
- **A VM replacement** (template change, autoheal recreate) leaves no relay serving for the minutes the new VM takes to
  boot: new PvP and 5v5 matches cannot start meanwhile (bot matches are local and unaffected). `replace-relay.sh`
  drains first, so live matches end before it unless one outlives the 30 min cap; those resume on the new VM if it is
  up within 300 s.
- **The first relay deploy on a VM still on the single-unit template** hands rooms off once (stop, then start): run
  `replace-relay.sh` after the Terraform apply, before relying on invisible deploys.
- **Old clients** (before this OTA) see "Reconnecting…" during a move and retry with their backoff (up to 5 s), but find
  their room.
- **Unverified on real platforms:** whether DigitalOcean keeps open WebSockets to the old container after
  `drain_seconds` (the design holds either way: a cut socket reconnects and pulls), the Node `SO_REUSEPORT` handover on
  COS (a slot that cannot share the port fails readiness; the old slot keeps serving), and the cloud-init schema check
  (`scripts/check-cloud-init.sh` needs Docker; the scripts were checked with `bash -n` and the rendered YAML parsed).
- **Not built:** the §5.7 CI rule in `vendor-sim.mjs` (drop a sim version only 7 days after the newest OTA bundle);
  until then, never drop a vendored sim version in the same deploy that ships a new one. Load at 100 rooms with 2 s
  checkpoints is not measured yet (`STAGING-PROOF.md` load run).
