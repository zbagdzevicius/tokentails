# W1-AUDIO handover

Owner files: `bad-cat/src/audio/**`. No change to `types.ts` was needed; the `AudioEngine` FULL-build members
(`setRoom`, `renderClipMix`, `scheduleClip`, `now`) are implemented as typed. All sound is WebAudio synthesis.

## What is built

- `sfx-map.ts`: a cue for every v5 `SimEvent`, per-persona voice cues, telegraph cues per routine, room events 0..11,
  prop-specific sounds for kinds 16..63, offline Napper snores (`snoreCues`), live per-tick extras (`liveTickCues`:
  Napper snore every 2.5 s, Roomba bump), and the room context `roomAudioFor(play)`, which reads personas, napper,
  `RoutineDef.cue`, `RoomDef.theme` and boss from the room.
- `voices.ts`: wordless formant voices (a sawtooth through three vowel band-passes plus breath) for 8 personas
  (pitch, formant scale, wobble). Grandma has a 55-cent vibrato; the party host and the skincare sis have a light
  one. The voice set is "hm?", gasp, sigh, humming, yawn, snore, and the two phrases "BAD KITTY" and "come here"
  sung as a vocoder-ish chirp with consonant bursts. There is also a guest crowd and the cat's "mrrp".
- `recipes.ts`: synth recipes for the v5 cues and the special prop sounds. `rooms.ts`: the 12 room events, the
  4 telegraph cues, the party horn and the NYE countdown.
- `music.ts`: the existing jazz stems are kept. New styles: `boss` (Saturday, 116 bpm, light swing, brass stabs on
  the "and" of 2 and on 4) and `lullaby` (Sunday Napper, 72 bpm, straight, music-box celesta, no kick). The S1
  layer (sleigh bells and celesta) plays when `theme === 'xmas'`. `scheduleSpan(t0, t1, mode, swellAt)` renders
  the loop without a timer and is used for the clip sting.
- `audio.ts`:
  - `renderClipMix(events, from, to, slowMo, { music, theme })` is the SFX mix plus an optional music sting. The
    sting fades in over 0.25 s and out over 1.5 s, plays "sneaky" until the first crash and then the full band,
    and ducks about 6 dB under every crash.
  - `renderOffline` is the same call with `music: false`; its buffer is unchanged.
  - `scheduleClip(events, from, to, slowMo, startAt, opts)` schedules the same cues and sting in real time on the
    live context. They go into the `captureStream()` destination only, through the clip compressor chain, never
    to the speakers. It returns an idempotent `cancel`, which stops every source and disconnects the chain. The
    chain also disconnects itself about 4 s after the clip ends.
  - `now()` returns `ctx.currentTime`, or `null` before unlock, after dispose, and in Node.
  - Music style and theme follow `setRoom`.

## Cue table

| Event / input | Cue | Sound |
|---|---|---|
| `slide` | `slide` | rubbery skid (buzzy saw + scuff) + "wheee" squeak |
| `stack` (items N) | `stackClink` | N clinks (max 8), rising 2 semitones each, coloured by material/special |
| `pull` cloth | `pullCloth` | fabric swoosh + zipper rip |
| `pull` cable | `pullCable` | plucked low twang with a "boing" + lamp tinks rocking |
| `topple` (cells) | `topple` | woody creak, whoosh, then the jingle-bell crash (crash class, boosted) |
| `puddle` kind 1 / 2 | `puddle` | small wet splat with a "plip" / dry pat (soil) |
| `roomba` (each move) | `roombaHum` | soft motor hum for one step (0.8 s); a pause = plastic bonk (live: `roomba.pause` 0 to >0; offline: gap between moves) |
| `framed` | `framed` | "dun dun DUN" brass (two stabs + a long one a minor third down) |
| `wish` | `wish` | sparkly bell arpeggio + the cat's happy "mrrp" |
| `enter` | `enter` | cardboard thunk + rustle + short purr |
| `noise` (quarters) | `noiseRise` | snore snort + rising tremolo figure, higher with the level |
| `wake` | `wake` | big yawn ("haa-aah-oh") then the sleepy "hm?" |
| human `nap` / every 2.5 s asleep | `snore` | fluttering inhale + whistled exhale; shorter, higher and twitchier as the meter fills |
| `seen` by `mirror` | `seen` + `glint` | alert tick + high glint sweep |
| `break`/`land`/`spill`/`hit` with `cam` | + `shutter` | camera shutter blip 0.18 s after the crash |
| human `telegraph` | `teleCue` + `hm` | routine telegraph (below) then the two-note sting with the persona's "hm?" (0.15 s later); silent for a Napper (its `wake` is the yawn) |
| human `look` | `doubleTake` | brass double-take + persona gasp (3 dB under M0, so a crash on the same beat stays on top) |
| human `fakeout` | `hum` | three lazy hummed notes (persona) |
| human `busy` (after 1 s) | `sigh` | relieved breathy "haaah" (persona, soft, at most every 1.5 s) |
| `caught` | `badKitty`, `comeHere`, `caught`, `purr` | "BAD KIT-TY" (persona chirp + music box), "come HERE" at +0.9 s, the softened wah-wah at +1.6 s, purr at +2.6 s |
| `lastcall` (NYE theme) | `lastCall` + `nyeCountdown` | three beeps up, cork pop, party horn |

Telegraph cue per `RoutineDef.cue` (`teleKindFor`):

| Cue label contains | Kind | Sound |
|---|---|---|
| `stove`, `timer` | 0 | kitchen timer ticking fast + a tiny ding |
| `tv`, `jingle`, `ad ` | 1 | three-note ad-break bumper |
| `mirror` | 2 | shimmering glass hum swelling up |
| `mute` | 3 | soft two-tone "bloop-bloop" (generic, not any app's sound) |

Room events (`eventCue`, `RoomDef.event`):

| Kind | Name | Sound |
|---|---|---|
| 0 | DELIVERY! | doorbell ding-dong (6 dB under M0) |
| 1 | KETTLE! | rising whistle + hiss (M0, slightly softer) |
| 2 | PHONE CALL! | two short rings (M0) |
| 3 | AD BREAK! | TV jingle (M0) |
| 4 | OVEN DING! | timer rattle + one fat bell |
| 5 | SURPRISE! | light-switch click, crowd "surprise!", party horn |
| 6 | ALARM! | bell hammer ringing 1.6 s |
| 7 | SPEECHES! | knife-on-glass clink x3 + a hush |
| 8 | GUESTS! | door + chatter (5 random persona voices) |
| 9 | COURIER! | knock-knock-knock |
| 10 | PIZZA! | bicycle-bell "brring-brring" |
| 11 | YOU'RE ON MUTE! | the mute chime |

Special prop sounds (`SPECIAL_BY_ID`; break/spill = crash class, land = softer version):

| Prop ids | Sound |
|---|---|
| balloon | POP + rubbery flap |
| flour-bag | thump + dusty POOF |
| popcorn-bowl, snack-tower | bowl bonk + popcorn patter |
| champagne-bottle, champagne-tower | cork pop, bottle clonk, fizz (+ glass on break) |
| cups-tower | hollow plastic cup cascade |
| receipt-pile, gift-wrap | paper flutter (whump on a payoff) |
| gift-stack, box-tower, cardboard-box | cardboard THUD + ribbon rattle |
| cookie-tray | metal tray CLANG, wobble, cookies scattering |
| christmas-tree | jingle-bell crash (thud, sleigh-bell shower, baubles) |
| bubble-wrap | squishy thump + pop-pop-pop |
| ornament | glass bauble ping + tinkly shatter |
| board-game | box clonk + dice/pieces scatter |
| everything else | its material (glass, ceramic, metal, tech, plastic, paper, fabric, food) as in M0 |

Persona voices (`VOICE_PROFILES`): chef-dad 128 Hz, couch-potato 104 Hz (breathy), skincare-sis 228 Hz, wfh-worker
150 Hz, party-host 196 Hz (lilt and vibrato), napper 108 Hz (breathy), grandma 210 Hz (wobble), caterer 140 Hz.
Boss rooms voice each human with its own routine's persona; `caught` uses human 0.

## Loudness

- The crash class (`crash` of every material and special, `splat`, `topple`) sits at least 3 dB above every other
  cue. The exceptions are the deliberately loud turn sting `hm` (GDD 12) and the end-of-run stingers (`caught`,
  `badKitty`, `comeHere`, `perfect`, `stamp`), which never play under a crash.
- `audio-v5.test.ts` checks this with a loudness model on the fake graph (`loudness-model.test-util.ts`). The model
  sums the harmonic power of each oscillator and the band fraction of noise through its filters, multiplies them by
  the envelopes, and takes the loudest 300 ms window.
- Checked in real Chromium (OfflineAudioContext, the dev server modules):
  - quietest crash-class cue: -20.5 dB
  - loudest other: double-take -24.4 dB, wake -24.1 dB, doorbell/oven -25.3 dB
  - `hm`: -15.4 dB
- Changes made to keep the margin:
  - `splat` gets `SPLAT_BOOST` 1.4.
  - The tech crash is fuller.
  - Doorbell, kettle and oven are softer.
  - The `target` chime is 2 dB down.
  - `doubleTake` is 3 dB down.
- Bug fixed in my own files (not listed in any doc): an envelope GainNode is 1 until its first automation event, so
  a noise burst starting exactly on a sample boundary leaked one full-scale sample. Through a high-pass that is an
  audible click (measured 0.8 peak in Chromium on the alarm cue). Envelopes now start at `SILENT`, and a regression
  test covers it.

## Listen check (dev server http://localhost:5174, headless Chromium via Playwright, server not restarted)

- Every cue rendered with no NaN.
- The clip mix (xmas boss room, grandma, slow-mo 0.35) had the same buffer with and without the explicit
  `music: false` call, as expected:
  - SFX only: 6.86 s, -21.6 dB RMS.
  - With music: 10 s, -18.5 dB RMS, peak -1.0 dBFS after normalisation.
- `scheduleClip` + `captureStream()` + MediaRecorder recorded 38 KB in 2.5 s. `now()` advanced.
- No page errors.
- Nobody listened by ear; a human pass on a phone is still worth doing.

## Notes for other packages

- **W2-SHARE**:
  - WebCodecs path: call `audio.renderClipMix(events, plan.matchCutTick, endTick, plan.slowMo, { music: !!plan.music,
    theme: play.room.theme })` and place the buffer at clip time 2.0 s, as before.
  - With music, the buffer is at least `CLIP_MUSIC_S` = 10 s (12 s clip minus the 2 s opener). The sting fades
    out by its end. For the 6 s Roomba format, pass `musicSeconds: 4` (extra optional field, `ClipScheduleOptions`),
    or the muxer can trim it.
  - MediaRecorder path: `const cancel = audio.scheduleClip(events, from, to, slowMo, audio.now()! + offset, { music })`
    where `startAt` is the context time of clip 2.0 s. Record `audio.captureStream()` and call `cancel()` on abort.
  - Both need the engine that played the run, or a `setRoom(play)` first: prop kinds, personas, theme.
  - This closes the audio side of README "Known gaps: Add music toggle ignored, MediaRecorder records silently";
    the wiring is W2-SHARE's.
- **W2-UI-RUN / W3**: call `audio.setRoom(play)` before every run. It now also picks the music style (boss,
  lullaby, jazz) and the xmas layer. Napper snores come from the live state (`HumanSt.NAP`), so the sim's `nap`
  human event is optional.
- **W1-SIM**: the audio expects these:
  - a Napper starts asleep, or emits `human … state 'nap'`
  - `wake` precedes the Napper's TELEGRAPH
  - `noise` is emitted on each quarter crossing
  - a tree `topple` is followed by its `land`, which plays a softer jingle thud, so the big crash is on the topple
  - the Roomba moves emit `roomba`

## Gaps

- No CC0 samples (GDD 12 mentions Kenney/freesound); everything is synthesized, as the brief asked.
- Formant "words" are a vocoder-ish chirp, not intelligible speech; "BAD KITTY" and "come here" read by rhythm and
  melody.
- The sting starts at the match cut (clip 2.0 s): the opener seconds carry no music, because the buffer contract
  starts at `fromTick`.
- No `types.ts` change requests.
