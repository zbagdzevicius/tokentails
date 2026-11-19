# Trailer 30 ("The Rivalry", dev only)

A 30 s trailer for Paw Legends: Classic 5v5 gameplay (72 % of the runtime) cut on a 150 BPM grid with short story
beats (Gemini key art, comic panels) and motion graphics. Nothing here is part of `build` or `build:client`; outputs
go to a scratch folder, never the repo.

| Time | Shot |
|---|---|
| 0.00-1.20 | Hook: Lambo's ultimate in a pile of dogs, an ink impact frame on 0.80, 0.3x after it |
| 1.20-2.00 | The frame tears along the bolt (both halves fly off with their torn edge) into Lambo vs Sir Brutus: CATS, DOGS |
| 2.00-3.20 | Wide establishing shot of the cat base and lanes (seed 36): TOPPLE THEIR TOWERS. |
| 3.20-9.60 | Eight ultimates, cat / dog alternating: a name call, a halftone freeze and a champion card (comic panel, name, ultimate) on each |
| 9.60-10.80 | War room panels slide in along the bolt: PICK A SIDE. |
| 10.80-12.40 | The low point: the cat tower (id 115, seed 36) cracks and topples, 0.55x through the fall |
| 12.40-13.20 | Clem's eyes, a bolt in each: NOT OUT. |
| 13.20-20.00 | The comeback (seed 36): river fight, Lambo's landing, Brutus's ring, Clem, the triple, quick cuts, the push: TAKE THEIR CORE. |
| 20.00-20.80 | The last gameplay frame flashes into painted key art of Clem |
| 20.80-22.40 | The dog core bursts on the downbeat (0.35x) under VICTORY!, then a cut to the cats on the rubble (VICTORY! drops to the lower third) |
| 22.40-26.40 | Glory: the champions' comic panels on two conveyors meeting at the bolt (TEAM CAT, TEAM DOG), entering in one whip |
| 26.40-30.00 | A full-height bolt, the v6 logo lands on it, CATS VS DOGS. PICK A SIDE., 5V5 AND 3V3 TEAM BATTLES, PLAY FREE IN YOUR BROWSER · pawlegends.app |

Round 2 (critic fixes): takes are drawn clean (no overhead bars, numbers or banners: `plates: false` in the clip
harness, since the bars are WebGL now and CSS cannot hide them) and closer, at the game's angle with no roll; 9:16 takes
are shot closer without the clip engine's autoFit (it widened them 1.45x); overlays (champion cards, mission lines,
VICTORY!) are transparent mg frames composited over the moving gameplay; the display type is the brand book's Rubik
Italic 900 and Fredoka (`--fonts`), and setup refuses a face that falls back on any glyph of the copy (round 1 set the
last S of CATS / DOGS in a fallback face).

Round 3 (critic fixes): one comic language for every card (the champions' loading comic panels, as in the Gemini
frames, instead of the painted splash art); type slams in clean (1.45x to 1x at full opacity, no undershoot, which
read as a font fallback) and the mission plate is wiped by its own text; montage takes 20 % wider and the 9:16 takes
centred on the caster; a hue-selective gameplay grade (greens and the floor, not the lane browns); the payoff cut to
1.6 s; a sound on frame 0 and a heartbeat pulse under the low point; a full-height bolt opens the end card; larger
end-card type.

| File | Role |
|---|---|
| `scan-ults.mjs` | Ranks ultimate casts (enemy heroes hit within 2 s, takedowns, heroes near) plus tower falls and comebacks over a seed range, headless. |
| `specs.mjs` | The gameplay takes as clip-engine specs (`tools/clips/record.mjs`), 16:9 and 9:16: the game's play angle (pitch 52, FOV 36, yaw 0) brought closer and centred on the fight round each cast, structures solid, slow motion baked in. |
| `gemini.mjs` | The story frames (gemini-3-pro-image-preview, `GEMINI_API_KEY`), real champion art as references, no text in any image. |
| `timeline.mjs` | The edit as data (segments, hits, VO, silence holes, copy); `timeline.test.mjs` checks length, grid and the gameplay share. |
| `score.mjs` | The original 150 BPM score with our instruments, the game's sounds and announcer, the v6 sting; -14 LUFS, true peak under -1 dBTP. |
| `mg.html`, `mg.js` | Motion graphics on a canvas: ink impact, halftone freezes, the bolt tear, panels, kinetic type, glory composite, end card. |
| `edit.mjs` | Cuts the takes and the MG segments, grades, mixes, writes the 16:9, 9:16 and 1:1 masters, posters, a web copy and `report.json`. |

```sh
node tools/trailer30/scan-ults.mjs --mode classic --teams lambo,clem,sage,bengas,gabe/brutus,cacklejaw,marshmallow,howler,nugget --seeds 1-40 --out ults.json
node tools/trailer30/specs.mjs > specs.json
node tools/clips/record.mjs specs.json --out-dir <dir>/takes          # one browser, 60 fps, ~45 min for all 44
node tools/trailer30/gemini.mjs jobs.json <dir>/gem                   # jobs: id, prompt, refs, aspect, size
node tools/trailer30/score.mjs --out <dir>/audio --sting <kit>/audio/pawlegends-sting-lightning-rivalry.wav
node tools/trailer30/edit.mjs --takes <dir>/takes --gem <dir>/gem --audio <dir>/audio --fonts <dir>/fonts --out <dir>/out   # fonts: rubik-italic-900.woff2, fredoka-600-700.woff2 (Google Fonts)
```

`tools/clips/` is the social clip engine (forked from `tools/trailer/harness.ts`), now in the repo; its harness loads
the one Fredoka face the game ships. Its `camera: 'game'` mode still models the pre-feel-pass camera, which is why
the takes use a director camera set to the current play angle (`src/render/camera/frame.ts`).
