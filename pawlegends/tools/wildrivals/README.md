# Trailer "Wild Rivals" (dev only)

A hushed nature documentary follows two rival species through four seasons; every "natural behaviour" it observes is
a real skill: the hibernating loaf (Meatball's Loaf Mode), the possum playing dead (Bravo's Dramatic Flop), the
handbag hide (Chili's Purse Mode), the call at the lanterns (Howler's AWOO, Barkula's RED MOON). In first snow the
herds collide in a Classic 5v5 on Hearthwood. 30 s and 60 s cuts, each in 16:9, 9:16 and 1:1, a web copy and posters.
Nothing here is part of `build` or `build:client`; outputs go to a scratch folder, never the repo.

| File | Role |
|---|---|
| `takes.mjs` | The takes: map, scheme (season), teams, coats and the `gag` script rules that make each behaviour happen. |
| `search.mjs` | Plays a take headless over a seed range and lists the casts and clip events asked for, with who is near and who was hit. |
| `specs.mjs` | The shots as clip-engine specs, one per aspect, rendered natively (`h`, `v`, `s`) in the game look at the game's camera angle. |
| `gemini.mjs` | Story frames A-E (sketchbook, migration painting, end poster, seasons wheel, the observer box) per aspect, brand renders as references, no text. |
| `timeline.mjs` | Both cuts as data: segments, take in-points, field cards, the six words, flashes, the matte. |
| `score.mjs` | The original 96 / 192 BPM score (cello, kalimba, birds, pizzicato, drum line) mixed with the takes' game SFX, -14 LUFS, true peak <= -1 dBTP. |
| `mg.js` | Motion graphics on a canvas: stills and moves, the sketchbook reveal, the seasons wheel, snow, the plum matte, field cards, type, end card. |
| `edit.mjs` | One ffmpeg pass per cut and aspect: native takes cut frame-exact, MG overlaid, master (CRF 12), web copy, poster. |

```sh
node tools/wildrivals/search.mjs --take '<json>' --seeds 1-24 --casts chili:2,nova:3 --out purse.json
node tools/wildrivals/specs.mjs > specs.json
node tools/clips/record.mjs specs.json --out-dir <dir>/takes --lock <capture.lock>   # 2x supersampled, lossless grabs
node tools/clips/quality-check.mjs <dir>/takes/*.mp4 --report <report.json>
node tools/wildrivals/gemini.mjs <kit>/renders <dir>/gem
node tools/wildrivals/score.mjs --cut 30 --takes <dir>/takes --out <dir>/audio --sting <kit>/audio/pawlegends-sting-lightning-rivalry.wav
node tools/wildrivals/edit.mjs --cut 30 --aspect h --takes <dir>/takes --gem <dir>/gem --fonts <dir>/fonts --logo <kit>/logos/pawlegends-logo-primary.png --audio <dir>/audio --out <dir>/out
```

Fonts: `fraunces-900.woff2` (Google Fonts, the title serif), `rubik-italic-900.woff2`, `fredoka-600-700.woff2`.

Notes:
- The `gag` rule (tools/clips/clip-script.ts) only issues a seat's ordinary commands: it holds one ability and casts it
  on a trigger (enemies in range, another hero's cast, the seat's own clip event, low HP). `pvp` takes script one seat
  per team, `coop` team 0's three seats. Every take's browser event hash matched the Node scan.
- Director shots without `gameLook` lose the map scheme's tree colours (ridge:harvest drew green trees); every take
  uses the game look.
- Harness `noMusic`: the takes carry the game's SFX only, so the trailer's own score does not fight the match music.
