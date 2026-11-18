# Trailer 30 ("The Rivalry", dev only)

A 30 s trailer for Paw Legends: Classic 5v5 gameplay (72 % of the runtime) cut on a 150 BPM grid with short story
beats (Gemini key art, comic panels) and motion graphics. Nothing here is part of `build` or `build:client`; outputs
go to a scratch folder, never the repo.

| Time | Shot |
|---|---|
| 0.00-1.20 | Hook: Lambo's ultimate in a pile of dogs, an ink impact frame on 0.80, 0.3x after it |
| 1.20-1.60 | The frame tears along the bolt into Lambo vs Sir Brutus (CATS, DOGS) |
| 1.60-3.20 | Both teams meet at the cat tower (seed 36) |
| 3.20-9.60 | Eight ultimates, cat / dog alternating, a name call and a halftone freeze on each |
| 9.60-10.80 | War room panels slide in along the bolt: PICK A SIDE. |
| 10.80-12.00 | The low point: the cat tower falls (seed 36, 617.8 s), 0.2x on the crack |
| 12.00-12.80 | Clem's eyes, a bolt in each: NOT OUT. |
| 12.80-20.00 | The comeback (seed 36): the fight at the cat tower, Lambo's landing, Brutus's ring, Clem, the triple, quick cuts, the push to the doghouse |
| 20.00-21.20 | The last gameplay frame turns into painted key art of Clem |
| 21.20-25.20 | The dog core bursts on the downbeat, the game's Victory!, the cats celebrating |
| 25.20-27.20 | Glory: both rosters (the kit renders) across the bolt in a night stadium |
| 27.20-30.00 | The bolt strikes, the v6 logo, PLAY FREE · pawlegends.app |

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
node tools/trailer30/edit.mjs --takes <dir>/takes --gem <dir>/gem --audio <dir>/audio --out <dir>/out
```

`tools/clips/` is the social clip engine (forked from `tools/trailer/harness.ts`), now in the repo; its harness loads
the one Fredoka face the game ships. Its `camera: 'game'` mode still models the pre-feel-pass camera, which is why
the takes use a director camera set to the current play angle (`src/render/camera/frame.ts`).
