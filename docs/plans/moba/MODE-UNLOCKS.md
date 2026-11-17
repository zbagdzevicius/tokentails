# Paw Legends: mode unlocking

## Nov 17: modes open by account level

Founder ask (Nov 17): "by default initially 3x3 ( skirmish ) and practise ( sandbox ) modes should be available
( unlocked ). then other modes unlocks upon reaching certain LVL ( must be progression )".

**The account level** (`pawlegends/src/meta/accountLevel.ts`, backend copy `backend/src/pawlegends/mode-unlocks.ts`,
pinned equal by `tests/unit/mode-unlocks.test.ts`) counts finished matches (bots, co-op, PvP, party; never Practice).
The count is the profile's `matches`, synced to the account and max-merged on the server (progressCloud), so it survives
a restart and a new device; a guest keeps it on the device. Home shows it on the profile chip ("Lv 4 · Tier 3").

| Level | Matches | Opens |
|---|---|---|
| 1 | 0 | Skirmish (3v3, every variant: vs Bots, Co-op, PvP, With Friends) and Practice |
| 2 | 2 | Blitz |
| 3 | 4 | Classic 5v5 (vs Bots and PvP) |
| 4 | 6 | Duel, Weekly Twist |
| 5 | 8 | One Lane Brawl, Cannon Chaos, Boss Weekend (still only inside its window) |
| 6 | 10 | Ranked (also keeps its server rule: a registered account with 10 saved matches) |
| later | 13, 16, 20, 25, 30, 36, 42, 50, then every 10 | nothing yet; a new mode with no row opens at Lv 5 |

The guided first match leaves a player at Lv 1, so the first Mode Select shows Skirmish and Practice only. A featured
mode follows its own level (it no longer opens early for its window).

**Mode Select:** big tiles are Skirmish, Classic once open, and the spotlight (rules below); a locked Classic sits in the
strip. Locked icons read "Lv N" with a ring of the matches toward it; the sheet says "Unlocks at Lv 3 (you are Lv 1:
3 more matches)." The nav Ranked item and the Ranked duo invite use the same line.

**Server check:** the relay refuses `mm.join {queue:'classic'}` unless every member has Lv 3's 4 matches on server
records (`playedFor`: saved matches, rated games, completed Quick Play rooms), with `mm_locked {reason: 'mode_level',
mode, level, have, need}`. The queue card says "5v5 Classic unlocks at Lv 3: finish 1 more match (3/4)", or "A party
member has not reached Lv 3 for 5v5 Classic yet" when this player has it, and offers Play Casual instead. Ranked keeps
its own refusal (10 saved matches = Lv 6). The other modes are played against bots on the device, so there is no
server queue to refuse.

**Nobody is locked out of what they had (grandfathering):** a mode is open when the level is reached or its
`mode.<id>` id is in the synced unlocks. Every id the Nov 14 ladder wrote stays valid (a player who unlocked Duel at
2 matches keeps it). A third first-run pass (`pawlegends.modes.v3`) adds Classic, the Weekly Twist and Boss Weekend for
a player whose history rows, kept replays or saved choice show they played them; veterans (10+ matches) have every
mode anyway. Known gap: a grandfathered Classic player with fewer than 4 server-recorded matches is still refused by
the relay's Classic PvP queue (vs Bots works).

The Nov 14 design below still holds for the layout, the NEW state, the unlock moment and the data; its match-and-win
ladder is replaced by the table above.

## Nov 14 design

Founder ask (Nov 14): "lock some game modes so that no more than 3 game modes will be displayed initially (others
will be displayed only as smaller version of icons until they'll be unlocked, as currently they're creating
confusion / frustration)". Shipped Nov 15. Code: `pawlegends/src/ui/modeSelect/unlocks.ts` (pure rules and layout),
`modeSelect.ts` (big tiles and the strip), `app/app.ts` (sync, migration, results banner). Tests:
`tests/unit/mode-unlocks.test.ts`, `tests/e2e/mode-unlocks.spec.ts`. Design and mocks:
`~/Downloads/paw-legends/modes-highlights/modes/` (layout A picked).

## What the player sees

Mode Select shows **never more than 3 big tiles**, for any player:

| Slot | Mode |
|---|---|
| 1 | Skirmish 3v3 (always) |
| 2 | Classic 5v5 (always) |
| 3 | The spotlight: the first that applies of the list below |

Spotlight order:
1. Boss Weekend inside its window, then a featured mode from live ops that is not Skirmish or Classic (a featured
   Blitz).
2. The newest mode the player unlocked at a results screen and has not played yet. It carries NEW.
3. The last mode the player chose, if it is open to them.
4. The Weekly Twist, once the player has finished 4 matches. It bends Skirmish's rules, so it waits in the strip
   before that.
5. Practice.

Every other mode is a 44 px round icon in the **More modes** strip under the tiles (56 px on desktop):
- **Open:** in colour. A tap selects it like a tile, and Next goes on down the one play path (PLAY → mode → variant
  → champion).
- **Locked:** grey art, a padlock, and a bolt ring that fills with the progress. The line under it gives the goal or
  the progress ("Finish 1 match", "1/2 matches", "Win 1 match", "4/10 matches"). A tap shakes the icon and opens a
  small sheet: what the mode is, "Unlocks: finish 2 matches (1/2).", and a progress bar. Arrow keys skip locked
  icons. Tab still reaches them, because they explain themselves.
- **Between event windows:** grey, "Next: Fri".

A new player (1 match, midweek) sees Skirmish, Classic and Practice. During Boss Weekend they see Skirmish, Classic
and Boss Weekend, and Practice moves to the strip, still open.

## Unlock ladder

| Mode | Unlocks when |
|---|---|
| Skirmish, Classic, Practice | open from the start |
| Blitz | finish 1 match (so the results' "Quick Blitz?" always lands on an open mode) |
| Duel | finish 2 matches |
| One Lane Brawl | win 1 match |
| Cannon Chaos | finish 4 matches |
| Ranked | finish 10 matches and win 3 |
| Boss Weekend, Weekly Twist, any featured mode | never locked while live |
| A mode added later with no row | finish 4 matches (it never lands big by accident) |

The counts are the profile's `matches` and `wins`. Bot, co-op, PvP and party matches count; Practice does not. All
thresholds are in `MODE_UNLOCKS` in `unlocks.ts`, so tuning one is a one-line change. The order follows MLBB (Ranked at
level 8), Wild Rift (Ranked at level 10) and Brawl Stars (Ranked at 5,000 trophies). Paw Legends has no account
level, so the ladder uses match and win counts, which already sync and only go up.

## The unlock moment

1. **Results.** After `recordMatch`, `newlyUnlocked(before, after)` returns the ladder modes this match crossed that
   are not yet in `unlocks`. Each is written to `unlocks` as `mode.<id>` (so no device announces it twice) and marked
   NEW. The first gets a gold "New mode unlocked" banner under the outcome, with its art and the `magic` sound.
2. **Home.** PLAY carries a NEW tag until Mode Select opens.
3. **Mode Select.** The mode takes the spotlight with a NEW chip, preselected. On the first open after the unlock it
   grows into the third tile from the strip and its padlock pops (no animation on low tier or with reduced motion).
4. **After one match of it**, NEW and the spotlight claim go. The tile stays big only while it is also the last mode
   chosen (spotlight rule 3), so a player who keeps playing Duel keeps Duel big.

## Ways into a locked mode

| Entry | Behaviour |
|---|---|
| A saved choice, or a `?mode=` link, names a locked mode | falls back to Skirmish (`loadModeChoice` and `resolveChoice` use the per-player list) |
| Results "Quick Blitz?" | offered only when Blitz is open |
| Home promo "Cannon Chaos" | shown only once Cannon Chaos is open |
| Nav Ranked | locked: "Ranked: Finish 10 matches and win 3 (4/10, 1/3)." |
| A featured mode that is normally locked | open and in the spotlight during its window only; playing it then does not unlock it |
| Joining a friend's party, replays, Legend Moments | not gated |
| The first match | unchanged: PLAY starts the guided match |

## Data (no backend change)

- **Unlocks** are `mode.<id>` ids in the profile's `unlocks`, which already sync and union-merge across devices. The
  ids pass the item regex `^[A-Za-z0-9._:-]{1,80}$` on the client and the server and fit the caps (client 240, server
  400; 5 ids today). Every reader of `unlocks` checks membership of cosmetic ids (Biscuit coat, free coats, track
  frames and titles, the Treat Track's owned set); none counts them, so `mode.` ids need no filter.
  `isModeUnlock()` is there for any future count.
- **NEW state** is two short comma lists in localStorage, `pawlegends.modes.new` (unlocked by a match, not played
  yet) and `pawlegends.modes.seen` (already announced in Mode Select). Both are in `SYNCED_KEYS`. Synced settings carry
  strings of up to 32 characters, which is why these are lists and not one JSON blob; every ladder id together is 32.
- **Migration flag:** `pawlegends.modes.v1` = `1`, per device.
- **Analytics:** `mode_unlock { mode, matches, wins, via: play | migrate | sync }` and
  `mode_locked_tap { mode, matches, wins }`. They show whether the ladder is too slow.

## Veterans and accounts

- **First run of this build on a device** (silent, no banner): a player with 10+ matches, or the "played MOBAs
  before" setting, gets every mode. Anyone else keeps the modes in their saved choice and their match history
  (Blitz), plus every mode whose goal they already met.
- **Kept replays** (second pass, `pawlegends.modes.v2`, once per device, also where the first pass already ran):
  history rows only name Skirmish, Classic and Blitz, so the mutator of each kept replay that ended before the ship
  (`MODE_UNLOCKS_SHIPPED`, Nov 14 23:30 UTC) keeps Duel, One Lane Brawl and Cannon Chaos open. Found in the Nov 15
  live check: a 3-match player who had played One Lane Brawl and Cannon Chaos saw both locked again. A featured mode
  played after the ship still does not unlock it.
- **Ranked card:** a signed-in player whose `ranked/me` card shows placements or a tier keeps Ranked open.
- **Every Home** writes the modes whose goal is now met (a server merge raised the counts) silently. An account with
  10+ matches and no `mode.` id at all, for example one that just signed in on a new device, played before this build
  and gets every mode. A new account gets `mode.blitz` at its first match, so this rule never fires for it later.
- Guests use the local profile. Accounts use the merged counts and the union of `unlocks`; a guest who signs in keeps
  both.

## Calls made with defaults

- **NEW leaves the spotlight after one match, but the last chosen mode keeps it.** The spec says both "drops back to
  the small row after one match" and "slot 3: the last mode the player chose". Rule 3 wins, so a mode the player keeps
  choosing stays big. Change: drop rule 3 in `layoutModes`.
- **Weekly Twist below NEW and the last choice.** Offline and on the server, a twist is live every week, so as rule 1
  it would hold slot 3 forever, a new player would never see Practice, and no unlock would ever grow into slot 3.
  It is spotlight rule 4, from 4 matches. It is always open in the strip with its countdown.
- **The registry's static NEW ribbons are dropped** (Cannon Chaos, Practice, One Lane Brawl, Duel since v27/v28).
  NEW now means new to this player.
- **The NEW state syncs as two short lists** instead of the spec's single `pawlegends.modes.v1` JSON store, because
  synced settings carry 32 characters at most.
- **Strip names are shortened** ("One Lane", "Cannon", "Boss"); the full name is in the aria-label and the sheet.

## Not done yet

- Ranked duo (gaps5): an invite sent from a Ranked party carries `mode: 'ranked'` (Social sheet → host bridge →
  `POST /pawlegends/social/invite`), and the friend's game checks its own Ranked unlock: the invite toast reads
  "Sam invites you to a Ranked duo" and, when locked, "Ranked is locked for you: Finish 10 matches and win 3 (4/10,
  1/3). Join to play Casual together". The relay still checks every member's saved matches; when the leader has them
  and the friend does not, the queue card says "Your duo partner has not unlocked Ranked yet · 4/10 matches". Party
  invites for every other mode are deliberately not gated.
- `MODE_UNLOCKS` is client-only. To tune it without a release, live ops could send it in `GET /pawlegends/config`.
- Once players have been through it for a week, read `mode_unlock` (via `play`) and `mode_locked_tap` and tune the
  ladder.
