# Leaderboards window

Founder, Nov 20: "update leaderboard to show: top by Account Level (global), top in my country, Cats VS Dogs total
wins visual cool representation, Top Ranked."

The Boards window (`pawlegends/src/social/boardsModal.ts`, opened from Home's left Boards button) has four tabs. The
last tab used is remembered on the device (`pl.boards.tab`); Level is the default. `leaderboard_open {source, tab}`
fires when it opens, `board_view {kind}` per tab.

| Tab | Route (`board.get` kind) | Source of truth | Who is on it |
|---|---|---|---|
| Level | `GET /pawlegends/boards/level[/me]?page=` | `pawlegendslevels` (`_id` account, `m` matches, `at` when `m` last grew), derived from `User.pawlegendsMatches` | registered accounts; not guests, deleted, `boardExcludedAt`, or a `board_exclude`/`pvp_ban` sanction in force |
| Country | `GET /pawlegends/boards/country/me?page=` (token) | the same rows, kept to accounts whose flag shows the caller's country | as Level, and only players who show their flag; a caller who hid theirs, or whose country is unknown, gets `local` and no rows |
| Cats vs Dogs | `GET /pawlegends/boards/sides[/me]` | `pawlegendssidewins` counters: `all`, `season:<id>`, `week:<isoWeek>` | every counted match once |
| Ranked | `GET /pawlegends/boards/global[/me]?page=` | the season's ranked ladder (`RankedService`, unchanged) | placed ranked players, top 100 |

Level and Country: the top 100, 20 a page, ordered by finished matches (the account level is `levelOf(m)`), then the
earliest to reach that count, then id. My row is marked `me` on the page, else returned as `me` (Level: the exact rank;
Country: below its top 100 it is `over`, shown as "100+"). Public answers are cached 60 s per key.

## Writes

Nothing a client sends lands in these collections. `backend/src/pawlegends/leaderboard/leaderboard-live.ts` is the one
write path, called from the existing `/live` save only:

- `applyLevelSync(account)`: right after `$inc pawlegendsMatches` in `savePawlegendsMatch` and
  `savePawlegendsPartyMatch`. It re-reads the count from the user (never counts on its own), only raises `m`, and
  removes the row of a guest, a deleted or an excluded account. Account deletion also deletes the row
  (`social-purge.ts`).
- `applyMatchSides(row)`: from the match history's `record`, once per freshly stored row. The winning team's champions
  by species decide the side (majority; a tie goes to the team's first seat, like the scoreboard's team name). It
  inserts a guard row `pawlegendssidematches/{_id: matchId}` first, so a match counts once however many of its humans
  save it. Practice, draws and `abandoned` matches never count.

## Backfill (one time, automatic)

`LeaderboardService.backfill` starts about 60 s after the backend boots. It needs no command:

1. Level: every registered, not deleted, not excluded user with `pawlegendsMatches`, in `_id` order, 500 at a time,
   `$max m` (it never lowers a row) with `$setOnInsert at = lastPlayedAt`.
2. Cats vs Dogs: every stored history row in `_id` order through the same guard as a live save, so a match already
   counted live is skipped. History keeps the newest 100 rows per account, so matches older than that are not in the
   all-time total.

Each part takes a lock row (`backfill:levels:v1`, `backfill:sides:v1` in `pawlegendssidewins`) and marks it `done`.
A finished part is skipped on every later boot; a crashed run's lock lapses after 30 minutes and the next boot finishes
it. Running it twice, or on several instances at once, cannot double count. To run it again from scratch, delete the
`backfill:*:v1` rows (the counters stay correct because of the guard rows).
