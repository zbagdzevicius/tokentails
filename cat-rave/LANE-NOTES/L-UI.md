# L-UI lane notes (asks for the spec owner and other lanes)

- types.ts: no change needed. L-UI extends `Director` locally (`RaveDirector` in src/ui/director.ts:
  `onDrop`, `onTap`, `focused`, `manual`, `dispose`) and `createDirector` takes an optional 5th arg
  `{ auto, reducedMotion }`. `createHud(root, handlers)` now takes handlers (2nd arg).
- L-AUDIO: SPEC says a tap plays "a hat hit in the music"; `BeatClock` has no call for that. Ask: an
  optional `accent?(kind: 'hat' | 'clap')` on BeatClock; main.ts would call it on tap.
- L-DJ: main.ts calls `dj.raiseSword()` + `dj.confetti()` on every `clock.on('drop')` (SPEC wiring
  step 2). If the DJ also subscribes itself, make `raiseSword` idempotent within a drop.
  The DJ speech bubble already says "no sleep, just grind", so the HUD drop stamp uses other words.
- L-CROWD: `highlight(index)` takes one cat. "A tx that made several cats highlights all of them"
  (SPEC Interactions) needs `highlight(indices: number[] | null)`; today the HUD flies to the first
  and the card says "one of 5 cats from this payout".
- L-DATA: the spec lists `sendTreat(api)` / `treatStatus(api)` in data; UI uses its own
  `src/ui/treat.ts` (`treatLive`, `sendTreat`, `treatAllowedHere`) so it does not depend on names.
- package.json (spec owner): add `"og": "node scripts/og.mjs"`. scripts/og.mjs renders
  public/og.jpg from `?og=1` (title only, no live number). Re-run after the lanes are final.
- Client (outside this package): `/cat-rave` redirect in client/next.config.js.
