# Game Modes

All games run in the browser with Phaser 4 (WebGL, pixel art, arcade physics) inside the Next.js
client. The backend only stores results and serves leaderboards. See
[BACKEND.md](BACKEND.md#games) for the server side and [CLIENT.md](CLIENT.md) for the app around
the games.

## Overview

| Game type | In-game name | Folder | Saves score |
|---|---|---|---|
| `HOME` | Base | `client/components/base/` | No. Feeding the cat calls `PUT /cat/:id`. |
| `SHELTER` | Shelter | `client/components/shelter/` | No. Opens cat cards for purchase. |
| `CATNIP_CHAOS` | Purrsuit | `client/components/CatnipChaos/` | Yes, catnip per level. |
| `PIXEL_RESCUE` | Cupid Cat | `client/components/PixelRescue/` | Yes, hearts per level, date-gated levels. |
| `MATCH_3` | Paw Match | `client/components/Match3/` | Yes, catnip and raw score per level. |

`PURRQUEST` and `CATBASSADORS` exist in the backend enum from earlier iterations. The Telegram
Mini App at `/catbassadors` is the same game shell with Telegram auth.

Empty placeholder folders for planned modes: `components/Purragotchi/`,
`components/RoguePaws/scenes/`, `components/HyperTails/scenes/`.

## Shared plumbing

- **Event bus**: `components/Phaser/events.ts` wraps `window` custom events. Phaser scenes push `GAME_START`, `GAME_STOP`, `GAME_LOADED`, `GAME_UPDATE`, `GAME_PROGRESS_UPDATE`, `CAT_HEALTH_UPDATE`, `OBJECTIVE_UPDATE`, `CAT_CARD_DISPLAY`, and spawn events. React listens through `GameContext`. This is the only bridge between Phaser and React.
- **Tilesets**: `components/Phaser/map.ts` maps level ids to tileset PNGs under `public/base/` (spring, autumn, winter, candy, camp, summit, valentine, and so on).
- **Controls**: `components/Phaser/MobileButtons/`, `components/shared/Joystick.tsx`, `components/Phaser/PlayerMovement/`.
- **Player**: `components/catbassadors/objects/Catbassador.ts` is the player cat class with `Abilities.ts`.
- **Hazards**: `components/storyMode/` holds 17 managers: saws, spikes, portals, levers and doors, floating and movable and destroyable blocks, rising water, fans, icy ground, morgenstern traps, falling columns, hidden traps, collectibles. `components/purrquest/` holds boss and enemy classes.
- **Mounting**: every game component is loaded with `next/dynamic` and `ssr: false` into `<div id="game-container">` sized to the window.
- **Music**: random tracks from the CDN `music/in-game/` folder.

## Save flow

1. A scene pushes `GAME_STOP` with score, time, completed level, and for Paw Match `rawScore` and `catnipEarned`.
2. `GameContext.gameStopCallback` builds `{ type, points, score, time, level }` and calls `USER_API.saveMatch`, which posts to `POST /user/catbassadors/live`.
3. The backend writes a `Game` row, caps `points`, applies `$max` to the per-level arrays, recomputes catnip totals, and returns the snapshot.
4. `GameContext` patches the profile and, for Paw Match, invalidates the per-level leaderboard queries. A `null` response means the player is out of lives.

Caps mirrored on the client in `constants/catnip-accounting.ts`:

| Game | Per-level cap |
|---|---|
| Catnip Chaos level `01` | 420 |
| Every other Catnip Chaos level | 10 |
| Pixel Rescue | 420 |
| Paw Match catnip | Per-level value up to 85 |
| Paw Match raw score | 1,000,000 |

## Catnip Chaos (Purrsuit)

Pixel platformer. Collect catnip coins across 80 Tiled levels.

- Scene: `components/CatnipChaos/scenes/CatnipChaos.ts`. Level select in `CatnipChaosLevels.tsx`.
- Levels: `public/catnip-chaos/levels/level-XX.json`. Level `01` is the large endless level. The backend accepts 97 level keys.
- Cosmetics per level in `config.tsx`: specific cat sprites for levels 101 to 136, a SEI coin for levels starting with 8, a Santa ghost for levels starting with 10.
- Reuses floating platforms, spikes, portals, trampolines, and food from the shared managers.
- Chapter badges for Catnip Chaos chapters are defined in `web3/web3.model.ts`.

## Pixel Rescue (Cupid Cat)

Rescue caged cats in a Valentine-themed forest. 14 levels that unlock one per day by date.

- Scene: `components/PixelRescue/scenes/PixelRescueScene.ts`. Level select in `PixelRescueLevels.tsx` with a countdown to the next unlock.
- Objects: runner and blocker enemies, cat crates, rescued cats, forest atmosphere effects, a tutorial manager that stores completion in `localStorage`.
- HUD is a React overlay driven by objective, timer (90 seconds default), and health events.
- Two save points: win with the completed level, or death with `completedLevel: null`. Success also patches `seasonEvent` on the profile and can complete the `PIXEL_RESCUE_LEVEL` quest.
- Dedicated end screen: `components/shared/PixelRescueEndGameModal.tsx`.
- Levels: `public/pixel-rescue/levels/level-1..14.json`, tileset `public/base/valentine.png`.

## Paw Match (Match 3)

Time-attack match-3 with cat-themed tiles. The largest scene in the codebase at roughly 4500
lines in `components/Match3/scenes/Match3Scene.ts`.

- Levels: `match3.config.ts` generates 30 levels across 6 worlds of 5: Kitten Starter, Whisker Run, Shelter Sprint, Moon Paws, Star Nip, Legend Claws. Each level derives time limit, target score, catnip cap, tile pool size, objective, and fever gates.
- Tiles: catnip, heart, tails logo, paw, and fire, water, nature ability icons.
- Mechanics: swipe and drag input, a buffered queue of up to 6 swaps while the board resolves, cascades, specials (row, column, bomb, rainbow) with special-on-special detonations, auto-reshuffle on dead boards, guided first move, idle hints, star milestones with bonus time, fever mode at double score, a one-time "last chance" 5 second extension.
- Audio: procedural WebAudio effects, no audio files.
- Layout: a dedicated small-landscape HUD when the viewport is at most 960 by 450, targeting 667 by 375 and 932 by 430 phones.
- Leaderboard: `Match3Levels.tsx` shows a per-level board of the top 120 and the player's exact rank from the authenticated position endpoint.
- Dual currency: `points` is catnip earned and drives the economy; `score` is the raw run score and drives leaderboards. The React key includes the best score so a new best remounts the scene cleanly.
- QA hooks: the scene installs `window.render_game_to_text()` and `window.advanceTime(ms)` while mounted.
- Local storage keys for retention state and tutorial completion.

The original plan in `client/docs/MATCH3_GAME_MODE_EXECUTION_PLAN.md` described three levels.
The shipped configuration supersedes it. The plan's iteration log records the move from a DOM
board to a Phaser scene and the later retention pass.

## Base (Home)

`components/base/scenes/BaseScene.ts`. The player's cats live here as NPCs. Feeding raises the
`EAT` status to 4 through `CatContext`, which optimistically adds the feed reward and calls
`PUT /cat/:id`. Clicking another owned cat switches the active cat. Gravity is 700.

## Shelter

`components/shelter/scenes/ShelterScene.ts`. Spawns purchasable cats as NPCs: all house cats
from the `token-tails` and `token-tails-2` shelter groups and ten random cats from the partner
shelter `rozine-pedute`. An elevator and speech bubbles decorate the scene. Clicking a cat emits
`CAT_CARD_DISPLAY`, which opens the card modal and the payment flow.

## Tileset extrusion

WebGL bilinear sampling bleeds neighbouring pixels at tile edges, producing seams. The
`extrude:<name>` scripts run `tile-extruder` at 32 by 32 pixels (33 for enemies) over
`public/base/<name>-original.png` and write `public/base/<name>.png`. The `-original` files are
the authored sheets; the game references the extruded output. `extrude:enemies` writes back to
its own input path, so keep a copy before running it.

## Level authoring

Levels are Tiled JSON maps. `client/scripts/a.js` replaces a list of tile ids with one value
inside every layer chunk, and `client/scripts/b.js` counts catnip tiles per chunk. Both hardcode
absolute Windows paths from a contributor's machine and need editing before use.
