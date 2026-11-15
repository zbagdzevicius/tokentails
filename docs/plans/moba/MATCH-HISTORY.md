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
- Yours also shows the choice **Who can see my match history: Everyone / Friends / Only me** (default Friends).
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
| `history.privacy {visibility}` | `POST /pawlegends/history/privacy` | any |

Another player's history: their choice (default friends), and a block either way answers "no player". Own rows carry
`key` (`finalHash:ticks`) so the device finds its kept replay; others' rows never do. Per-IP buckets: 60 a minute for
reads, 20 for the choice.

## Follow-ups

- A guest's rows stay on the guest account when it signs in to another account (the guest merge does not re-key them).
- Gold over time and other timelines need per-minute samples the sim does not record; the damage graph uses the totals.
