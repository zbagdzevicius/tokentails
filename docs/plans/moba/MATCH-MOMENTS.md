# Match moments: history, replays, the Legend Moment card

Gap package 5/6 from the Wild Rift / Mobile Legends / Brawl Stars gap analysis (`~/Downloads/paw-legends/research/gaps.md`,
area "Match moments"). Every match is worth looking at again and worth sharing. No sim change (sim v26 is only read),
no backend change, no new start button, nothing with a price.

## 1. Match history

- Profile chip → Treat Track → **Match history** (`data-testid="open-history"`): the last 20 matches on this device,
  newest first. A row shows the champion's face and name, the mode and how long ago, Victory / Defeat / Draw and the
  length, K / D / A, the grade, and **Watch** when its replay is kept.
- Replays are kept for the newest 5 solo matches (party and PvP matches are listed with "Party match": their record
  needs the room log). A replay made with another sim version says "Older version" and cannot play.
- Storage: `localStorage` `tt.pawlegends.history.v1` (rows) and `tt.pawlegends.replays.v1` (records, about 5-60 KB
  each). When storage is full the oldest replays go first; the row is always saved. Code: `pawlegends/src/replay/store.ts`.
- Display only. No counter is derived from it: match-derived counters are written only inside the server's `/live`
  save. Follow-up: move the rows into the cloud progress blob once gap package P2 (rewards-cloud) has shipped it.

## 2. Replay viewer

- From the results (**Watch replay**) or from History. Its own lazy chunk (`src/replay/viewer.ts`, about 14 KB).
- The sim Worker the game already ships (`src/host/local-host.worker.ts`) takes `r:` messages and runs a `ReplayLoop`
  (`src/replay/loop.ts`), so the build carries one sim copy. Without Workers the same loop runs on the main thread.
- `ReplayCore` (`src/replay/core.ts`) re-runs the stored inputs exactly like `runReplay`: a **scout** match runs ahead,
  keeps a keyframe every 30 s (900 ticks; a deep copy that keeps class prototypes, `src/replay/clone.ts`), notes the
  player's knockouts and takedowns, and at the end checks the saved end state hash (`html[data-replay-ok]`). The
  **play** match starts from the nearest keyframe, so a seek costs at most 900 ticks of sim work.
- A device whose sim needs more than 1.5 s for one keyframe gap gets "Replays are not available on this device".
- The view is the normal `MatchSession` with a `ReplayHost` (`MatchSetup.replay`): no input reaches it, no countdown,
  the touch controls are hidden, the desktop ability bar moves up over the replay bar so its cooldowns stay readable.
- Bar: Exit, Play / Pause (Space), 1x / 2x / 4x, a seek bar (the part the scout has run is seekable; red marks are the
  player's knockouts, gold marks its takedowns; arrow keys seek 10 s), **My deaths** (jumps 5 s before the next one),
  **Free cam** (drag the map, arrow keys pan; **Follow me** returns). A seek rebuilds the view at the new tick, so
  nothing drawn before the seek lingers (fallen towers, effects).
- Replay over: Back or Watch again.

## 3. Legend Moment share card

- Results → **Share card** (in the reward strip beside Run it back, and in the column). `src/share/card.ts`.
- 1200x630 canvas in the v6 Lightning Rivalry look: rose cat side left, sky dog side right, the yellow bolt between,
  halftone corners and speed lines, Rubik italic display type. The champion's splash (a worn skin's when it loads,
  else the champion's own) on its side; the best moment as the headline (without its Fish count), else
  VICTORY! / DRAW / GOOD FIGHT; the champion and role, K / D / A, the grade, the mode and length, the player's name,
  "PAW LEGENDS · Play free at pawlegends.app". No price, no store.
- **Share** sends the picture through the system share sheet where the browser or the app allows files
  (`navigator.share`); otherwise it saves the picture and copies the link with the text. **Save image**,
  **Copy link** (the dare link after a win, else pawlegends.app; through the existing share bridge, kind `moment`).

## 4. Load-in lane and role

The "Your base: bottom left" toast (1.2 s, no new HUD element) gains one line: "Sunny Lane · marksman" on the Crossing
(the pick screen's lane hint: marksmen and mages Sunny, tanks and fighters Puddle, the rest either one), the assigned
role's lane on Hearthwood ("Yarn Road · mage", "Gutterway · support"). `src/ui/history/laneToast.ts`.

## 5. Menu text size

Settings → **Menu text size**: Normal / Large (1.15x) for Settings, the Treat Track, History, the results column and
the share sheet. The match HUD never scales. Stored per device (`tt.pawlegends.menuText.v1`, `html[data-menu-text]`).

## Analytics

`history_open`, `replay_open`, `replay_error`, `replay_seek`, `replay_again`, `replay_death_jump`, `share_card_open`,
`share_card` (`via`: share, save, link).

## Follow-ups

- Party and PvP replays: the viewer needs every human's inputs (the relay's room log) and a party replay runner.
- History in the cloud progress blob (P2), so it follows the player across devices.
- A highlight clip (video) from the replay; kill-cam style auto-jumps to multi-kills.
- Spectate a friend's live match (needs the relay to fan out snapshots).
