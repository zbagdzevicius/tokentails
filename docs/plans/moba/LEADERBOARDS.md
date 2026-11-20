# Leaderboards window

Founder, Nov 20: "update leaderboard to show: top by Account Level (global), top in my country, Cats VS Dogs total
wins visual cool representation, Top Ranked." Then: "fix leaderboard by level. e.g.. my level ( Zygis ) is 8 and tier
2, but it shows LV 4. Irvidas lvl 8. Angelinnaa is not displayed at all. go fix it also let's show "Global". The idea
for Country to see which country is #1 OR what's my # in my country ( similar UX as in cats vs dogs in terms of tabs ).
also fix data inconsistencies if such exists".

The Boards window (`pawlegends/src/social/boardsModal.ts`, opened from Home's left Boards button) has four tabs. The
last tab used is remembered on the device (`pl.boards.tab`); Global is the default. `leaderboard_open {source, tab}`
fires when it opens, `board_view {kind}` per tab (and `countries` / `country` when the Country view switches).

| Tab | Route (`board.get` kind) | Source of truth | Who is on it |
|---|---|---|---|
| Global (`level`) | `GET /pawlegends/boards/level[/me]?page=` | `pawlegendslevels` (`_id` account, `m` the account level's matches, `at` when `m` last grew) | registered accounts; not guests, deleted, `boardExcludedAt`, or a `board_exclude`/`pvp_ban` sanction in force |
| Country: Top countries | `GET /pawlegends/boards/country/me` (token), `countries` | the same rows, by each row's shown flag | every country with at least one player on Global who shows its flag |
| Country: My country | the same answer, `rows`/`me` (`?page=`) | the same rows, kept to accounts whose flag shows the caller's country | as Global, and only players who show their flag; a caller who hid theirs, or whose country is unknown, gets `local` and no rows |
| Cats vs Dogs | `GET /pawlegends/boards/sides[/me]` | `pawlegendssidewins` counters: `all`, `season:<id>`, `week:<isoWeek>` | every counted match once |
| Ranked | `GET /pawlegends/boards/global[/me]?page=` | the season's ranked ladder (`RankedService`, unchanged) | placed ranked players, top 100 |

Global and My country: the top 100, 20 a page, ordered by the account level's matches (the level is `levelOf(m)`),
then the earliest to reach that count, then id. My row is marked `me` on the page, else returned as `me` with my exact
rank (My country: exact for any country with up to 20,000 shown flags; only a bigger one answers `over`, "100+").
Public answers are cached 60 s per key.

Top countries: a country's score is the **sum of the account levels** of its players on the Global board who show its
flag (ties: more players, then the country code). It rewards both many players and high levels, uses the same level
the Global board shows, and needs no new counters. The first 50 are listed with the #1 country named over the list
("Lithuania is #1"); my country is marked, or pinned under the list when it is lower. One `country/me` answer carries
both views, so the switch between them makes no call (the view is remembered in `pl.boards.country`; Top countries by
default). Signed out, the Country tab asks to sign in (the host sends `country` with the account's token only).

## The account level: one source

`backend/src/pawlegends/account-level.ts` is the only place the account level is computed:

    accountMatches = saved matches (User.pawlegendsMatches, raised only by a verified /live save)
                   + the legacy credit (User.pawlegendsLegacyMatches, frozen once, at most 200)
    level = levelOf(accountMatches)

Every reader uses it: the Global and Country boards, another player's Profile card (`/ranked/player/:id`), the
caller's own Ranked card and gate (`/ranked/me`, `mm.join ranked`), the friends list's ranked flag, the matchmaker's
newbie lock, and the progress view (`GET/POST /pawlegends/progress` answers `account: {matches, level}`). The game
shows that number for a signed-in player on Home's chip, in Profile and for the mode unlocks
(`pawlegends/src/meta/accountLevel.ts shownMatches`: the server's count plus the matches this device finished since the
answer, so the level moves at once after a match and the next answer settles it). A guest sees the device count.

Why (Nov 20): the game counted the level on the device and synced that count (`blob.counts.matches`, max-merged; a
client could write up to 1,000,000), while the boards and the Ranked gate counted saved matches. The device also counts
matches the server never saves: a Leave (a forfeit, from match 4), a party draw, an unscored or host-less party room,
a replay the server rejected or turned away. So Zygis saw Lv 8 (16+ device matches) and the board showed Lv 4 (6 saved);
Irvidas Lv 8 against Lv 5 (8 saved). "Tier 2" is the Legends Pass tier (Season XP, 400 a tier), a separate number; it
was always counted from saved matches only.

The legacy credit keeps every level a player had: frozen once per account as `max(0, min(200, synced device count -
saved count))` by the repair's `legacy` part. After that only saved matches add levels, so the progress sync can no
longer raise a board. The guest merge carries the credit with the saved matches.

A player missing from Global (Angelinnaa, Nov 20) had no Level row: no saved match (every match counted only on the
device), or matches that arrived by a guest promotion or merge, which never wrote the row, while the one-time v1
backfill had already run. The credit gives the first case a count; the promotion and merge now sync the row; the v2
repair recomputes every row once; and her own board read heals her row. Still left out by design: a guest, a deleted
account, `boardExcludedAt`, or a `board_exclude`/`pvp_ban` sanction in force.

## Writes

Nothing a client sends lands in these collections. `backend/src/pawlegends/leaderboard/leaderboard-live.ts` is the one
write path:

- `applyLevelSync(account)`: right after `$inc pawlegendsMatches` in `savePawlegendsMatch` and
  `savePawlegendsPartyMatch`, after a guest is promoted in place (`user.service.ts`), and after a guest merge credits
  its matches (`guest-lifecycle.ts runGuestMerge`). It re-reads the account level's matches and sets the row exactly
  (raised with `at` = now, lowered, created), and removes the row of a guest, a deleted or an excluded account. Account
  deletion also deletes the row (`social-purge.ts`). A relay-side writer of saved matches must call it too.
- A signed-in board read (`level/me`, `country/me`) heals the caller's own row the same way before answering, so a
  sign-in, a merge or a lifted exclusion shows at once.
- `applyMatchSides(row)`: from the match history's `record`, once per freshly stored row. The winning team's champions
  by species decide the side (majority; a tie goes to the team's first seat, like the scoreboard's team name). It
  inserts a guard row `pawlegendssidematches/{_id: matchId, s: side, se: season, at}` first, so a match counts once
  however many of its humans save it. Practice, draws and `abandoned` matches never count.

The score path is unchanged: scores are written only by `POST /user/catbassadors/live` (and the party relay's
server-side writer). The legacy credit is a level field, not a score.

## Repair (versioned, automatic)

`LeaderboardService.backfill` starts about 60 s after the backend boots. It needs no command. Each part takes a lock
row in `pawlegendssidewins` and marks it `done`; a finished part is skipped on every later boot; a crashed run's lock
lapses after 30 minutes and the next boot finishes it. Every part is idempotent and safe on several instances.

1. `backfill:legacy:v1`: freezes the legacy credit (above) for each account with a progress row and no credit yet.
   Never bump this key: it would credit accounts again (an account already credited is skipped anyway).
2. `backfill:levels:v2`: every Level row recomputed exactly from the account level's matches; missing rows created,
   wrong ones raised or lowered, rows of guests, deleted, excluded or missing accounts removed. (v1 only ever raised
   rows and ran once, so a wrong or missing row stayed until that player's next saved match.)
3. `backfill:sides:v2`: a guard row per counted match of the stored history (side and season set), then every counter
   (`all`, `season:*`, `week:*`) set from the guard rows. A win lost between its guard and its counters (v1 inserted
   the guard, then incremented the counters one by one) comes back.

To recompute Global/Country or Cats vs Dogs again, bump `levels` or `sides` in `BACKFILL_KEYS`
(`leaderboard.service.ts`) and deploy.

## Known limits

- History keeps the newest 100 rows per account and started on Nov 15, so Cats vs Dogs "All time" is "since match
  history" (on Nov 20 it equals this week).
- "Your wins this season" counts the species of your own champion (champion mastery stats, including Blitz); the team
  totals count the winning team's majority species. The two can differ by design.
- A solo loss against bots counts as a win for the bots' side ("vs AI counts").
- Ranked needs account Lv 10 (25 matches) on the server and in the game alike; the Ranked board is empty until someone
  reaches it.
