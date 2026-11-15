# Paw Legends: automatic highlights

Founder ask (verbatim): "...also recordings should identify not just full recording but best moments / teamfights /
funny etc". Read against origin/main bc5a297a. No sim change (src/sim/** is read only), no backend change, no new start
button, nothing with a price. Code: `pawlegends/src/replay/highlights/` (rules, probe, detector, titles), the scan
(`src/replay/scan.ts`), the results strip (`src/replay/strip.ts`), the viewer (`src/replay/viewer.ts`) and the
montage recorder (`src/share/clip.ts startMontage`). Tests: `tests/unit/highlights.test.ts`,
`tests/e2e/highlights.spec.ts`, golden fixture `tests/fixtures/highlights/golden.json`.

## As built (Nov 15, 2026)

Shipped as specified below, with these differences:

- **Top 3 fill-in.** `top` keeps the rule "at most 1 highlight without the player" while the player has 2 of its own;
  a match the player spent away from the fights still shows 3 cards (the rest of the best fills in), so the strip is
  never a lone card.
- **Funny moments never merge into epic ones.** The merge (§2.5 rule 2) runs within each family (funny / not funny),
  so a funny moment inside a fight stays its own highlight and can still be the Funniest.
- **Camera keys every 3 s** (`KEY_EVERY = 90`), positions in 100 mm units; `follow` highlights carry their hero's
  keys too (the director interpolates them; the player's own hero keeps the normal camera). A reel is 4.5-5.5 KB, not
  ≤ 3 KB (12 highlights with keys); only the 5 kept replays carry one, so ≤ ~28 KB of localStorage.
- **Bots in titles.** A bot's funny moment has its own "Bot ..." title (`Bot vs tower: tower wins`, `Bot lost to a
  minion`); persona names shorten to the first name in subs (`Muffin (bot)`); every solo sub ends `vs bots`.
- **Clutch via Nine Lives** gets its own titles (`Nine Lives, used one`), never an "Escaped on 32% HP".
- **Emote spam**: the rule exists (`DetectorMeta.emotes`), the MatchSession emote log is not built yet (follow-up),
  so it stays silent in shipped matches.
- **Montage**: the first segment is cued before the recorder starts (the opening card runs straight into it); later
  cuts pause the recorder while the view rebuilds. The Montage button sits in the strip's header (always visible).
- **Viewer**: a cached reel spares the Worker the detector; without one the viewer's scout computes it and caches it
  on the history row. Tapping a results card opens the viewer straight on that highlight (the scout runs to it on
  load), plays it with the director, then the end card (Clip it · Next highlight · Watch full match).
- **Live check fixes (Nov 15, detector 2)**: a teamfight is titled by its biggest moment, a triple or more, then an
  ace, then a double (an ace was shown as "Double Pounce"); a results card's highlight that runs to the match's end
  keeps its end card (Clip it · Next highlight · Watch full match) instead of "Replay over".
- **Legend Moment card**: its headline and its video clip use `reel.top[0]` when the reel is cached; else the
  announcer's best moment and `momentTick` as before.
- Measured (Node, M-series): a full 3v3 scan ≈ 1.0-1.1 s for 11-12k ticks; a 25k-tick Hearthwood match ≈ 10.5 s, so
  long Classic matches can pass the 15 s strip cap on slow phones (the strip falls back, a late reel still fills it,
  and the viewer computes it on its own).



## 0. What exists today (reuse, do not rebuild)

| Piece | File | Reuse |
|---|---|---|
| Re-run of a stored solo record, scout + keyframes, runs in the sim Worker | `src/replay/core.ts`, `src/replay/loop.ts` (`r:` messages) | The detector rides the scout: it already sees **every** event of the raw match (`m.events`, not fog-filtered) |
| Takedown/death ticks of the player | `ReplayInfo.deaths/takedowns` | Kept; highlights are a new field next to them |
| Best clip window = most player takedowns in 15 s | `share/clip.ts momentTick` | Becomes the fallback when the scan fails |
| MediaRecorder clip, frame tap, banner, vertical/wide | `share/clip.ts startClip/drawClipFrame/openClipSheet` | One-tap highlight clip and montage reuse it |
| Camera hold at a point | `session.view.peekHold(x, z)` (viewer free cam) | The highlight "director" camera |
| Moment names and Ace rule | `render/announcer.ts` (`MULTI_NAMES`, `STREAK_NAMES`, `isAce`, `WINDOW.multikill` = 240) | Same words in titles, so the announcer and the highlight agree |
| History row + 5 kept replays | `src/replay/store.ts` (`HistoryEntry.best`) | Stores the computed reel per row |

Events available in the record re-run (sim `SimEvent`): `hit` (src, dst, amount, kind basic/ability/tower/zone/chip),
`cast` (slot 0-3, 4 = Paw Trick), `windup`, `death` (id, killer = `lastHitBy`, may be a minion/tower/camp id or -1),
`tower`, `objective` (kind, team, last-hit slot), `objectiveSpawn`, `buffSteal`, `firstBlood`, `shutdown`, `bounty`,
`comeback`, `buff` (nineLives, zoomies...), `pickup`, `clip` (flop, bigdog, scream, frozen, zzz, footlong, dots,
lullaby, zigzag, fetch, ko), cannon events (`cannonPick{steal}`, `cannonDrop{why}`, `cannonFizzle`, `cannonFire`,
`kaboom`, `cannonParry`, `cannonWhiff`, `cannonBlock`), `boing`, `yarnKick`, `yarnStrike{n}`, `bossPhase`, `sunset`,
`suddenDeath`, `ping` (slot 0). Commands (the record) add slot 0's `Nap`, `Trick`, `Ping`, `Forfeit`.
**Not in the record: emotes** (render only) and party/PvP inputs (no replay kept).

## 1. Architecture

```
Worker (sim already loaded)                      Main thread
ReplayCore.scout ──per tick──► HighlightDetector  ──r:hl──►  results strip / viewer chips / clip / montage
   events (raw m.events)       (pure, no DOM)                 HistoryEntry.highlights (cache)
   probe (5-tick samples)
```

- `src/replay/highlights/probe.ts`: the **only** file that reads sim internals. `probe(m): HeroSample[]` for hero ids
  `0..SLOT_COUNT-1`: `{x, y, hp, maxHp, alive, state}` plus `kindOf(id)` ('hero' | 'minion' | 'tower' | 'core' |
  'camp' | 'pudding' | 'boss' | 'other') and `towers(): {id, team, x, y, alive}[]` (read once per sample). It reads
  `m.world` arrays (`x, y, hp, maxHp, alive, kind, team, state`) the same way core.ts already reads `m.events`. A unit
  test pins it against `snapshot(m, team)` for one tick so a world-layout change fails loudly instead of silently.
- `src/replay/highlights/detect.ts`: `class HighlightDetector { constructor(meta); feed(tick, events, probe?); finish(result): HighlightReel }`.
  Pure: no clock, no randomness, no DOM. `probe` is passed every `SAMPLE = 5` ticks (6 Hz), events every tick. Same
  record ⇒ same reel (determinism is a test).
- `src/replay/highlights/rules.ts`: thresholds (§2 table) as frozen constants; `titles.ts`: title/sub templates (§3).
- `ReplayCore`: optional `detector` field; `scoutFor` feeds it (one extra loop over the events it already walks, one
  probe every 5 ticks). On `info.done` it calls `finish` and exposes `core.reel`.
- `ReplayLoop`: new client msg `{t:'r:scan', record}` = load + scout to the end **without keyframes** (a `scanOnly`
  flag skips `deepClone`) in 24 ms slices, posting `{t:'r:hl', key, reel}` once; the viewer path posts the same `r:hl`
  when its scout finishes. `isReplayClientMsg/isReplayHostMsg` learn the two types.
- Cache: `HistoryEntry.highlights?: HighlightReel` (compact, ≤ 3 KB, written by `store.ts saveReel(id, reel)`). A
  cached reel is valid when `reel.detector === DETECTOR_V && reel.key === record key` (`seed:finalHash:ticks`).
  Bump `DETECTOR_V` whenever a rule changes. Display only, never posted (same rule as history).

## 2. Detection rules

Units: ticks (30/s), mm. `S = SLOT_COUNT` (6 Crossing, 10 Hearthwood); `side(id)` = `teamOfSlot`. "Hero damage" = a
`hit` with `src` and `dst` both hero ids of opposite teams. `me` = `HUMAN_SLOT`. Every highlight gets
`start = trigger - preRoll`, `end = last event + postRoll` (defaults pre 3 s / post 2 s), clamped to `[0, ticks]`.

### 2.1 Epic / fights

| Type | Trigger | Window | Base score |
|---|---|---|---|
| `multikill` | Same killer hero, hero deaths each ≤ 240 ticks after the previous (= `WINDOW.multikill`) | first kill − 4 s → last + 2 s | 2: 40 · 3: 70 · 4: 85 · 5: 100 |
| `ace` | A hero death after which every hero of the victim's team is `alive = 0` (probe; same rule as `isAce`) | last 8 s before it → +2 s | 75 if `me`'s team aced, 45 if we were aced |
| `teamfight` | See 2.2 | open − 2 s → close + 2 s | 30 + 10·kills + 15 if a wipe + 10 if `me` engaged + 10 if `me`'s team won; cap 95 |
| `shutdown` | sim `shutdown` with killer ≥ 0 | −5 s / +2 s | 45 + bounty `value`/50, cap 65 |
| `firstBlood` | sim `firstBlood` | −5 s / +2 s | 25 |
| `kaboom` | sim `kaboom` (one-shot by the Kibble Cannon) | `cannonFire` −2 s → +2 s | 55 |
| `strike` | `yarnStrike` n ≥ 3 | kick −2 s → +2 s | 40 + 10·n, cap 80 |
| `bossDown` | Boss Weekend: result.reason `goal` and the boss hero dies | last 10 s | 80 |
| `finale` | The core falls or `timeUp` (the last 12 s) | last 12 s | 30 (fallback only) |

### 2.2 Teamfight

- Every 15 ticks: `engaged(h)` = hero `h` dealt or took hero damage in the last 90 ticks and is alive.
- A fight **opens** when engaged heroes within `R = 12,000 mm` of their centroid number `≥ N` with `≥ 2` per side
  (`N = 4` on 3 a side, `6` on 5 a side; Duel 1v1 never has teamfights).
- It **continues** while `≥ N − 1` engaged heroes stay within `R + 3,000` of the moving centroid; it **closes** after
  120 ticks with no hero damage between participants, or when one side has no engaged hero left.
- Keep it when duration ≥ 90 ticks **and** (≥ 1 hero death **or** total hero damage ≥ 30% of the participants'
  summed maxHp). Record participants, kills per side, damage per side, wipe flag.
- Winner: more kills; tie ⇒ more damage dealt if ahead by ≥ 15%; else "even trade".
- Camera: `frame` keypoints = centroid + radius (max participant distance + 2 m, min 8 m) once per second.

### 2.3 Clutch, steals, dives, comebacks

| Type | Trigger | Base score |
|---|---|---|
| `clutch` | A hero's HP ≤ 15% maxHp (probe) while it took hero damage in the last 60 ticks and an enemy hero is within 8 m, and it is still alive 150 ticks later. One per hero per 20 s. Also: a `buff nineLives` event on a hero. | 45; +20 at ≤ 5%; +15 if it took a hero down in the window ("Outplay"); +10 if escaped by `boing` or Paw Trick |
| `steal` | `objective` event whose last-hit team dealt < 40% of the hit damage on that objective in the last 150 ticks (hits whose `dst` probes as `camp`/`pudding`/grizzlechop). `buffSteal` events. `cannonPick` with `steal: true`. | objective 70 · buff 35 · cannon 30 |
| `dive` | A hero death where the victim stood within `TOWERS.*.range` (7,000 mm, read from `data/towers.ts`) of an alive tower of the victim's team, and the killer is alive 90 ticks later | 50; if the killer dies to that tower within 90 ticks the type becomes funny `diveFail` (§2.4) |
| `comeback` | The winning team trailed by ≥ 3 takedowns, or by ≥ 1 tower, at some sample. The highlight is the event that flipped the lead (the kill or tower that made it ≥ 0 for the winner for good); a teamfight containing it absorbs it (tag `comeback`). Sim `comeback` (underdog waves) only adds the tag. | 60 if `me`'s team, 35 otherwise |

### 2.4 Funny (own `funny` score 0-100; ranked separately for the "Funniest" slot)

| Type | Trigger | Funny score |
|---|---|---|
| `minionDeath` | Hero death where `kindOf(killer)` = minion | 60 (+15 if the hero had ≥ 50% HP 6 s before) |
| `towerDeath` | killer = tower, and no enemy hero within 10 m | 40 |
| `campDeath` | killer = camp (the rats, Grizzlechop) | 55 |
| `diveFail` | §2.3 dive where the diver dies to the tower within 90 ticks | 55 |
| `wallPounce` | `cast` slot 4 by a hero whose trick is `pounce` (picks/tricks known from `fillPicks`), aim point ≥ 3 m away, but the hero moved < 1,600 mm (40% of the 4 m blink) between the probe before and the next probe | 40, +20 if it dies within 90 ticks |
| `boing` | ≥ 2 `boing` by the same hero within 180 ticks ("boing chain"), or a `boing` that lands within 6 m of ≥ 2 enemy heroes and the hero dies within 90 ticks ("boinged to doom") | chain 35 · doom 60 (a plain single boing is never a highlight) |
| `returnToSender` | `cannonParry` followed by `kaboom` whose `dst` is the original shooter | 75 (also an epic, score 60) |
| `fumble` | `cannonDrop why: 'fumble'`, or `cannonFizzle` while carried, or `cannonWhiff` | 35 / 25 / 20 |
| `ultOnMinion` | A `cast` slot 3 (R) whose hits in the next 45 ticks land only on minions/camps | 45 |
| `overkill` | One `hit` with amount ≥ 5× the target hero's HP at the last probe and that HP ≤ 5% | 35 |
| `napFail` | Hero `state` 'napping' at one probe and dead within 90 ticks (any hero; slot 0 also via the `Nap` command) | 45 |
| `clipKind` | sim `clip` events (the sim's own viral markers): `ko` 50, `flop` 45, `bigdog` 40, `frozen` 35, others 30 | as listed |
| `botBlunder` | Any of the above where the actor is a bot, plus: a bot dying alone to ≥ 3 enemy heroes it walked into (no ally within 10 m) | +0 (bot), title says "Bot" |
| `pingSpam` | ≥ 4 slot-0 `Ping` commands in 300 ticks (the sim gap is 45 ticks, so 4 is the realistic burst) | 25 |
| `emoteSpam` | Not in the record. Optional sidecar: MatchSession logs emote ticks (max 20) into `HistoryEntry.notes.emotes` at match end; ≥ 3 in 150 ticks ⇒ 25. Without the sidecar the rule is silent. | 25 |

### 2.5 Ranking, merging, picking

1. `final = base + mine + rarity + late`, cap 100: `mine` +20 if `me` is the actor, +10 if involved (participant or
   victim), 0 otherwise. `rarity` +10 for the first highlight of its type in the match. `late` +5 in the last 60 s.
2. Merge: two highlights whose windows overlap > 50% become one: the higher-scoring type wins, the other becomes a
   tag (a teamfight with a triple inside is `teamfight` titled by the triple, tags `['multikill:3']`); the window
   is the union capped at 20 s; score = max + 5 per absorbed tag (cap 100).
3. Lengths: every window clamped to 6-20 s (expand around `peak` when short, cut the lead when long).
4. `list`: the best 12 by `final`, chronological. `top`: the 3 best by `final` where at most 1 has `mine = none`
   (the reel is about the player). `funniest`: best `funny ≥ 30` not already in `top` (may be a bot or enemy moment).
   `montage`: 3-5 ids from `top` + `funniest` + next best, chronological, total 20-30 s, each trimmed to ≤ 8 s around
   `peak`; fewer than 3 highlights ⇒ no montage.
5. Enemy-only visibility: the viewer draws the player's team's view (fog). A highlight with `mine = none` whose actor
   is on the enemy team is kept only when it is visible to team 0 in ≥ 60% of 1 Hz checks
   (`snapshot(m, 0).entities` contains the actor), else dropped.

## 3. Titles (witty, honest, ≤ 28 characters)

- The clip banner cuts titles at 28 chars (`drawClipFrame`), so every template fits; the sub line ≤ 40.
- Choice is deterministic: `variants[(seed + start) % variants.length]`.
- Bots: in solo matches every other hero is a bot. Names in subs carry "(bot)" for bot slots; the montage end card and
  the clip sub end with "vs bots" in solo/co-op-vs-bots matches. A title never implies a human opponent ("outplayed
  3 players" is banned; "3 heroes" is fine). `botBlunder` titles start with "Bot ".
- Examples (the builder writes 3-5 variants each in `titles.ts`):

| Type | Titles | Sub |
|---|---|---|
| multikill | the announcer words: "Double Pounce", "Triple Pounce", "Cat-astrophe", 5: "PAWNTA KILL" | "Clem · 3 down in 6 s" |
| teamfight | "Brawl at the river", "3-1 for the cats", "Even trade, nobody happy" | "6 heroes · 14 s · Purrhaven win" |
| clutch | "Escaped on 4 HP", "Not today", "Nine Lives, used one" | "Clem · 3% HP · vs bots" |
| steal | "Stolen Pudding!", "Mine now", "Yoink" | "Last hit by Clem" |
| dive | "Tower dive", "Under their tower" | "Clem dove · survived" |
| comeback | "The comeback", "Down 3, still won" | "From 2-5 to Victory" |
| minionDeath | "Taken down by a minion", "Minion's revenge" | "Sage (bot) · it was a small one" |
| wallPounce | "Pounced into a wall", "The wall won" | "Clem" |
| boing | "Boing boing boing", "Boinged to doom" | |
| returnToSender | "Return to sender!" | |
| ultOnMinion | "Ult on a minion", "Worth it?" | |
| napFail | "Nap interrupted. Forever." | |
| botBlunder | "Bot vs tower: tower wins", "Bot took a wrong turn" | "Rex (bot)" |

## 4. Data

```ts
export const DETECTOR_V = 1;
export type HighlightType = 'multikill' | 'ace' | 'teamfight' | 'shutdown' | 'firstBlood' | 'kaboom' | 'strike'
  | 'bossDown' | 'finale' | 'clutch' | 'steal' | 'dive' | 'comeback' | 'minionDeath' | 'towerDeath' | 'campDeath'
  | 'diveFail' | 'wallPounce' | 'boing' | 'returnToSender' | 'fumble' | 'ultOnMinion' | 'overkill' | 'napFail'
  | 'clipKind' | 'botBlunder' | 'pingSpam' | 'emoteSpam';
export type HighlightCategory = 'epic' | 'teamfight' | 'clutch' | 'objective' | 'funny' | 'story';
export type HighlightCam =
  | { mode: 'follow'; slot: number }
  | { mode: 'frame'; keys: [tick: number, x: number, y: number, r: number][] }; // ≤ 21 keys, 1 Hz
export interface Highlight {
  id: string;              // `${type}:${start}`
  type: HighlightType; category: HighlightCategory;
  start: number; end: number; peak: number;   // ticks
  score: number; funny: number;               // 0..100
  title: string; sub: string;
  actors: number[]; victims: number[];        // hero slots
  side: 0 | 1 | -1;                           // team credited (-1 none)
  mine: 'actor' | 'involved' | 'none';
  bots: boolean;                              // an actor is a bot
  cam: HighlightCam;
  tags: string[];
}
export interface HighlightReel {
  v: 1; detector: number; simVersion: number; key: string;
  list: Highlight[];        // ≤ 12, chronological
  top: string[];            // ≤ 3 ids
  funniest: string | null;
  montage: string[];        // 3-5 ids or []
}
```

Camera rule: single-actor types `follow` the actor (the player's own when `mine = actor`); `teamfight`, `ace`,
`steal`, `strike`, `kaboom` use `frame`. The viewer's **director** interpolates `frame` keys and calls
`session.view.peekHold(x, z)` each frame (the existing free-cam hold); `follow` of a non-player slot reads that
slot's position from the play snapshot each frame (falls back to the nearest `frame` key while fogged). Zoom stays
the game's (no new camera feature in v1).

## 5. UX

### 5.1 Results screen (after every solo match with a kept replay)

- **Highlights strip** under the stats line (where "Best moment" sits; that line becomes the strip's first card):
  3 cards (`top`) + 1 **Funniest** card (rose border, laugh glyph) when `funniest` is set. A card: category icon, title,
  match time ("2:14"), length ("9 s"), up to 3 hero faces (bots get the small "BOT" tag already used in party copy).
- While the Worker scans: 3 skeleton cards with "Finding highlights…" (the scan starts at match end, typically done
  before the reward animation ends). Scan failed / too slow (> 15 s) ⇒ the strip shows the announcer's best moment
  only, as today.
- Tap a card ⇒ the replay viewer opens on that highlight (director camera, plays once, then pauses on the end card
  "Clip it · Next highlight · Watch full match").
- Each card has a small **Clip** button (hidden where `clipSupported()` is false): one tap records that highlight with
  the device's default framing (`defaultFraming`), title = highlight title, then the existing clip sheet. Long-press
  (or right-click) offers Vertical/Wide.
- **Montage** button at the strip's end ("Montage · 25 s"): records the montage (§5.3). Hidden with < 3 highlights.
- Phone landscape 844x390: the strip is one horizontal scroll row, 72 px tall cards, no layout growth in the match HUD
  (results only). Party/PvP results: no strip (no replay); the best-moment line stays.

### 5.2 Replay viewer

- Seek bar: highlight marks drawn under today's red/gold dots: a thin band from `start` to `end` coloured by category
  (gold epic, sky teamfight, bolt clutch/objective, rose funny). The marks appear as the scout finds them.
- **Highlights** button on the bar (`data-testid="replay-highlights"`) opens a chip row above the bar (one row,
  scrolls sideways, closed by default, so the phone view does not lose height). Chip tap = seek to `start` +
  director on. `N` / `Shift+N` jump to the next / previous highlight on desktop.
- **Highlights only** toggle (in the chip row): plays every highlight of `list` back to back with a 0.4 s bolt wipe,
  skipping the rest of the match (a reel preview without recording).
- The director turns off on any manual camera action (drag, Free cam, Follow me) and on seek outside the highlight.
- The Clip panel gains **"This highlight"** (preselected when the play head is inside one): records `start → end`
  instead of a fixed 10/15/20 s.
- Results' Legend Moment video clip uses `reel.top[0]` (with its camera) instead of `momentTick`; `momentTick` stays
  the fallback.

### 5.3 Clip export and montage

- Single highlight: `startClip({... seconds: clamp(round((end - start) / 30), 6, 20), title, sub})`; the viewer seeks
  to `start`, waits for the first snap, starts at 1x, stops at `end`. `clipSeconds()` accepts any integer 6-20 when
  `exact: true` (today it snaps to 10/15/20).
- Montage: new `startMontage(o: ClipOpts & { segments: {at, seconds, title, sub}[] })` in `share/clip.ts`: one
  `MediaRecorder`, for each segment: `pause(true)` → seek → wait for the snap + 2 drawn frames → `pause(false)`; each
  segment shows its own banner for 1.6 s; between segments a 0.35 s v6 bolt wipe is drawn into the output canvas
  (drawn by a timer while the recorder runs, so the cut is in the video, not a gap). Opening card 1 s ("MATCH
  MONTAGE" + champion), end card 1.5 s (outcome, K/D/A, "vs bots" where true, the PAW LEGENDS mark). A seek while a
  montage records belongs to the montage and does not cancel it (today a seek cancels a clip: gate that on a
  `montage` flag). Total 20-30 s, ~10-12 MB at the current bitrates.
- File names: `paw-legends-highlight-YYYYMMDD.mp4`, `paw-legends-montage-YYYYMMDD.mp4`.
- Share text: `"{title} with {hero} in Paw Legends!"` (existing `clipShareText`), montage: `"My Paw Legends match
  montage with {hero}!"`.

## 6. Edge cases

- **Party / PvP**: no replay ⇒ no highlights (unchanged; follow-up with party replays).
- **Practice** (`mutator: 'practice'`): no highlights (dummies; `Practice` resets).
- **Duel** (1v1): no teamfight/ace (an ace of 1 is a kill); `bossDown`/`goal` handled. **Boss Weekend**: the boss is a
  hero id (`bossPhase`); its phases add tags, not highlights. **Blitz/rapid**: short matches are fine; under 60 s of
  play ⇒ only `finale`.
- **Forfeit** (`reason 'forfeit'`): reel computed normally; no `finale`.
- **Other sim version**: `replayable()` already refuses; a cached reel from an older detector is recomputed.
- **Slow devices** (`info.slow`): scan still runs (no keyframes, so cheaper), capped at 15 s wall time; past that,
  the strip falls back and the viewer computes the reel lazily as its scout runs.
- **Storage full**: the reel is written after the row; if it fails, it is recomputed next time (never blocks history).
- **Hash mismatch** (`info.ok === false`): highlights still shown, the existing "may differ" state applies.
- **Fog**: §2.5 rule 5; the director follows keys, never reveals what the replay view hides (enemies stay fogged).
- **Deaths at tick 0-preRoll / at the end**: windows clamp to `[0, ticks]`; a clip cannot pass the replay's end.
- **Recorder unsupported** (`clipSupported() === false`): cards still open the viewer; Clip and Montage hidden.
- **Hearthwood ids**: use `SLOT_COUNT`/`teamOfSlot` (the announcer's hardcoded 6-slot arrays must not be copied).
- **Hidden tab during a montage**: the clip's 250 ms timer already ends a clip; a montage pauses its recorder on
  `visibilitychange` and resumes on return.

## 7. Budgets and perf

- Detector + probe ≈ 6-9 KB min, inside the Worker chunk (not first-load JS). Results strip ≈ 2 KB in the results
  code; montage code inside the lazy `share/clip.ts` chunk. `npm run budget` must stay under 10 MB / 450 KB.
- Scan cost: one sim run of the match without keyframes; the detector adds < 10% (hero loops at 6 Hz, events per tick).
  Measure with the 2,000-seed headless runner: p95 scan < 4 s on an iPhone 12-class device for a 10-minute match.
- Memory: rolling buffers only (90-tick hit window per hero, 300-tick objective hit window); the reel ≤ 3 KB.

## 8. Test plan (all built: unit 37 tests, e2e 2 specs on desktop 1440x900 and landscape 844x390)

Unit (vitest, `src/replay/highlights/*.test.ts`), scripted event streams like `announcer.test.ts`:
1. Each rule in §2 fires on a minimal script and not on a near miss (e.g. kills 241 ticks apart are two kills; a
   1,700 mm pounce is not a wall pounce; a teamfight with 3 heroes on 3v3 does not open).
2. Teamfight open/continue/close, winner and even trade; Hearthwood thresholds (N = 6).
3. Merge: a triple inside a teamfight becomes one highlight with a tag; windows clamp to 6-20 s.
4. Picking: `top` has ≤ 1 `mine = none`; `funniest` never duplicates `top`; montage 20-30 s, chronological, ≥ 3 or none.
5. Titles ≤ 28 chars and subs ≤ 40 for every template and every hero name in the roster; bot slots get "(bot)";
   solo subs end "vs bots"; no template contains "player".
6. Determinism: run 20 seeds headless (bots-only records from the existing match runner) twice ⇒ identical reels;
   a golden fixture record ⇒ a pinned reel snapshot.
7. `probe.ts` agrees with `snapshot(m, team)` hero x/y/hp on a sample tick (guards against world layout changes).
8. Store: reel cache hit/miss on `DETECTOR_V` and key; full storage keeps the row.
9. `clipSeconds` exact mode; montage segment planner (pure) trims around `peak`.

Integration / e2e (Playwright, desktop 1440x900 and landscape 844x390, one `userDataDir` deleted in `finally`):
10. Play a short seeded solo match (the e2e fast path) ⇒ results show 3 skeletons then cards; `html[data-hl-count]`.
11. Tap card 1 ⇒ viewer opens at its start, director on (`html[data-replay-cam="director"]`), plays to the end card.
12. Highlights chip row opens/closes without changing the bar height on 844x390; `N` jumps.
13. Card Clip ⇒ clip sheet with a 6-20 s video (Chromium WebM); Montage ⇒ 20-30 s video; seek inside a montage does
    not cancel it.
14. Party result ⇒ no strip; Practice ⇒ no strip; unsupported recorder (stub `MediaRecorder` away) ⇒ no Clip buttons.
15. Screenshots to `~/Downloads/paw-legends/modes-highlights/highlights/` (results strip, chip row, end card, montage
    first frame) on both viewports.

Analytics (existing tracker): `hl_scan` (ms, count, ok), `hl_open` (type, from: results|viewer), `hl_clip` (type,
framing, seconds), `hl_montage` (segments, seconds), `hl_only` (on).

## Follow-ups

- The MatchSession emote log (`HistoryEntry.notes.emotes`) so `emoteSpam` can fire.
- Party / PvP highlights once party replays exist (MATCH-MOMENTS.md follow-up).
- A p95 scan-time measurement on an iPhone 12-class device (the 2,000-seed headless runner), and a lighter probe for
  10-minute Hearthwood matches if it passes 4 s.
- The director could read a followed hero's exact spot from the play snapshot (today it interpolates 3 s keys).
