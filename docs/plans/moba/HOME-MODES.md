# Paw Legends: Home and Mode Select

Status: built on `feat/pawlegends-home-ui` (Nov 11, 2026); the one play path on `feat/pawlegends-one-play-path`
(Nov 12, 2026, see "One play path" below). This replaces Part A of `LANDING-PICK-UX.md`, the old left-column lobby. Part A's rules still apply: the screen never scrolls, touch targets are at least 44 px, safe areas
are respected and nothing sits behind a feature flag.

The founder asked for a home screen and a mode picker on the level of Wild Rift and the League client. We borrowed
the structure and the finish. Every piece of art, every shape and all the text are our own.

## One play path (Nov 12)

The founder: "current UX on how to start a match is scattered ... there should be one path. PLAY -> SELECT MODE ->
SELECT VARIANT (VS BOTS / CO-OP / PVP / WITH FRIENDS)", and "skirmish with co-op selection is the same as Co-op vs
Bots". Wild Rift's order: PLAY, the mode, how to play it, the champion select, the match.

```
Home ── PLAY ──> Mode Select: mode ──Next──> Mode Select: variant ──> vs Bots ─────> champion select ── LOCK IN ──> match
                 (Blitz, Skirmish, Classic,   (the same overlay,    ├─ Co-op ──────> queue ── match found ──> champion select
                  Ranked locked, Cannon soon)  second stage)        ├─ PvP ────────> queue ── accept ──> champion select
                                                                    └─ With Friends > party lobby (code, invites)
```

- **PLAY** opens Mode Select on the remembered mode. The first-ever match keeps its one-tap guided start ("Play as
  Clem", the FTUE) and a dare link its direct start. Everything else goes through the path.
- **Mode stage.** A tap selects a tile; Next, a double tap or Enter on the tile goes to the variants.
- **Variant stage.** Cards for the variants the mode supports (below). One this build cannot start shows locked with
  the reason: "Needs the party server (offline right now)", "PvP is offline right now", or the PvP match lock. vs Bots
  carries the bots difficulty (Easy, Normal, Hard; "More bots after N matches" until it opens), saved to the profile
  at once. The action names the next step: "Choose champion", "Find match" or "Open party". A double tap or Enter on
  a variant goes too.
- **Champion select** (vs Bots): the existing select, with the mode line under its title ("Classic 5v5 · vs Bots") and
  the seats of the mode (5 for Classic). LOCK IN starts the match on the mode's map or mutator. Co-op and PvP have no
  select before the queue: the party flow's own select follows the match found (Wild Rift's order), so nobody picks
  twice.
- **Back and Esc** step back one stage: the champion select → the variant stage → the mode stage → Home.
- **Remembered.** The mode and variant (`pawlegends.mode.v1`) and the difficulty (the profile). Mode Select opens on
  the last choice. Home does not show it: the label above PLAY ("Skirmish 3v3 · vs Bots") looked like a button and
  read as a leftover, so it was removed (founder, Nov 12). "Run it back" on the results keeps the
  match's mode, variant and difficulty, as before.

| Mode | Variants |
|---|---|
| Skirmish 3v3 | vs Bots, Co-op, PvP, With Friends |
| Classic 5v5 | vs Bots, PvP (the matchmaker's co-op queue and friend parties are 3v3; PROTO 4's `classic` queue is PvP) |
| Blitz | vs Bots (party and PvP later) |
| Ranked | always open (round 4, SOCIAL-RANKED.md §7.11): live with "3 searching · Prime Time now" from `ranked/status` (nothing guessed before it answers) |
| Cannon Chaos | vs Bots (sim v27, V27.md §3) |
| Practice | the one card "Solo with training dummies", no difficulty (sim v27, V27.md §2) |
| Weekly Twist | vs Bots; a timed event tile from live ops, the week's featured mode (sim v27, V27.md §4) |
| One Lane Brawl | vs Bots (sim v28, V28.md §2) |
| Duel | vs Bots, 1v1 (sim v28, V28.md §3) |
| Boss Weekend | vs Bots (co-op against the boss); a timed event tile, Friday to Monday UTC (sim v28, V28.md §4) |

The separate "Co-op vs Bots" tile is gone: it was Skirmish's Co-op. A saved `{ mode: 'coop' }` loads as Skirmish,
Co-op.

**Removed entry points** (each started a match, a queue or a party outside the path):

| Was | Now |
|---|---|
| The quick Co-op button beside PLAY (`play-online`) | PLAY → Skirmish → Co-op |
| The quick PvP button beside PLAY (`play-pvp`) | PLAY → Skirmish (or Classic) → PvP |
| The mode pill as a button that opened Mode Select, then PLAY played it in one tap | Removed (Nov 12; a label first, then gone): PLAY opens Mode Select on the last choice |
| The champion nameplate "⇄" (lock in to play) | A label |
| Nav Heroes → the champion select (LOCK IN played) | Heroes opens the champion browser: skills and lore, browse only |
| Nav Friends "Play with friends" (`play-friends`) | PLAY → Skirmish → With Friends |
| H on Home → the champion select | H opens the champion browser |
| The Social sheet's "Play casual" → the PvP queue at once | Mode Select on Skirmish, PvP (one tap: Find match) |
| The "< Games" button in Home's top-right corner (`lobby-exit`) | Settings → "Back to Token Tails games" (embedded, on Home only); the host page has no header of its own |

Kept: **# Code** (join a friend's party by code: it opens the party lobby, not a match), a party invite's Join and a
party link (the lobby), the dare link, and the results' Run it back and Change hero.

**Analytics.** `play_open` (`from`: play, key, promo, event or back) when Mode Select opens, and `play_start` (`mode`,
`variant`, `difficulty`) when a variant goes on. `match_start`, `mm_join` and `party_create` follow as before.

**Classic 5v5 never started (fixed Nov 12).** PLAY on Classic went back to Home: building the Hearthwood scenery threw
in `ModelBuilder.build` (three's `mergeGeometries([])`), because sim v22's standard Hearthwood has no rock big enough
for a tree crown, so the crown layer was empty. An empty builder now gives an empty geometry and the layer is hidden
(`render/views/rig.ts`, `hearthwoodView.ts`; a unit test builds the whole map). No sim change.

## Code map

| Piece | File |
|---|---|
| Home screen (layout, PLAY, nav, popovers, keyboard) | `src/ui/home/homeScreen.ts`, `home.css` |
| Motes layer (L2) | `src/ui/home/motes.ts` |
| Mode registry, saved choice, countdowns | `src/ui/modeSelect/modes.ts` |
| Mode Select overlay (its own lazy chunk, loaded on the first open) | `src/ui/modeSelect/modeSelect.ts`, `modeSelect.css`, `crest.ts` |
| Key art scene `legends` (16:9 for desktop, 21:9 for phones) | `src/render/lobby/lobbyBg.ts`, `src/render/lobby.ts` |
| Ken Burns on the key art | `src/render/lobby/backdrop.ts` (`uZoom`) |
| Wiring (profile, season, promos, mode choice) | `src/app/app.ts` `showTitle` |
| Art | `public/assets/lobby/legends*.webp`, `promo-*.webp`, `public/assets/modes/*.webp`, `public/assets/screens/modes-*.webp` |
| Tests | `tests/unit/modes.test.ts`, `tests/unit/home-screen.test.ts`, `tests/e2e/home-modes.spec.ts`, `tests/e2e/mp/play-path.spec.ts` |
| Screenshots of the path | `PLAY_SHOTS=1` on those two e2e specs: `~/Downloads/paw-legends/play-flow/` |
| Screenshots | `docs/plans/moba/home-ui/` |

`ui/lobby/lobbyScreen.ts` stays. Home reuses its pure helpers (`playLabel`, `playLine`, `questTally`, `peekHtml`,
`firstHidesBadge`), and its tests still run.

## Home layers, back to front

1. **L0, key art.** "Storm Clash Arena" (Nov 13), in the brand book's one style: a bright midday comic arena split
   rose (cats, left: Duchess and Sage in front of the stands, the pink cat castle) and sky blue (dogs, right: Bravo and
   Cacklejaw, the wooden dog house), with a yellow lightning bolt striking left of centre, clear of the hero and its
   nameplate, and calm sand in the middle (no painted ring: the 3D pedestal is the stage). The image is drawn by the 3D backdrop
   shader with a cover fit, pointer parallax and an 18 s Ken Burns zoom from 1.00 to 1.035. The zoom is off on Low
   and with reduced motion.
2. **L1, the 3D picked hero.** It is centred (`lobby.side = 0`) at 72% of its old size (`lobby.heroScale`), with its
   feet on the stage floor (`lobby.footShare`).
3. **L2, motes.** Pink and violet sparkles on the cat side, amber embers on the dog side. There are 24 on Med and 48
   on High, drawn at 30 fps. There are none on Low or with reduced motion.
4. **L3, light.** Two CSS light shafts that breathe slowly. They are off on Low.
5. **L4, the UI.** It is laid out by corners:

| Zone | Content |
|---|---|
| Top left | Profile chip: avatar with a Season XP ring, name (account name, else the host's player name, else "Guest"), XP bar, tier. A tap opens the Treat Track and Pass. |
| Top centre | Season XP and Tier chips. They show only when the server sent a season, and a tap opens the pass. Below them sits the champion nameplate over the hero's head (the pedestal is at the bottom, so the plate cannot sit under the hero). It is a label. |
| Top right (`.lb-corner`) | Friends and ranked (embedded), Settings, Sound. The account chip mounts here too. No "Games" button (Nov 12): Settings has "Back to Token Tails games" when embedded. |
| Left edge | Round buttons: Events (glows when an event is live), Today (quests ring) and # (join with a code). |
| Right edge | Promo rotator, changing every 5 s: Legends Pass season, Cannon Chaos and the Store (web only). |
| Bottom | Glass nav: Heroes (browse only), Cards, Pass, Ranked (live while the gate is open: opens Mode Select on Ranked; else locked with the gate line), Store (web only). It also shows on the first visit, with Heroes, Cards and Pass locked. |
| Bottom right | The round PLAY, alone for a returning player. The first visit and a dare keep one line above it. |

**PLAY.** It opens Mode Select (the one play path above). On the first visit PLAY starts the guided Clem match. On a
dare it accepts the dare.

**Motion.**
- PLAY has two glow rings, a sheen sweep every 6 s, a breathing paw, and a press shockwave followed by the existing
  stage dolly.
- On entering Home, the bars drop and rise in and PLAY pops in with an overshoot.
- Low tier and reduced motion keep a static glow only.

## Mode Select

Mode Select opens from PLAY, Enter or M (and a promo or an Events row on its mode). It is a full-screen overlay that
dims Home, in two stages: the mode tiles, then the variant cards (the one play path above).

**Header.** A back button (one step back) and "Choose your battle", or the mode's name and "How do you want to play?".

**Tile row.** Round tiles show painted art in a CSS gold bevelled ring. Each tile has:
- an SVG crest at 12 o'clock and an "i" button at 4 o'clock;
- a rune ring that turns slowly behind live tiles.

Tile states:
- **Locked:** greyed, with a padlock and the lock text.
- **Coming soon:** a "SOON" band.
- **Event:** a live countdown chip.
- **Ranked:** a rank line.

A tap on a tile that cannot be played shakes it and explains why. When there are more tiles than fit, the row
scrolls sideways with snap. This is the only scroll region.

**Footer.**
- Mode stage: the mode's name, size and length, and **Next**.
- Variant stage: the bots difficulty (vs Bots) or the variant's line, and the action (Choose champion, Find match,
  Open party).

**Registry (`modes.ts`).**

| Mode | Map | Queues | State |
|---|---|---|---|
| Skirmish | 3v3 Purrhaven Crossing | bots, coop, pvp, friends | live |
| Classic | 5v5 Hearthwood Divide | bots, pvp | live |
| Ranked | 3v3 (Crossing) | pvp | always open (round 4): the searching count and Prime Time on the tile; the player's tier on the tile |
| Blitz | 3v3 Purrhaven Crossing, the `blitz` mutator (sim v22, BLITZ.md) | bots (party and PvP later) | live since sim v22 (~3 min; Skirmish ~7 min, Classic ~13 min from the v22 probe) |
| Cannon Chaos | 3v3 Purrhaven Crossing, the `cannon` mutator (sim v27) | bots | live (~5 min) |
| Practice | Purrhaven Crossing, the `practice` mutator (sim v27): three training dummies, Reset / Level +1 / Cooldowns in the top plate | bots (the sandbox) | live; any champion, saves nothing, Leave goes Home |
| Weekly Twist | 3v3 Purrhaven Crossing, the week's twist mutator (`toybox`, `rapid`, `bounty`) | bots | event until Monday 00:00 UTC; registered from `GET /pawlegends/config` `twist` (the baked rotation offline) |
| One Lane Brawl | 3v3 on the Crossing's Sunny Lane strip, the `onelane` mutator (sim v28) | bots | live (~6 min); no Nap, no fountain heal |
| Duel | 1v1 on the Sunny Lane strip, the `duel` mutator (sim v28) | bots | live (~3 min); first to 2 takedowns or the first tower |
| Boss Weekend | 3 heroes vs Mega Brutus on the Sunny Lane strip, the `boss` mutator (sim v28) | bots | event Friday 00:00 to Monday 00:00 UTC ("Next: Fri" midweek); `GET /pawlegends/config` `boss` (the baked schedule offline) |

**Saved choice.** It is stored as `pawlegends.mode.v1` in localStorage.
- Migration: when no new key exists, the old `pawlegends.matchMode` maps `quick` to Skirmish and `classic` to Classic
  (sim v22 stores `blitz`, `skirmish` or `classic`, each its own tile). A `?mode=` link sets both keys (vs Bots); an
  unknown mode shows "Update to play …" on Home and keeps Skirmish.
- Every confirm also writes the old key, so the pick screen, party queue and rematch keep the same map.
- The old "Co-op vs Bots" tile's `{ mode: 'coop' }` loads as Skirmish, Co-op.

## Plug-in points for the other worktrees

| Worktree | Where it plugs in |
|---|---|
| v22 (Blitz, PLAY picker tiles) | Done in sim v22: Blitz is a live `BASE_MODES` row; `botsChoice` gives it `mutator: 'blitz'`. A mode with the same id registered later replaces the base entry. |
| -champs (champion store) | `HomeScreenOpts.onHeroes` (nav Heroes: browse only, the app passes the champion browser; no item without it), plus a `Promo` with `action: 'heroes'`. |
| -chat (avatars, chat) | Profile avatar (`.hm-av`), top-right corner (`.lb-corner`). |
| Pass | Nav Pass, profile XP ring and the season promo all read `ent.snapshot().season`. |
| Ranked | `ModeDef.rank` and `state`. |
| -5v5 | Classic `ModeDef.map`. |

## App build (iOS)

- The Store nav item and Store promos are hidden: they need `storeOpen && !isApp`.
- No prices are shown anywhere on Home or in Mode Select (unit test and e2e).

## Calls made with defaults

1. **3D turntable.** It stays on Home, centred over the key art.
2. **PLAY.** Superseded Nov 12: PLAY opens Mode Select (the founder asked for one path, at the cost of a tap or
   two: Enter, Enter, Enter, LOCK IN on a keyboard).
3. **Nav on the first visit.** The nav shows, with the items that need a match locked.
4. **Ranked.** Always open since round 4 (SOCIAL-RANKED.md §7.11): players first, labelled bots fill a quiet queue (half points) or it plays vs AI (quarter points). The tile shows the searching count and Prime Time; the variant stage names Prime Time; the rules say the bot rule.
5. **Cannon Chaos.** Live since sim v27 (V27.md §3); before that it was "coming soon", never a fake countdown.
6. **Quick Co-op and PvP.** Removed Nov 12 (the one play path). A brand-new guest's first match stays the guided
   one; co-op opens from match 2. The multiplayer e2e goes through the path (`tests/e2e/mp/party.helpers.ts`
   `playVariant`).
7. **Co-op and PvP pick after the queue.** The champion select follows the match found (Wild Rift's order), not
   before the queue, so a player never picks twice.
8. **Classic and Blitz variants.** Only what the relay plays: Classic vs Bots and PvP, Blitz vs Bots. They show
   when the relay supports more.
9. **The way back to Token Tails games.** Settings, embedded and on Home only.

## Not done yet

- A gold-rim variant of the 3D pedestal.
- A gyro parallax: it would need iOS motion permission.
- Day and night key art variants.
- An ambient home sound loop.
