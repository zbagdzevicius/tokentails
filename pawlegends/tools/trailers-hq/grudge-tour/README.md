# Trailer "Grudge Tour" (trailers-hq, dev only)

Meatball (cat) and Sir Brutus (dog) carry one grudge across every 3v3 map (Lanternfall Ridge, Twinbark Thicket,
Geode Quarry, the Crossing) until it ends in a Hearthwood teamfight, right before the animated end card.
30 s and 60 s cuts in 16:9, 9:16 and 1:1 (each rendered natively), a web copy and posters. Nothing here is part of
`build` or `build:client`; outputs go to a scratch work dir (`GT_DIR`), never the repo.

| File | Role |
|---|---|
| `specs.mjs` | The takes as clip-engine specs (map, scheme, heroes, seeds, game-camera accents) per aspect. |
| `capture-*.sh`, `fix.sh` | Capture runs through `tools/clips/record.mjs` (2x supersampled, lossless grabs, `--lock`). |
| `alive.mjs`, `pud.mjs`, `run-score.mjs` | Seed and moment checks: who is alive at a tick, the Pudding hop, bundling a script with vite. |
| `gen.py` | Gemini story frames (gemini-3-pro-image-preview, champion renders as references, no text). Reads `GEMINI_API_KEY` from the env and never prints it. |
| `plan.mjs` (`plan-r1/r2.mjs` earlier revisions), `dump-plan.mjs` | Both cuts as data, frame-exact on a 150 BPM grid. |
| `score.mjs` (`score-r1.mjs`) | The original score: cat marimba/pluck motif vs dog brass/tuba, built from `tools/trailer/dsp.mjs` + `instruments.mjs`. |
| `edit.py` (`edit-r1/r2.py`), `mix.py`, `final.sh`, `splice60.sh` | Frame-by-frame compositor piping RGB to ffmpeg (CRF 12 master, web copy, posters); mix to -14 LUFS, true peak <= -1 dBTP. |
| `qc.py`, `mont.py` | Flash/freeze scan and contact sheets. |

The Python tools resolve `../takes`, `../gem` and `../refs` next to themselves, so run them from a copy in
`$GT_DIR/tools/`: `uv run --with numpy --with pillow python -I edit.py <plan.json> <30|60> <h|v|s> <outdir>`.
