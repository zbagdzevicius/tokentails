# Catnip Heist showreel: generation prompt

The 15-second promo `out/showreel.mp4` was made by Claude Code (Opus 5.5) from one prompt, run as a
multi-agent workflow.

## User prompt

> make a dynamic 15-second motion graphics video that shows what an incredible motion designer you
> are ( video must be to present catnip heist video ), like it's your showreel for a résumé. go all
> out. ultracode

## Workflow

15 agents in four phases:

1. **Assets**, 4 agents in parallel:
   - gameplay capture from the levels' solution replays → `assets/clips/`
   - sprite and brand kit → `assets/sprites/`
   - synthesized 128 BPM soundtrack → `assets/audio/`
   - deterministic canvas engine and renderer → `engine.js`, `render.mjs`, `ENGINE.md`
2. **Scenes**: one designer agent per 2-bar section → `scenes/s1.js` to `scenes/s4.js`.
3. **Render**: integrate and render 900 frames at 60fps with audio.
4. **Critique**, run twice: a motion/timing critic and a design/story critic, then a lead designer
   applies the fixes and renders again.

To re-render: `node render.mjs` (options in `ENGINE.md`).

## Full workflow script (contains every agent prompt)

```js
export const meta = {
  name: 'catnip-heist-showreel',
  description: 'Produce a 15s showreel-grade motion graphics promo video for Catnip Heist',
  phases: [
    { title: 'Assets', detail: 'gameplay capture, sprites/brand kit, soundtrack, engine in parallel' },
    { title: 'Scenes', detail: 'one motion designer per 2-bar section' },
    { title: 'Render', detail: 'integrate, render 60fps, mux audio' },
    { title: 'Critique', detail: 'critics review frames, fixer iterates' },
  ],
}

const W = '/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/promo'
const GAME = '/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist'

const BRIEF = `
PROJECT: a 15.000-second, 1920x1080, 60fps motion-graphics promo video for "Catnip Heist" — a voxel pixel-art stealth game (Token Tails) in ${GAME}. Read ${GAME}/README.md for the game: you control two cats, swap between them, sneak past Kibble Corp guard dogs (vision cones), collect catnip coins, use pressure-plate doors, meow to lure guards, get the key, open the vault, free the shelter cat from its crate, escape through the exit portal. 8 heists. 58 cat breeds. Cat Yard.
It must feel like the showreel piece of a world-class motion designer: kinetic typography, snappy easing (expo/back/elastic), overshoot, motion blur/smear frames, masks & wipes, parallax, camera shake on hits, glitch/scanline security-cam aesthetic, particles, light leaks, chromatic aberration, match cuts, everything hitting the beat. Zero dead frames. Pixel-art crispness preserved for sprites (imageSmoothingEnabled=false when drawing sprites).

MUSIC GRID (fixed contract): 128 BPM, beat = 0.46875 s, bar = 1.875 s, 32 beats = exactly 15.000 s. 8 bars.

STORYBOARD (bar = 1.875s):
- Bar 1 (0.000-1.875) COLD OPEN: black, security-cam boot (REC dot, timecode, scanlines), "KIBBLE CORP // RESTRICTED" glitch type, laser grid sweep, a vision cone sweeps across the frame. Tension.
- Bar 2 (1.875-3.750) THE CREW: two cat sprites slam in on beats, kinetic type "TWO CATS." / "ONE HEIST." with hard cuts on each beat, "SWAP" whip transition.
- Bar 3-4 (3.750-7.500) GAMEPLAY MONTAGE: real captured game footage in dynamic masked panels (diagonal slices, iso-diamond masks, split screens), cut on beats; callouts with animated leader lines: "SNEAK", "SWAP", "MEOW" (shockwave rings), "HOLD THE DOOR". Punch-in zooms, frame-shake.
- Bar 5 (7.500-9.375) STAKES & SCORE: catnip coins burst and fly into a rolling counter, "8 HEISTS" big number slam, 3 stars pop in with elastic, guard "!" spotted alert flash.
- Bar 6 (9.375-11.250) BREEDS: rapid-fire grid mosaic of many cat breed sprites (animated frames) — zoom-out reveal "58 CATS TO COLLECT" (or recruit), cascade stagger.
- Bar 7 (11.250-13.125) THE RESCUE / BUILD-UP: crate rattles, riser, speed lines, crate bursts open, white flash, shelter cat freed, portal swirl.
- Bar 8 (13.125-15.000) LOGO SLAM: "CATNIP HEIST" title in the game font (catpaw.woff2) with voxel/extruded depth, pixel-dissolve assemble, shockwave, particle catnip, Token Tails logo, tagline "Sneak. Swap. Rescue." and "PLAY NOW", final hit exactly on the last downbeat, then hold 0.3s tail with subtle motion (not frozen).

WORK DIR: ${W} (create it). All paths below are relative to it.

FILE CONTRACTS (everyone must honor these exactly):
- assets/clips/<clipName>/0001.jpg... : captured gameplay frames, 1920x1080 (or 1280x720) JPG quality ~90, 30 fps. assets/clips/clips.json = [{ "name", "dir": "assets/clips/<name>", "frames": N, "fps": 30, "width", "height", "level", "description": "what happens, with frame numbers of key moments (swap, meow, door, coin pickup, crate rescue, spotted...)" }].
- assets/sprites/... PNGs + assets/sprites/sprites.json describing each: { "cats": [{ "id", "sheet": "assets/sprites/cats/<id>.png", "frame": 48, "cols", "rows": [{"name","frames","row"}] }], "dogs": [...same...], "images": {"catnip": path, "coin":..., "logo":..., "paw":..., "heart":...}, "font": "assets/sprites/catpaw.woff2", "palette": { named hex colors extracted from the game UI CSS/renderer } }.
- assets/audio/track.wav : 48kHz stereo, exactly 15.000 s. assets/audio/cues.json: list of { "t", "type" } for kicks, snares, impacts, risers, whooshes (so visuals can sync).
- engine: index.html + engine.js. A single <canvas id="c" width=1920 height=1080>. engine.js loads all assets (clips frames preloaded as ImageBitmaps, sprites, font via FontFace), exposes helper library (easings: expoOut/expoIn/expoInOut/backOut/elasticOut/cubic..., lerp, clamp, remap, seeded random rand(seed), beat(t) helpers, drawSprite(ctx, sheetInfo, rowName, frameIndex, x, y, scale), drawClip(ctx, clipName, clipTime, dx,dy,dw,dh), text helpers with tracking, glitch(ctx,...), chromatic aberration, screen shake, motion-blur via sub-frame accumulation option, particles (deterministic, pure function of t — NO state that depends on previous frames), masks). Scenes live in scenes/s1.js ... scenes/s4.js as ES modules: each exports default { start, end, draw(ctx, t, lt, E) } where t = global time, lt = t - start, E = the engine helper object. engine renders scene(s) whose [start,end) contains t (allow overlap for transitions; draw order by file order). window.__ready (Promise) resolves when all assets are loaded; window.__render(t) draws frame at time t synchronously (deterministic: same t → same pixels). Preview mode: opening index.html?play=1 plays in realtime with the audio.
  Scene ownership: s1.js = bars 1-2 (0.000-3.750), s2.js = bars 3-4 (3.750-7.500), s3.js = bars 5-6 (7.500-11.250), s4.js = bars 7-8 (11.250-15.000). Scenes may bleed up to 0.25s past their boundaries for transitions.
- render.mjs: node script using Playwright chromium (import from ${GAME}/node_modules/playwright or @playwright/test) that serves ${W} over a tiny local http server, waits window.__ready, for frame i in 0..899 calls __render(i/60) and grabs the canvas (canvas.toDataURL('image/png') or screenshot of the canvas element), writes out/frames/%04d.png, then ffmpeg (/opt/homebrew/bin/ffmpeg) → out/showreel.mp4 (H.264, yuv420p, crf 16, preset slow, 60fps) muxing assets/audio/track.wav (aac 320k), -shortest not used (video is exactly 15s). Also supports --from/--to seconds and --step N for quick previews, and --contact to produce out/contact.png (a contact sheet grid of every 0.25s frame, labeled with timecodes) via ffmpeg tile.
Everything must be deterministic, offline, and run on macOS with node 22.
`

phase('Assets')
const [clips, sprites, audio, engine] = await parallel([
  () => agent(`${BRIEF}
YOUR JOB: capture REAL gameplay footage from the Catnip Heist game into assets/clips per the contract. The game is a Vite + three.js app in ${GAME}; README documents URL params (?level=heist-0N&replay=solution, ?qa=1, ?shadows=0, ?speed) and window.__heist QA hooks (loadReplay, freeze(on), step(n), screen(), getState, renderGameToText). Solutions are in ${GAME}/src/levels/heist-0N.solution.json. Use ./node_modules/.bin/vite (or 'npm run build' then preview, dist/ may already exist) and Playwright chromium at 1920x1080 (headed-or-headless with GPU flags like --use-angle=metal or --enable-gpu if SwiftShader is too slow; keep shadows if fast enough). For determinism and smoothness, freeze the realtime clock and advance with __heist.step(1) per captured frame (30fps), screenshotting each tick. If interpolation needs sub-ticks, 30fps is fine.
Capture at least 6 distinct clips, 60-150 frames each, choosing the most visually interesting moments across levels (different levels = visual variety): a cat sneaking past a vision cone, a SWAP between cats, a MEOW luring a guard, a pressure-plate door opening, coin pickups, key/vault opening, freeing the shelter cat from the crate, exiting through the portal, a wide establishing shot of heist-08 HQ. Use renderGameToText / getState events per tick to locate exact ticks of events (swap/meow/door/crate) and record frame numbers of key moments in clips.json descriptions. Hide DOM HUD overlays if they clutter (or capture both a clean and HUD version for one clip) — prefer clean canvas frames. Also capture 1-2 stills of title screen and Cat Yard (assets/clips/stills/*.jpg). Verify by viewing a few frames with the Read tool. Do NOT modify game source files. Return a summary of clips with key-moment frame numbers.`, { label: 'capture-gameplay', phase: 'Assets' }),

  () => agent(`${BRIEF}
YOUR JOB: build the sprite/brand kit in assets/sprites per the contract. Source: ${GAME}/public/assets (manifest.json describes cat sheets: frame 48px, cols, rows with names like IDLE, RUNNING, JUMPING, SITTING, SLEEP, LOAF, HIT, GROOMING, DIGGING with frame counts — rows are in manifest order; verify by viewing a sheet with Read), dogs/, images/ (catnip, coin, logo, paw, heart), fonts/catpaw.woff2, icons. Copy (don't modify originals) into assets/sprites. Derive the brand palette from the game UI CSS/renderer code (${GAME}/src/ui, src/render, index.html) and record it in sprites.json palette (bg dark, accent catnip green, gold coin, alert red, UI text, etc.). Also verify the dog sheet layout (rows/cols/frame size) by inspecting the images (use sharp from ${GAME}/node_modules to read dimensions / crop test frames and view with Read). Additionally produce assets/sprites/preview.png — a contact sheet showing e.g. IDLE frame 0 of every cat and the dogs, to prove the metadata is correct. Also pick 2 "hero" cats that look great together and note them in sprites.json as "heroes": [id,id], and the shelter-cat breeds used in levels (from ${GAME}/src/levels/*.json crate field) as "shelter". Return a concise summary.`, { label: 'sprite-kit', phase: 'Assets' }),

  () => agent(`${BRIEF}
YOUR JOB: compose and render the soundtrack assets/audio/track.wav (exactly 15.000s, 48kHz stereo 16-bit) + assets/audio/cues.json. Style: punchy stealth-heist trailer meets chiptune — tight 128 BPM, sub kick + clap/snare, hi-hat 16ths, dark pulsing bass (minor key, e.g. D minor), plucky pixel arpeggio lead, tension riser + whooshes into transitions, impacts (booms) on key downbeats: t=0 (security boot sting, quiet), 1.875 (drop in kick), 3.75 (full beat drop for montage), 7.5 (stakes, big hit), 9.375 (breeds, bright arp), 11.25 (breakdown: filtered, riser building 11.25→13.125, snare roll accelerating), 13.125 (MASSIVE impact + logo slam), last hit around 14.53 and tail ringing out to 15.0 with reverb, no hard cut click (fade last 20ms). Follow the storyboard's energy curve.
Implement as a deterministic node script assets/audio/compose.mjs doing pure-JS synthesis (oscillators, noise, envelopes, simple filters, a feedback-delay/reverb, soft-clip master, -1 dBFS peak limiter, normalize to ~-10 LUFS-ish loudness) writing WAV directly — no network, no deps. Keep a meow-like synthesized FX (pitch-bent formant blip) at the MEOW callout time around 5.625 and a coin 'bling' arpeggio around 7.5-8.4. cues.json must list every kick, snare, impact, riser start/end, whoosh with exact times. Verify with ffmpeg: duration (ffprobe), ebur128/volumedetect loudness, and render a waveform/spectrogram PNG (ffmpeg showwavespic/showspectrumpic) to assets/audio/wave.png and inspect it with Read to verify structure matches the storyboard. Make it sound good: avoid harsh aliasing (use polyBLEP or band-limited oscillators), avoid clipping. Return summary.`, { label: 'soundtrack', phase: 'Assets' }),

  () => agent(`${BRIEF}
YOUR JOB: build the engine: index.html, engine.js, render.mjs (and a tiny static server inside render.mjs), per the contract. The assets are being produced concurrently by other agents — code against the contract (clips.json, sprites.json, cues.json) and degrade gracefully if a file is missing (placeholder). Build a rich, well-documented helper library E for scene authors: easings (full Penner set + custom spring(t, freq, damp)), timeline helpers (seg(lt, a, b) → 0..1 clamped progress, beatAt(i), onBeat pulses decaying env(t, hitTime, decay)), deterministic noise (value/perlin 1D+2D), rand(seed), color utils (hex→rgba, mix), text (drawText with letterSpacing, per-character callback for kinetic type, measure), glitch slices, RGB split (chromatic aberration via offscreen canvas composite), scanlines/CRT overlay, film grain (seeded by frame), vignette, light leak gradient, motion smear helper (draw N sub-samples of a draw function at t-δ with decreasing alpha), camera (translate/scale/rotate/shake applied around draw callbacks), masks (clip to polygon/diamond/rounded rect with animated reveal), particles(seed, count, t, fn) purely functional, drawSprite / drawClip (clip frame index = floor(clipTime*fps) clamped), iso diamond grid drawer, shockwave ring, speed lines, star shape, cover-fit helpers, offscreen canvas pool.
Engine renders global post FX after scenes (subtle grain, vignette) with a hook for scenes to request flash/shake/aberration at time t (pure function of t, e.g. scenes export optional fx(t) returning {shake, aberration, flash}).
Write placeholder scenes/s1.js..s4.js that draw the section name + time so the pipeline works end-to-end. Test render.mjs end-to-end with --step 30 (every 0.5s) and --contact; verify determinism (render same t twice, compare hashes). Verify speed: full 900 frames should render in a few minutes. Document the API in ENGINE.md (concise but complete, with a small example scene) — scene authors will rely on it. Return summary incl. exact commands.`, { label: 'engine', phase: 'Assets' }),
])

log('Assets done; commissioning scenes')
phase('Scenes')
const ctx = `
ASSET REPORTS FROM OTHER AGENTS:
--- CLIPS ---
${clips}
--- SPRITES ---
${sprites}
--- AUDIO ---
${audio}
--- ENGINE ---
${engine}
`
const SECTIONS = [
  { file: 'scenes/s1.js', bars: 'Bars 1-2 (0.000-3.750): COLD OPEN + THE CREW' },
  { file: 'scenes/s2.js', bars: 'Bars 3-4 (3.750-7.500): GAMEPLAY MONTAGE' },
  { file: 'scenes/s3.js', bars: 'Bars 5-6 (7.500-11.250): STAKES & SCORE + BREEDS' },
  { file: 'scenes/s4.js', bars: 'Bars 7-8 (11.250-15.000): THE RESCUE + LOGO SLAM' },
]
const sceneResults = await parallel(SECTIONS.map(s => () => agent(`${BRIEF}
${ctx}
YOU ARE a world-class motion designer. You own ONLY ${W}/${s.file} — ${s.bars}. Other designers are writing the other scene files concurrently; do not edit engine.js or other scenes (if you need a helper, implement it locally in your file). Read ENGINE.md, assets/clips/clips.json, assets/sprites/sprites.json, assets/audio/cues.json first and look at several clip frames and sprite sheets with Read so you know what you have.
Design and implement your section at the highest craft level: every beat in your window (see cues.json) should land a visual event; layered depth (bg / mid / fg), easing with anticipation & overshoot, no linear motion, no static holds > 0.25s, typography that feels designed (tracking, weight, scale contrast), consistent brand palette from sprites.json, transitions that hand off cleanly at your boundaries (bleed ≤0.25s; make the first 0.1s and last 0.1s of your window compatible with a hard cut or a whip/flash handoff — use a white-flash or whip-pan at the boundary beat).
Iterate visually: render your window with  node render.mjs --from <start> --to <end> --step 6  (see ENGINE.md for exact flags), view frames with Read, and refine at least 3 times. Check against: readability of text (each word on screen ≥ ~0.3s), sprites pixel-crisp, nothing looks like a placeholder, nothing clips off-frame unintentionally. Keep render time reasonable (< ~250ms/frame).
Return: a timeline of what happens at each beat in your section and any issues.`, { label: `scene:${s.file}`, phase: 'Scenes' })))

phase('Render')
let renderReport = await agent(`${BRIEF}
Scene reports:
${sceneResults.filter(Boolean).join('\n\n')}
YOUR JOB: integrate and render. Run the full render (node render.mjs) → out/showreel.mp4 with audio, and out/contact.png. Fix any runtime errors, missing assets, or seams between scenes (look at frames around 3.75, 7.5, 11.25 at 1/60 steps: boundary handoffs must be clean, no blank frames, no double-drawn overlaps unless intended). Verify with ffprobe: 1920x1080, 60fps, 900 frames, 15.000s, audio present. Extract frames at every beat (32 PNGs) to out/beats/ and view a good sample with Read. Return: status, path, list of any visual problems you saw but did not fix.`, { label: 'integrate-render', phase: 'Render' })

phase('Critique')
for (let round = 1; round <= 2; round++) {
  const critiques = await parallel([
    ['motion', 'MOTION & TIMING: easing quality, rhythm and beat sync (compare frame content to assets/audio/cues.json), pacing, dead frames, transitions, energy curve, camera work. Extract short frame strips at 60fps around each beat (e.g. ffmpeg -ss X -frames 12) to judge motion, not just stills.'],
    ['design', 'VISUAL DESIGN & STORY: composition, typography, hierarchy, palette cohesion, legibility of each word at its screen time, whether the game (Catnip Heist) is clearly sold: cats, guard dogs, catnip, swap, rescue, logo. Does it look like a top showreel or like a template? Flag anything that looks cheap/placeholder/buggy (clipping, aliasing, blank areas, misaligned sprites, wrong sprite frames).'],
  ].map(([key, lens]) => () => agent(`${BRIEF}
Current render: ${W}/out/showreel.mp4 (contact sheet ${W}/out/contact.png, beat frames ${W}/out/beats/). Integration report: ${renderReport}
YOU ARE a ruthless award-jury critic (lens: ${lens}). Extract frames with ffmpeg as needed and view them with Read. Do NOT edit files. Return the top 8 concrete, actionable issues ranked by impact, each with: timecode range, scene file, what's wrong, exact fix suggestion. Also 3 things to keep.`, { label: `critic:${key}:r${round}`, phase: 'Critique' })))
  renderReport = await agent(`${BRIEF}
CRITIQUES (round ${round}):
${critiques.filter(Boolean).join('\n\n=====\n\n')}
YOUR JOB: you are the lead motion designer. Apply fixes for all high-impact critique items across scenes/*.js (and engine.js if needed; audio compose.mjs too if a sync issue is best fixed there — then re-run it). Verify each fix visually by rendering the affected ranges with --step and viewing frames. Then do the full final render (node render.mjs) with audio → out/showreel.mp4 + out/contact.png + out/beats/. Verify with ffprobe (1920x1080, 60fps, 900 frames, 15.0s, audio). Return: what you changed, what you declined and why, final verification output.`, { label: `fix:r${round}`, phase: 'Critique' })
}
return renderReport
```
