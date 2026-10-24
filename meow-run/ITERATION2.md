# Meow Run iteration 2: cooler runs, and things players make and share

The founder asked: **"make it more cool and UGC friendly."**

- **Cool** means the run feels flashier and more expressive moment to moment: air tricks, a combo chain with big callouts, near-miss slow motion, speed lines at high combo, landing impacts and a showy finish.
- **UGC** means players create and share things:
  - video clips for TikTok, Reels and Shorts;
  - photos;
  - challenge links that friends open and race against a ghost;
  - a Daily Run that is the same course for everyone that day;
  - their own cat look;
  - their own courses (trails).

This file is the plan. It covers the feature specs, the six parallel lanes, who owns which file, the integration contract and the acceptance checks for each lane. `GDD.md` describes the game and `LANES.md` describes the frozen core API. Both still apply.

## 1. Phase 0 (done by the architect before the lanes start)

The architect has already made the shared changes listed below, so each lane compiles, runs and self-tests on its own. After these changes `npx tsc --noEmit`, `npx vitest run` (90 tests) and `npm run build` pass, and the fast smoke run (`SMOKE=fast node shots/smoke.mjs`) printed `SMOKE OK` with 0 errors.

| File | What Phase 0 added |
|---|---|
| `src/core/types.ts` | `StageId` adds `'daily'` and `'trail'`. `UGC_STAGES = ['daily', 'trail']`. `STAGE_ORDER` (the stage select map) is unchanged. |
| `src/core/loop.ts` | `clock.scale` and `setTimeScale(k)` (0.1..1) for slow motion. The scale applies to the simulation and to the frame dt passed to the camera, rig, particles and hooks. The loop resets it to 1 whenever the run is not live. The fps sampler still uses real time. |
| `src/meta/save.ts` (+ tests) | Save **version 2** with a defensive migration from v1 (nothing lost). It adds `settings.capture` (`auto`, `on` or `off`), `settings.clipVertical`, `player.name`, `wardrobe { look, seen }`, `daily { day, best, distance }`, `ugcStats { bestChain, tricks, clips, photos, shares, challengesWon, dailyPlays, trailsFinished }` and `trails.mine[]`. It also adds `sanitizeName()`. Under `isUnlocked`, `daily` opens with endless and `trail` is always open. `recordResult` counts only totals for `daily` and `trail` runs. |
| `src/ui/flow.ts` | `Screen` now includes the UGC screens. `setScreen` calls the hub. The stage map shows only `STAGE_ORDER`. The results screen treats `daily` like endless and `trail` as a run with no stars and no NEXT. The new export `lastRunResult()` returns the last run's result. |
| `src/ui/thumbs.ts` | Postcard palettes for `daily` and `trail`. |
| `src/ui/index.ts` | Calls `registerUgc()` after `prepareStage('meadow')`. |
| `index.html` | Four slot rows: `#ugc-title` (under PLAY), `#ugc-select` (under the stage map), `#ugc-pause` (pause card) and `#ugc-results` (results card). |
| `src/ugc/contract.ts` | The `ugc` service object (cross-lane calls), `provide()`, `exposeTestHook()`, `PoseId` and `POSES`, `isPoseable()`, `StyleSummary`, `ChallengeInfo` and `TrailLoad`. |
| `src/ugc/hub.ts` | `addButton`, `refreshHub`, `addScreen`, `openOverlay`, `toast` and `onScreen`. `screenChanged` is called by `flow.setScreen` only. |
| `src/ugc/sharekit.ts` | `shareBase()`: `https://tokentails.com/meow-run` in production, the current page elsewhere. Also `WATERMARK`, `linkWith`, `readParams`, `clearParams`, `shareOrDownload`, `downloadBlob`, `copyText` and `fileStem`. |
| `src/ugc/index.ts`, `src/ugc/ugc.css` | `registerUgc()` starts the lanes in this order: wardrobe, style, trails, share, clip, photo. If a lane throws, the error is logged and the other lanes still start. The CSS is shared: `.btn.small`, `.btn.gold`, slot rows, `.ugc-overlay` and `#ugc-toast`. |
| `src/<lane>/index.ts` | A stub `register<Lane>()` for clip, photo, share, wardrobe, style and trails. |
| `src/wardrobe/look.ts` | `Look`, `LOOK_SLOTS`, `DEFAULT_LOOK`, `encodeLook` and `decodeLook`: 6 base-36 characters. This codec is **contract**. |

The production URL already works: `client/next.config.js` rewrites `/meow-run` to `/meowrun-game/index.html`, and query strings pass through. So `https://tokentails.com/meow-run?c=...` and `?t=...` open the game with the link.

## 2. Feature specs (summary; the lane briefs in section 6 are the full spec)

1. **Clip capture (CLIP).**
   - The game keeps a rolling replay of the last ~12 s of canvas and game audio. Recording uses `MediaRecorder` segments of 6 s, keeping the last 3.
   - **Save clip** appears on the pause card and on the results card.
   - The clip is re-encoded with a 16:9 or 9:16 crop, a small `tokentails.com/meow-run` watermark and a 1.2 s end card.
   - Sharing uses the Web Share API with the file; otherwise the file downloads.
   - MP4 is preferred when the browser supports it (Safari, and Chrome since 130), with WebM as the fallback.
   - Capture costs nothing when off or idle: a recorder exists only during play or finish. Settings has Replays (AUTO, ON, OFF); AUTO means on wherever MediaRecorder and `canvas.captureStream` exist, phones included.
2. **Photo mode (PHOTO).**
   - Opens from pause.
   - The camera orbits and pans around Mochi.
   - Filters: warm, noir, dreamy and pixel.
   - Also stickers, frames and pose buttons. The HUD is hidden.
   - Saves or shares a PNG of at least 1080 px on desktop.
3. **Share and challenge (SHARE).**
   - **Share card:** a 1080x1350 PNG showing the stage, score, stars or distance, the cat look, the player's name and style.
   - **Challenge link** `?c=`: a compact binary code (compressed with deflate-raw, then base64url). It holds the stage (or the endless or daily seed, or a trail code), score, name, look and a quantised ghost. Opening it shows "Beat Mia's 512,340" and races a translucent ghost kitten wearing the challenger's look.
   - **Daily Run:** a seeded endless course that is the same for everyone each UTC day. Its result can be shared.
4. **Wardrobe (WARDROBE).**
   - Slots: fur colour, pattern, eyes, hat, scarf and trail FX.
   - Items unlock through bells, stars, fish, distance and UGC actions. At least two per slot are free from the start.
   - The look is saved in save v2 and shows in-game, on the title screen (mascot and attract runner), in the cutscene, on the results portrait, on the share card, on the ghost and in photos and clips.
5. **Style and tricks (STYLE).**
   - Air tricks: SPIN, DOUBLE and TRIPLE SPIN, FLIP (the pounce), CORKSCREW and PAW-DIVE, plus set-piece style.
   - A combo chain with tiers, each with a big stamp callout: NICE!, PURRFECT!, CLAW-SOME!, FUR-OCIOUS!, NINE LIVES!, CAT-ASTROPHIC!
   - A combo meter in the HUD.
   - Near-miss slow motion.
   - Gold speed lines at high combo.
   - Landing shockwaves.
   - A finish flourish: a slow-motion confetti camera swing and a style rank.
   - Style points are raw (not multiplied), so star targets stay fair.
6. **Trail Maker (TRAILS).**
   - A builder where players pick a theme and pace and chain set-piece blocks into a course.
   - It shows a minimap and validates live with `stages/validate.ts`.
   - Players test-run their trail and share it as `?t=<code>`.
   - A trail can be shared only after its maker has finished it once. Every link is validated again when it is opened.

Everything stays procedural: SVG strings, canvas 2D, three.js geometry and shaders, and WebAudio. No asset files are added and no third-party IP is used.

## 3. Lanes and ports

| Lane | Key | Port | Owns |
|---|---|---|---|
| Clip capture | `clip` | 5181 | `src/clip/**`, `shots/clip-*.mjs` |
| Photo mode | `photo` | 5182 | `src/photo/**`, `shots/photo-*.mjs` |
| Share, challenge, daily, ghost | `share` | 5183 | `src/share/**`, `shots/share-*.mjs` |
| Wardrobe and the cat | `wardrobe` | 5184 | `src/wardrobe/**` (the `look.ts` exports are contract), `src/cat/**`, `src/ui/portrait.ts`, `shots/wardrobe-*.mjs` |
| Style, tricks, juice | `style` | 5185 | `src/style/**`, `src/juice/**`, `shots/style-*.mjs` |
| Trail Maker and stages | `trails` | 5186 | `src/trails/**`, `src/stages/**`, `src/setpieces/**`, `shots/trails-*.mjs` (keep `shots/setpieces-*.mjs` and `shots/bells.mjs` working) |

### Ownership map (every existing file has at most one owner)

```
INTEGRATOR (frozen for all lanes)
  src/main.ts, src/core/**, src/ugc/**, src/meta/**, index.html,
  src/ui/{flow,index,hud,settings,cutscene,tutorial,tutorial-logic,calloutq,format,thumbs,uisfx}.ts, src/ui/*.test.ts,
  src/audio/**, src/world/**, shots/smoke.mjs, shots/bot.mjs, shots/meta-ui-shots.mjs, shots/cat-audio-*.mjs,
  shots/world-art-shots.mjs, GDD.md, LANES.md, ITERATION2.md, package.json, package-lock.json, tsconfig.json,
  vite.config.ts, .gitignore, tools/**
CLIP      src/clip/**                         shots/clip-*.mjs
PHOTO     src/photo/**                        shots/photo-*.mjs
SHARE     src/share/**                        shots/share-*.mjs
WARDROBE  src/wardrobe/**, src/cat/**, src/ui/portrait.ts             shots/wardrobe-*.mjs
STYLE     src/style/**, src/juice/**                                  shots/style-*.mjs
TRAILS    src/trails/**, src/stages/**, src/setpieces/**              shots/trails-*.mjs
```

### What each lane needed in shared files (all provided by Phase 0; anything more is a CONTRACT-REQUEST)

| Lane | Shared provision it uses |
|---|---|
| CLIP | `save.settings.capture` and `clipVertical`; `ugcStats.clips`; slots `pause` and `results`; `openOverlay`; `sharekit`; `ugc.challengeUrl`, `ugc.drawLook`; `lastRunResult()` |
| PHOTO | Slot `pause`; `addScreen('photo')`; `PoseId`, `isPoseable`; `ugcStats.photos`; `sharekit` |
| SHARE | `StageId 'daily'`; `save.player`, `save.daily`, `ugcStats.shares`, `challengesWon` and `dailyPlays`; slots `title`, `select` and `results`; `openOverlay`; `sharekit` (`readParams`, `clearParams`, `linkWith`); `ugc.loadTrail`, `currentTrailCode`, `buildKitten`, `drawLook`, `styleSummary` |
| WARDROBE | `save.wardrobe`; every progress counter; slot `title`; `addScreen('wardrobe')`; the `look.ts` codec; `PoseId` |
| STYLE | `setTimeScale`; `ugcStats.bestChain` and `tricks`; `.hud` children |
| TRAILS | `StageId 'trail'`; `save.trails.mine`, `ugcStats.trailsFinished`; slots `title`, `select` and `results`; `addScreen('trails')`; `sharekit` |

## 4. Integration contract

1. **Entry.** Each lane fills `register<Lane>()` in `src/<lane>/index.ts` and keeps that exported name.
   - `registerUgc()` calls it once, after `initHud`, `initTutorial`, `initFlow` and `prepareStage('meadow')`.
   - At that point the DOM slots exist, `game.mode === 'title'` and the save is loaded.
2. **Cross-lane calls** go only through `ugc.*` from `src/ugc/contract.ts`.
   - A lane fills its own services with `provide({...})` inside its register function.
   - A lane never imports another lane's folder. The one exception is the pure codec in `src/wardrobe/look.ts`.
   - Every service has a safe default, so each lane works alone.

   | Service | Provider | Users |
   |---|---|---|
   | `currentLook()`, `buildKitten(look, {ghost})`, `drawLook(ctx, look, x, y, size)` | WARDROBE | SHARE (ghost, card), CLIP (end card), PHOTO (frames) |
   | `playerName()`, `askName()`, `challengeUrl(result)`, `activeChallenge()` | SHARE | CLIP (share text), PHOTO (polaroid caption), TRAILS (trail share text) |
   | `loadTrail(code)`, `currentTrailCode()` | TRAILS | SHARE (challenge links on trails) |
   | `styleSummary()` | STYLE | SHARE (card), CLIP (end card) |
   | `clipReady()`, `openClip()` | CLIP | SHARE (share sheet may offer the clip) |
   | `openPhoto()` | PHOTO | none required |

3. **Poses.** `PoseId = 'sit' | 'wave' | 'loaf' | 'stretch' | 'leap' | 'proud'`.
   - WARDROBE's `Mochi` implements `setPose(id | null)`.
   - PHOTO checks `isPoseable(kittenRig())` before calling it.
4. **UI.** Lanes never edit `index.html` or `flow.ts`.
   - Use `addButton({ id, slot, label, icon, order, tone, visible, badge, onClick })` for buttons. Visibility and badges are re-checked whenever the slot's screen shows. Call `refreshHub()` after your own changes.
   - Use `addScreen(id)` for full screens and switch to them with `setScreen(id)`. Use `openOverlay()` for modals and `toast()` for notes.
   - Put CSS in your own file (`import './<lane>.css'`) with lane-prefixed selectors. Reuse `.btn`, `.btn.small`, `.btn.alt`, `.btn.green`, `.btn.gold`, `.card`, `.iconbtn`, `.row`, `.hidden` and the `:root` tokens.
   - HUD additions are children of `.hud` with `pointer-events: none`.
   - Menus carry `.ui` (screens from `addScreen` and overlays already do), so touch gestures ignore them.
   - Each lane handles Esc on its own screens.

   **Button ids and order:**

   | Slot | Buttons |
   |---|---|
   | title | `ugcWardrobe` WARDROBE (10, WARDROBE), `ugcDaily` DAILY (20, SHARE), `ugcTrails` TRAIL MAKER (30, TRAILS) |
   | select | `ugcDailyCard` DAILY RUN (10, SHARE), `ugcTrailsCard` TRAIL MAKER (20, TRAILS) |
   | pause | `ugcPhoto` PHOTO (10, PHOTO), `ugcClipPause` SAVE CLIP (20, CLIP) |
   | results | `ugcShare` SHARE (10, gold, SHARE), `ugcClip` SAVE CLIP (30, CLIP), `ugcTrailShare` SHARE TRAIL (40, TRAILS), `ugcTrailEdit` EDIT TRAIL (45, TRAILS) |

   **Screens:** `wardrobe` (WARDROBE), `photo` (PHOTO), `trails` (TRAILS), `clip` and `share` (optional; overlays are preferred). Never use the id `trail`, which is already taken by the stage map's decorative path.
5. **Save.**
   - Write the save only with `setSave({ ...save, field: { ...save.field, ...patch } })`, using `save` and `setSave` from `src/ui/flow.ts`. Read the live `save` binding at write time and never a cached copy.
   - Write only your own fields:

     | Lane | Fields |
     |---|---|
     | CLIP | `settings.capture`, `settings.clipVertical`, `ugcStats.clips` |
     | PHOTO | `ugcStats.photos` |
     | SHARE | `player`, `daily`, `ugcStats.shares`, `challengesWon`, `dailyPlays` |
     | WARDROBE | `wardrobe` |
     | STYLE | `ugcStats.bestChain`, `tricks` |
     | TRAILS | `trails`, `ugcStats.trailsFinished` |

   - `stageEnd` handlers from UGC lanes run after flow's handler, because `initFlow` registers first. So `save` already holds the run.
6. **Stages.** SHARE registers `daily` (index 90) and TRAILS registers `trail` (index 91) with `stages.add`. Neither appears on the map. Start them with `play(id)` from `flow.ts`.
   - `daily` is endless-like. Its `chunk()` delegates to `stages.get('endless').chunk(b, seededRng, i)`.
   - **Determinism contract (TRAILS keeps it):** the same rng sequence and index order give the same endless chunks, and index 0 resets the generator's module state.
7. **Time scale.** Only STYLE calls `setTimeScale`. Every slow motion is shorter than 0.8 s of real time, never runs with `prefs.reducedMotion`, and is reset on `pause`, `stageEnd`, `quit` and `respawn`.
8. **Camera override.** Only one owner at a time:
   - PHOTO while the photo screen is open (game paused);
   - STYLE during the finish run-out only (it releases before 2.2 s, never after `stageEnd`);
   - WARDROBE while the wardrobe screen is open (title);
   - the cutscene (integrator) after `stageEnd`.
   - Everyone sets it back to `null` when done.
9. **Rendering while paused.** The loop draws only every 10th frame while paused. PHOTO calls `renderer.render(scene, camera)` itself in a frame hook while its screen is open.
   - A pixel grab (photo, share card, end-card background) must call `renderer.render(scene, camera)` and then `ctx.drawImage(renderer.domElement, ...)` in the same task, because `preserveDrawingBuffer` is off.
10. **Links.** `?c=` belongs to SHARE and `?t=` to TRAILS. Each lane reads its own parameter in its register function and removes it with `clearParams`. If both are present, the `?c=` challenge wins and can carry its own trail.
    - Link targets use `shareBase()` and `linkWith()`. The watermark text is `WATERMARK`.
    - Links ignore stage locks, so a friend's link always plays.
    - Names in links are untrusted: run them through `sanitizeName` and render them with `textContent` or canvas text only, never `innerHTML`.
11. **iOS sharing.** Build the file or blob first, then call `shareOrDownload` directly from a button's click handler (a fresh user gesture). Never call it at the end of a long render.
12. **Test hooks.** `exposeTestHook('<lane>', {...})` sets `window.__meowUgc.<lane>`. `window.__meow` (frozen `main.ts`) keeps working: `dev.unlockAll`, `dev.jump(stage, t)`, `dev.invincible`, `press`, `input.botSteer`, `clock`, `session`, `events`.
13. **CONTRACT-REQUEST.** If you need something from a frozen file, write `// CONTRACT-REQUEST: ...` in your own file and list it in your final report. The integrator applies it.

## 5. Rules for every lane

- **Working copy:** `/Users/zygimantasbagdzevicius/me/tt-meowrun`, a git worktree on branch `feat/meow-run-ugc`. The game is `meow-run/` (three.js ^0.183, Vite 8, strict TypeScript, vitest; `node_modules` is installed).
- **Before you start,** read this file, `LANES.md` (core API) and `GDD.md`.
- **What you may touch:**
  - Edit only the files you own.
  - Do not git commit, push, stash, clean, switch branches or check out files.
  - Do not touch files outside `meow-run/`.
  - Never read `.env*` files.
  - Do not run `npm install`.
- **No feature flags.** New features are on by default. A player-facing setting is fine only where your brief says so.
- **Procedural only.** No image, model, audio or font files. Inline SVG strings, canvas 2D, three.js geometry and shaders, and WebAudio (`src/audio/synth.ts`: `tone`, `noise`, `env`, `audio()`, `onAudioInit`) are all fine.
- **No third-party IP.** Use nothing from the reference fan game or any franchise: no names, characters, moves or callouts. All text is English.
- **Hot loops** (step and frame hooks, `animate`):
  - No per-frame allocation. Use module-level temp objects.
  - Respect `getQuality()` and `qualityChange` (LOW: no shadows, fewer particles, cheaper shaders) and `prefs.reducedMotion`.
- **Pure logic** goes in pure files with colocated vitest tests (`*.test.ts`). These files must not import `document`, `window`, `core/engine.ts` or anything that does. `three` maths is fine.
- **Phones:** 390x844 portrait with safe areas (`--st`, `--sb`, `--sl`, `--sr`) and touch targets of at least 44 px. Never cover the HUD's `#prompt`, `#callouts`, `#meter`, `#abilityBtn` or `#distPill` during play.
- **Dev server:**
  - Run `cd meow-run && npx vite --port <PORT> --strictPort` in the background and kill it when you are done (`pkill -f "vite --port <PORT>"`).
  - Other lanes edit files while you work, and HMR reloads kill a running Playwright script. For long shots, serve a snapshot instead: `npx vite build --outDir /private/tmp/claude-501/mr-ugc/<lane>-dist && npx vite preview --outDir /private/tmp/claude-501/mr-ugc/<lane>-dist --port <PORT> --strictPort`.
- **Playwright** (`@playwright/test` chromium):
  - Launch args: `['--use-angle=metal']`, falling back to `['--use-gl=angle', '--enable-unsafe-swiftshader']`.
  - Run every check at 1280x720 and at 390x844 (`isMobile: true, hasTouch: true`).
  - Fail on any page error or console error. While lanes run in parallel, an error whose stack or URL points into another lane's folder is reported, not failed. The integrator's final run requires 0.
  - Name screenshots `shots/<lane>-d-*.png` and `shots/<lane>-m-*.png`. `shots/*` is gitignored except `*.mjs`. Look at every screenshot with the Read tool.
  - Copy patterns from `shots/smoke.mjs` and use `shots/bot.mjs` (`createBot`) when you need real-input play.
- **Done means:**
  1. `cd meow-run && npx tsc --noEmit && npx vitest run && npm run build` passes. Errors in another lane's in-progress files may show up meanwhile; never leave any in yours.
  2. Your `shots/<lane>-shots.mjs` passes on both viewports.
  3. `SMOKE=fast MEOW_URL=http://127.0.0.1:<PORT>/ node shots/smoke.mjs` (desktop) still prints `SMOKE OK`.
- **Final report:** list the files you added or changed, the services you provide, your test hook, your shots and screenshots, any CONTRACT-REQUESTs, and known issues. Known bugs you notice in other areas: mention them, do not fix them.

## 6. Lane briefs

### 6.1 CLIP: rolling clip capture (port 5181)

**Owns:** `src/clip/**`, `shots/clip-*.mjs`.

**Provides:** `ugc.clipReady()`, `ugc.openClip()`.

**Pure modules (with tests):**
- `mime.ts`: `pickMime(isSupported: (t: string) => boolean): { mime: string; ext: 'mp4' | 'webm' } | null`. Try in this order:
  1. `video/mp4;codecs=avc1.42E01F,mp4a.40.2`
  2. `video/mp4;codecs=avc1,mp4a.40.2`
  3. `video/mp4`
  4. `video/webm;codecs=vp9,opus`
  5. `video/webm;codecs=vp8,opus`
  6. `video/webm`

  MP4 comes first because Instagram and TikTok uploads on iOS reject WebM.
- `ring.ts`: `class SegmentRing`.
  - `push({ blob, t0, t1 })` keeps at most 3 segments and 40 MB.
  - `covering(seconds, now)` returns the newest segments covering the last `seconds`, plus the start offset into the first one.
  - Also `clear()` and `bytes`.
- `layout.ts`:
  - `cropRect(srcW, srcH, aspect: '16:9' | '9:16')` returns `{ sx, sy, sw, sh }`: a centred crop, biased 8% upward for 9:16 so Mochi and the road ahead stay in frame.
  - `outputSize(crop, maxLong)` returns even dimensions (1280 desktop, 960 phones).
  - `watermarkBox(w, h)`.

**Capture (`capture.ts`, browser):**
- **When it runs.** `enabled` is true when `settings.capture === 'on'`, or when it is `'auto'` and `MediaRecorder`, `HTMLCanvasElement.prototype.captureStream` and a `pickMime` match all exist (desktop and phones alike). A recorder exists only while `game.mode` is `play` or `finish`, and for 1.5 s after `stageEnd` (so the finish flourish is in the clip).
  - On `pause`, call `recorder.pause()`; on `resume`, resume it.
  - On `quit` or `stageLoad`, stop it and clear the ring.
  - When it is off: no stream, no `MediaStreamDestination`, no per-frame JS. When it is on, still no per-frame JS; the browser encodes.
- **Streams.**
  - Video: `renderer.domElement.captureStream(fps)`, with fps 30 on HIGH and 24 on LOW.
  - Audio: in `onAudioInit(A => ...)`, create `A.ctx.createMediaStreamDestination()` once and `A.out.connect(dest)` (only while capture is enabled; disconnect when it is turned off).
  - `videoBitsPerSecond`: 2.5 M on HIGH, 1.2 M on LOW.
- **Segments.** Every 6 s, start the next `MediaRecorder` on the same stream, then stop the previous one. The overlap avoids a gap. Each finished segment is a standalone file that goes into the ring.
- **Failures.** Any capture error is a `console.warn` once, and capture switches off for the session. Never `console.error`, because the smoke run fails on console errors.

**Render (`render.ts`, browser):** compositing re-encodes in real time (about 13 s for a 12 s clip).
- **Play back.** Play the covering segments one after another in hidden `<video playsInline>` elements, starting at `now - 12 s`. Route their audio through `audio().ctx.createMediaElementSource(video)` into a new `MediaStreamDestination`, not to the speakers.
- **Composite each frame** onto a 2D canvas: `requestVideoFrameCallback` when available, otherwise `requestAnimationFrame`. Draw:
  - the crop (`cropRect`), scaled;
  - the watermark: a small paw plus `WATERMARK`, bottom-right, 75% alpha, text about 3.2% of the height;
  - a small top-left tag with the stage name.
- **End card** (1.2 s):
  - `ugc.drawLook(ctx, ugc.currentLook(), ...)`, the player's name (`ugc.playerName()`) and the score;
  - the stage name or distance, "Can you beat me?" and `WATERMARK`;
  - data from `lastRunResult()` on results, or live `G` and `game.stage` from pause.
- **Encode.** Record `canvas.captureStream(30)` plus the audio track with `MediaRecorder(pickMime)`, then make a `File` named `${fileStem('clip')}.${ext}`.
- **Fallback.** If compositing fails, offer the newest raw segment as is ("Quick save", no watermark) and warn once.

**Sheet (`sheet.ts`)** opens with `openOverlay('clip-sheet')`.
1. While rendering, it shows the live preview of the compositing canvas, a progress bar ("Making your clip... 6 s") and the aspect toggle (16:9 or 9:16; portrait screens are 9:16 only; the default is `settings.clipVertical`).
2. When the clip is done, it shows a `<video controls playsinline>` preview and three buttons:
   - **SHARE:** `shareOrDownload({ file, title: 'Meow Run', text: 'Can you beat my run?', url: ugc.challengeUrl(r) ?? shareBase() })`, called directly in the click handler.
   - **DOWNLOAD.**
   - **CLOSE.**
- On share or download, bump `ugcStats.clips` and toast the outcome. Esc closes the sheet. Opening it from pause keeps the game paused.

**Buttons:**
- `ugcClipPause` SAVE CLIP: pause slot, order 20, visible when `clipReady()`.
- `ugcClip` SAVE CLIP: results slot, order 30, visible when `clipReady()`.
- `clipReady()` means capture is enabled and the ring has at least 3 s.

**Settings:** inject two `.set` rows into `#settings .card` before `p.note`:
- Replays: AUTO/ON/OFF (`#setCapture`, segmented like `#setQuality`);
- Vertical clips (`#setClipVertical`, a `.tog`).

Re-render them on `onScreen('settings')` and save through `setSave`.

**Test hook** `__meowUgc.clip`:
- `state(): { enabled, recording, segments, seconds, mime }`
- `open()`
- `renderBlob({ vertical }): Promise<{ size, type, ms }>` (renders without the sheet)

**Shots** `shots/clip-shots.mjs`, desktop and phone:
1. `dev.unlockAll`, `dev.jump('gorge', 0.1)` and 14 s of `createBot` play. Then pause and check that `#ugcClipPause` is visible. Open the sheet, wait for the render and assert `size > 50 KB`, a video type, `ms` under 20000 and `state().segments ≥ 2`. Screenshot.
2. `dev.jump('meadow', 0.97)`, run to the results, SAVE CLIP with vertical on; screenshot. Load the blob into a `<video>`, seek to 1 s and screenshot the frame: it must show the watermark and the 9:16 crop.
3. Settings: Replays OFF, play 5 s, and check that `state().recording === false` and `clipReady()` is false. Then back to AUTO.
4. Report the fps on 390x844 LOW (`clock.frame` delta over 5 s) with capture on and off. The difference must stay within 5%.

**Acceptance:** all of the above, the unit tests for `mime`, `ring` and `layout`, and the fast smoke OK.

### 6.2 PHOTO: photo mode (port 5182)

**Owns:** `src/photo/**`, `shots/photo-*.mjs`.

**Provides:** `ugc.openPhoto()`.

**Entry:** `ugcPhoto` PHOTO in the pause slot, order 10, visible when `game.mode === 'paused'`. The photo screen is `addScreen('photo')`.

**Layout:**
- top bar: back and hide-UI;
- bottom tray tabs: CAMERA, FILTER, STICKERS, FRAME, POSE;
- a big shutter button.

The `.hud` is already hidden there.

**Camera (`camera.ts`).** Use `setCameraOverride((cam, dt, t) => ...)` with your own clock (`performance.now()`), because frame dt is 0 while paused.
- **Orbit target:** `P.world.pos + P.world.up * 0.55`.
- **Controls:**
  - drag (one finger or left mouse): yaw and pitch (pitch -10° to 75°);
  - pinch or wheel: distance 1.6 to 14 u;
  - two-finger drag, right mouse or WASD: pan the target, at most 6 u from Mochi;
  - a roll slider (±25°).
- **Start:** a 3/4 front view of Mochi's face (she faces `P.world.fwd`) at 4.2 u.
- **Ground:** keep the camera at least 0.3 u above the track surface under it (`game.track.toWorld`).
- On exit, call `setCameraOverride(null)`.

**Rendering:** while the screen is open, a frame hook calls `kittenRig()?.animate(realDt, t, P)` (so poses ease) and then `renderer.render(scene, camera)` every frame. Unsubscribe on exit.

**Poses:** buttons for `POSES`. When `isPoseable(kittenRig())`, call `setPose(id)`; otherwise the buttons are disabled. Call `setPose(null)` on exit.

**Filters:**

| Filter | Live view (CSS filter on `renderer.domElement`) | Export (pure `filters.ts`, same look) |
|---|---|---|
| none | none | unchanged |
| warm | `sepia(.28) saturate(1.35) hue-rotate(-8deg) brightness(1.04)` | warm colour matrix |
| noir | `grayscale(1) contrast(1.35) brightness(.95)` | luma, then contrast |
| dreamy | `saturate(1.25) brightness(1.08) contrast(.92) blur(.5px)`, plus a soft pink radial overlay div | quarter-resolution box blur, screen-blended, plus the pink lift |
| pixel | `renderer.setPixelRatio(0.22)` plus `image-rendering: pixelated` | nearest downscale to 1/8, then nearest upscale |

For the pixel filter, restore the exact previous pixel ratio and size on change, exit and resize.

Export filter signature: `applyFilter(img: { data: Uint8ClampedArray; width; height }, id): void`.

**Stickers (`stickers.ts`):** at least 8 procedural SVGs with matching canvas painters: paw, heart, star, fish, sparkle, "MEOW!" bubble, sunglasses, crown and a bell.
- Tap to add one at the centre; drag to move; pinch or ± to scale; rotate buttons; the trash button deletes.
- At most 12 stickers. Positions are kept normalised (0..1), so the export matches the screen.

**Frames (`frames.ts`):**
- none;
- polaroid (cream border, caption = `ugc.playerName()` or "Mochi");
- comic (halftone border with a burst);
- film (sprockets);
- postcard ("Greetings from <stage name>");
- Meow Run badge.

**Shutter (in the click handler):**
1. Hide the UI.
2. Set the pixel ratio so the long edge is at least 1080 px (desktop) or at least 780 px (phones), capped at 2048 px, then `renderer.setSize(innerWidth, innerHeight)`.
3. `renderer.render(scene, camera)`, then synchronously `drawImage(renderer.domElement)` into a 2D canvas.
4. Restore the pixel ratio and size.
5. Apply the filter, then draw the frame, the stickers and the watermark (`WATERMARK`, bottom-right).
6. `toBlob('image/png')`.
7. Flash, plus a shutter sound (`tone`/`noise`).
8. Open a preview overlay with SHARE (`shareOrDownload({ file })`), SAVE (`downloadBlob`) and BACK.
9. Bump `ugcStats.photos`.

**Exit:** back or Esc goes to `setScreen('pause')`, restores the CSS filter, pixel ratio, camera and pose, and removes the hooks. Photo mode must never resume the run itself.

**Test hook** `__meowUgc.photo`:
- `open()`, `close()`
- `state(): { open, filter, stickers, pose, yaw, pitch, dist }`
- `setFilter(id)`, `addSticker(id)`, `orbit(dYaw, dPitch, dDist)`
- `shoot(): Promise<{ w, h, size }>`

**Tests:**
- `filters.ts` on a synthetic 8x8 image: noir gives r = g = b; pixel gives uniform blocks; warm raises r/b; dreamy keeps the size; no NaN anywhere.
- The sticker maths between normalised and pixel coordinates.

**Shots** `shots/photo-shots.mjs`, desktop and phone:
1. `dev.jump('sunset', 0.18)` (cloud ride) and then `dev.jump('gorge', 0.3)`. Each time: pause, PHOTO, orbit to the 3/4 front, and screenshot all 5 filters.
2. Add 3 stickers and the polaroid frame, then shoot. Assert the PNG is over 30 KB and meets the long-edge minimum. Screenshot the preview.
3. Pose `wave`: screenshot (the pose shows once WARDROBE lands; until then the buttons are disabled).
4. Back, then resume. Assert the mode is `play`, `P.s` increases and the camera follows (`camera.position` near `P.world.pos`). No console errors.

**Acceptance:** all of the above and the fast smoke OK.

### 6.3 SHARE: share card, challenge links, ghost, Daily Run (port 5183)

**Owns:** `src/share/**`, `shots/share-*.mjs`.

**Provides:** `ugc.playerName()`, `ugc.askName()`, `ugc.challengeUrl(r)`, `ugc.activeChallenge()`.

**Registers:** the `daily` StageDef (in `registerShare`).

**Pure modules (with tests):**
- **`daily.ts`:**
  - `dayKey(ms)` returns the UTC `YYYY-MM-DD`;
  - `seedForDay(key)` is an FNV-1a hash giving a non-zero u32;
  - `themeForSeed(seed)` picks meadow, gorge or sunset;
  - `dayLabel(key)` gives "Oct 24".
- **`ghost.ts` (pure part):** a recorder buffer of samples taken every 1/6 s of sim time: `s`, `x`, `y` and flags (sliding, airborne, ability).
  - `packGhost(samples, hz)`: 3 bytes per sample.
    - ds is u8 in 1/8 u; 255 escapes to a keyframe holding an absolute u32 s/8 (after a respawn or teleport).
    - x is i8 in 0.1 u.
    - y is u8 in 0.08 u.
    - The flags go in the low bits of a 1-byte flag run every 8 samples.
  - `unpackGhost`.
  - `sampleAt(ghost, t, out)`: Catmull-Rom for x and y, linear for s.
- **`code.ts`:** `encodeChallenge(c): Promise<string>` and `decodeChallenge(s): Promise<Challenge | null>`.
  - **Challenge** = `{ v: 1, stage, seed?, theme?, trail?, score, name, look, chain, ghost }`:
    - `stage` is `'meadow' | 'gorge' | 'sunset' | 'daily' | 'trail'`;
    - `seed` and `theme` are for `daily`;
    - `trail` is the trail code;
    - `name` goes through `sanitizeName`;
    - `look` is a 6-character look code;
    - `ghost` is the packed bytes.
  - **Binary layout:** little-endian. After the layout comes a flags byte: bit 0 means deflated with `CompressionStream('deflate-raw')` when it exists (Node 22 has it). Then base64url.
  - **Limits:** decoded size ≤ 16 KB, score ≤ 1e9, name ≤ 14 characters, any unknown stage gives `null`. It never throws.
  - **Link length:** at most 3000 characters. If it is longer, resample the ghost (6 Hz, then 4, then 3) until it fits.

**Ghost (browser part):**
- **Recording.** An `addStepHook` records every run from `stageStart` with `at === 0`, in campaign, daily and trail runs. Plain endless runs are recorded as `daily` with `seed = G.seed`, which is the session rng seed `prepareStage` set (so `makeRng(G.seed)` reproduces the course), and `theme = game.stage.theme` read at `stageStart`.
- **Playback**, on `stageStart` when `activeChallenge` matches the stage (plus seed or trail):
  - Build `rig = ugc.buildKitten(decodeLook(look), { ghost: true })` and add it to the scene.
  - A frame hook takes `t = G.time`, gets the sample, then `game.track.toWorld(s, x, y)`. Orientation uses the same basis as core (`x = -right`, `up`, `fwd`).
  - Call `rig.animate(dt, t, ghostView)`, where `ghostView` is a module-level mutable `PlayerView`: speed from ds, grounded when y < 0.05, sliding and ability from the flags, and `base` 0.
  - A name-tag sprite (canvas texture: name and score) floats above it.
  - Hide it when it is beyond the track or more than 160 u from the player.
  - When the ghost reaches the finish first: `callout('<NAME> FINISHED!', 'info')`. Never console-log names.
- **HUD pill:** a `.hud` child at the bottom left, above the safe area, `pointer-events: none`. It reads "vs Mia +34 m", green when you are ahead and rose when you are behind.
- **Results:** a banner injected at the top of `#results .card` (remove it on the next `stageStart`): "You beat Mia's 512,340!" or "Mia wins by 12,000 - rematch?". A win bumps `ugcStats.challengesWon`. RETRY keeps the ghost. The share sheet's challenge link then carries **your** ghost ("Send it back").

**Links (`?c=`):** in `registerShare`, run `decodeChallenge(readParams().get('c'))`.
- On success, set it as the pending challenge. For a trail, `ugc.loadTrail(trail)` must succeed. Then show the challenge overlay on the title:
  - the `ugc.drawLook` portrait;
  - "<name> challenges you!";
  - "Beat <name>'s 512,340", plus the stage name or "Daily Run, Oct 23" or "Trail: <trail name>";
  - PLAY, which calls `play(stage)` and ignores locks;
  - Not now.
- Then call `clearParams(['c'])`.
- If the link is bad, show the toast "That challenge link is broken".

**Daily Run:** a `StageDef` with:
- `id: 'daily'`, `index: 90`;
- a name getter: "Daily Run", or "Endless challenge" for a non-today seed;
- blurb "Same course for everyone today";
- a theme getter from the seed;
- `music: 'endless'`;
- speed, start and `bells: 0` copied from the endless def;
- `scoreTarget: 0`;
- `chunk(b, _rng, i) { if (i === 0) rng = makeRng(seed); return stages.get('endless').chunk!(b, rng, i); }`.

`startDaily()` sets the seed to today and calls `play('daily')`.

On `stageEnd` for today's Daily: set `save.daily = { day, best: max, distance: max }` (reset when the stored day differs) and bump `ugcStats.dailyPlays`.

**Buttons:**
- `ugcDaily` DAILY: title slot, order 20. Visible when `isUnlocked(save, 'daily')`; badge NEW when `save.daily.day !== today`.
- `ugcDailyCard` DAILY RUN: select slot, order 10, with today's best in the label once played.
- `ugcShare` SHARE: results slot, order 10, gold.

**Share sheet (overlay):**
- If there is no name yet: `askName()`. The modal has an input with max length 14 that runs through `sanitizeName` live, plus OK and Skip. The name is saved in `save.player.name`; Skip keeps it empty and the card uses "A Mochi fan".
- Card preview.
- **CHALLENGE A FRIEND:** `shareOrDownload({ title: 'Meow Run', text: "Beat my 512,340 in Meow Run!", url })`. Shown only when `challengeUrl(r)` is not null; it is null for runs started with `at > 0`.
- **SHARE CARD:** the PNG file.
- **COPY LINK.**
- **SAVE CLIP**, through `ugc.openClip()`, when `ugc.clipReady()`.
- An editable name chip.
- Each share bumps `ugcStats.shares`.

**Card (`card.ts`):** a 1080x1350 PNG, built when the results screen shows so the share button is instant.
- **Background:** a scene snapshot (render plus `drawImage` in one task) with a warm vignette.
- **Body:**
  - the stage title; the score with `fmtInt`;
  - stars for campaign runs, distance for endless or daily, "Trail: <name>" for trails;
  - the look portrait in a circle (`ugc.drawLook`) with the name;
  - a style row (`ugc.styleSummary()`: best combo and rank);
  - "Can you beat me?";
  - footer: a paw plus `WATERMARK`.
- **Fonts:** the page font stack, canvas only.

**Test hook** `__meowUgc.share`:
- `encode(c)`, `decode(s)`
- `lastLink()`
- `cardBlob(): Promise<Blob>`
- `ghost(): { active, samples, s }`
- `startDaily()`
- `openLink(code)`

**Tests:**
- Round trip for every stage kind: unicode names, a long ghost resampled under the limit, garbage and truncated input give `null`.
- Ghost error is at most 0.15 u in s and x, and at most 0.1 u in y, on a synthetic run that includes a teleport.
- The daily seed is stable and differs from day to day.

**Shots** `shots/share-shots.mjs`, desktop and phone:
1. Build a synthetic challenge with the hook: meadow, score 512340, name "Mia", look `'3a0210'`, a ghost of a clean 20 u/s run. Open `/?c=<code>` in a fresh page. Screenshot the challenge card, then PLAY.
2. After 6 s, the ghost is active and visible; screenshot it and the pill.
3. `dev.jump('meadow', 0.985)` to the results. Check the banner and screenshot it.
4. SHARE: name "Zig", screenshot the sheet and card. Check that the link is under 3000 characters and decodes with name "Zig" and a non-empty ghost.
5. DAILY: run 8 s and record the first 25 `session.sessionInfo.specs` as `{ type, s }`. Quit, then start DAILY again: the specs are identical. Screenshot the daily results card.

**Acceptance:** all of the above, the unit tests and the fast smoke OK.

### 6.4 WARDROBE: the look, the cat, unlocks (port 5184)

**Owns:** `src/wardrobe/**`, `src/cat/**` and `src/ui/portrait.ts`, plus `shots/wardrobe-*.mjs`.
- Keep the `look.ts` exports and codec.
- In `src/cat/**`, keep `registerCatAudio`, the `Mochi` public fields that juice reads (`pawW`, `tailTipW`, `stormW`, `state`), and `buildMochi`.
- In `portrait.ts`, keep the signatures of `drawPortrait(c, w, h, mood, t, opts)`, `portraitCanvas` and `Mood`.

**Provides:** `ugc.currentLook()`, `ugc.buildKitten(look, { ghost })`, `ugc.drawLook(ctx, look, x, y, size)`.

**Catalogue (`catalog.ts`, pure, append-only indices):** each item is `{ key, slot, index, name, colors, unlock }`. Index 0 is classic Mochi.

| Slot | At least | Items |
|---|---|---|
| fur | 9 | classic orange, cream, silver, midnight, snow, chocolate, smoky blue, strawberry, galaxy (deep purple with star specks) |
| pattern | 6 | tabby stripes, solid, spots, socks, patches, tuxedo |
| eyes | 5 | classic, emerald, sky, odd eyes, starry |
| hat | 8 | none, bow, beanie, party hat, flower crown, chef hat, propeller cap, golden crown |
| scarf | 6 | none, red scarf, bell collar, bandana, bow tie, cape |
| fx | 6 | none, sparkles, hearts, rainbow ribbon, fish bubbles, autumn leaves (cosmetic trail FX) |

**Unlocks (`unlocks.ts`, pure):** `Unlock = { kind: 'free' } | { kind: Counter, n }`.
- **Counters:**
  - stars (total from `save.stages`), bells (sum of `bestBells`), fish (`totals.fish`), distance (`totals.distance`), `endlessDist` (`endlessBest.distance`);
  - chain, tricks, daily, `challengesWon`, `trailsFinished`, clips, photos, shares (from `ugcStats`).
- **Functions:** `progress(save)`, `isOwned(item, save)`, `ownedKeys(save)`, `newlyOwned(save)` (owned and not in `wardrobe.seen`).
- **Rules:**
  - At least 2 free items per slot.
  - Every UGC action unlocks something: first clip, first photo, first share, first Daily, first trail finished, first challenge won, chain 20 and 50, tricks 25 and 100.
  - Progress milestones also unlock items: stars 3, 6 and 9; bells 7, 14 and 21; endless 2000 and 5000 m.

**`normalizeLook(look, save?)`:** indices past the catalogue fall back to 0. With `save`, unowned items also fall back to 0 (for the equipped look only; ghost looks from links are display only and are never ownership-checked).

**Mochi (`cat/mochi.ts`):**
- **Constructor:** `new Mochi(look = currentLook(), opts = {})`.
- **`applyLook(look)`:**
  - Clone materials per rig; never mutate the shared `toon()` cache.
  - Repaint the fur and head canvas textures from the fur colours plus the pattern. Cache textures per `(fur, pattern)` and dispose of them with the rig.
  - Eye colour.
  - Hats and scarves are small meshes on the head and neck groups, outlined on HIGH.
  - The FX emitter is a frame hook spawning `core/fx` particles behind the tail tip while the run is live, at half rate on LOW and gentle with reduced motion.
- **`setPose(id | null)`** (contract): sit, wave, loaf, stretch, leap and proud are held poses that override the gameplay pose channels. They ease whenever `animate(dt > 0)` runs.
- **`opts.ghost`:**
  - transparent materials (opacity 0.38, no depth write), no blob shadow, no outlines, no FX;
  - no subscriptions to global events;
  - it reads only the `PlayerView` passed in (`p.base` if present, instead of `P.base`).
- **Disposal:** `dispose()` frees clones, textures, hooks and subscriptions.
- **`buildMochi()`** returns `new Mochi(currentLook())`. Gameplay, the cutscene and photo mode then all wear the equipped look.

**Portrait (`ui/portrait.ts`):** `opts.look?: Look`, defaulting to `currentLook()`. It covers fur base, dark and belly colours, a pattern hint, eye colour, and the hat and scarf in 2D.
- So the title mascot, HUD portrait, pause cat, results portrait and the `ugc.drawLook` card portrait all show the look.
- `drawLook` is the happy portrait without background inside `(x, y, size)`.

**Wardrobe screen** (`addScreen('wardrobe')`):
- **3D preview.** A preview Mochi (draft look, `setPose('sit')`, with a proud toggle) placed in the title attract scene in front of the camera. `setCameraOverride` gives a slow auto-orbit, and drag spins it.
- **Tabs:** FUR, PATTERN, EYES, HAT, SCARF, TRAIL FX.
- **Item tiles:** each tile is a 2D canvas swatch or icon.
  - Locked tiles show their rule ("Collect 14 bells") and a progress bar.
  - New items carry a NEW badge.
- **Buttons:**
  - RANDOM (owned items only);
  - DONE: `setSave({ ...save, wardrobe: { look: encodeLook(l), seen: [...] } })`;
  - Back or Esc.
- **Close:** dispose of the preview, call `setCameraOverride(null)` and `setScreen('title')`.

**Title:**
- `ugcWardrobe` WARDROBE, order 10, badge = the count of newly owned items.
- The title attract scene shows Mochi in her look running ahead of the attract camera: a rig built on `stageLoad` while `game.mode === 'title'`, placed at `attractFocus() + 6` and animated as running, then removed on `stageStart`.

**Unlock toasts:** on `onScreen('results')`, toast items that are newly owned and not yet toasted: "New in the Wardrobe: Golden crown!"

**Test hook** `__meowUgc.wardrobe`:
- `open()`, `close()`
- `catalog`
- `owned(): string[]`
- `equip(code)`, `look(): string`
- `devOwnAll(on)`: in memory only, never saved.

**Tests:**
- Catalogue: unique keys, index = position, at most 36 per slot, at least 2 free per slot, every unlock kind is reachable.
- Counters from a sample save.
- `normalizeLook`; codec round trip; the colour helpers.

**Shots** `shots/wardrobe-shots.mjs`, desktop and phone:
1. Title, then WARDROBE: screenshot.
2. `devOwnAll(true)`: screenshot each tab.
3. Equip galaxy fur, golden crown, cape and rainbow ribbon, then DONE. Screenshot the title mascot and the attract runner.
4. `dev.jump('meadow', 0.2)` for 3 s: screenshot from behind (crown and cape visible).
5. `dev.jump('sunset', 0.985)`: cutscene shows the look; screenshot. Then the results portrait; screenshot.
6. Reload: `dev.save().wardrobe.look` persists.
7. Ghost: place `ugc.buildKitten(look, { ghost: true })` 2 u beside Mochi through the hook and screenshot (it is translucent).
8. Check the fps at 390x844 LOW with the full look stays within 5% of classic.

**Acceptance:** all of the above, the unit tests and the fast smoke OK. Existing `shots/cat-audio-*.mjs` poses still look right with the classic look.

### 6.5 STYLE: tricks, combo, slow-mo, juice, finish (port 5185)

**Owns:** `src/style/**`, `src/juice/**`, `shots/style-*.mjs`. Keep `registerJuice` and `speedLineLevel` exports.

**Provides:** `ugc.styleSummary()`.

**Pure modules (with tests):**
- **`tricks.ts`: `TrickTracker`.**
  - **Inputs:** `jump({ air })`, `pounce()`, `ability({ consumed, airborne, mode })`, `fastFall()`, `land({ impact })`, `hit()` and `tick(dt)`.
  - **Rules:**
    - SPIN: an unconsumed ability press while airborne in mode run or ride (never arc). A second spin in the same air time is DOUBLE, a third is TRIPLE. Each spin takes 0.38 s.
    - FLIP: the pounce. Mochi's rig already somersaults.
    - CORKSCREW: an ability press within 0.35 s after a pounce (spin plus barrel roll).
    - PAW-DIVE: a fast fall followed by a landing.
  - **Payout on landing:**
    - Tricks pay only when there was no hit since take-off and the rotation is at least 80% done.
    - Otherwise "SLOPPY!": 0 points, and the chain is kept.
    - A hit in the air breaks the chain.
- **`chain.ts`: `ComboChain`.**
  - **Weights:** fish 1, yarn or treat 1, near miss 2, bell 3, trick 2 (double 3, triple 4), set-piece style 3.
  - **Window:** 3.0 s, refreshed by each event and held while airborne.
  - **Tiers:**

    | Chain | Stamp |
    |---|---|
    | 5 | NICE! |
    | 10 | PURRFECT! |
    | 20 | CLAW-SOME! |
    | 35 | FUR-OCIOUS! |
    | 50 | NINE LIVES! |
    | 75 | CAT-ASTROPHIC! |

  - **Hit or fall:** "COMBO BROKEN", and nothing is banked.
  - **Expiry:** bank `round(15 × n × tierMul)` raw points, with `tierMul` = 1, 1.25, 1.5, 2, 2.5, 3.
  - **Run totals:** `bestChain`, `tricks`, `stylePoints`.
- **`points.ts`:** raw points (via `addPoints(n, true)`, never × `G.mult`) times `tierMul`:

  | Move | Points |
  |---|---|
  | SPIN | 250 |
  | DOUBLE | 600 |
  | TRIPLE | 1200 |
  | FLIP | 200 |
  | CORKSCREW | 700 |
  | PAW-DIVE | 300 |
  | Set-piece style | 400 |

  Set-piece style means: a vault landed without a hit, a wall-run left without a hit, a cloud ride or river finished, or a chase that ended (`chase` off) without a hit.
- **`rank.ts`:** S, A, B or C from style points per 100 u of distance.
- **Balance test:** a synthetic heavy run (a double spin on every jump, chain 60) adds less than 12% of meadow's `scoreTarget`. Stage targets and the validate tests stay unchanged.

**Visuals and feel:**
- **Spin.** A frame hook post-multiplies `kittenRig().root.quaternion` by the trick rotation, about the rig's local up axis (spin) or forward axis (roll), pivoting at body height 0.45 u. Adjust `root.position` to match. Core resets the root every frame. Nothing in `src/cat`.
- **HUD (`hudcombo.ts`, `style.css`).**
  - A `.hud` child with `pointer-events: none`, at the right edge under `.tr` (score and multiplier). It shows "COMBO 23", the tier name and a draining bar.
  - A tier-up stamp: a big rotated comic word at upper centre, separate from core callouts (the callout queue keeps its priorities). It pops, or only fades with reduced motion.
  - Trick popups near the score ("DOUBLE SPIN +600").
  - At 390x844 nothing overlaps `#prompt`, `#callouts`, `#meter`, `#abilityBtn`, `#distPill` or the share pill (bottom left).
- **Near-miss slow-mo.**
  - **Trigger:** on `nearMiss` with chain ≥ 5, or a chaser near miss (labels containing `dog` or `yarn`).
  - **Shape:** `setTimeScale(0.35)` for 0.28 s real time, easing back to 1 over 0.18 s, with a 3.5 s cooldown. Add a vignette pulse and a whoosh (`sfx.ts`), and `duckMusic(-6, 0.3)` from `audio/music`.
  - **Never** with reduced motion, and never on the tutorial stage while `!save.tutorialDone`.
  - **Reset to 1** on `pause`, `stageEnd`, `quit` and `respawn`.
- **Speed lines (`juice/speedlines.ts`):** strength += `0.25 × tier / 6`, with a gold tint at tier 3 or higher.
- **Landing impacts (juice):** when the landing impact is above 22, or on a PAW-DIVE:
  - a pooled shockwave ring mesh on the track plane (0.3 → 3.2 u, fading over 0.35 s; LOW: dust only);
  - a dust ring;
  - `shake(0.12–0.3)`;
  - `fovKick(3)`.
- **Finish flourish (`finish.ts`, on `finishLine`):**
  - `setTimeScale(0.45)` for 0.6 s.
  - 3 waves of confetti in 6 colours (`core/fx burst`).
  - A camera swing via `setCameraOverride` for at most 1.7 s of sim time, from behind to a 3/4 front of Mochi's victory pose. Release it to `null` before the 2.2 s run-out ends, and never touch the camera after `stageEnd` (the cottage cutscene owns it).
  - A rank stamp and a short sting from `sfx.ts`. The audio lane's fanfare still plays.
  - With reduced motion: confetti only.
- **Trick hint.** At most once per session: when Mochi is airborne for more than 0.35 s on a non-tutorial stage and `hud.prompt` is null, show `prompt('ability', 'SPIN!', 0.6)`. The bot's ability press then only spins.
- **Events.** Emit `setPiece { id: 'style', phase: 'tier' | 'trick' | 'broken' | 'bank' | 'slowmo' }` for audio.
- **Save on `stageEnd`:** `ugcStats.bestChain` becomes the max of old and new, and `ugcStats.tricks` adds this run's count.

**Test hook** `__meowUgc.style`:
- `state(): { chain, tier, tricks, stylePoints, bestChain, spinning, timeScale }`
- `forceTier(n)`
- `trick(id)`

**Tests:** `chain`, `tricks`, `rank`, `points` and the balance test.

**Shots** `shots/style-shots.mjs`, desktop and phone:
1. `dev.jump('meadow', 0.3)`. Jump, then ability ×2 in the air (keyboard: Space, E, E; phone: swipe up, then taps). Screenshot mid-spin and assert `tricks ≥ 1` after the landing.
2. `forceTier(25)`: screenshot the HUD meter and the gold speed lines.
3. `dev.jump('gorge', 0.62)` (dog chase) with the bot: `timeScale < 1` is seen at least once. Screenshot slow-mo.
4. `dev.jump('meadow', 0.985)`: flourish screenshots at +0.3 s and +1.2 s, then the results. The camera override is gone (the camera is behind Mochi on retry).
5. With reduced motion on: no time-scale change and no swing.

**Acceptance:** all of the above, the unit tests, the fast smoke OK, and `npm run smoke:fast` on phone (390x844) OK.

### 6.6 TRAILS: Trail Maker and the stage library (port 5186)

**Owns:** `src/trails/**`, `src/stages/**`, `src/setpieces/**`, `shots/trails-*.mjs`.
- Keep `registerStages`, `registerSetPieces`, the stage scripts and their tests.
- Keep `shots/setpieces-*.mjs` and `shots/bells.mjs` working.

**Provides:** `ugc.loadTrail(code)`, `ugc.currentTrailCode()`.

**Registers:** the `trail` StageDef (in `registerTrails`), with a starter course, so `stages.get('trail')` always works.

**Blocks (`src/stages/blocks.ts`, pure).** Refactor the endless templates into a shared library. `BLOCKS: BlockDef[]`, where each block is `{ id, key, name, icon, big, themes?, build }`:
- `id` is a stable single base-36 character;
- `icon` is an SVG string;
- `themes` restricts a block to some themes;
- `build(k: Script, rng: Rng, o: { mirror; hard; d })` lays the block.

There are at least 18 blocks:
- fish line, bend left, bend right, hill;
- logs, branches, rock slalom, mixed, bamboo, puddles;
- jump gap, pounce gap, tail vault;
- river surf, wall-run, dog chase, yarn chase;
- puff cloud (with a yarn and treat lead-in), bridge.

Every block starts with at least 30 u of calm lead (no hazards) and ends on ground. `endless.ts` uses `BLOCKS` too.

**Determinism contract** (SHARE's Daily Run depends on it): the same rng sequence and index order give identical `endless.chunk` output, and index 0 resets all module state. Add a test.

**Code (`src/trails/code.ts`, pure):**
- **`Trail`** = `{ v: 1, name, theme, pace, seed, blocks }`:
  - `name` goes through `sanitizeName`;
  - `theme` is a `ThemeId`;
  - `pace` is 0, 1 or 2: chill 18→24, zoomy 20→28, turbo 22→31 u/s;
  - `seed` is a u16;
  - `blocks` is 2 to 24 entries of `{ id, mirror, hard }`.
- **`encodeTrail`** produces `'1' + theme + pace + seed(3 b36) + blocks(2 chars each) + '-' + base64url(utf8 name)`, at most 120 characters.
- **`decodeTrail`** returns `null` on garbage and never throws.

**Build (`src/trails/build.ts`, pure):**
- `buildTrail(trail, b): PieceSpec[]`: a 40 u start straight, the blocks in order with `makeRng(seed)`, then a 60 u straight and `k.finish()`.
- `trailStage(trail): StageDef` with `id 'trail'`, `index 91`, `name` = trail name, the theme, `music` = theme id, speed by pace, `scoreTarget 0`, `bells 0` and `start { width: 9 }`.

**Validate (`src/trails/validate.ts`, pure):** `validateTrail(trail)` returns `{ ok, errors: { block, message }[], length, seconds }`.
- Limits come from decoding, and the theme must allow every block.
- The trail is built on a fresh `Track` and `PathBuilder`, and `stages/validate.ts` `validateLayout` must return `[]`. Map every problem's s back to its block index.
- Length must be 400 to 6000 u, and `runSeconds` 25 to 240 s.
- Finishability is structural: `validateLayout` covers gaps, vaults, clouds, walls, rivers and reaction spacing at top speed, and the set pieces never soft-lock. On top of that, the maker must finish the trail once before it can be shared.
- **Fuzz test:** 300 random trails covering every block, mirror and hard, theme and pace all validate. Blocks must compose with each other.

**Trail Maker screen** (`addScreen('trails')`):
- **MY TRAILS** (`save.trails.mine`): each entry shows its name, best, a finished tick, and PLAY, EDIT, SHARE and DELETE. Plus NEW TRAIL.
- **Editor:**
  - name field (`sanitizeName`);
  - theme cards using `thumbCanvas('meadow' | 'gorge' | 'sunset')`;
  - pace segments;
  - a block palette (icons and names, filtered by theme);
  - the course strip: select a block, then move left or right, mirror, hard, or delete; at most 24 blocks;
  - a live validation badge showing the first error;
  - a top-down minimap canvas: the `Track` polyline coloured per block, with start and finish flags;
  - an estimated time;
  - RANDOM (always valid).
- **TEST RUN** saves the entry, then `ugc.loadTrail(code)` and `play('trail')`.
- **SHARE** appears only when `entry.finished`: `shareOrDownload({ title: 'Meow Run', text: 'Try my Meow Run trail "<name>"!', url: linkWith({ t: code }) })`.
- **Keys:** arrows move the selection and Delete removes. Esc goes back to the title.

**Buttons:**

| Slot | Button | Order | Shown |
|---|---|---|---|
| title | `ugcTrails` TRAIL MAKER | 30 | always |
| select | `ugcTrailsCard` TRAIL MAKER | 20 | always |
| results | `ugcTrailShare` SHARE TRAIL | 40 | last run was a trail and finished |
| results | `ugcTrailEdit` EDIT TRAIL | 45 | last run was a trail |

**Runs:** on `stageEnd` for a trail, update the matching `save.trails.mine` entry (`best` and `finished`; own trails only). Bump `ugcStats.trailsFinished` on each finish.

**Links (`?t=`):** decode and validate, then show the overlay "A trail for you: <name>" with the theme, block count and approximate time, and the buttons PLAY, OPEN IN MAKER, SAVE COPY and Not now.
- A broken link gives the toast "That trail link is broken".
- Then `clearParams(['t'])`.
- Skip all of this when `?c=` is also present (SHARE handles it through `loadTrail`).

**Test hook** `__meowUgc.trails`:
- `open()`, `close()`
- `encode(t)`, `decode(s)`, `validate(t)`
- `random(seed): Trail`
- `load(code)`, `current()`

**Tests:**
- Each block alone validates in every allowed theme, mirrored and hard.
- The composability fuzz; code round trip and garbage input.
- Endless determinism.
- Time bounds.
- `stages.test.ts` and `layout.test.ts` stay green.

**Shots** `shots/trails-shots.mjs`:
1. Desktop and phone: title, TRAIL MAKER, new trail. Tap 8 palette blocks. Screenshot the editor, the minimap and validation.
2. TEST RUN with `dev.invincible(true)` and `createBot` to the finish (at most 150 s). Results: SHARE TRAIL is visible. Take the link from the hook and open it in a fresh page. Screenshot the overlay, then PLAY: the `'trail'` specs equal the maker's (`sessionInfo.specs`).
3. Desktop only: `random(1..3)` trails finished by the bot without invincibility. Losing hearts and respawning are allowed. This proves the trails are finishable.

**Acceptance:** all of the above, all stage and setpiece tests green, the fast smoke OK, and the journey bot still finishes meadow (`SMOKE=journey` desktop, at least through the meadow results).

## 7. Integrator (after the lanes)

**Owns** every frozen file (section 3).

**Tasks:**
1. Apply the CONTRACT-REQUESTs.
2. Check every slot at 1280x720 and 390x844, and fix the layout (the results card may need to scroll on phones).
3. Write `shots/ugc-smoke.mjs`. It visits every UGC entry, opens and closes every screen and overlay, follows a challenge link and a trail link, and runs a Daily Run. Add it to `npm run smoke` as a third step.
4. Check performance on 390x844 LOW with capture on, style on and a full look: no long task over 50 ms at segment rotation, and fps within 5% of iteration 1.
5. Check the bundle size (`npm run build`, chunk warning 1200 KB).
6. Update `GDD.md` with new sections (Style and scoring, Share and challenges, Daily Run, Wardrobe, Trail Maker, Clips and photos) and `LANES.md` (iteration 2 ownership and the contract summary).
7. Run `npx tsc --noEmit && npx vitest run && npm run build && npm run smoke`.
8. Only if the orchestrator allows touching `client/`: run `npm run build:client` (it writes `../client/public/meowrun-game`).

## 8. Decisions with defaults ("Your call"; work continues with the default)

| Question | Default |
|---|---|
| Watermark text | `tokentails.com/meow-run` (the route exists in `client/next.config.js`) |
| Clip length | the last 12 s, plus a 1.2 s end card; MP4 when possible |
| Clip capture on phones | on (AUTO) when MediaRecorder exists, and the player can turn it off |
| Do challenge links bypass stage locks? | yes (a friend's link always plays) |
| Style points | raw, not multiplied; star targets unchanged |
| Player name | asked on the first share, skippable ("A Mochi fan"), at most 14 characters, sanitised |
| Trail sharing | only after the maker has finished it once |
| Daily Run reset time | 00:00 UTC (03:00 Vilnius, EEST) |

## 9. Integration status (integrator pass)

- **Wired:** all six lanes start from `registerUgc()` and plug into the real flow: title (WARDROBE with a NEW count, DAILY once Endless is open, TRAIL MAKER), stage select (DAILY RUN, TRAIL MAKER), pause (PHOTO, SAVE CLIP with a seconds badge), results (SHARE, SAVE CLIP, SHARE TRAIL, EDIT TRAIL, the challenge banner, wardrobe unlock toasts), settings (Replays AUTO/ON/OFF, Vertical clips) and the HUD (combo meter, tier stamps, trick popups, race pill, ghost name tag). `?c=` and `?t=` links open their overlays on the title.
- **CONTRACT-REQUEST applied:** the HUD hides the bell row on every stage with `bells === 0` (`body.nobells`, set in `src/ui/hud.ts`); the TRAILS lane's `body.trails-run #bells` rule is gone.
- **Layout:** the results and pause cards scroll on short screens (the card centres while it fits); results buttons pair two per row with equal widths, down to 360 px; the toast uses its natural width and parks fully off-screen; the phone tier stamp clears the reaction portrait; on landscape phones the combo meter hides while the tutorial coach card shows.
- **Small fixes across lanes:** shared clips and cards leave a C style rank off; photo poses keep Mochi on the leaf board or the puff cloud she rides; the ghost's translucent shaders are pre-warmed with `renderer.compileAsync` when a race starts.
- **New checks:** `shots/ugc-smoke.mjs` (every UGC entry with real input, both viewports; `npm run smoke:ugc`, and the third step of `npm run smoke`) and `shots/ugc-perf.mjs` (fps and long tasks at 390x844 LOW with the full look, capture on vs off; `THROTTLE=4` for a slower CPU).
- **Open:** clips show the 3D canvas only (no DOM HUD); iOS Safari clip sound after the first segment and real-device fps are untested; the live photo watermark sits under the tray on narrow screens (the saved PNG is correct); `npm run build:client` was not run (it writes outside `meow-run/`).
