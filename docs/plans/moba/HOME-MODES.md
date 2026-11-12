# Paw Legends: Home and Mode Select

Status: built on `feat/pawlegends-home-ui` (Nov 11, 2026). This replaces Part A of `LANDING-PICK-UX.md`, the old
left-column lobby. Part A's rules still apply: the screen never scrolls, touch targets are at least 44 px, safe areas
are respected and nothing sits behind a feature flag.

The founder asked for a home screen and a mode picker on the level of Wild Rift and the League client. We borrowed
the structure and the finish. Every piece of art, every shape and all the text are our own.

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
| Tests | `tests/unit/modes.test.ts`, `tests/unit/home-screen.test.ts`, `tests/e2e/home-modes.spec.ts` |
| Screenshots | `docs/plans/moba/home-ui/` |

`ui/lobby/lobbyScreen.ts` stays. Home reuses its pure helpers (`playLabel`, `playLine`, `questTally`, `peekHtml`,
`firstHidesBadge`), and its tests still run.

## Home layers, back to front

1. **L0, key art.** A sunset arena. The cats stand on the left (Sage, Duchess, Clem) and the dogs on the right
   (Brutus, Howler, Cacklejaw), with an empty glowing ring in the middle. The image is drawn by the 3D backdrop
   shader with a cover fit, pointer parallax and an 18 s Ken Burns zoom from 1.00 to 1.035. The zoom is off on Low
   and with reduced motion.
2. **L1, the 3D picked hero.** It is centred (`lobby.side = 0`) at 72% of its old size (`lobby.heroScale`), with its
   feet on the painted ring (`lobby.footShare`).
3. **L2, motes.** Pink and violet sparkles on the cat side, amber embers on the dog side. There are 24 on Med and 48
   on High, drawn at 30 fps. There are none on Low or with reduced motion.
4. **L3, light.** Two CSS light shafts that breathe slowly. They are off on Low.
5. **L4, the UI.** It is laid out by corners:

| Zone | Content |
|---|---|
| Top left | Profile chip: avatar with a Season XP ring, name (account name, else the host's player name, else "Guest"), XP bar, tier. A tap opens the Treat Track and Pass. |
| Top centre | Season XP and Tier chips. They show only when the server sent a season, and a tap opens the pass. Below them sits the champion nameplate over the hero's head (the painted ring is at the bottom, so the plate cannot sit under the hero). A returning player can tap it to open the champion select. |
| Top right (`.lb-corner`) | Games (when embedded), Friends and ranked (embedded), Settings, Sound. The account chip mounts here too. |
| Left edge | Round buttons: Events (glows when an event is live), Today (quests ring) and # (join with a code). |
| Right edge | Promo rotator, changing every 5 s: Legends Pass season, Cannon Chaos and the Store (web only). |
| Bottom | Glass nav: Heroes, Cards, Pass, Ranked (locked), Store (web only), Friends (party). It also shows on the first visit, with Heroes, Cards and Pass locked. |
| Bottom right | Mode pill (opens Mode Select), the one-tap Co-op and PvP buttons, and the round PLAY. |

**PLAY.** One tap plays the selected mode:
- With the Bots queue, it starts a solo match on the mode's map.
- With Co-op or PvP, it starts the online flow.
- The 3v3 PvP match-count lock is explained in a toast.

On the first visit PLAY starts the guided Clem match. On a dare it accepts the dare.

**Motion.**
- PLAY has two glow rings, a sheen sweep every 6 s, a breathing paw, and a press shockwave followed by the existing
  stage dolly.
- On entering Home, the bars drop and rise in and PLAY pops in with an overshoot.
- Low tier and reduced motion keep a static glow only.

## Mode Select

Mode Select opens from the mode pill or with M. It is a full-screen overlay that dims and blurs Home.

**Header.** A back button and "Choose your battle".

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
- The queue segment (Bots, Co-op, PvP) lists only what both the mode and this build offer.
- The bots difficulty moved here from Home.
- **Confirm** saves the choice and returns to Home. A double tap on a tile also confirms.
- Mode Select has no Play button, so PLAY on Home stays the one way to start a match.

**Registry (`modes.ts`).**

| Mode | Map | Queues | State |
|---|---|---|---|
| Skirmish | 3v3 Purrhaven Crossing | bots, coop, pvp | live |
| Classic | 5v5 Hearthwood Divide | bots, coop, pvp | live |
| Co-op vs Bots | 3v3 | coop | live |
| Ranked | 5v5 | pvp | locked ("Coming soon", Unranked) |
| Blitz | 3v3 Purrhaven Crossing, the `blitz` mutator (sim v22, BLITZ.md) | bots (party and PvP later) | live since sim v22 (~3 min; Skirmish ~7 min, Classic ~13 min from the v22 probe) |
| Cannon Chaos | 3v3 | bots, coop | soon (becomes an event only when given a real `endsAt`) |

**Saved choice.** It is stored as `pawlegends.mode.v1` in localStorage.
- Migration: when no new key exists, the old `pawlegends.matchMode` maps `quick` to Skirmish and `classic` to Classic
  (sim v22 stores `blitz`, `skirmish` or `classic`, each its own tile). A `?mode=` link sets both keys (vs Bots); an
  unknown mode shows "Update to play …" on Home and keeps Skirmish.
- Every confirm also writes the old key, so the pick screen, party queue and rematch keep the same map.

## Plug-in points for the other worktrees

| Worktree | Where it plugs in |
|---|---|
| v22 (Blitz, PLAY picker tiles) | Done in sim v22: Blitz is a live `BASE_MODES` row; `botsChoice` gives it `mutator: 'blitz'`. A mode with the same id registered later replaces the base entry. |
| -champs (champion store) | `HomeScreenOpts.onHeroes` (nav Heroes, falls back to the champion select), plus a `Promo` with `action: 'heroes'`. |
| -chat (avatars, chat) | Profile avatar (`.hm-av`), top-right corner (`.lb-corner`), nav Friends (`data-a="party"`). |
| Pass | Nav Pass, profile XP ring and the season promo all read `ent.snapshot().season`. |
| Ranked | `ModeDef.rank` and `state`. |
| -5v5 | Classic `ModeDef.map`. |

## App build (iOS)

- The Store nav item and Store promos are hidden: they need `storeOpen && !isApp`.
- No prices are shown anywhere on Home or in Mode Select (unit test and e2e).

## Calls made with defaults

1. **3D turntable.** It stays on Home, centred over the key art.
2. **PLAY.** It plays at once, and the mode pill opens Mode Select. Opening modes from PLAY would add a tap.
3. **Nav on the first visit.** The nav shows, with the items that need a match locked.
4. **Ranked.** It shows as a locked "Coming soon" tile.
5. **Cannon Chaos.** It does not exist in the game yet, so it is "coming soon", not a fake countdown.
6. **Quick Co-op and PvP.** The one-tap buttons stay beside PLAY. The M1A spec guarantees one-tap co-op, and the
   multiplayer e2e uses them.

## Not done yet

- A gold-rim variant of the 3D pedestal.
- A gyro parallax: it would need iOS motion permission.
- Day and night key art variants.
- An ambient home sound loop.
