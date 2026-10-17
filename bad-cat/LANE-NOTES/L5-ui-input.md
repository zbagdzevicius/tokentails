# L5 UI + input: notes for LEAD

- `StickState` is not in `types.ts`; it lives in `src/ui/input/quantise.ts` and is re-exported from `src/ui/index.ts`. Nothing else needs it.
- The suspicion eye should sit above the human (GDD 5.1), but `Renderer` has no screen-space projection. Request: an optional `Renderer.project?(x: number, z: number, level: number): { x: number; y: number } | null`. Until then, the eye is pinned to the HUD's top-left corner.
- `GameServices` has no `progress` entry, so the UI cannot call `recordRankedDay` (streak). M1a would need `progress?: { recordRankedDay(store, dayNo): Streak }` added to `GameServices`.
- The FTUE flag is stored as `bcd:v1:ftueDone` through `platform.store`. The session count is `profile.sessions`, which the UI increments once per boot.
- The QA hook installs when `env.qa` is set (`VITE_BADCAT_QA=1`, read by L8). `play(inputs)` behaves as follows:
  - on `briefing`, it starts the run;
  - on `run`, it feeds the scripted inputs into the live loop in turbo mode;
  - on any other screen, it falls back to `sim.runToEnd` on the current room (or today's).
- `?clip=1` handoff links open the room's briefing (practice). M0 does not re-render the clip from `rp`, because the ghost codec is M1a.
