# Formula Meow

An 8-cat kart race for Token Tails, three.js + Vite, portrait phone first. Design: `docs/plans/formula-meow/GDD.md`.
Lane ownership and extension points: `LANES.md`.

```
npm install
npm run dev          # http://127.0.0.1:5175  (?track=rooftops&cls=0..2&seed=N, ?bot=1 for a scripted driver)
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e
npm run build:client # → client/public/formula-meow-game (served at /meow-race once the client rewrites land)
```

Controls. Touch: drag on the left half to steer, hold the right half to drift (press = hop), item button or swipe
up/down; gas is automatic. Keys: ←→/AD steer, ↑/W gas, ↓/S brake, Space hop/drift, Shift/E item, Q look back,
R restart, Esc pause. Gamepad: standard mapping (left stick, RT/A, LT/B, RB drift, X/LB item).

The rival cats are real Pink Paw shelter cats (snapshot with its status date). The game moves no money.
