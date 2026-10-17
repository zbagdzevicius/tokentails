# L6 Share + clip: notes for LEAD and other lanes

No `types.ts` change needed. `exportClip` accepts one extra optional field, `faceCrop` (the opener photo's
`FaceDecal.crop`). The `ShareApi` type still matches.

## Contracts L6 relies on

- **L3 `renderFrames`**
  - Call `onFrame(canvas, i)` once per clip frame, i = 0..359, right after drawing that frame, in the same task.
    L6 copies the WebGL canvas synchronously at the start of the callback (no `preserveDrawingBuffer`).
  - Await the returned promise before drawing the next frame. It provides backpressure, and in the MediaRecorder
    fallback it paces frames in real time.
  - If `onFrame` rejects, stop, restore the size and DPR tier (in a `finally`) and re-throw. L6 rejects on
    `webglcontextlost`, which it listens for on `renderer.canvas` itself; L6 does not use `onContextLost`, so L5's
    handler stays the only one.
  - Frame-to-tick mapping: L6's `clipFrameTick(plan, frame)` in `share/clip/highlights.ts`.
    - Frames 0–59 (opener) and 330–359 (loop tail) hold `matchCutTick`.
    - Frames 60–329 run at 1×, except at 0.35× inside `plan.slowMo`.
    - A caught run has `slowMo.speed = 1` and an empty window; the cuddle is the payoff.
    - Please make L3's `clipFrameToTick` match this.
  - Frames 0–59 are covered by the opener photo when one exists. Without one, L6 shows L3's close-up: the cat
    staring at `crime.prop` (−1 means the cat). Frame 60 is the match-cut pose with the face filling `FACE_RECT`.
  - Frames 330–359 are replaced by L6 with a still of frame 0 (the loop cut), so L3 may draw anything there.
- **L7 `renderOffline(events, plan.matchCutTick, endTick, plan.slowMo)`**
  - The returned buffer is placed at clip time 2.0 s.
  - It is used only where `AudioEncoder` exists; otherwise the clip is silent.
- **L5**
  - Call `exportClip` during the result screen.
  - Show `result.error`. `CLIP_INTERRUPTED` ("Clip interrupted. Tap to retry") means: call `exportClip` again.
  - Call `shareClip(blob, clipShareText(cat.name, link))` only from the Post clip tap.
  - In an in-app browser (`needsHandoff(env)`), show `handoffSteps(env)` and call
    `copyHandoffLink(buildHandoffLink(play, cat, run.inputs, base))`.
- **L2 `buildLink`**
  - L6 builds `LinkState` objects:
    - handoff: `replay` plus `clip: true`
    - dare: `ghosts[0]` plus `via`
    - room: `dayNo` or `glass`
  - When `buildLink` throws (stub, or no ghost codec yet), L6 falls back to the plain `<base>/d/<n>` or
    `<base>/glass`.
- **L8 `detectEnv`**: called inside try/catch (`safeEnv`). Its `shortUrl` feeds the watermark and the URL line,
  with `tokentails.com/badcat` as the fallback.

## Known gaps (M0)

- The "Add music" toggle (`opts.music`) is ignored. Clips carry only the SFX from `renderOffline`.
- The MediaRecorder fallback records silently: the SFX are not replayed during the clip pass, and `captureStream`
  is not wired in. Planned for M1a, after the iPhone audio decision.
- Fallback 2 is not built (the image card plus a 2 s GIF of the crash). Neither is the 720 × 640 split-screen
  format.
- A video opener uses one still frame (M0). The 2 s video opener is M1a.
- Tension uses the suspicion values carried by `seen` events, because `RunResult` has no per-tick suspicion. "Froze
  in the cone" means a `loaf` after a `seen` within the window, with no catch.
- The result and story cards (`image-card.ts`) are drawn on a client canvas but have no tests (Node has no canvas).
- Untested in a real browser. Encoding was not run on a device; WebCodecs, mediabunny and MediaRecorder are covered
  only by tsc and the lazy-chunk check.
