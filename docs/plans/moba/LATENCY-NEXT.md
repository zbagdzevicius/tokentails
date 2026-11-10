# Paw Legends latency: the next steps that need a sim or protocol change

Status: ready spec, not started. Source: the latency plan (LATENCY-PLAN, Nov 2026). The items that needed no sim
version shipped on `feat/pawlegends-latency`: real RTT percentiles in `mp_net`, server-measured RTT in `relay_stats`,
the ping chip, the parallel ticket and socket connect, the predicted cast wind-up (N1), cache headers, the CI latency
gate and the relay probe. This document covers what waits for a sim version (after v20, the chase fix) or a wire
protocol bump, and what waits for a second region.

Read the measurements first. `mp_net` now carries `rtt_p50`, `rtt_p95`, `jitter_p95`, `margin_m` and `late_turns`, and
`relay_stats` carries `rtt_ms_p95_<region>` and `turn_overrun_ms_p99`. Two weeks of production numbers decide the order
below: N2 pays off only if the turn wait dominates (low RTT, low `margin_m`). N6 tuning pays off only if `margin_m` or
`late_turns` are high.

Tooling note: `latency/measure.mjs` (the plan's scratch harness) hardcodes `SIM = 19`, its `SIM_HASH` and `PROTO = 4`.
Point it at `pawlegends/src/net/sim-stamp.json` (as `infra/gcp/tools/ws-latency.mjs` does) before the v20 relay is
live, or the relay refuses its `hello`.

## Today's budget (B = 1, 60 ms 4G link)

RTT/2 (30) + average wait for the turn to close (33) + playout B (67) + frame (16) ≈ 150 ms; p95 ≈ 200 ms
(MULTIPLAYER.md §4.3). The `net-rtt` harness (`tests/perf/net-rtt.test.ts`, now a CI job) measures applied p50/p95 of
38/65 ms at 0 ms RTT, 96/128 at 50 ms, 220/259 at 150 ms, 288/377 at 150 ms with heavy jitter. N2 to N4 attack the
turn wait and the playout share.

## N2. One tick per turn (TURN_TICKS 2 → 1)

**Why.** The turn wait averages half a turn (33 ms) and the playout floor is one turn (67 ms). At 1 tick per turn,
both halve: about −50 ms on applied p50 at every RTT (harness estimate; confirm with the harness first).

**Change.**

- Backend `party-limits.ts:96-97`: `TURN_TICKS = 1`, `TURN_MS = 100 / 3`. Every timer derived from `TURN_MS`
  (beats, catch-up pacing, reclaim windows) must be re-read: several count turns, not ms.
- Client `net/lockstep.ts:26` `TURN_MS`, `MAX_B` (keep `MAX_MARGIN_MS` at today's 267 ms, so `MAX_B` doubles to 9),
  `MARGIN_FALL_MS`, and the `turnTicks` field the relay already sends in `match` (the client must read it, not assume
  2). `net-core.ts` `apply` steps `sub` 0 and 1: with one tick per turn, step only `sub` 0.
- Wire: TURN entries carry `sub`. With one tick per turn, `sub` is always 0; keep the field (no format change) but
  refuse `sub = 1` in a 1-tick room.
- `PROTO` 4 → 5. The relay accepts 4 and 5 during the overlap: a room is created with the turn length of its first
  seat's proto, and a PROTO 4 seat can only join a 2-tick room. Quick Play matches by proto. Drop PROTO 4 one release
  after every OTA channel has a PROTO 5 bundle (check `mp_net` by build).
- The sim does not change (it steps ticks), so no sim version is needed for N2 alone. The referee replays the same
  ticks. But `room.ts` `pilotTicks` and every `TURN_TICKS` multiplier must be re-checked.

**Cost.** Turn frames double: about 7.7 → 15 KB/min down per client at idle (harness bytes), roughly double the
relay's egress and packet rate. Re-run `mp/load.mjs` at 5v5 with 150 rooms on t2d-standard-2. The current cap (100
rooms) was 70 % of the measured budget at 2 ticks per turn. Expect to lower `max_live_rooms` or move to
t2d-standard-4.

**Tests.** The net-rtt harness at TURN_TICKS 1 (it already reads `Room`), the relay specs that count turns
(`room.spec.ts`, `party-lobby.relay.spec.ts`), a PROTO 4 + 5 mixed-party spec, and a load run.

## N3. Moves twice as often (MOVE_MIN_GAP 4 → 2)

**Why.** The sim applies one move every 4 ticks (133 ms). A quick change of direction waits up to 133 ms. At 2 ticks it
waits up to 67 ms. This needs a sim version, because it changes which commands apply.

**Change.**

- `pawlegends/src/data/limits.ts:24` `MOVE_MIN_GAP = 2`, applied in `sim/input.ts:88` (version-gated like every sim
  rule: the old value for old replays).
- The input stream grows: raise `MAX_INPUT_BYTES` (30,600) and `MAX_INPUT_CHARS` (40,800) by the measured worst case.
  Measure a 7-minute 5v5 bot match with moves every 2 ticks first. Mirror the new caps in
  `backend/src/shared-contracts/caps.ts` and `shared/caps.ts` `PAWLEGENDS_MAX_INPUT_CHARS` (`node
  scripts/sync-contracts.mjs`). Check that `LIVE_GAME_BODY_LIMIT = '64kb'` (`backend/src/user/dto/live-game.dto.ts:47`)
  still fits the largest `POST /user/catbassadors/live` body. Raise it there and nowhere else.
- The client's `MoveCoalescer` sends at most one Move per turn. With N2 it sends one per 33 ms turn. The relay's binary
  token bucket (40/s, burst 60) still fits.

**Tests.** Sim golden for the new version, the replay caps spec, the live-game DTO spec, and the input-gate unit tests.

## N4. Shorter interpolation delay (INTERP_LAG 1.6 → 1.0 tick)

**Only with N2.** In party play the worker publishes one snapshot per turn, which is 2 ticks today
(`net-core.ts` `publish`). `INTERP_LAG = 1.6` (`render/interp.ts:9`) is already shorter than that gap. At 1.2 or 1.0,
other heroes would reach the newest snapshot and stall until the next one arrives (visible stutter). With one tick per
turn, snapshots come every tick, and 1.0 tick of lag is safe. That is about −20 ms on how far behind other heroes are
drawn.

**Change.** `INTERP_LAG` by snapshot spacing. Use 1.0 when `turnTicks === 1`, else 1.6. Keep solo (LocalHost, one
snapshot per tick) at 1.6 unless the solo feel pass asks otherwise. Re-check `SnapBuffer.peekEvents` (the director's
≈ 53 ms of lookahead shrinks with it).

**Tests.** `interp` unit tests at both spacings, plus a render e2e that counts frames where a moving enemy hero does
not move.

## N5. The socket in the worker (after the drain work merges)

The net-host worker steps the sim. The socket lives on the main thread and forwards every TURN by `postMessage`, so a
long main-thread frame (a GC, a layout) delays turns. Moving `PartySocket` into the worker removes that hop. It rewrites
the lifecycle of `socket.ts` (open, resume, reconnect), which the live-match deploy work is changing now, so it waits
for that work to merge. Measure first: with `mp_net` `late_turns` and a main-thread long-task count in `perf_sample`,
check that main-thread stalls actually delay turns.

## N6. Jitter buffer tuning (no protocol change; data first)

It is already adaptive: p90 lateness over 45 samples, falling about 8 ms per sample. Tune only if production
`margin_m` or `late_turns` are high. Candidates are a p80 target with a faster fall, or a separate floor for
Wi-Fi and cellular (`net_type`). Use the net-rtt harness's jittery profile as the regression gate.

## G2-G5. A second region (only when a second region exists)

Today the relay is one VM behind the regional external ALB in europe-west3. The Terraform variable `relay_region`
exists but must equal `region` (validated): a regional ALB cannot have backends in another region.

- **G1, infra.** One relay and one regional ALB per region (the plan's `relay_regions` `for_each`), with a Cloudflare
  load balancer or per-region hostnames (`eu.api…`, `us.api…`). Rooms stay single-owner: a party never spans relays.
- **G2, region probe.** Before Quick Play, the client opens a short WebSocket to each region's `/pawlegends/ws/healthz`
  (or does 3 pings) and keeps the best RTT per region in session storage.
- **G3, matchmaking by ping.** `mm.join` carries `{ region: rtt }` (a queue protocol change: PROTO bump). The
  matchmaker prefers players whose best region is the same, and widens after a wait.
- **G4, party code prefix.** A party code starts with its region letter, so a friend's join goes to the relay that holds
  the party without a lookup.
- **G5, region picker.** Settings has Auto (best ping) and each region by name. Show the measured ping beside each.

## Order

1. Two weeks of `mp_net` and `relay_stats` data (shipped).
2. N2 + N4 together (one PROTO bump, no sim version), with the load test.
3. N3 in the next sim version after v20.
4. N5 after the drain work merges.
5. N6 if the data says so.
6. G1-G5 when a second region is funded.
