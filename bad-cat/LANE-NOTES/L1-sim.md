# L1 Sim notes

- `SimState` extension: the sim adds one integer field, `btnBuf` (buttons pressed while the cat was mid-step or in a
  SWAT/GRAB lock; they fire on the first free tick so a tap is never lost). Local type `SimStateL1` in
  `src/sim/events.ts`; it survives `structuredClone` and is part of `hashState`. Request: add `btnBuf: number` to
  `SimState` in `types.ts` at the next LEAD pass (no other lane needs to read it).
- Tick order: combo window → last call → humans → falling props → cat → suspicion → caught → tick++ → end.
  A swat at tick t starts a fall that lands at t + fallTicks.
- `end` event tick = last processed tick (ticks - 1 normally; caughtTick + CUDDLE_TICKS when caught).
- First turn: FTUE exactly tick 240 (longest telegraph, shortest look, no fake-outs); ranked/practice 240..300.
  The room event pre-empts any human state so it always starts on its tick (FTUE 450).
- Landed/broken/spilled props leave `propAt` (never block). A dropped grabbable goes back into `propAt`.
- SWAT on a grabbable grabs it (mobile SWAT button doubles as GRAB); while carrying, SWAT or GRAB drops it, or
  stashes it when within 1 cell (Chebyshev) of `shell.catBed`.
- Only props on the cat's own level can be swatted (a cat on the floor cannot swat a glass on the counter).
