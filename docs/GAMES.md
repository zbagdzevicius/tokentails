# Game Modes

The Phaser games run in the browser with Phaser 4 rc.5 (WebGL, pixel art, arcade physics) inside the
Next.js client. Catnip Heist is a separate three.js game (`catnip-heist/`) hosted on `/heist`, and
Pawlegends one in `pawlegends/` hosted on `/pawlegends`. The backend stores results, re-simulates Heist
runs and Pawlegends matches and serves leaderboards. See
[BACKEND.md](BACKEND.md#games) for the server side and [CLIENT.md](CLIENT.md) for the app around
the games.

## Overview

| Game type | In-game name | Folder | Saves score |
|---|---|---|---|
| `HOME` | Home (Base) | `client/components/base/` | No. Feeding the cat calls `PUT /cat/:id`. |
| `SHELTER` | Shelter, opened from Home or MEET SHELTER CATS | `client/components/shelter/` | No. Opens cat cards for purchase. |
| `CATNIP_CHAOS` | Purrsuit | `client/components/CatnipChaos/` | Yes, catnip per level, cleared state. |
| `PIXEL_RESCUE` | Cupid Cat | `client/components/PixelRescue/` | Yes, hearts per level, cleared state, date-gated levels. |
| `MATCH_3` | Paw Match | `client/components/Match3/` | Yes, catnip and raw score per level, cleared state. |
| `CATNIP_HEIST` | Catnip Heist | `catnip-heist/`, host in `client/components/heist/` | Yes, a replay the server re-simulates. |
| `PAWLEGENDS` | Pawlegends | `pawlegends/`, host in `client/components/pawlegends/` | Yes, a replay the server re-simulates (won and lost matches). |

`PURRQUEST` and `CATBASSADORS` exist in the backend enum from earlier iterations. Old `Game`
rows use them and the score endpoint path is still `/user/catbassadors/live`, but the endpoint
rejects them as a `type`, along with `HOME` and `SHELTER`.

The lobby (`components/game/GameSelect.tsx`) shows the player's cat large in a hero slot on a
nameplate, one **Home** tile (opens `HOME`; a `SHELTER` button inside Home switches to the Shelter
scene and a `HOME` button back), a **RESCUE** tile (opens PROGRESS on IMPACT), MEET SHELTER CATS (one
tap to the Shelter), the md+ impact strip, PROGRESS, ABOUT ME, Settings and a mute toggle. The
**PLAY** button opens `components/shared/GameSelectModal.tsx`, a GameModal with four cards: Cupid
Cat (seasonal, tagged SEASONAL: shown only from 1 January to 31 March in the player's local time, see
`components/game/seasons.ts`; off-season the picker has three cards and `setGameType` refuses
PIXEL_RESCUE, while saves of a run already started still go through), Purrsuit (tagged CLASSIC; there is no promise of new levels, decision #94), Paw Match and Catnip
Heist (badge "NO SIGN-UP", decision #16; a link to `/heist?from=picker`). The Heist card is on by default in every build (decision #15 overridden 2026-10-05); `NEXT_PUBLIC_HEIST_PICKER=0` hides it. Cards are 2x2 on phones and one row from `md`. By default (launch, Oct 16 2026) a fifth card titled `SWORDCAT_TITLE` upper-cased (today PINK PAW KNIGHT; badge "NEW", an inline SVG preview, a link to `/swordcat`), follows the Heist; it has no game type. `NEXT_PUBLIC_SWORDCAT_PICKER=0` or `NEXT_PUBLIC_SWORDCAT=0` (also `false`/`no`/`off`) hides it. The Pawlegends card ("3v3 hero battles with your cats vs dog bots", badge "NEW", a placeholder "3v3" tile, a full-page link to `/pawlegends`) comes last, on the web only; `NEXT_PUBLIC_PAWLEGENDS_PICKER=0` or `NEXT_PUBLIC_PAWLEGENDS=0` hides it.

A new player is routed straight to their first level: after Meet your cat the hand-off shows the
lobby with "Up next: Cupid Cat · Day 1" for 1.8 s, then opens Cupid Cat level 1 with the starter
shield (decision #96). Outside Cupid Cat's season the hand-off opens Purrsuit 1-1 instead
(`firstModeFor` in `components/onboarding/handoff.ts`). A player with no clears in a scored mode opens on its level 1 gate.

## Shared plumbing

- **Event bus**: `components/Phaser/events.ts` wraps `window` custom events and is the only bridge between Phaser and React (listened to through `GameContext`). Scenes push `GAME_LOADED`, `RUN_READY` (cat placed and frozen, the gate may show; `guards` is null for unlimited), `RUN_BEGIN` (the first input was consumed; the only signal for `game_start`), `LIFE_LOST` (a Paw Guard was spent; never saved), `RUN_HINT` and `RUN_HINT_DONE`, `GAME_STOP` (with a required `outcome`: `won`, `died`, `timeout` or `quit`, and an optional `cause`), `GAME_UPDATE`, `GAME_PROGRESS_UPDATE`, `CAT_HEALTH_UPDATE`, `OBJECTIVE_UPDATE`, `CAT_CARD_DISPLAY`, and the NPC events `NPC_SPAWN_BATCH` / `NPC_SPAWNED {count, skipped, skippedIds, source, scene}` (the one-cat `NPC_SPAWN` is kept for one release and coalesced into a batch). `GameContext` sends `GAME_RESTART` for PLAY AGAIN; `GAME_START` is deprecated (only the Shelter still sends it). Every listener is wrapped in try/catch and reports `listener_error:<event>`.
- **Render foundation** (`components/Phaser/look/`, plan F10): one `makeGameConfig` for all five configs. The backing store is the viewport times the device pixel ratio (capped at 2, 1.5 on low memory or an explicit Low setting; never 3, decision #84), the canvas CSS size is the viewport, and every camera zoom is multiplied by `canvasPixelRatio`. Resizes, rotations and DPR changes resize the backing store and emit `LOOK_RESIZE`. Render tiers LOW, MID, HIGH come from `deviceMemory`, cores and Save-Data, with an Auto / High / Low setting (`tt-render-tier`).
- **Camera** (`look/cameraRig.ts`): an integer zoom `k` from `pickZoom` (hub 12x8 tiles, platformer 14x9; targets swap in portrait, which is allowed, decision #55), bounds from the Tiled chunk extents plus 8 tiles of sky (`worldBounds.ts`; `widthInPixels` is wrong for infinite maps), lerp 0.12 with a deadzone and look-ahead, integer zoom tweens. The `ZOOM` and `ZOOM_PIXEL` constants are gone.
- **Night look** (`look/worldLook.ts`, plan G7): per-scene presets read `public/look/manifest.json`. `lookVersion` `v1` (night) swaps in the night tile skin at the same tile indices, a backdrop scene with far, mid, near and fog parallax plates, point lights at emissive tiles, a halo and contact shadow under every cat, seeded fireflies (40, 20, 8 by tier), a vignette and Glow on the player on HIGH only; `v0` is the old look. Home is a moonlit night, the Shelter dusk (decision #49); every Purrsuit family, ENDLESS included, has its own preset (decision #50). Rollback without a rebuild: set `"lookVersion": "v0"` in the manifest, or `localStorage["tt-look-version"] = "v0"` on one device (decision #51; there is no remote config). Reduced motion (the system setting or the `tt-reduced-motion` override) freezes parallax, particles and flicker. A plate whose alpha has a long straight crop is replaced by a procedural one.
- **Textures**: player and NPC textures are keyed by id and sprite hash (`player-cat-<id>-<hash>`, `npc-<id>-<hash>`), never by name; animations are `${textureKey}_${ANIM}`. `loadSpritesheets` loads a batch in one pass, skips and reports 404 sheets (`npc_texture_missing`), and never removes a texture a live sprite uses.
- **Typography** (plan F4, G12): every scene calls `preloadTTFonts(this)` first in `preload`; HUD text is drawn with `ttText(scene, x, y, text, role)` and fitted with `ttFit`; `installFontHealing` re-measures texts when a late font arrives and emits `TT_FONTS_HEALED`. Roles: `title` (Passion One), `hud`, `label`, `burst`, `hint` (Nunito 800, sentence case, minimum 14 px; decisions #80, #86), `caption`, `code`.
- **Tilesets**: `components/Phaser/map.ts` maps level ids to tileset PNGs under `public/base/` (spring, autumn, winter, candy, camp, summit, valentine, and so on); `Map.SPRING_NIGHT` and `HubMap` hold the hub night skin.
- **Controls**: `components/Phaser/MobileButtons/`, `components/shared/Joystick.tsx`, `components/Phaser/PlayerMovement/` (with `snapshot`/`restore` for checkpoints). `MobileControls.ts` handles only taps on the run surface that are not controls, dialogs or the canvas.
- **Player**: `components/catbassadors/objects/Catbassador.ts` is the player cat class with `Abilities.ts`. Letter keys are added without key capture, so they never swallow typing in a form.
- **Hazards**: `components/Phaser/hazards/` holds the managers the live modes use: `FloatingPlatformManager` and `PortalManager` (Purrsuit), `SawManager` and `RotatingMorgensternManager` (Cupid Cat), and `SpikeManager` with its `Spikes` sprite (both).
- **Suspension**: every GameModal suspends registered games through `lib/game/gameRegistry` (keyboard off, loop asleep, playing sounds and DOM music paused, restored on close).
- **Crash guard**: each Phaser mount sits in a `SceneBoundary`; a stall watchdog shows the scene fallback after 8 s without frames (15 s during startup) and tears the stalled game down. See RESILIENCE.md.
- **Mounting**: every game component is loaded with `next/dynamic` and `ssr: false` into `<div id="game-container">` sized to the window.
- **Music**: the lobby theme (`components/audio/tracks.ts` `LOBBY_MUSIC_TRACK`) plays after the first input; modes play their CDN tracks (Purrsuit one of 45 per level); the Heist plays its own audio. Volume and mute are in Settings and the lobby HUD (CLIENT.md, "Audio").

## Run lifecycle and first runs (plan F6, G10)

The pure rules live in `client/components/Phaser/onboarding/` (run gate, first hazard, checkpoint,
save policy, progress, hints, the `tt.ftue` store); the DOM parts in `components/game/RunGate.tsx`
and `components/game/DeathCard.tsx`.

- **RunGate**: a scene spawns frozen and sends `RUN_READY`; a full card (goal and controls for the last input device) shows on the first visit to a level and a pill after that. The first key or tap begins the run (`RUN_BEGIN`) and is consumed, never a jump; buttons, links, fields and dialogs never begin it. Esc and Android back go to the level map.
- **Paw Guard** (decision #66): soft deaths restore the last checkpoint (`PlayerMovement.snapshot/restore`, catnip taken after it respawns) and wait for the next input. Unlimited guards on an uncleared 1-1 (decision #68), three per attempt on other uncleared levels, none on cleared levels or INFINITE. The Assists panel on the level map offers "Extra guards" (three more, uncleared levels only) and "Slow-mo on every hazard"; the DeathCard suggests Extra guards after three hard deaths on a level. Assist runs are not flagged on any board (decision #71). Haptics (`@capacitor/haptics`, native only, decision #70) mark soft deaths, hard deaths and clears.
- **DeathCard**: an `alertdialog` for `died` and `timeout` with RETRY focused, a tip by `cause`, "New best", "New best, saved" or "New best, not saved".
- **Save policy** (`save-policy.ts`): `won` always saves; a hard death saves only on a new best; `quit` never; no session never. Points are clamped to the level cap before `/live` (an endless run over 500 used to lose its save). A first clear sends `ftue_first_clear`, the save nudge and a haptic on native.
- **Cleared state and unlocks** (decisions #67, #69): the backend's `catnipChaosCleared`, `seasonEventCleared` and `match3Cleared` drive level select with `unlocked(i) = i === 0 || cleared[i-1]`. Until a profile has the arrays (before the grandfather migration), a level with points counts as cleared; device-local clears count only while a save is pending (2 minutes) or for signed-out play. Purrsuit's INFINITE opens after 1-1 and is never "cleared".

## Save flow

1. A scene pushes `GAME_STOP` with score, time, completed level and `outcome`, for Paw Match `rawScore` and `catnipEarned`. Paw Match `time` is the seconds actually played, so streak, star and last-chance bonus seconds never make it negative.
2. `GameContext.gameStopCallback` applies the save policy, builds `{ type, points, score, time, level, outcome }` and calls `USER_API.saveMatch`, which adds `platform` (`web`, `ios` or `android` from `Capacitor.getPlatform()`) and posts to `POST /user/catbassadors/live`. A transient guest's first save gets 428, the client creates the guest session once and retries. Before saving it sends the scrubbed `game_finish` or `game_fail` event; telemetry never writes scores.
3. The backend rejects unknown fields, unknown types, unknown levels and `points` above the level cap with 400 before writing anything. It then writes a `Game` row, applies `$max` to the per-level arrays, marks the level cleared on `won`, recomputes catnip totals, and returns the snapshot. Saves are limited to 30 per minute per player and 120 per minute per IP. Scores in these modes are accepted by cap validation, not verified.
4. `GameContext` patches the profile (including the cleared arrays), records `lastOutcome`, and for Paw Match invalidates the per-level leaderboard queries. Runs consume no lives. A 429 is retried once after `Retry-After`; if that is throttled too, `saveMatch` throws `MatchSaveThrottledError` and the player is told the run was not saved. Any other failure shows "Could not save your score, try again" (`context/game-save-feedback.ts`).

Caps (from `shared/caps.ts`; the client copy is `constants/catnip-accounting.ts`):

| Game | Per-level cap |
|---|---|
| Purrsuit endless level `01` | 500 (decision #57) |
| Every other Purrsuit level | 10 |
| Cupid Cat | 500 |
| Paw Match catnip | Per-level value up to 85 |
| Paw Match raw score | 1,000,000 |
| Catnip Heist | Server score; `HEIST_LEVEL_CAPS` 220 to 330 per level (16 levels) |

## Catnip Chaos (Purrsuit)

Pixel platformer. Collect catnip sprigs across 80 Tiled levels. Its level list is classic: no new
levels are promised.

- Scene: `components/CatnipChaos/scenes/CatnipChaos.ts`. Level select in `CatnipChaosLevels.tsx` (START HERE, CLEARED counter, the all-cleared notice only when every level is cleared, the Assists panel).
- Levels: `public/catnip-chaos/levels/level-XX.json`. Level `01` is the large endless level (INFINITE). The backend accepts 97 level keys.
- First run: the world freezes before the first spike with "JUMP!" and the cat is snapped to the prompt point, so the answering jump clears the run at 30, 60 and 120 fps; the first time each mechanic appears (trampoline, gravity, flight, portal, speed and others) it plays at 0.35x as a teach (freeze-and-prompt under reduced motion). There is no speed ramp.
- Pickups: the botanical sprig (`catnip/catnip-v2-32.png`, decisions #56, #60) bobs ±2 px and sways ±8° with a sparkle on pickup.
- Cosmetics per level in `config.tsx`: specific cat sprites for levels 101 to 136, a SEI coin for levels starting with 8, a Santa ghost for levels starting with 10.
- Reuses floating platforms, spikes, portals, trampolines, and food from the shared managers.
- Chapter badges for Catnip Chaos chapters are defined in `web3/web3.model.ts`.

## Pixel Rescue (Cupid Cat)

Rescue caged cats in a Valentine-themed forest. 14 levels that unlock one per day by date (a
calendar gate on top of the cleared rule).

- Scene: `components/PixelRescue/scenes/PixelRescueScene.ts`. Level select in `PixelRescueLevels.tsx` (cleared, open or locked tiles, START HERE or NEXT, "Clear day N first").
- First run (`components/PixelRescue/ftue.ts`, `CupidHud.tsx`): frozen spawn behind the RunGate; one `RunClock` per run counts only after `RUN_BEGIN` and holds through tutorial steps and notices. The tutorial plays once per level per player (`hint` role, sentence case) with "Replay tutorial" in the HUD. The starter shield on uncleared levels 1 and 2 absorbs one hit (any hazard), with a 1 s grace, a sprite on the cat and a HUD chip. First-seen hint plates for enemies, crates and portals. A "Leave level" button and Esc leave mid-run without a save.
- Objects: runner and blocker enemies, cat crates, rescued cats, forest atmosphere effects, a tutorial manager.
- HUD is a React overlay driven by objective, timer (90 seconds default), and health events.
- Every stop pushes `won` (portal), `died` (health or spikes) or `timeout`; only a win carries the completed level. The 10,000-Tail gift button needs every `seasonEventCleared` day from the server.
- Dedicated end screen: `components/shared/PixelRescueEndGameModal.tsx` (a night GameModal).
- Season enforcement is client-only (founder, 2026-10-04: "whatever is easier"): `components/game/seasons.ts` hides the card and `setGameType` refuses off-season, but the backend still accepts `PIXEL_RESCUE` scores all year through `POST /user/catbassadors/live`. A server-side season check is not planned.
- Levels: `public/pixel-rescue/levels/level-1..14.json`, tileset `public/base/valentine.png` (`valentine-night-v1.png` in the night look).
- Judge path (section 6.1): `game_loaded` to the first clear of day 1 measured at a median of about 48 s by a scripted player that knows the route, against a 90 s target.

## Paw Match (Match 3)

Time-attack match-3 with cat-themed tiles. The largest scene in the codebase at roughly 4500
lines in `components/Match3/scenes/Match3Scene.ts`.

- Levels: `match3.config.ts` generates 30 levels across 6 worlds of 5: Kitten Starter, Whisker Run, Shelter Sprint, Moon Paws, Star Nip, Legend Claws. Each level derives time limit, target score, catnip cap, tile pool size, objective, and fever gates.
- Tiles: catnip (the sprig, LINEAR-filtered), heart, tails logo, paw, and fire, water, nature ability icons.
- Mechanics: swipe and drag input, a buffered queue of up to 6 swaps while the board resolves, cascades, specials (row, column, bomb, rainbow; drawn as texture badges) with special-on-special detonations, auto-reshuffle on dead boards, idle hints, star milestones with bonus time, fever mode at double score, a one-time "last chance" extension.
- First run (`match3Rules.ts`, `tutorial.ts`): the clock and `RUN_BEGIN` start on the first valid swap, not in `create()`; an uncleared level 1 gets a one-time +15 s grace. The tutorial is one `hint` plate sized to its text in the safe area ("Swipe one glowing tile onto the other. The clock waits for you."), with combo and mission hidden until the tutorial swap lands, a 32x32 glove pointer and two ghost trails; a wrong swap says "Follow the glow". Announcements go through two live regions (`SceneAnnouncer.tsx`).
- HUD (`hudLayout.ts`): one slot box per text in standard, wide and small-landscape modes; `layoutHud()` re-fits on create, `TT_FONTS_HEALED` and `LOOK_RESIZE`; the right edge reserves room for the close button (`--tt-header-reserve-right`, 56 px plus the right inset, 76 px from `lg`). Before the first move a rotation rebuilds the board; mid-run it letterboxes.
- Audio: procedural WebAudio effects, no audio files (they do not follow the effects volume yet).
- Leaderboard: `Match3Levels.tsx` shows a per-level board of the top 120 and the player's exact rank from the position endpoint (guests see "you would be #N").
- Dual currency: `points` is catnip earned and drives the economy; `score` is the raw run score and drives leaderboards.
- QA hooks: the scene installs `window.render_game_to_text()` (with HUD bounds) and `window.advanceTime(ms)` while mounted (also in production builds; known issue).
- Local storage keys for retention state and tutorial completion.

The original plan in `client/docs/MATCH3_GAME_MODE_EXECUTION_PLAN.md` described three levels.
The shipped configuration supersedes it.

## Catnip Heist

A single-player 3D stealth run in `catnip-heist/` (three.js, Vite): guide two cats past Kibble Corp's
guards, grab catnip coins, open the vault and free a shelter cat. Sixteen campaign levels in two acts of eight. The rules
run in a deterministic integer simulation (`catnip-heist/src/sim/`), which the backend replays.

- **Hosting** (plan G2): the static build lives at `/heist-game/` (`npm run build:client`). `pages/heist.tsx` hosts it in an iframe (`/heist-game/index.html?embed=1`) with an optional auth provider. `components/heist/hostBridge.ts` speaks `shared/heist-bridge.ts`: `hello` every 500 ms for up to 10 s; after `ready`, `session {signedIn, progress, insets}`, `save-result`, `pause`, `resume`; the Heist sends `run-complete {runId, won, levelId, log}`, `request-sign-in` and `exit`. The iframe is same-origin, so the bridge is not a security boundary; the replay is. Old `/heist/*` asset URLs redirect to `/heist-game/*`. GameModals pause the Heist through a stand-in registry entry.
- **Saves** (`components/heist/heistSaves.ts`): only won runs are posted, as `{type: 'CATNIP_HEIST', replay, platform}` to `/live`. A Firebase user (a guest included) saves at once; without one, runs queue on the device (`tt.heist.queue.v1`) and leave it only after "Add N heists played on this device to your account?", where "Not mine" deletes them (decision #18). 2xx and 409 are done; `HEIST_SIM_VERSION` purges queued runs of that version with a message; other 400s and 413 are dropped; 401, 403 and 428 are kept; 429, 5xx and network errors back off. The save chip says "Heist saved", "Already saved" or "This heist is already saved on another account". Heist runs consume no lives (decision #17) and earn no catnip (decision #14).
- **Server progress** is merged into the Heist's local store (never lowers; stars OR). The embedded first-time path is PLAY, the Heist card, START, then the brief's Go!.
- **First run** (`catnip-heist/src/onboarding/`, decision #72): a brief card per level on the first visit (the sim clock waits; the key that closes it is consumed); ghost paw prints of the planned route after 20 s of sim time without progress or two detections, or on a tap of the objective chip (only offered on levels not yet won); "Rewind 5 s" on levels 1 to 3 after a detection, which re-simulates the cut input log, so the saved log is an ordinary log the verifier accepts.
- **Rail copy** (`src/ui/rail.ts`, plan G11): the results screen reads `GET /shelter/donate/status` (3 s timeout) and shows pre-launch ("Real shelter treats open soon.", an "Opens soon" badge), live (the treat button) or exhausted copy; the amount comes from the public facts (C-004). App builds never name the chain. Fixed (task 7b): the win screen's "Token Tails has sent {amount} to shelters so far, on-chain" line (`ui/payouts.ts` `shelterTotal()`, `L-disbursed`) also rendered in app builds; it now returns null off the web host.
- **Payouts modal** (`src/ui/shelter-payouts.ts`, web hosts only): "Sent to shelters", opened from the title, the pause menu and the win screen, or on load with `?payouts` or `#payouts`. It reads the ShelterSplit payout events from the backend's index (`GET /shelter/payouts`) plus the newer blocks from each chain, or from the chains alone when there is no backend, it does not answer, or its index is stale (`src/ui/payouts.ts`, `public/payouts/deployments.json`) and shows the total per coin, a row per deployment, the latest payouts, the Pink Paw showcase and the give button. A separate "Testnet proof" section reads `public/payouts/testnet-deployments.json` (one card per testnet, never added to the real totals). `fund a:ingest` writes both lists, plus the built Heist's mainnet copy under `client/public/heist-game/payouts/`. The mainnet read is shared per page load (the title prefetches it; the win screen's total reuses it), and the title's 3D scene draws no frames while the modal is open (without a GPU its frames held the rows back for seconds). On `/heist?payouts` an inline script in `HeistHost` points the server-rendered frame at the payouts link before hydration, so the game loads once.
- **Look**: coin gold-400, night-900 background, Nunito secondary text (decisions #48, #85), the shared Token Tails icon (decision #93), voxel catnip sprigs from the 16 px master.
- **Analytics and crashes**: scrubbed `heist_open`, `heist_run_complete` and the first-run funnel (`ftue_gate_shown`, `game_start`, `ftue_hint_shown`, `ftue_hint_done`, `life_lost`, `game_fail`, `game_finish`, `ftue_first_clear`), and a crash overlay ("Something went wrong. Your cats are safe.") on a boot failure, an error burst or a 5 s frame stall. Both need `VITE_POSTHOG_KEY` in the build and are compiled out of `VITE_HEIST_BUILD=replay|verify` builds.
- **Sim changes**: re-run `npm run vendor-sim` and deploy the backend before the Heist site (`vendor-sim:check-remote` gates the Pages workflow).

## Pink Paw Knight (Swordcat)

The founder's third-person three.js + Vite adventure ("Swordcat"), a tiny knight with a pink bow
rescuing lost kittens. It lives in its own repository, not in this monorepo, and is shown in the Token
Tails shell at `/swordcat` (CLIENT.md, "Pink Paw Knight (/swordcat)"). It is on by default (launch, Oct 16 2026) with
no env needed: `NEXT_PUBLIC_SWORDCAT` and `NEXT_PUBLIC_SWORDCAT_PICKER` are kill switches only (`0`,
`false`, `no` or `off` turns off the page or the picker card), and `NEXT_PUBLIC_SWORDCAT_URL` is an optional
override.

- **Title** (one constant): "Pink Paw Knight", subtitle "A Token Tails Adventure", in
  `client/components/swordcat/title.ts` (`SWORDCAT_TITLE`, `SWORDCAT_SUBTITLE`). The page meta, the host
  (iframe title, loading and error lines), the picker card (upper-cased) and the tests read it; it must
  match `BRAND.title` in the Swordcat repo's `src/core/brand.js`. Pink Paw has not yet approved its name
  as the title. To rename the game: (1) change `SWORDCAT_TITLE` (and `SWORDCAT_SUBTITLE` if needed) in
  `title.ts`; (2) change `BRAND` in the Swordcat repo's `src/core/brand.js` to the same text; (3) update
  the expected string in `__test__/swordcat-title.test.ts`; (4) rebuild the game with `npm run
  build:tokentails` so `client/public/swordcat-game/` carries the new name. Nothing else in `client/`
  holds the name: the same test fails on a literal copy in the page, host, flags, bridge or picker.
- **Picker card**: an inline pixel SVG (no image file) on the night/gold palette: Clem, the game's knight,
  as an ivory cat with an ink outline and her pink bow on the left ear, under the gold ":3" coin. Text
  "Rescue lost kittens with a tiny knight": no shelter, impact or money words (CLAIMS R2/R3/R9/R10).
- **Catnip stays in the game.** The game's catnip is its own currency; nothing reaches the player's
  Token Tails catnip, Tails or lives.
- **Hosting** (founder decision 2026-10-14): same origin, like the Heist. The Swordcat repo's
  `npm run build:tokentails` builds and copies `dist/` (minus the chunk manifest and maps) into
  `client/public/swordcat-game/`; `/swordcat` frames `/swordcat-game/index.html?embed=1`. The game's
  `base: './'` keeps every path relative, so the folder name is free. Size: about 58 MB in some 560 files
  (largest files are music MP3s of a few MB; nothing near GitHub's 50 MB per-file warning). That is far
  more than the Heist and it lands in every Vercel deploy and in the Capacitor app's `public/` copy;
  options if that is too much: an asset diet (trim music and the KayKit/level packs further), Git LFS
  for the binaries, or the `NEXT_PUBLIC_SWORDCAT_URL` override to a CDN. Local dev against the game's
  dev server: `NEXT_PUBLIC_SWORDCAT_URL=http://localhost:5175/` with `npm run dev` there.
- **Bridge v1** (`components/swordcat/bridge.ts`): envelope `{ns: 'tt-swordcat', v: 1, type}`; unknown
  types are ignored. The host sends `hello` until the game answers `ready {version}`: every 500 ms for
  10 s, then every 2 s with no hard stop (a slow phone can need longer to boot; the page shows a "still
  loading" note with Reload after 10 s and a Reload / Back to games panel after 2 min, and a late `ready`
  still connects). When the frame reloads after the handshake it says hello again. After `ready` it sends `session {signedIn}`, `audio {muted}` (the shell's one mute), `pause` and `resume`
  (while a GameModal is open). The game sends `level-complete {levelId, time, kittens, catnip, lives,
  rank}`, `kitten-rescued {kittenId}` and `paused {paused}`. The host accepts a message only from the
  iframe's window and the game's origin and posts to that exact origin, never `'*'`. No `accesstoken`
  or Firebase token ever crosses the bridge.
- **Phase 1 saves nothing.** `level-complete` is not stored or posted anywhere; it adds no game type,
  catnip, Tails or lives.
- **Phase 2** (needs a founder decision): add a `GameType` and its caps in `shared/` and in every copy
  (DEVELOPMENT.md), and save only through `POST /user/catbassadors/live` from the host. No second
  write path. The game has no deterministic replay, so a posted result could be forged; caps must
  reflect that.

## Pawlegends

A 3v3 cat-and-dog MOBA in `pawlegends/` (three.js, Vite; Phase 1 POC, spec
`docs/plans/moba/POC.md`, which wins over `GDD.md` in the same folder). The player picks one of eight
upright, Pink Paw Knight-style heroes and a Paw Trick (Pounce, Snack Break, Hiss), and plays with two bot
allies of its own side against three bots of the other side on Purrhaven Crossing. Cats: Clem, Sage and the
four shelter champions (sim v9) Lambo (tank), Avietė (assassin), Bengas (mage) and Gabė (support); dogs: Sir
Brutus and Cacklejaw. A match ends on a core kill, at the latest at 11:00 (safety end); most end between 5
and 8 minutes. The whole match runs in a deterministic integer sim (`pawlegends/src/sim/`, 30 ticks a second,
`SIM_VERSION` 9) in a Web Worker, and the backend replays it.

- **Difficulties**: Rookie (match 1 only, Clem pre-selected, "Play as Clem"), Easy (matches 2 and 3), then
  the Easy, Normal and Hard chips from match 4. The level sets the three enemy bots; the player's allies play
  at Normal, and at Hard on Hard. Rules per level (truce, Sunset and Sudden Death times, catch-up XP, the
  takedown chip) are in POC.md §7.2 and §7.3 and `src/data/bots.ts`.
- **Desktop controls** (`src/input/`): RMB moves and attacks, A then LMB attack-moves, Q W E R cast at the
  cursor (quick cast, the default; Settings "Aim on hold" shows the indicator until release), D Paw Trick, B Nap.
  Trackpad mode (Settings Auto / On / Off; Auto turns on for a player who left-clicks the ground and never
  right-clicks) moves and attacks with LMB. The game draws its own cursor (`src/input/cursor.ts`): cream arrow,
  red arrow over an enemy, mint arrow over an ally, red crosshair with attack-move armed, gold reticle while
  aiming (32 px, 48 px with Settings "Cursor size" Large). The hovered unit gets a bold ring (red enemy, mint ally), and
  when a unit-target quick cast would hit a different enemy hero, that hero gets a thinner red ring. Touch keeps
  the joystick and button cluster.
- **Hosting**: same origin, like the Heist. `npm run build:client` in `pawlegends/` writes
  `client/public/pawlegends-game/` (about 1.4 MB, committed); `/pawlegends` frames
  `/pawlegends-game/index.html?embed=1` (CLIENT.md, "Pawlegends (/pawlegends)").
- **Bridge v1**: envelope `{ns: 'tt-pawlegends', v: 1, type}`, host side
  `client/components/pawlegends/bridge.ts`, game side `pawlegends/src/embed/bridge.ts` and
  `src/embed/integrate.ts`; both test against `shared/pawlegends-bridge.fixtures.json`. The host says `hello`
  until the game answers `ready {version}` (every 500 ms for 10 s, then every 2 s; a "still loading" note
  after 10 s and a Reload / Back to games panel after 2 min). On every `ready` it re-sends `app {isApp, store,
  notify}`, `session {signedIn, progress}`, `audio {muted, music?, sfx?}`, `roster {cats}` (each cat may carry
  `sprite`, its sprite sheet, for the game's card skins), `featured {cats}` (optional `sprite` and `tier`),
  `champions {cats}`, `offer {offer}` and `entitlements {token}`, plus a pending `pause`; it also sends `save-result {matchId,
  status, catnipPaid, catnipTotal, fastestWin}`, `resume` and `purchase-result {catalogId, ok}`. The game sends
  `match-result {replay, summary, matchId}`, `request-sign-in {reason}`, `open-cat {catalogId}`, `offer-seen
  {kind, catalogId}`, `champion-offer {catalogId}`, `skin-preview {catalogId}` (a featured cat's card skin was
  previewed on the pick screen; the host puts that cat first in its next offer ask), `notify {where}`, `share {kind, url}` (same-origin
  `/pawlegends` links only) and `paused`; the old `purchase-intent {sku}` gets a legacy refusal. The game accepts a host from
  `VITE_EMBED_ORIGINS` (default tokentails.com and www.tokentails.com, `http://localhost:3000` in its dev
  server) plus its own origin when the parent is same-origin. Both sides post to the exact origin, never
  `'*'`, and no `accesstoken` or Firebase token crosses.
- **Saves** (`components/pawlegends/saves.ts`): every finished match, won or lost, is posted as `{type:
  'PAWLEGENDS', pawlegends: <replay>}` to `POST /user/catbassadors/live`, the only write path. Without a
  Firebase user it waits in `tt.pawlegends.queue.v1` (12 at most) as a device match; after sign-in the host
  asks "ADD YOUR MATCHES?" (the Heist claim prompt). 2xx and 409 are done; `PAWLEGENDS_SIM_VERSION` purges
  matches of that version; other 4xx drop the match; 401, 403 and 428 keep it; 429, 5xx and network errors
  back off and honour `Retry-After`. The results save chip says "Saved to your account", "Kept on this
  device" (with a "Save your wins" button) or "Not saved yet. Trying again soon."
- **Rewards**: the first replay-verified win per difficulty pays catnip once (`PAWLEGENDS_LEVEL_CAPS`: Easy
  20, Normal 40, Rookie 10, Hard 0; 70 in all), stored in `pawlegendsCatnip.<difficulty>` and counted in
  `catnipCount` and `TOTAL_CATNIP_CAP`. The backend also keeps `pawlegendsFastestWin` and `pawlegendsMatches`
  per difficulty; a guest merge carries all three maps (`backend/src/pawlegends/pawlegends-merge.ts`).
- **Local progress** (browser storage, never in the sim or on the server): daily quests, the Treat Track
  (fixed-order cosmetic chests, nothing random or for sale), the bot ladder and personal bests.
- **Wave A** (`docs/plans/moba/GAPS.md` §3; render, UI and local meta only: no `SIM_VERSION` change, replays and
  hash trails unchanged):
  - **Treat Track** (`src/meta/treats.ts`, state v2; a v1 record migrates once): 30 fixed-order chests for all 8
    heroes, then a fixed loop of palette coats (8 palettes × the 4 originals), so it never runs dry. Clem, Sage,
    Sir Brutus and Cacklejaw get coats and palette variants; the shelter champions get a "<name>'s Pal" title, a
    frame and a "Meet the real cat" postcard (card art and a short story, `src/ui/collection.ts`), never a recolour,
    since they wear their real card's coat. Nothing a $5 card gives (element chroma, Companion Kitten, card badge,
    card skin) is on the track. The chest screen ("Pick your next target") sets the hero whose next reward the next
    chest holds, with "about N matches to go". The second emote is a palette coat (one emote slot in a match).
  - **Cacklejaw coats**: his Track coats now recolour his fur and head (`src/render/chars/specs.ts`, `lookCoat`).
  - **Quests** (`src/meta/quests.ts`, 17): adds `win_lambo`, `win_aviete`, `win_bengas`, `win_gabe`, "Play a
    shelter champion" and "Calm Pudding twice". Slot 1 is the day's "Win with <hero>", round-robin by date (each
    hero every 8 days; the first 3 matches name the hero being played). Rewards are Treat XP only; no quest opens
    or triggers an offer (`src/money/offer.ts` unchanged).
  - **Grade** (`src/meta/grade.ts`, pure on `MatchResult.stats`): S/A/B/C by role (carry vs tank/support weights),
    MVP, and "Best on your team" on a loss. Treat XP S +40, A +25, B +10, never catnip. On the ladder the grade
    replaces the old KDA impact (an S or A loss costs half; not stacked). Thresholds per role from
    `node tools/grade-calibrate.mjs`; on fresh seeds mage and support sit about 6 points off the ±5 target.
  - **Results**: "Run it back" (same hero, trick and difficulty, a new seed; PostHog `rematch_click`) and "Switch
    cat" (pick screen, difficulty kept). A rematch stays in the same page session, so no second offer card.
  - **Timers**: a top-centre next-objective chip ("Pudding in 0:42", "Calm Pudding!", escort HP, camp respawns,
    "Sunset in …", "Sudden Death in …"), minimap countdown rings and a portrait strip with death timers from
    `respawnIn`, all from snapshots and events. Enemy camps show once a clear was seen. A chip tap sends no ping yet
    (Wave B, B1).
  - **Touch target lock**: tap an enemy hero or its strip portrait to lock it for 5 s (until it dies or is past
    9 m); Attack and smart casts then take it. Settings "Target first": Heroes (default) / Lowest HP % / Closest,
    plus optional last-hit and tower buttons (off by default).
  - **Small items**: first win of the local day +150 Treat XP (no streak, no catnip); the loading screen shows the
    match count on this hero and, in a card skin, its Bond; the pick screen shows the role label (no lane hint until
    bots swap lanes in B1); allied bots cheer the player's takedowns and assists (fixed lines in turn, at most one
    every 8 s).
- **Roster**: the signed-in player's cats (24 at most) become element chromas, tier frames (non-pack cats
  only), collection frames, breed coats and up to two Companion Kittens that follow the player's wave. They
  are cosmetic and never enter the sim. Cat cards (`src/ui/cards.ts`): a "Your squad" strip on the pick
  screen, the save chip and companion card on results.
- **Card skins** (GDD §7.2, `src/render/skins/`, render only: never sim input, no `SIM_VERSION` change, replays
  unchanged): every owned cat is a skin any of the 8 champions can wear. The roster's `sprite` URL names the breed
  folder (`assets/<FAMILY>/<variant>.png`), which picks a palette row from `families.gen.ts` (58 families,
  `npm run gen:skins`, overrides in `overrides.json`); unknown families and accessory colours come from a sprite
  probe outside matches, then the starter breed coat, then an element preset. The cat's coat, eyes, ears and nose go
  on the champion's own rig; team-colour parts never change and the chroma path is off while a card skin is worn;
  the dogs wear a cat costume (fur, pattern and ears, their own heads). **Rarity ladder**, one addition per rung:
  Common (recolour and an element chest gem), Rare (element trim), Epic (footfall glints), Legendary (fur foil on
  Med / High and a ring when a Nap recall lands). Rung = max(tier rung, Bond rung): the tier counts only for
  origins adopt, redeem, portrait and starter (a pack cat or a cat with no origin is Common); **Bond** is finished
  matches wearing the skin (3 Rare, 10 Epic, 30 Legendary), kept in the local profile. The pick screen's Skins row
  holds Classic, coats and owned cats (by rung, Bond, newest); Settings has Skin effects All / Mine only / Off. On
  the web from play session 2, up to two locked featured cats get a Preview (8 s spin, no price, no link; the game
  sends `skin-preview`), and showcase bots may wear one (capped at Rare). App builds: owned skins only.
  **Local preview without a host**: open the standalone build with `?skins=demo` (for example
  `http://127.0.0.1:5176/?skins=demo` under `npm run dev`, or a local static server on the `client/public/pawlegends-game`
  copy), then Choose hero (the title shows it after the first match; the first match always wears the default looks). It loads a fixed five-cat demo roster (`src/app/skinDemo.ts`: Legendary, Epic and Rare
  adopted or redeemed cats, a Common adopted cat and an Epic pack cat that shows as Common) through the normal roster
  path. It runs only on localhost, 127.0.0.1, ::1 or `file://`, never in a host frame or an app build, grants
  nothing, sends nothing, and seeds no featured cats or offers. Sprite probes need network to the CDN; offline the
  table palettes still apply.
- **Shelter champions** (sim v9, POC.md §6 addendum): four heroes inspired by real Pink Paw cats' Token Tails
  cards (`pawlegends/src/data/heroes/shelter.ts`; licence for the names and photos, Oct 11). They are free to
  play for everyone in every build, the app included; bots pick them too. Owning a champion's card (web only)
  adds cosmetics: a "From <name>'s card" badge on the pick tile, the Companion Kitten and the element chroma.
  `GET /pawlegends/champions` gives the host the cards; the host sends them as `champions {cats: [{catalogId,
  forSale, catImg?}]}` (never for sale in an app build). The champion's info panel on the title (lobby) screen
  is information only. The one purchase surface is the Meet card: after a non-owner's 3rd finished match on a
  champion whose card is for sale the card is due until it has been shown (`championShown` in the local
  profile); the game sends `champion-offer {catalogId}` then and once each later page load, and the host, unless
  a card was already shown that visit, asks `GET /pawlegends/offer` with that card first (its normal per-visit
  ask too). Champion cards are never featured storefront cats. Every global cap still applies (never session 1 or an
  app build, lobby and results only, one a session, one a day, the same cat not for 3 days, age band and spend
  cap). Its copy: "Inspired by <name>'s Token Tails card." and "See <name>'s card ›", no price word (the Token
  Tails checkout shows it). Owned-or-trial access (a weekly free champion, earned unlocks) is a founder call and
  is not built.
- **Cats for sale**: the game's own `pl_*` store is retired (old entitlement tokens still dress the heroes).
  The host features at most two unowned direct-purchase cats from `GET /cat/sale` (`featuredBridge.ts`; never
  packs, never random). `GET /pawlegends/offer` may name one as the session's single "Meet <cat>" card: never
  in session 1, at most one a session and one a day, only in the lobby or on results. `open-cat` opens the
  host's own sheet (`PawlegendsCatSheet.tsx`) with the $5 Token Tails cat checkout, the age question, the
  under-16 block and the spend caps (`PawlegendsCheckoutGuard`, BACKEND.md). App builds get no featured cats,
  no offer, no checkout and no purchased cosmetics.
- **Analytics**: consent-gated PostHog in the game (`VITE_PAWLEGENDS_POSTHOG_KEY` in the build; the shared
  `tt-analytics-consent` key; every event carries a `human` flag) and host events from
  `client/analytics/pawlegends-events.ts` (`pawlegends_open`, `pawlegends_save`, `pawlegends_guest_claim`,
  `pawlegends_signin_prompt`, `pawlegends_meet_open`, `pawlegends_cat_purchase`).
- **Checks** (in `pawlegends/`): `npm run typecheck`, `npm test`, `npm run lint:sim` (no floats,
  `Math.random` or wall clock in `src/sim`), `npm run lift -- --check`, `npm run build && npm run budget`
  (first-load JS 450 KB gzip), `npx playwright test --workers=2`, `npm run vendor-sim:check`, and the headless
  gates: `npm run match -- --gate balance` (2,000 seeds; at 400 seeds the 70% core-kill check sits within noise),
  `npm run match -- --seeds 200 --check-determinism` and `npm run determinism -- --seeds 200`
  (README "Run and check" has the full list and the nightly gates).
- **Sim changes**: bump `SIM_VERSION`, re-run `npm run vendor-sim` (writes
  `backend/src/vendor/pawlegends-sim/`), deploy the backend, then the client build. `GET /pawlegends/sim`
  serves the bundle hash (`npm run vendor-sim:check-remote -- <backend url>`). The backend refuses replays of
  any other version, and the host purges queued matches of an old version.

Known gaps (POC): heroes are procedural runtime models (the §6.9 fallback, no baked GLBs; `bake:heroes` and
`bake:map` are not written); chromas tint the hero only; the device gate (iPhone 11, Pixel 6a, Iris Xe) is not
measured; the Stripe runs use a fake client, never Stripe test mode; the playtest average fun score is 5.2/10
against a goal of 8 (POC.md §7.2, round 2); mixed-species teams, items and match modifiers are left for the MVP.

## Base (Home)

`components/base/scenes/BaseScene.ts`. The player's cats live here as NPCs. Feeding raises the
`EAT` status to 4 through `CatContext`, which optimistically adds the feed reward and calls
`PUT /cat/:id`. Clicking another owned cat switches the active cat. Gravity is 700.

## Shelter

`components/shelter/scenes/ShelterScene.ts`, fed by `components/shelter/Shelter.tsx` through
`useStorefront` (one shared `/cat/sale` query, 45 s stale time). Spawns purchasable cats as NPCs in
one `NPC_SPAWN_BATCH`: the famous cats (`token-tails`), the event zone (`token-tails-2`) and a sample
of the partner shelter's cats (`rozine-pedute` by default; roles come from `_meta`), memoised per
visit and never mutating the cache. Cats with a missing or broken sheet are skipped and reported. An
empty partner zone gets an "All adopted, thank you!" sign and empty house zones "Back soon" (decision
#87), once per session; a failed load shows a degraded notice with RETRY. An elevator and speech
bubbles (names escaped) decorate the scene. Clicking a cat emits `CAT_CARD_DISPLAY`, which opens the
card modal and the payment flow.

## Tileset extrusion

WebGL bilinear sampling bleeds neighbouring pixels at tile edges, producing seams. The
`extrude:<name>` scripts run `tile-extruder` at 32 by 32 pixels (33 for enemies) over
`public/base/<name>-original.png` and write `public/base/<name>.png`. The `-original` files are
the authored sheets; the game references the extruded output. `extrude:enemies` writes back to
its own input path, so keep a copy before running it. Four `-original` sheets (summer, camp, sei,
cat-winter) are stale against the runtime sheets; the night skins are built from the runtime sheets.

## Level authoring

Levels are Tiled JSON maps. `node client/scripts/art/tile-legend.mjs` lists a map's tiles per layer
(`legend`), counts a gid per chunk (`count --gid 248 --layer catnip`) and replaces gids in every
chunk (`replace --from 1058,1059 --to 159`, a dry run unless `--write` or `--out`). It replaces the
old `a.js` and `b.js`, which hard-coded Windows paths (task 6d). Art sources (`.aseprite`, `.tmx`)
live in `client/art/src/`, not in `public/`.

## Night look art (G7)

`node client/scripts/art/build.mjs` builds the palette (`client/art/palette.json`, `.gpl`), a night
skin of every runtime sheet at the same tile indices (`public/base/<sheet>-night-v1.png`, 32 x 32,
margin 1, spacing 2), parallax plates from the landing hero (`public/landing/plates/`), posters and
`public/look/manifest.json`, which the look runtime reads. `--gates` checks palette, edge-SSIM and
the 3:1 contrast of every collidable and hazard tile without writing. New art gets versioned names
(`-v1`); old files are never overwritten or deleted, because installed native builds load them.
The plates are derived programmatically; artist cleanup is deferred (decision #46). Details:
`docs/plans/alignment-log/6d.md`.

## Landing reel

`client/components/reel/GameplayReel.tsx` plays short WebM clips captured from the games
(`client/e2e/capture/`, stepped frame by frame through `window.__TT_CAPTURE__` in a
`NEXT_PUBLIC_CAPTURE=1` build). The manifest is empty until the clips are re-captured against such a
build, so the landing shows no reel today (decision #53 includes the Heist once clips exist).
