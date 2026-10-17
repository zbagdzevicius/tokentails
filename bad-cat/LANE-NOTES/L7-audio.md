# L7 Audio notes

- [L7] `AudioEngine` has no way to learn the room: `SimState` lacks `RoomDef.event` (doorbell/kettle/phone/TV cue)
  and prop kinds are only known after the first `onEvents`. Workaround: `createAudio()` returns `BadCatAudio`
  with an extra `setRoom(play: PlayableRoom)`. L5 should call `(audio as BadCatAudio).setRoom(play)` (or check
  `'setRoom' in audio`) before each run; without it the event cue defaults to the doorbell. Proposal for LEAD:
  add optional `setRoom?(play: PlayableRoom): void` to `AudioEngine`.
- [L7] `renderOffline` takes no prop kinds; the engine reuses the kinds from the last `setRoom`/`onEvents`, so
  L6 must export the clip with the same engine that played the run (or call `setRoom` first). The standalone
  `renderEventsOffline(events, from, to, slowMo, { propKinds, eventKind })` is exported for explicit use.
- [L7] Offline mix is SFX only (GDD 12 default); the optional 12 s music sting is not rendered. Time 0 of the
  returned buffer = `fromTick`; the slow-motion window is stretched by `1 / speed` (cues inside it are pitched
  down 3 semitones). L6 positions the buffer in the 12 s clip (opener offset) itself.
- [L7] `cuesFor` emits `perfect` / `stamp` on the `end` event from `s.stamp`; `stinger()` calls for the same
  sound within 2.5 s / 1 s are de-duplicated, so L5 may call `stinger('perfect')` too without a double hit.
