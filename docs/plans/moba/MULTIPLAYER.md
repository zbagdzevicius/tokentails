# Paw Legends Party Play: final architecture and build spec

**Mode:** co-op against bots. 1 to 3 humans share the player team (slots 0 to 2). Bots fill every empty slot.
**Worktree:** `/Users/zygimantasbagdzevicius/me/tokentails-pawlegends-mp` (branch `feat/pawlegends-mp`, base a923f0ac, merged with `feat/pawlegends` c49733c2; `SIM_VERSION = 13`, `PARTY_SINCE = 13`).
**Status:** final. It merges the draft with the netcode review (B1 to B4, determinism, latency, reconnect, server) and the security and casual-UX review (S1 to S9, U1 to U7). Every accepted review point is folded into the section it changes. §15 lists what was cut and why.

### Merge notes (2026-11-06: `feat/pawlegends` c49733c2 merged in; sim v13 shared with the dogs)

- **Resolved 2026-11-07 (dogs merge):** party play shipped to production as v13 without the dogs, so the dogs ride **`SIM_VERSION = 14`**. `tools/vendor-sim.mjs` freezes the released v13 at eaba6ae7 (bundle `7daed0d2…`, party API included, so v13 party clients stay served through `PARTY_SIMS`); the backend verifies 10 to 14. `PARTY_SINCE` stays 13, and party play works on v14 with dogs in the pick pool. The relay's lobby offers the live (v14) heroes; a party pinned to the older v13 sim with a hero v13 lacks gets `update_required` instead of a room. `party-identity.json` was regenerated from the dogs' single-player sim (262c36a0, its v13 fixtures) and the merged v14 tree matches it.
- Sim v12 shipped to production **without** party code, so party play rides **`SIM_VERSION = 13`** and `PARTY_SINCE = 13`. `tools/vendor-sim.mjs` freezes the released v12 at 5bf2a938 (bundle `59426998…`); v10 and v11 stay frozen. v13 is **not** live and nothing new is frozen: the dogs branch (`feat/pawlegends-dogs`, `docs/plans/moba/DOGS-V13.md`) builds its five dog heroes into the **same** v13 and merges on top of this branch.
- Single-player v13 equals v12 until the dogs land: `tests/unit/golden/party-identity.json` was regenerated on a clean c49733c2 worktree (v12 fixtures, 20 fuzz seeds, 5 bot runs), and `tools/determinism.mjs --seeds 200` gives the same rows (hero, ticks, commands, finalHash, input size) on c49733c2 and on the merged tree.
- **Files the dogs v13 merge will touch in common with this branch** (expect conflicts or a re-run in these, nowhere else):
  - Sim: `pawlegends/src/sim/version.ts` (both say 13: no conflict), `src/sim/api.ts`, `src/sim/index.ts`, `src/sim/bots/brain.ts`, `src/sim/combat/damage.ts`. The party edits there are small and additive (`humans` in `MatchConfig`, `PartyReplayRecord`, party exports, `isHumanSlot` guards in the brain and in `combat/damage.ts`, including v12's struggling-human respawn rule, which now covers every party human); keep both sides.
  - Tooling: `pawlegends/tools/vendor-sim.mjs` (the v12 `FROZEN` entry is byte-identical on both branches; keep the dogs' hero ids and `dog-replay.fixture.json`, and this branch's party facade, `PARTY_SIMS`, net bundle and `prev/`), `tools/vendor-sim.test.mjs`, `tools/lib/fuzz-entry.ts` (party fuzz appended at the end).
  - Tests: `tests/unit/round2.test.ts`, `sim-v7.test.ts`, `sim-v10.test.ts`, `sim-v11.test.ts` (the same `SIM_VERSION` 13 pins on both sides).
  - Backend: `backend/src/pawlegends/pawlegends-live.spec.ts` (sim versions `[10, 11, 12, 13]`), `pawlegends-replay.dto.ts` (doc comment), `pawlegends-replay.worker.ts` (doc comment). Generated, never hand-merged: `backend/src/vendor/pawlegends-sim/**`, `backend/src/vendor/pawlegends-net/**`, `pawlegends/src/net/sim-stamp.json`: run `npm run vendor-sim` after the merge.
  - Client and docs: `client/components/pawlegends/bridge.ts`, `docs/DEVELOPMENT.md`, `docs/GAMES.md`, `docs/plans/moba/GDD.md`.
- **After the dogs merge:** the dogs change single-player play (new heroes in the pick pools), so regenerate `party-identity.json` from the dogs' v13 single-player sim **before** this branch's party code is in it (a worktree at the dogs commit with `tests/unit/party-identity.test.ts` copied in, `PARTY_GOLDEN_WRITE=1`, `VENDOR` pointing at that commit's v13 fixtures), then prove the merged tree matches it, as above. `party-sim`, `party-pilot-purity` and `party-order` must stay green with dogs in the party pick pool.
- Friend slot rings moved off the relation colours (main's ally blue / enemy red / self yellow, `RELATION_CSS`): slot 0 mint, 1 violet, 2 orange.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| D1 | **Humans are only on slot 0's team in v1.** "Friends vs friends" is a later unscored Custom mode (§15). | Lockstep gives every client the whole world state, so a client could see through fog. Collusion would make scoring meaningless. The sim's human modifiers (`humanDamageBp`, respawn, rally) are tuned for humans against bots. In co-op, fog only hides bots, so a map hack gains nothing. |
| D2 | **Server-clocked relay lockstep with an authoritative referee.** No state sync, no rollback, no peer host. | The sim is deterministic, integer-only and proven identical on Node, Chromium and WebKit. The server never waits for a slow phone (the Honor of Kings model). A leaving host cannot end a match. Peers never see each other's IP. |
| D3 | **Turn = 2 ticks (66.7 ms, 15 Hz).** The sim still runs at 30 Hz. | The frame cadence proven in mobile MOBAs. It halves the message rate. `MOVE_MIN_GAP = 4` ticks (`data/limits.ts:24`) already limits moves to one per 2 turns. |
| D4 | **The sim needs a change.** It is additive, lives mostly in `src/sim/party.ts`, and keeps single-player output byte-identical. It touches two bot-brain lines (§1.3). | `step()` only applies slot 0, and `stepBots` drives every other slot. A friend cannot get a hero without a change. The pilot must also stop writing hashed state for human slots (B1). |
| D5 | **No new opcode.** Dropout, AFK, late load and empty open seats are handled by the **server piloting the slot** with `createPlayerBotFor`. Pilot commands are ordinary stream commands for that slot. Surrender is the existing `Op.Forfeit`, injected by the server into slot 0's stream after a vote. | Replays verify unchanged. Clients need no bot code path. The pilot is the full-strength brain, not a weak autopilot. |
| D6 | **Transport:** one WebSocket (`ws`, ≥ 8.17.1, added as a new direct dependency; it is **not** in the lockfile today) on the Nest HTTP server with a `noServer` upgrade. JSON text frames for lobby and control, binary frames for commands, turns and hashes. | The browser `WebSocket` adds 0 KB and works in Safari, WebViews, Capacitor and behind Cloudflare. 8.17.1 fixes CVE-2024-37890. |
| D7 | **Scoring stays on `POST /user/catbassadors/live`.** The client posts a small `{room, slot, ...}` result. The backend checks it against the **room log the relay stored**, re-simulated once per room. The relay never writes scores. | One write path. 3 × 40,800-char inputs would break the 64 KB body limit. A server-stored log prevents forged results. |
| D8 | **No free text from players reaches other players.** Names shown to peers are a server-generated adjective plus the card's catalog or breed name ("Sunny Tabby"), or a generated guest name. A renamed cat's custom name is shown **only to its owner**. Comms are enumerated pings, quick-chat lines and emotes. | Starter cats can be renamed (`cat.controller.ts:345-357`), and `normalizeCatName` is a blocklist, not a guarantee. Links get forwarded to strangers and minors. |
| D9 | **No feature flags.** Party play is on by default. The ticket endpoint needs only its secret `PAWLEGENDS_PARTY_TICKET_SECRET`. Without it, rooms are unscored guest rooms and nothing else is disabled. | Repo rule. |
| D10 | **A party of one with Open seats off never reaches the relay.** Start runs the normal `LocalHost` solo match, scored through the existing v:1 path. The party stays open, so friends can join for the next match. | Saves server CPU and latency, and removes the cheapest `server_busy` DoS (S3). |
| D11 | **No ready check.** Start goes straight to pick when every member is connected and visible. An away member shows a "Waiting for Mira · Nudge" chip. | A ready check filters strangers in matchmaking. Among friends it is one more tap and a failure mode (U1). The pick timer and late-load pilot already handle slow people. |
| D12 | **Every invite URL is the embed URL** (`https://tokentails.com/pawlegends?party=K7QX2M`), even from the app or the standalone build. | Only the embed host has a guest session that can mint a guest ticket, so the friend is scored as a guest account instead of getting nothing (U3). |
| D13 | **The relay runs in the Nest process; the sim never does.** Sockets, the turn clock and JSON run on the main thread. Every sim step (referee and pilots) runs in `worker_threads`. Event-loop delay is measured, and new rooms are refused when it is too high. | GDD §9.6 rejected the Nest box because sim CPU would starve the API. Moving all sim work to workers removes that concern. The relay itself only orders bytes. `DEPLOYMENT.md` has no process manager, so a second process is deferred (§15). |

### Why this beats Fortnite and League of Legends

- **A friend joins in 2 taps with no account and no install:** tap the link, pick a hero. The leader needs about 5 taps. Fortnite needs a 20 GB+ install and an Epic account. LoL is PC-only, and Wild Rift is a separate install and account.
- **Guests are scored.** A friend who wins keeps the catnip on a guest account and is asked to sign in to keep it forever.
- **A full-strength bot holds your hero the moment you drop.** You reclaim it on the next turn after you catch up. LoL leaves the team 4v5 or offers a remake. Mobile Legends uses a weak autopilot.
- **Rejoin needs no loading screen.** The client fast-forwards from the server log ("Catching up 62%" on the rail).
- **Deploys and restarts do not end matches.** Rooms are checkpointed with a lease and restored (N9). The party itself is restored too.
- **Nobody is dodged, kicked or requeued for being slow.** Pick timeouts auto-lock, and slow loaders are piloted until they arrive.
- **The party persists.** "Play again together" is the default, last picks are prefilled, and a member who is new to the game is guided on the rail.
- **Voted pause** (safe because the enemies are bots) and a surrender vote that cannot be griefed early.
- **Your IP is never shared** with other players, because everything is relayed.
- **Cross-play on one build:** web, the client iframe and the Capacitor app.

---

## 1. Sim changes (lane N0, blocks everything)

> **Resolved 2026-11-06 (see Merge notes at the top):** v12 shipped without party code, so party code rides v13 with `PARTY_SINCE = 13`. The original warning follows for history.
>
> **MERGE WARNING. Say this loudly in every report and in the merge PR.**
> The other workflow is bumping `SIM_VERSION` to 12 on `feat/pawlegends`. It also edits the bot brain, so `bots/brain.ts` and `bots/orders.ts` **will conflict**.
> - This change does **not** bump `SIM_VERSION`. Single-player output (hashes, logs, replays, v10 and v11 fixtures) stays byte-identical, and a test proves it.
> - The v11 vendored **bundle sha** changes on this branch, because the bundle now contains party code.
> - **Rule:** `PARTY_SINCE` = the first `SIM_VERSION` that **shipped to production** with party code. Freeze the bundle that is actually in production, never a reconstructed one.
>   - If this branch merges into the v12 work before either ships: party code rides v12, set `PARTY_SINCE = 12`, and the frozen v11 is the pre-party bundle from the v12 workflow's commit.
>   - If this branch ships first as v11: keep `PARTY_SINCE = 11`, and the v12 workflow must freeze **this** v11 bundle.
> - The backend refuses party results whose `simVersion < PARTY_SINCE`.
> - After the merge, run `npm run vendor-sim`. Never hand-merge the vendor directory.
> - Merge checklist: `party-identity`, `party-pilot-purity` and `party-order` tests green on the merged tree, `lint:sim`, `vendor-sim:check`.

### 1.1 API (all additive)

`src/sim/api.ts`:
- Add `MatchConfig.humans?: readonly number[]`: human slots in ascending order, always containing 0, a subset of `{0,1,2}`. Omitted means `[0]`.
- `ReplayRecord` (v:1) is unchanged. Add `interface PartyReplayRecord { v: 2; simVersion; seed; difficulty; humans: {slot, hero, trick}[]; picks: HeroId[6]; tricks: TrickId[6]; ticks; inputs: string[] /* base64 of each human slot's post-gate log, same order as humans */; outcome; finalHash; mutator? }`.

`src/sim/party.ts` (new; all party logic):
- `PARTY_SINCE = 13` (see the merge rule and the Merge notes: v12 shipped without party code).
- `isHuman(m, slot)`: true for slots in `config.humans`; returns `slot === 0` when `humans` is absent.
- `createPartyState(config)`: one `InputGate` and one `TimedCommand[]` log **per human slot ≥ 1**. Slot 0 keeps `m.gate` and `m.log`.
- `applyPartyInputs(m, tick, bySlot)`: slots 1 then 2 (see §1.2 for the exact place):
  - drops `Op.Ping` and `Op.Forfeit` from slots ≥ 1 before the gate (not logged, not hashed);
  - runs `gateCommand` with that slot's gate;
  - folds into `G.InputHash` as `fnvBytes(fnvInt(fnvInt(h, tick), slot), bytes)`. The slot is folded only for slots ≥ 1, so slot 0's fold is unchanged;
  - calls `applyOrder(m, slot, cmd)`.
- `fillPicksParty(seed, humans: {slot, hero, trick}[])`: draws bots exactly like `fillPicks(seed, humans[0].hero, humans[0].trick)`, then overwrites the human slots. **Invariant:** `fillPicksParty(s, [h0])` deep-equals `fillPicks(s, h0.hero, h0.trick)`.
- `partyReplayRecord(m)` (built from `m.log` plus the party logs, which are post-gate), `runPartyReplay(r)`, `checkPartyShape(r)`.
- `createPlayerBotFor(m, profile, slot)`: forks the RNG as `player-bot:<profile>` for slot 0 (unchanged) and `player-bot:<profile>:s<slot>` otherwise. Every pilot, for every slot, gets its own `SelfOrder` (`mine`), like slot 0's today. The `pinger` profile is refused for slots ≥ 1.

`src/sim/index.ts`:
- `step(match, commands?, others?: readonly (readonly Command[] | undefined)[])`: one new optional parameter and one call, placed as in §1.2.
- `createMatch` calls `createPartyState` only when `config.humans` has more than one entry.
- Re-export the party API.

`src/sim/server.ts`: export `verifyPartyReplay(record)`. Shape check (`humans` valid, no duplicates, no slot ≥ 3; heroes and tricks valid; per-slot `inputs ≤ MAX_INPUT_CHARS`; `ticks ≤ MAX_TICKS`), then re-simulate and compare ticks, outcome and finalHash. `verifyReplay` is unchanged.

`tools/lint-sim.mjs`: no change. `party.ts` sits under `src/sim`, so it is integer-linted automatically.

### 1.2 Same-tick input order (fixed, B2)

Inside step 1 of `step()`, in this exact order:

1. slot 0 ping
2. slot 0 command
3. the forfeit block (`index.ts:242-246`, which folds into `G.InputHash`)
4. slot 1 command (ping and forfeit already dropped)
5. slot 2 command
6. then `stepBots` as today

`applyPartyInputs` is called **after the forfeit block**. A golden test pins the resulting `InputHash` when a forfeit and a slot-1 command land on the same tick.

### 1.3 Touched sim files outside `party.ts`

| File | Change | Single-player effect |
|---|---|---|
| `bots/index.ts` | `if (slot === HUMAN_SLOT …) continue` becomes `if (isHuman(m, slot) …) continue`; `createPlayerBot` delegates to `createPlayerBotFor(m, profile, HUMAN_SLOT)` | none |
| `bots/orders.ts:34` (`applyPing`) | skip `isHuman(m, id)` instead of `id === HUMAN_SLOT` (**B1**) | none; differs only when `m.party` is set |
| `bots/orders.ts:56` (`orderOf`) | return -1 for `isHuman(m, id)` instead of `id === HUMAN_SLOT`, so it never clears hashed `botOrd*` for a human slot (**B1**). `orderOf` gains the match (or the `humans` mask) as an argument | none |
| `bots/brain.ts:721,728` (`think`) | `if (mine) mine.until = -1; else w.botOrd[id] = 0` (**B1**). In-sim bots always pass `mine = null` | none |
| `heroes/talents.ts:182` | skip auto-talents for `isHuman` | none |
| `combat/damage.ts:79,81` (`humanDamageBp`, `humanTakenBp`), `damage.ts:214,244` (respawn), `effects/bonus.ts:39` (panic) | use `isHuman` (the hero belongs to a human even while piloted) | none |

**Why B1 matters.** `botOrd*` is in `hashedArrays` (`world.ts:599`). Pilots run only on the referee. If a pilot for slot 1 or 2 clears `botOrd[1]` (`orderOf` or `think`), the referee hash differs from every client, every resync rebuilds the same client state, and the room ends unscored. Likewise, an unpatched `applyPing` writes bot orders and `bark` events into friends' heroes.

**Stays on slot 0 (the leader) in v1**, because it is bot-brain or match behaviour, not human identity: `HUMAN_SLOT` uses in `bots/brain.ts` (other than the lines above), `bots/pinger.ts`, `progression/xp.ts:78` (XP catch-up), `progression/levels.ts:56`, `units/minion.ts`, `units/core.ts`, `combat/projectile.ts`, the `match.ts` outcome and forfeit (every human is on slot 0's team, so `outcome` is right for all), and the `G.HumanActAt` and `G.HumanPX` globals.

**Known balance gap (not a bug):** friends in slots 1 and 2 get no XP catch-up. The GDD line says so, so playtesters do not report it.

### 1.4 Determinism rules

- **The local sim only consumes decoded TURN bytes,** including your own commands. A client never feeds its own `Command` object to its sim. `encodeCommand` quantizes `x`/`y`, so every peer and the referee apply the same values.
- Pilot RNG forks from the root seed only (`rng.ts:52`), so it is independent of world RNG. After a restore (N9) pilot memory starts fresh. That is fine, because pilot output is logged as commands.
- Module-level scratch state (`brain.ts:200,202,313`, `nav/astar.ts:31-33`) is reset before each use and the code is synchronous, so many rooms can share one referee isolate. A test interleaves rooms to keep it that way.
- Talents for human slots come only from `Op.Talent` commands. The pilot must issue them (`playerBotCommands` already does for slot 0; the pilot test checks slots 1 and 2).

### 1.5 Acceptance tests (N0)

| Test | File |
|---|---|
| Every vendored fixture (v11 rookie, champion), all 20 determinism fuzz seeds and every replay in `tests/fixtures` give the same `finalHash` and trail as a golden JSON produced on a923f0ac and committed with the test. | `tests/unit/party-identity.test.ts` |
| `fillPicksParty(seed,[h0])` equals `fillPicks` for 1,000 seeds. | `tests/unit/party-picks.test.ts` |
| A 3-human match driven by 3 `createPlayerBotFor` streams runs to the end. `partyReplayRecord` → `runPartyReplay` gives the same hash. Swapping the slot 1 and slot 2 streams changes the hash. | `tests/unit/party-sim.test.ts` |
| Ping and Forfeit from slots ≥ 1 are dropped and not logged. The per-slot byte budget is independent. A slot-1 command never touches `m.log`. | `tests/unit/party-sim.test.ts` |
| **Order golden (B2):** a forfeit and a slot-1 command on the same tick produce a fixed golden `InputHash`. | `tests/unit/party-order.test.ts` |
| **Pilot purity (B1, mandatory, part of the merge checklist):** 50 seeds, `humans:[0,1,2]`, a pinger driving slot 0. Calling `playerBotCommands` for slots 0, 1 and 2 every tick leaves the world hash and `w.rng.state` unchanged across each call. A leader ping never changes `botOrd*` of slots 1 and 2. | `tests/unit/party-pilot-purity.test.ts` |
| A human slot with an empty stream idles (it is not bot-driven). The same slot driven by `createPlayerBotFor` is within 10% of in-sim bot gold and kills over 50 seeds, and it takes talents. | `tests/unit/party-pilot.test.ts` |
| **Mode-flip fuzz:** pilot ↔ human switches at random turns. Node vs Worker on Chromium and WebKit, 10 seeds, `humans:[0,1,2]`, including the inline (no Worker) path, run against the **production preview build**. | `tools/lib/fuzz-entry.ts` (`party: true`, `flips: true`), `tests/e2e/determinism-browser.spec.ts` |
| `verifyPartyReplay` rejects tampered inputs, a wrong slot list, slots ≥ 3, duplicate slots and oversize inputs. | `tests/unit/party-verify.test.ts` |
| `npm run lint:sim` and `npm run vendor-sim:check` pass. The backend `simFor(11).verifyPartyReplay` exists. | CI |

---

## 2. Protocol (lane N1)

**Shared, pure, no DOM:** `pawlegends/src/net/proto.ts`. It is vendored to the backend as `backend/src/vendor/pawlegends-net/` by extending `tools/vendor-sim.mjs` with a second bundle (`pawlegends-net.bundle.ts`) and its own sha file. `--check` and `--check-remote` cover both bundles.

### 2.1 Versioning, handshake and version skew

- `PROTO = 1`. Bump it on any wire change, **including the order of bits in TURN masks**. A golden-bytes codec test fails CI on any accidental reorder.
- `SIM_HASH`: the first 16 hex characters of a sha256 over the **sim source closure** (the sorted list of files esbuild pulls from `src/sim/server.ts`, hashed by content).
  - Computed by `tools/lib/sim-source-hash.mjs`.
  - Vite injects it as `__SIM_HASH__` (`vite.config.ts` define).
  - `vendor-sim` writes it as `simSourceHash` into `pawlegends-sim.sha256.json`, for the live bundle and for each frozen bundle.
- **Skew window (deploys are separate: backend on DigitalOcean, game on Vercel).** The relay accepts any `{simVersion, simSourceHash}` for which it holds a bundle:
  - the live bundle;
  - every frozen `simFor(v)` bundle;
  - the **previous live bundle**, which `vendor-sim` keeps one-deep in `backend/src/vendor/pawlegends-sim/prev/` whenever the live `simSourceHash` changes.
  Each party and its rooms are **pinned to the leader's version**. A member whose version differs from the leader's gets `error{code:'update_required'}`. Deploy the backend first, then the game.
- Mismatch handling: `update_required` comes **before the lobby**, never mid-match. The UI shows "Update to play together" with Reload. In the embed it also sends a bridge `notify` so the host can cache-bust.
- **Golden self-test at load (build skew `SIM_HASH` cannot see):** the net-host worker runs 300 ticks of a fixed seed with `humans:[0,1,2]` and fixed pilot streams and compares the hash with `__SIM_GOLDEN__`, which Vite injects from a run of the vendored bundle (about 25 ms). On mismatch it shows `update_required` and never joins a lobby.
- Different UI builds may play together when `PROTO`, `SIM_VERSION` and `SIM_HASH` match.

### 2.2 Endpoint

- `wss://<api host>/pawlegends/ws`, derived from the API base the host passes (embed) or `VITE_PAWLEGENDS_API` (standalone). Subprotocol `pl.1`.
- The ticket is never in the URL, so it stays out of access logs. It travels inside `hello`.

### 2.3 JSON text frames `{t, ...}`

Rules for every JSON frame: ≤ 1 KB, length checked **before** `JSON.parse`; hand-written guards check `typeof` for every field and reject unknown keys; input is never echoed back in `error` frames; rate limit 5 per second, burst 10, per socket (over the limit is a strike).

**Client to server**

| t | Fields | Who and when |
|---|---|---|
| `hello` | `proto, sim, simHash, build (^[a-z0-9.\-]{1,32}$), ticket?, guestKey?, resume?:{token}, hint?:{maxDifficulty, newbie}` | first frame, within 5 s of opening. `hint` only sets UI defaults (§5.1) and is never trusted for anything else |
| `party.create` | `difficulty` | after `welcome` |
| `party.join` | `code` (`^[2-9A-HJ-NP-Z]{6}$` after upper-casing) | lobby |
| `party.leave` / `party.kick{member}` / `party.lead{member}` | | leave: anyone; kick and lead: leader |
| `party.set` | `difficulty?, openSeats?, locked?` | leader, lobby or results |
| `party.newcode` | | leader |
| `party.card` | `catId \| null` | any, lobby or results |
| `party.start` | | leader |
| `party.nudge{member}` | | any, 1 per 10 s |
| `pick.hover{hero}` / `pick.lock{hero,trick}` | | pick phase |
| `load{pct}` / `loaded` | | loading |
| `vote{kind:'surrender'\|'pause'\|'resume'\|'rematch', yes}` | | match or results |
| `social{kind:'ping'\|'chat'\|'emote', id, x?, y?, target?}` | `id` from `src/data/social.ts`; `x`,`y` integers clamped to map bounds; `target` a live unit id, else dropped | match |
| `sync{fromTurn}` | at most 1 per 5 s, only from the socket bound to the slot | match |
| `away` / `back` | | match |
| `bye` | | leave the match (the slot stays piloted) |

**Server to client**

| t | Fields |
|---|---|
| `welcome` | `proto, member, resumeToken, serverMs, lastSeq?` |
| `error` | `code`: `update_required`, `bad_ticket`, `party_not_found`, `party_ended`, `party_full`, `party_busy`, `party_locked`, `kicked`, `rate_limited`, `server_busy`, `room_gone`, `seat_elsewhere`, `bad_message`. Plus `retryMs?` |
| `party` | `code, phase:'lobby'\|'pick'\|'loading'\|'match'\|'results', leader, difficulty, openSeats, locked, deadlineMs?, waiting?:member[], members:[{id, name, guest, newbie?, card?:{image, element, tier}, conn:'on'\|'away'\|'off', slot?, hero?, trick?, locked?, loadPct?}]`. Each member's **own** copy adds `card.catId` and `ownName` (the custom name, owner only). Broadcasts are coalesced to at most 10 Hz per party |
| `match` | `room, config:{seed, picks, tricks, difficulty, humans}, cosmetics:{heroSkins}, you:{slot}, turnTicks:2, startTurn, startInMs, lastSeq` |
| `slot` | `slot, reason:'drop'\|'afk'\|'away'\|'late'\|'left'\|'back'\|'desync'` (reason text only; human/pilot state comes from TURN mode bits) |
| `vote` | `kind, yes:member[], need, endsMs` or `result:'pass'\|'fail'` |
| `social` | echo with `from` |
| `nudge` | `from` |
| `resync` | `reason:'desync'\|'gap'` (CATCHUP follows) |
| `end` | `winner, outcome, ticks, finalHash, scored:boolean, why?` (`scored` and `why` are per recipient, never shown to peers) |

### 2.4 Binary frames (first byte = type; varints as in `sim/commands.ts`)

Sizes are enforced per type **before** decoding. Any other first byte is a strike.

| Type | Direction | Layout | Max size |
|---|---|---|---|
| `0x01 CMD` | C→S | `seq varint · encodeCommand bytes` (no client `sub`: the client cannot know the server's turn phase) | 10 B |
| `0x02 BEAT` | C→S | `lastTurn varint · clientMs u32` | 8 B; every 500 ms in match |
| `0x03 HASH` | C→S | `tick varint · hash u32` | 8 B; at each trail push (every 30 ticks); not sent during catch-up |
| `0x81 TURN` | S→C | `turn varint · modeMask u8 (bit s = slot s piloted) · ackMask u8 · acks (seq varint per set bit, per human slot) · n u8 · n × (packed u8: slot u3, sub u1, pilot u1 · command bytes)` | 3–32 B; 15 Hz |
| `0x82 CATCHUP` | S→C | `fromTurn varint · toTurn varint · last u8 · concatenated TURN bodies` | 16 KB per chunk |
| `0x83 ECHO` | S→C | `clientMs u32 · serverMs u32` | 9 B; answers each BEAT |

**Sequence numbers and re-sends (B3):**
- The server keeps `lastSeq[slot]`. It survives reconnects, is checkpointed in the room, and any CMD with `seq ≤ lastSeq` is dropped.
- `welcome` (on resume) and `match` return `lastSeq`. The client discards everything up to it and continues from `lastSeq + 1`, also after a reload.
- After a reconnect the client re-sends only unacked commands **younger than 500 ms**, and none at all if the slot was piloted in between (TURN mode bits tell it).

**Codec tests** (`tests/unit/net-proto.test.ts`): round-trips; golden bytes for every frame type; a fuzz of 100k random byte strings to every decoder, which may throw only `ProtoError`, never hang and never allocate more than 64 KB.

---

## 3. Backend relay (lanes N2 to N5, N8, N9)

### 3.1 Wiring

- **Dependency:** add `ws` (≥ 8.17.1, pinned exact) and `@types/ws` to `backend/package.json`. No `@nestjs/websockets`, no socket.io.
- `backend/src/pawlegends/party/party-relay.service.ts` (`OnApplicationBootstrap`, `OnApplicationShutdown`):
  - takes the HTTP server from `HttpAdapterHost`;
  - `new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false })`;
  - handles `upgrade` only for path `/pawlegends/ws`;
  - checks `Origin` against `corsOrigins()` (this is hygiene, not authentication: any non-browser client can send an allowed Origin). A missing Origin is refused. The e2e harness allows it only through a **constructor option of the harness module**, never an env var or a header;
  - **client IP on the upgrade (S1):** `shared/relay-client-ip.ts`. Trust `cf-connecting-ip` (only when it parses as an IP) from a Cloudflare peer, or from our private ingress hop when the request really came through Cloudflare (on DigitalOcean: the first X-Forwarded-For entry from the right that is not a private hop is a Cloudflare edge; on the split Google Cloud roles the balancer admits Cloudflare only); a direct caller through the ingress is keyed by the address the ingress saw. IPv6 is keyed per /64 (`clientIpKey`), like the Quick Play caps. This is local to the WebSocket path and does not change the HTTP routes;
  - applies the caps in §3.5;
  - on shutdown (SIGTERM): stops room clocks, sends `error{code:'room_gone', retryMs:3000}`, writes a final checkpoint with `handoff:true` (N9), then closes.
- Register in `app.module.ts`: `PartyRelayService`, `PartyService`, `RoomScheduler`, `RefereePool`, `PartyTicketService`, `RoomStore` (`MongoRoomStore`), and the `PawlegendsRoom` and `PawlegendsParty` schemas.

### 3.2 The room (pure class, fake-clock testable): `backend/src/pawlegends/party/room.ts`

**Turn clock:** `RoomScheduler` (`room-scheduler.ts`) is one drift-corrected loop (`setTimeout` against `performance.now()`), with a turn every 66.67 ms per room.
- Room phases are **staggered** by `hash(room) % 66 ms`, so 150 rooms do not send in one burst.
- A late loop closes every overdue turn in order. It never skips a turn and never waits for a client. It records `turn_overrun_ms`.

**Command intake:**
- Only from the socket bound to that slot, and only while the slot is `human`.
- `decodeCommand` from the vendored sim. A throw is a strike; 3 strikes disconnect the socket.
- Op whitelist: Move, AttackMove, Attack, Cast, Trick, Stop, Nap, Talent, and Ping for slot 0 only. Forfeit is **never** accepted from a client.
- Seq dedupe (§2.4).
- A command goes into the **currently open turn** of that slot: the first into sub 0, the next into sub 1. If both are taken, the newest replaces sub 1 (the sim gate's latest-wins rule). Pings (slot 0 only) are kept separately from moves, as in `gateCommand`. The server never schedules into a closed turn.
- **Move coalescing (B4):** the server keeps at most one Move per slot per open turn and replaces it with a newer Move. A token bucket (20 per second, burst 10) applies to non-move commands; over budget, a Move **replaces** the pending Move and other commands are dropped and counted. The last Move of a drag therefore always lands.

**Close turn T:** build the TURN frame (per slot at most 1 command and 1 ping per sub, plus `modeMask`), append it to the room log, broadcast it to every connected socket, post it to the referee.

**Log cap:** 160 KB per room. Past it, further commands are dropped. The sim's own 30,600 B per-slot gate is stricter anyway.

**Pilots:**
- Each human slot has `mode: human | pilot`, announced in TURN `modeMask`.
- While a slot is piloted, the referee produces its commands with `createPlayerBotFor(m, profileFor(difficulty), slot)`, using the strongest non-pinger profile in `PLAYER_PROFILES`. They are injected into the next open turn with the `pilot` bit set (UI and AFK accounting only; the sim ignores it).
- **Flip turn:** when a slot goes back to `human`, that turn discards the slot's pilot commands. The hero keeps the pilot's last order until the human issues one.
- `pilotTicks[slot]` is counted **by reason**: `drop`, `away`, `afk` (these count toward the AFK rule) and `late`, `desync`, `restore`, `open` (these never count).

**Votes** (relay-decided, results on the rail):
- `surrender`: allowed once `tick ≥ rules.forfeitFrom`. `need = connected ≤ 2 ? connected : 2`, counting connected humans (a lone human passes at once). Lasts 20 s, one vote per human per 90 s. On pass, the server injects `Op.Forfeit` into **slot 0's** stream at the next turn, even if slot 0 is piloted.
- `pause`: all connected humans within 10 s. The server stops closing turns (no turn, no tick, no sim change). 2 per match, at most 60 s each, auto-resume with a 3 s countdown; any human can `resume`. **A pause freezes the AFK timers and the silence timers.**
- `rematch`: results phase (§5.1).

**Timers:**

| Condition | Action |
|---|---|
| Socket silent 3 s (no BEAT) | `conn:'away'`; a "Laggy" dot for others |
| Silent 6 s, closed, or `away` received (tab hidden) | slot becomes `pilot` (reason `drop`, or `away` **immediately**) |
| Alive, no CMD for 45 s while its hero lives | rail warning to that player |
| No CMD for 60 s | `pilot`, reason `afk` |
| Not `loaded` at start + 20 s | `pilot` from tick 0, reason `late` |
| Zero connected humans and no human command yet | abandoned after **30 s** (S3) |
| Zero connected humans after play | abandoned after 120 s (unscored, status `abandoned`) |
| Tick ≥ `MAX_TICKS` with no end | assert (the sim ends at `safetyEnd`) |

**Reclaim:** a `back` from a client whose last **received** turn (BEAT `lastTurn`) is within 15 turns (1 s) of live makes the slot `human` from the next turn. The received turn, not the applied one: the jitter buffer holds up to 5 turns on purpose, and with 150 ms RTT a caught-up client applies 7 to 10 turns behind live (the old `B + 2` rule refused every reclaim on such a link). The client sends `back` at most once a second (the JSON limit is 5 per second). An AFK player reclaims with any CMD. Any frame from the slot (CMD, HASH, BEAT) counts as presence, so a BEAT delayed behind a busy phone is not a drop; the 3 s "laggy" frame is not a takeover and the rail says nothing about it.

**Leave mid-match:** `party.leave` gives the seat up: the member gets no more room messages, the seat is open again (piloted, reason `open`, claimable with Open seats) and the others see "left". `bye` (back to the title, party kept) only disconnects.

**Wall cap:** a room older than 60 minutes is abandoned (no match lasts that long; a stuck room never holds a live-room slot). A referee error abandons the room at once (clients get `room_gone`, the party goes back to results).

### 3.3 The referee: `party/referee.worker.ts` + `party/referee-pool.ts`

- A `worker_threads` pool of `max(1, min(4, cpus - 1))`. Rooms are hashed to workers. Each worker holds room matches from the room's pinned bundle (`simFor(v)` or `prev`) and steps them as TURN frames arrive.
- Each worker pushes trail hashes back for desync checks, produces pilot commands, and reports `end`.
- Cost: about 75 µs per tick, about 2.3 ms CPU per second per room.
- **Capacity is measured, not guessed.** `party-limits.ts` holds `MAX_LIVE_ROOMS = 60` until `mp/load.mjs` has run on the production droplet size, then the measured value (rooms per worker × workers, with 30% headroom). The load test also records resident memory per room and per worker.
- **Main-thread health (D13):** `perf_hooks.monitorEventLoopDelay`. When p99 > 20 ms over the last 10 s, new rooms are refused with `server_busy`. Running rooms are never stopped.
- **Referee lag:** pilot commands for turn T come from state at T-1 or T-2 (bots think every 6 ticks anyway). If a worker falls more than 30 turns behind, log `referee_lag` and refuse new rooms until it recovers.
- `server_busy`: the party stays in the lobby with a "Servers busy, retrying in 12s" countdown that retries every 15 s.

### 3.4 Heartbeat, backpressure and catch-up pacing (server side)

- RTT per socket from BEAT/ECHO, plus `ws.ping` every 5 s in match and 15 s in the lobby (Cloudflare idles out at 100 s). Lobby sockets silent for 45 s are closed. `TCP_NODELAY` stays on (the `ws` default).
- **Backpressure:** outside catch-up, `ws.bufferedAmount > 256 KB` closes with code 4001 and the client resumes.
- **Catch-up pacing:** the next 16 KB CATCHUP chunk is sent only when `bufferedAmount < 64 KB`. Catch-up is exempt from the 4001 rule. Each socket gets at most 1 MB of CATCHUP per minute.

### 3.5 Caps (single instance)

Identity = account id, else guest key hash, else verified client IP. Caps are keyed on identity first; per-IP caps are loose because of carrier NAT and school Wi-Fi.

| Item | Cap |
|---|---|
| Sockets per instance / pre-`hello` sockets / upgrades | 2,000 / 200 / 50 per second |
| Sockets per identity / per IP | 4 / 50 |
| Parties created per identity / per IP | 3 live and 20 per hour / 10 live and 60 per hour |
| Seats per person in one party | 1 (same account or guest key): joining again takes that one seat over, as a resume does (the older tab hears `seat_elsewhere`, "Playing in another tab"); the invite link gives a closed tab its seat back at once, even before the server noticed the old socket died |
| Live rooms per identity / per IP | 1 / 4 (guests included: rooms are counted by every seated identity and IP) |
| Live rooms | `MAX_LIVE_ROOMS` (§3.3); unticketed rooms may use at most 50% |
| Failed `party.join` per identity | 10 per 10 min (`rate_limited` with `retryMs`) |
| Failed `party.join` per IP / per network (/24, /48) | 30 per 10 min / 100 per 10 min: each backs off only itself (a new guest key does not reset the IP count) |
| Failed `party.join` per instance | 200 per minute logs `join_fail_global` (an alert). **Never a global lock:** one IP could otherwise stop joins for everyone. Guessing stays bounded by the per-IP and per-network caps (31⁶ codes) |
| JSON frames per socket | 5 per second, burst 10 |
| Binary frames per socket (CMD, BEAT, HASH) | 40 per second, burst 60; a frame over it is a strike (3 strikes close). A frame from a socket without a seat costs 4. At most one ECHO per 250 ms |
| HASH | one per slot per 30-tick mark (a repeat or an off-cadence tick is refused and costs the binary budget again) |
| CMD | the full sim decode runs **before** the command can enter a turn; undecodable bytes are a strike and never reach a TURN (clients and the referee also skip an undecodable entry the same way, never throw) |
| `party.card` | one lookup per 2 s per socket, none for the card already worn |
| `party` broadcasts | 10 Hz per party |
| Desync resyncs | 3 per slot per match (survives reconnects), 6 per room |
| Room log | 160 KB |
| Party idle TTL | 30 min with nobody connected; hard max 3 h |
| Resume token TTL | match lifetime; lobby 10 min |
| Frame sizes C→S | JSON 1 KB; CMD 10 B; BEAT and HASH 8 B |

### 3.6 Room and party persistence, deploy survival (N9)

`party/party-room.schema.ts` — `PawlegendsRoom`:
- `_id` (room id: 12 chars base36, matching `/^[a-z0-9]{1,16}$/` for `client/components/pawlegends/saves.ts`), `party`, `simVersion`, `simHash`, `config`
- `occupants: [{slot, accountId|null, guestKeyHash|null, name}]`
- `chunks: Buffer[]` (log deltas), `lastTurn`, `lastSeq[]`, `pilotTicks{slot: {reason: n}}`, `openSeatsClaimedBy1800: boolean[]`
- `status: 'live'|'ended'|'abandoned'`, `verdict?: {finalHash, outcome, ticks, winner}`
- lease: `owner` (instance boot id), `epoch`, `handoff: boolean`
- `createdAt`, `updatedAt`; a TTL index of 30 days on ended and abandoned rooms

`party/party.schema.ts` — `PawlegendsParty` (small): `_id` (party id), `code`, `leader`, `members: [{id, accountId|null, guestKeyHash|null, resumeTokenHash, lastHero, lastTrick, slot}]`, `difficulty`, `openSeats`, `locked`, `room?`, `updatedAt`, TTL 3 h.

Rules:
- **Checkpoint** every 10 s by appending the delta since the last checkpoint: `$push: {chunks}` guarded by `{_id, epoch, lastTurn: <previous>}`. Never `$set` the whole log.
- **Lease:** a room is owned by one instance. Claim with `findOneAndUpdate({_id, epoch}, {$set: {owner, epoch: epoch+1}})`.
- **Shutdown:** stop clocks, final checkpoint with `handoff:true`.
- **Boot restore:** claim `status:'live'` rooms with `handoff:true`, or with `updatedAt` older than 15 s (stale lease), and `updatedAt` under 120 s, and a bundle the relay holds for `{simVersion, simHash}`. Then:
  1. restore the party document and its members' resume tokens;
  2. **restart the turn clock and turn fan-out at once** (the relay only orders commands, so reconnecting humans play immediately);
  3. re-simulate the concatenated log in the referee, most-progressed rooms first; pilots and hash checks resume once the referee has caught up (slots are piloted until then, reason `restore`);
  4. clients reconnect with resume tokens, catch up (N7) and reclaim.
- Other live rooms become `abandoned` and their clients get `room_gone`.
- **Store interface:** `RoomStore` with `MongoRoomStore` (production) and `MemoryRoomStore` (tests and the e2e harness).

---

## 4. Client netcode (lanes N4 to N7)

### 4.1 Files (all lazy; none are imported from `main.ts` or the first-load graph)

| File | Role |
|---|---|
| `src/net/proto.ts` | shared codec (N1) |
| `src/net/socket.ts` | `PartySocket`: connect, `hello`, reconnect with exponential backoff (250 ms to 5 s, jitter), resume token, seq and unacked queue (§2.4), BEAT, RTT estimator (EWMA RTT, p95 jitter over 64 samples). Sends on input, never on rAF |
| `src/net/lockstep.ts` | `LockstepRunner` (pure, fake-clock testable): playout buffer (§4.2) |
| `src/net/pacer.ts` | `Pacer`: steps a turn the moment it is due (a kick on every arrival), otherwise sleeps until `wakeAt`; shared by the worker and the inline fallback |
| `src/net/net-host.ts` | `NetHost implements MatchHost`, same listener API as `LocalHost` (`welcome` with `slot = you.slot`, `snap`, `events`, `end`). Uses the existing worker, or inline when the worker fails (same retry and fallback as `local-host.ts`) |
| `src/net/net-host.worker.ts` | worker entry: runs the golden self-test, creates the match from `match.config`, **steps when turns arrive** (paced by `LockstepRunner`), posts snapshots, events, HASH values and catch-up progress. The socket stays on the main thread; turns cross as transferable `ArrayBuffer`s |
| `src/net/input.ts` | coalesces moves (at most 1 per turn, latest wins; was 1 per 2 turns until the Nov 2026 latency pass), always flushes the final Move when a drag ends, never coalesces non-move commands |
| `src/net/predict.ts` | cosmetic prediction (§4.3); never touches the sim |
| `src/net/predict-path.ts` | the prediction walker's planner: the sim's A* on the client's wall grid |
| `src/net/visibility.ts` | `visibilitychange` and Capacitor `App` `pause`/`resume` |
| `src/host/protocol.ts` | extract `interface MatchHost` (join, cmd, pause, leave, on) if not explicit; `LocalHost` and `NetHost` both implement it |

### 4.2 Lockstep runner rules

Latency pass (Nov 2026, client only, no sim or protocol change): the runner used to step on a free-running 15 Hz slot
timer and caught up only above B + 2, so a backlog from start-up or one jitter burst stayed queued for the whole match
(measured: TURN arrival to applied 105 ms at RTT 0, with one turn always queued). It is now a playout clock:

- **Offset samples:** live turn k arriving at time a gives e = a − k × 66.7 ms. The smallest e over the last 45 live
  turns (3 s) is "on time"; a turn's lateness is e minus that. Catch-up frames give no sample. Turns that arrive within
  8 ms of each other (a TCP burst) all move the on-time offset but only the first counts as lateness.
- **Margin M** = the 90th percentile of lateness in the window, 0..267 ms (lateness above 267 ms, a stall or a vote
  pause, is left out: no buffer should cover it). M rises at once and falls by at most 8 ms per turn.
- **Playout:** turn k steps at max(arrival, k × 66.7 + on-time offset + M). On a clean link a turn steps the moment it
  arrives; on a jittery one early turns wait just enough to keep an even pace. No turn waits longer than M.
- **B** (analytics `buffer`, the fast-forward floor) = 1 + round(M / 66.7), 1..5.
- **Catch-up:** two or more turns due at once step 2 per call, 5 per call (10 ticks) above 6 due; the pacer calls again
  half a turn later while a backlog is left. On the relay's `end` every queued turn is due (drain).
- **Hold:** nothing queued and no turn for 1.5 turns plus M. The renderer interpolates the last snapshot and does not extrapolate. After 500 ms of holding, the rail shows "Waiting for server…", except while the room is paused by vote.
- Stepping is driven by turn arrival in the worker, not by main-thread rAF. Chrome throttles rAF in offscreen cross-origin iframes (the embed scrolled away) without firing `visibilitychange`, so rAF stepping would fall behind silently. Rendering stays on rAF and reads the latest snapshot.
- **Gaps:** a TURN with turn ≠ expected + 1 makes the client send `sync{fromTurn}`. Turns ≤ the last applied turn are dropped (idempotent).
- **Readout:** in a party match a ping chip sits beside the clock on the score plate, always on: a dot and "48 ms", green under 80 ms, yellow under 150 ms, red from 150 ms (`src/app/mpHud.ts`, LATENCY-PLAN C6). It reads the socket's RTT estimate once a second. Settings has no ping readout.

### 4.3 Latency feel on phones

Budget at B=1 on a 60 ms 4G link: RTT/2 (30) + average turn wait (33) + B (67) + frame (16) ≈ 150 ms, p95 about 200 ms. Solo today is about 33 ms, so cosmetic prediction hides the rest:

- Your own hero is drawn by a **local walker** (`src/net/predict.ts`, Nov 2026 review rework). A Move starts it on the next render frame (`NetHost.present`, called by MatchSession after `SnapBuffer.advance`; the snapshot is never touched): it walks its own path, planned with the sim's A* on the client's static wall grid (`src/net/predict-path.ts`), at the hero's interpolated speed averaged over ~400 ms around movement (a party snapshot comes once per turn, so the raw speed arrives in bursts), else its base speed, and stops at the gate line before the barrier drops. The authoritative hero walks the same path one input latency later, so it turns the same corners and stops where the sim's path stops (the old straight-line lead ran up to 720 mm past a stop-short goal and cut corners by up to 2 m). Any other command (Stop when the stick is released, Pounce, a cast, an attack) and arrival **hold** the walker where it is drawn: the authoritative hero walks up to it during the latency, so nothing steps back (the old lead blended out over 120 ms and pulled the hero back 0.4 to 0.9 m at 150 ms RTT). Reconciliation: where the walker was drawn one input latency ago is where the authoritative hero should be now; the difference moves the walker and its trail by an exponential share (time constant 200 ms), so a wrong latency estimate, a slow or a bump converge without a surge (a direction change used to run at ~1.8× speed). Once the walker has held still for the latency, the hero is drawn at the authoritative position plus a residual that decays over ~100 ms (60 ms under crowd control), so a bot-piloted or pushed hero is drawn where the sim has it. No walking under stun, root, fear (charm), forced movement or a dash; a blink, respawn or any authoritative jump over 1.5 m is drawn at once; a Move the sim never starts (blocked, channeling) stops the walker after the latency + 150 ms. Facing: the walker's direction while a walk is in flight (eased ~50 ms), the interpolated yaw otherwise; the walk cycle reads the walker's speed (feet still while it holds). While a walk is in flight, the input (`simMe`: the stick's steer origin, heading casts) aims from the walker, which is where a command sent now lands, not from the newest snapshot a round trip behind it. Because the walker moves on its own clock, the own hero no longer shows the 15 Hz party snapshot judder while walking. Static walls only: a tower footprint is not in the client grid, so the drawn hero may cut a tower's corner and be corrected back. Input latency is measured: send of a CMD to the local apply of the TURN that acks it, an EWMA (before the first sample: RTT + 2 turns), plus the draw lag, capped at 600 ms. The latency sample reads acks merged over every turn stepped in one pace call (an ack rides only the turn where it changed), so a 2-turn step never loses one. A coalesced Move waits (newest wins, at most 400 ms) while the socket still holds unsent bytes, so an uplink stall does not dump a burst into the relay's token bucket. A vote pause ending or the tab becoming visible resets the playout offset window. Before the first turn of a stream, a hold counts only after 5 s (`FIRST_TURN_GRACE_MS`), so "Waiting for server…" no longer shows at every go-live; "Go!" shows only when the gate drop is watched live (not after a rejoin's catch-up).
- No lead while the snapshot shows stun, root, fear, forced movement or a dash.
- The click marker, facing and footstep SFX are instant.
- Casts: only the indicator and wind-up audio are predicted. A predicted cast that then fails feels worse than delay.
- Unit test: rendered position never diverges from authoritative by more than speed × lead and converges within 150 ms.

### 4.4 Desync (N6)

- The client sends HASH at each trail push (every 30 ticks). The server compares once the referee reaches that tick. On a mismatch:
  1. log `{room hash, slot, tick, client, server, build}` (analytics `mp_desync` and one server log line; no state dump, no `ua` next to an account id);
  2. send `resync{reason:'desync'}` and CATCHUP from turn 0;
  3. the slot is piloted during the rebuild (reason `desync`, not counted for AFK);
  4. the client recreates the match, fast-forwards and sends `back`.
- **The referee is the authority.** A client hash can only resync (then, past the caps, pilot) that client. It never makes the room unscored and never switches detection off: one member (or two colluding ones) cannot void the room's rewards with forged HASH frames. When 2 or more clients agree against the referee, `mp_referee_divergence` is logged once for ops and those clients are not resynced; the end-of-match verify (the raw log re-simmed independently) is what keeps a wrong referee from ever scoring a room.
- Cap: 3 resyncs per slot per match (it survives reconnects), 6 per room. After that the client watches, its slot stays piloted, and the rail says "Connection problem. A bot plays for you."

### 4.5 Reconnect, reload, tab sleep (N7)

- **Socket drop:** `PartySocket` reconnects with `hello{resume}`. The server re-binds the slot, sends `match` again (with `lastSeq`) and CATCHUP **from the client's last turn**. The client keeps its sim (delta, not rebuild). The same CATCHUP delivered twice gives the same hash.
- **Resume token:** bound to the seat's identity (a resume presenting a different ticket identity is refused; a token issued to an IP-keyed guest works only from that IP) and rotated on every resume. Kept in `sessionStorage` only (survives a reload, gone with the tab; never `localStorage`, where any script on the origin could read it later). A closed tab rejoins through the invite link: the relay gives the same person (account or guest key) their own seat back. The relay keeps one token per member, looks it up by hash in O(1) and sweeps expired ones.
- **Two tabs:** the tab that loses the seat gets `error{code:'seat_elsewhere'}` and the rail "Playing in another tab". It does not retry.
- **Reload or app restart:** a `?party=` link or a stored token resumes. CATCHUP from turn 0 fast-forwards in the worker with no render and no snapshot encoding until the end, and HASH sends stop during catch-up. The rail shows "Catching up 62%", then the client sends `back`.
  - Targets: 19,800 ticks in ≤ 1.5 s on Node and desktop; ≤ 7 s on WebKit and a ×4 CPU-throttled Chromium.
- **Hidden tab:** send `away` immediately (slot piloted at once), stop stepping, keep the socket. On visible: `sync{fromTurn}`, fast-forward, `back`. Capacitor `pause`/`resume` does the same.

### 4.6 Party-mode guards in `app/matchSession.ts`

`mode: 'solo' | 'party'`. In party mode:
- Esc, the bridge `pause` and portrait orientation open a **local overlay** and never pause the sim. The Esc item "Pause" becomes "Vote pause"; "Forfeit" becomes "Vote surrender" and sends `vote{surrender}`.
- `speed` is refused.
- The `slot === 0` tip at `matchSession.ts:601` becomes `slot === mySlot`.
- First-session rules (`difficultyFor`, forced Rookie, tutorial) are skipped. Players with 0 matches get 2 or 3 control hints on the rail in the first 20 s instead.

---

## 5. Party system (lane P)

### 5.1 Server: `backend/src/pawlegends/party/party.service.ts` (pure state machine, JSON in and out, fake clock)

Phases: `lobby → pick → loading → match → results → (lobby | pick)`. There is no ready phase (D11).

| Rule | Spec |
|---|---|
| **Create** | On the "Play with friends" tap, with the leader's last difficulty. The creator is the leader. Code from §9.1. The leader takes slot 0; others take 1 and 2 in join order. |
| **Join** | By code. Max 3 humans; a 4th gets `party_full`. Allowed in `lobby` and `results`. In other phases, `party_busy`, unless Open seats is on (P10). Refused with `party_locked` when the party is locked. |
| **Lock and codes (S9)** | Leader toggles **Lock party** (no new joins); it turns on automatically at match start when Open seats is off. Leader can press **New code**. The code **rotates automatically on every kick**, so the kicked person's link dies. A code expires when its party ends and is not reused for 1 hour. |
| **Leader** | Hand over with `party.lead`. If the leader leaves or is offline more than 60 s in the lobby, leadership passes to the longest-present connected member. Slots are reassigned at each start; the leader always gets slot 0. |
| **Kick** | Leader only, lobby and results only. The kicked identity cannot rejoin for 10 minutes, and the code rotates. |
| **Difficulty** | Leader only, any value in `DIFFICULTIES`. The default is the **lowest unlocked tier among members** (from `hello.hint`; a lie only lowers a UI default). A "New player in party" hint shows next to the control when a member has `newbie`. |
| **Start** | Leader. **A party of one with Open seats off starts a local solo match (D10).** Otherwise, when every member is `conn:'on'` and visible, go to `pick`. If someone is away, the party shows `waiting` and a "Waiting for Mira · Nudge" chip; `party.nudge` sends that member a rail note and a vibration. The leader can start anyway after 10 s; the away member is then piloted from tick 0 (reason `late`) and reclaims on arrival. |
| **Pick** | 30 s, simultaneous. `pick.hover` is shown live. A lock takes the hero **for other humans** (bots may still duplicate, per sim rules). All humans are on the leader's side: the leader's hover decides cat or dog, and a side change resets other humans' unlocked hovers. Each human picks a trick. **At timeout:** lock the hover, else the last hero if free, else a free hero in seeded order. A member with `newbie` auto-locks the "New? Try this" hero if it is free. Nobody is kicked. Rematch prefills the last picks. |
| **Loading** | `config = fillPicksParty(seed, humans)` with `seed = crypto.randomInt(2**32) >>> 0`. Clients start loading match assets **during lobby and pick**, so this phase is near instant. Start when all are `loaded` or after 20 s; late members are piloted from tick 0 and reclaim on arrival. |
| **Results** | After `end`. "Play again together" is `vote{rematch}`: the leader's tap or a majority starts it, and members get a 3 s "Leader started a rematch" rail note before pick. Rematch goes to pick with prefilled heroes ("Play again together" locks the same hero at once, "Change hero" leaves it open). The rematch pick stays up at least 5 s even when everyone is locked, so everyone sees the team, and a locked player can still press "Change hero" (`pick.unlock`) until loading. Members who left are dropped. "Leave party" is always available and returns to the title. |
| **Pick rules** | A hero a friend locked, or one of the other side, can never be hovered or locked (Lock in is disabled, a stale hover falls back with "Mira took Sage"). The leader's side decides the team: a side switch also unlocks a friend locked on the old side ("Leader switched sides: pick again"), so a team is never cats and dogs mixed. A Start interrupted by an away friend goes on by itself when the friend is back. |
| **Persistence** | Survives across matches and restarts (`PawlegendsParty`, §3.6). Member identity is the resume token, so a reload keeps the seat. |

### 5.2 Identity, tickets and names

**Ticket:** `POST /pawlegends/party/ticket` in `pawlegends.controller.ts`, `AppAuthGuard` + `@AllowGuest()`, throttled via `ClientIpThrottlerGuard.consume('PawlegendsController.partyTicket', …)` at 30 per 10 min.
- Returns `{ticket, expiresIn: 60}`: an HMAC-SHA256 token keyed by `PAWLEGENDS_PARTY_TICKET_SECRET` over `{aud:'pl-party', v:1, kid, boot, accountId, guest, iat, exp, nonce}`. The minting process (the API) and the verifying one (the relay) differ when they run apart, so a ticket is not bound to the verifier's boot id (`boot` is informational); instead a ticket issued (`iat`) before the verifying process started, minus 2 s of clock skew, is refused, so a ticket captured before a restart is dead after it. The nonce is kept in memory until expiry (single use). Verification uses `timingSafeEqual`. `kid` allows key rotation.
- **Without the secret** the endpoint answers 503 `PAWLEGENDS_PARTY_TICKET_UNAVAILABLE`, and the relay treats every ticket as absent (never trusted unsigned). Players still play together; rooms are unscored.
- **No ticket** (standalone build or Capacitor without a host session): anonymous guest, not scored. Because every invite URL is the embed URL (D12), a friend who taps a link normally lands where a guest ticket exists.

**Names (D8):**
- Peers see `"<adjective> <catalog or breed name>"` (for example "Sunny Tabby") for a member wearing a card, and `"<adjective> <cat noun>"` plus a `guest` badge otherwise. Adjectives and nouns come from `party/party-names.ts` (64 × 64, deterministic from the member id, profanity list checked in tests). Duplicates get " 2".
- The owner's own copy also carries the custom cat name (`ownName`), re-run through `normalizeCatName` at every `party.card`.
- Card resolution: the server resolves `catId` with `CatRepository` and checks ownership like `pawlegends-champions.ts`. Peers get only `{image, element, tier}`; `catId` goes only to its owner (S6).
- Local **Hide names** setting, and **Mute** also replaces that member's name with "Teammate 2".
- Peers never see account ids, emails, guest keys or IPs. Member ids are random per party.
- Remote skins go into `CosmeticsConfig.heroSkins` (render-only). The client validates image URLs with the `parseChampions` bucket rule (`embed/messages.ts:56-59`).

### 5.3 Invites and links

| Surface | Spec |
|---|---|
| Link | Always `https://tokentails.com/pawlegends?party=K7QX2M` (D12). The standalone `/pawlegends-game/?party=` still works when typed. Regex `^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$`, case-folded. Codes are displayed as `K7Q X2M`. |
| Client host | `client/components/pawlegends/flags.ts` forwards `party` like `dare` (validate, then `&party=` on the iframe src). `PawlegendsHost.tsx` strips `party` from the address bar with `history.replaceState`. The iframe gets `allow="web-share"`. |
| Game | `src/share/partyLink.ts` reads `?party=` like `share/dare.ts:40-46` and opens the party chunk straight into "Joining K7Q X2M…". |
| Expired link (U4) | "This party has ended" with **Play now** (solo) as the primary button and **Start your own party** as the secondary. Never a bare "Party not found". |
| Share | The lobby opens with a big **Share** button (the second tap, so it has fresh user activation; the first tap's activation would expire during the import, connect and create). `navigator.share({title:'Play Paw Legends with me', url})`; fallback: copy and the rail note "Link copied". In the embed, the existing bridge `share`. |
| Prefetch | After the title renders, `requestIdleCallback` prefetches the party chunk (not counted in first load). |
| QR | Desktop lobby shows the QR inline; phones get a "Show QR" button with a full-screen QR. `qrcode-generator` (MIT, about 7 KB gzip) inside the party chunk. |
| Code entry | "Join with code": 6 big monospace boxes, auto-advance, paste support, and a **Paste** button (no silent clipboard reads, because iOS prompts). |
| Bridge | Game to host: `GAME_TYPES` entry `'party-ticket-request'`. Host to game: `'party-ticket'{ticket}` or `{error}`. The host answers only its own iframe's `contentWindow`, posts to the exact game origin, and calls the ticket endpoint with its own `accesstoken`. The game never sees the access token. |

---

## 6. Scoring (lane N8, the one write path)

1. At `end`, the room sets `status:'ended'` and `verdict` from the referee. The existing replay worker queue (`PAWLEGENDS_REPLAY_QUEUE`) then checks the chain **raw TURN log → re-sim = `PartyReplayRecord` (from the referee's post-gate logs) → `verifyPartyReplay` = verdict**. Any mismatch marks the room `abandoned` with an alert.
2. `end{scored, why}` is sent per recipient. `scored` is true when the member has a ticket identity, the room is not unscored (`referee`, no secret), and the AFK rule passes.
3. The client posts through the existing save queue (`client/components/pawlegends/saves.ts`, keyed by `matchId = room`) and the host to **`POST /user/catbassadors/live`**: `{type: PAWLEGENDS, pawlegends: {v: 2, room, slot, simVersion, ticks, outcome, finalHash}}`. New DTO `PawlegendsPartyResultDto` in `pawlegends-replay.dto.ts`, under 300 B. `liveGamePipe` keeps its error codes.
4. New branch `savePawlegendsPartyMatch` in `pawlegends-live.ts`:
   - The room exists, is `ended`, and has a verified `verdict`.
   - `simVersion ≥ PARTY_SINCE`.
   - `ticks`, `outcome` and `finalHash` equal the verdict.
   - `occupants[slot].accountId === req.user` (or the guest account per `@AllowGuest`).
   - **AFK rule:** `drop + away + afk` pilot ticks of that slot ≤ 50% of `ticks`, else `PAWLEGENDS_PARTY_AFK` (409, "No rewards: a bot played most of this match"). `late`, `desync`, `restore` and `open` ticks never count.
   - **Digest** = sha256(`party:${room}:${slot}`) in the global unique digest index; a second post returns `PAWLEGENDS_DUPLICATE`.
   - Catnip and match count come from the existing code applied to `stats[slot]` of the verified run.
   - **Fastest win is never credited from party matches** in v1 (3 buffed humans beat solo times; a separate party record is later).
   - **Open seats (S5):** if any open seat was never claimed by a human by tick 1,800, catnip is computed at the next lower difficulty tier (the lowest tier stays).
   - At most **30 scored party matches per account per UTC day** (counted from `PawlegendsRoom`); over it, the match counts but gives no catnip (`why:'daily'`).
5. New error codes in `backend/src/shared-contracts/errors.ts` and every client copy listed in `docs/DEVELOPMENT.md`: `PAWLEGENDS_PARTY_ROOM`, `PAWLEGENDS_PARTY_SLOT`, `PAWLEGENDS_PARTY_AFK`, `PAWLEGENDS_PARTY_TICKET_UNAVAILABLE`.
6. **The relay never writes to user or game collections.** `party-relay.no-score.spec.ts` asserts that no relay provider has `UserRepository` or `GameRepository` injected.
7. Save status is shown only to its owner: "Saved +12 catnip", "Saved +12 catnip (guest). Sign in to keep it forever", "Sign in on tokentails.com to keep rewards", "No rewards: a bot played most of this match". Peers see nothing.
8. **Farm signal (flag only, never auto-ban):** the referee logs the share of a slot's commands identical to what `createPlayerBotFor` would emit for it.

---

## 7. In-match multiplayer UX (lane M)

Every in-match message goes through `src/ui/notify.ts` `push()`, one line of ≤ 28 characters on phones. Nothing appears mid-screen on phones.

| Event | Rail text (key) | Tone |
|---|---|---|
| Teammate joined mid-match | "Mira joined" (`mp-join`) | good |
| Teammate dropped | "Mira dropped · bot plays" (`mp-pilot-<slot>`) | warn |
| Teammate back | "Mira is back" | good |
| You were piloted | "Bot covered for you · 0:42" | info |
| AFK warning (to you) | "Still there? Bot in 15s" | warn, countdown |
| Catch-up | "Catching up 62%" (sticky, updated) | info |
| Waiting on the server | "Waiting for server…" (not while paused) | warn |
| Desync recovery | "Re-syncing…" | info |
| Another tab | "Playing in another tab" | warn |
| Surrender vote | "Surrender? 1/2 · Yes · No" | vote (chips) |
| Pause vote / paused | "Pause? 1/3 · Yes" / "Paused 0:47 · Resume" | vote |
| Nudge | "Mira nudged you" | info |
| Rematch | "Leader started a rematch" (3 s) | info |
| First-match hints (0 matches) | 2 or 3 control hints in the first 20 s | info |
| Social ping / quick chat | "Mira: On my way" + world marker / "Mira: Nice!" | per kind |

- **`notify.ts`:** add optional `actions?: {id, label}[]` to `Note`, rendered as chips in the rail item (≥ 40 px touch targets), dispatched through `onAction(id)`. `notifyQueue.ts` keeps action notes sticky until resolved or expired.
- **Pilot state in the UI** comes from TURN `modeMask` bits (in order with the turns); the `slot` JSON supplies only the reason text.
- **M1 Teammate identity:** overhead plates for humans show the name plus a slot ring (slot 0 mint, 1 violet, 2 orange; never the self yellow, ally blue or enemy red of `RELATION_CSS`) (`ui/overhead.ts`); the scoreboard (`ui/scoreboard.ts`) gets a human badge, a connection dot and a "bot" chip while piloted; the minimap (`ui/minimap.ts`) shows human dots in ring colour; HUD portraits use card art; `slotNames` (`meta/cardName.ts`) accepts `names[6]` from `party.members`.
- **M2 Pings:** the ping wheel (`ui/pingWheel.ts`) gets a `social` mode. Slots 1 and 2 send `social{kind:'ping'}` (markers only, not simulated). The leader still sends the in-sim `Op.Ping` (it commands the bots), and the relay echoes it socially.
- **M3 Quick chat and emotes:** a speech-bubble button next to the paw button (bottom right; must fit 667x375 without overlapping the ability bar). 8 lines in `src/data/social.ts` ("Nice!", "On my way", "Help me", "Group up", "Back off", "Push", "Thanks", "GG") and 4 emotes shown over the hero for 2 s. Desktop: hold T for the radial. Rate limit 1 per 2 s and 10 per 30 s per member (server-enforced, client-mirrored). Mute: tap a name on the scoreboard (local, per session; hides pings, chat, emotes and the name).
- **M4 Takeover:** the dropped teammate's plate shows a robot glyph and a greyed ring.
- **M5 Votes:** surrender and pause, as in §3.2, from the Esc menu and as rail chips.
- **M6 Results together:** one row per human (card art, name, hero, K/D/A, gold, a "bot X%" chip when piloted over 10%), bots greyed. Primary "Play again together (2/3)", secondary "Change hero", tertiary "Leave party". Your own save status only.
- **M7 Guards:** §4.6.

---

## 8. Pre-match screens (lane P; mid-screen layouts allowed here)

Layout rules for every screen: phone landscape 844x390, 667x375, 915x412 with safe areas; desktop 1440x900; 16 px gutters; no scroll at 667x375; reduced motion honoured.

| Screen | Phone landscape | Desktop |
|---|---|---|
| **Title** (`ui/lobby/lobbyScreen.ts`) | A second button under Play: "Play with friends" (creates the party at once), and a "Join with code" link. | same, right column |
| **Party lobby** `src/party/ui/partyLobby.ts` | Left: the code (32 px monospace, `K7Q X2M`) and a **big Share** button, then Copy and QR. Centre: 3 seat cards (art, name, guest badge, leader crown, conn dot; empty seats say "Invite" and open share). Right: difficulty (leader; read-only "Leader picks" for others) with the new-player hint, Open seats, Lock party, New code, and Start (leader) or "Waiting for leader". "Waiting for Mira · Nudge" chip when needed. | three columns, QR inline under the code |
| **Join by code** `src/party/ui/joinCode.ts` | 6 boxes, Paste, Join. Inline errors under the boxes. | modal |
| **Shared pick** `src/party/ui/partyPick.ts` | Top: team strip with 3 human seats (pulsing outline on hover, solid frame on lock) and bot seats as "?". Middle: hero grid (existing pick cards); heroes locked by others greyed with the locker's name; the other side greyed with "Leader chose cats"; a "New? Try this" badge on the easy hero. Bottom: trick row, 30 s timer, Lock in. | wider grid |
| **Loading** `src/party/ui/partyLoading.ts` | 6 hero cards (humans named), per-human load bars, "Bot covers until Mira loads" after 20 s. | same |
| **Results** | §7 M6 | same |
| **Errors** | "Update to play together" + Reload; "Servers busy, retrying in 12s"; "This party has ended" + Play now + Start your own party; "You were removed from the party"; "This party is locked". | same |

Each screen uses `party.css` (scoped `.pl-party`). Strings live in `src/party/ui/copy.ts`. Every screen joins the `setScreen` lifecycle (`app.ts:61` gains `'party'`) with `disposeLobby`-style cleanup.

---

## 9. Security summary

1. **Party codes:** 6 characters from 31 (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), 31⁶ ≈ 8.9·10⁸, drawn with `crypto.randomInt`. Guessing is bounded by the **instance-wide** failed-join cap (§3.5), not by per-IP caps, which can be spoofed or shared.
2. **Client IP** on the upgrade is the CF header only from a Cloudflare peer (§3.1).
3. **Room ids, member ids and resume tokens** are 128-bit random. Resume tokens are bound to room, slot and identity and rotate on each resume. Only their hashes are stored.
4. **Tickets:** single use, 60 s, `aud`/`v`/`kid`/`boot` in the HMAC, `timingSafeEqual`; no secret means no trusted tickets (§5.2).
5. **Validation:** Origin hygiene, `maxPayload` 1 KB, per-type size limits before decoding, length before `JSON.parse`, strict guards with unknown-key rejection, strikes (3 close the socket), never echo input.
6. **Amplification limits (S4):** JSON rate limit, 10 Hz party broadcasts, `sync` 1 per 5 s, CATCHUP 1 MB per socket per minute, resyncs counted per slot per match.
7. **Clients are never trusted for state.** Outcomes, hashes and stats come from the referee. Clients send commands, BEATs, HASHes and enumerated social ids. Forfeit only comes from a server vote. The server ignores client claims about slot, name and card.
8. **No player free text to peers** (D8). Social `x`,`y` are clamped integers and never reach the sim.
9. **DoS (S3):** solo parties run locally; 1 live room per identity; 30 s abandonment before the first command; unticketed rooms ≤ 50% of capacity; event-loop gate.
10. **Abuse (S5):** AFK pilot plus the AFK rule; kick only outside matches with code rotation; votes 1 per kind per human per 90 s; social rate limits; local mute; no party fastest wins; open-seat tier reduction; 30 scored party matches per day; farm signal logged.
11. **Privacy (S6):** no `catId` to peers; no code or room id in analytics (`sha256(room).slice(0,8)` at most); save status private; IPs never shared with peers and never logged in clear (hashed); tickets and resume tokens never logged; account ids never logged next to names; follow the scrubbed `client-error` path.

---

## 10. Analytics

Game side: existing `analytics/posthog.ts` and the bridge `analytics{event, props}` (flat props). **Never** the party code or room id; `room_h = sha256(room).slice(0,8)` when correlation is needed. Server side: structured log counters.

| Event | Props |
|---|---|
| `party_create` | `difficulty, surface: web\|embed\|app` |
| `party_join` | `via: link\|code\|qr\|rematch\|resume, guest, members` |
| `party_share` | `method: share\|copy\|qr` |
| `party_leave` / `party_kick` | `phase, reason` |
| `party_start` | `members, waited_s, nudges` |
| `party_pick` | `hero, locked_s_left, auto: bool, newbie` |
| `mp_match_start` | `humans, difficulty, rtt_p50, buffer` |
| `mp_net` (every 60 s) | `pacer, rtt_p50, rtt_p95, jitter_p95, buffer, holds, catchups, input_ms` (`input_ms`: the measured click-to-applied latency, Nov 2026). `pacer: 2` marks the playout-clock pacer: `holds` counts starvation episodes (nothing to step for 1.5 turns plus the margin), not every slot with fewer than B queued, and `buffer` is 1 + round(margin / 66.7 ms). Rows without `pacer` use the old meanings, so compare across the cut-over only by that field |
| `mp_disconnect` / `mp_rejoin` | `cause` / `ms, ticks_ff, via: resume\|reload` |
| `mp_takeover` / `mp_reclaim` | `reason` / `after_s` |
| `mp_desync` / `mp_referee_divergence` | `tick, n` |
| `mp_vote` | `kind, result, yes, need` |
| `mp_social` | `kind, id` (sampled 10%) |
| `mp_match_end` | `outcome, humans, piloted_pct, reason, scored` |
| `mp_rematch` | `members, kept_heroes` |
| Server counters | `rooms_live, sockets, turn_overrun_ms_p99, loop_delay_p99, referee_lag_turns, desyncs, divergences, restores, refused_busy, join_fail_global` |

---

## 11. Budget

- First-load JS stays about 317 KB gzip; `npm run budget` ≤ 450 KB; the first-load delta is ≤ 2 KB (title button and dynamic-import stub).
- Party chunk (UI, socket, lockstep, input, predict, QR) ≤ 45 KB gzip. `tools/budget.mjs` gets a `party` line with that limit and a test in `tools/budget.test.mjs`.
- The net-host worker reuses the sim worker bundle plus an entry ≤ 5 KB (the golden constant included).

---

## 12. Lanes, files and acceptance tests

Order: **N0** first, then **N1**, then **N2 to N5** in parallel with **P1, P2**, then **N6 to N9**, **P3 to P10** and **M1 to M8**. The lanes meet at e2e (§12.4).

### Lane N: netcode core

| ID | Item | Files | Acceptance |
|---|---|---|---|
| N0 | Sim party hooks | §1 (`src/sim/party.ts`, `api.ts`, `index.ts`, `server.ts`, `bots/index.ts`, `bots/orders.ts`, `bots/brain.ts`, `heroes/talents.ts`, `combat/damage.ts`, `effects/bonus.ts`) | §1.5 all green; `lint:sim`; `vendor-sim:check` |
| N1 | Protocol and vendoring | `pawlegends/src/net/proto.ts`, `tools/vendor-sim.mjs` (net bundle, `simSourceHash`, `prev/` bundle), `tools/lib/sim-source-hash.mjs`, `vite.config.ts` (`__SIM_HASH__`, `__SIM_GOLDEN__`), `backend/src/vendor/pawlegends-net/*` | `tests/unit/net-proto.test.ts` (round-trip, golden bytes, 100k fuzz); `tools/vendor-sim.test.mjs` (net bundle sha check; `simSourceHash` equals the Vite define; `prev/` kept one-deep; golden equals a vendored-bundle run) |
| N2 | Relay socket server | `backend/src/pawlegends/party/party-relay.service.ts`, `party-limits.ts`, `app.module.ts`, `backend/package.json` (`ws` ≥ 8.17.1, `@types/ws`) | `party-relay.service.spec.ts`: wrong Origin 403; CF header ignored from a non-Cloudflare peer; identity, IP and global caps; per-type oversize frame is a strike, a 1 KB+1 frame closes; `hello` timeout 5 s; `update_required` for an unknown hash, accepted for `prev`; member with a different version than the leader gets `update_required`; JSON rate limit; shutdown sends `room_gone` and checkpoints with `handoff` |
| N3 | Room, clock, intake, pilots, votes | `party/room.ts`, `party/room-scheduler.ts` | `room.spec.ts` (fake clock): a turn every 66.7 ms, no skips under a 300 ms stall (5 turns closed in order); staggered phases; late commands go to the next turn; sub placement; seq dedupe; Move replaced, never dropped, over budget; Forfeit from a client dropped; surrender `need` formula and injection only after `forfeitFrom`; pause stops turns, freezes AFK and silence timers, auto-resumes at 60 s; AFK 60 s → pilot, any CMD reclaims; away → immediate pilot; `back` reclaims only within B+2; flip turn discards pilot commands; `pilotTicks` by reason; 30 s and 120 s abandonment; log cap |
| N4 | Referee pool | `party/referee.worker.ts`, `party/referee-pool.ts` | `referee.spec.ts`: 3 scripted human streams + 1 piloted slot give a final hash equal to `verifyPartyReplay` of the stored log and of the raw TURN re-sim; **3 rooms interleaved tick by tick in one isolate** equal their solo runs; event-loop gate refuses new rooms at p99 > 20 ms; harness test with a 300 ms main-thread busy loop shows turns closed in order afterwards. `mp/load.mjs` (nightly, `@perf`): 100 rooms keep overrun p99 < 5 ms, records rooms per core and memory per room |
| N5 | Client transport and lockstep | `src/net/socket.ts`, `lockstep.ts`, `net-host.ts`, `net-host.worker.ts`, `input.ts`, `predict.ts`, `src/host/protocol.ts` | `lockstep.test.ts` (B starts at 1, grows on holds, ≤ 1 change per 3 s; catch-up ≤ 10 ticks per frame; hold on empty; no "waiting" note while paused); `net-host.test.ts` against an in-process fake relay (pattern from `socket-host.ts`): same final hash as the server; a sent `x=123.456` reaches every sim as the quantized value; `socket.test.ts` (backoff; re-send only unacked commands < 500 ms and none after a pilot period; seq continues from `lastSeq`; token rotation); `input.test.ts` (**joystick flood:** 60 Hz moves for 3 s then release, the final position equals the last target); `predict.test.ts` (starts on the next frame, steady under a held stick, holds on release with no step back, walks the path and never passes its end, no surge on a turn, blinks drawn at once, off under CC, stall, gate line) |
| N6 | Desync detect and recover | room HASH compare, client `resync` path | `net-desync.test.ts`: corrupt one TURN for client B, server flags it within 30 ticks, B rebuilds, equal final hash; caps per slot survive reconnects; **majority rule:** a referee forced to diverge triggers `mp_referee_divergence`, no resync storm, the room stays scored (forged hashes from one member only resync that member); a slot piloted for `desync` is not counted as AFK |
| N7 | Reconnect, reload, tab sleep | `socket.ts`, `src/net/visibility.ts`, worker fast-forward | `net-rejoin.test.ts`: drop at tick 6,000 → delta catch-up; reload → full catch-up; the same CATCHUP twice → same hash; `seat_elsewhere` for a second tab; equal final hash; `perf-ff.test.ts`: 19,800 ticks < 1.5 s on Node; e2e budget ≤ 7 s on WebKit and ×4-throttled Chromium; server catch-up pacing under backpressure never closes with 4001 |
| N8 | Scoring via `/live` | `pawlegends-live.ts` (`savePawlegendsPartyMatch`), `pawlegends-replay.dto.ts`, `dto/live-game.dto.ts`, `shared-contracts/errors.ts` + client copies, `party/party-room.schema.ts` | `pawlegends-party-live.spec.ts`: valid post saves catnip from `stats[slot]`; second post `PAWLEGENDS_DUPLICATE`; wrong account `PAWLEGENDS_PARTY_SLOT`; forged hash or outcome `PAWLEGENDS_REPLAY_INVALID`; 51% `drop/away/afk` → `PAWLEGENDS_PARTY_AFK`, while 90% `late` or `desync` still scores; `simVersion < PARTY_SINCE` → `PAWLEGENDS_SIM_VERSION`; no fastest win from party; unclaimed open seat → lower tier catnip; 31st party match of the day gives no catnip; turnlog→record conversion including pilot commands and the injected Forfeit; all of `pawlegends-live.spec.ts` stays green; `party-relay.no-score.spec.ts` |
| N9 | Checkpoint, lease, restore | `party/room-store.ts` (Mongo and Memory), `party/party.schema.ts`, restore on boot | `room-restore.spec.ts` (MemoryRoomStore): kill at tick 9,000, boot a new service; clients resume with tokens; the party (leader, members, last picks) is back; the clock runs before the referee catches up; equal final hash to an uninterrupted run; stale room (> 120 s) → `abandoned`; **two services at once:** only one claims each room (epoch), the old one stops on SIGTERM with `handoff`; checkpoints append deltas |

### Lane P: party, lobby, pick, invites, host bridge

| ID | Item | Files | Acceptance |
|---|---|---|---|
| P1 | Party state machine | `backend/src/pawlegends/party/party.service.ts`, `party-codes.ts`, `party-names.ts` | `party.service.spec.ts`: create on tap, join, full, locked; leader handover and auto-pass at 60 s offline; kick ban 10 min and code rotation; New code; start → pick with no ready check; waiting + nudge + start-anyway after 10 s; solo party of one returns a `local` start; side lock; unique human heroes; auto-lock at 30 s (newbie hero); late-load pilot; rematch → pick with prefilled heroes; default difficulty = lowest member tier; TTLs; broadcasts coalesced to 10 Hz; code alphabet and uniqueness over 10⁵ draws; names deterministic, deduped, profanity-free, never the custom cat name for peers; `catId` only in the owner's copy |
| P2 | Ticket endpoint and identity | `pawlegends.controller.ts` (`POST /pawlegends/party/ticket`), `party/party-ticket.service.ts`, `docs/API.md`, `docs/BACKEND.md` (env name only) | `party-ticket.spec.ts`: guest and signed-in tickets; single use; 60 s expiry; HMAC tamper, wrong `aud`, wrong `boot` refused; `timingSafeEqual`; throttle; secret missing → 503 and unsigned tickets never trusted; resume with a different identity refused |
| P3 | Party client and title entry | `src/party/index.ts` (lazy entry), `src/party/partyClient.ts`, `app/app.ts` (`'party'` screen, dynamic import, idle prefetch), `ui/lobby/lobbyScreen.ts` | `party-client.test.ts` (reducer from server `party` frames; solo start runs `LocalHost`); `tools/budget.test.mjs` (first-load delta ≤ 2 KB, party chunk ≤ 45 KB) |
| P4 | Party lobby UI | `src/party/ui/partyLobby.ts`, `party.css`, `copy.ts` | `party-lobby.test.ts` (happy-dom: seats, leader controls hidden for members, names escaped, waiting chip); screenshots at 4 sizes |
| P5 | Join by code, links, share, QR | `src/party/ui/joinCode.ts`, `src/share/partyLink.ts`, `src/party/qr.ts` | `party-link.test.ts` (regex, case-fold, `K7Q X2M` display, invalid ignored, invite URL is the embed URL from every surface); e2e `party-invite.spec.ts` (link opens "Joining…"; Copy fallback when `navigator.share` is missing; ended party shows Play now) |
| P6 | Start flow (replaces the ready check) | `party.service.ts`, `src/party/ui/partyLobby.ts` | e2e: Start with all present goes to pick; with one hidden tab shows "Waiting for Mira · Nudge", the nudge reaches Mira's rail |
| P7 | Shared pick | `src/party/ui/partyPick.ts` | e2e: A locks Clem, B sees Clem greyed with A's name; the timer auto-locks; a leader side switch resets the others' hovers |
| P8 | Loading and rematch | `src/party/ui/partyLoading.ts`, results hooks, asset preload during lobby and pick | e2e `party-rematch.spec.ts`: after `end`, "Play again together" from 2 of 2 → "Leader started a rematch" → pick with prefilled heroes |
| P9 | Host bridge and client page | `pawlegends/src/embed/bridge.ts`, `client/components/pawlegends/flags.ts`, `PawlegendsHost.tsx` (`allow="web-share"`), `client/components/pawlegends/bridge.ts` | client `npm test`: `flags.test.ts` forwards, validates and strips `party`; `bridge.test.ts` answers the ticket request with `accesstoken`, never sends the token into the frame, and ignores requests from any other `source` or origin; game `tests/e2e/embed.spec.ts` extended, including an offscreen (rAF-throttled) embed that keeps pace with live turns |
| P10 | Open seats (join in progress) | `party.service.ts`, `room.ts` | With Open seats on, all 3 team slots are human in `config`; empty ones are piloted from tick 0 (reason `open`), and a friend joining mid-match claims the lowest empty piloted slot. The lobby states "Bots get the human buff while seats are open" and "Unfilled seats lower rewards". Tests in `room.spec.ts` and e2e `party-jip.spec.ts` |

### Lane M: in-match multiplayer UX

| ID | Item | Files | Acceptance |
|---|---|---|---|
| M1 | Teammate identity | `app/matchSession.ts`, `ui/overhead.ts`, `ui/scoreboard.ts`, `ui/minimap.ts`, `meta/cardName.ts` | `mp-identity.test.ts` (names from party, Hide names, mute renames to "Teammate 2"); e2e screenshots at 4 sizes |
| M2 | Social pings | `ui/pingWheel.ts`, `src/data/social.ts`, render marker | `social.test.ts` (enumeration, clamped integer coordinates, mirrored rate limits); e2e: B pings, A sees marker and rail note within 300 ms of simulated latency |
| M3 | Quick chat and emotes | `src/party/ui/quickChat.ts`, `ui/lol-hud.css` | e2e: the button does not overlap the ability bar at 667x375 (bounding boxes); mute hides the sender's notes |
| M4 | Takeover UI | `matchSession.ts` (mode bits), overhead robot glyph, rail notes | e2e `party-drop.spec.ts`: closing B gives A "Mira dropped · bot plays" within 7 s; B returns, catches up, A sees "Mira is back", B sees "Bot covered for you" |
| M5 | Votes and action notes | `ui/notify.ts`, `notifyQueue.ts` (`actions`), `matchSession.ts` Esc menu | `notify-actions.test.ts`; e2e `party-surrender.spec.ts` (2 humans, both Yes → `forfeit` for both); pause freezes both clients' tick |
| M6 | Results together | `ui/screens.ts`, `src/party/ui/partyResults.ts` | e2e: two human rows, piloted chip, each player sees only their own save status (mocked `/live`) |
| M7 | Party guards and first-match hints | `matchSession.ts`, `app/app.ts` | `mp-guards.test.ts`: pause, speed and portrait do not stop the sim; forfeit sends a vote; 0-match players get rail hints, no tutorial |
| M8 | Analytics | `analytics/posthog.ts`, server counters | `mp-analytics.test.ts`: event names, flat props, no code or room id in any prop |

### 12.4 Multi-client e2e harness

- **Relay harness:** `backend/test/party-relay.harness.ts`: a minimal Nest app with the relay providers, `MemoryRoomStore`, a ticket secret generated at start (never committed), `FRONT_END_URLS` set to the preview origin, and the missing-Origin allowance as a constructor option. Started with `ts-node` on a free port in 3105 to 3115.
- **Network shaper:** `pawlegends/tests/e2e/mp/net-proxy.mjs`, a WebSocket man-in-the-middle with per-client `{delayMs, jitterMs, stallEvery, stallMs, dropAfterS, dropAcks}`. It can rewrite one TURN for desync injection.
- **Playwright:** an `mp` project in `playwright.config.ts` with `webServer` entries for the game **production preview** (port 5400 to 5449; kill a leftover `vite preview` first) and the relay harness. Specs in `tests/e2e/mp/*.spec.ts` with 3 browser contexts (desktop, landscape touch, landscape touch). Use `./node_modules/.bin/playwright`.

| Spec | Scenario | Pass condition |
|---|---|---|
| `mp/smoke.spec.ts` | 3 humans, 0 ms | 60 s at ×1, then a surrender vote; all 3 trails equal the server's (`window.__plTrail`) |
| `mp/latency.spec.ts` | A 40 ms, B 120±40, C 250±120 | no client stalls > 1 s; A input-to-apply p95 < 200 ms; equal trails |
| `mp/stalls.spec.ts` | C stalls 2 s every 15 s | A and B never hold; C catches up; C never piloted |
| `mp/reconnect.spec.ts` | B dropped at 20 s for 10 s, acks dropped before the cut | B piloted at about 6 s, resumes, delta catch-up, no duplicated command, reclaims; equal hash |
| `mp/reload.spec.ts` | B reloads mid-match | full catch-up < 7 s; reclaim; equal hash |
| `mp/background.spec.ts` | B hidden 30 s | immediate pilot; on visible, fast-forward and reclaim |
| `mp/desync.spec.ts` | proxy rewrites one TURN for C | `mp_desync`; C rebuilds; equal hash |
| `mp/restart.spec.ts` | harness restarted mid-match | party and room restored; all clients resume; equal hash |
| `mp/scoring.spec.ts` | match end, both post via a mocked host to the `/live` test module | two saves, distinct digests; a third gives `DUPLICATE` |
| `mp/solo-party.spec.ts` | party of one presses Start | no room on the relay; a normal local match runs |
| `mp/load.mjs` (nightly) | 100 rooms × 3 headless Node clients | overrun p99 < 5 ms; referee lag < 5 turns; records capacity and memory |

Screenshots of every pre-match screen and in-match rail state go under `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/90036e17-2f2f-4789-b2bd-035db0b49f4b/scratchpad/mp/<stage>/` at 844x390, 667x375, 915x412 and 1440x900.

**Known pre-existing failure:** `tests/e2e/store.spec.ts:44`, not caused by this work.

---

## 13. Review points not taken, and why

| Point | Decision |
|---|---|
| Ship `relay.main.ts` as a separate process now | Deferred. All sim CPU is already in worker threads, and the event-loop gate protects the API. `DEPLOYMENT.md` has no process manager today. |
| Snapshot join (serialize `MatchHandle`) | Later (§15). Full fast-forward converges, and the ≤ 7 s phone budget is tested. |
| A separate fastest-win bucket for party matches | v1 gives no fastest win from party matches; a party leaderboard is later. |
| Mark open-seat matches fully unscored | Too harsh for a leader who waited for friends; the lower tier is used instead. |
| "Recent teammates" in v1 | Kept for v1.1 (§15); it needs signed-in presence and a hub badge. |

---

## 14. Docs to update with the code

- `docs/API.md`: the ticket endpoint, the WebSocket protocol summary, the `/live` v:2 party body.
- `docs/BACKEND.md`: relay and referee, env name `PAWLEGENDS_PARTY_TICKET_SECRET` (name only), single-instance note, event-loop gate, room and party collections, the `prev/` bundle.
- `docs/DEVELOPMENT.md`: the new error codes, the `PARTY_SINCE` rule (§1 merge warning), the deploy order (backend before game).
- `docs/DEPLOYMENT.md`: WebSocket through Cloudflare, heartbeat, SIGTERM handoff and restart behaviour, the rolling-deploy lease.
- `docs/plans/moba/GDD.md` §9.6: one line pointing here (added with this spec).

---

## 15. Cut / later

| Item | Why not v1 | When |
|---|---|---|
| Humans on both teams (friends vs friends) | Fog cannot be protected in lockstep; collusion; human modifiers are tuned for PvE (D1). Later as **Custom, unscored**: `humans` allows slots 3 to 5, the leader assigns teams, human modifiers off, fog caveat documented. | after v1 data |
| PvP against strangers / matchmaking | Needs the authoritative server of GDD §9.6 for fog. | GDD Phase 2 |
| Pings from slots 1 and 2 commanding bots | Needs a gate change; v1 keeps them social only. | v1.1 |
| XP catch-up for slots 1 and 2 | Balance work in `progression/xp.ts`; a sim change best done in the v12 lane. | with balance pass |
| Snapshot join (serialize/deserialize `MatchHandle`) | Fast-forward is enough for v1. Test needed: serialize → deserialize → continue equals an uninterrupted run. | v2 |
| Separate relay process and shard-prefixed codes, `GET /pawlegends/party/where`, extra regions | Single instance today. Regions by `mp_net` RTT data. | when capacity or RTT data says so |
| Party fastest-win leaderboard | Needs its own record field and UI. | v1.1 |
| Recent teammates (last 10, one-tap invite, hub badge) | Presence system needed. | v1.1 |
| Spectator link with a 20 s delay | Cheap later: TURN fan-out with a delay queue. | later |
| WebTransport datagrams with 3-deep redundancy | Progressive upgrade once TCP stalls are measured. | when `mp_net` shows the need |
| Discord Activity wrapper | Separate SDK and review. | later |
| Capacitor deep links (Android intent filter with `autoVerify`, `client/public/.well-known/assetlinks.json`, `apple-app-site-association`, `appUrlOpen` listener) | Needs a native release; links open in the browser meanwhile and cross-play works. Manual device check. | next native release |
