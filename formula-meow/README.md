# Formula Meow

An 8-cat kart race for Token Tails: three.js + Vite + TypeScript, portrait phone first, also desktop keyboard and
gamepad. Procedural low-poly visuals and WebAudio synth only (no downloaded assets). The rival cats are real Pink Paw
shelter cats (a dated snapshot); the game moves no money.

- Design: `docs/plans/formula-meow/GDD.md`. Lane ownership and extension points: `LANES.md`.
- Live route: `tokentails.com/meow-race` (rewrites in `client/next.config.js` → `client/public/formula-meow-game`).

## Run and check

```
npm install
npm run dev            # http://127.0.0.1:5175
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e            # Playwright, builds into .e2e-dist and serves on :4395 (~4 min)
npm run review         # optional: full races at 1440x900 and 390x844, screenshots in review/*.png (~7 min)
npm run build:client   # → ../client/public/formula-meow-game, commit that folder
```

Code reused from `bad-cat/` (cat rig, materials, outline, face decal, cat maker, codec, clip recorder, synth audio,
OG pages) is copied into this package, never imported across packages.

## What is in it

- Tracks: Kitchen Counter (daylight) and Neon Rooftops (night), 3 laps.
- Classes: Kitten 50cc, Alley Cat 100cc, Zoomies 150cc (finish a Kitten race to unlock Alley Cat, a top-3 Alley Cat finish unlocks Zoomies).
- Drift and boost: hop, hold to drift, three charge tiers; Pounce Start on the countdown; ramps and tricks.
- Items: hairball, yarn, cucumber, catnip, box, bell, zoomies, laser dot; item AI and a rubber band for the pack.
- Track Doodle (UGC editor): draw a loop, shape it, add stickers, name it, race it; the track travels in the link.
- Viral loop: Dare a friend (your ghost rides in the link hash), 12 s vertical finish clip, Daily Cup with a
  Wordle-style share line, your own cat from a photo (stays on the device), Pink Paw link on the results.

## URLs

| Local dev | Production | What |
|---|---|---|
| `/` | `/meow-race` | a race (opens straight on the grid) |
| `/?track=rooftops&cls=0..2&seed=N` | | pick track, class, seed |
| `/?make` | `/meow-race/make` | Track Doodle editor |
| `/?t=CODE` | `/meow-race/t?t=CODE` | race a shared track |
| `/#g=GHOST` | `/meow-race/r#g=GHOST` | a dare against a ghost |
| `/?daily=1` | `/meow-race/d/N` | Daily Cup (day 1 = 2026-10-19 UTC) |
| `?bot=1`, `?speed=1..8`, `?perf=1` | | QA: scripted driver, faster sim, perf overlay |

## Controls

Touch: drag on the left half to steer, hold the right half to drift (press = hop), item button or swipe up/down;
gas is automatic. Keys: ←→/AD steer, ↑/W gas, ↓/S brake, Space hop/drift, Shift/E item, Q look back, R restart,
Esc pause. Gamepad: standard mapping (left stick, RT/A, LT/B, RB drift, X/LB item).

## Known gaps

- Only two authored tracks.
- No server: best times, Daily streaks, saved tracks and your cat live on the device; dares and tracks travel in links.
- Headless (SwiftShader) runs drop the render scale, so CI screenshots look softer than a real phone.
