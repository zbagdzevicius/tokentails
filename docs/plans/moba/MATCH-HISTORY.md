# Match history (Wild Rift style)

Status: shipped (s7, Nov 15 2026). Extends MATCH-MOMENTS.md §1 (the device history and its replays).

## What the player sees

- **Profile → Match history** (the Treat Track's "Match history" pill), and **a friend's history** from Social:
  tap the friend's name, or "…" → History.
- Top: this season's numbers (matches, win rate, KDA, MVPs) and the three most played champions with their win rate.
- Filter chips: All, Ranked, PvP, vs AI (Skirmish, Classic, Co-op), Blitz, Arcade (Practice and the weekend modes).
- Rows: champion, result, mode, when, length, K / D / A, grade, MVP / SVP badge, and Watch where this device kept the
  replay (yours only). "Show older matches" pages back (15 a page, the newest 100 kept).
- Tap a row: the match. Both teams (your team first): champion, name (or the champion and a **Bot** tag), level,
  K / D / A, CS (lane last hits), Fish, Toys, grade, the MVP (best grade score on the winning team) and the SVP (best on
  the losing team). A **Damage** tab draws damage to champions and damage taken per player. **Watch replay** when this
  device kept the replay (the newest five solo matches, MATCH-MOMENTS.md).
- **Public (Nov 17, founder: "match history is fully publicly available, so toggle is redundant"):** there is no
  privacy choice; any registered player sees any player's history by code. The stored `pawlegendshistoryprefs` rows are
  ignored and no longer written; a block still answers "no player".
- Offline, signed out with no session, or an older host: the device rows show, as before.

## Data

Written ONLY by the `/live` save (`savePawlegendsMatch`, `savePawlegendsPartyMatch`), once, after the Game row exists,
from the re-sim's or the referee's **verified** per-slot stats. It never fails the save and nothing reads it for a score,
reward or counter. `backend/src/pawlegends/history/`.

| Collection | Row | Notes |
|---|---|---|
| `pawlegendsmatchhistory` | one per account per match | unique `{accountId, matchId}` (`matchId` = the solo replay digest or `party:<room>`); indexes `{accountId, _id}` and `{accountId, group, _id}`; the oldest past 100 per account are deleted on the next write |
| `pawlegendsmatchstats` | `<accountId>:<season>` | `$inc` of matches, wins, K, D, A, MVPs and `heroes.<id>.{m,w}`; counts every stored match (not only the kept 100) |
| `pawlegendshistoryprefs` | `_id` = account | `history`: everyone / friends / me |

A seat stores the hero, team, level, K / D / A, damage dealt and taken, tower damage, heal and shield, Fish, Toys, CS and
the grade. Human seats keep the account id (`u`), **never sent to a client**; names are resolved when read
(`display-name.ts`), as everywhere in social. Bots are stored and shown as bots. No IP, no email, no free text.

Solo rows are the Crossing (the replay record has no map; the re-sim plays the Crossing). Mode: the mutator (Blitz,
Practice, the weekend modes as Arcade), else Skirmish. Party rows: Ranked when the mm room was in the ranked queue
(also ranked vs AI), else PvP or Co-op; 5v5 from `config.map`.

Account deletion removes the account's rows, season rows and choice, and clears its id from other players' rows (the seat
then shows without a name).

## API (through the host bridge; the game never sees a token or a URL)

| Op | Route | Auth |
|---|---|---|
| `history.list {mode?, before?}` | `GET /pawlegends/history` | any (guests with a session) |
| `history.list {code, mode?, before?}` | `GET /pawlegends/history/u/:code` | registered |
| `history.match {match}` | `GET /pawlegends/history/match/:id` | any |
| `history.match {code, match}` | `GET /pawlegends/history/u/:code/match/:id` | registered |

Another player's history: public; a block answers "no player". `POST /pawlegends/history/privacy` remains only for older builds (accepted, ignored). Own rows carry
`key` (`finalHash:ticks`) so the device finds its kept replay; others' rows never do. Per-IP buckets: 60 a minute for
reads, 20 for the choice.

Profile screen (Nov 19): another player's first page (`GET /pawlegends/history/u/:code`, no `before`) also carries
`player` (`RankedService.publicCard`): `matches` (the account level), `ranked` (placements, tier, decayed points,
peak; `none: true` when never ranked this season), `av` (icon with its owned border `f` and title `t`) and `cc` (the
shown flag). Nothing private (no locks, rooms, shield or rewards); a failure drops `player`, never the history. The match
detail's human seats carry `code` (their player code, an opaque handle never shown: SOCIAL-RANKED.md §2.4) so a name opens that player's profile; bots never do.

## Follow-ups

- A guest's rows stay on the guest account when it signs in to another account (the guest merge does not re-key them).
- Gold over time and other timelines need per-minute samples the sim does not record; the damage graph uses the totals.

Profile screen, round 4 (Nov 19): a row in Profile → Matches opens that match inside the Profile (both teams, the
damage graph, a player's name opens their profile, Watch for a replay kept on this device), as League of Legends does.
Escape or Back returns to the list. The full history sheet stays for the Collection screen's "Match history" pill.

Matches rows, more stats (Nov 19, founder: "show more stats"): each `history.list` row also carries the owner's line,
derived at read time from the stored seats (no new write path, so every stored match has it): `lv`, `cs`, `fish`,
`dmg` (damage to champions) and `dmgTop` (the match's most, for the row's bar), `kp` (kill participation %), `score`
(team kills, ours then theirs), `toys` (Toy tiers 1..4) and `party` (allies who are the owner's friends, one friendship
read per page). A stat the match's sim did not count (0) is left out, and the client hides it (never a zero). The row
names its real queue: "Arcade" was the group word for every solo mutator match; rows now show the mutator's own name
(Toy Box, Cannon Chaos, One Lane, Duel, Boss Weekend…), and Ranked / PvP / Co-op / Skirmish with 3v3 or 5v5.
The device row (`tt.pawlegends.history.v1`, a guest's only rows) keeps the same line from the match's own per-slot
stats (`statsLine` in `src/replay/store.ts`, the same rule as `rowStats`; no `party`) and the mutator, so a guest's
Toy Box match reads "Toy Box" with its stats too. Display only, on the device; rows saved before show no stats.
