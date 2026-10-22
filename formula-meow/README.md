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
npm run review:v2      # optional: every mode and screen at 1440x900 and 390x844, from a v1 save, screenshots in
                       # review/v2/*.png (~45 min, own build dir and port, gitignored)
npm run review:v3      # optional: every set piece on all 6 tracks frozen mid-piece at 1440x900 and 390x844, old
                       # dares and track codes, editor stickers in a fresh page; screenshots in
                       # review/v3/<size>-<track>-<piece>.png (~5 min, port 6131 or MEOW_REVIEW_PORT, gitignored)
npm run review:v4      # optional: the iteration 4 playtest fixes and features at 1440x900, 390x844 and 844x390;
                       # screenshots in review/v4/<size>-<feature>.png (port MEOW_REVIEW_PORT, gitignored)
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
- Set pieces (`docs/plans/formula-meow/SETPIECES.md`): loop-the-loops, wall rides, jump gaps and tunnels on every
  track (Yarn has no loop), plus a kicker on the Rug arena. They are spectacle with assist: a loop or a wall lane holds
  the kart to its surface and keeps its speed, a jump gap has hang time, a landing magnet, a clean-landing boost and a
  catch net, and a tunnel has a boost pad, light streaks and a muffled echo. No new controls. Track Doodle has Loop,
  Wall ride, Jump and Tunnel stickers that travel in the share link.
- Classes: Kitten 50cc, Alley Cat 100cc, Zoomies 150cc and Mirror. The progression lane's rules unlock them.
- Progression: fish (in-game only, no money), a Garage with 6 bodies, paints, hats and trails, 24 achievements,
  three daily challenges and stats. Pink Paw cats become playable as you win trophies.
- Driving: hop, hold to drift with three charge tiers, Pounce Start, ramp tricks, and a different feel for each body.
- Items: hairball, yarn, cucumber, catnip, box, bell, zoomies and laser dot; the AI uses items too, and a capped
  rubber band keeps the pack close.
- Presentation: cel-shaded karts with hats, trails and animations, a flyover before the race, the respawn hand,
  particles, bloom on fast devices, 8 synth songs and a cat announcer.
- Iteration 4 ("more fun", `docs/plans/formula-meow/ITERATION-4.md`): a pole you can defend, Smart Steer on touch,
  TAP! paw rings on every ramp lip (laid on the run-up) and a wider trick window, overtake punch and photo finishes
  with the real margin, slipstream ribbons, DODGED!, final-lap gap chips, boost chains and ON FIRE, a one-card phone
  results screen, clips that pick the best stunt, 1v1 ghost duels from dare links and Time Trial, doodles that start
  with stunts and carry the sender's lap (with its class), Wild Card mutators and a Daily mutator, a Style score with
  stunt challenges, one-tap menu tiles, a gentler Grand Prix climb, and a readable Balloon Battle (furniture fades,
  a leader arrow, double points in the last 30 s). Kitten 50cc gives a player who never drifts room to learn: the cats
  just ahead of the player ease off more.
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
- `SIM_VERSION` 11 (iteration 4: the rubber band ramps in over 6 s after GO, a wider trick window with a tap buffered
  just before the lip, battle double points in the last 30 s): dares, time-trial ghosts and records from earlier versions
  open as a target-time race with a notice, but their ghost cannot race (the card and HUD show no target time for
  them yet). Track codes from before the set pieces (v1, v2) still open, with no set pieces. The final pass changed
  50cc races with a human (the cats ahead of the player ease off more) without a bump: no SIM_VERSION 11 link had left
  a dev build; AI-only races and the golden hashes are unchanged.
- 150cc packs finish very close (all 8 within 1.7 s on Kitchen in the playtest): it can read as chance. A softer
  150cc band after the opening laps is a sim change for a later iteration.
- Not yet done from the iteration 4 playtest: translucent battle balloons when the camera sits low against the sofa,
  item boxes that turn into boosts in a 1v1 duel (a sim change), a loop from auto-stunts on every hand-drawn doodle,
  "Name it" on the first share of an untitled doodle.
- Headless (SwiftShader) runs drop the render scale, so CI screenshots look softer than a real phone.
- The minimap draws the main loop only, not the alternative routes.
- Single race keeps its own class pick (50cc by default); it does not start from the class a v1 save last used.
- Under the headless software renderer, a fresh dare link showed a blank sky-coloured frame ~2.5 s in, before the
  flyover; by 3 s the track draws. Not yet checked on a real phone.
