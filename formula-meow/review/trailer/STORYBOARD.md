# Formula Meow: 30 s trailer storyboard

A generic game trailer: no hackathon, contest, prize, chain, donation or shelter-funding copy. Fun, fast and
shareable. Two cuts from one edit decision list (EDL):

| Cut | Size | Rate | Codec | Audio |
|---|---|---|---|---|
| `out/formula-meow-trailer-30s-16x9.mp4` | 1920x1080 | 60 fps CFR, 1800 frames, 30.000 s | H.264 High, yuv420p, CRF 16, +faststart | AAC 48 kHz stereo 320k, -14 LUFS integrated (±0.5), true peak <= -1.0 dBTP |
| `out/formula-meow-trailer-30s-9x16.mp4` | 1080x1920 | same | same | the same mix |

Source of truth for every claim: `formula-meow/README.md`, `docs/plans/formula-meow/SETPIECES.md` section 16,
`src/content/ids.ts`, `src/types.ts` (`ITEM_IDS`), `src/juice/audio/announcer.ts` (`ANNOUNCE_TEXT`).
Branch `feat/formula-meow` at 3890b118 (SIM_VERSION 9).

## 1. Beat grid

- **144 BPM.** One beat = 0.41667 s = **exactly 25 frames at 60 fps**. One bar = 100 frames. 30.0 s = 18 bars.
  Every cut is on a beat (frame multiple of 25) or a half-beat (multiple of 12.5, used only where noted). Bars 0 to 15
  are the action (0 to 26.667 s); bars 16 and 17 are the end card (26.667 to 30.000 s, 3.33 s).
- The score is the game's own race song "Kaunas Neon Nights" (`SONGS[1]`, A minor, saw lead, 128 BPM in game),
  rendered offline at 144 BPM. Its final-lap form (+2 semitones, B minor, as `Music.finalLap()` does) takes over at
  bar 12.

## 2. Timeline (both cuts)

`f` = frame at 60 fps. Text cards are drawn in the edit (section 5), never by the game. "Card" = the on-screen words.

| Shot | f in–out | s in–out | Len | Bar | Picture | Card | Group |
|---|---|---|---|---|---|---|---|
| S01 hook-loop | 0–100 | 0.000–1.667 | 1.667 | 0 | Neon Rooftops: our kart hits the loop (s244) and rides it upside down, the city flipping past | – | A |
| S02 grid-go | 100–150 | 1.667–2.500 | 0.833 | 1 | Kitchen Counter grid: "MEOW! Go!", 8 karts launch | – | A |
| S03 pack | 150–200 | 2.500–3.333 | 0.833 | 1 | Cat Café Chaos: the pack fights through the first bend, rivals left and right | – | A |
| S04 wall | 200–250 | 3.333–4.167 | 0.833 | 2 | Laundry Spin: wall ride on the curled lane (s208), camera rolled | WALL RIDE! | A |
| S05 jump | 250–300 | 4.167–5.000 | 0.833 | 2 | Yarn Canyon: mid-air over the gap (s56), sunset mesas | BIG AIR! | A |
| S06 tunnel | 300–350 | 5.000–5.833 | 0.833 | 3 | Neon Rooftops: air-duct tunnel (s96), neon streaks, boost flames | TUNNEL RUN! | A |
| S07 loop-tv | 350–400 | 5.833–6.667 | 0.833 | 3 | Pink Paw Shelter Sprint: the exercise-wheel loop (s74) from the side "TV" camera, karts going round | LOOP-DE-MEOW! | A |
| S08 fly-kitchen | 400–425 | 6.667–7.083 | 0.417 | 4 | Kitchen Counter intro flyover | 8 CATS · 6 TRACKS (holds 400–550) + track name | B |
| S09 fly-rooftops | 425–450 | 7.083–7.500 | 0.417 | 4 | Neon Rooftops flyover | (card) + "Neon Rooftops" | B |
| S10 fly-laundry | 450–475 | 7.500–7.917 | 0.417 | 4 | Laundry Spin flyover | (card) + "Laundry Spin" | B |
| S11 fly-yarn | 475–500 | 7.917–8.333 | 0.417 | 4 | Yarn Canyon flyover | (card) + "Yarn Canyon" | B |
| S12 fly-cafe | 500–525 | 8.333–8.750 | 0.417 | 5 | Cat Café Chaos flyover | (card) + "Cat Café Chaos" | B |
| S13 fly-shelter | 525–550 | 8.750–9.167 | 0.417 | 5 | Pink Paw Shelter Sprint flyover | (card) + "Pink Paw Shelter Sprint" | B |
| S14 drift | 550–600 | 9.167–10.000 | 0.833 | 5 | Kitchen Counter: long drift, sparks climb to the third (pink) tier | DRIFT | B |
| S15 boost | 600–650 | 10.000–10.833 | 0.833 | 6 | Same take continued or Café: mini-turbo release, FOV kick, flames | BOOST | B |
| S16 item-hit | 650–700 | 10.833–11.667 | 0.833 | 6 | Neon Rooftops: our hairball hits the kart ahead, it spins out as we pass | 8 ITEMS | B |
| S17 item-zoomies | 700–725 | 11.667–12.083 | 0.417 | 7 | Zoomies: speed burst past two rivals | – | B |
| S18 item-box | 725–750 | 12.083–12.500 | 0.417 | 7 | Box / laser dot on the kart | – | B |
| S19 jump-pack | 750–800 | 12.500–13.333 | 0.833 | 7 | Kitchen Counter jump gap (s116) with a rival in the air beside us | – | A |
| S20 gp-podium | 800–875 | 13.333–14.583 | 1.250 | 8 | Grand Prix podium: top three on plinths, gold trophy, confetti | GRAND PRIX | B |
| S21 tt-ghost | 875–925 | 14.583–15.417 | 0.833 | 8–9 | Time Trial on Kitchen Counter against the translucent dev ghost | TIME TRIAL | B |
| S22 battle | 925–1000 | 15.417–16.667 | 1.250 | 9 | Balloon Battle on the Living Room Rug: a balloon pops | BALLOON BATTLE | B |
| S23 doodle-draw | 1000–1100 | 16.667–18.333 | 1.667 | 10 | Track Doodle: a loop of road drawn by a finger, then the Loop sticker drops on the beat | DRAW A TRACK | B |
| S24 doodle-race | 1100–1150 | 18.333–19.167 | 0.833 | 11 | That doodled track opened from its share link, the kart takes the doodled loop | SHARE THE LINK | B |
| S25 dare | 1150–1200 | 19.167–20.000 | 0.833 | 11 | A dare link: "Race Mia's ghost" banner, Mia's ghost kart on the grid beside us | DARE A FRIEND | B |
| S26 c-laundry-loop | 1200–1225 | 20.000–20.417 | 0.417 | 12 | Laundry drum loop, a rival upside down above us | – | A |
| S27 c-cafe-loop | 1225–1250 | 20.417–20.833 | 0.417 | 12 | Café mug-handle loop (s220) | – | A |
| S28 c-shelter-wall | 1250–1275 | 20.833–21.250 | 0.417 | 12 | Shelter wall ride (s154) | – | A |
| S29 c-cafe-jump | 1275–1300 | 21.250–21.667 | 0.417 | 12 | Café koi-pond jump (s104), mid-air | – | A |
| S30 c-rooftops-wall | 1300–1325 | 21.667–22.083 | 0.417 | 13 | Rooftops wall ride (s123) | – | A |
| S31 c-kitchen-tunnel | 1325–1350 | 22.083–22.500 | 0.417 | 13 | Kitchen bread-bin tunnel (s196), boost pad | – | A |
| S32 c-laundry-jump | 1350–1375 | 22.500–22.917 | 0.417 | 13 | Laundry jump (s168), 2 m drop, landing burst | – | A |
| S33 c-kitchen-wall | 1375–1400 | 22.917–23.333 | 0.417 | 13 | Kitchen wall ride (s177) | – | A |
| S34 hero-slowmo | 1400–1525 | 23.333–25.417 | 2.083 | 14 | Café koi-pond jump in slow motion (sim at 0.25x), speed ramps back to 1x on the landing at f1500 | – | A |
| S35 finish | 1525–1600 | 25.417–26.667 | 1.250 | 15 | Crossing the line in 1st: finish orbit, confetti, "You win!" | – | A |
| S36 end-bg | 1600–1800 | 26.667–30.000 | 3.333 | 16–17 | End card over a slow attract orbit round our kart (blurred, darkened); black last 10 frames | FORMULA MEOW / by Token Tails / Coming soon | B |

Totals: 36 shots, 1800 frames. Group A: 18 shots (S01–S07, S19, S26–S35). Group B: 18 shots (S08–S18, S20–S25, S36).

### Rhythm

- 0–1.67 s hook (one shot, no cut, music pad + riser), GO crash at 1.667 (the band lands on the downbeat, as in game).
- 1.67–6.67 s: 2-beat cuts, the four set-piece slams.
- 6.67–9.17 s: 1-beat cuts (the six tracks), then 2-beat cuts for drift / boost / items, two 1-beat item stabs.
- 13.3–20.0 s: modes and the editor breathe a little (3- and 4-beat shots); the music drops to the "leader" mix (hats,
  heartbeat kick, lead up an octave) for the editor, then the final-lap riser across bar 11.
- 20.0–23.3 s: eight 1-beat cuts, final-lap key change and 16th hats.
- 23.3–25.4 s: the one slow shot (slow motion), drums out, a whoosh into the landing at f1500 (the drop comes back).
- 25.4–26.7 s: the finish. 26.7–30.0 s: title, sting, fade.

## 3. Copy (every line, with its source)

| Card | Where | Source in the code |
|---|---|---|
| WALL RIDE! · BIG AIR! · TUNNEL RUN! · LOOP-DE-MEOW! | S04–S07 | the game's own announcer and callout lines, `ANNOUNCE_TEXT` in `src/juice/audio/announcer.ts`; the four piece kinds are in SETPIECES.md section 16 |
| 8 CATS · 6 TRACKS | S08–S13 | README "an 8-cat kart race"; `TRACK_IDS` (6 circuits) in `src/content/ids.ts` |
| Track names (lower third) | S08–S13 | Kitchen Counter, Neon Rooftops, Laundry Spin, Yarn Canyon, Cat Café Chaos, Pink Paw Shelter Sprint (README "Tracks") |
| DRIFT · BOOST · 8 ITEMS | S14–S16 | README "Driving" (hold to drift, three charge tiers) and `ITEM_IDS` (8: hairball, yarn, cucumber, catnip, box, bell, zoomies, laser) |
| GRAND PRIX · TIME TRIAL · BALLOON BATTLE | S20–S22 | README "Modes" |
| DRAW A TRACK · SHARE THE LINK · DARE A FRIEND | S23–S25 | README "Track Doodle", "Sharing: dare a friend (your ghost rides in the link)"; the results button "Dare a friend" |
| FORMULA MEOW / by Token Tails / Coming soon | S36 | `index.html` title; the route is not live (below) |

Rules: no numbers beyond 8 cats, 6 tracks, 8 items; no player counts, ratings, platforms, store badges, prices or
dates; no "free", "out now", "play now", "on your phone"; no URL. No em dashes in on-screen copy.

**URL check (2026-10-21):** `https://tokentails.com/meow-race` and `https://tokentails.com/formula-meow-game/index.html`
both return 404 (the branch is not merged to `main`). So the end card says **Coming soon** and shows no URL. The URL is a
founder decision (section 9).

## 4. Framing: 16:9 and 9:16

Both cuts are **captured natively**, not cropped. The sim is fixed-step and deterministic for a given track, seed,
class and input (the bot is pure), so the same anchor tick gives the same action in both aspects; only the camera rig
differs (the chase camera has a portrait form: higher and pitched down, `ChaseCamera.setAspect`).

| Aspect | Viewport (CSS px) | deviceScaleFactor | Canvas | Notes |
|---|---|---|---|---|
| 16:9 race shots | 960x540 | 2 | 1920x1080 (DPR cap 2) | `landscapeBonus` +8° FOV, as players see it |
| 9:16 race shots | 540x960 | 2 | 1080x1920 | the portrait rig (the game is phone first); `hasTouch: false` so the tier stays `high` (bloom) and no touch thumbs draw |
| 16:9 editor (S23) | 1440x810 | 4/3 | 1920x1080 | the desktop editor layout as in `review/v3/1440x900-editor-stickers.png` |
| 9:16 editor (S23) | 432x768 | 2.5 | 1080x1920 | the phone editor layout |
| dare banner (S25) | as race shots | | | the DOM banner stays visible in this shot only |

Card safe areas: 16:9, cards centred on the lower-middle third (y 56–78 %), track names bottom-left at 6 % margins.
9:16, cards at y 30–48 % (clear of the top 10 % and bottom 22 % where social apps draw their UI), track names at y 70 %.
End card: centred in both.

## 5. Look

- **Palette** (from `index.html` `:root`, used in the game UI): ink `#2a1a22`, night `#1a1238`, cream `#fff3dc`,
  butter `#ffd27a`, peach `#ff9f7a`, rose `#ff3ea5`, sky `#2cf6f3`. Callout tones (`juice/vfx/popups.ts`): pink
  `#ff7cc4`, cyan `#7ff9f6`, gold `#ffd27a`.
- **Fonts** (OFL, already in the public repo, licences next to them): `client/public/fonts/passion-one-latin-900-normal.woff2`
  (cards and title), `client/public/fonts/nunito-latin-wght-normal.woff2` at weight 900 ("by Token Tails", "Coming
  soon", track names). Copy them into `review/trailer/fonts/` with their `LICENSE-*.txt`. The game itself uses the
  system `ui-rounded` (SF Pro Rounded); do not ship SF fonts in a video (Apple licence).
- **Card style** = the game's sticker callout: cream fill, 4 px ink outline at 1080p (6 px on the title), 7 px ink drop
  below, rotated -4° (alternate +3° on every other word), pop-in scale 0.2 → 1.08 → 1 over 6 frames with the
  `cubic-bezier(.2,1.6,.4,1)` overshoot, hold, then a 4-frame scale-out on the next cut. Word slams (S04–S07, S14–S16,
  S20–S25) land on the cut frame. Tones: set pieces pink, tracks cyan, drift/boost/items gold, modes cream on rose
  pill, Doodle/share/dare cyan.
- **Render the cards** as transparent PNG sequences in headless Chromium (an HTML page in `review/trailer/edit/` with
  the two fonts via `@font-face`), one sequence per aspect, then overlay in ffmpeg. Deterministic: the page takes a
  frame number and draws that frame.
- **Grade**: none heavy. A light S-curve (`eq=contrast=1.06:saturation=1.08`), 2 % black point, no LUT. Flyovers
  (S08–S13) +4 % saturation. End card: S36 background `gblur=sigma=18`, brightness -0.25, a rose-to-night radial
  vignette.
- **Transitions**: hard cuts only, plus a 2-frame white flash (`#fff3dc` at 60 %) on the GO cut (f100), on the final-lap
  cut (f1200) and on the landing (f1500); a 6-frame zoom-punch (scale 1.00 → 1.06 → 1.00) on each set-piece slam cut.
- **Game DOM is hidden** in every shot except S23 (editor) and S25 (dare banner): `shell.hud.setVisible(false)` plus an
  injected style `body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}`. The game's
  own "LOOP-DE-MEOW!" popups are hidden too; our cards say the same words.

## 6. Capture method (shared by groups A and B)

Files (committable): `review/trailer/capture.mjs` (runner), `review/trailer/shots.mjs` (the recipes below as code),
`review/trailer/clock-shim.js` (init script). Outputs (gitignored): `build/dist/` (the game build),
`build/anchors.json`, `build/footage/<16x9|9x16>/<shot>.mp4` (+ `stills/`), `build/manifest.json`.

1. **Build and serve** (never port 5175, never 6131): `vite build --outDir review/trailer/build/dist --emptyOutDir`,
   then `vite preview --outDir review/trailer/build/dist --host 127.0.0.1 --strictPort --port <P>`.
   Ports: **group A 6231, group B 6232, audio render (vite dev, section 7) 6233**. Kill each server when done.
2. **Browser**: Playwright Chromium with the Metal flags from `playwright.config.ts`
   (`--use-angle=metal --ignore-gpu-blocklist --enable-gpu`); never SwiftShader (it drops the render scale).
   URL switches on every race shot: `&quality=high&bloom=1`. Each shot gets a fresh context (clean localStorage).
3. **Virtual clock** (`clock-shim.js`, `context.addInitScript`, capture-only, no game change): wraps
   `performance.now`, `Date.now`, `requestAnimationFrame`/`cancelAnimationFrame`, `setTimeout`/`setInterval`. In
   `live` mode it passes through to real time (menus, loading, clicks). `__cap.freeze()` switches to manual time;
   `__cap.step()` advances exactly 1000/60 ms, fires due timers, then flushes the rAF queue once (the shell loop,
   the showroom, the editor all run on rAF). It also pauses every `document.getAnimations()` and sets its
   `currentTime` to the virtual clock (CSS pop-ins and the dare banner then step with the sim).
4. **One sim step per frame**: the shell's loop computes `dt` from timestamps, so before each step the runner
   quantises the accumulator: `s.acc = Math.round(s.acc / DT * 1e6) / 1e6 * DT + 1e-9` (`DT = 1/60`; `acc` is a
   private field, reachable from page JS). A normal frame then runs exactly one sim step; slow motion
   (`shell.simSpeed = 0.25`, as `review/v3` does) and the juice lane's hit-stop still accumulate. The runner logs the
   tick delta per frame and fails a take with a 0- or 2-step frame outside S34 and hit-stop windows.
5. **Probe, then record.** For each shot a fast probe pass (no screenshots, `shell.simSpeed = 8`, which is set at
   runtime and so keeps the warp effect; never the `?speed=` URL switch, which turns warp and the intro flyover off)
   finds the **anchor tick** where the shot's condition first holds, and writes it to `build/anchors.json`. The record
   pass reloads the same URL, fast-forwards at simSpeed 8 to `anchor - lead - 60` ticks (1 s handle), sets simSpeed
   1, freezes the clock, and records `lead + tail + 120` frames. Both aspects use the same anchors.
6. **Frames**: CDP `Page.captureScreenshot` (PNG, `optimizeForSpeed`) piped to ffmpeg, `libx264 -crf 12 -preset slow
   -pix_fmt yuv420p -r 60`, one file per shot per aspect. Stills every 30 frames for the contact sheet. The manifest
   keeps per frame: tick, the player's `si`, `rail`, `air`, `surface`, and the frame's race events (`go`,
   `driftTier`, `miniTurbo`, `hit`, `balloonPop`, `finish`, set-piece enter/exit), so the edit can put an event on
   an exact frame.
7. **Common page helpers** (as in `review/v3.review.spec.ts`): `W = __fm.shell.world`, `k = W.st.karts[W.cfg.humans[0]]`,
   `t = W.track`, `p = t.pieces.find(q => q.kind === KIND)`,
   `INTO = ((k.si - p.i0 + t.n) % t.n) / Math.max(1, (p.i1 - p.i0 + t.n) % t.n)`.
   Conditions used below:
   - `LOOP_TOP`: `k.rail > 0 && k.su > 33 && k.su < 44`; `LOOP_IN`: first tick `k.rail > 0`
   - `JUMP_MID`: `k.gapLaunch > 0 && k.airTicks > 22`; `JUMP_LAUNCH`: first tick `k.gapLaunch > 0 && k.airTicks === 1`;
     `JUMP_LAND`: first tick after a launch with `k.air === 0`
   - `TUNNEL_MID`: `k.branch === -1 && t.tunnelMask[k.si] === 1 && INTO > 0.4 && INTO < 0.7`
   - `WALL_ON`: `k.air === 0 && k.surface === 6` inside the wall piece
   - event anchors: the first `W.st.events` entry of a type for `kart === me` (or `b === me` for hits we land)
8. **Wall lanes** (S04, S28, S30, S33): the bot steers back to its racing line after ~0.7 s, and the AI never rides
   Shelter's or Café's lane. Preferred: 40 m before the piece set `shell.bot = false` and hold ArrowUp with no steering
   (SETPIECES §15: a player with no steering is drawn onto the lane); set `shell.bot = true` again 1 s after the
   lane ends. Fallback: the v3 teleport (60 % into the lane, dropped from 3 m, velocity along the road,
   `shell.camera.snap(...)`), done at `INTO` 0.15 and only inside the pre-roll handle, never on screen.
9. **Seeds**: the bot is an average player, so "1st" and "a rival right ahead" are seed luck. A seed sweep (probe
   only, simSpeed 8, seeds 1–40) picks per shot the seed that best meets the shot's want (listed per shot). Record the
   chosen seed in `shots.mjs`. Default `cls=2` (Zoomies 150cc) for speed on screen; `cls=1` where the 150cc bot
   crashes the piece.
10. **Audio is muted while capturing** (no user gesture unlocks it; any key press for the wall lanes happens after
    `shell.updateSettings({ muted: true })` in that throwaway context). The soundtrack is rendered separately.

## 7. Audio

All sound is the game's own WebAudio synth (`src/juice/audio/`: `music.ts`, `sfx.ts` `playCue`, `announcer.ts`
`playLine`, `stings.ts` `playUi`, `synth.ts` `makeNoise`). Every function takes a `SynthGraph` with a
`BaseAudioContext`, so it renders in an **OfflineAudioContext** (as `share/clip/clip-audio.ts` already does).

- **Render** (`review/trailer/audio/render.mjs`): start `vite --port 6233 --strictPort` (dev server, so `/src/...` modules
  import), open `review/trailer/audio/render.html` through it, and in the page:
  `new OfflineAudioContext(2, 48000 * 30, 48000)`; build `Music` with a stub budget `{ admit: () => true }`, clear its
  `setInterval` timer, `setSong(1)`, then drive its private `play(step, t)` for every 16th from t = 0 with the bpm
  forced to 144 (`m.bpm = 144`) and the layer mix from `musicMix(...)` per bar (below). Export the buffer to
  `build/audio/score.wav` (48 kHz float). Then render SFX and announcer stems the same way to `build/audio/sfx.wav`.
- **Arrangement (bars)**: 0 `pre` mix (pad + heartbeat) with the `finalLap()` riser (filtered noise + saw sweep) ending
  on f100; 1 `go()` crash + `race` place 8 (full band and lead); 2–3 place 8; 4–5 place 3 (no lead, arp filter
  opening); 6–9 place 8; 10–11 place 1 (drums drop to hats and heartbeat, lead an octave up: the editor breather),
  riser across bar 11; 12–13 `finalLap` (+2 semitones) with `hats16`; 14 to f1500 `pre` mix (slow-motion drop, pad +
  heartbeat), full band back on f1500; 15 place 1 + `finalLap`; 16–17 `results(won = true)` mix for 1 bar, then out.
- **SFX hits** (`playCue`, vol 0.7–1, on the frame of the matching game event from the manifest): `loopRush` S01 and
  S07/S26/S27; `go` f100; `wallOn` S04/S28/S30/S33; `gapLaunch` + `gapLand` S05/S19/S29/S32/S34; `tunnelIn` S06/S31;
  `driftTier` n = 1, 2, 3 in S14; `turbo` S15; `item` + `hit` S16; `catnip`-style whoosh on S17 (`turbo` n = 3);
  `roulette` + `itemReady` S18; `podium` (`playUi`) S20; `splitAhead` S21; `balloonPop` S22; `stamp` (`playUi`) on the
  Loop sticker drop in S23; `confirm` S24; `trill` S25; `finish` + `win` S35; `cupWin` (`playUi`) on the title f1600.
- **Announcer** (`playLine`, the game's formant cat voice): `go` ("MEOW! Go!") ending on f100; `wallRide`, `bigAir`,
  `tunnelRun`, `loopDeMeow` on S04–S07 (the words on screen and in the ear match); `win` ("You win!") in S35.
- **Glue**: a whoosh on every 2-beat cut (the band-pass noise sweep from `clip-audio.ts`), an engine bed from
  `engine.ts` (or the clip's saw purr) under bars 1–15, ducked 6 dB under announcer lines.
- **Mix and master** (ffmpeg): score 0 dB, SFX -8 to -14 dB, announcer -4 dB, engine -18 dB; a gentle bus compressor;
  two-pass `loudnorm=I=-14:TP=-1.5:LRA=9` (measure, then linear), then `alimiter=limit=0.84` safety; check with
  `ebur128=peak=true` that integrated is -14 ±0.5 LUFS and true peak <= -1.0 dBTP. Last 10 frames silent.
  Same mix for both cuts.

## 8. Shot recipes

URL prefix for race shots: `http://127.0.0.1:<P>/`. `+Q` = `&quality=high&bloom=1`. "Lead" = frames before the
anchor that the cut starts on; "Rec" = frames recorded (cut length + 60 handle each side). The **anchor frame** is
the frame in the cut where the anchor tick lands.

### Group A (race set pieces, hook, finish: 18 shots, ~4 h incl. seed sweep)

| Shot | URL | Want / seed sweep | Anchor | Cut window | Camera and notes | Rec |
|---|---|---|---|---|---|---|
| S01 | `?track=rooftops&bot=1&cls=2&seed=<sweep>+Q` | a rival visible ahead in the loop | `LOOP_TOP` (loop s244, lap 1) | anchor at cut f70: starts 70 f before the top (the kart on the run-in, the loop rising ahead) | chase; on the loop the rig rides the ribbon (camera up follows the surface) | 220 |
| S02 | `?track=kitchen&bot=1&cls=2&seed=<sweep>+Q` | player mid-grid (karts both sides) | event `go` | `go` at cut f2 | chase from the grid; the countdown flyover is off with `bot=1` (wanted: straight to the grid). No ffwd: record from tick 0, the take is just the last 2 s of countdown | 170 |
| S03 | `?track=cafe&bot=1&cls=2&seed=<sweep>+Q` | ≥4 rivals in frame | first `driftStart` after `go` | anchor at cut f20 | chase | 170 |
| S04 | `?track=laundry&bot=1&cls=1&seed=7+Q` | – | `WALL_ON` + 18 ticks (s208) | anchor at cut f10 | wall recipe (section 6.8); the rig rolls half the curl (max `STUNT_CAM.wallRoll`) | 170 |
| S05 | `?track=yarn&bot=1&cls=2&seed=7+Q` | 1–2 rivals in the air ahead (the v3 shot had them) | `JUMP_MID` (s56) | anchor at cut f25 | chase; hang time 2.2 s, so the whole cut is airborne | 170 |
| S06 | `?track=rooftops&bot=1&cls=2&seed=<S01 seed>+Q` | – | `TUNNEL_MID` (s96) | anchor at cut f25 | chase, the tunnel's tighter rig; the boost pad at the mouth gives the flames | 170 |
| S07 | `?track=shelter&bot=1&cls=1&seed=<sweep>+Q` | ≥2 karts on the wheel at once | `LOOP_IN` (s74) | anchor at cut f8 | **TV camera**: before the anchor - 60 set `__fm.shell.camera.feel.reducedMotion = true` (render-only; the game's reduced-motion side camera for loops, hard cut in), reset after | 170 |
| S19 | `?track=kitchen&bot=1&cls=2&seed=<sweep>+Q` | a rival airborne within 6 m beside us | `JUMP_MID` (s116) | anchor at cut f25 | chase | 170 |
| S26 | `?track=laundry&bot=1&cls=2&seed=<sweep>+Q` | a rival on the loop ahead (as `review/v3/390x844-laundry-loop.png`) | `LOOP_TOP` (s66) | anchor at cut f14 | chase | 145 |
| S27 | `?track=cafe&bot=1&cls=2&seed=<sweep>+Q` | – | `LOOP_TOP` (s220) | anchor at cut f12 | chase | 145 |
| S28 | `?track=shelter&bot=1&cls=1&seed=7+Q` | – | `WALL_ON` + 18 (s154, main route) | anchor at cut f6 | wall recipe; the AI never rides it, so the player must (6.8) | 145 |
| S29 | `?track=cafe&bot=1&cls=2&seed=<S34 seed>+Q` | – | `JUMP_MID` (s104) | anchor at cut f12 | chase | 145 |
| S30 | `?track=rooftops&bot=1&cls=1&seed=7+Q` | – | `WALL_ON` + 18 (s123) | anchor at cut f8 | wall recipe | 145 |
| S31 | `?track=kitchen&bot=1&cls=2&seed=<sweep>+Q` | – | `TUNNEL_MID` (s196) | anchor at cut f12 | chase | 145 |
| S32 | `?track=laundry&bot=1&cls=2&seed=<sweep>+Q` | – | `JUMP_LAND` (s168) | landing at cut f16 (the clean-landing burst) | chase | 145 |
| S33 | `?track=kitchen&bot=1&cls=1&seed=7+Q` | – | `WALL_ON` + 18 (s177) | anchor at cut f8 | wall recipe | 145 |
| S34 | `?track=cafe&bot=1&cls=2&seed=<sweep>+Q` | a rival in the air beside or just ahead | `JUMP_LAUNCH` (s104) | launch at cut f10; from cut f12 `shell.simSpeed = 0.25`; at cut f88 ramp back to 1 over 12 frames (0.25 → 1, linear); landing (`JUMP_LAND`) must fall on cut f100 (= f1500): tune the ramp start ±6 f from the manifest | chase; slow motion is sim-only, the camera spring still runs at full rate (smooth). Ships at 125 f | 245 |
| S35 | `?track=<sweep: kitchen or cafe>&bot=1&cls=2&seed=<sweep>+Q` | the bot finishes **1st** (sweep seeds 1–40 at simSpeed 8, ~11 s each) | event `finish` with `a === 1` (player) | finish at cut f20 | chase into the game's `finishOrbit` (180° round the kart over 3 s) with the finish confetti; results panel hidden (DOM hidden); stop before the results timer (2.5 s) | 195 |

### Group B (flyovers, drift and items, modes, editor, dare, end card: 18 shots, ~4 h)

| Shot | URL / setup | Want / seed | Anchor | Cut window | Camera and notes | Rec |
|---|---|---|---|---|---|---|
| S08–S13 | `?track=<kitchen|rooftops|laundry|yarn|cafe|shelter>&seed=3+Q` (**no `bot`**: the intro flyover plays at tick 0 while the grid waits for input; no input is sent) | – | flyover time (`shell.camera.modeTime`) | per track, the 25 frames with the most track in frame (pick from stills every 6 f; default: modeTime 1.2–1.62 s) | the game's own flyover (`TrackDef.flyover` or `autoFlyover`); record the whole flyover (≈ 4–6 s) once per aspect and choose in the edit | 360 |
| S14 | `?track=kitchen&bot=1&cls=2&seed=<sweep>+Q` | a drift reaching tier 3 | event `driftTier` with `a === 3` | tier 3 at cut f30 | chase (the rig rotates 8° into drifts) | 170 |
| S15 | same take as S14 if the release follows within 40 f; else `?track=cafe...` | – | event `miniTurbo` `a === 3` | at cut f6 | the strong-boost FOV kick (+10°) | 170 |
| S16 | `?track=rooftops&bot=1&cls=2&seed=<sweep>+Q` | a rival 8–25 m ahead on the same lane | at that moment give the item: `k.item='hairball'; k.itemCount=1; k.rouletteTicks=0` (as `e2e/items.spec.ts`; the bot fires at once) | the `hit` event (`b === me`) at cut f30 | chase. Probe: repeat the give at each candidate tick until a `hit` lands within 60 ticks; keep that tick in anchors.json | 170 |
| S17 | `?track=rooftops&bot=1&cls=2&seed=<sweep>+Q` | two rivals just ahead | give `zoomies` (as above) | `boost` event at cut f4 | chase, Zoomies FOV kick, overtakes | 145 |
| S18 | `?track=cafe&bot=1&cls=2&seed=<sweep>+Q` | – | give `box` (renders the box on the kart) | give at cut f0 | chase; alt take `laser` (the Laser Dot banner is DOM, hidden) | 145 |
| S20 | **Primary**: `?track=kitchen&bot=1&seed=7+Q`, wait for the world, then in the page `const s = __fm.shell; const top3 = s.racers.slice(0,3).map(r => ({ name: r.name, cat: r.cat, kart: r.kart, hat: r.hat })); s.leaveRace(); __fmModes.podiumScene(top3, 1);` (the podium screen's own showroom scene: plinths, gold trophy, confetti 350 ms in). **Fallback** (the real flow, ~10 min live): `/?bot=1` title → `toMenu` → `[data-tile="gp"]` → `[data-act="ready"]` → `[data-act="class-0"]` → `[data-act="cup-kibble"]`, then 4 × (`mode-continue`, standings `continue`) with `shell.simSpeed = 8` set at runtime, freeze when `[data-screen="podium"]` shows | – | podium scene start | confetti burst (start + 21 f) at cut f12 | the `podium` camera swing; DOM hidden (the panel would cover it) | 195 |
| S21 | `/?bot=1` title → menu (live clock) → `[data-tile="tt"]` → `[data-act="ready"]` → `[data-act="track-kitchen"]` → `[data-screen="tt"] [data-act="start"]`; wait until `__fmModes.ttGhost.live` and label `Dev ghost`; then freeze | the ghost within 15 m ahead | first tick after GO + 4 s where the ghost (`TtGhostView`) is 5–15 m ahead | anchor at cut f10 | chase; the translucent ghost kart is the subject | 170 |
| S22 | `?track=rug&bot=1&seed=<sweep>+Q` (an arena opens as Balloon Battle) | a pop near the player | event `balloonPop` with `kart === me` or `b === me` | pop at cut f40 | chase; the kicker (s128) as a bonus if in frame | 195 |
| S23 | 16:9 viewport 1440x810 @4/3, 9:16 432x768 @2.5; `/?make&seed=4` (Track Doodle). Freeze the clock, then per frame move the mouse one point along the `stadium()` stroke from `review/v3.review.spec.ts` (20 points → spread over 60 frames, eased), mouse up, wait for "Drivable", open the Stickers tab, drag the Loop sticker (`.fm-ed-stunt[data-piece="loop"]`, `dropStunt(page, 'loop', -1)`) over 14 frames so it drops on cut f75 (a beat) | – | stroke start | stroke from cut f0 to f60, sticker drop f75, hold to f100 | the DOM is the subject (not hidden). Then press "Share" or "Race it" and keep `page.url()` (the track code) for S24. Optional: add Jump and Tunnel stickers off-camera for S24 | 160 |
| S24 | the S23 URL (`/?t=<code>`) + `&bot=1+Q` in a fresh context (as v3 "editor stickers survive the share link") | – | `LOOP_TOP` on the doodled loop | anchor at cut f30 | chase; DOM hidden | 170 |
| S25 | `/?bot=1+Q#g=<LEGACY.dare10 from review/v3-legacy-codes.ts (dare9 until SIM_VERSION 10)>&n=Mia` | – | `.fm-dare-banner` visible and `kart-Mia` in the scene | the banner's pop-in at cut f4, GO at cut ≈ f40 if it fits, else grid only | DOM **visible** except `.fm-menu-btn` and the HUD; the ghost "Mia" sits on the grid. The tap prompt is hidden by `bot=1` arming | 170 |
| S36 | `?track=cafe&bot=1&cls=2&seed=<S35 seed>+Q`, after the finish: `__fm.shell.camera.setMode('attract')` (the title screen's slow orbit) | – | finish + 3 s | any 200 f of the orbit (smooth, no cuts) | blurred and darkened in the edit under the end card | 260 |

## 9. Your call (each has a default; the build goes ahead with the default)

1. **End-card URL.** Default: no URL, "Coming soon". When `/meow-race` is live on production, swap the third line for
   `tokentails.com/meow-race` (one string in the card page) and re-render (cards and encode only, ~3 min).
2. **Release line.** Default: "Coming soon". Alternatives: "Play in your browser" (true once live), or nothing.
3. **Score.** Default: the game's "Kaunas Neon Nights" at 144 BPM. Alternative: "Forever Home Sprint" (`SONGS[5]`,
   major, brighter) at 144.
4. **Real shelter cats.** Default: not mentioned (a generic trailer). Optional sixth card "RACE REAL SHELTER CATS"
   (true: the rivals are Pink Paw cats, a dated snapshot) would go on S03.
5. **Fonts.** Default: Passion One 900 + Nunito 900 (OFL, brand fonts). SF Pro Rounded matches the game UI more
   closely but its licence does not cover video use.

## 10. Checks before handing over

- Each file: 1800 frames, 30.000 s, 60 fps CFR, correct size, H.264 High yuv420p, AAC 48 kHz; last frame black; no
  frozen picture longer than 0.5 s before f1600 (S34 is slow, not frozen).
- Loudness: integrated -14 ±0.5 LUFS, true peak <= -1.0 dBTP (`ebur128=peak=true`).
- Every cut on a 25-frame grid except the six 25-frame flyover beats and the 1-beat climax (also on the grid).
- Copy check: the card strings in the card page equal section 3 exactly; a banned-word scan (free, now, download,
  store, players, million, award, #1, prize, hackathon, win money, Arc, USDC, donate, %, $, http) fails the render.
- Contact sheet (`out/contact-16x9.png`, `out/contact-9x16.png`, a frame every 0.5 s) for review.
- No page errors in any capture (as `review/v3`); peak draw calls logged per shot (budget 120).
- Servers on 6231–6233 are stopped; nothing under `build/` or `out/` is staged.

## 11. Edit revision 2 (review fixes; `edit.sh` EDL, `edit/cards.html` and `audio/score.ts` are the source of truth)

- **Hook:** S01 opens at take f98 (the kart already at the loop, upside down by about 0.5 s). Card "CATS. KARTS. LOOPS!"
  is full size from frame 0 to f61, top of frame.
- **Set-piece cards** (WALL RIDE, BIG AIR, TUNNEL RUN, LOOP-DE-MEOW, DRIFT, BOOST, 8 ITEMS) sit at 20 % height in 16:9 and
  25 % in 9:16, above the chase-camera kart. SHARE THE LINK: top right in 16:9, low (75 %) in 9:16, away from the karts.
- **S06 9:16** starts at take f33 (from f38 on the 9:16 camera ends inside the tunnel wall).
- **S20-S22:** Grand Prix 800-850, Time Trial 850-900, Balloon Battle 900-1000 (S22 from take f35, pop still on f965).
  9:16 S20 uses take f145-194 (after the confetti burst), cropped 1.3x on the podium.
- **S23/S24:** S23 is 75 frames (the stroke at 2x, then the Stickers tab and the Loop drop at 1x; drop on f1044); S24
  is 1075-1150. 16:9 S23 is a centred 1.5x crop of the canvas and tab row (no half header). DRAW A TRACK sits inside
  the safe area (16:9 left of the loop; 9:16 over the whole hint bar).
- **S34 (not S34b):** opens mid-air over the koi pond (take f12-51 at 1x of the game's 0.3x), then f52-159 at 1.8x,
  landing on f1500, so the slow part reads as the pond flight and lasts about 1 s.
- **Copy:** "8-CAT RACES · 6 TRACKS" (8 racers per race, `roster.ts`); end-card subline and "Coming soon" 1.5x larger.
- **Audio:** beds before GO, the drop and the f1200 climax are 3.5-4 dB lower before the master limiter; the
  breakdown is +1.5 dB. SFX retimed to the take logs (S04 wall f209, S05 ramp f253, S19 ramp f753, S14 drift tier 2 on
  f552, S25 GO on f1190, S23 sticker f1044). AAC via `aac_at` (320k) when available. Colour tags bt709 via `setparams`.
