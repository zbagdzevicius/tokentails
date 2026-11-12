# Pawlegends feel pass: fixed diagonal camera, HUD diet, hold-to-aim, art

Date: 2026-11-08. Base: `origin/main` a2dc4063, branch `feat/pawlegends-feel`.

**Scope.** This pass changes only the client: `src/render`, `src/input` and `src/ui`, plus art in `public/assets`. It
does not touch `src/sim` or `src/data`, because SIM v16 is being built in parallel. Every proposal that would change
how the game plays is listed under [SIM v17 proposals](#sim-v17-proposals-not-in-this-pass).

**What this plan is based on.** The scratchpad notes from 2026-11-08: AUDIT.md (bot matches at 667x375, 844x390 and
1440x900), RESEARCH.md (MLBB, Wild Rift and LoL camera, HUD and aim research, plus Wild Rift pain points that players
raised and Riot answered) and CHAMPS.md (a review of how the heroes counter each other).

**Rules for this pass.**
- No feature flags. New behaviour is the default.
- Leave the sim hash untouched: the replay and lockstep tests must still pass.
- Test every touch change at 667x375 and 844x390.
- Zero friction: a quick tap still quick-casts, and flash fires on the same tick toward the hero's heading.

## Founder decisions (the default applies if there is no answer)

| # | Question | Default |
|---|---|---|
| D1 | The five heading dashes and blinks (Clem E, Raspberry E, Bengal E, Gabby E) and the Pounce trick fire on press, so they cannot be held to aim. Should they get hold-to-aim? | **Keep firing them on press, toward the heading.** The joystick sets the direction. Wild Rift's flash complaint (players swiping it the wrong way in a panic) supports this choice. Every other skill can already be held to aim. |
| D2 | Desktop camera: locked like on mobile, or free with edge pan like LoL PC? | **Locked.** Holding the minimap shows that spot, and the view returns when the button is released. Edge pan and the arrow-key pan are removed. |
| D3 | Should the camera-height setting be the same for everyone in PvP? | **No.** Every step is open in PvP too (Nov 9: five steps, Close 0.88 to Max 1.4; every player has the same setting, as in Mobile Legends). Vision is decided in the sim (`sim/map/brush.ts` `visibleTo`: bushes and stealth, no distance fog) and each seat's snapshot leaves hidden units out, so a further camera reveals nothing hidden. |

---

## BUILD checklist (do the steps in order; each step is one commit with its own tests)

### B1. Fixed camera: remove all drift (`src/render`)
1. Remove the lane lead: `CAMERA_FRAME.lead` and `lead()` in `gameView.ts` (around L94, L670, L932, L959).
2. Remove the intent look-ahead: delete `camera/lookAhead.ts` and the code that uses it in `gameView.ts` (L699–720,
   `this.ahead`). Also remove the `AimPreview.pointer` handling that only existed for it.
3. Remove the fight camera's lean, pull-back and own-ult zoom punch (`anim/cam.ts`, `fightCam.leanX/Z`, `punchScale()`,
   `gameView.ts` L955–960). Replace the punch with a 150 ms darkening vignette (10%) on your own ult. Make it a CSS
   overlay that does not move the camera.
4. Make the follow rigid: the focus equals the interpolated render position of the hero, with no `dt×14` lerp
   (L968). The 60% snap on jumps over 2 m is no longer needed, because the follow is always exact.
5. Remove pinch and wheel zoom from matches: `src/app/noZoom.ts` keeps blocking the browser zoom, and the pinch
   handlers in `touch.js` / `Input.js` go. Replace `zoomSlider.ts` with a Settings row, **Camera height**,
   stored per device (`render/camera/height.ts`, `ui/cameraHeightRow.ts`). Nov 9: five fixed steps, a segmented
   control **Close 0.88 / Normal 1.0 / High 1.12 / Higher 1.25 / Max 1.4** (was Normal / High); the camera stays
   fixed at every step, there is still no pinch or free zoom. On desktop each wheel notch or +/− moves one step,
   clamped at the ends. The shadow box, the outer forest (`OUTER_DRESS`) and the minimap view box all cover Max.
6. Change panning:
   - **Minimap hold-to-peek** (touch and mouse). While a finger or the mouse button holds the minimap, the camera centres on
     that point. On release it returns to the hero in **150 ms** (ease-out). Remove the old "drift back after 3 s"
     behaviour (`gameView.ts` L743, L952).
   - **Edge pan and arrow-key pan** are removed (D2).
   - **Aim pan**, used only by long skills. While a skill is dragged and its range is more than 85% of the visible
     half-width (Sage R, Rocket R), move the camera toward the aim point by `min(6 m, range − 0.85·halfWidth)`.
     It returns in 150 ms on release or cancel.
7. Keep camera shake, but cap it at 0.25 m and 120 ms (`CameraShake.js`, Juice tiers). Shake is the only movement the
   camera makes besides following the hero.
8. Snap the camera instantly on respawn and on any blink or dash longer than 2 m.
9. **Framing constants.** Put them in a new `src/render/camera/frame.ts`, replacing `CAMERA_FRAME`'s
   `lead/below/shortBelow`:

   | Constant | Value |
   |---|---|
   | `PITCH` | 52° (0.908 rad), fixed for every distance. Replaces `isoPitch(d) − MOBA_PITCH_DROP`. |
   | `FOV` | 36° vertical in landscape (was 38°) |
   | Ground width across the hero's row | 30 m at 844x390, 26 m at 667x375, linear between and clamped. Solve the distance as `D = width / (2·tan(hFov/2))`, which gives about 21.3 m at 844x390 and 22.5 m at 667x375 (today about 20.9 m). Desktop at 1440x900 keeps about 27.8 m. |
   | Hero position on screen | 50% across, 54% down (`camera.setViewOffset`, so it holds for any yaw) |
   | Focus clamp | Remove the `clampFocusX/Z` map clamp. The hero stays at the fixed framing even at the fountain, as in MLBB, and the outer ground and decor (A9) fill the view beyond the map. |

10. Tests:
    - In `gameView` / camera unit tests, the hero's screen position stays within ±2 px of (50%, 54%) while walking,
      aiming, fighting and casting the ult, at 667x375 and 844x390.
    - Peek returns within 150 ms.
    - Aim pan is 0 for a 7 m skill and at most 6 m for Sage R.
    - Re-run the audit script (`scratchpad/feel/scripts/audit.cjs`). `camera.walking` must show a hero spread of ≤ 4 px
      (today it is x 221–375).

### B2. Diagonal map orientation for both teams (`src/render/coords.ts` and every place that reads the yaw)
1. In `coords.ts`, set `CAMERA_YAW` so that sim +x points up and right on screen. The ground yaw is **38°**, which puts
   the base-to-base line at about **31°** on screen at 52° pitch. `setViewTeam(1)` keeps the existing `+ π`, so each
   team sees its own base bottom-left and the enemy base top-right. For team 0, Sunny Lane runs along the upper-left
   side and Puddle along the lower-right side; for team 1 they swap, as in Wild Rift and MLBB.
   Decide the sign of the angle with the test in step 8, not by guessing.
2. Replace `viewSign(): ±1` with a rotation: add `screenToSim(dx, dy)` and `simToScreen(x, y)` (a 2D rotation by the
   view yaw) and delete `viewSign`. Change every place that uses it:
   - the stick and drag aims in `input/touch/touchControls.ts` (L622, L781, L1013);
   - `stickYaw` in `input/touch/touch.js` (L411);
   - `render/fx/fun/skills2Fun.ts` (L87);
   - `gameView.ts` L687 (`below()`, removed in B1) and L731 (the screen-direction pans, removed in B1, plus whatever
     remains of the keyboard pan);
   - `skillfx/bengas.ts` `towardCam`, which already reads `cameraYaw()`; check it.
3. Keep `input/heading.ts` and the press-fired flash and dashes in sim space. The joystick heading reaches them through
   `screenToSim`, so a flash pushed "up-right" on screen goes up-right on screen for both teams.
4. Desktop: the mouse already raycasts to the ground (`input/screen.ts`). Check that WASD and arrow movement, if any
   is left, goes through `screenToSim`.
5. Minimap (`ui/minimap.ts`): replace the `flip` with a rotation by the same ground yaw. Draw the map image rotated
   inside a square canvas. The 100×60 m map rotated 38° has a bounding box of about 116×109 m, so it fits a square
   minimap almost exactly. `minimapMapping` becomes a rotate-and-scale with an exact inverse, for tap-to-peek and pings.
   The minimap's cache key gains the yaw.
6. Check every effect that is turned with the camera (yaw-baked billboards, slash crescents, name plates, the
   `IsoRig`/`Occluders` fade of trees and walls between the camera and the hero, shadows and the light direction) at
   yaw 38° and 218°. Occluders must fade the props on the camera side of the hero and no others.
7. Spawn toast: show "Your base: bottom left" for 1.2 s, with a paw sticker (art A6), on both seats. On team 1, add
   "(map turned)" for parity with Wild Rift's reminder.
8. Tests:
   - For each team, project both fountains: the own fountain must be left of and below the enemy fountain on screen,
     and the angle between them must be 31° ± 3°.
   - Dragging an aim 100 px up and right lands up and right of the hero on screen, for both teams.
   - Tapping the minimap at a tower's minimap pixel peeks at that tower.
   - Re-run `scratchpad/feel/scripts/occl.cjs` for both seats.

### B3. HUD diet (`src/ui`, `src/input/touch/touchArc.ts`)
**Targets.** These use the audit's union-of-painted-boxes measure, with every HUD element shown. Today the HUD covers
29.7% of the screen at 667x375 and 27.8% at 844x390.

| Measure | 667x375 | 844x390 |
|---|---|---|
| HUD area, persistent elements, all shown | **≤ 19%** | **≤ 16%** |
| HUD inside the centre band (20–80% across, 15–85% down) | ≤ 4% | ≤ 3% |
| Persistent HUD in the play area around the hero (18–60% across, 12–78% down) | **0** | **0** |

Transient banners (≤ 1.2 s) are allowed only in the top band, under the 24 px strip.

**Remove**
- `.pl-bar` (the hero box with portrait, HP and XP). The HP bar over the hero already shows HP. Add a 3 px XP line and
  a level pip to the own hero's world-space bar (`ui/hpBars.js`, `ui/overhead.ts`).
- `.pl-strip.ally` (ally portraits). The minimap shows the same thing.
- The persistent objective chip `.pl-rail`. Its timer moves into the top strip as an icon and a countdown, shown only
  from 10 s before the objective spawns to 3 s after.
- The standalone `.pl-pause` and `.pl-pingbtn` pills. Pause becomes an icon at the right end of the top strip. Ping
  becomes a 44 px hit area at the minimap's bottom-right corner (36 px drawn), opening the existing ping wheel.
- The in-match scoreboard button and settings gear. Both move into the pause menu.
- Duplicate level-up messages on desktop: keep the single "Rank up!" card and drop the top banner.
- Duplicate death messages: keep the grey-out and one centred "Back in N" counter. Drop the "You have been slain"
  banner and the rail's "Back in" line.

**Shrink and merge**
- Score `.pl-score.lol` (294×45) becomes **one 24 px top strip, at most 220 px wide**: kills A–B, the timer, the tower
  counts as small icons, the objective timer when due, and pause.
- Minimap (164×100, top-right) becomes **112×112 px, top-left** (104 at 667x375, using `arcScale`), at 80% opacity
  and rotated as in B2.
- Kill feed: **at most 2 lines**, 3 s each, 12 px text, to the right of the minimap. Multi-kills go to the announcer
  banner.
- Enemy strip `.pl-strip.enemy` becomes a target-lock row: only enemies within 1.5× attack range, at most 3, **40 px**,
  in a bottom row just left of the cluster (below 80% of the height). Tapping a portrait locks the target.
- Locked R: the 70 px "Lv 4" button becomes a **44 px ghost chip** (35% opacity, lock and "4") in the R slot. It grows
  to full size with a pop when it unlocks.
- The "nothing in reach" ring: replace the large saturated red circle with a 2 px white dashed ring at 30% opacity,
  shown for 0.4 s only when ATK is pressed with nothing in range.
- Joystick: floating, appearing where the thumb lands in the left 40% × bottom 70% of the screen. Ring **120 px**, knob
  **52 px**, at 30% opacity when idle and 70% when active, and not drawn at all after 3 s idle.

**Button arc** (`touchArc.ts` `BASE`). Values are px at scale 1 (390 px tall). `rx` is measured leftwards and `by`
upwards, both from the cluster's bottom-right corner to the button's centre. Q, W and E sit on a 116 px arc and R and
the trick on a 196 px arc, both around ATK's centre. The new limits are `ARC_GAP` 14 and `ARC_TOP` 192 for the main
buttons; the right-edge column below is exempt from `ARC_TOP`.

| Button | Today (rx, by, d) | New (rx, by, d) | Note |
|---|---|---|---|
| ATK | 48, 48, 96 | **46, 46, 92** | |
| Q | 160, 30, 60 | **161, 34, 64** | left of ATK |
| W | 140, 105, 60 | **141, 112, 64** | up-left |
| E | 75, 146, 60 | **74, 158, 64** | above |
| R | 214, 140, 70 | **219, 138, 72** | outer arc, up-left; ghost chip of 44 px until unlocked |
| Trick (flash) | 6, 127, 48 | **241, 32, 52** | outer arc, bottom-left beside Q, as in MLBB. Bigger, because it is the panic button. |
| Last-hit | 275, 95, 44 | **26, 214, 44** | right-edge column above E. Shown only while a minion that one hit would kill is in range; hidden otherwise, not faded. |
| Tower | 290, 30, 44 | **84, 250, 44** | right-edge column. Shown only while an enemy structure is in range. |
| Nap (recall) | 229, 47, 46 | **26, 312, 44** | top of the right edge, under the top strip. **Hold 300 ms to start**, so it cannot be mis-tapped. |

With these values the main cluster is about 268 px wide (today 312) and the smallest gap is 14 px (R–W). Keep the
left-handed mirror. Settings "Large" stays at ×1.12. Lock the layout with `minGap ≥ 14` in `touchArc` tests and update
`hud-compact.spec.ts`. Any slot may move by up to 12 px if a thumb test at 667x375 says so.

**Safe areas.** Pad by `env(safe-area-inset-*)` + 8 px, and place no button within 44 px of the notch side.

**Tests.** Re-run `audit.cjs` at both phone sizes and check the area targets above. Add a Playwright check that no
persistent HUD element intersects the play area around the hero.

### B4. Hold-to-aim and quick-cast (`src/input/touch/touchControls.ts`)
Audit result: hold, drag, release-to-cast, cancel and quick tap all work on the 9 non-dash skills tested. The dashes
are covered by D1. Changes:
1. Tune the constants:

   | Constant | Today | New |
   |---|---|---|
   | `DRAG_PX` | 16 | **18** |
   | `DRAG_FULL_PX` | 90 | **100**, still shortened near the screen edge, minimum 40 |
   | `HOLD_PREVIEW_MS` | 200 | **180** |

   A release that moved 18 px or less always casts at the auto-target: a quick cast, or the point shown by the hold
   preview. This fixes taps that turn into aims by accident.
2. **Move the cancel ✕.** Today `.pl-cancel` sits at the top centre (`ui.css` L468), 299–340 px from Q, W and E, on
   top of the objective chip. Replace it with a **72 px cancel bubble 150 px above the pressed button**, clamped 12 px
   inside the screen. It fades in when the hold starts, turns red with a haptic tick once armed, and keeps the 120 ms
   `CANCEL_DWELL_MS`, so a fast drag that passes through it does not cancel. Keep the second way to cancel: dragging
   back onto the pressed button (`CANCEL_SLACK`).
3. R once unlocked: run a hold-to-aim test for R. It was untested in the audit because R was locked; use a level-4
   debug start in the e2e test.
4. Flash and dashes (D1 default): they keep firing on press toward the heading on the same tick. Do not add a delay
   for drag detection.
5. Client-side ATK targeting (`input/targeting.ts`, not the sim):
   - ATK picks, in order: an enemy hero within attack range + 1.5 m, then a minion this hit kills, then the closest
     unit.
   - A target lock breaks at range + 1 m for melee and range + 2 m for ranged.
   - While an enemy Howler has E active, the ATK ring and quick-cast auto-targeting skip him, as the bots already do
     with `deterBasics`.
6. e2e matrix at 667x375 and 844x390: tap, hold then release, drag then release, cancel by the bubble, cancel by
   returning to the button, joystick plus skill with two fingers, and the press-fired flash landing on the same tick.

### B5. Positioning and readability fixes
1. Hero framing: covered by B1 (50%, 54%). An ally 6.8 m behind you must now be on screen; `occl.cjs` checks
   `offscreenWithin12m`.
2. Off-screen pointers: keep them on the screen edge but outside every HUD box (cluster, minimap, top strip, joystick
   zone). Slide them along the edge to the nearest free spot.
3. Name plates:
   - Show the short name only ("Noodle", not "Noodle the Clem").
   - Drop the "You" label and arrow after the first 10 s of the match; a gold ring under the hero's feet marks you.
   - When plates overlap (as at the fountain), offset them vertically.
4. Talent card: never open it during combat (any damage dealt or taken in the last 3 s). Queue it, then show a
   compact card at the top centre, at most 64 px tall, never over the ground the fight is on.
5. Juice:
   - Hitstop on your own heavy hits and kills: 50 ms, capped at 90 ms, none on minion hits.
   - The ult vignette from B1.3.
   - A distinct 120 ms audio cue for each enemy hard-CC windup (stun, charm, fear, root).

### B6. Wrap-up
- Run the checks: `npx tsc --noEmit`, `npx vitest run`, the sim replay and hash tests (they must be unchanged), and the
  Playwright HUD and aim specs.
- Re-run all three audit scripts and copy the before and after numbers into this file.
- Capture screenshots at 667x375 and 844x390 for each phase: lobby, pick, fountain, lane, team fight, death, talent and
  results.

---

## Results (BUILD done 2026-11-08, branch `feat/pawlegends-feel`, not pushed)

| Measure | Before | After |
|---|---|---|
| HUD area, persistent elements all shown (`tests/e2e/hud-area.spec.ts`, 1 px raster) | 667x375 29.7%, 844x390 27.8% | **19.4%**, **15.9%** |
| HUD in the centre band (20–80% across, 15–85% down) | 19.3%, 15.9% | 8.5%, 5.1% |
| Persistent HUD in the play area around the hero (18–60%, 12–78%) | – | **0%** at both sizes |
| Hero screen spot while walking (844x390) | x 221–375, y 157–242 | x 422, y 211 (50%, 54%), spread 0 px |
| Base-to-base line on screen (both seats, `tests/unit/diagonal-view.test.ts`) | horizontal | 31° ± 3°, own base bottom left |
| Button cluster width (scale 1) | 312 px | 267 px, smallest gap 14.2 px (R–W) |

Notes and deviations:
- **HUD targets.** With the plan's exact sizes the 667x375 total is 19.4%, 0.4 point over the ≤ 19% estimate; 844x390
  meets ≤ 16%. The centre-band estimates (≤ 4% / 3%) cannot be met while W, R and half of Q and the trick sit inside
  that band; the play area, which the plan protects instead, is empty. `hud-area.spec.ts` holds today's numbers
  (19.5% / 16%, centre 9% / 5.5%) so the HUD cannot creep back. Shrinking the 667x375 minimap to 96 px would reach 19%.
- **Cancel by sliding back.** The plan says dragging back onto the pressed button cancels. It never did: since
  playtest #1 it casts like a tap (the smart-cast centre, `AIM_BACK_PX`). Kept as is; the only cancel is the bubble.
- **Minimap long press.** Holding the minimap now peeks (B1), so the old touch long-press "Go here" ping is gone;
  pings go through the paw corner and the wheel (desktop Alt-click still pings Go here).
- **Lock break.** A lock set from afar (tap, 9 m) still holds while the player closes in; it breaks only once its
  hero, having been within range + 1 m (melee) / + 2 m (ranged), leaves that distance.
- **Art.** A9 (off-map ground tile) is not wired: the procedural outer grass (MAP-GAPS A22) matches the playfield
  and the painted tile would bring back the edge seam. The talent-card and pause-panel frames have a cream fill that
  needs the cards' text recoloured; left for a follow-up.

## ART checklist (generated with Gemini via `/gemini-imagegen`)

**Style for every image.** Chunky cartoon, soft cel shading and thick warm-brown ink outlines (#3b2417), in the same
cute chibi style as the heroes. No text in the images, because the UI adds it. Leave the middle quiet so the UI can sit
on top.

**Palettes.**
- Purrhaven (cats): rose #ff6f91, cream #fff3dc, deep #c94a72.
- Woof (dogs): ochre #b5762b, brown #5b3a1e, deep #6e4520.
- Accents: "you" gold #ffd34d, ally blue #3d8bff, enemy red #e8414b. Use them sparingly, never as large fields.
- Night variants: indigo #1e2140 with warm lantern #ffb85c.

**Format.** Export WebP at quality 80 to `pawlegends/public/assets/<folder>/`, with 1920 and 1280 variants like
`lobby/arena-1920.webp`. Stickers and frames are WebP with alpha. Add each one to
`public/assets/LICENSES.md` ("generated, Gemini, 2026-11").

| # | Asset | Size (px) | Palette / mood | Where it is used |
|---|---|---|---|---|
| A1 | **Lobby background**: a sunny meadow with Purrhaven's cat castle on the left and Woof's dog fort on the right, a toy-strewn path between them and a diagonal river | 1920×1080 + 1280×720 | both team palettes, daylight | `lobby/lobbyScreen.ts` behind the play button; replaces `meadow-*.webp` |
| A2 | **Pick screen background**: a stage with a spotlight, a curtain, and paw-print confetti on the floor | 1920×1080 + 1280×720 | rose to ochre gradient, warm stage light | hero pick (`ui/screens.ts` pick) |
| A3 | **Loading / matchup splash**: two halves split by a diagonal slash from bottom-left to top-right, cat side in rose (bottom-left), dog side in ochre (top-right), clouds of dust where they meet | 1920×1080 + 1280×720 | team palettes, high contrast | loading screen before the match; the diagonal echoes the new camera |
| A4 | **Victory background**: a cat (or dog) team pile-up with a trophy fish bone, ribbons and confetti. **Defeat background**: a rainy porch, a soggy toy, cute and not sad | 1920×1080 + 1280×720, one per species and outcome (4 images) | Victory: gold #ffd34d with the team colour. Defeat: desaturated, lavender #8a7fb5 | results screen |
| A5 | **UI frames**: the top-strip plate (220×24, 9-slice), the minimap rim (128×128 with a 112 hole, paw-stitched border), the pause-menu panel (9-slice 96×96, corners 32), the talent-card frame (360×64, 9-slice) | as listed, @2x | cream #fff3dc plate, brown ink border | `ui.css` / `lol-hud.css` `border-image` |
| A6 | **Mascot stickers** (with alpha, 256×256 @2x): a cat pointing bottom-left ("your base" toast), a dog pointing top-right, a cat holding a "?" for help, a sleeping cat (Nap / recall), a dog with a stopwatch (respawn "Back in N"), a celebrating cat and dog (first blood, multi-kill) | 256×256 | team palettes | spawn toast (B2.7), death counter, announcer banners, recall channel |
| A7 | **Ping and emote stickers** (128×128): "On my way" paw, "Danger" fur-up cat, "Group up" huddle, "Nice!" thumbs-paw, "Oops" | 128×128 | white outline on a transparent background | ping wheel (`ui/pingWheel.ts`), shown on the minimap and above heroes |
| A8 | **Pause and settings backdrop**: a blurred cushion fort | 1280×720 | soft rose and cream | pause menu (now also holding the scoreboard and settings) |
| A9 | **Off-map ground**: a seamless tile of meadow, picket fences and toy blocks | 1024×1024, tileable | muted greens #7fae5a / #5d8a44 | the outer ground plane, now visible at the map corners with the fixed diagonal camera (B1.9) |
| A10 | **Cancel bubble and lock-chip icons**: a scared-cat ✕ (cancel bubble, B4.2) and a padlock with a paw (locked R chip, B3) | 144×144 / 88×88 | red #e8414b / grey | touch controls |

Reject any generated image that contains text or logos, or that looks like Mobile Legends, Wild Rift or another real
game. Keep the source prompts in `pawlegends/art-src/feel-pass/PROMPTS.md`.

---

## SIM v17 proposals (not in this pass)

These come from CHAMPS.md. Measured on SIM v15, nothing has been applied. Hand them to the sim team as one batch after
v16 lands, because they change match outcomes.

**What drives them.**
- Crowd control (CC: stuns, roots, fears, charms) gets no shorter when it is chained: there is no tenacity and no
  diminishing returns.
- Nine Lives caps HP loss at 45% per second, so the fastest kill is about 2.1–2.7 s.
- So any CC chain longer than about 2 s is a death the victim cannot answer.
- Only 5 of 22 skillshots can be dodged on reaction offline, and only 4 online, with an estimated 400 ms online reaction
  budget. LoL, Wild Rift and MLBB skillshots take 0.55–1.0 s at max range.

| # | Change (exact data) | Gap it fixes |
|---|---|---|
| P1 | Projectile `speed`: Lambo Q 16000→12000, Bravo Q 15000→12000, Bengal Q 18000→14000, Pixel Q 18000→15000, Rocket Q 21000→17000, Domino Q 17000→14000, Frankie R 20000→18000. Each shot then takes 0.5–0.77 s at max range. | Most skillshots cannot be dodged on reaction |
| P2 | `CC_DR = { window: 60, bp: 5000, cap: 45, immune: 30 }`. For 2 s after a hard CC ends, new hard CC lasts half as long; 1.5 s of CC inside that window grants 1 s of CC immunity. Needs new world fields `ccDrT` and `ccDrSum`, included in the hash. | Chains of 2.5–3.25 s |
| P3 | Cacklejaw W `windup` 0→8, `fear` 24→21. Meatball W `windup` 0→9. Hiss `fear` 30→21. Brutus E `speed: 14000` plus a 6-tick windup. Lambo E `speed: 12000`, `radius` 2200→1800. | Instant area CC with no telegraph |
| P4 | Raspberry `w.chargeDelay: 15`; R damage no longer consumes Charged. | Point-and-click 6 m stun |
| P5 | Brutus R `duration` 90→75; Pounce and Purr-ify clear the caster's tether before they resolve. | 3 s cage with no escape |
| P6 | Lambo R and Gabby R `windup` 15→20; Bravo R 18→21; Duchess R 18→21 with `stacks` 2→1; Domino R `windup` 15→18, `range` 11000→9500. | Big ults can be escaped only near their edge |
| P7 | Bengal W `windup` 9→15. | "Turn away" cannot be done in time |
| P8 | Purr-ify `immune` 15→30, and it breaks tether; Pixel R and Chili R `immune` 15→21. | Cleanse expires before the ult lands |
| P9 | Cacklejaw R `windup` 0→9, with the victim chosen when the order is given and marked during the windup; `r.speed` 24000→20000. | 12 m homing execute with no warning |
| P10 | Howler E gets `e.fearRange: 4500` and ignores zone ticks. The client-side skip is already in B4.5. | Fears any attacker at any range |

**Also noted.**
- There is no anti-heal in the game.
- Domino and Pixel have no dash.
- Brush hides heroes from area abilities, even ones that visibly cover the brush.
- Nine Lives makes assassins and tanks lose the same share of HP in the first second.

**Gates after the batch.**
- 2,000-seed balance (cats win 47–53%) and the per-hero floors.
- The `hard`, `novice` and `feedNormal` runs.
- v16 `pvp-symmetry`, with the per-hero `pvp` numbers re-fitted.
- A new unit test: every hard-CC or Spot projectile has `windup×33 + range×1000/speed ≥ 550 ms`.
