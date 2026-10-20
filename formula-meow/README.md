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

- Menus: a title over a live attract race, then a main menu with Grand Prix, Single race, Time Trial, Balloon
  Battle, Daily Cup, Track Doodle, Garage, Your cat, Awards, Stats, Pink Paw, Settings and Help.
  Keyboard, gamepad and touch all work. A plain first visit still starts the first race straight away.
- Modes: Grand Prix (2 cups of 4 races, points, standings, podium, trophies, a rival, resume a cup later);
  Single race (any track, any unlocked class); Time Trial (personal-best and dev ghosts, splits, medals); Balloon
  Battle on the Living Room Rug arena.
- Tracks: Kitchen Counter, Neon Rooftops, Laundry Spin, Yarn Canyon, Cat Café Chaos and Pink Paw Shelter Sprint.
  Each has an alternative route, hazards, fish coins and ramps.
- Classes: Kitten 50cc, Alley Cat 100cc, Zoomies 150cc and Mirror. The progression lane's rules unlock them.
- Progression: fish (in-game only, no money), a Garage with 6 bodies, paints, hats and trails, 24 achievements,
  three daily challenges and stats. Pink Paw cats become playable as you win trophies.
- Driving: hop, hold to drift with three charge tiers, Pounce Start, ramp tricks, and a different feel for each body.
- Items: hairball, yarn, cucumber, catnip, box, bell, zoomies and laser dot; the AI uses items too, and a capped
  rubber band keeps the pack close.
- Presentation: cel-shaded karts with hats, trails and animations, a flyover before the race, the respawn hand,
  particles, bloom on fast devices, 8 synth songs and a cat announcer.
- Accessibility: reduced motion, colour-blind colours, high contrast, text size and captions.
- Track Doodle (UGC editor): draw a loop, add stickers (hazards and shortcuts included), race it, share it in a link.
- Sharing: dare a friend (your ghost rides in the link), a 12 s vertical finish clip, the Daily Cup, racing as your
  own cat from a photo (the photo stays on the device), and a Pink Paw link on the results.

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

- No server: best times, fish, Daily streaks, saved tracks and your cat live on the device; dares and tracks travel
  in links.
- `SIM_VERSION` 7 (playtest round 2: top speeds 24 / 28 / 32 m/s, a pull toward the pack keeps the field together,
  a hit cap on the player, 2 s item box respawn, coin trails on the racing line, an AI wall guard): dares,
  time-trial ghosts and records from earlier versions show their time, but their ghost cannot race.
- Headless (SwiftShader) runs drop the render scale, so CI screenshots look softer than a real phone.
- The minimap draws the main loop only, not the alternative routes.
