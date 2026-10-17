# W2-SHARE: post formats, household, cards, carousel, fallback 2, studio, handoff

Owned: `bad-cat/src/share/**`. No file outside it was edited, except one appended block of "Change requests" in
`FULL-PLAN.md`. `npx tsc --noEmit` is clean. `npx vitest run` passes: 52 files, 928 tests, of which 13 files and
84 tests are in `src/share`. Every existing export and signature is kept. `share/index.ts` still reaches the encoders,
mediabunny and the new GIF encoder only through `import()`; the lazy-chunk test checks this for 9 share modules.

## Files

| File | What |
|---|---|
| `formats.ts` | `formats(ctx)`: the 8 "Post as..." templates (6 GDD formats + carousel + household), captions, labels, availability |
| `clip/format-plan.ts` | `planFormatClip` (stitch/reply/irl/roomba/still_waiting), `planRoomba` (180 frames), household timeline, captions, verdict |
| `clip/gates.ts` | `layoutFor(plan)` for every format, plus generalised `clipGates` (end line, pill in the top third, split safe box, frame count) |
| `clip/highlights.ts` | `planFrames`, `loopFromFrame`, `urlFromFrame`, `gameFramesOf`, `planSize`, `planEndTick`; `clipFrameTick` follows `plan.frames` (tail = last 30) |
| `clip/styles.ts` | Caption styles 0..4 (Default, Classic, Comic, Neon, Typewriter), the handle pill |
| `clip/compose.ts` | Composer: layout per plan, video opener frames (`pushRect`), handle pill, end line, styles, `drawCard`, `setOpener`, `captionFor` |
| `clip/video-opener.ts` | 2 s video opener: 60 frames decoded with `requestVideoFrameCallback`, cropped to the output framing |
| `clip/pipeline.ts` | Job runner (card steps + render passes into one encoder), audio cues, offline mix, real-time schedule, GIF window, capture encoder |
| `clip/household-paint.ts` | Household title card (faces bounce in, "VS") and scores card (crown on the worse cat) |
| `clip/gif.ts` | GIF89a encoder (fixed 252-colour palette, LZW, NETSCAPE loop, size budget), plus an LZW decoder for the tests. Lazy |
| `clip/encoder-mediarecorder.ts` | Records the audio track and runs `onFirstFrame` → `audio.scheduleClip` (clip time 2.0 s) |
| `cards.ts`, `card-text.ts` | Rap Sheet mugshot (gold stamps, `stampAnim`), cat card, cameo card, carousel slides, `renderCard`, `renderCarousel`; pure text helpers |
| `studio.ts` | Pure studio queue reducer for `?studio=1` and batch mode |
| `inapp-handoff.ts` | `androidIntent`, `intentUrl`, `handoffPlan`, `handoffEvent`, `buildDareChainLink` (g + g2), `buildRoomDareLink` (gn/gn2) |
| `report.ts` | `reportProps(payloadHash, kind)`, `reportPayload(payload, kind)` for `ugc_reported` |
| `share-sheet.ts` | `shareFiles` (multi-file native share, else staggered downloads), `multiFileNames` |
| `index.ts` | `exportClip` for every format plus fallback 2, `renderRapSheetLoop`, `androidIntent`, and the `share` object with every FULL member |
| `dev/index.html`, `dev/dev.ts`, `dev/capture.mjs` | Dev page and acceptance capture. Not shipped. |

## API (`ShareApi`, all FULL members implemented)

- `exportClip(render, renderer, play, cat, run, opts)`
  - `opts.format`:
    - `pov` (default)
    - `stitch`, `reply`: `opts.overlay` is the handle; it becomes the pill "@luna.mom" or "Replying to @luna.mom"
    - `irl_vs_game`: 720 × 640, no opener, loops on its own close-up
    - `roomba`: 180 frames; the frame-up lands 54 ticks after the match cut; the render clip camera follows the
      Roomba
    - `still_waiting`: end line; `opts.adopted` gives "went home"
    - `household`: needs `opts.second`
  - `opts.captionStyle`: 0 to 4.
  - `opts.endLine`: replaces the URL line.
  - `opts.music`:
    - WebCodecs path: `audio.renderClipMix(..., { music, theme, musicSeconds })`
    - MediaRecorder path: `audio.scheduleClip`
  - Extra options, outside `types.ts`:
    - `adopted`
    - `link`: the link on the fallback card
    - `secondFaces`: the second cat's face decal
    - `restore`: the cats and faces to reload after a household clip
- `formats(ctx)`
  - Takes `FormatContext`, plus an optional `secondName`.
  - Every caption has the bare short URL and `#badcatdaily`.
  - A cat whose name reads as "link in bio" is shown as the default cat everywhere (`catOrDefault`).
- `renderCard(input)`: result, story, rapsheet, cat, cameo.
- `renderCarousel({ cards, photo, shortUrl, catName? })`
  - Slides: photo → each card fitted to 1080 × 1350 → "Your cat next?".
  - Output is JPEG at quality 0.9.
- `shareFiles(files, text, basename)`
- `androidIntent(link)`: `intent://…` only in an Android in-app browser.
- Module exports, not on `ShareApi`:
  - `renderRapSheetLoop(input)`: a 3 s Club loop at 720 × 1280. Uses WebCodecs, else MediaRecorder; null when
    neither works.
  - `handoffPlan(link, env, purpose)` and `handoffEvent(step, purpose)`: `bc_inapp_handoff` props.
  - `buildDareChainLink(play, mine, sender)` and `buildRoomDareLink(room, mine, sender, base, roomCode)`
  - The studio reducer: `createStudio`, `studioReducer`, `studioCurrent`, `studioProgress`, `studioExportOptions`,
    `studioHook`, `studioFileName`, `parseStudioBatch`, `studioEnabled`
  - `reportProps`, `reportPayload`
  - Plan and layout helpers: `layoutFor`, `planFormatClip`, `householdTimeline`, `gifWindow`, `jobFrameOrder`

## Timelines

| Format | Frames | Opener | Game | Tail (loop) | URL line / end line | Pill |
|---|---|---|---|---|---|---|
| pov, stitch, reply, still_waiting | 360 | 0–59 | 60–329 | 330–359 | 300–359 | 60–299 |
| irl_vs_game (720 × 640) | 360 | close-up | 60–329 | repeats frame 0 | 300–359 | – |
| roomba | 180 | 0–59 | 60–149 (1×) | 150–179 | 120–179 | – |
| household | 360 | title card 0–29 | A 30–179 (source 30..179 of a 180-frame pass), B 180–329 | scores card 330–359 | 300–359 | – |

Audio cues sit at clip time 2.0 s. In the household clip, cat A's cue is at 2.0 s and cat B's at 7.0 s. On the
WebCodecs path the cues are mixed into one buffer. On the MediaRecorder path they are scheduled at the moment frame 0
is recorded. Each cue is trimmed to the game part of its pass.

## Acceptance run (dev server http://localhost:5174, not restarted)

`node src/share/dev/capture.mjs [--query=only=pov,...|fallback=1]` opens `/src/share/dev/index.html` in headless
Chromium (SwiftShader). It plays seeded autopilot runs in a daily room that has a Roomba (daily-008, with a run
that framed the Roomba once), exports everything, and writes the files plus `summary.json` to
`bad-cat/test-results/w2-share/`. Results are listed in "Acceptance results" below.

## Deviations and decisions

- **Household:** `renderFrames` draws the renderer's loaded cat model; the `cat` argument drives only the sim. So
  `exportClip` reloads the renderer with the second cat before pass B (`renderer.load(play, [second.cat],
  opts.secondFaces)`) and reloads `opts.restore ?? [cat]` afterwards. Without `restore`, the live renderer loses
  the player's face decal until the next `load()`. A change request is filed.
- **Video opener memory:** the frames are decoded at 0.75 scale (540 × 960) and cropped to the face framing:
  60 frames ≈ 124 MB of bitmaps, released right after the export. A browser without `requestVideoFrameCallback`
  uses the old one-frame still.
- **Overlay pill:** now from 2.0 s (frame 60), at y 342–394 (top third). `DEFAULT_LAYOUT.overlay` changed to
  match; it was 1 s, at y 334–374.
- **Roomba clip:** 1× playback, no slow motion. Its URL line stays in the clip as the gates require, although GDD 7.5
  says the X post's URL goes in a self-reply; the post caption carries it too.
- **Fallback 2:**
  - Runs only when neither WebCodecs nor MediaRecorder is available, after one capture pass on the renderer.
  - Returns `error: CLIP_UNSUPPORTED` with `card` and `gif`.
  - The GIF is 30 frames at 15 fps, 360 px wide, with captions and the watermark burned in.
  - It is shrunk (frames dropped, then scaled) until it fits 1.5 MB, or null.
  - A MediaRecorder that exists but fails mid-record still returns an error (no fallback 2), as before.
- `clipGates` default layout is now `layoutFor(plan)` (identical to `DEFAULT_LAYOUT` for a POV plan except the pill).

## Gaps / not done

- No real-device test: no iPhone, no Android in-app webview, no real MediaRecorder audio on iOS. The intent://
  format follows Chrome's documented scheme but was not opened on a device.
- Pink Paw pronouns: "Her crimes stay in the game" and "find her on the fridge" are fixed copy (GDD); the Pink
  Paw data has no sex field.
- `formats()` cannot name the second cat without `secondName`, so the label falls back to "your other cat".
- The UI wiring (share screen format picker, studio screen, handoff sheet, report menu) is W3-UI-SHELL's; this lane
  ships the models and the export only.
- `ClipExportResult.encoder` reports `'fallback'` for fallback 2; analytics `codec` is not set by share.

## Acceptance results (Oct 16; headless Chromium + SwiftShader, `test-results/w2-share/`, `summary.json`)

- The shared server on :5174 served the first POV export. It then stopped answering (connection refused) partway
  through the batch run. This lane did not stop it and did not restart it. The rest ran on this lane's own
  `vite --port 5175`, which was stopped afterwards.
- Room daily-008 "Kitchen #8: Bake Sale". The autopilot run framed the Roomba once and was caught (cuddle payoff).
- Clips: all H.264 + AAC through WebCodecs, about 40–60 s each under software GL.

| Clip | Size | Frames | Notes |
|---|---|---|---|
| pov | 720 × 1280 | 360 | photo opener |
| pov, video opener | 720 × 1280 | 360 | 2.6 s webm opener |
| stitch | 720 × 1280 | 360 | "@luna.mom" pill |
| reply | 720 × 1280 | 360 | Classic caption style |
| irl_vs_game | 720 × 640 | 360 | Comic caption style |
| roomba | 720 × 1280 | 180 | 6 s; "NOT ME" sign on the Roomba |
| still_waiting | 720 × 1280 | 360 | Neon caption style; end line |
| household | 720 × 1280 | 360 | Typewriter caption style; Luna's model in pass B; crown on the scores card |

- `?mr=1` (no VideoEncoder): MediaRecorder MP4 with scheduled audio and music.
- `?fallback=1`: `error` = CLIP_UNSUPPORTED, plus a card with the crash freeze-frame (578 KB) and a GIF of 924 KB
  (budget 1.5 MB).
- Cards:
  - result, story
  - Rap Sheet, plain and Club (gold stamps)
  - cat (plinth portrait)
  - cameo
  - a long-name cat card
- Carousel: 5 JPEG slides.
- Animated Club Rap Sheet: 90-frame MP4.
- Visual check: I looked at frame strips of the stitch, household and roomba clips and at every card. The 0–1 s
  frames carry only the caption, the watermark appears from 1 s, the URL line is present in the last 2 s, and the
  tail loops back to the opener photo.
- Fixed during this run: the fallback-2 capture pass mapped its narrowed frame range to the wrong output frames
  (no GIF). The Club stamps were too faint and are now solid gold.
