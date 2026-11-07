# Pawlegends parity plan: a real multiplayer MOBA that beats Mobile Legends, League of Legends and Wild Rift on its own terms (2026-11-06)

**Status:** design only. No code in this change.
**Base:** `feat/pawlegends-polish` at `SIM_VERSION = 13`, with party play (`MULTIPLAYER.md`, co-op against bots) merged in.
**Paths** are relative to the repo root.
**Sources:** the plans in this folder, the code (`pawlegends/src/`, `backend/src/pawlegends/`) and public material on the three rivals. Rival facts are from late 2026 and were **not re-checked in this pass**. Check a patch note before you quote a number.

**What "on its own terms" means.** We will not out-content a game with 130+ heroes. We win on six things they cannot copy:
1. Instant browser play: one tap, no download, no account.
2. 6 to 8 minute matches.
3. Cats against dogs as the factions.
4. One build for phone and desktop.
5. A full-strength bot that fills every empty or abandoned seat.
6. Replays that cost almost nothing, because the sim is deterministic lockstep.

Parity means a rival player finds nothing *missing* that they would miss in a 7-minute game. It does not mean a copy of every system.

**Hard boundaries for this plan:**
- **Sim.** The sim does not change before the sim batches named here (`SIM_VERSION 13` is live). Each batch below is a `SIM_VERSION` bump with a frozen bundle and backend-first deploys, like v10 to v13.
- **Concurrent lanes.** The dogs lane (`feat/pawlegends-dogs`, `DOGS-V13.md`) adds 5 dogs, the CATS/DOGS switch and side-aware copy. The netcode lane (`feat/pawlegends-mp`) is changing the net layer, input delay and own-hero prediction. Every milestone here starts **after both have merged** and builds on what they ship. This plan edits none of their files now.
- **Scores.** The one score write path stays `POST /user/catbassadors/live` (root `CLAUDE.md`, `MULTIPLAYER.md` D7). Ratings, ranked points and season rewards are written there and nowhere else. The relay and matchmaker only *read* user data and write room records. `party-relay.no-score.spec.ts` already asserts this, and it extends to every new provider.
- **Gate.** Phase 2 (PvP) starts only if the Dec 10 launch gate passes (`LAUNCH.md` b.1). M1a below needs no sim change and can ship before that read.

---

## 0. Summary

| Milestone | What a player gets | Sim change | Depends on |
|---|---|---|---|
| **M0** (render only, now) | Less zoomed-in camera, camera-height setting, equal view for all in PvP | none | nothing |
| **M1a** Quick Play co-op | "Play now" places you with 1 or 2 strangers against bots in under 30 s | none (rides party v13) | mp merged |
| **M1b** Casual PvP 3v3 | Public cats-vs-dogs queue, humans on both teams, bot fill after a timeout, parties, regions, hidden Glicko-2, backfill, leaver rules | **S-PvP** batch | dogs and mp merged; Dec 10 gate |
| **M2** Ranked | Tiers, placements, 8-week seasons, cosmetic rewards, all through `/live` | none beyond S-PvP | M1b live 2+ weeks |
| **M3** Spectate and replays | Watch friends live (delayed), replay any match from its input log, share a clip card | none | M1b |
| **M4** Content cadence | 24 heroes, then 30; build choices on Toys; a second objective; one sim batch every 4 weeks | **S-Obj**, then **S-Content-n** | M1b |

Every new client surface is a lazy chunk. First-load JS stays within the `MULTIPLAYER.md` §11 budget, which allows a first-load delta of ≤ 2 KB per milestone.

---

## 1. Parity matrix

Columns:
- **MLBB** is Mobile Legends: Bang Bang (5v5, mobile).
- **LoL** is League of Legends (5v5, PC).
- **WR** is Wild Rift (5v5, mobile and console).
- **Us** is Pawlegends on `feat/pawlegends-polish`.
- **Gap** is what is missing.
- **Plan** is the milestone that closes it, or **differ** when we deliberately do something else (§2).

| Area | MLBB | LoL | WR | Us today | Gap | Plan |
|---|---|---|---|---|---|---|
| **Matchmaking** | Global queues, by region | Region queues, role queue | Region queues, role preference | Friends-only party rooms (≤ 3 humans vs bots, `party.service.ts`). No public queue | No queue with strangers. No PvP | M1a, M1b |
| **Ranked / MMR** | Warrior → Mythical tiers, stars, star protection | Iron → Challenger, LP, hidden MMR | Iron → Challenger, Ranked Marks | Local bot ladder only (`meta/ladder.ts`, browser storage, "never reaches the server") | No server rating, no seasons | M1b (hidden Glicko-2), M2 |
| **Roles** | 6 roles, role picker | 5 positions, role queue | 5 lanes, role preference | 5 roles in hero data (tank, fighter, assassin, marksman, mage, plus support from v11). Bots lane by slot (`roleOf = id % 3`) | No role preference in a queue. Lanes are fixed by slot | M1b: soft role preference. M4: role lanes (GAPS N9) |
| **Hero count** | ~130 | ~170 | 100+ | 12 (10 cats, 2 dogs). 17 after the dogs merge (10 + 7) | Small, but 3v3 needs far fewer: 17 heroes give 120 distinct cat teams and 35 dog teams with no repeats | M4: 24, then 30. Bans at 24 |
| **Items / builds** | 6-slot shop, recommended builds | Full shop | Shop + boot enchants, recommended builds | **Toys** (v12): 4 tiers bought automatically from Fish by role (`data/toys.ts`). No player choice | No build expression | M4: Toy paths (one tap, 2 options per tier). **Differ**: no shop |
| **Objectives** | Turtle, Lord, plus a jungle | Dragons, Voidgrubs/Herald, Baron, Atakhan | Drakes, Herald, Baron, Elder | Pudding escort, 1 rat camp a side; 79.5% of matches end after Sunset, and only Pudding decides fights (AUDIT GP-03, GP-04) | One deciding objective; matches feel scripted | M4: **S-Obj** (contested camp, Crow roost N3, core opens after a lane falls) |
| **Surrender / AFK / leaver** | Surrender vote, credit score, AFK report | Surrender vote mid-game, LeaverBuster, dodge penalties | Surrender vote, AFK penalties | Party: surrender vote from `forfeitFrom` (`room.ts:553`), AFK and drop piloted by a full bot, AFK rule on rewards (> 50% piloted pays nothing). Solo: Forfeit; Leave is free (AUDIT UX-03) | No penalties across matches. No loss forgiveness | M1b leaver ladder (§3.7). **Differ**: a bot holds the seat, no 3v2 |
| **Reconnect** | Rejoin, autopilot meanwhile | Rejoin, team plays 4v5 | Rejoin, team plays a player short | Resume token, delta catch-up, a pilot holds the seat, deploys survive (N7, N9) | None for co-op. PvP reuses it | already at parity, kept in M1b |
| **Chat / pings** | Text, voice, quick chat, pings | Text, pings, ping wheel | Pings, quick chat, voice | Enumerated pings, quick chat and emotes only (`data/social.ts`, `data/pings.ts`), mute, names hidden (D8) | No free text or voice | **Differ** (§2). M1b adds an opponent-side mute-all and "all chat: emotes only" |
| **Spectate** | Spectate friends | Spectate (3 min delay) | Spectate friends | None (`MULTIPLAYER.md` §15 lists a 20 s delayed link as "cheap later") | Missing | M3 |
| **Replays** | Replays | `.rofl`, current patch only | None | `runPartyReplay` and `verifyPartyReplay` exist; room logs are stored 30 days; no viewer (GAPS N1) | No viewer, no share | M3 (with old-patch replays, which LoL lacks) |
| **Events** | Constant events, modes | Rotating modes, events, passes | Events, rotating modes | Date-seeded daily quests. Mutator field in `MatchConfig` but only `'none'` (`api.ts:53`) | No live-ops config, no rotation | M4: `GET /pawlegends/config` (GAPS N2), mutators as a sim batch |
| **Progression** | Account level, emblems, hero mastery, battle pass | Account level, mastery, pass | Account level, mastery, pass | Treat Track (`meta/treats.ts`), quests, grade, titles and frames | No account-wide long tail; no season track | M2: season track (free). **Differ**: no paid pass (GAPS §6) |
| **Anti-cheat** | Server checks | Server authority + Vanguard (kernel) | Server authority | Every scored match is re-simmed on the server (v1 solo, v2 party verdict three ways). Abuse caps keyed by account, guest key and verified client IP | Lockstep shows all state to every client, so a hacked client can see into bushes | M1b: brush-only info, detection heuristics, IP-pair rules (§3.10). **Differ** (§2) |
| **Netcode** | Frame sync (widely reported, not official) | Server authoritative, 30 Hz | Server authoritative | Server-clocked relay lockstep, 15 Hz turns, referee in workers; own-hero prediction in progress (mp lane) | Input delay ≈ RTT/2 + 116 ms before prediction | mp lane, then the M1b targets (§3.11) |
| **Region servers** | SEA-centric, many regions | ~16 regions | Several regions | One Nest instance (DigitalOcean); relay inside it (D13) | No region choice | M1b: region-aware relay selection (§3.4) |
| **Accessibility** | Camera height, button layout, colour options | Colourblind mode, rebinding | Camera height, layout editor, colourblind | Wheel zoom on desktop (0.72× to 1.9×); phones fixed at 0.66× of the base distance; no layout editor (CF-11); no left-hand mirror; relation colours just fixed (GFX-01) | Phones feel too zoomed in; no camera setting; no colourblind check | M0 (§1.1), M2 adds the layout editor and colourblind patterns |
| **Onboarding** | Tutorial, training ground, AI matches | Tutorial, co-op vs AI | Tutorial, training | Guided first match, staged difficulty unlocks, first-match hints | No training ground; newcomers could meet veterans in PvP | M1b: new players never enter PvP before 5 completed matches; protected new-player pool by hidden RD. M4: training ground (GAPS N7) |
| **Match length** | 12 to 20 min | 25 to 35 min | 15 to 20 min | 7:01 median (2,000 seeds) | none | **Differ**, this is our edge |
| **Install** | ~3 GB app | ~20 GB client + Vanguard | ~3 GB app | 0. Browser, the tokentails.com iframe, or the Capacitor app; ~317 KB first load | none | **Differ**, this is our edge |

### 1.1 Camera (M0, render only; addresses the user's note that the game is "a little bit zoomed in too much")

The code agrees with the note:
- Desktop default is `ZOOM_DEFAULT = 0.88` of `MOBA_DIST = 27` m (`render/camera/zoom.ts`, `render/renderer.ts`), so about 23.8 m.
- Phones multiply that by `SHORT_LANDSCAPE_ZOOM = 0.75`, so about 17.8 m, and they have no pinch.
- Round 1 pushed phones closer because heroes were hard to tell apart. The fix for that was silhouettes and outlines (GFX-03, GFX-04), not distance. AUDIT CF-05 also found the button cluster covering ground ahead of the hero at 667 px.

Rivals let the player choose: WR and MLBB both have a camera-height setting.

| Item | Spec |
|---|---|
| Defaults | Desktop `ZOOM_DEFAULT` 0.88 → **1.0**. Phones `SHORT_LANDSCAPE_ZOOM` 0.75 → **0.85**. Keep the CF-05 look-ahead toward the aim. Check with the 48 px read test (GFX-03) and the `hud-compact` and `match-touch` e2e screenshots at 667, 844 and 1440 |
| Setting | "Camera height" slider in Settings (and in the pause menu, UX-09): 0.85× to 1.25× of the device default, stored per viewer (browser storage, a convenience only). Pinch on touch uses the same clamp |
| Fairness in PvP | In a PvP room the zoom-out limit is capped so every player sees the same **ground area**, not the same distance. The cap is about 34 m × 19 m at 16:9 (zoom 1.25 at the new default), scaled by aspect so a 21:9 phone gets no wider strip. Desktop `ZOOM_MAX_WIDE = 1.9` applies only to solo, co-op and spectate. LoL caps zoom for the same reason |
| Layer | render-ui-input. No sim change, no replay change. It can ship before M1, with the polish lane |

---

## 2. Where we deliberately differ, and why that is better

| We do | They do | Why ours is better for a 7-minute browser MOBA |
|---|---|---|
| **3v3 on a 2-lane map** | 5v5 on 3 lanes | It fills a queue at 1/2.5 of the population and keeps a phone screen readable. Each player is 33% of the team, so one player matters, and one leaver hurts less because a bot takes the seat |
| **A full-strength bot fills every empty, late or abandoned seat** (`createPlayerBotFor`) | 4v5, remake votes, weak autopilot | Nobody plays short-handed. In casual a queue never waits more than 30 s. The bot plays the leaver's hero, so team comps survive |
| **Cats vs dogs as fixed sides** | Any champion on either team | It is a rivalry players can pledge to (GDD "Team Cat or Team Dog?"). Mirror matches are impossible across teams. A queue side preference ("Cat / Dog / Either") becomes a matchmaking lever and a weekly faction score |
| **Toys bought automatically, with one-tap path choices (M4)** | A 6-slot shop with 100+ items | One-handed phone play. No shop screen mid-fight. Build depth comes from 2-option forks, not from memorising items. GAPS §6 already rejects a shop before Phase 3 |
| **Enumerated comms only** (pings, quick chat, emotes) | Text and voice chat | Players include minors, and invite links get forwarded. No moderation cost. Toxicity, the top complaint in all three, has no channel |
| **No punitive ranked**: bottom two tiers never lose points, no tier decay (only "inactive" on the board), losses cushioned by grade | Stars and LP lost from low tiers, decay at the top | Wrong tone for a cat game and a short session. Glicko-2 RD already widens for inactive players, so ratings stay honest without punishment |
| **Deterministic relay lockstep** | Server-authoritative simulation | About 2.3 ms of server CPU per room-second. Replays are input logs (40 to 250 KB) that replay on any patch with the frozen bundle. Verification re-runs the same code. The cost is fog: a hacked client can see into brush (§3.10). With brush-only vision, no fog of war and a 7-minute match, that is worth much less than in LoL. Authoritative ranked stays an option if the measures in §3.10 trip |
| **Guest play, scored** | Account first | A friend from a link plays in 2 taps and keeps rewards on a guest account. Ranked needs an account (§4.1), casual does not |
| **No download, one build** | Separate PC and mobile games (LoL vs WR) | Phone vs desktop cross-play from day one. The view is equalised (§1.1) and touch aim assists are in the render layer, so neither platform needs its own queue |
| **No gacha, no stat skins, no paid pass** | All three monetise this way | "Every cat is a direct buy" (GAPS §6) is our trust story with shelter buyers |
| **6 to 8 minute matches with structure-based ends (S-Obj)** | 15 to 35 minutes | Fits a bus stop or a work break, and fits the tokentails.com embed. It is also the main reason someone tries us instead of opening WR |

---

## 3. M1: open matchmaking

M1 ships in two steps that share one matchmaker:
- **M1a, Quick Play co-op.** Strangers fill your team, bots are the enemy. No sim change, because it rides party v13 (`humans ⊆ {0,1,2}`).
- **M1b, Casual PvP 3v3.** Humans on both teams. It needs the **S-PvP** sim batch (§3.12).

### 3.1 Player flow

1. The title shows **Play** with a mode chip: "Quick Play (with others)" by default after match 5, "Solo vs bots", "Party".
2. Tap Play. The client sends `mm.join`.
3. The queue card shows "Finding players… 0:12 · est. 0:20", a Cancel button and the side chip "Cat · Dog · Either".
4. On a match the client sends `mm.found`, and an **Accept** card shows for 10 s (strangers only; a party skips it for its own members, D11).
5. Pick: 30 s, simultaneous inside each team, hidden from the other team until loading.
6. Loading, then the match. This is the existing room path.
7. Results, then "Play again" (re-queue with the same party) or "Back".

Bot fill in casual:
- M1a fills empty teammate seats with bots at 30 s.
- M1b fills at 30 s, symmetrically when it can (the same count of bots on each side), and asymmetrically when it cannot.
- Every bot seat is labelled "Bot" on the loading screen and in results.

### 3.2 Matchmaker (pure class, fake clock)

**File:** `backend/src/pawlegends/mm/matchmaker.ts`. It is the same style as `party.service.ts`: JSON in and out, no I/O, and the tests drive the clock.

- **Entries.** A queue entry is a solo player or a party of 2 or 3. Each entry has:
  - `{id, members[{identity, rating, rd, newbie, ipKey, netKey}], queue: 'coop'|'casual'|'ranked', side: 'cat'|'dog'|'any', regions: {id: rttMs}, roles?: role[2], enqueuedAt}`.
- **Tick.** The matchmaker ticks every 500 ms per region pool.
- **Search window.** It grows with the oldest member's wait `w` in seconds:
  - rating window `|Δ team mean| ≤ 75 + 12·w`, capped at 400;
  - RD-aware: a player with `rd > 200` counts as `rd`-wide;
  - region: the home region first. A neighbour region is allowed after 20 s if every member's RTT to it is ≤ 150 ms casual or ≤ 120 ms ranked.
- **Fit score** (lower is better). Teams are formed greedily from the oldest entry:
  - `|predicted win% − 50| · 2` (Glicko-2 expected score, team composite)
  - `+ 8 · role overlap`
  - `+ 5 · side mismatch`
  - `+ 0.05 · max RTT`
  - Parties play only against parties of the same size or larger, unless the wait passes 40 s.
- **Teams.** A match is 2 teams of 3 seats. One team is cats and one is dogs. A side request (`cat`/`dog`) is honoured when the fit stays within window, else it is relaxed after 25 s. "Either" fills whichever side is short.
- **Bot fill** (casual and co-op) at `fillAt = 30 s` (constant `MM_LIMITS.fillAtMs`):
  - Form the best match from the humans present and fill the rest with bots.
  - Bot difficulty comes from the team mean rating: < 1300 Easy, < 1650 Normal, else Hard (`mm/fill.ts`).
  - In M1b a lone human side is never matched against 3 humans if a 2-human team can be built within 15 more seconds.
- **New players.** A player with fewer than 5 completed matches, or `rd > 300`, is never placed in PvP. They go to co-op (M1a) and see "PvP unlocks after 5 matches". With `rd > 250` they are matched only with others of `rd > 250` until 10 PvP matches (a protected pool, widened at 45 s).
- **Same-network rule.** Two identities with the same `ipKey` (or the same `/24` `netKey` in ranked) are **never put on opposite teams**. This blocks win-trading from one house or school. They may be teammates.
- **Output.** `{matchId, region, teams[2][3]: {entryId|bot, slot}, sides, fill[]}`. The relay creates a room from it.

### 3.3 Party queueing

- A friend party (`party.service.ts`) gains a leader action **Queue**. The party enters as one entry and keeps its `code`.
- Party rating for matching is `mean + 0.25 · (max − mean)`, so a strong player cannot drag a weak friend into easy games.
- Party size 3 in M1b: it plays a full-human 3-stack only after 40 s, or faces a mixed team.
- After the match the party returns to its results phase as today. "Play again together" re-queues the party.
- Ranked (M2): solo or duo only, and a duo must be within 2 divisions or 250 rating. 3-stacks play casual.

### 3.4 Region-aware relay selection

Today there is one Nest instance with the relay inside it (D13, `MULTIPLAYER.md` §15 "Separate relay process … extra regions").

- **Relay process.** `backend/src/pawlegends/party/relay-main.ts` boots `PartyRelayService`, `RoomScheduler`, `RefereePool` and `MongoRoomStore` without the HTTP API. One build, two entry points.
  - The home region (EU, Frankfurt) keeps the relay inside the API process until load says otherwise.
  - The edge regions (US-East, Singapore) run `relay-main` on their own droplets.
- **Config.** `PAWLEGENDS_RELAY_REGIONS` holds the region list as JSON: `[{id, ws, probe}]`. Only the name is documented in `docs/BACKEND.md`. It is not a flag: when it is unset, the list is the home relay alone.
- **Discovery.** `GET /pawlegends/mm/regions` (public, cached 5 min) returns `{regions: [{id, ws, probe}]}`.
- **Probe.**
  - The client opens a short WebSocket to each region's `probe` path (`/pawlegends/ws`, subprotocol `pl.probe`).
  - It sends 5 BEAT frames, takes the median ECHO RTT and closes.
  - The probe runs on the title screen (idle), is reused for 10 min and stays under 1 KB a region.
  - A failed probe counts as `9999`.
- **Choice.**
  - The matchmaker lives in the home region (one in-memory instance, like the API).
  - The queue runs on the home socket.
  - A match is hosted in the region that minimises the **max** RTT of its humans. Ties go to the home region.
  - `mm.assign` gives the client that region's `ws`, a single-use room ticket and the room id.
- **Room ownership.** `PawlegendsRoom` gains `region`. Leases (N9) are claimed only by an instance of the same region. A relay restored in another region refuses the room (`room_gone`).
- **Cost.** Each edge relay is one 2 vCPU droplet at about $12 to $24 a month (GDD §9.6). Add a region only when `mp_net` shows ≥ 15% of matched players above 120 ms RTT to every existing region for 2 weeks.

### 3.5 Hidden rating: Glicko-2

**File:** `backend/src/pawlegends/mm/glicko2.ts`. It is pure and integer-free, but deterministic: the same inputs give the same float outputs in Node, and it is unit-tested against Glickman's paper example.

- **Defaults.** `r = 1500`, `RD = 350`, `σ = 0.06`, `τ = 0.5`. RD floor 45.
- **Inactivity.** RD grows with one rating period per 7 days of inactivity, up to 350.
- **Queues.** There are three independent ratings: `coop`, `casual` and `ranked`. Ranked seeds from casual at the first placement (`r` copied, `RD = max(RD, 200)`).
- **Team matches.** Each human is updated against the **opposing team composite**: `r = mean(r)`, `RD = sqrt(mean(RD²))`. The outcome is 1 or 0. A bot seat counts as a fixed pseudo-player:
  - Easy: 1100 / RD 60
  - Normal: 1450 / RD 60
  - Hard: 1750 / RD 60
- **Bot-share weight.** A match with bot fill updates with weight `humanShareOfOpponents`, applied as a scaled rating-period contribution (`v` and `Δ` × weight). A team that beat 3 bots barely moves.
- **Performance never moves MMR. Only win or loss does.** Grade affects ranked points only (§4.2), and only to cushion losses, as `meta/ladder.ts` already does.
- **Who writes it.** Ratings are written **only** inside the `/live` save (§3.9).
  - The matchmaker reads them.
  - At room creation the relay snapshots `ratingsAtStart[6]` into the room. The update is computed from that snapshot, so the order in which players post their results cannot change anyone's number.

### 3.6 Backfill (casual only, never ranked)

- When a human seat is piloted for reason `left`, or for `drop`/`afk` longer than 60 s, before tick 5,400 (3:00), the matchmaker offers the seat to queued players of that region:
  - same side;
  - rating within 300;
  - they are told "Join a match in progress · 1:42 · your team is ahead/behind".
- **Joining.** Accepting claims the piloted slot (the P10 join-in-progress path) and fast-forwards with catch-up.
- **The leaver.** If the original player comes back, they reclaim the seat only if it was not backfilled. Otherwise they get "Your seat was taken" and the match counts as left.
- **Rewards.** A backfiller's win pays full catnip. A loss changes no rating (`backfill` flag in the room's occupants).
- **Ranked.** A leaver's seat stays piloted by the full-strength bot for the rest of the match. Teammates get loss forgiveness (§4.3).

### 3.7 Surrender, AFK and leaver handling

- **Surrender (S-PvP makes it per team).**
  - The vote opens from 4:00 (`forfeitFrom` = 7,200 ticks).
  - It needs 2 of 3 humans on that team, or all humans when fewer than 3. Bots do not vote.
  - The server injects `Op.Forfeit` into the stream of that team's lowest human slot. This is the existing D5 path, extended to team 1.
  - One vote per team per 60 s.
- **AFK detection.** Reuse `room.ts`: silence → `away` at 3 s, pilot at 6 s, AFK warning at 45 s, AFK pilot at 60 s (`party-limits.ts`). Pilot ticks per reason are already recorded per slot.
- **Leaver events** (derived, never a new write path). A completed room is the evidence:
  - `left`: `bye` or no reconnect for 180 s before the end;
  - `afk`: AFK pilot ticks > 35% of ticks;
  - `dodge`: an accept declined or timed out, or a disconnect during pick.
  - `leaverStatus(identity)` is a **pure function over the last 30 days of `PawlegendsRoom` documents** where the identity sat. It needs an index on `occupants.accountId` (and `occupants.guestKeyHash`) plus `createdAt`. No penalty collection exists to tamper with or keep in sync.
- **Penalty ladder** (casual and ranked share it; each step decays after 10 completed matches without an event):

| Events in 7 days | Effect |
|---|---|
| 1 | Warning card: "Leaving puts a bot in your seat. Next time: a short wait" |
| 2 | Low-priority queue: +2 min before matching (shown as a countdown, cancellable) |
| 3 | +5 min, and ranked locked for 24 h |
| 4+ | +15 min, ranked locked for 72 h, no catnip from the next 3 matches |
| Dodges | The first 2 per day are free. After that, +1 min each, and ranked dodges cost 3 ranked points (never below a tier floor) |

- **Loss forgiveness.**
  - When a teammate's `left` or `afk` happens before 5:00, the other humans on that team lose no hidden rating and no ranked points if they lose.
  - In M1b this counts the same as "the bot played for them". The leaver takes a full loss.
  - The AFK reward rule (> 50% piloted pays nothing) stays as it is.

### 3.8 Protocol additions (`pawlegends/src/net/proto.ts`, `PROTO` 1 → 2)

All new frames are JSON on the existing socket. Every `MULTIPLAYER.md` §2.3 rule applies: ≤ 1 KB, typed guards, unknown keys rejected, rate-limited. A `PROTO 1` client keeps working for parties. The relay accepts both during the skew window, and only `PROTO 2` sockets may queue.

**Client to server**

| t | Fields | Rules |
|---|---|---|
| `mm.join` | `queue: 'coop'\|'casual'\|'ranked'`, `side: 'cat'\|'dog'\|'any'`, `rtts: {[regionId]: int}` (≤ 8 keys, 0..9999), `roles?: [role, role]` | After `welcome`. Party: leader only. Refused with `mm_locked{untilMs}` when the leaver ladder or ranked rules forbid it |
| `mm.leave` | | Any time before `mm.assign` |
| `mm.accept` | `match, yes` | Within 10 s of `mm.found` |
| `mm.backfill` | `match, yes` | Within 10 s of an offer |
| `spectate` (M3) | `room \| friend`, `delay?` | §6 |

**Server to client**

| t | Fields |
|---|---|
| `mm.status` | `queue, waitedMs, estimateMs, pos?`, `lowPriorityMs?` (sent at most once every 2 s) |
| `mm.found` | `match, acceptByMs, mode, side, size` (counts only, never names) |
| `mm.cancel` | `reason: 'declined'\|'timeout'\|'server'` (you are put back at the front of the queue when someone else declined) |
| `mm.assign` | `match, region, ws, ticket, room` (connect to `ws` with `hello{ticket, room}`) |
| `mm.backfill.offer` | `match, side, clockS, score: [a,b]` |
| `error` codes (new) | `mm_locked`, `mm_ranked_pending` (§4.4), `mm_need_account`, `mm_region_unreachable` |

**Room `match` frame:** gains `mode: 'party'|'coop'|'casual'|'ranked'` and `teams` (slot → team, sides). TURN frames are unchanged in layout. In M1b the `modeMask` byte covers 6 slots (bit s = slot s piloted), which already fits in a u8, and acks extend to 6 human slots. Golden-bytes tests are regenerated for `PROTO 2`.

### 3.9 Backend data model

**`PawlegendsRating`** (`backend/src/pawlegends/mm/rating.schema.ts`). It is written **only** by the `/live` save:

| Field | Type | Notes |
|---|---|---|
| `_id` | `${accountId}:${queue}` | queue ∈ `coop`, `casual`, `ranked` |
| `accountId` | string, indexed | guests get coop and casual rows on their guest account; merged by `pawlegends-merge.ts` rules (higher RD row loses) |
| `r`, `rd`, `sigma` | number | Glicko-2 |
| `games`, `wins` | int | |
| `lastAt` | Date | drives the RD growth |
| `appliedRooms` | string[] (last 50) | idempotency, next to the digest index |
| ranked only (M2) | `season, tier, division, points, placementsLeft, peakTier, peakSeason[]` | §4 |

**`PawlegendsRoom`** (`party/room-store.ts`, extended):
- `mode`;
- `region`;
- `teams: {slot: 0|1}`;
- `sides`;
- `ratingsAtStart: [{slot, r, rd, sigma}|null] × 6`;
- `fill: slot[]`;
- `backfill: {slot, at}[]`;
- `queueMs: {slot: ms}` (for queue-time measures);
- `season?`.

Room log cap: `roomLogBytes` 160 KB → **256 KB** for 6-human rooms. Six per-slot gates at 30,600 B add up to 184 KB at worst.

**`/live` (`pawlegends-party-live.ts`).** The DTO (`PawlegendsPartyResultDto`, `v: 2`) is unchanged: `{room, slot, simVersion, ticks, outcome, finalHash}`. The branch reads `room.mode`:
- `party`, `coop` and `casual` keep today's checks and catnip rules.
- Then they apply the Glicko-2 update for that queue, from `ratingsAtStart`. This happens once per account per room (`appliedRooms` + the digest).
- `outcome` is per team, so a team-1 human's `won` is the sim's `lost` seen from team 1.
- `ranked` adds the §4 checks.

**What is never stored:** chat (there is none), IPs in rooms (only the hashed `ipKey` lives in memory for caps and the same-network rule), or names other than the D8 generated names.

### 3.10 Anti-cheat and abuse limits (keyed by real client IP)

**Client IP.** `MULTIPLAYER.md` S1 already does this on the upgrade: `cf-connecting-ip` is trusted only from a Cloudflare peer (`isCloudflareIp()`, `shared/client-ip.ts` `clientIp()`), else the socket address. `ipKey = clientIpKey(ip)`, `netKey` = /24 (IPv4) or /48 (IPv6).

| Limit | Value |
|---|---|
| `mm.join` per identity / per IP / per net | 30 / 120 / 600 per 10 min (NAT-friendly: per-IP is loose, identity is tight) |
| Queued entries per identity / per IP | 1 / 12 |
| Accept declines per identity | 2 free per day, then the dodge ladder |
| Ranked queue | signed-in account only (no guests), ≥ 10 completed matches, one ranked queue per identity, and ≤ 3 ranked accounts per IP per day (more get `mm_locked` for that IP, with a support line) |
| Room tickets | single use, 60 s, bound to identity and room (the existing ticket HMAC with `aud: 'pl-room'`) |
| Backfill offers | ≤ 3 per identity per 10 min |

**Cheating, layer by layer:**
- **State tampering and speed hacks are impossible.** The referee re-sims every turn and decides the verdict. A client's own hash can only resync that client (N6).
- **Scripted inputs (bots playing for humans).** The referee already logs the share of a slot's commands identical to what `createPlayerBotFor` would emit (the §6 farm signal). In ranked, a slot over 85% for 3 matches is flagged for review. It is never banned automatically.
- **Map hack (seeing into brush).** Lockstep gives every client the whole world. Mitigations, in order:
  1. Brush is the only hidden information. There is no fog of war (GDD §9.4).
  2. Units that attack or cast from brush are revealed for 1.5 s. This is a render rule plus a sim rule in S-Obj, if not already present.
  3. **Detection.** The referee logs "reacts to hidden" events: an `Attack` or `Cast` whose target or aim point is within 1.5 m of an enemy that was hidden from that team at the time, with no reveal in the last 1 s. The ranked z-score per account over 20 matches flags at z > 4 for review.
  4. **Escalation trigger.** If confirmed map-hack reports exceed 1% of ranked matches for 2 weeks, ranked moves to the GDD §9.6 authoritative server with team-filtered snapshots. The sim already filters snapshots per team. This is the documented exit, not the plan.
- **Win trading.** The same-network rule (§3.2) blocks it. A pair of accounts that meet on opposite teams more than 3 times in 7 days at more than 70% one-way results is flagged.
- **Smurfing.** RD-based protected pool for newcomers, the ranked account rules and the ranked IP cap. Hidden MMR catches up within about 10 matches (Glicko-2 with RD 350).

### 3.11 Netcode targets (owned by the mp lane; M1b measures them)

Latency definitions:
- **Input-to-visible** is the time from touch or key down to the first rendered change of your hero.
- **Input-to-authoritative** is the time until your sim applies the command.

At turn = 2 ticks and buffer B:
`RTT/2 + 33 (average turn wait) + B · 67 + 16 (a frame)`.

| RTT | Buffer | Own-hero move visible (predicted) p95 | Authoritative p50 / p95 | Cast effect lands (unpredicted) p95 | Region policy |
|---|---|---|---|---|---|
| ≤ 30 ms | 1 | ≤ 50 ms | ≤ 135 / 170 ms | ≤ 170 ms | home |
| 60 ms | 1 | ≤ 50 ms | ≤ 150 / 200 ms | ≤ 200 ms | home |
| 120 ms | 1 to 2 | ≤ 50 ms | ≤ 190 / 280 ms | ≤ 280 ms | ranked ceiling |
| 200 ms | 2 to 3 | ≤ 50 ms | ≤ 270 / 400 ms | ≤ 400 ms | casual ceiling; never matched above it |

Other targets:
- **Desync rate:** 0 in 10,000 PvP matches (§3.13).
- **Hold rate:** < 1% of turns held at the median player. Fewer than 2% of matches show "Waiting for server…" more than once.
- **Rejoin:** a mid-match reconnect plays again within 2 s on desktop and within 7 s on a 4×-throttled phone (the N7 targets).

### 3.12 Sim batch S-PvP (the one sim change M1b needs)

S-PvP rides the first `SIM_VERSION` after the dogs batch. It follows the `PARTY_SINCE` rule: `PVP_SINCE` is the first version that **shipped** with PvP code. The code is additive, and single-player and party outputs stay byte-identical. A golden test proves this, as `party-identity.test.ts` does.

| Change | Files |
|---|---|
| `MatchConfig.humans` may hold slots 0..5. `isHumanSlot` bound becomes `2 · SLOTS_PER_TEAM` | `sim/api.ts`, `sim/humans.ts`, `sim/party.ts` |
| `MatchConfig.mode: 'pve' \| 'pvp'` (absent means pve). In pvp the human modifiers are off: `humanDamageBp`, `humanTakenBp`, the struggling-human respawn rule, `enemyFishBp`, slot-0 XP catch-up and `G.HumanActAt`. Catch-up rules apply by team, symmetrically | `combat/damage.ts`, `effects/bonus.ts`, `progression/xp.ts`, `progression/fish.ts`, `data/bots.ts` |
| Same-tick input order extended: slot 0 ping, slot 0 command, forfeit block, slots 1 to 5 in order, then `stepBots` (pinned by a golden, as B2) | `sim/index.ts`, `sim/party-inputs.ts` |
| Forfeit and pings for team 1: `Op.Forfeit` and `Op.Ping` accepted from slot 3 (team 1's lowest human slot, server-injected); bots of team 1 obey team-1 pings | `sim/match.ts`, `bots/orders.ts`, `bots/pinger.ts` |
| Bot fill in pvp uses the difficulty given per team (`MatchConfig.fillDifficulty: [d0, d1]`) | `sim/index.ts` `fillPicksParty`, `data/bots.ts` |
| `PartyReplayRecord` `v: 3` with `teams` and 6 human slots; `verifyPvpReplay` in `server.ts` | `sim/api.ts`, `sim/party.ts`, `sim/server.ts` |
| Outcome per team in `SlotStats` (already per slot; `outcome` stays team 0's view) | none |

S-PvP tests:
- `pvp-identity` (all v13 and dogs fixtures unchanged);
- `pvp-order` golden;
- `pvp-sim`: 6 pilot streams to end, and swapping two streams changes the hash;
- `pvp-symmetry`: 2,000 seeds of 6 equal pilots give a side win rate of 47 to 53% and a hero spread of 46 to 54%;
- `pvp-verify` tamper set;
- `lint:sim`, `vendor-sim:check` and the browser determinism fuzz with `humans:[0..5]`.

### 3.13 Files, tests and release order (M1)

**Files**

| Lane | Files |
|---|---|
| Backend mm | new `backend/src/pawlegends/mm/` (`matchmaker.ts`, `glicko2.ts`, `fill.ts`, `leaver.ts`, `regions.ts`, `mm-limits.ts`, `mm.service.ts`, `rating.schema.ts`), `pawlegends.controller.ts` (`GET /pawlegends/mm/regions`), `app.module.ts` (register), `party/party-relay.ts` (mm frames, room tickets with `aud: 'pl-room'`), `party/room.ts` (`mode`, `teams`, per-team votes, `ratingsAtStart`, backfill claim), `party/room-store.ts` (fields, indexes), `party/relay-main.ts` (new), `pawlegends-party-live.ts` (rating update by mode), `shared-contracts/errors.ts` and every client copy listed in `docs/DEVELOPMENT.md` |
| Game | `src/net/proto.ts` (`PROTO 2`), new lazy `src/mm/` (`queueClient.ts`, `regionProbe.ts`, `ui/queueCard.ts`, `ui/acceptCard.ts`, `ui/backfillCard.ts`), `src/app/app.ts` (Play mode chip, lazy import), `src/party/partyClient.ts` (Queue action), `src/app/matchSession.ts` (team-aware votes and rail lines), `src/render/camera/zoom.ts` (PvP view cap) |
| Sim (S-PvP) | §3.12 |
| Tools | `tools/vendor-sim.mjs` (freeze the dogs version; PvP facade), `tests/e2e/mp/` harness for 6 clients, `tests/e2e/mp/load.mjs` (rooms per worker for 6-human rooms), new `tools/mm-sim.mjs` |
| Docs | `docs/API.md` (endpoint and frames), `docs/BACKEND.md` (env names `PAWLEGENDS_RELAY_REGIONS`), `docs/GAMES.md`, `GDD.md` §9.6 (points here) |

**Tests**

| Test | Proves |
|---|---|
| `mm/matchmaker.spec.ts` (fake clock) | windows widen with wait; same-network never on opposite teams; newbies never in PvP; parties vs parties; fill at 30 s; symmetric fill preferred; side requests honoured within the window |
| `mm/glicko2.spec.ts` | Glickman's worked example to 4 decimals; team composite; bot weight; RD growth by inactivity; same inputs give same outputs |
| `mm/leaver.spec.ts` | the ladder from fixture rooms; decay after 10 clean matches; dodges counted; no write anywhere (pure) |
| `mm-sim.mjs` (Poisson arrivals, synthetic ratings) | queue-time p50 and p95 per concurrency level (done criteria) |
| `pawlegends-party-live.spec.ts` (extended) | a rating moves once per account per room; order of posts does not change results; team-1 outcomes; loss forgiveness; casual backfill loss changes nothing |
| `party-relay.no-score.spec.ts` (extended) | no mm or relay provider injects `UserRepository`, `GameRepository` or the rating model for writing |
| `party-relay.security.spec.ts` (extended) | mm frame guards, caps per identity, IP and net; CF header ignored from non-Cloudflare peers; room ticket replay refused |
| e2e `mp/queue-coop.spec.ts` | 2 browsers queue coop, match in < 5 s, play to end, both saved |
| e2e `mp/queue-pvp.spec.ts` | 4 browsers + 2 bots fill, cats vs dogs, a surrender vote on team 1, results per team |
| e2e `mp/queue-backfill.spec.ts` | a leaver at 1:30 is backfilled by a queued browser, which catches up and finishes |
| `mp/soak.mjs` (Node, in-process relay, 6 pilot clients) | 10,000 PvP matches, every client hash equals the referee at every 30-tick mark, 0 desyncs |

**Release order (backend first, every time)**
1. **S-PvP sim** merged. Run `vendor-sim`, so the backend verifies the dogs version and the S-PvP version, and the frozen ones.
2. **Backend:** schema fields and indexes, `/live` rating branch, mm service, `PROTO 2` frames, `GET /pawlegends/mm/regions`. Deploy (DigitalOcean). A `PROTO 1` client still plays parties.
3. **Edge relays** (when the region rule in §3.4 says so): deploy `relay-main`, then set `PAWLEGENDS_RELAY_REGIONS`.
4. **Game:** `npm run build:client`, commit `client/public/pawlegends-game`, Vercel. M1a (coop) is visible first. M1b (casual PvP) goes on in the same build once S-PvP is live in the backend, because the game hides PvP when the backend's `simVersions` lacks `PVP_SINCE`. That is a capability check, not a flag.

**Done criteria (M1)**

| Measure | Target | Source |
|---|---|---|
| Queue time, casual | p50 < 30 s and p95 < 45 s at **any** concurrency (bot fill at 30 s); at ≥ 60 concurrent queuers in a region, ≥ 70% of casual matches have ≥ 4 humans and p50 < 20 s | `mm-sim.mjs`, then production `queueMs` |
| Queue time, coop | p50 < 10 s at ≥ 20 concurrent; never > 30 s | same |
| Match quality | predicted win% of the human-only matches within 40 to 60% for ≥ 80% of matches; actual side win rate 47 to 53% over 1,000 PvP matches | rooms + ratings |
| Desync | 0 in the 10,000-match soak; 0 referee divergences in the first 5,000 production rooms | `mp/soak.mjs`, server counters |
| Latency | the §3.11 table, measured from `mp_net` at p50 and p95 per RTT bucket | analytics |
| Leavers | `left` + `afk` events < 4% of human seats; the forfeit rate on PvP < 20% | rooms |
| Scoring integrity | 100% of casual and coop results verified by the referee verdict; a 10% sample re-verified from the raw log with 0 mismatches | worker queue |
| Capacity | `mp/load.mjs` measured rooms per worker for 6-human rooms on the production droplet; `maxLiveRooms` set from it with 30% headroom | load test |
| Budget | first-load delta ≤ 2 KB; mm chunk ≤ 20 KB gzip | `npm run budget` |

---

## 4. M2: ranked ladder

Ranked is PvP (S-PvP) with ranked rules. It needs no new sim change. It starts after casual PvP has run 2 or more weeks: enough rated games for the RD of active players to fall below 150.

### 4.1 Rules

- **Eligibility.** A signed-in account (Firebase, no guest), ≥ 10 completed matches, no ranked lock (§3.7), and every earlier ranked room settled (§4.4).
- **Queue.** Solo or duo. Bot fill only for the **third seat of both teams at once** (symmetric, Hard bots) after 90 s. Otherwise the player waits, with "est." shown. With fewer than 2 humans per team there is no ranked match.
- **Pick.** Blind pick within each team, unique heroes per team. When the roster reaches 24 heroes, add 1 ban per team (the captain is the highest-rated human) before pick.
- **Verification.** Every ranked result is fully re-verified (raw TURN log re-sim → `verifyPvpReplay`) **before** the `/live` save accepts it. Casual uses the referee verdict plus a 10% sample. The existing replay worker queue (`PAWLEGENDS_REPLAY_QUEUE`) does this. A pending room answers `202`-style `PAWLEGENDS_PARTY_PENDING` and the client save queue retries.

### 4.2 Tiers, points and placements

| Tier | Divisions | Protection |
|---|---|---|
| Kitten | III, II, I | never loses points |
| Tabby | III, II, I | never loses points |
| Alley | III, II, I | cushioned by grade |
| Lion | III, II, I | cushioned by grade |
| Legend | one ladder, points uncapped, top 100 shown | cushioned by grade |

- **Points.** 100 points per division. A win is +20, a loss −15.
  - Both are scaled by the **convergence factor** `c = clamp(1 + (MMR − tierMMR)/400, 0.5, 1.5)` for a win and `2 − c` for a loss. So a player whose hidden rating is above their tier climbs faster, and the visible tier converges on the hidden one.
  - Grade sets the loss share as `GRADE_LADDER` does today (an S or A loss costs half). It never adds to a win.
- **Tier MMR anchors.** Kitten III 1000, then +75 a division, Legend 2125+.
- **Placements.** 5 matches. No points are shown, and the tier is revealed after the 5th. The placement tier is the hidden rating's tier, capped at Lion I for a first season.
- **Promotion.** There are no promotion series (they are tilting and cost time). Crossing 100 promotes. Dropping below 0 in a non-protected division demotes, after one free "shield" loss per division.
- **Where the grade is computed.** The grade function moves into the vendored sim facade (GAPS N6), so the server computes the same grade the client shows. It reads only `SlotStats`. This is not a sim change: the function is pure TS beside the sim, and it is vendored but not hashed.

### 4.3 Seasons, decay and rewards

- **Seasons** last 8 weeks. They start on a Thursday at 16:00 UTC. A static table `backend/src/pawlegends/ranked/seasons.ts` has a client copy, listed in `docs/DEVELOPMENT.md` with the other duplicated constants.
- **Soft reset at season start.**
  - The hidden ranked `r` moves 25% toward 1500.
  - `RD = max(RD, 150)`.
  - 3 placement matches.
  - The visible tier restarts at most 2 divisions below last season's finish.
- **Decay.** Tiers and points never decay (GAPS §6: no punitive ranked). Instead:
  - inactivity raises RD (Glicko-2), so the first matches back move more;
  - a Legend player inactive for 14 days is shown as "inactive" and hidden from the top-100 board until their next ranked match.
- **Rewards (cosmetic only, never power, never catnip beyond the normal per-match rules):**
  - season frame for the highest tier reached;
  - title ("Alley Cat S1");
  - a coat **palette** for Lion and above, which the GAPS item 9 palette system already supports;
  - an animated name plate for the final top 100.
- **How rewards are granted.** Rewards are granted **inside the `/live` save**: the first ranked or casual save after a season's end writes the previous season's rewards to the user document (the `peakSeason[]` entry). `GET /pawlegends/ranked/me` (read only) shows pending rewards. No claim endpoint and no second write path.

### 4.4 Settlement: why losses cannot be dodged with one write path

A player could close the tab after a ranked loss and never post the result. The rule:
- The ranked `mm.join` checks the account's ended ranked rooms of the last 30 days that have no applied digest.
- If any exist, the queue answers `mm_ranked_pending{rooms}`. The game's save queue (`client/components/pawlegends/saves.ts`, which already retries) posts them to `/live` first, then re-queues automatically.
- A player can therefore never climb past an unposted loss.
- A player who never returns keeps a stale rating that affects no one.

### 4.5 Data model

- `PawlegendsRating` ranked fields: `season, tier, division, points, placementsLeft, shield, peakTier, peakSeason: [{season, tier, rewarded}]`.
- `PawlegendsRoom.mode = 'ranked'`, `season`.
- A read-only top-100 board, `GET /pawlegends/ranked/board?season=`. It is cached 60 s and shows D8 generated names or the opt-in cat card name (GAPS item 11 default: initial plus cat name, opt-out).

### 4.6 Files, tests, release, done

- **Files.** `backend/src/pawlegends/ranked/` (`seasons.ts`, `points.ts`, `rewards.ts`, `board.service.ts`), `pawlegends-party-live.ts` (ranked branch), `mm/matchmaker.ts` (ranked queue rules), `pawlegends.controller.ts` (`GET /pawlegends/ranked/me`, `/board`); game `src/meta/ranked.ts`, `src/ui/rankedCard.ts`, results strip (UX-04), Settings layout editor and colourblind patterns (accessibility parity: the CF-11 `touchLayout.js` solver, team rings with shape and colour).
- **Tests.**
  - `ranked/points.spec.ts`: convergence, protection, shields, placements, reset.
  - `ranked/settlement.spec.ts`: pending rooms block the queue; posting clears it.
  - `pawlegends-party-live.spec.ts`: a ranked save waits for verification; a tampered log is refused; rewards granted once at the first save after the season end.
  - e2e `mp/ranked.spec.ts`: 4 signed-in test accounts plus symmetric fill; the tier is revealed after placements.
- **Release.** Backend (season table, ranked branch, board) → game. Season 1 starts on the first Thursday after the game build is live.
- **Done.**
  - ≥ 95% of ranked results verified within 60 s of the match end.
  - 0 ranked saves without verification.
  - Ranked queue p50 < 60 s at ≥ 40 concurrent ranked queuers.
  - Placements land within 1 tier of the hidden rating for ≥ 85% of players after 20 matches.
  - Kitten + Tabby hold ≥ 40% of ranked players (an approachable distribution).
  - The ranked forfeit rate is < 15%.

---

## 5. M3: spectate and replays

Lockstep makes both cheap. A match is `config + TURN log`. Any client with the right sim bundle re-simulates it exactly, and the server spends no CPU.

### 5.1 Spectate

- **Entry.**
  - From a friend's party card ("Watch Mira").
  - From a link `?watch=<room>` that a player chose to share.
  - From the Legend board (top-100 matches, public).
- **Protocol.**
  - `spectate{room|friend, delay?}`. The relay checks the room and the viewer's right to watch: friend party member, link holder, or a public Legend match.
  - The relay sends `match` with `you: {slot: -1}` and CATCHUP from turn 0 up to `now − delay`, then TURN frames from a **delay queue**.
- **Delays.** Party and coop 20 s. Casual 60 s. Ranked 120 s (anti-ghosting, like LoL's 3 min, shorter because matches are 7 min).
- **The spectator client** is `NetHost` with no input: a free camera, both teams' plates, and the full map (the delay makes this safe).
- **Caps.** 20 spectators per room, 500 per instance, and spectate sockets per identity 2 and per IP 10. Spectators never count toward room limits and never send CMD (a strike).
- **Names.** Spectators see D8 names only. A player can turn "Allow friends to watch" off in Settings (default on).

### 5.2 Replays

- **Storage.** It already exists: `PawlegendsRoom.chunks` hold the TURN log, with a TTL of 30 days on ended rooms.
  - Ranked rooms: TTL 90 days.
  - A player can **pin** up to 20 of their own matches (`pinnedBy: accountId[]`); pinned rooms skip the TTL.
  - Size: 40 to 250 KB a match.
- **Endpoint.** `GET /pawlegends/replay/:room` (read only, rate-limited per IP at 30/min). It returns `{simVersion, simHash, config, names (D8), mode, log (base64 TURN bodies, gzip)}`. It works for rooms you sat in, rooms with a share token (`?t=`), and public Legend rooms.
- **Old patches** (a gap in LoL, which plays only current-patch replays).
  - `tools/vendor-sim.mjs` already freezes every released sim.
  - It also emits each frozen bundle as a client chunk, `client/public/pawlegends-game/sims/v<N>.<sha>.js`.
  - The viewer lazy-loads the bundle that matches `simVersion` and `simHash`.
  - Keep at least the last 6 versions on the CDN. Older replays show "This replay is from an older version" with a download of the record.
- **Viewer** (`src/replay/`, lazy, ≤ 30 KB gzip plus the sim chunk).
  - It runs the log in the existing worker.
  - Seeking re-sims from tick 0 with no render: ≤ 1.5 s desktop, ≤ 7 s on a 4×-throttled phone (the N7 fast-forward targets).
  - Keyframes are a later step, needing serialize and deserialize of `MatchHandle` (`MULTIPLAYER.md` §15).
  - Controls: 1×, 2×, 4×; free camera or follow a hero; "Jump to my takedowns" and "Jump to my deaths" from sim events.
- **Share card.** 1200×630 through the bridge `share` message (GAPS N1), with a link to `?replay=<room>&t=<token>`.
- **Solo matches.** Solo v1 records are already posted to `/live` with their inputs. The local client keeps its last 5 for the viewer, so no server storage is needed.

### 5.3 Files, tests, release, done

- **Files.** `party/party-relay.ts` (spectate frames, delay queue), `party/room-store.ts` (`pinnedBy`, ranked TTL, share tokens), `pawlegends.controller.ts` (`GET /pawlegends/replay/:room`, `POST /pawlegends/replay/:room/pin` is a cosmetic preference, not a score), `tools/vendor-sim.mjs` (client sim chunks), game `src/replay/` (viewer, timeline, share), `src/spectate/` (watch UI), `client/components/pawlegends/flags.ts` (forward `watch` and `replay` like `party`).
- **Tests.**
  - `replay-roundtrip.test.ts`: every room in the soak replays to the referee's `finalHash` with the matching frozen chunk.
  - `spectate.spec.ts`: delay respected to ±1 turn; caps; CMD from a spectator is a strike.
  - e2e `mp/spectate.spec.ts`: a friend watches a live match 20 s behind and sees the end.
  - e2e `replay.spec.ts`: open a replay link from an old sim version and seek to 5:00.
- **Release.** Backend (endpoint, TTLs, spectate frames) → game. The sim chunks ship with the game build.
- **Done.**
  - 100% of stored rooms from the last 6 sim versions replay to their verified hash.
  - Seek to the end in ≤ 1.5 s (desktop) and ≤ 7 s (throttled phone).
  - Spectate start-to-picture ≤ 3 s.
  - Server CPU per spectator ≈ 0. Measure the relay CPU with 20 spectators on one room: ≤ +5% over 0.

---

## 6. M4: content cadence

### 6.1 Targets

| When | Heroes | Cats / Dogs | Notes |
|---|---|---|---|
| After the dogs merge | 17 | 10 / 7 | every dog role covered (`DOGS-V13.md`) |
| v15 | 20 | 10 / 10 | Rocket, Frankie, Domino: the same roles a side (`DOGS-V15.md`) |
| M4 + 8 weeks | 24 | 12 / 12 | v16: Lord Barkus, Pilfer, the Golden Retriever and two cats (Longfellow dropped, `DOGS-V15.md` decision 3) |
| M4 + 16 weeks | 26 | 13 / 13 | **bans on** in ranked (1 per team) |
| End of 2027 | 30 | 15 / 15 | parity of sides |

Cadence:
- one new hero every 2 weeks, alternating sides;
- one **sim batch every 4 weeks**, carrying 2 heroes plus balance;
- each batch is a `SIM_VERSION` bump with a frozen bundle, backend first, and the 2,000-seed balance gate (hero 46 to 54%, side 47 to 53%, median 6:30 to 8:30) on **PvP self-play**, not only on bot matches.

### 6.2 Builds: Toy paths (S-Content-1)

- Toys stay automatic. Fish still buys tiers each second (`data/toys.ts`). At tiers 3 and 4 the player gets a **one-tap fork** of 2 options per role. Examples:
  - marksman: "Long Yarn" (+range) or "Quick Claws" (+attack speed);
  - tank: "Thick Fur" (armour) or "Big Purr" (an aura).
- **Defaults.**
  - A bot or a player who does not tap takes the role's recommended option after 5 s, or the pre-match "Build" preset chosen on the pick screen (2 presets per hero, recommended by default, like MLBB and WR recommended builds).
  - The command is an existing `Op.Talent`-style op extended with a toy-fork id. This is a sim change, so it rides S-Content-1.
- **Bots.** Bots choose by seed, as talents do (v10 `'seeded'`).
- **Gates.** No fork option above 54% win rate in self-play. The pick rate of each option sits between 25 and 75%.

### 6.3 Second objective and structure-based ends (S-Obj)

This lands AUDIT GP-03 and GP-04 and GAPS N3. It is the first M4 batch, because PvP will expose the clock-decided ending worse than bots do.
- The core opens after one full lane falls.
- Takedown core damage shrinks before Sudden Death.
- **Crow roost.** It appears from 4:00, a 1,200 HP roost every 90 s at two mirrored river spots. The Feather order is drawn from the seed and shown in advance, with at most 3 stacks.
- **Contested rat camp.** It sits at mid. The comeback bonus moves off `campBehindBp`.
- Brush reveal on attack (§3.10), if not present.
- **Gates.**
  - Median 7 to 9 min.
  - More Feathers wins ≤ 65%.
  - ≥ 40% of matches end before Sunset (from 20.5%, AUDIT GP-03).
  - Longest takedown gap p90 ≤ 60 s.

### 6.4 Events and modes

- `GET /pawlegends/config` (GAPS N2) returns `activeMutators`, `event`, `featuredQuests` and `rankedSeason`, with a baked-in fallback.
- **Mutators** are a sim batch (`MatchConfig.mutator`, today `'none'` only): `zoomies`, `clowder`, `sunsetRush`.
  - They run in casual and coop only, never ranked.
  - They give no catnip bonus and no fastest-win record (GAPS item 1).
- **Weekly faction war.** The share of PvP wins by Team Cat vs Team Dog is computed **on read** from rooms, never a new write, and shown on the title. The winning side gets a banner for a week (cosmetic).

### 6.5 Release and done

- **Release, every batch.**
  1. Sim merged.
  2. `vendor-sim`: freeze the previous version; the backend verifies the last 3 live versions plus all frozen ones.
  3. Backend deploy.
  4. Game build.
  5. The old version's sim chunk stays on the CDN for replays.
- **Done.**
  - The roster targets above are met on schedule.
  - Each batch passes the balance gate and `pvp-identity` for older fixtures.
  - Replays of the previous 6 versions still verify.
  - D7 retention of PvP players ≥ 15%.
  - Matches per PvP session ≥ 2.5.

---

## 7. Measures across milestones

| Measure | Target | Source |
|---|---|---|
| Time from link tap to in-match | ≤ 20 s for Quick Play (no install, no account) | `mp_match_start` minus page load |
| Queue p50 | < 30 s casual at any concurrency, < 60 s ranked at ≥ 40 queuers | `queueMs` in rooms |
| Desync | 0 in 10,000 soak matches per sim batch | `mp/soak.mjs` |
| Input-to-visible (own move) | ≤ 50 ms p95 at any RTT (prediction) | `mp_net`, the mp lane's probe |
| Leaver seats | < 4% | rooms |
| Side balance in PvP | 47 to 53% | rooms |
| Verified results | 100% ranked before save; 100% casual by referee + 10% re-verified | worker queue |
| Phone p95 frame time | ≤ 33 ms in 6-human rooms | `perf_sample` |

---

## 8. Your call (the plan follows the default if you don't answer)

1. **Camera defaults (M0).** Default: desktop 1.0, phones 0.85, a camera-height slider, an equal-view cap in PvP. Alternative: keep the defaults and only add the slider.
2. **PvP netcode.** Default: stay on relay lockstep with the brush-only fog mitigations and detection (§3.10), and move ranked to an authoritative server only if map-hack reports pass 1% for 2 weeks. Alternative: build the authoritative server for ranked from the start, which adds about 4 to 6 weeks and a droplet per region.
3. **Ranked bot fill.** Default: only the third seat of both teams at once, after 90 s, Hard bots. Alternative: no bots in ranked at all, which means longer queues at low population.
4. **Guests in casual PvP.** Default: yes (casual counts on a guest rating). Ranked needs an account.
5. **Side choice.** Default: "Cat / Dog / Either", honoured within the rating window and relaxed after 25 s. Alternative: random sides only.
6. **Regions.** Default: EU only at M1b, adding US-East and Singapore by the `mp_net` rule (§3.4).
7. **Season length.** Default: 8 weeks, cosmetic rewards only, no decay.
8. **Bans.** Default: from 24 heroes, 1 per team.
9. **Spectate delays.** Default: party and coop 20 s, casual 60 s, ranked 120 s.
10. **Replay retention.** Default: 30 days, 90 days for ranked, 20 pins per player.

## 9. Honest risk

- **Population.** A 3v3 PvP queue with strangers needs about 60 concurrent queuers per region to be mostly human. Bot fill guarantees a match in 30 s, so this is a quality risk, not an availability risk. Ranked is the one that can starve. That is why it waits for M1b data and allows symmetric fill.
- **Map hack** is the price of lockstep (§2, §3.10). It is bounded by brush-only vision and the escalation trigger.
- **Sim batch load.** S-PvP, S-Obj and the content batches all touch `sim/index.ts`, `bots/` and `combat/damage.ts`, the same files as the dogs and party code. Run them in sequence, one batch at a time, each with its identity golden.
- **Single-instance backend.** The matchmaker is in-memory in the home API process. A deploy drops queues, not matches: queues re-form in seconds, and rooms survive through N9. A second API instance needs a shared queue (Mongo or Redis) and is out of scope until load says so.
- **Kill gate.** If the Dec 10 gate (`LAUNCH.md` b.1) fails, only M0 and M1a (coop with strangers) are worth building. M1a costs no sim work and still beats every rival's "play with AI" mode on time to first match.
