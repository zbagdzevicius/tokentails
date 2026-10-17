# Bad Cat Daily: lanes for the M0 build

Spec: `docs/plans/viral-game/GDD.md` (sections 3, 4, 5, 6.1, 6.3, 6.6, 7, 8, 11, 12, 13, 17).
Frozen interfaces: `src/types.ts` (LEAD). This file says who owns which file, what each lane exports and what
it may import. Lanes run **in parallel in the same tree**, so ownership is disjoint: never edit a file you do
not own. If you need a change in someone else's file or in `types.ts`, write it under "Interface change
requests" at the end of this file (append-only, one line, your lane id) and work around it with a local adapter.

## Rules for every lane

- Work only inside `bad-cat/`. Never read `.env*`. Do not touch `catnip-heist/` (copying from it is fine).
  No git commit, push or branch switch. Do not run `npm install` (all deps are installed: `three`,
  `mediabunny`, `vite`, `typescript`, `vitest`, `@types/three`, `@types/node`, `happy-dom`, `@playwright/test`).
- No downloaded assets: all 3D is procedural low-poly three.js (Box/Cylinder/Cone/Sphere/merged primitives,
  `flatShading`, toon palette, warm cozy look); all audio is WebAudio synthesis.
- Server pieces (Stripe Checkout, cameo API, `client/pages/api`) are out of scope. The only env flag is
  `VITE_BADCAT_PRESALE_URL` (pre-sale Payment Link), read only by L8.
- three.js, WebAudio, IndexedDB, WebCodecs are browser-only: never touch them at module top level (import
  `three` freely, but create renderers, contexts and DB handles inside functions) so Node tests can import
  every module.
- Cross-lane imports: only `../types` and the **public exports listed below**, always through the lane's
  `index.ts` (`import { x } from '../sim'`), never a deep path into another lane's folder.
- Each lane owns its folder's `index.ts` and must keep every export listed below with the same signature
  (stubs exist already; replace the `TODO` throws). Extra exports are fine.
- Tests: `*.test.ts` next to your files inside your folder (Node environment; put
  `// @vitest-environment happy-dom` on line 1 for DOM tests). No WebGL/AudioContext in unit tests.
- Green before you stop: `npx tsc --noEmit` and `npx vitest run` from `bad-cat/` (other lanes' stubs stay
  green because they compile; if a lane is mid-edit and breaks tsc, do not fix it, report it).
- Mobile portrait first (iPhone Safari, Chrome Android), desktop second. `env(safe-area-inset-*)` for HUD.

## Ownership map

| Path | Owner |
|---|---|
| `src/types.ts`, `src/types.test.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LANES.md` | LEAD |
| `src/sim/**` | L1 Sim |
| `src/content/**`, `src/codec/**`, `public/daily/**` | L2 Content + codec |
| `src/render/**` | L3 Render |
| `src/catmaker/**` | L4 Cat maker |
| `src/main.ts`, `src/ui/**`, `index.html` | L5 UI + input + game loop |
| `src/share/**` | L6 Share + clip |
| `src/audio/**` | L7 Audio |
| `src/platform/**`, `src/progress/**`, `vite.config.ts`, `playwright.config.ts`, `e2e/**`, `tools/**`, `public/` (except `public/daily/**`) | L8 Platform + progress + QA |

## Shared conventions (from `types.ts`)

- Grid 12 × 10 (`ROOM_W`, `ROOM_D`), index `z * w + x`, x east, z south (toward the camera), 0.4 m cells.
- `Dir8` 0 none, 1 N … 8 NW clockwise; offsets `DIR_DX` / `DIR_DZ`. Facings are 1..8.
- Integer sim: suspicion in milli-units (0..100 000), rates in `SUSPICION`, step/jump/fall ticks in
  `STEP_TICKS`, `JUMP_TICKS`, `FALL_TICKS[from][to]`.
- **Scoring formula (fixed for all lanes):**
  `points = floor(base × HEIGHT_MULT_X2[fromLevel] × combo × (eventActive ? 5 : 4) × (lastCall ? 2 : 1) / 8)`;
  Must-Wreck adds `BONUS.target` once per target prop; stash `BONUS.stash` (max 2).
  End: caught → `finalScore = floor(score / 2)`, stamp 3; else `maxSuspicion ≤ perfectLimit` →
  `score + floor(score / 4)`, stamp 1; else stamp 2. Rank from `RANKS` on `finalScore`.
- `PlayableRoom` = `RoomDef` + `ShellDef` (heightmap, furniture, human spot, cat bed) + `RoutineDef`
  (human timings) + `mode`. L2 builds it (`content.resolve`); L1 and L3 only consume it.
- FTUE mode (`mode: 'ftue'`): run is `FTUE_TICKS` (1 200), first TELEGRAPH at tick 240 (8 s), room
  event at tick 450 (15 s). Ranked/practice: `room.ticks`, event at `routine.eventTick`.
- Prop catalog data is in `types.ts` (`PROP_KINDS`, `propKind(kind)`); kinds 14 (tablecloth) and 20 (roomba) are
  inert decoration in M0.

---

## L1 Sim (`src/sim/**`)

**Owns:** `src/sim/index.ts`, copied `rng.ts`, `hash.ts`, `replay.ts`, `grid.ts` (already present, keep the
exports), new `sim.ts cat.ts human.ts props.ts cone.ts scoring.ts events.ts` and tests.

**Exports (`src/sim/index.ts`):**
```ts
initSim(play: PlayableRoom, cat: CatSpec): SimState
stepSim(s: SimState, play: PlayableRoom, input: TickInput, out: SimEvent[]): void      // mutates s, appends events
runToEnd(play: PlayableRoom, cat: CatSpec, inputs: readonly TickInput[]): RunResult  // inputs past the end read as NO_INPUT
hashState(s: SimState): number                                                       // FNV-1a over every int field + typed arrays
coneCells(s: SimState, human: number): Int16Array    // cell indices of the human's current cone (after occlusion), for render
swatTarget(s: SimState): { prop: number; grab: boolean }   // auto-assist target now (UI GRAB hint)
sim: SimApi
seedRng, nextRng, rngInt, FNV_OFFSET, fnvInt, fnvInts, encodeInputs, decodeInputs, InputRun,
lineOfSight, inBounds, cellIndex, isOccluding
```

**Implements (GDD 4.1–4.5, M0 rule set):** 8-way cell stepping with sneak/trot tick counts, direction read
only at step end, no corner cutting, blocking by higher level / intact blocking prop / human cell; loaf after
`LOAF_DELAY_TICKS`; jump up exactly +1 or down any; swat with auto-assist (nearest prop within 1 cell, within
60° of facing = facing and its two neighbours), heavy props wobble per `swats`; push one cell, fall off an
edge, `FALL_TICKS`, landing cell rule, domino cascade (≤ `MAX_CHAIN_STEPS`), occupied landing cell rule,
break/land/spill per `onLand`; grab/drop/stash in `shell.catBed`; human BUSY → TELEGRAPH → LOOK / FAKEOUT
(after `fakeOutAfterTick`, `fakeOutPct`) with escalation and the once-per-room EVENT (`EVENT_TICKS`, human at
`humanEventSpot`, no cone); cone 70°/10 cells as a precomputed offset table per facing (no trig), occlusion
by `lineOfSight` unless cat level is 3; suspicion rates; CAUGHT at 100 % → `CatAct.CUDDLED` for `CUDDLE_TICKS`,
then ended; combo window; last call; end-of-run stamp and `finalScore`; `RunResult.timeline` may be `''`.
All randomness from `s.rng`. No floats, no `Math.random`, no trig, no Date.

**Imports allowed:** `../types` only. Tests build their own `PlayableRoom` fixtures (do not import `../content`).

**Acceptance:** tsc + vitest green; tests cover: orthogonal/diagonal step timing, corner-cut refusal, jump
up/down rules, push-off-edge fall with correct fall ticks and landing cell, domino of 2+, occupied landing,
heavy prop needs 2 swats, cone blocked by an occluding cell and not blocked at L3, suspicion → caught →
cuddle → ended, FTUE timings (first telegraph at 240), scoring formula (combo, event, last call, perfect,
caught) with 100% branch coverage of `scoring.ts`; determinism: the same inputs give the same `finalHash` 3
times and after `structuredClone` of a mid-run snapshot; a 2 250-tick random-input run ends with `ended = 1`.

## L2 Content + codec (`src/content/**`, `src/codec/**`, `public/daily/**`)

**Owns:** `content/index.ts props-catalog.ts shells.ts routines.ts daily.ts validate.ts rooms/*.json`,
`codec/index.ts bits.ts base64url.ts crc16.ts cat-codec.ts link.ts text-filter.ts` (ghost/room codecs: M1a/M2
stubs), `public/daily/index.json` (optional in M0).

**Exports (`src/content/index.ts`):**
```ts
DAY1: string                                   // '2026-11-16'
SHELLS: readonly ShellDef[]                    // [0] = Kitchen 12×10
ROUTINES: readonly RoutineDef[]                // [0] = Chef Dad
dayNoFor(date: Date): number                   // local-date days since DAY1 + 1 (no UTC drift)
dailyRoom(dayNo: number): RoomDef              // cycles the ~7 Kitchen variants in M0; title "Kitchen #<n>: Breakfast Heist"
glassRoom(): RoomDef                           // "The Glass": the wine glass on the counter edge as target #1
pickerRooms(todayNo: number): { dayNo?: number; room: RoomDef; label: string }[]   // Glass first, today, then recent
resolve(room: RoomDef, mode: RunMode, dayNo?: number): PlayableRoom
validate(play: PlayableRoom): ValidationReport // BFS with the sim's 8-way moves (GDD 13.7)
content: ContentApi
```
**Exports (`src/codec/index.ts`):**
```ts
encodeCat(c: CatSpec): string                  // 88-bit layout of GDD 6.6 + CRC-16, base64url, 15 chars (name travels separately as n=)
decodeCat(code: string, name?: string): CatSpec | null
parseLink(url: URL): LinkState                 // /badcat/d/<n>, /glass, /pick?e=t, /c/<cat>, ?c ?n ?g ?g2 ?rp ?clip ?via ?studio; also #d=18&… for standalone
buildLink(s: LinkState, base: string): string
filterName(raw: string, max = 12): string      // trims, strips control chars and URLs, small blocklist, falls back to ''
encodeGhost / decodeGhost                      // async, M1a; keep stubs
codec: CodecApi
```
In M0 `parseLink` leaves `ghosts: []` (raw `g` values are ignored until the ghost codec ships).

**Content:** Kitchen shell (counters along the back wall at L2, a table + chairs mid-room L2/L1, a high
shelf L3 and fridge L3, stove, sink, cat bed on the floor, window; human spot at the stove), Chef Dad routine
(busy 90–270, telegraph 24, look 45–105, fakeOut 20 % after 900, escalation after 1350, event tick ~1200,
cue "stove timer"), 25–45 props from the 15 MVP kinds, exactly 3 targets, spawn on the floor; ~7 seeded
Kitchen variants (jitter of prop positions + routine timing); The Glass.

**Imports allowed:** `../types`; `../sim` exports (`lineOfSight`, `initSim`, `runToEnd`) for validation and tests.

**Acceptance:** cat code round-trips for every pattern/ears/tail/body/eyes combination sample and rejects a
flipped bit (CRC); `parseLink(buildLink(x))` round-trips every row of the GDD 6.6 table that M0 uses (daily,
glass, pick with `e=t`, cat card, via, clip handoff flag); `dayNoFor` gives 1 on DAY1 and 18 seventeen days
later in any time zone; `validate` passes every room (all 3 targets reachable, first target ≤ 180 trot+jump
ticks, 25–45 props, occluders present, each prop's `level` equals the shell level at its cell, no prop on
the human or spawn cell); the shell's `levels`/`occludes` arrays have length `width × depth`.

## L3 Render (`src/render/**`)

**Owns:** `render/index.ts Renderer.ts room-view.ts cat-rig.ts cat-material.ts face-decal-material.ts
human-rig.ts props-view.ts shards.ts camera.ts clip-camera.ts vision-cone.ts quality.ts clip-pass.ts
context-loss.ts palette.ts` and tests.

**Exports (`src/render/index.ts`):**
```ts
createRenderer(container: HTMLElement, opts?: RenderOptions): Renderer
renderFrames(r, play, cat, inputs, plan: ClipPlan, onFrame): Promise<void>   // re-runs the sim (../sim), 30 fps, honours plan.slowMo and matchCutTick, setTarget(720×1280, hud false) then restores
buildCatMesh(spec: CatSpec, face?: HTMLCanvasElement | ImageBitmap | null): THREE.Group
createCatPreview(canvas, spec): { update(spec, face?): void; dispose(): void }   // turntable on a plinth for L4
render: RenderApi
```
Also export a pure `clipFrameToTick(plan: ClipPlan, frame: number): number` (360 frames = 12 s) for L6 tests.

**Implements (GDD 11):** procedural cutaway kitchen (two walls removed, window with gradient sky, furniture
from `ShellDef.furniture`, merged per material), 15 prop kinds as small merged primitive meshes (instanced
by kind at rest; a falling prop swaps to a pooled standalone mesh), procedural cat built from boxes/cylinders
with a dedicated **face quad** whose `map` takes the face decal, M0 patterns solid + tabby (shader or vertex
colour stripes), ears/tail/body variants as scale/part swaps, loaf/swat/jump/blink as procedural part
offsets; rigid-part human with the 0.8 s double-take; vision cone on the floor from `coneCells` (outline in
TELEGRAPH, filled red + hatch in LOOK), "?" bubble, gold pulse on targets, glow on grabbables; shards
`InstancedMesh` pool 300; whole-room portrait camera (FOV ~48°, pitch 52°, distance from room width so the
full width fits), 2° kick on a break unless reduceMotion; clip camera from `ClipShot`; DPR governor (start 1.25
Android / 1.5 iOS, cap 2, frozen during the clip pass); context loss → `onContextLost(true/false)`; ≤ 80 draw
calls, ≤ 60k tris, 1 hemisphere + 1 directional light, blob shadows. Interpolate the cat with
`(stepProgress + alpha) / stepTicks` between `from*` and current cell. The renderer never writes `SimState`.

**Imports allowed:** `../types`, `three`, `../sim` (`initSim`, `stepSim`, `coneCells`).

**Acceptance:** tsc + vitest green; Node tests for pure parts (camera fit: full room width visible at 9:16 and
3:4; `clipFrameToTick` monotonic with slow motion; palette/RGB565 conversion; prop mesh factory returns a
mesh for all 15 kinds without a WebGL context). In the browser (L5's dev page): Kitchen visible top to bottom
on a 390×844 viewport, human always on screen, draw calls ≤ 80 (`renderer.info.render.calls`).

## L4 Cat maker (`src/catmaker/**`)

**Owns:** `catmaker/index.ts CatMaker.ts face-decal.ts photo-input.ts body-colour.ts preview.ts
photo-store.ts styles.ts` and tests.

**Exports (`src/catmaker/index.ts`):**
```ts
openCatMaker(host: HTMLElement, opts: { initial?: CatSpec; fromLink: boolean; render: RenderApi }): Promise<CatMakerResult>
loadFace(catIndex: number): Promise<FaceDecal | null>
loadOpener(catIndex: number): Promise<{ media: Blob; kind: 'photo' | 'video' } | null>
catMaker: CatMakerApi
// pure helpers (tested):
cropToDecal(src: ImageBitmap | HTMLCanvasElement, crop: { x; y; w; h }): HTMLCanvasElement   // 256×256, feathered oval alpha
ringMedianColour(pixels: Uint8ClampedArray, w: number, h: number): number   // 0xRRGGBB of the crop's outer ring
```

**Implements (GDD 6.1):** "Snap your cat (10 s)" with **Skip, use a house cat** (→ `DEFAULT_CAT`,
method `skipped`); Take photo (`<input type=file accept="image/jpeg,image/png,image/*" capture>`), Choose
photo or short video (video: grab one frame in M0), Pick by hand; decode with `createImageBitmap` (HEIC
failure → "send a screenshot or a JPEG"); oval drag + pinch crop pre-placed at centre → 256² decal; body colour
from the ring median, chips for pattern (solid, tabby), base/secondary colour, eyes (6), ears, tail, body, a
12-char name (`filterName` from `../codec`); live turntable preview via `createCatPreview`; save face + opener
to IndexedDB `bcd-photo` (every access in try/catch, fall back to memory). The opener is the source photo.
DOM + CSS only, portrait, thumb-reachable, ≥ 44 px targets.

**Imports allowed:** `../types`, `../render` (`buildCatMesh`, `createCatPreview`), `../codec` (`filterName`).

**Acceptance:** tsc + vitest green; tests: `ringMedianColour` on synthetic pixels, crop maths (oval inside
bounds after pinch/drag clamp), RGB → RGB565 chip mapping, photo-store falls back to memory when
`indexedDB` is undefined; skip resolves with `DEFAULT_CAT` in one tap.

## L5 UI + input + game loop (`src/main.ts`, `src/ui/**`, `index.html`)

**Owns:** `src/main.ts`, `index.html`, `ui/index.ts app-shell.ts router.ts loop.ts copy.ts styles.css
screens/{Boot,Picker,Home,Briefing,Hud,Result,Share}.ts input/{touch,keyboard,quantise}.ts` and tests.

**Exports (`src/ui/index.ts`):**
```ts
startApp(root: HTMLElement, services: GameServices): void
createInput(stage: HTMLElement, env: EnvInfo): InputSource
// pure (tested):
quantiseStick(prev: StickState, dx: number, dy: number, radius: number): StickState   // 8 sectors, 12° hysteresis, 3-tick hold, sneak < 35 % / trot > 45 %
```

**Implements:** `main.ts` composition root (already sketched: builds `GameServices` from every lane's index,
`loadShare` = dynamic `import('./share')`); router state machine of GDD 13.5 for M0: `boot → (pick?) →
(link? catmaker : home) → briefing → run → result → share → home`, FTUE order of GDD 8 (first link visit:
catmaker → 40 s FTUE run → clip → share → "Your ranked run is ready"); game loop: fixed 30 Hz accumulator,
`input.sample()` → `sim.stepSim` → `audio.onEvents` → `renderer.frame(s, alpha, events)` on rAF, pause on
`visibilitychange` and on context loss; touch (left 55 % floating stick with 24 px edge dead strips, SWAT large
+ JUMP above it on the right, latched buttons, GRAB icon from `swatTarget`), keyboard (WASD/arrows, Shift sneak
toggle, Space jump, J/click swat, K grab, Esc pause, R restart in practice); HUD (score top centre, combo under
it, timer top right, suspicion eye, "?"/event banner "DELIVERY! 6 seconds", "LAST CALL ×2", 3 contextual FTUE
prompts), briefing card (room, human, 3 targets, tap to start; warm-up behind it), result (count-up, stamp,
rank), share screen (Post clip lights up when L6's export is done; the tap calls `shareClip`; in-app browser:
"Open in Safari/Chrome" + copy handoff link; Practice again; Dare a friend disabled until M1a), pre-sale
button on home when `platform.presaleUrl()` is set, no offer card in session 1; haptics via
`platform.vibrate`; analytics calls at the GDD 14 points; one ranked run per day via `platform.dayRecord`.
QA hook when `env.qa`: `window.__BADCAT_QA__ = { screen(): string; state(): SimState | null; play(inputs: TickInput[]): Promise<RunResult> }`.

**Imports allowed:** `../types` and, in `main.ts` only, every lane's `index.ts`. `ui/**` reaches other lanes
through `GameServices`, plus direct `swatTarget` from `../sim` (for the GRAB hint) and `DEFAULT_CAT`.

**Acceptance:** tsc + vitest green; `quantiseStick` tests (jitter ±10° at a border never flips direction, new
direction needs 3 ticks, 35/45 % speed hysteresis); router transition tests with fake services (FTUE order,
no offer card in session 1, ranked once per day); `npm run build` succeeds and the first-load JS (without
`share`/`mediabunny` chunks) is ≤ 450 KB gzip.

## L6 Share + clip (`src/share/**`)

**Owns:** `share/index.ts emoji-card.ts share-sheet.ts inapp-handoff.ts clip/{highlights,compose,
encoder-webcodecs,encoder-mediarecorder,gates,captions}.ts` and tests. (Image cards: M1a.)

**Exports (`src/share/index.ts`):**
```ts
planClip(r: RunResult, play: PlayableRoom, catName: string): ClipPlan       // tension pick, GDD 7.3
exportClip(render: RenderApi, renderer: Renderer, play, cat, r, opts): Promise<ClipExportResult>
shareClip(clip: Blob, text: string): Promise<'native_share' | 'download' | 'long_press' | 'cancelled'>
copyHandoffLink(link: string): Promise<boolean>
share: ShareApi
// pure (tested): clipGates(plan, layout) -> string[] (violations), captionFor(plan, gapTicks) -> string
```

**Implements (GDD 7.3):** candidate crimes = falls of targets/fragile props with a 7 s window ending 1.5 s
after the break; tension = peak suspicion in the 3 s before + froze-in-cone bonus + biggest bonus for "turned
too late" (LOOK start ≤ 12 ticks after the prop left the surface, caption "He turned around 0.4 seconds too
late"); ties → earliest; no tension → first target push; caught run → cuddle payoff. Compose 12 s at 720×1280:
0–2 s opener (photo with 3 % push-in, caption top third, no UI in 0–1 s; without opener: game close-up),
2.0 s match cut to the close-up pose (`FACE_RECT`), one take, 0.35× slow motion on the fall, URL line
(`{env.shortUrl} · Kitchen #18`) in the last 2 s, watermark top-left from 1.0 s inside the safe box (top 11 %,
right 16 %, bottom 25 % clear), last frame matches first framing. Encoder: probe
`VideoEncoder.isConfigSupported` down `['avc1.42001f','avc1.42e01f','avc1.4d401f']`, mux with `mediabunny`
(dynamic import), `new VideoFrame(canvas)` in the same task as the draw, close every frame, wait while
`encodeQueueSize > 4`; audio from `audio.renderOffline` when `AudioEncoder` exists, else silent (MediaRecorder
fallback + `captureStream` may land in M1a). Abort on context loss with an error string the UI shows as
"Clip interrupted. Tap to retry". `shareClip`: `navigator.share({ files })` → download link → inline video.

**Imports allowed:** `../types`, `mediabunny` (dynamic only), `../codec` (`buildLink`), `../platform`
(`detectEnv`). Rendering only through the `RenderApi`/`Renderer` passed in.

**Acceptance:** tsc + vitest green; `planClip` tests on synthetic `RunResult`s (turned-late beats higher
suspicion; earliest tie; default when no falls; caught run); `clipGates` passes for the default layout and
flags a watermark in the right 16 %; `share/index.ts` has no static import of `mediabunny` (test reads the
file); `npm run build` puts mediabunny in a separate lazy chunk.

## L7 Audio (`src/audio/**`)

**Owns:** `audio/index.ts audio.ts synth.ts sfx-map.ts music.ts` and tests.

**Exports (`src/audio/index.ts`):**
```ts
createAudio(): AudioEngine
// pure (tested):
cuesFor(events: readonly SimEvent[], s: SimState): Cue[]   // which synth cues an event list triggers (step by level/speed, swat pap, wobble, crash by PropMaterial, hm? sting on telegraph, combo tick with rising pitch, stamp, purr, caught wah-wah, perfect brass, last call)
```

**Implements (GDD 12):** everything synthesised with WebAudio (oscillators, filtered noise bursts, envelopes):
paw steps on 4 surfaces (by level), swat "pap", wobble rattle, falls by material (glass tinkle + crunchy
noise "kshhh" tail, ceramic, plastic bonk, metal clang, food splat, paper flutter), crash mixed 3–4 dB above
the rest, the two-note "hm?" sting on TELEGRAPH, combo ticks rising in pitch, stamp slam, purr, CAUGHT
softened wah-wah + purr, PERFECT 4-note brass, doorbell/kettle event cue; a procedural 90 bpm lo-fi loop
(bass + brushes; pizzicato layer fades in during TELEGRAPH/LOOK; fuller during the event). `unlock()` on first
gesture (no sound before), master/music/sfx gains, `setMuted`, `captureStream()` via a
`MediaStreamAudioDestinationNode`, `renderOffline` via `OfflineAudioContext` for the clip mix. Create the
`AudioContext` lazily inside `unlock()`; a missing WebAudio is a silent no-op engine, never a throw.

**Imports allowed:** `../types` only.

**Acceptance:** tsc + vitest green; `cuesFor` tests (break of a glass prop → glass crash cue, telegraph human
event → sting, combo pitch rises with combo); `createAudio()` in Node returns a no-op engine without throwing.

## L8 Platform + progress + QA (`src/platform/**`, `src/progress/**`, configs, `e2e/**`, `tools/**`, `public/`)

**Owns:** `platform/index.ts storage.ts env.ts analytics.ts checkout.ts pink-paw.ts`,
`progress/index.ts streak.ts` (rapsheet/season M2 stubs), `vite.config.ts`, `playwright.config.ts`, `e2e/**`,
`tools/**`, `public/manifest.webmanifest`, `public/icon.svg` (procedural paw), `public/` except `public/daily/`.

**Exports (`src/platform/index.ts`):**
```ts
createStore(prefix = 'bcd:v1:'): Store          // localStorage, memory fallback, never throws, persistent flag
detectEnv(): EnvInfo                            // UA: TikTok (BytedanceWebview|musical_ly|TikTok), Instagram, FBAN/FBAV; iOS incl. iPadOS; webcodecs/AudioEncoder/canShare({files}) probes
track(event: AnalyticsEvent, props?: AnalyticsProps): void   // M0: in-memory ring buffer + console in dev, no network
createPlatform(): PlatformApi                   // profile (DEFAULT_CAT when empty), day records (prune > 400), presaleUrl (VITE_BADCAT_PRESALE_URL, https only), vibrate (try/catch)
```
**Exports (`src/progress/index.ts`):** `recordRankedDay(store, dayNo): Streak` (M1a may stay a simple version),
`recordCrimes(store, events): string[]` (M2 stub may remain).

**Also:** `vite.config.ts` (port 5174, relative base, `BADCAT_BASE`, three chunk, `envPrefix: ['VITE_']`),
`playwright.config.ts`, an `e2e/smoke.spec.ts` (page loads at 390×844, a canvas exists after the briefing,
`__BADCAT_QA__.play(scripted inputs)` returns a `RunResult` with `ended`; skip gracefully while L5's hook is
missing), PWA manifest + icon. Do not run `npm run build:client`.

**Imports allowed:** `../types` only (e2e may use anything).

**Acceptance:** tsc + vitest green; tests: store survives a throwing `localStorage` (getter throws and
`setItem` throws) with `persistent: false`; env detects the three in-app UAs and iPadOS; presale URL null when
unset or non-https; day records prune to 400.

---

## Integration order (LEAD)

1. Lanes land independently against the stubs (each keeps tsc + vitest green).
2. LEAD integration pass: `main.ts` wiring check, end-to-end run in the dev server (port 5174), first-load
   budget, `npm run e2e`.
3. Docs outside `bad-cat/` (root `CLAUDE.md` package table, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`) are
   updated by LEAD after integration, not by lanes.

## Interface change requests (append-only)

<!-- Format: - [L?] what, why, workaround in place -->
- [L6] L3 `clipFrameToTick` should equal `share/clip/highlights.ts` `clipFrameTick` (hold `matchCutTick` on frames 0–59 and 330–359; 1× outside `slowMo`). Details and the `onFrame` same-task contract: `LANE-NOTES/L6-share-clip.md`. No types.ts change.
- [LEAD, QA round 2] `types.ts`: `SIM_VERSION` 3 (FTUE first look aims at the cat with `look[1]` and half suspicion; auto-hop after 6 ticks into a +1 ledge, counted in internal `autoHop`, hashed; no fall/break suspicion for props whose fall began before `lookStartTick`; Perfect Crime needs a survived look plus 2+ breaks or a Must-Wreck; caught runs rank `CAUGHT_RANK` "Cuddled"), `COMBO_WINDOW_TICKS` 90, `CAUGHT_RANK`, and `ShareApi.exportClip` opts `signal` (the clip job cancels on "Play again"). Kitchen shell gains an L1 footstool at x2-3 z7; rooms re-baked. Old links with sim version 2 are rejected by `link.ts` as before.
- [LEAD, QA round 3] `types.ts`: `SIM_VERSION` 4. New `SimEvent` `cantReach` (a jump or a push at a surface 2+ levels up; the sim first hops onto an adjacent seat one level up when one is beside both the cat and the high cell, `cat.ts seatToward`). `seen` / `seenCount` count moving-in-cone moments only (`catActGainsSuspicion`, internal `spotted`, hashed); a frozen cat in sight stays `s.seen = 1` without a count. FTUE first look = `look[0] + 15` (60 ticks); Chef Dad `look` [45, 90]. `RANKS` gain "Nap Champion" (0) and "Troublemaker" (800+). `seenText()` shared copy. `ClipShot.human?` and `ClipPlan.crime.lookTick?` (the follow shot keeps the human's head when he turns in the clip). `FaceDecal.crop` is in opener-photo pixels (was source pixels; the composer ignores a crop that does not fit the opener). Dare/day links write preview days as `/d/p<n>` (old `/d/-n` still parses). Rooms unchanged (routines live in code); the bake test passes as is.
