# Social, ranked and PvP reports (design)

> Written read-only from `tokentails-pawlegends-gcp` at origin/main `34999bc3` (2026-11-11), plus the multiplayer gaps report (`pawlegends-multiplayer-gaps.html`, Nov 11). Built on `feat/pawlegends-social` from origin/main `e59a47b9`; the build status per lane is in §19.
>
> **Founder ask, verbatim:** "I'll turn on deploy-on-push on digitalocean, okey. yes let's build social features and ranked ultracode. let's add player report button as well on PVP. ok you can fix all those as well right after GCP migration file:///Users/zygimantasbagdzevicius/Downloads/paw-legends/pawlegends-multiplayer-gaps.html"
>
> **This doc covers:** friends, presence, party invites, leaderboards, ranked, the PvP report button, and the referee's map-hack signal. All of it is built in-house on Mongo, as the report recommends.
>
> **Not in this doc:** the infra gap fixes (drain branch, relay routing, one queue across relays, regions). Another workflow handles them after the GCP migration. Where this design depends on that work, the dependency is marked **[infra]**.

---

## 0. Summary

| Feature | What ships | Where it lives |
|---|---|---|
| Friends | Add a friend by player code, from recent matches, or from your party. Requests, remove, block. Cap of 100 | `backend/src/pawlegends/social/`, collections `pawlegendssocial`, `pawlegendsfriends`, `pawlegendsblocks` |
| Presence | Offline, Online, In party, In queue, In match. Invisible mode | The relay writes a row when a phase changes. A REST pulse from the menus writes "Online". `pawlegendspresence`, TTL 2 min |
| Invites | "Invite to party" carries the existing party code. The friend joins in one tap | `pawlegendsinvites`, TTL 3 min. Joining uses the existing `party.join` |
| Leaderboards | Global (ranked ladder), Friends, Per hero (season), Weekly (PvP wins against humans) | Rows are written **only inside** `savePawlegendsPartyMatch` (the `/live` save). Read-only routes, cached 60 s |
| Ranked | Solo or duo queue on 3v3 Crossing. Kitten → Tabby → Alley → Lion → Legend with divisions. 5 placements. Seasons match Legends Pass seasons. Decay for Legend only. Dodge ladder. Liquidity gate ("Ranked opens at N players online") | The `mm` ranked queue, plus PawlegendsRating `${acc}:ranked` with season fields, plus a pure `ranked/points.ts` |
| Report | A flag button on every human row (not your own) in the match scoreboard and on the results screen. Reasons: AFK, Griefing, Cheating / map hack, Offensive name. One report per target per match. "Thanks" feedback. Admin list, resolve route and auto-flags | `pawlegendsreports`, `pawlegendssanctions`, a CMS page |
| Map-hack signal | The referee logs "acts on hidden" counts for each human slot in each PvP room. The admin view shows a z-score over the last 20 matches. This makes the 1% trigger measurable | `referee-core.ts` plus one read-only sim export (`heroSight`), shipped with the next SIM_VERSION bump |

Hard rules this design keeps:

- **One score path.** Ratings, ranked points, ranked rewards, dodge point costs and board rows are all written only inside `pawlegends-party-live.ts` (the `/live` save), after the Game row exists.
  - Dodges and leaves are matchmaking data, written by the relay as before. Their effect on points is applied inside the next `/live` save.
- **No feature flags.**
- **Names.** Only generated D8 names, or the player's own already-moderated cat name. Never an email, a Firebase display name or free text.
- **Kids.** No free-text chat anywhere. A report note goes to moderators only and is hidden for under 16 and unknown age bands. Under 16 cannot add or be added from recent matches.
- **No sim behaviour change.** The map-hack signal needs one read-only export in `src/sim/server.ts`. It changes SIM_HASH but not the hash trail, so it rides the next planned SIM_VERSION bump. No frozen bundle is touched.
- **Phones at 60 fps.** No per-frame work is added. Social polling pauses during matches and in hidden tabs.

---

## 1. What exists today (read from the code)

- **Ratings.** `mm/rating.schema.ts` `PawlegendsRating` (`pawlegendsratings`) has rows `${accountId}:coop|casual|classic` (`r, rd, sigma, games, wins, lastAt, appliedRooms[50], v`). `ranked` is reserved.
  - The only writer is `writeRating()` in `pawlegends-party-live.ts`, which `mm-no-write.spec.ts` enforces.
- **Room records.** `mm/mm-room.schema.ts` (`pawlegendsmmrooms`) holds `queue`, `mode`, `teams`, and `members[{slot, identityHash, accountId, joinedTick, backfill, ratingAtStart, event}]`, plus `void`, `outcome` and `endedAt`. The relay writes it and `/live` reads it.
- **Pure rating steps.** `mm/rating-update.ts` (`casualRatingStep`) is pure: team composite, bot pseudo-players, bot-share weight, loss forgiveness, backfill-loss skip.
- **Leaver ladder.** `mm/leaver.ts` is pure over mm rooms.
- **Dodges.** `mm/mm-bridge.ts` keeps **dodges in memory per relay** (`dodges` Map, 2 free a day, then +1 min each). That does not survive a restart or a second relay. Ranked needs durable dodges (§7.8).
- **Relay.** `party/party-relay.ts` knows each socket's `accountId` and `guest` from the HMAC party ticket. It holds sockets only during party, queue and match. At the title screen there is **no socket**.
- **Referee.** `party/referee-core.ts` `RefereeRoom.applyTurn` decodes every command per sub-tick and steps the sim. The vendored facade (`vendor/pawlegends-sim/v19/index.ts`) does **not** export `snapshot` or `visibleTo`: the bundle's export list has neither. `visibleTo(w, id, team)` and `w.seen` exist inside the sim (`src/sim/map/brush.ts`).
- **SIM_HASH** is a sha256 over the source closure of `src/sim/server.ts` (`tools/lib/sim-source-hash.mjs`). Adding an export there changes SIM_HASH, so it can only ship with a SIM_VERSION bump.
- **Names.** `party/party-names.ts` `memberName(id, catalog)` gives D8 names: "<adjective> <catalog or breed name>". Custom cat names are shown only to their owner.
- **Age bands.** `pawlegends.contracts.ts` `AGE_BANDS = ['under16','16-17','18+']`, `stricterBand()`. They are stored in `pawlegendsbuyers` with key `account:<id>` / `email:` / `device:`.
- **Report pattern to copy.** `cat/name-report.schema.ts` (`name_reports`): one open report per reporter, reporter ids never returned, moderated in the CMS behind `PermissionGuard(PERMISSION_LEVEL.MODERATOR)` (level 2).
- **Seasons.** `pawlegends-catalog.ts` `SEASONS`: s1 runs `2026-11-10` → `2027-01-05` (8 weeks). `CURRENT_SEASON_ID = 's1'`. Items `frame.*` and `title.*` live in `pawlegendsowned`.
- **Auth path.** The game iframe never sees a token (`pawlegends/src/embed/bridge.ts`). The host calls the API with `accesstoken` and posts the results back, as it does for `party-ticket-request`.
- **Modules.** `relay.module.ts` (BACKEND_ROLE=relay) registers only relay providers and schemas. New controllers and providers go in `appModuleMetadata` (`app.module.ts`). The relay role gets only the schemas its sinks write.
- **Boards helper.** `user/boards.ts` (`boardFilter`, `boardSort`, `boardTop`): guests, flagged accounts and deleted accounts never rank.
- **Lobby rules.** `LANDING-PICK-UX.md` §0 and §A3–A5: no screen scrolls, 44 px targets, the height hide ladder, the online row width budget, and no confirm dialogs.

---

## 2. Identity, display names and player codes

### 2.1 Social profile (`pawlegendssocial`, `_id = accountId`)

| Field | Notes |
|---|---|
| `code` | The player code: 8 characters of Crockford base32, shown as `PL-7KQ2-M9XR`. Random, never derived from the account id. Unique index. Can be rotated (`POST /pawlegends/social/code/rotate`, 3 a day) |
| `name` | `{kind: 'generated'}` (default: `memberName(accountId)`) or `{kind: 'cat', catId}` (one of the player's own cats; it shows the cat's current name, which G3 `name_reports` already moderates). No free text |
| `invisible` | boolean, default false |
| `allowRecent` | Default true. Forced false when the band is `under16` or unknown |
| `rev` | Increments on any change that a friend's list or a request touches. Drives the cheap pulse (§4.3) |
| `createdAt` | Created on the first social call |

- The profile is created lazily on the first social call. Only for **signed-in** accounts: guests see "Sign in to add friends".
- **Board name resolution** is shared by friends, boards and admin: `displayNameOf(accountId)`.
  - Use the profile name if one exists, else `memberName(accountId)`.
  - It never returns an email or a Firebase `displayName`.

### 2.2 Age gate (as in the store)

- The first time the Friends sheet opens, the game asks for the age band if `pawlegendsbuyers` has no `account:<id>` row. It uses the same three bands and the same `stricterBand()` rule, and is stored in the same collection.
- **Under 16:**
  - Cannot send or receive requests from recent matches. Can add only by code, or from a party they are in. Both mean real-life or invited contact.
  - Report note field hidden.
  - Presence is shown only to accepted friends, the same as for everyone.
- ~~**No free text exists anywhere** in social features.~~ Replaced by [CHAT-AVATARS.md §2](CHAT-AVATARS.md): friends chat with phrases for everyone and filtered free text only when every participant is 16+.

---

## 3. Friends

### 3.1 Edges (`pawlegendsfriends`)

- `_id = ${min(a,b)}:${max(a,b)}` (one row per pair).
- Fields: `a`, `b`, `from` (the requester), `state: 'pending'|'accepted'`, `via: 'code'|'recent'|'party'`, `createdAt`, `acceptedAt`.
- Indexes: `{a:1, state:1}`, `{b:1, state:1}`.
- Pending rows expire after 30 days via a TTL on `pendingExpireAt`, which is unset on accept.

### 3.2 Adding

| Via | Client sends | Server check |
|---|---|---|
| Code | `{code}` | Resolve the code to an account. Not self, not blocked either way. Code lookups are rate-limited (30 / 10 min per account, 60 / 10 min per IP) against enumeration |
| Recent | `{room, slot}` | The requester is a member of that mm room (an `accountId` match). The target holds that slot and is a human. The room ended less than 7 days ago. Both sides have `allowRecent` |
| Party | relay frame `social.add {member}` | The relay resolves member → accountId inside the party and calls `SocialHooks.request(from, to, 'party')`. Account ids never reach clients |

- **Request rules:**
  - A request to someone who already requested you **auto-accepts**.
  - Caps: 100 friends, 20 pending outgoing, 30 requests per day per account.
- **Block:**
  - Removes the edge and any pending request.
  - Hides presence both ways and refuses requests and invites from the blocked player.
  - `party.join` refuses a blocked joiner when the leader blocked them. The error is `party_full` on purpose, so the joiner learns nothing about the block.
  - Row in `pawlegendsblocks`, `_id = ${blocker}:${blocked}`, indexes `{blocker:1}` and `{blocked:1}`. Cap 200.
- **Avoid as teammate in matchmaking** is a later item (§17 #11).

### 3.3 Recent players

`GET /pawlegends/social/recent` returns the last 20 PvP and Quick Play mm rooms the account sat in, up to 7 days old. Each human co-player and opponent comes as `{room, slot, name, hero, team: 'ally'|'foe', canAdd}`.

- No account ids and no player codes are returned. A request is made by `{room, slot}`.
- `canAdd` is false for bots, self, blocked players, existing friends, and `allowRecent=false` on either side.

---

## 4. Presence

### 4.1 States (most important first)

`match` > `queue` > `party` > `online` > `offline`. `party` carries `joinable` (lobby phase, a free seat, not locked) and the party code. The code is shown only to accepted, unblocked friends.

### 4.2 Row (`pawlegendspresence`, `_id = accountId`)

```
{ relay?: {state, party?, joinable?, mode?, at}, api?: {at}, rk: 0|1, exp }
```

- `exp` is set with `$max` on every write to `now + 120 s`. TTL index `{exp:1}` with `expireAfterSeconds: 0`.
- `rk = 1` when the account is ranked-eligible (signed in and at least 10 saved matches, from `MmRatingReader.played()`). This feeds the liquidity count (§7.9).
- Index `{rk:1, exp:1}` for the online count.
- **Read rule:**
  - If `relay.at` is under 90 s old, use the relay state.
  - Else, if `api.at` is under 120 s old, the player is `online`.
  - Else `offline`.
  - The reader applies `invisible`: an invisible player shows `offline` to everyone. They still see their friends and can still invite.

### 4.3 Writers (cheap, never in the socket hot path)

- **Relay.** It uses a `PresenceSink` (memory in specs, Mongo in `PartyRelayService`), registered with the presence schema in **both** `relay.module.ts` and AppModule (role `all`).
  - On a phase change of a non-guest socket (party create/join/leave, queue, match start/end, close) it buffers `{accountId, state, party?, joinable?}`.
  - It flushes every 5 s with one `bulkWrite` (upserts). It refreshes all its connected accounts every 60 s in the same bulk.
  - Errors are logged and counted (`presence_write_errors` in relay_stats), never thrown.
- **API pulse.** `GET /pawlegends/social/pulse?rev=<n>` is called every 30 s while the game is on the title, pick or results screens and the page is visible.
  - It writes `api.at` at most once every 60 s per account, using an in-process LRU to skip writes.
  - It answers `204` when the caller's own `rev` and every friend's `rev` sum is unchanged and no invite is waiting. Otherwise it answers `{rev, invites}`, and the client then fetches `GET /pawlegends/social`.
- **Cost.** About 1 request per 30 s per menu player. At 200 CCU that is about 7 rps, mostly 204s. Relay writes are batched and add no socket latency.
- **Paused:** during a match (the relay already says `match`), in hidden tabs, and for guests.

### 4.4 Multi-relay **[infra]**

Presence is in Mongo, so it is correct across relays. Joining a friend's party uses the party code, so it relies on the party code directory on the drain branch (`party_elsewhere`, `/party/where`) once more than one relay serves. With one relay it works today.

---

## 5. Party invites

- `POST /pawlegends/social/invite {to: code}`. The caller must be in a party, as leader or member, read from their presence row: `relay.state === 'party'` with a party code under 90 s old.
- Server checks: the target is an accepted friend, not blocked, the party is joinable, and the rate limit allows it (10 per 10 min, 1 per target per minute).
- Row `pawlegendsinvites {_id, from, to, party, exp}` with a 3 min TTL and index `{to:1, exp:1}`. It bumps the target's `rev`.
- **Delivery:**
  - The target's next pulse (≤ 30 s, or immediately on opening Friends) returns `invites`.
  - The game shows a toast: "Mira invites you to a party · Join" (44 px, 30 s).
  - Join sends the existing `party.join {code}`. Nothing new reaches the relay.
  - During a match, invites are held until the results screen and then dropped if expired.
- **Also:** a friend row with `party.joinable` shows "Join" directly. One tap sends `party.join`, with no invite needed. This is the "see friends online, join them in one tap" done-when from the report.

---

## 6. Leaderboards

### 6.1 Write site: only the `/live` save

`writeBoards()` in `pawlegends-party-live.ts` runs right after the rating write, as a failure-tolerant step. A failed board write never fails the save. It is added to `one-writer.spec.ts` and `mm-no-write.spec.ts` so that any other write site fails CI.

A room counts toward boards only when **all** of these hold:

- the queue is `casual`, `classic` or `ranked` (PvP);
- the room is not `void`, and the verdict is verified (casual: the referee verdict, plus the existing 10% sample; ranked: full re-verify, §7.7);
- the account is registered, not `boardExcludedAt`, not deleted, and has no active `board_exclude` sanction;
- the opposing team had at least 2 humans at the start (3v3), or at least 3 (5v5);
- the save is not a backfill loss and not a forgiven loss;
- the poster has counted fewer than 25 wins today (UTC) on the weekly board (an anti-farm cap).

### 6.2 Rows (`pawlegendsboards`)

| Kind | `_id` | Fields | Index |
|---|---|---|---|
| Weekly | `w:${isoWeek}:${acc}` (week starts Monday 00:00 UTC) | `kind:'w', period, acc, wins, games, firstAt` | `{kind:1, period:1, wins:-1, games:1, _id:1}` |
| Hero | `h:${season}:${hero}:${acc}` | `kind:'h', period: season, hero, acc, wins, games` | `{kind:1, period:1, hero:1, wins:-1, games:1, _id:1}` |
| Global | none. It reads `pawlegendsratings` ranked rows | `ladder` (§7.3) | partial index on ratings `{season:1, ladder:-1, _id:1}` where `queue:'ranked'` |

- `appliedRooms` idempotency: every board row update is guarded by the rating row's `appliedRooms` check in the same save, so a duplicate save writes nothing.
- TTL: weekly rows expire after 10 weeks; hero rows after 2 seasons.

### 6.3 Reads

`GET /pawlegends/boards/:kind` with kind `global|friends|hero|weekly` and query `season`, `hero`, `week` and `page` (pages of 8). The response is `{rows: [{rank, name, value, tier?, hero?}], me?: {rank, value}, period}`.

- **Cache:** 60 s per (kind, period, hero, page) in process. `me` is computed per caller with an indexed `countDocuments` of rows above.
- **Public:** global, hero and weekly need no token (IP throttle 60/min). Friends needs auth.
- **Hero** needs at least 10 games with that hero to appear. Rows are ordered by wins and show the win rate.
- **Friends:** the caller plus up to 100 friends, read by `_id $in`, showing ranked tier and this week's wins.
- **Global:** top 100 of the current season's ranked ladder. Legend players inactive for 14 days are hidden until their next ranked match (PARITY §4.3).
- **Names:** `displayNameOf()` only.

### 6.4 Anti-cheat on boards

- **Only server-verified rooms count**, and the client never sends a number.
- Ranked and board rooms are re-simmed.
- The same-network rule (no shared ipKey on opposite teams) already blocks home and school win trading.
- **Win-trade pair flag** (PARITY §3.10): two accounts on opposite teams more than 3 times in 7 days with more than 70% one-way results. It is computed in the admin flags read (§8.5), and confirmed abuse gets `board_exclude`.
- A confirmed map-hack or bot-scripted account gets `board_exclude` plus a ranked lock (§8.4).

---

## 7. Ranked

This builds on PARITY §4, with the founder's additions: liquidity gate, decay and seasons tied to the Legends Pass.

### 7.1 Eligibility and queue

- Signed in (no guest). At least 10 saved matches (`played().matches`). No ranked lock (leaver ladder level 3+ or a sanction). No unsettled ranked room (§7.6).
- **Solo or duo only.** A trio party gets "Ranked is solo or duo". Duo partners must be within 1 tier of each other. Legend queues solo only.
- **Map:** 3v3 Crossing only in season 1. 5v5 ranked is a later item.
- **Matchmaker** (`mm/matchmaker.ts`): a new pool `queue: 'ranked'`, so `MmPvpQueue` gains `'ranked'`.
  - Pool key: region + `ranked` + sim. Party rating: `mean + 0.25·(max−mean)` (existing).
  - The rating window widens from ±150 to ±400 over 120 s.
  - **No backfill.** Bot fill only for the **third seat of both teams at once** (symmetric Hard bots) after 90 s. With fewer than 2 humans per team there is no match.
  - A ranked entry never falls back to casual or co-op on its own. The queue card offers "Play Casual instead" after 3:00.
  - The same-network rule widens to `/24 netKey` on opposite teams.
- **Pick:** blind pick within each team, unique heroes per team (existing casual pick). Bans come later, at 24 heroes (PARITY §4.1).
- **Protocol:** `mm.join {queue:'ranked'}` needs **PROTO 5** (bump from 4; older clients keep casual).
  - New error codes: `mm_ranked_closed {online, need}`, `mm_ranked_pending {rooms}` (PARITY), `mm_need_account`, `mm_locked {untilMs, why}` (existing).
  - `MmRoomRecord.queue` and `mode` gain `'ranked'` and `season`.

### 7.2 Tiers and divisions

| Tier | Divisions | Anchor (hidden r) | Loss rule |
|---|---|---|---|
| Kitten | III, II, I | 1000, 1075, 1150 | Never loses points |
| Tabby | III, II, I | 1225, 1300, 1375 | Never loses points |
| Alley | III, II, I | 1450, 1525, 1600 | Cushioned by grade |
| Lion | III, II, I | 1675, 1750, 1825 | Cushioned by grade |
| Legend | one ladder, points uncapped | 1900+ | Cushioned by grade; top 100 on the board |

- The anchor table is a single constant, `RANKED_TIERS`, duplicated to the client (§11).
- **Naming note:** "Kitten" and "Legend" are also card awaken stage words (`ui/cards/frame.ts`). Ranked text always says "Kitten III" or "Legend · 240 pts", with the tier emblem, so the two don't read as the same thing (§17 #2).

### 7.3 Points from Glicko (visible tier points)

- The hidden ranked rating is a Glicko-2 row `${acc}:ranked`, updated exactly like casual (`casualRatingStep` generalised to a `queue` argument). It is seeded from the casual row at the first placement: `r` is copied, `RD = max(RD, 200)`.
- **Visible points** live on the same row. New fields: `season, tierIdx (0..12, 12 = Legend), points, placementsLeft, shield, peakIdx, peaks: [{season, peakIdx, rewarded}], lastRankedAt, ladder, dodgesApplied: string[]`.
  - `ladder = tierIdx*100 + points` (Legend: `1200 + points`), for the global board index.
- **Step** (pure, `backend/src/pawlegends/ranked/points.ts`):
  - win: `+round(20·c)`; loss: `−round(15·(2−c)·gradeShare)`.
  - `c = clamp(1 + (r − anchor(tierIdx))/400, 0.5, 1.5)`, using the **post-update** hidden r.
  - `gradeShare` comes from the server-side grade (GAPS N6, vendored with the sim facade, not hashed). Until that lands, `gradeShare = 1`.
  - Crossing 100 promotes and carries the remainder. Dropping below 0 in a non-protected division demotes after one free `shield` loss per division.
  - Forgiven losses and backfill losses cost 0 (existing rules).
- Promotion series: none.

### 7.4 Placements, seasons, soft reset

- **Placements:** 5 matches with no points shown. After the fifth, the tier is the hidden r's tier, capped at **Lion I in a player's first ranked season**.
- **Seasons = Legends Pass seasons.** `seasonDef(CURRENT_SEASON_ID)` dates are used directly; there is no second season table. A ranked season ends at the pass `endsAt`.
- **Ranked S1** opens mid-pass-season, on the first Thursday 16:00 UTC after the game build ships. It is labelled "Ranked Season 1" and ends with pass s1 on **2027-01-05** (§17 #4).
- **Soft reset at season start**, applied lazily at the first ranked `/live` save of the new season (one write path):
  - hidden r moves 25% toward 1500;
  - `RD = max(RD, 150)`;
  - 3 placements;
  - the visible tier restarts at most 2 divisions below last season's finish.

### 7.5 Decay (lazy, no cron writer)

- **Kitten to Lion:** no point decay. Inactivity grows RD (Glicko), so the first matches back move more.
- **Legend:** after 14 days without a ranked match, −20 points a day, down to Legend 0. It never demotes. The player is also hidden from the top-100 board.
- Decay is a pure function of `(points, lastRankedAt, now)`.
  - `/ranked/me` and the boards show decayed values.
  - The next ranked `/live` save writes the decayed value before applying the match.
  - This keeps one write path and needs no job (§17 #3).

### 7.6 Settlement: losses cannot be dodged (PARITY §4.4)

- On `mm.join ranked`, the bridge reads ended ranked mm rooms of this identity from the last 30 days whose `_id` is not in the ranked row's `appliedRooms`.
- If any exist, it answers `mm_ranked_pending {rooms}`. The game's save queue (`client/components/pawlegends/saves.ts`) posts them first, then re-queues automatically.
- A player who never comes back keeps a stale row that affects no one.

### 7.7 Verification

- Every ranked result is fully re-verified (raw TURN log re-sim plus `verifyPvpReplay`) by the existing replay worker queue **before** `/live` accepts it.
- Until then the save answers `PAWLEGENDS_PARTY_PENDING` and the client save queue retries (PARITY §4.1).
- Target: at least 95% verified within 60 s.

### 7.8 Dodges and leavers in ranked

- **Durable dodge log:** `pawlegendsmmdodges {_id, identityHash, accountId, queue, at, phase: 'accept'|'pick'}`, TTL 30 days, index `{identityHash:1, at:-1}`.
  - Written by the relay glue (`mm-bridge.ts` `failAccept` and a disconnect during pick), alongside the in-memory list.
  - It is matchmaking data, like mm rooms. It replaces the in-memory-only list for ranked and fixes "dodges reset on relay restart" for casual too. Mention this in the PR; it is not a silent fix.
- **Waits:** 2 free a day (casual and ranked), then +1 min each. A ranked dodge from the third one on also adds +5 min after 3 in 24 h.
- **Ranked point cost:** −3 points per ranked dodge, never below the tier floor.
  - Applied **inside the next ranked `/live` save**: dodge rows since `lastRankedAt` that are not in `dodgesApplied`.
  - `/ranked/me` shows the pending cost.
- **Leavers:** PARITY §3.7 ladder.
  - 3 events in 7 days: ranked locked 24 h.
  - 4 or more: locked 72 h.
  - Computed by `leaverStatus()` over mm rooms (existing), with the ranked windows added.

### 7.9 Liquidity gate ("ranked opens at N players online")

- **Count:** `online = countDocuments({rk:1, exp:{$gt:now}})` on `pawlegendspresence`.
  - Computed by the API role every 30 s with the existing Mongo job lease pattern (`shared/jobs`).
  - Stored in `pawlegendsstatus` `{_id:'ranked', open, online, need, since}`.
- **Hysteresis:** opens at `online ≥ 24`. Closes when `online < 16` for 10 minutes in a row (§17 #1).
- **Relay:** reads the status row (cached 30 s). `mm.join ranked` while closed gets `mm_ranked_closed {online, need}`.
  - Entries already queued keep matching until they leave. Closing never kicks anyone.
- **Game:** `GET /pawlegends/ranked/status` (public, cached 30 s) returns `{open, online, need, season: {id, endsAt}, estMs}`.
  - Closed state: "Ranked opens at 24 players online · 17 online now" with one button, **Play Casual**. Casual is always on.
- **[infra]:** until relays share one queue, ranked runs per relay. With today's single relay that is the same thing.

### 7.10 Rewards (cosmetic only)

- **Peak tier of the season:** frame `frame.ranked.<season>.<tier>` and title `title.ranked.<season>.<tier>` ("Alley Cat S1").
- **Lion and above:** also a coat palette (GAPS item 9 palettes). **Final top 100:** an animated name plate item.
- **Granted inside `/live`.** The first ranked or casual save after the season's end writes `pawlegendsowned` rows for the previous season's unrewarded peak and sets `peaks[].rewarded = true`.
  - There is no claim endpoint and no second write path. `GET /pawlegends/ranked/me` shows pending rewards.
- Item ids are added to `pawlegends-catalog.ts` (real) and `pawlegends/src/money/catalog.ts` (mirror), deep-compared by `tests/unit/store-pass.test.ts`.

---

## 8. PvP report button

### 8.1 Where

- **In match:** the scoreboard (`pawlegends/src/ui/scoreboard.ts`) gets a flag button (44 px) at the end of every **human** row except your own. Bot seats are labelled "Bot" and have no flag.
- **Results screen:** the same rows (`ui/screens.ts` `resultsScreen` table) carry the same flag.
- **PvP only** (`casual`, `classic`, `ranked`). Co-op Quick Play later (§17 #8).

### 8.2 Flow (zero friction)

1. Tap the flag. A popover shows 4 reason chips in a 2×2 grid, 44 px tall: **AFK**, **Griefing**, **Cheating / map hack**, **Offensive name**.
2. Tapping a chip sends the report right away (no confirm). The flag turns into a check and is disabled. The toast reads: **"Thanks. We review every report."** We promise no outcome.
3. On the results screen only, and only for the 16-17 and 18+ bands, an "Add a note (optional, 140 characters, don't include personal info)" link opens a single field. It updates the same report once.
4. One report per target per match. The client disables the flag and the server enforces it.
5. During a match the popover is DOM over the scoreboard. The match keeps running. Any joystick or ability touch closes it.

### 8.3 API and storage (minimum data)

`POST /pawlegends/reports {room, slot, reason, note?, tick?}`

- Guarded by `AppAuthGuard` + `@AllowGuest()`. Guests sit in PvP on guest accounts, so they can report too, with tighter caps.
- **Checks:**
  - the room is an mm room with a PvP queue;
  - the reporter's `accountId` is a member;
  - the slot is held by a human who is not the reporter;
  - the room is live or ended less than 24 h ago.
- **Target:** the member whose tenure covers `tick` (in match), else the last holder of the slot (results).
- **Answers:**
  - `201 {ok:true}` for a new report;
  - `200 {ok:true, already:true}` for a duplicate (idempotent);
  - `400 PAWLEGENDS_REPORT_BOT` or `_SELF`;
  - `404 PAWLEGENDS_REPORT_ROOM`;
  - `429` when rate-limited.
- **Rate limits:** per reporter 10 a day (guests 3), 2 per reporter per room, 5 per target per room (counted per target, so one team cannot use up a room's reports before the other files theirs), per IP 20 / 10 min (`ClientIpThrottlerGuard` pattern).
- **Row** (`pawlegendsreports`): `{room, queue, reporter, target, reason: 'afk'|'grief'|'cheat'|'name', note?, tick?, status: 'open'|'corroborated'|'actioned'|'dismissed', createdAt, expireAt}`.
  - No IP, no names, no hero, no stats. Admin views derive those from the mm room and the room log.
  - Unique `{room:1, reporter:1, target:1}`. Indexes: `{target:1, createdAt:-1}`, `{status:1, createdAt:-1}`, `{reporter:1, createdAt:-1}`.
  - TTL on `expireAt`: 180 days, or 90 days once dismissed.
- **Auto-corroborate:** an `afk` report whose target has `event: 'afk'` or `'left'` on the mm room member row becomes `corroborated` on write.
- The reporter's identity is never returned by any route (the `name_reports` rule).

### 8.4 Sanctions (`pawlegendssanctions`)

- Row: `{accountId, kind: 'warn'|'queue_lock'|'ranked_lock'|'board_exclude'|'pvp_ban', until?, by, reasonCode, reports: [ids], createdAt}`. Index `{accountId:1, until:-1}`.
- **Written only** by the admin resolve route.
- **Read by:** the relay's `mm.join` (cached 60 s through `MmService`: `mm_locked {untilMs, why}`), the boards, and `/ranked/me`.
- A `warn` shows once as a card at the next title visit: "A moderator reviewed reports about your matches."
- **Nothing is ever applied automatically** (PARITY §3.10). Flags only raise the review priority.

### 8.5 Admin review path

All admin routes use `PermissionGuard(PERMISSION_LEVEL.MODERATOR)`. A CMS page `cms/.../pawlegends-reports` sits next to `/name-reports`.

- `GET /pawlegends/admin/reports?status=open&reason=&flag=1&page=` returns groups per target: `{target: displayName + accountId, counts by reason, distinct reporters 7d, rooms, flags[], intel: {z, matches}}`, flagged first.
- `GET /pawlegends/admin/reports/:accountId` returns the reports (with notes), each room's queue, team, the mm member events, referee intel per room, and a replay link (`?replay=<room>` once M3 ships; until then the room id for `runReplay`).
- `POST /pawlegends/admin/reports/:accountId/resolve {action: 'dismiss'|'warn'|'queue_lock'|'ranked_lock'|'board_exclude'|'pvp_ban', days?, reasonCode}` updates the report statuses and writes a sanction.
- `GET /pawlegends/admin/reports/stats?days=14` returns `{rankedMatches, mapHackConfirmed, rate}`. This is **the 1% trigger** (PARITY §3.10 item 4).
- **Auto-flags**, computed when the list is read. The aggregation reads at most 14 days of reports, and the intel is cached 1 h.
  - **F1:** at least 3 distinct reporters in 7 days across at least 2 rooms.
  - **F2:** reported in at least 5% of PvP matches over the last 20 or more.
  - **F3:** map-hack z > 4 over the last 20 PvP matches (§9).
  - **F4:** a win-trade pair (§6.4).
  - **F5:** at least 2 corroborated AFK reports in 7 days.
- A daily log line `pl_reports_flagged {count}` feeds a Terraform log alert, to be added by the infra workflow **[infra]**.

---

## 9. Referee map-hack signal ("acts on hidden")

### 9.1 The one sim-side addition (read only)

Add `heroSight(m, out: Int32Array)` to `pawlegends/src/sim/server.ts`.

- Per hero slot (10 at most), it writes `x, y, alive, seenBits`. `seenBits` is bit t = team t sees it, read from `w.seen`, the same test as `visibleTo`.
- It reads only; it changes no state and draws no RNG.
- The facade generator (`tools/vendor-sim.mjs`) types it as an optional `heroSight?` on `PawlegendsPartySim`.
- **Why not on v19:** it changes SIM_HASH, so it **ships with the next planned SIM_VERSION bump** (§17 #6). Frozen bundles stay byte-pinned.
  - Rooms on older sims get no signal (`intel` absent). Reports still work.
  - Reading `(m as any)` internals of frozen bundles was considered and rejected: too fragile.
- **Golden test:** stepping a fixture with `heroSight` called every tick gives the identical `hashTrail` and `finalHash`. `vendor-sim:check` passes.

### 9.2 Detector (`party/referee-core.ts`, PvP rooms only)

- `RefereeRoom` keeps `lastSeenTick[team][heroSlot]`, updated after each `step` from `heroSight`. 30 ticks = 1 s.
- **Before each `step`,** for each decoded command of a **human, non-piloted** slot `s` (team `t`) with `op === Attack` (target id) or `op === Cast` (aim x, y and/or id):
  - `acts[s]++`.
  - **Hidden target:** an enemy hero `h` with `seenBits` bit t off and `tick − lastSeenTick[t][h] ≥ 30`. The aim is on it when the `Attack` id is `h`, or when the `Cast` aim point is within 1.5 m of `h`, or the `Cast` id is `h`. If so, `hid[s]++`.
  - **Opportunity:** any such hidden enemy hero within 9 m of slot s's hero. If so, `opp[s]++` (the denominator for honest bush guesses).
  - The 1 s wait covers input delay: a target that vanished during the command's travel time does not count.
- **Cost:** one `heroSight` read per sub-tick plus a loop over at most 10 heroes for the few commands in a turn. Budget ≤ 2% of referee CPU, measured in the existing `ws-latency` and soak runs.
- **Output:** `RefereeEnd.intel = [{slot, acts, hid, opp}]`.
  - The relay writes it into `MmRoomRecord.members[].intel` in `finish()`. The mm room is the relay's to write and is not a score.
  - Room records keep their 30-day TTL; ranked rooms keep 90 days (PARITY §5.2).

### 9.3 Score

- Per account over its last 20 PvP rooms: `rate = Σhid / max(1, Σopp)`.
- Population baseline: mean and SD of `rate` per hero over the last 14 days, among accounts with at least 5 rooms (cached 1 h).
- `z = (rate − mean_hero) / sd_hero`, averaged over the heroes played, weighted by `opp`. Flag F3 at **z > 4** (PARITY §3.10.3).
- The score is shown to moderators with the counts, never to players. The flag drives no automatic action.

---

## 10. API routes (all `/pawlegends/...`)

| Method and path | Guard | Throttle | Notes |
|---|---|---|---|
| GET `social` | AppAuthGuard, registered only (guest → 403 `PAWLEGENDS_NEED_ACCOUNT`) | 60/min | `{me: {code, name, invisible, allowRecent, ageBand?}, friends: [{code, name, presence, party?}], requests: {in, out}, blocks: [{code, name}], invites, rev}` |
| GET `social/pulse?rev=` | same | 6/min | 204, or `{rev, invites}`; writes `api.at` |
| POST `social/friends` `{code}` or `{room, slot}` | same | 5/min, 30/day | Request or auto-accept |
| POST `social/friends/:code/accept`, `/decline` | same | 30/min | |
| DELETE `social/friends/:code` | same | 30/min | Remove |
| POST `social/blocks` `{code}` or `{room, slot}`; DELETE `social/blocks/:code` | same | 30/min | |
| POST `social/me` `{name?: 'generated' or catId, invisible?, allowRecent?}` | same | 10/min | A catId must be one of the caller's own cats; `allowRecent` is forced false for under 16 |
| POST `social/code/rotate` | same | 3/day | |
| GET `social/recent` | same | 30/min | §3.3 |
| POST `social/invite` `{to}` | same | 10 / 10 min | §5 |
| POST `social/age` `{ageBand}` | same | 5/min | Writes `pawlegendsbuyers` `account:<id>` with `stricterBand` |
| GET `ranked/status` | public | 60/min per IP | §7.9 |
| GET `ranked/me` | AppAuthGuard | 60/min | Tier, points (decayed), placements, shield, pending dodge cost, locks, pending rooms, pending rewards |
| GET `boards/:kind` | public (friends: auth) | 60/min | §6.3 |
| POST `reports` | AppAuthGuard + AllowGuest | §8.3 | |
| GET `admin/reports`, `admin/reports/:accountId`, `admin/reports/stats`; POST `admin/reports/:accountId/resolve` | AppAuthGuard + PermissionGuard(MODERATOR) | default | §8.5 |

- **Controllers:**
  - `PawlegendsSocialController`;
  - `PawlegendsRankedController` (ranked and boards);
  - `PawlegendsReportsController` (player and admin).
- **Services:** `SocialService`, `PresenceService`, `BoardService`, `RankedStatusService` (leased 30 s job), `ReportService`.
- All are registered in `appModuleMetadata` (`app.module.ts`). Schemas go in a `PAWLEGENDS_SOCIAL_SCHEMAS` array.
- `relay.module.ts` adds **only** the schemas its sinks write: presence, dodges, and status (read). It also adds `SocialHooks` for `social.add`, a thin provider that writes a friend edge through `SocialService` logic in a framework-free file (`social/social-core.ts`), so the relay role needs no Firebase.
- All score-path code stays in `pawlegends-party-live.ts`. No route here writes a score.

## 11. Mongo collections

| Collection | Key | Indexes | TTL |
|---|---|---|---|
| `pawlegendssocial` | accountId | `code` unique | none |
| `pawlegendsfriends` | `a:b` | `{a,state}`, `{b,state}` | pending 30 d |
| `pawlegendsblocks` | `blocker:blocked` | `{blocker}`, `{blocked}` | none |
| `pawlegendspresence` | accountId | `{rk,exp}`, TTL `{exp}` | 120 s |
| `pawlegendsinvites` | ObjectId | `{to,exp}`, TTL `{exp}` | 3 min |
| `pawlegendsboards` | `w:` / `h:` ids | §6.2 | 10 weeks / 2 seasons |
| `pawlegendsratings` (existing) | `${acc}:ranked` (new rows) | partial `{season, ladder:-1, _id}` where `queue:'ranked'` | none |
| `pawlegendsmmrooms` (existing) | + `queue/mode 'ranked'`, `season`, `members[].intel` | + `{'members.accountId':1, queue:1, endedAt:-1}` (settlement, recent players) | 30 d (ranked 90 d) |
| `pawlegendsmmdodges` | ObjectId | `{identityHash, at:-1}` | 30 d |
| `pawlegendsreports` | ObjectId | §8.3 | 180 d / 90 d |
| `pawlegendssanctions` | ObjectId | `{accountId, until:-1}` | none |
| `pawlegendsstatus` | `'ranked'` | none | none |

### 11.1 Duplicated constants: add to `docs/DEVELOPMENT.md`

| Constant | Backend | Client |
|---|---|---|
| `RANKED_TIERS` (names, anchors, protection), `RANKED_POINTS` (+20/−15, clamp, shield, dodge −3), `PLACEMENTS` (5/3) | `backend/src/pawlegends/ranked/tiers.ts` | `pawlegends/src/meta/ranked.ts`, deep-compared by `tests/unit/ranked-tiers.test.ts` |
| `RANKED_OPEN_AT` 24 / `RANKED_CLOSE_BELOW` 16 | `ranked/tiers.ts` | the game shows the server values; no copy |
| `REPORT_REASONS` | `social/report.contracts.ts` | `pawlegends/src/social/report.ts` |
| `FRIENDS_CAP`, `PLAYER_CODE` alphabet and format | `social/social.contracts.ts` | `pawlegends/src/social/code.ts` |
| Ranked reward item ids | `pawlegends-catalog.ts` | `src/money/catalog.ts` (existing deep compare) |
| PROTO 5 frames and error codes | vendored `pawlegends-net` (from `src/net/proto.ts`) | `src/net/proto.ts` |

---

## 12. Relay and protocol changes

- `PROTO` 4 → **5**. The relay accepts 1..5. Only PROTO 5 may send `mm.join {queue:'ranked'}` and `social.add`. Golden-bytes tests are regenerated. PROTO 5 now also carries party chat (`chat.say`, `chat.msg`, `chat.reject`, `chat.notice`; [CHAT-AVATARS.md §5](CHAT-AVATARS.md)), which shipped first; `social.add` and ranked `mm.join` follow in a later PROTO.
- **New client frame:** `social.add {member}`. Allowed in the party lobby only, rate 5 / min / socket, at most 1 KB, typed guard (MULTIPLAYER §2.3). The relay answers `social.added {member, state: 'sent'|'friends'|'refused'}`.
- **New error codes:** `mm_ranked_closed`, `mm_ranked_pending`. `mm_locked` gains `why: 'leaver'|'sanction'|'dodge'`.
- **`PresenceSink`** (relay): buffered, 5 s flush plus 60 s refresh, for non-guest sockets only. It never awaits on the socket path.
- **mm-bridge:**
  - durable dodge rows;
  - ranked pool rules;
  - settlement check;
  - sanction and lock check at join;
  - ranked status gate;
  - same-netKey rule for ranked.
- **Referee:** `intel` (§9.2) on PvP rooms where `sim.heroSight` exists.
- **Drain and handoff** (branch) **[infra]:** `intel` counters must ride the room checkpoint so a moved room keeps its counts. Add `intel` to the checkpoint payload when the drain branch merges. Until then, a moved room restarts its counts and the server logs `intel_partial: true`.

## 13. Host bridge (game ↔ host)

- **Game → host:** `api-request {id, op, args}`.
- **Host → game:** `api-result {id, ok, status, body}`.
- The host keeps an allowlist mapping op → method and route: `social.get`, `social.pulse`, `friend.add`, `friend.accept`, `friend.decline`, `friend.remove`, `block.add`, `block.remove`, `social.me`, `social.age`, `social.code.rotate`, `social.recent`, `invite.send`, `ranked.status`, `ranked.me`, `board.get`, `report.send`.
- The host validates the shape of `args`, adds the lowercase `accesstoken` (`fb…` Firebase token), and never forwards a URL from the game.
- Guests: registered-only ops answer `{ok:false, status:403, code:'need_account'}` without a network call.
- Files: `client/components/pawlegends/bridge.ts` (message types and guards), `PawlegendsHost.tsx` (the fetcher), and the app shell in `pawlegends-app` if it hosts its own bridge. The same ops apply there.

---

## 14. Client screens (phone first, no-scroll)

All new UI is DOM in the menu layers at the 30 fps menu pacer. Nothing renders per frame in a match. Polling stops in a match and in hidden tabs. Safe-area padding is `max(16px, env(safe-area-inset-*))`. Targets are 44 px.

### 14.1 Landing changes (`ui/lobby/lobbyScreen.ts`, `lobby.css`)

- **Top-right bar:** a new **Friends** button (44×44) to the left of settings, with a badge showing friends online plus pending requests and invites.
  - Hidden on the first visit (new players see the guided Clem match only).
  - Never hidden by the height ladder, since the top bar is fixed.
- **Online row** becomes `[Co-op][PvP][Ranked][Party][#]`.
  - The Ranked button is 44 wide and shows the tier emblem plus the division numeral. It shows a lock icon when closed, ineligible or a guest.
  - Widths: at a column of 320 px or more, `80 + 64 + 44 + 72 + 44 + 4×4 = 320`. Below 320 (for example 307 at 667×375), Party drops its label to an icon with `aria-label`: `80 + 64 + 44 + 44 + 44 + 16 = 292`.
  - Update the LANDING-PICK-UX §A3 width table and the `no-scroll.spec.ts` sizes (667×375, 844×390, 1440×900, 667×300).
- **One tap on Ranked:**
  - When open and eligible, it opens the **Ranked sheet** with **Play Ranked** (52 px) on top. This is one tap from the sheet; a direct start would skip the closed and placement info (§17 #12).
  - When closed, the sheet shows the liquidity line and **Play Casual**.

### 14.2 Friends sheet (`src/social/friendsSheet.ts`, new)

A right-side sheet over the 3D hero half, `width: min(360px, 54vw)`, full height, `overflow: hidden`.

```
667x375                                   ┌──────────── sheet 360 ────────────┐
                                          │ [Friends 3][Requests 2][Recent] X │ 44
                                          │ (dot) Witty Biscuit   In party  [Join]│ 48
                                          │ (dot) Mira            Online  [Invite]│ 48
                                          │ (dot) Sunny Pudding   In match   [...]│ 48
                                          │ (o)   Lucky Bean      Offline    [...]│ 48
                                          │ (o)   Cozy Tuna       Offline    [...]│ 48
                                          │ < 1/3 >   My code PL-7KQ2-M9XR [Copy]│ 44
                                          │ [ Add friend: ________ ][Add]       │ 44
                                          └───────────────────────────────────┘
```

- **Height budget at 375:** 8 + 44 + 5×48 + 44 + 44 + 8 = 388. That is over, so the add row folds into the footer: tapping "Add" swaps the footer for the code input. 8 + 44 + 240 + 44 + 8 = **344 of 375**.
- **Hide ladder** (a unit test pins it in a table):
  - ≤ 340: 4 rows.
  - ≤ 300: 3 rows, and the state text becomes the dot only.
  - Paging (`< n/m >`) replaces scrolling.
- **Row action:**
  - **Join** when the friend's party is joinable.
  - **Invite** when you are in a party.
  - Otherwise **…**, which opens Remove, Block, and "Show my code".
  - Block uses a 5 s **Undo** toast, not a confirm dialog (LANDING rule).
- **Requests tab:** Accept and Decline per row.
- **Recent tab:** last 20 humans from your matches, with a **+** button when `canAdd`.
- **Guests:** one panel, "Sign in to add friends and see who's online", plus the host's sign-in.
- **Age prompt:** the three-band question once, the same copy as the store.
- **Invisible toggle:** in the sheet's settings icon (Settings → "Appear offline").

### 14.3 Ranked sheet (`src/ui/rankedSheet.ts`, new)

```
┌──────────── sheet 360 ────────────┐
│ Ranked · Season 1     ends in 23d X│ 44
│        [ tier emblem 96 ]         │ 96
│        Tabby II · 64 / 100        │ 24
│ [██████████░░░░░░░]  shield ●     │ 16
│ Peak: Alley III · rewards [fr][ti]│ 40
│ [ > PLAY RANKED   solo · duo    ] │ 52
│ [Boards]              [How it works]│ 44
└───────────────────────────────────┘   = 8+44+96+24+16+40+52+44+8 = 332 / 375
```

- **Variant states** replace the emblem block:
  - Placements: "Placement 2 / 5".
  - Closed: "Ranked opens at 24 players online · 17 now" with **Play Casual**.
  - Locked: "Ranked unlocks after 10 matches · 7/10", "Sign in to play Ranked", or "Locked for 23 h (left matches)".
  - Pending: "Saving your last ranked match…", which auto-retries.
- **Hide ladder:** ≤ 340 shrinks the emblem to 64. ≤ 300 drops the peak row.
- **After a match:** the results strip gets a ranked line, "+18 · Tabby II 82/100", or "Promoted to Tabby I" with a 600 ms emblem pulse (none on low quality).

### 14.4 Boards sheet (`src/ui/boardsSheet.ts`, new)

- Tabs: `[Global][Friends][Hero v][Weekly]` (44). Hero opens a 4×5 portrait picker using `heroPic()`, a pane that fits without scrolling.
- 6 rows of 40 px, a pinned "You · #123 · value" row (40), and `< n/m >` paging.
- Budget: 8 + 44 + 240 + 40 + 44 + 8 = **344 / 375**. At ≤ 300, 4 rows.
- Names render with `textContent` only.

### 14.5 Scoreboard and results (report and add friend)

- **Scoreboard:** a flag button (44) at the end of each human row that isn't yours. The popover is anchored to the row (2×2 chips, 44 px). The checked state persists for the match.
- **Results:** the same flag, plus a **+** "Add friend" button (44) on human rows when allowed (registered on both sides, `canAdd`).
  - On narrow widths both are icon-only with `aria-label`. The results table already fits the no-scroll budget; the two columns take the space of the existing grade column at ≤ 667 px, which moves under the name.
- **Toasts** use the existing `ui/notify.ts` queue.

### 14.6 Invite toast

`notifyQueue` toast: "Mira invites you to a party · [Join]", 30 s, 44 px. Held during a match.

### 14.7 Analytics (`src/analytics/posthog.ts` union + relay allowlist)

Events:

- `social_open {tab}`
- `friend_request {via}`
- `friend_accept`
- `friend_block`
- `party_invite {action: sent|join}`
- `presence_invisible {on}`
- `ranked_view {state: open|closed|locked|placement}`
- `ranked_queue {size: 1|2}`
- `ranked_placed {tier}`
- `ranked_tier {dir: up|down}`
- `board_view {kind}`
- `report_sent {reason, where: match|results}`

Props never carry names, codes, account ids or room ids.

---

## 15. Tests

**Backend (jest):**
- `social/social-core.spec.ts`: code format and uniqueness, the rotate cap, request, auto-accept, caps, block removes the edge and refuses requests and invites, under 16 can't use recent, guests get 403.
- `social/presence.spec.ts`: read precedence (relay over api over offline), invisible shows offline, TTL `exp` with `$max`, pulse returns 204 when unchanged and writes at most once every 60 s.
- `party/presence-sink.spec.ts`: buffer and flush, the 60 s refresh, guests never written, a write error never throws.
- `mm/casual-relay.spec.ts` additions: `social.add` resolves the member without leaking ids; a blocked joiner gets `party_full`.
- `ranked/points.spec.ts`: convergence c, protection, shield, demote, Legend uncapped, placement cap at Lion I, soft reset, lazy Legend decay, dodge cost floor and idempotency.
- `ranked/settlement.spec.ts`: pending rooms block `mm.join`; posting clears them.
- `ranked/status.spec.ts`: hysteresis (24 open, 16 for 10 min to close); queued entries keep matching.
- `mm/matchmaker.spec.ts` additions: the ranked pool (solo or duo, duo tier gap, Legend solo, symmetric third-seat fill after 90 s, no backfill, netKey rule).
- `mm/dodges.spec.ts`: dodges are durable across a relay restart.
- `pawlegends-party-live.spec.ts`:
  - a ranked save waits for verification;
  - a tampered log is refused;
  - points apply once;
  - boards are written once per room, and not for a void room, a bot-majority foe team or guests;
  - rewards are granted once at the first save after the season end.
- `one-writer.spec.ts` and `mm-no-write.spec.ts`: board, ranked and reward writes appear only in `pawlegends-party-live.ts`.
- `boards.spec.ts`: ordering, ties, pages, `me` rank, exclusions (`boardFilter`, sanctions, inactive Legend).
- `reports.spec.ts`:
  - membership;
  - bot, self and room errors;
  - one per target per match;
  - caps for reporter, room and IP;
  - guests capped at 3;
  - AFK corroboration;
  - reporter ids never in any response;
  - admin routes need MODERATOR (401 or 403 otherwise);
  - resolve writes a sanction that the relay `mm.join` honours.
- `party/referee-intel.spec.ts`:
  - a scripted fixture where a slot attacks a hero hidden for 2 s counts `hid`;
  - attacking a hero just revealed 0.5 s ago does not;
  - pilot commands are ignored;
  - `intel` is absent on sims without `heroSight`.

**Sim and tools (vitest, in `pawlegends/`):**
- `tests/unit/hero-sight.test.ts`: calling `heroSight` every tick leaves `hashTrail` and `finalHash` identical on all golden fixtures.
- `tools/vendor-sim.test.mjs`: the facade includes `heroSight?`.

**Game (vitest):**
- `ranked-tiers.test.ts`: deep-compares the client and backend constants.
- `friends-sheet.test.ts`, `ranked-sheet.test.ts`, `boards-sheet.test.ts`: the hide-ladder tables and paging.
- `report-popover.test.ts`: one tap sends; the flag is disabled after; no flag on bot rows or your own row.
- `bridge-api.test.ts`: the op allowlist; unknown ops are dropped; guests short-circuit.

**e2e (Playwright):**
- `no-scroll.spec.ts`: new sheets at 667×375, 844×390, 1440×900 and 667×300, with no overflow.
- `mp/social.spec.ts`: two signed-in test accounts add by code; one sees the other "In party" and joins in one tap.
- `mp/ranked.spec.ts`: 4 signed-in accounts plus symmetric fill; the tier is revealed after placements; the closed gate shows the line and Play Casual.
- `mp/report.spec.ts`: report from the scoreboard mid-match and from results; the second attempt shows the check; the admin list shows the group.
- `perf-ios.spec.ts` and `hud-compact.spec.ts`: match fps is unchanged (the scoreboard flag adds DOM only when the scoreboard is open).

---

## 16. Build order (lanes) and done-when

| # | Lane | Depends on | Done when |
|---|---|---|---|
| L1 | **Reports + admin + CMS page** (§8). Ships first: the gaps report puts it in Phase 0 because it makes the map-hack trigger measurable | none | A PvP player reports from the scoreboard in one tap; a moderator sees, flags and resolves it; `stats` gives the rate |
| L2 | Social core: profile, friends, blocks, recent, age gate, API pulse (§2–§3, §4.3 API side) | none | Two accounts befriend by code and from recent; blocks hold |
| L3 | Relay: PresenceSink, `social.add`, PROTO 5 frames, durable dodges | L2 | Friends see In party, In queue and In match within 10 s |
| L4 | Invites + Join (§5) | L3 **[infra]** party directory for more than one relay | A friend joins your party in one tap |
| L5 | Boards: write site in `/live`, read routes (§6) | none (global needs L6) | Weekly and hero boards fill only from verified PvP saves |
| L6 | Ranked backend: queue, points, settlement, verify, status gate, rewards, decay (§7) | L3 (dodges), replay worker | `mp/ranked.spec.ts` green; 0 unverified ranked saves |
| L7a | `heroSight` sim export + facade | next SIM_VERSION bump | Golden hashes unchanged |
| L7b | Referee intel + mm room storage + admin z-score (§9) | L7a, L1 | A fixture map-hacker gets z > 4; honest soak bots stay under 2 |
| L8 | Game UI + host bridge (§13–§14) | L1–L6 | no-scroll e2e green on all four sizes; perf-ios unchanged |

**Release order:**
1. Backend: routes, schemas and relay frames. These are backward compatible because PROTO 4 clients keep working.
2. Game build plus OTA.
3. Ranked Season 1 opens on the first Thursday 16:00 UTC after the build is live. The liquidity gate decides whether the queue actually opens.

---

## 17. Your call (defaults apply if no answer)

| # | Question | Default |
|---|---|---|
| 1 | Liquidity gate thresholds | Open at 24 ranked-eligible players online; close below 16 for 10 min |
| 2 | Tier names (Kitten and Legend also appear on cards) | Keep Kitten / Tabby / Alley / Lion / Legend; always shown with a division or points and the emblem |
| 3 | Decay (PARITY §4.3 said none) | Legend only: −20 per day after 14 inactive days, never below Legend 0; others rely on RD |
| 4 | Ranked S1 is short (opens mid pass season, ends 2027-01-05) | Call it "Ranked Season 1" anyway; frame and title rewards as normal |
| 5 | Report note for minors | Hidden for under 16 and unknown bands; 140 characters for 16+; moderators only |
| 6 | Map-hack export timing | Ride the next planned SIM_VERSION bump; no dedicated bump |
| 7 | Display names | Generated name by default; opt-in to one of your own (moderated) cat names |
| 8 | Report button on co-op Quick Play too | Not now (PvP only, as asked) |
| 9 | Friends cap | 100 |
| 10 | 5v5 ranked | Not in S1 |
| 11 | "Avoid as teammate" from blocks in matchmaking | Later (needs the shared queue **[infra]**) |
| 12 | Ranked button: one tap starts the queue, or opens the sheet | Opens the sheet (shows the closed, placement and lock state); Play Ranked is the sheet's first button |

## 18. Known issues to mention, not fix silently

- Casual dodges live only in memory per relay (`mm-bridge.ts` `dodges`), so they reset on restart. L3 moves them to `pawlegendsmmdodges` for ranked and casual. Mention it in the PR.
- The queue is per relay (gaps report). Ranked liquidity and the online count are global, but matching is per relay until the shared queue lands **[infra]**.
- The game ladder in `meta/ladder.ts` ("bot ladder", local only) has its own "placement" word. Ranked copy must not reuse the bot ladder's numbers, so that the two read as different things.

## 19. Build status (feat/pawlegends-social, 2026-11-11)

| Lane | State | Where |
|---|---|---|
| L1 Reports + admin + CMS | Built. Report route (guests too), minimum data, one per target per match, caps, AFK corroboration, notes for 16+ only; moderator list (F1–F5), detail, resolve (the only sanction writer), stats (the 1% trigger); CMS page `/pawlegends-reports`; the flag on the scoreboard and the results table | `backend/src/pawlegends/social/report*.ts`, `cms/pages/pawlegends-reports.tsx`, `pawlegends/src/social/report.ts` |
| L2 Social core | Built. Profile and player codes, friends by code and from recent, auto-accept, caps, blocks, age gate, display names, invites, API pulse | `backend/src/pawlegends/social/social.*` |
| L3 Relay | Partly built. PresenceSink (relay snapshot every 5 s, diffed bulk upsert, 60 s refresh) and sanctions at `mm.join`. **Not built:** PROTO 5 and the `social.add` frame (add from the party), durable dodges (`pawlegendsmmdodges`), the blocked joiner's `party_full` at `party.join` | `party/presence-sink.ts`, `mm/sanction-reader.ts` |
| L4 Invites + Join | Built on one relay: invite route, title pulse toast with Join, Join from a friend row. Multi-relay needs the party directory **[infra]** | `social.service.ts`, `pawlegends/src/social/socialSheet.ts` |
| L5 Boards | Built. Weekly and per-hero rows written only in `/live` (`writeBoards`), read routes, cached 60 s, sanctions and guests excluded | `pawlegends-party-live.ts`, `ranked/boards.ts`, `ranked/ranked.service.ts` |
| L6 Ranked backend | Built (gap plan P4, 2026-11-13). Tiers, pure points (placements, shield, demotion, soft reset, Legend decay, dodge cost), the ranked Glicko row and points in `/live` for a `queue: 'ranked'` mm room, the liquidity gate job, `ranked/status`, `ranked/me`, the global board. **P4:** the ranked pool in the matchmaker (`MmPvpQueue` 'ranked': 3v3 Crossing, solo or duo, full teams of humans only, never a bot, never moved to co-op, ±150 → ±400 over 120 s, opposite teams never share a /24); `mm.join {queue:'ranked'}` with no PROTO bump (old clients never send it) refused with `mm_ranked_closed {online, need}` while the gate is closed, `mm_need_account`, `mm_ranked_matches {have, need}`, `mm_ranked_pending {rooms}` (an ended ranked room of the last 24 h not yet saved), `party_full` reason `ranked_party`; no backfill in ranked rooms; the settlement check before any point moves (`ranked/settlement.ts`); season rewards by a leased job after the season ends (`ranked/season-rewards.ts`: each tier up to the peak earns its existing frame, Alley and above the season coat; `peaks[].rewarded` false → true). Game: the Ranked tile and nav item follow `ranked/status` (locked "Opens at 24 online · 9 now", live while open), PvP only, the ranked queue card (no bots, Play Casual after 3:00), the ranked Accept card and the results block (points, shield, tier). **Not built:** duo within one tier, Legend solo only, the durable dodge log, half loss-back for an S grade (needs the server grade, GAPS N6) | `ranked/*.ts`, `mm/*.ts` |
| L7a heroSight export | Not built on purpose: it changes SIM_HASH, so it rides the next planned SIM_VERSION bump | `src/sim/server.ts` (next bump) |
| L7b Referee intel | Built and dormant: the counter runs only when the sim exports `heroSight`; the relay stores `members[].intel`; the moderator view computes the z-score | `party/referee-intel.ts`, `social/intel.ts` |
| L8 Game UI + host bridge | Built: `api-request`/`api-result` bridge (game, host, fixture), the report flags, the Social sheet (Friends, Requests, Recent, Ranked, Boards), the lobby button, the invite toast. **Not built:** the Ranked button in the online row and the hero board picker; the app shell (`pawlegends-app`) has no host bridge, so social answers status 0 there | `pawlegends/src/embed/api.ts`, `client/components/pawlegends/apiBridge.ts` |

Routes differ from §10 in one place: the friends board and the caller's own rank are `GET /pawlegends/boards/:kind/me`
(auth); `GET /pawlegends/boards/:kind` stays public and cached.
