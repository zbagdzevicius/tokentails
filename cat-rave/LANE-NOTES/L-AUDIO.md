# L-AUDIO notes

## API (src/audio/index.ts)

`createBeatClock({ muted, now? }): RaveClock`. `RaveClock extends BeatClock` (types.ts unchanged), so
`main.ts` keeps working as typed. It also adds three sound effects, which L-UI and L-DJ may call (they are
no-ops while silent):

- `tap()`: an open hat plus a tiny chirp; rate limited, so fast taps give hats only. Call it on a floor tap.
- `meow(midi = 81)`: a one-off meow.
- `cheer(size = 1)`: a synthesized crowd cheer (size 0.3–1.6).

To use them, type `clock` as `RaveClock` (`import { createBeatClock, type RaveClock } from './audio'`).

The drop already plays its own impact, sword "shing" and cheer, and the cheer is bigger when
`cause === 'new-cat'`. Do not add another cheer on `clock.on('drop')`.

## Behaviour

- Before unlock, while muted and while the tab is hidden, the clock follows the performance clock and
  the same arrangement, so visuals still dance. After unlock the synth schedules against that same
  clock, with an offset measured by `getOutputTimestamp`, which also corrects for output latency.
- Hold, release and `queueDrop` take effect from the first bar that has not been scheduled yet, usually
  the next downbeat. A release before the build has started still gets one bar of build. A hold drops on
  its own after 8 bars, with cause `viewer`.
- `queueDrop` is ignored for the first 2 bars of a drop. A `new-cat` drop upgrades a drop that is already
  queued.
- `unlock()` must run inside a gesture handler. It plays a silent buffer, resumes the context, and sets
  `navigator.audioSession.type = 'playback'` where available, so the music plays even when the iPhone
  silent switch is on (decision for L-UI: drop that line if you prefer the silent switch to win). After
  an iOS interruption, any later pointerdown or keydown resumes playback.
- `setMuted(true)` fades out, stops scheduling and suspends the context. `setMuted(false)` resumes
  playback, but only after `unlock()` (call `unlock()` from the mute button too).
- Phones get fewer supersaw voices (3 with 4 cores or fewer, 5 on coarse-pointer devices, 7 on desktop).
  The reverb is a feedback delay; there is no convolver.

## Needs from others

- L-UI: call `clock.unlock()` on the first pointerdown, touchend or keydown, and on the mute button.
  Call `clock.tap()` on a floor tap.
- `src/main.ts` currently has a tsc error at line 42 (`createHud` expects 2 arguments). It is L-UI's
  file and was not introduced by audio.
