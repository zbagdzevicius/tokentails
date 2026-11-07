# M1a Quick Play co-op: implementation plan (2026-11-07)

**Scope:** M1a only (`PARITY.md` §0, §3). Strangers join your team, bots are the enemy, casual, no ranked, no PvP.
**Out of scope:** M1b casual PvP (the S-PvP sim batch), ranked (M2), region probes and edge relays (§3.4), the accept
card, spectate.
**Branch:** `feat/pawlegends-matchmaking` from `origin/main` (sim v14 live with five dogs, party play live, heading
flash, walker prediction and camera zoom live).
**Status:** backend and game client done on `feat/pawlegends-matchmaking` (not released: the game build ships with the main session's `build:client`).
**Paths** are relative to the repo root.

## 0. Hard rules (checked at every step)

| Rule | How this plan keeps it |
|---|---|
| **The sim does not change.** `git diff origin/main -- pawlegends/src/sim pawlegends/src/data` stays empty | M1a uses party v13+ as it is (`humans ⊆ {0,1,2}`, bots on the other team). Only `src/net/proto.ts` (not part of the sim closure, so `SIM_HASH` does not move), the party chunk, the lobby and analytics change on the game side. `npm run vendor-sim:check` must show the sim bundle unchanged; only the net bundle sha moves |
| **One score write path** (`POST /user/catbassadors/live`) | The hidden rating is written only inside `savePawlegendsPartyMatch` (the `v: 2` branch of `/live`). The relay and the matchmaker read ratings and write room records only. A new static spec (§6.1) fails if any other file writes the rating model |
| **No feature flags** | Play online is on by default. It needs no new env var or secret. Without `PAWLEGENDS_PARTY_TICKET_SECRET`, rooms are unscored as today and the queue still works |
| **Zero friction** | One tap on **Play online** from the title. No sign-in wall (guests queue with their guest ticket or guest key). The queue card shows a timer and **Cancel** from the first frame. Bots fill in 8 to 30 s (§2.4), so p50 stays well under 30 s at any population |
| **Merge with `feat/gcp-migration`** | That branch edits `party/party-ticket.service.ts`, `party/room-store.ts`, `party/party-relay.service.ts` and `shared/client-ip.ts`. This plan writes **0 lines** in the ticket service, the room store and `client-ip.ts` (it only imports `clientIpKey`). It adds **one constructor parameter and one option** to `party-relay.service.ts` (§5.3). Everything else lives in new files under `backend/src/pawlegends/mm/` |
| **Backend first** | §8. A `PROTO 1` client (the live build) keeps working against the new relay, unchanged |

---

## 1. What the player gets

1. The title shows **Play online** in the friends row, next to **Play with friends** and **Join with code**, from the
   very first visit (changed 2026-11-07, zero friction: a new guest who came to play with strangers must not hunt for
   it). Play (solo, the guided first match) stays the big button; Play online is a solid small button, not a ghost one.
   A brand-new player (no match yet) searches as Cats by default and sends the newbie hint.
2. One tap. The party chunk loads (already prefetched while idle), the socket opens, `hello`, then `mm.join` goes out
   by itself. No other screen comes first.
3. The **queue card**: "Finding teammates… 0:07 · usually 0:15", humans found as pips (●●○), the side chip
   **Cats · Dogs · Either** (changeable while queued), and **Cancel**. A low-priority wait (leaver ladder, §4.4)
   shows as a countdown above the timer, still cancellable.
4. **Match found** (a 1.2 s strip in the card): "2 players + 1 bot · Dogs · Normal". The existing shared pick follows at
   once. There is no accept card: in co-op a slow or absent stranger is handled by the pick timeout (auto-lock) and the
   late-load pilot, as in party play (D11).
5. **Pick** (30 s, the existing shared pick): the CATS/DOGS switch is shown **locked** to the assigned side ("Your team:
   Dogs"); the grid shows that side only. Strangers appear under their D8 generated names. Bot seats show **Bot** on the
   team strip, on the loading screen and in results.
6. Loading, then the match: the existing room path. Quick chat, pings, emotes, surrender and pause votes work as in a
   party.
7. Results: a stranger sees **Play again** (re-queue with the same side choice) and **Back**. A queued friend duo
   returns to its own party results; the leader sees **Play online** again.

A friend party of 1 or 2 queues as a unit: the leader taps **Play online** in the party lobby; every member sees the
queue card; any member's Cancel or leave cancels it for the party.

---

## 2. The matchmaker (pure class, fake clock)

### 2.1 File and shape

`backend/src/pawlegends/mm/matchmaker.ts`, the same style as `party.service.ts` and `room.ts`: no I/O, no timers, time
injected, JSON in and out. The relay glue (§5.1) owns sockets and calls it.

```ts
export interface MmMember {
  member: string;              // relay member id
  identityKey: string;         // acct:… | guest:… | ip:… (MemberIdentity.key)
  accountId: string | null;
  ipKey: string;               // hashed clientIpKey(socket ip) (§4.5)
  netKey: string;              // hashed /24 or /48 (party-relay.ts netKey)
  rating: { r: number; rd: number };
  newbie: boolean;             // < 5 completed matches (hint) or rd > 300
  maxDifficulty: string | null;// hint: caps the room difficulty (never raises it)
}
export interface MmEntry {
  id: string;
  partyId: string | null;      // a friend party of 1 or 2 queues as one entry
  members: MmMember[];         // 1 or 2
  queue: 'coop';               // 'casual' | 'ranked' reserved for M1b/M2, refused today
  side: 'cat' | 'dog' | 'any';
  region: string;              // reserved: 'eu' only today (§4.6)
  sim: string;                 // `${simVersion}:${simHash}`: only one sim per room (rooms are pinned)
  enqueuedMs: number;
  notBeforeMs: number;         // low-priority wait (§4.4); 0 when clean
  awaySinceMs: number | null;  // tab hidden: skipped, cancelled after 60 s (§4.3)
}
export interface MmMatch {
  id: string;
  region: string;
  sim: string;
  side: 'cat' | 'dog';
  difficulty: string;
  entries: string[];           // oldest first; the oldest entry's first member becomes slot 0
  humans: number;              // 1..3
  bots: number;                // 3 - humans (teammate seats flown by sim bots, §2.5)
  waitedMs: Record<string, number>;
}
export interface MmBackfillSeat { room: string; slot: number; side: 'cat'|'dog'; sim: string; region: string;
  difficulty: string; teamRating: number; leaverKey: string; inRoomKeys: string[]; sinceMs: number; }
export interface MmOffer { offer: string; entry: string; seat: MmBackfillSeat; expiresMs: number }

export class Matchmaker {
  constructor(private readonly limits = MM_LIMITS, private readonly now: () => number = Date.now) {}
  join(e: MmEntry): 'ok' | 'already_queued' | 'queue_full';
  leave(entryId: string): MmEntry | null;
  setSide(entryId: string, side: MmEntry['side']): void;
  setAway(entryId: string, away: boolean): void;
  addBackfillSeat(s: MmBackfillSeat): void;    // relay: a seat became backfillable (§3)
  dropBackfillSeat(room: string, slot: number): void;
  answerOffer(offer: string, yes: boolean): MmOffer | null;
  tick(): { matches: MmMatch[]; offers: MmOffer[]; cancelled: { entry: string; reason: 'away' }[] };
  status(entryId: string): { waitedMs: number; estimateMs: number; found: number; lowPriorityMs: number } | null;
  arrivalsPerMin(region: string): number;      // the quiet-queue estimator (§2.4)
}
```

`tick()` runs every 500 ms (`MM_LIMITS.tickMs`) from the relay's existing 500 ms party timer, per region pool.

### 2.2 Compatibility (hard rules: two entries may share a match only if all hold)

- Same `region`, same `queue`, same `sim` (rooms are pinned to one sim; during a deploy skew window old and new
  builds queue apart).
- Sides: `cat` + `cat`, `dog` + `dog`, or anything + `any`. A `cat` and a `dog` entry **never** share a match: M1a has
  one human team, and a team is never mixed (the existing `leaderSide` rule).
- Total humans ≤ 3 (so: 3 solos, a duo + a solo, or fewer with bot fill). Two duos never match.
- No identity twice (`identityKey`, except `ip:` keys, which are many people behind one address).
- Neither entry is away or still inside its `notBeforeMs`.
- Rating window, grown with the oldest entry's wait `w` in seconds: `|r(a) − r(b)| ≤ min(150 + 15·w, 600)`. Co-op is
  lenient on purpose: the enemy is bots, a fast match beats a precise one. RD-aware: a member with `rd > 200` counts as
  `rd`-wide (the window grows by `rd − 200`).
- Same-network rule (`PARITY.md` §3.2) is **not needed in M1a**: everyone is on one team, there is no opponent to
  trade wins with. The `netKey` is kept for the abuse caps (§4.5) and for M1b.

### 2.3 Forming matches (greedy, oldest first, deterministic)

Each tick, per pool, entries sorted by `enqueuedMs` (ties by `id`):
1. **Backfill first** (§3): every open backfill seat takes the best compatible **solo** entry that waited ≥ 3 s.
2. **Full team:** for the oldest entry, take the compatible combination that reaches 3 humans with the lowest fit cost
   (below). Match at once.
3. **Pair fill:** if the best combination has 2 humans and the oldest of them waited ≥ `pairFillMs(λ)` (§2.4), match
   with 1 bot.
4. **Solo fill:** if the oldest entry is alone (or a duo with no compatible solo) and waited ≥ `fillAtMs(λ)`, match it
   with bots.

Fit cost (lower is better): `|Δr| / 50 + 4·(newbie mismatch) + 0.001·(enqueue order)`. Newbies prefer newbies; the
cost never blocks a match, it only orders the choice.

**Party rating:** a duo enters with `mean + 0.25·(max − mean)` (a strong player does not drag a new friend into a high
difficulty).

**Side of the match:** the side of any non-`any` entry; if all are `any`, the side the pool played less in the last 50
matches (keeps cats and dogs both in use), ties go to `cat`.

**Slots:** the oldest entry's first member is slot 0 (the party leader for the pick's lead rules); then its partner,
then the other entries in queue order.

### 2.4 Bot fill timing (the number that keeps p50 under 30 s at low population)

`λ` = distinct identities that sent `mm.join` in this pool over the last 5 minutes, per minute (excluding the entry
being judged).

| Pool | `fillAtMs` (solo) | `pairFillMs` (2 humans) | Why |
|---|---|---|---|
| quiet, `λ < 2/min` | **8 s** | 8 s | A partner is expected in > 30 s: waiting longer only costs the player time |
| normal, `2 ≤ λ < 6/min` | **20 s** | 12 s | P(a partner within 20 s) at 2/min = 1 − e^(−2/3) ≈ 49 %, at 4/min ≈ 74 % |
| busy, `λ ≥ 6/min` | **30 s** (`MM_LIMITS.maxFillMs`, never longer) | 12 s | Most solos meet 2 others well before 30 s |

Expected result (gated by `mm-sim`, §6.3): p50 ≤ 15 s and p95 ≤ 30.5 s (30 s + one tick) at every arrival rate from
0.25 to 60 per minute; at `λ ≥ 20/min`, ≥ 60 % of matches seat ≥ 2 humans. The thresholds and times live in
`mm/mm-limits.ts` (`MM_LIMITS.fill`), so tuning them after launch is a one-line change measured against production
`queueMs`.

**Estimate** shown on the card (`mm.status.estimateMs`): `min(fillAt − waited, expected wait to the next compatible
arrival)`, rounded up to 5 s, never below 3 s.

### 2.5 Difficulty and bot seats (`mm/fill.ts`, pure)

- Team composite rating `R` = mean of the humans' `r`.
- Difficulty from `R`: `< 1125` rookie, `< 1375` easy, `< 1625` normal, else hard (the midpoints of the bot pseudo
  ratings in §4.1, so humans face bots just under their level).
- **Capped** at the lowest `maxDifficulty` among the humans (the existing party rule: a newcomer is never dropped into
  bots above their unlocked tier). The hint can only lower it.
- Empty teammate seats are **sim bots** (the room's `humans` list holds only the matched human slots, as a party with
  Open seats off). They are not relay pilots, so the S5 "open seat unclaimed at tick 1,800" catnip rule never fires on
  a bot-filled match, and a solo queuer does not get two full-strength pilots for free.

### 2.6 Output to the relay

`MmMatch` → the relay glue (§5.1) builds one party with `mm` metadata (§5.2), seats the members in slot order and
moves it straight to `pick` with `fixedSide` and `difficulty` set. From there the existing pick → loading → `startMatch`
→ room path runs unchanged.

---

## 3. Backfill for a leaver (casual co-op only)

A seat in an **mm room** is backfillable when all hold:
- it is a human slot, the room is live and not ending, `tick < 5,400` (3:00);
- its member left (`party.leave` mid-match, the room's `vacate`), **or** the slot has been piloted for reason `drop`,
  `away` or `afk` continuously for 60 s. A friend in a host friend party is never backfilled while they hold the seat
  (only a seat they left): a phone call must not cost them their friends' match;
- it was not backfilled before (one backfill per slot).

Flow:
1. The relay glue calls `Matchmaker.addBackfillSeat`.
2. On the next tick the matchmaker picks a queued **solo** entry: compatible side and sim, same region, rating within
   300 of the team mean, `maxDifficulty` at or above the room's difficulty, not the leaver's identity, no identity
   already in the room, waited ≥ 3 s, fewer than 3 offers in its last 10 minutes.
3. The entry gets `mm.backfill.offer {offer, side, clockS, score:[a,b], expiresMs}` (no room id on the wire). The card
   says "Join a match in progress · 1:42 · your team is ahead" with **Join** and **Keep searching**, a 10 s ring.
   The entry stays in the queue while the offer is open; declining or timing out costs nothing and the seat goes to the
   next candidate.
4. **Join** (`mm.backfill {offer, yes:true}`):
   - the member joins the mm party as a stranger (`PartyService.joinMatched`);
   - `Room.reopen(slot)` (new, §5.4) makes the piloted slot claimable and moves the slot's earlier AFK-reason pilot
     ticks to a `before` reason that the AFK rule never counts, so the backfiller is not judged on the leaver's ticks;
   - the existing `claimOpenSeat` path binds the socket, replaces the occupant row (so the leaver can no longer save
     that slot), sends `match` with `startInMs: 0`, and the client catches up (the P10 join-in-progress path);
   - the seat turns human on the client's caught-up `back`, as today.
   - every check that can refuse (sockets, caps, the slot still piloted) runs before the holder is evicted, and the
     holder's row gets its `left` event only once the seat changed hands: a refused backfill costs nobody anything.
5. **The leaver:** if they were only dropped and come back before a backfill, they reclaim as today. After a backfill,
   they are removed from the mm party, their resume token is dropped, and a reconnect gets
   `error{code:'seat_taken'}` ("Your seat was taken"). The match counts as `left` for them (§4.4).
6. **Rewards:** a backfiller's win pays catnip as any party win. A backfiller's **loss changes no rating** (the
   `backfill` flag in the mm room record, §4.3).

---

## 4. Ratings, leavers, AFK, abuse, region

### 4.1 Hidden Glicko-2 (`mm/glicko2.ts`, pure, deterministic)

- Glickman's Glicko-2 with `τ = 0.5`, defaults `r 1500`, `RD 350`, `σ 0.06`, RD floor 45, the Illinois algorithm for
  `σ'` with ε = 1e-6. Same inputs give the same float outputs in Node (tested).
- **Inactivity:** one rating period of RD growth per full 7 days since `lastAt`, capped at 350.
- **Co-op opponent:** the enemy team is always bots, so each human is updated against one fixed pseudo-player per room
  difficulty, **weight 1** (a deliberate co-op rule; `PARITY.md` §3.5's bot-share weight applies to M1b PvP, where
  a bot-heavy enemy should barely move you):

  | Difficulty | Pseudo `r` / `RD` |
  |---|---|
  | rookie | 1000 / 60 |
  | easy | 1250 / 60 |
  | normal | 1500 / 60 |
  | hard | 1750 / 60 |

- Outcome 1 (won) or 0 (lost, including a forfeit). Performance never moves the rating.
- **Seed** for an account with no row: from the `hello.hint.maxDifficulty` (untrusted, matching only): rookie 1150,
  easy 1350, normal 1550, hard 1750, all with `RD 300`. A lie can only change which strangers you meet and, through
  §2.5, never raise a difficulty above what a friend party leader can already pick. No user document is read by the
  relay.
- Order independence: the opponent is a fixed pseudo-player, so the order in which teammates post cannot change anyone's
  number. `ratingAtStart` is still snapshotted into the mm room record for match-quality analysis.

### 4.2 Storage: `PawlegendsRating` (`backend/src/pawlegends/mm/rating.schema.ts`)

| Field | Type | Notes |
|---|---|---|
| `_id` | `${accountId}:coop` | `casual`, `ranked` keys reserved for M1b/M2 |
| `accountId` | string, indexed | guests have rows on their guest account (ticketed guests have an `accountId`) |
| `queue` | `'coop'` | |
| `r`, `rd`, `sigma` | number | |
| `games`, `wins` | int | |
| `lastAt` | Date | drives RD growth |
| `appliedRooms` | string[], last 50 | idempotency next to the party save digest |
| `v` | int | optimistic version for the conditional update |

**Written only by `/live`.** In `savePawlegendsPartyMatch`, **after** the Game row is created (the digest makes it
once per account per room), when the room has an mm record:
- skip when `appliedRooms` holds the room;
- skip a loss when the poster was a backfiller, or when a teammate had a `left`/`afk` event before tick 9,000 (5:00):
  loss forgiveness (the leaver takes the queue penalty, §4.4);
- else compute with `mm/rating-update.ts` (pure) and write `updateOne({_id, v}, {$set, $inc:{v:1}, $push:{appliedRooms:
  {$each:[room], $slice:-50}}})`, upsert by insert-then-retry once on a version miss or `11000`.
- A rating write failure is logged and **never fails the save**: the Game row and catnip are the score, the rating is
  matchmaking data.

Solo matches (the `v: 1` branch) do not touch ratings in M1a (no change to `pawlegends-live.ts`).

**Reads:** `MmRatingReader` (in `rating.schema.ts`): `get(accountId)` with a 60 s in-memory cache, used by the relay
glue at `mm.join`. It holds the model for `find` only (the static spec in §6.1 checks there is no write call outside
`pawlegends-party-live.ts`).

**Guest merge:** `mm/rating-merge.ts` `mergeRating(guestId, targetId)`: the row with the lower `RD` wins (ties: more
games), the other is deleted. Called once from `user/guest/guest-lifecycle.ts` next to the existing Pawlegends merge
step. It is a re-key, not a score write.

### 4.3 The mm room record: `PawlegendsMmRoom` (`backend/src/pawlegends/mm/mm-room.schema.ts`)

A separate small collection keyed by the room id, so `party/room-store.ts` (changed on `feat/gcp-migration`) is not
touched. Written by the relay glue (room records are the relay's to write); read by `/live` and by `leaverStatus`.
Same interface pattern as the room store: `MmRoomStore` with `MongoMmRoomStore` (production) and `MemoryMmRoomStore`
(specs, harness).

```
{ _id: roomId, queue: 'coop', region: 'eu', side: 'cat'|'dog', difficulty, sim,
  fill: number[],                          // bot-filled teammate slots
  queueMs: { [slot]: number },             // time each human waited (the done measures)
  members: [{ slot, identityHash, accountId|null, joinedTick, backfill: boolean,
              ratingAtStart: {r, rd, sigma} | null,
              event?: 'left'|'afk', eventTick?: number }],
  endedAt?: Date, createdAt: Date }
indexes: { 'members.identityHash': 1, createdAt: -1 }, { 'members.accountId': 1 }, TTL 30 days on createdAt
```

`identityHash` = sha256 of the identity key (account or guest key; never an IP). No IP is ever stored.

Events are set by the relay glue at room end, from the `Room`'s own slot state:
- `left`: `party.leave` mid-match, or offline for the last 180 s before the end;
- `afk`: AFK-reason pilot ticks (`drop`, `away`, `afk`) > 35 % of the match's ticks while the member held the seat.
A drop that reconnected and reclaimed is not an event.

### 4.4 Leaver penalty (light) (`mm/leaver.ts`, pure)

`leaverStatus(identityHash, rooms, nowMs)` over that identity's mm rooms of the last 7 days (read once at `mm.join`,
cached 60 s; no penalty collection exists to tamper with or keep in sync):

| Events in 7 days | Effect |
|---|---|
| 1 | A warning line on the queue card: "Leaving puts a bot in your seat. Next time: a short wait" |
| 2 | `notBeforeMs = now + 60 s`: a low-priority countdown on the card, cancellable |
| 3 or more | `+ 3 min`, same card |

- Decay: every 5 completed mm matches without an event erase the oldest event.
- No catnip removal, no lock, no rating loss for the leaver in M1a. The ladder is the M1b ladder's first two steps.
- Unticketed sockets with neither an account nor a guest key (an `ip:` identity) get no ladder: an IP is many people.

### 4.5 Abuse limits keyed by the real client IP (`mm/mm-limits.ts`)

The socket IP is the one the relay already resolved on the upgrade (`PartyRelay.clientIp`, the S1 rule: the Cloudflare
header only from a Cloudflare or trusted ingress hop). The mm `ipKey` is `hash('mm:' + clientIpKey(ip))`, with
`clientIpKey` imported from `backend/src/shared/client-ip.ts` (an IPv6 home rotating through its /64 counts once).
`netKey` is the relay's existing /24 or /48 key.

| Limit | Value | Over it |
|---|---|---|
| `mm.join` per identity / per IP / per net | 30 / 120 / 600 per 10 min | `error{code:'rate_limited', retryMs}` |
| Queued entries per identity / per IP / per net | 1 / 12 / 40 | a second `mm.join` from the same identity moves the entry (the newest socket wins, as party seats do); over the IP or net cap: `rate_limited` |
| Queue size per instance | 600 entries | `server_busy` with `retryMs: 15 000` |
| Backfill offers per identity | 3 per 10 min | not offered |
| `mm.side` changes | 1 per 2 s | dropped |
| Live rooms per identity / per IP | the existing 1 / 4 | checked at `mm.join`: a seat this identity still holds from a socket that is gone (a closed tab) is given up first (as `party.leave`; a bot keeps it, a backfill can take it); a cap that still binds answers `error{code:'mm_locked', retryMs: 30 000}` at once. A seat given up (`party.leave`, eviction) stops counting at once. At match time the same check repeats; never `mm.cancel{server}` (the client reads that as a restart) |
| Unticketed rooms | the existing 50 % share of `maxLiveRooms` | the match waits for capacity, then `server_busy` |
| JSON frames | the existing 5 per second, burst 10 | strike |

### 4.6 AFK detection

| Where | Rule |
|---|---|
| Queued | The client already sends `away`/`back` on tab visibility. An away entry is skipped by the matchmaker; away for 60 s cancels it (`mm.cancel{reason:'away'}`, the card says "Search stopped while you were away" with **Search again**). A socket closed while queued removes the entry after 10 s (a quick reconnect with the resume token keeps it) |
| Pick | The existing 30 s pick timeout auto-locks; nobody is kicked |
| Loading | The existing late-load pilot at 20 s |
| Match | The existing room timers: away at 3 s, pilot at 6 s, warning at 45 s, AFK pilot at 60 s (`party-limits.ts`). Their pilot ticks feed the `afk` event (§4.3) and the existing > 50 % no-reward rule |

### 4.7 Region (reserved)

- `mm.join` takes an optional `region` (`^[a-z0-9-]{1,16}$`). The relay ignores any value but `eu` today and always uses
  `MM_HOME_REGION = 'eu'` (a constant, not an env var).
- `MmEntry.region`, `MmMatch.region` and the mm room record carry it, so M1b's probes (`PARITY.md` §3.4) only add a pool
  per region and a `GET /pawlegends/mm/regions` route.

---

## 5. Backend changes

### 5.1 Relay glue: `backend/src/pawlegends/mm/mm-bridge.ts` (new)

The only place that knows both the relay and the matchmaker. The relay calls it through a small interface so
`party-relay.ts` gains hooks, not logic:

```ts
export interface MmHooks {
  onJson(s: MmSock, msg: MmClientJson): void;      // mm.join | mm.leave | mm.side | mm.backfill
  onPresence(member: string, state: 'on'|'away'|'off'): void;
  onTick(): void;                                  // every 500 ms with the party timer
  onRoomStarted(roomId: string, party: Party, plan: StartPlan): void;  // writes the mm room record
  onSeatChanged(roomId: string, slot: number, why: 'left'|'drop'|'afk'|'back', tick: number): void;
  onRoomEnded(roomId: string, verdict: RoomVerdict, slots: SlotSnapshot[]): void;
  onPartyChanged(party: Party): void;              // a member left a queued party: cancel
  shutdown(): void;                                // mm.cancel{reason:'server'} to every entry
}
```

It owns: the `Matchmaker`, the entry ↔ socket map, `mm.status` fan-out (every 2 s and on change), offers, rating and
leaver reads (`MmRatingReader`, `MmRoomStore`), and the server counters (§7.2). Created by `MmService` (§5.3).

### 5.2 `party/party.service.ts` (edited, additive)

- `Party.mm?: { match: string; queue: 'coop'; strangers: Set<string>; queuedSinceMs?: number; side: 'cat'|'dog' }`.
- `createMatched(members, {side, difficulty, slotOrder})`: an mm party, `locked: true`, `openSeats: false`, phase
  `pick` at once, `fixedSide` set; slots from `slotOrder`.
- `joinMatched(party, member, identity, hint)`: adds a stranger to a queued friend party (bypassing code, lock and
  `party_busy`), or a backfiller into a running mm party.
- `fixedSide`: with `p.mm`, `leaderSide` never changes `p.side` and `heroAllowed` refuses the other side for everyone,
  the leader included. `autoLock` and the bot picks use that side.
- With strangers present: `set`, `kick`, `newcode`, `lead` and `start` are refused (no stranger can be kicked or locked
  out); the rematch vote is off.
- `matchEnded` on an mm party: strangers get results with Play again / Back; when a stranger re-queues, leaves, or idles
  60 s in results, they leave the party. A host friend party drops `mm` when its last stranger leaves and returns to
  plain results.
- `view(p, forMember)`: a stranger's copy has `code: ''` (the friend party's code never reaches a stranger); adds
  `mm?: { side, strangers: true }` and `queue?: { sinceMs, side }` while a friend party is queued. Additive fields:
  `parseServerJson` checks only `t`, so a `PROTO 1` client ignores them (they never reach one anyway, §5.5).

### 5.3 Wiring (edited, minimal)

- `backend/src/pawlegends/mm/mm.service.ts` (new, `@Injectable`): holds the rating model, the mm room model and store,
  `MmRatingReader`, and builds `MmBridge` on demand (`hooks(relayApi)`).
- `party/party-relay.service.ts`: **one new constructor parameter** (`private readonly mm: MmService`) and **one
  option** in `new PartyRelay({... mm: this.mm})`. Nothing else. (Merge note for `feat/gcp-migration`.)
- `app.module.ts`: register `MmService`, the `PawlegendsRating` and `PawlegendsMmRoom` schemas.
- `user/user.controller.ts`: pass `mm: { rooms, ratings }` into the `savePawlegendsPartyMatch` deps (an optional
  `@Optional()` injection like `partyRooms`).
- `user/guest/guest-lifecycle.ts`: one call to `mergeRating` next to the existing Pawlegends merge step.

### 5.4 `party/party-relay.ts` and `party/room.ts` (edited, hooks only)

`party-relay.ts`:
- `hello`: accept `PROTO_MIN (1) ≤ proto ≤ PROTO (2)`; store `s.proto`; `welcome.proto` echoes the socket's proto.
- `onJson`: the four `mm.*` cases go to `mm.onJson` (a `PROTO 1` socket sending one is a `bad_message` strike).
- Presence (`away`, `back`, `onClose`), the 500 ms timer, `startMatch` (after the room exists), `leaveSeat`, the
  takeover log line (`mp_takeover`), the end path (`onReferee 'end'`), `queueParty` (party changed) and `shutdown` call
  the matching hook.
- `sendJson` gains a guard: a frame whose `t` starts with `mm.` is never sent to a `proto < 2` socket.
- `matchMsg`: adds `mode: 'coop'` for an mm party (additive).
- `saveParty`: adds `mm: {match, side, strangers: [...]}` to the party doc so N9 restore keeps strangers and the fixed
  side (the queue itself is in memory and is not restored: clients re-queue, §5.6).
- `claimOpenSeat(s, live, party, member, slot?)`: an optional explicit slot for a backfill.

`room.ts`:
- `reopen(slot, tick)`: a piloted, vacated or dropped human slot becomes claimable (`reason 'open'`, `occupied false`);
  its `drop`/`away`/`afk` pilot ticks so far move to reason `before` (not in `AFK_REASONS`). Nothing else changes;
  `party-relay.spec`, `room.spec` and `room-restore.spec` stay green unchanged.

### 5.5 Protocol (`pawlegends/src/net/proto.ts`, `PROTO 1 → 2`)

`npm run vendor-sim` copies it to `backend/src/vendor/pawlegends-net/` (the net bundle sha moves, the sim bundle does
not). The subprotocol stays **`pl.1`**: it names the framing, which is unchanged, and the live relay accepts only it.

New constants: `PROTO = 2`, `PROTO_MIN = 1`, `MM_QUEUES = ['coop']`, `MM_SIDES = ['cat','dog','any']`.

**Client to server** (every §2.3 rule: ≤ 1 KB, typed guards, unknown keys refused, the JSON rate limit):

| t | Fields | Rules |
|---|---|---|
| `mm.join` | `queue: 'coop'`, `side: 'cat'\|'dog'\|'any'`, `region?: string` (`^[a-z0-9-]{1,16}$`) | After `welcome`. Solo: no party, or a party of 1. Party: the leader, a party of 1 or 2 in `lobby` or `results`, every member connected and on `PROTO 2` (an older member gets `update_required`). Refused with `mm_locked{retryMs}` only for the abuse caps (§4.5); the leaver ladder is a wait, not a refusal |
| `mm.leave` | | Any time before `mm.found` |
| `mm.side` | `side` | While queued, 1 per 2 s |
| `mm.backfill` | `offer: string (^[a-z0-9]{12}$)`, `yes: boolean` | Within 10 s of the offer |
| `mm.back` | none | A stranger's closed tab (no party code to rejoin by): the same identity takes its own live Quick Play seat back (the `party.join` twin path); `error{code:'party_not_found'}` when there is none. The client marks `pl.party.last` as `{mm: true}` while a stranger is in a live match (no token, no code) |

**Server to client** (only to `PROTO 2` sockets):

| t | Fields |
|---|---|
| `mm.status` | `queue, side, waitedMs, estimateMs, found (1..3), lowPriorityMs?, warn?: 'leaver'` (on change and at most every 2 s) |
| `mm.found` | `side, humans, bots, difficulty` (counts only, never names); the `party` view in `pick` follows in the same flush |
| `mm.cancel` | `reason: 'left'\|'away'\|'party'\|'server'\|'update'` |
| `mm.backfill.offer` | `offer, side, clockS, score: [a, b], expiresMs` |
| `error` (new codes) | `mm_locked`, `seat_taken` |
| `match` | gains optional `mode: 'coop'` |

**Compatibility matrix**

| Client | Relay | Result |
|---|---|---|
| `PROTO 1` (the live build) | new | `hello` accepted, `welcome.proto: 1`, never receives an `mm.*` frame or a new error code; party play byte-identical |
| `PROTO 2` | new | full |
| `PROTO 2` | old (skew, should not happen with §8) | the old relay answers `update_required` before `welcome`. The socket retries **once** with `proto: 1` and marks the session `mm: false` (Play online hides, party play works). If the retry is also refused, the existing "Update to play together" screen shows |

### 5.6 Deploys and restarts

The matchmaker is in memory in the one API instance (`PARITY.md` §9). On SIGTERM `MmBridge.shutdown()` sends
`mm.cancel{reason:'server'}`; the client keeps its queued intent and its local start time, reconnects (the existing
resume path) and re-sends `mm.join` after `welcome`, so the player sees one continuous timer. If no new `welcome` comes
within 6 s (the socket stayed up), the client sends `mm.join` again by itself: the card never spins without a search
behind it. Rooms survive through N9 as today; an mm party's strangers and fixed side survive with the party doc (§5.4).
Known gap: the glue's per-room bookkeeping (`MmBridge.live`) is memory only, so a restored room gets no backfill
seats, no leaver events and no finished record (the rating step still runs from `/live`).

Other exits: **Match found** has **Cancel** for a solo (`mm.leave` + `party.leave`: the stranger leaves before the
room starts, so no leaver event); the Quick Play pick has **Leave** (two taps; a bot takes the seat). A `mm.leave` that
crosses `mm.found` on the relay does the same; a `mm.leave` during the join's rating and ladder reads drops that join.

---

## 6. Game changes (all in the lazy party chunk, except the title button)

| File | Change |
|---|---|
| `src/net/proto.ts` | §5.5 |
| `src/net/socket.ts` | `hello.proto = PROTO`; the one-shot `proto: 1` retry on a pre-`welcome` `update_required` (§5.5); `mmCapable` from `welcome.proto ≥ 2` |
| `src/party/partyClient.ts` | `OpenMode` gains `'queue'`. `reduceParty` handles `welcome` in queue mode (send `mm.join`), `mm.status`, `mm.found`, `mm.cancel`, `mm.backfill.offer`, `seat_taken`; the queued intent survives reconnects (§5.6). Effects call the new cards. Leader action **Play online** in the party lobby |
| `src/party/ui/queueCard.ts` (new) | The queue card: timer (local, synced to `waitedMs`), estimate, found pips, side chip (radio group, arrow keys), low-priority countdown, leaver warning, **Cancel** (`data-testid="mm-cancel"`), the 1.2 s "Match found" strip, the away-cancel state with **Search again**. Mid-screen layout, safe at 667×375 |
| `src/party/ui/backfillCard.ts` (new) | The offer: clock, ahead/behind, **Join** / **Keep searching**, 10 s ring |
| `src/party/ui/partyPick.ts` | With `view.mm`: the CATS/DOGS switch locked on the assigned side, only that side's grid, header "Your team: Dogs"; empty teammate seats in the strip read **Bot** |
| `src/party/ui/partyLoading.ts`, `partyResults.ts` | **Bot** labels; for a stranger, **Play again** (`mm.join` with the same side) and **Back** instead of the rematch vote |
| `src/party/ui/partyLobby.ts` | Leader button **Play online** (`data-testid="party-queue"`) for 1 or 2 members; members see the queue card while `view.queue` is set |
| `src/party/ui/copy.ts` | All new strings (plain, short; see §1) |
| `src/party/party.css` | Queue and backfill card styles (tokens already in the file) |
| `src/ui/lobby/lobbyScreen.ts` | Option `onOnline?()`; button **Play online** (`data-testid="play-online"`) first in `.lb-friends-row`, shown when `onOnline` is set and not in a dare |
| `src/app/app.ts` | `onOnline` when `partyApi` and `profile.matches ≥ 1`: `openParty('queue')`; the side default from the last queue side (localStorage, try/catch), else `any` |
| `src/meta/partyPrefs.ts` | `lastQueueSide` get/set (per-viewer convenience) |
| `src/analytics/posthog.ts`, `src/app/mpTypes.ts` | The §7.1 events in the `AnalyticsEvent` union and the mp list |

First-load cost: the lobby button and one callback, ≤ 2 KB (`npm run budget`). The queue code rides the existing party
chunk, which is prefetched while idle on the title; the party chunk's growth stays ≤ 8 KB gzip.

---

## 7. Analytics

### 7.1 Game events (flat props, no ids; `room_h` only when correlation is needed, as `MULTIPLAYER.md` §10)

| Event | Props |
|---|---|
| `mm_join` | `queue, side, party_size, surface: web\|embed\|app, matches_bucket: 1-4\|5-19\|20+, guest, requeue: bool` |
| `mm_cancel` | `by: user\|away\|server\|party, waited_s` |
| `mm_found` | `waited_s, humans, bots, difficulty, side` |
| `mm_backfill_offer` | `clock_s, ahead: bool` |
| `mm_backfill_join` | `answer: yes\|no\|timeout, clock_s` |
| `mm_penalty` | `level: 1\|2\|3, wait_s` |
| `mp_match_start` / `mp_match_end` | existing, plus `mode: party\|coop` and `backfill: bool` |

### 7.2 Server counters (structured log, the existing counters route)

`mm_queued` (now), `mm_joins`, `mm_matches`, `mm_humans_per_match` (histogram 1/2/3), `mm_wait_ms_p50`,
`mm_wait_ms_p95`, `mm_fills` (by quiet/normal/busy), `mm_backfill_offers`, `mm_backfills`, `mm_leaver_events`,
`mm_refused` (by reason). The per-room `queueMs` in the mm room record is the production source for the done measures.

---

## 8. Release order (backend first)

1. **Merge to `main`** (the main session pushes; this branch never pushes or deploys). The backend deploys itself on
   DigitalOcean with: `PROTO 1..2` accepted, the mm hooks, the two new collections and indexes, the `/live` rating
   branch. The committed game build (`client/public/pawlegends-game`) is still the live `PROTO 1` client, so nothing a
   player sees changes; party play keeps working (the compat specs in §9.1 prove it).
2. **Check** the backend: `/health` counters show `mm_queued 0`; one party match from the live build plays and saves.
3. **Game release** (the main session): `npm run build:client` in `pawlegends/`, commit `client/public/pawlegends-game`,
   Vercel. **Play online** appears for players with ≥ 1 match.
4. **Watch for 48 h:** `mm_wait_ms_p50/p95`, `mm_humans_per_match`, leaver events, `refused_busy`. Tune `MM_LIMITS.fill`
   in a backend-only deploy if needed.

No sim batch, no `vendor-sim` freeze: the sim bundle is unchanged.

---

## 9. Files, tests and e2e

### 9.1 New and edited files

| Lane | File | New / edited |
|---|---|---|
| Backend mm | `backend/src/pawlegends/mm/matchmaker.ts` | new |
| | `mm/mm-limits.ts` (`MM_LIMITS`, `MM_HOME_REGION`) | new |
| | `mm/fill.ts` (difficulty, side choice, slot order) | new |
| | `mm/glicko2.ts` | new |
| | `mm/rating-update.ts` (room + row → row; forgiveness, backfill, idempotency) | new |
| | `mm/rating.schema.ts` (`PawlegendsRating`, `MmRatingReader`) | new |
| | `mm/rating-merge.ts` | new |
| | `mm/leaver.ts` (`leaverStatus`, events from slot snapshots) | new |
| | `mm/mm-room.schema.ts` (`PawlegendsMmRoom`, `MongoMmRoomStore`, `MemoryMmRoomStore`) | new |
| | `mm/mm-bridge.ts` | new |
| | `mm/mm.service.ts` | new |
| Backend edited | `party/party.service.ts` (§5.2) | edited |
| | `party/party-relay.ts` (§5.4 hooks) | edited |
| | `party/room.ts` (`reopen`) | edited |
| | `party/party-relay.service.ts` (one parameter, one option) | edited, minimal |
| | `pawlegends-party-live.ts` (one call to the rating update, optional `mm` deps) | edited |
| | `user/user.controller.ts` (pass the `mm` deps) | edited |
| | `user/guest/guest-lifecycle.ts` (one `mergeRating` call) | edited |
| | `app.module.ts` | edited |
| | `backend/test/party-relay.harness.ts` (memory mm stores, a memory rating reader) | edited |
| | `backend/src/vendor/pawlegends-net/**` | generated by `npm run vendor-sim` |
| | `party/party-ticket.service.ts`, `party/room-store.ts`, `shared/client-ip.ts` | **not touched** |
| Game | §6 table | |
| Tools | `backend/test/mm-sim.ts` (Poisson arrivals through the real `Matchmaker`, fake clock) | new |
| Docs | `docs/API.md` (the `mm.*` frames and error codes), `docs/BACKEND.md` (the two collections; no new env), `docs/GAMES.md` (Play online), `MULTIPLAYER.md` §2.1/§2.3 (point here for `PROTO 2`), `PARITY.md` §0 (M1a status) | edited |

### 9.2 Backend specs (jest, `cd backend && npm test`)

| Spec | Proves |
|---|---|
| `mm/matchmaker.spec.ts` (fake clock) | 3 compatible solos match on the next tick; 2 solos match with 1 bot at `pairFillMs`; a lone solo fills at 8 s in a quiet pool, 20 s normal, never after 30 s busy; `cat` and `dog` never share; `any` joins either and the side follows the non-`any` entry; duo + solo; two duos never; different `sim` never; same identity never twice; away entries skipped and cancelled at 60 s; `notBeforeMs` respected; the rating window widens with wait; newbies prefer newbies; a duo's rating is `mean + 0.25·(max − mean)`; slot 0 is the oldest entry's first member; identical inputs and clock give identical output |
| `mm/fill.spec.ts` | difficulty from the team rating; the cap at the lowest `maxDifficulty`; side balance when all are `any` |
| `mm/glicko2.spec.ts` | Glickman's worked example (1500/200/0.06 vs 1400/30, 1550/100, 1700/300, results 1-0-0 → 1464.06 / 151.52 / 0.05999 to 2 decimals); RD growth per 7 idle days capped at 350; RD floor 45; the bot pseudo-players; same inputs, same outputs |
| `mm/rating-update.spec.ts` | a win and a loss move the row; a backfiller's loss does not; loss forgiveness when a teammate left before tick 9,000; a room already in `appliedRooms` is a no-op; `appliedRooms` keeps 50 |
| `mm/leaver.spec.ts` | the ladder from fixture mm room records; decay after 5 clean matches; a reconnected drop is not an event; `ip:` identities get no ladder; the function is pure |
| `mm/rating-merge.spec.ts` | the lower-RD row survives a guest merge, keyed to the target account |
| `mm/mm-relay.spec.ts` (in-process relay, `relay-test-client.helper-spec.ts`) | 3 solo sockets → one room, `humans [0,1,2]`, `mode 'coop'`, one side; a solo → room `humans [0]` after the quiet fill; a duo party queues as one entry and returns to its own party results while the stranger gets Play again / Back; the stranger's party view has `code ''`; leader-only actions are refused with strangers; Cancel before `mm.found`; a member leaving a queued party cancels it; `mm.status` cadence; shutdown sends `mm.cancel{server}` and a re-sent `mm.join` after resume re-queues |
| `mm/mm-backfill.spec.ts` | a `party.leave` at tick 1,200 offers the seat to a queued solo; Join claims the slot, catches up, reclaims on `back` and the occupant row is replaced; the backfiller's AFK count excludes the leaver's ticks; decline and timeout pass the offer on; no offer after tick 5,400; the returning leaver gets `seat_taken`; offers capped at 3 per 10 min |
| `mm/mm-relay.security.spec.ts` | every `mm.*` guard (unknown key, bad side, bad region, oversize); the per-identity, per-IP and per-net join caps; one entry per identity; queue size cap → `server_busy`; the IP comes from `cf-connecting-ip` only through a trusted hop (the harness `clientIp` option) and IPv6 /64 groups through `clientIpKey` |
| `mm/mm-proto-compat.spec.ts` | `hello{proto:1}` → `welcome{proto:1}` and a full party match works; `hello{proto:2}` → `welcome{proto:2}`; `hello{proto:3}` → `update_required`; a `PROTO 1` socket sending `mm.join` is a strike; a `PROTO 1` member of a party never receives an `mm.*` frame, and the leader's `mm.join` sends it `update_required` |
| `mm/mm-no-write.spec.ts` (static, like `one-writer.spec.ts`) | no file but `pawlegends-party-live.ts` (and `rating-merge.ts` for the merge re-key) calls a write on the rating model; no file under `mm/` imports `UserRepository` or `GameRepository`; the relay glue never calls the score route |
| `pawlegends-party-live.spec.ts` (extended) | an mm win and loss update the coop row once per account per room; a non-mm party room writes no rating; a rating write failure still returns the save; `one-writer.spec.ts` stays green unchanged |
| `party.service.spec.ts` (extended) | `createMatched`, `joinMatched`, `fixedSide` (the leader cannot switch sides), refused leader actions with strangers, stranger removal after results |
| `room.spec.ts` (extended) | `reopen` moves AFK-reason ticks to `before`; the S5 flag never fires for a seat reopened after tick 1,800 |

### 9.3 Game unit tests (vitest, `cd pawlegends && npx vitest run`)

| Test | Proves |
|---|---|
| `tests/unit/net-proto.test.ts` (extended) | `PROTO 2`, `PROTO_MIN 1`; every `mm.*` client guard; `parseServerJson` accepts the `mm.*` types; the binary golden bytes are unchanged |
| `tests/unit/mm-client.test.ts` (new) | `reduceParty` in queue mode: `welcome` → `mm.join`; status, found, cancel, offer, `seat_taken`; the queued intent survives a reconnect; Play again re-queues with the same side; the `proto: 1` fallback hides Play online |
| `tests/unit/queue-card.test.ts` (new) | timer and estimate formatting; pips; the side radio; the low-priority countdown; Cancel present from the first render; text is escaped |
| `tests/unit/party-pick-mm.test.ts` (new) | the switch locked on the assigned side; the grid shows one side; **Bot** labels |
| `tests/unit/lobby-online.test.ts` (new) | Play online shows with `onOnline` and ≥ 1 match, hides in a dare and without a relay |

Also: `npx tsc --noEmit`, `npm run lint:sim`, `npm run vendor-sim:check` (sim bundle unchanged), `npm run budget`.

### 9.4 E2E (`pawlegends/tests/e2e/mp/`, `playwright.mp.config.ts`)

Run with the worktree's ports: `PAWLEGENDS_MP_PORT=5490 PAWLEGENDS_MP_RELAY=3160 ./node_modules/.bin/playwright test -c
playwright.mp.config.ts queue-` (5491/3161 for a second run). The real fill times are short enough (8 to 12 s) that no
harness knob is needed. A timing failure on a loaded machine is re-run alone before it counts.

| Spec | Proves |
|---|---|
| `queue-solo.spec.ts` | one tap on `play-online` shows the queue card with a running timer and `mm-cancel` within 1 s; Cancel returns to the title; a second queue fills with bots in ≤ 12 s; loading and results show **Bot** |
| `queue-coop.spec.ts` | 2 browsers (desktop + phone) tap Play online, match in ≤ 15 s on one side, the pick switch is locked, both play to a surrender, both see results and both `/live`-shaped results are accepted by the harness verdict |
| `queue-party.spec.ts` | a duo party leader taps `party-queue`, both see the queue card; a third browser queues and joins as a stranger; the stranger never sees the party code; after results the duo is still a party and the stranger sees Play again / Back |
| `queue-backfill.spec.ts` | 2 browsers matched; one leaves at about 0:30; a third queued browser gets the offer, taps Join, catches up and finishes the match |
| `queue-away.spec.ts` | a queued tab hidden for 60 s shows "Search stopped while you were away" and Search again re-queues |

### 9.5 Queue simulation (`backend/test/mm-sim.ts`, run with `npx ts-node --transpile-only`)

Poisson arrivals at 0.25, 0.5, 1, 2, 4, 6, 10, 20 and 60 per minute, 30 % duos, sides 40 % any / 35 % cat / 25 % dog,
synthetic ratings N(1450, 200), 2 hours of simulated time per rate through the real `Matchmaker`. It prints p50, p95
and max wait and the humans-per-match histogram per rate, and exits non-zero unless p50 ≤ 15 s and p95 ≤ 30.5 s at
every rate and ≥ 60 % of matches seat ≥ 2 humans at ≥ 20 per minute.

---

## 10. Done criteria (M1a)

| Measure | Target | Source |
|---|---|---|
| Queue time | p50 ≤ 15 s, p95 ≤ 30.5 s at any population; never > 30 s plus one tick | `mm-sim`, then the mm room `queueMs` |
| Humans per match | ≥ 60 % of matches with ≥ 2 humans at ≥ 20 joins per minute | `mm_humans_per_match` |
| Time from tap to in-match | ≤ 50 s p50 (queue + 30 s pick + load) | `mm_join` → `mp_match_start` |
| Old client | the live `PROTO 1` build plays and saves party matches against the new backend | `mm-proto-compat.spec.ts`, release step 2 |
| Leavers | `left` + `afk` events < 6 % of human seats in mm rooms | mm room records |
| Scoring integrity | 0 rating writes outside `/live`; 100 % of mm results verified by the referee verdict (unchanged) | `mm-no-write.spec.ts`, rooms |
| Sim | `git diff origin/main -- pawlegends/src/sim pawlegends/src/data` empty | CI |
| Budget | first-load delta ≤ 2 KB; party chunk growth ≤ 8 KB gzip | `npm run budget` |

## 11. Your call (the plan follows the default if you don't answer)

1. **Where Play online sits.** Default: a button first in the friends row from match 1, Play (solo) stays primary.
   Alternative: `PARITY.md` §3.1's mode chip on Play, Quick Play the default after match 5.
2. **Accept card.** Default: none in M1a (co-op, the pick timeout and late pilot cover an absent stranger; one tap fewer).
   Alternative: the 10 s accept card now, which M1b PvP needs anyway.
3. **Side default on the queue card.** Default: the last queue side, else Either. Alternative: the side of the hero
   selected on the title.
4. **Fill times.** Default: 8 / 20 / 30 s by pool activity (§2.4). Alternative: a flat 15 s.
5. **Leaver ladder.** Default: the light ladder (warning, +60 s, +3 min), no catnip or rating loss. Alternative: also a
   coop rating loss for the leaver at their next save.

## 12. Risks

- **Low population** is a quality risk only: bots fill every match in ≤ 30 s, so the worst case is today's solo match
  with a queue in front of it. The quiet-pool fill at 8 s keeps that queue short.
- **Single instance:** a deploy drops queues (not matches); clients re-queue on their own (§5.6). A second API instance
  needs a shared queue and is out of scope.
- **Merge with `feat/gcp-migration`:** the only shared file is `party-relay.service.ts` (one parameter, one option). If
  that branch moves room persistence off Mongo, `mm-room.schema.ts` follows the same `RoomStore`-style interface and
  moves with it.
- **Deploy skew:** covered by backend-first and the one-shot `proto: 1` fallback (§5.5).
