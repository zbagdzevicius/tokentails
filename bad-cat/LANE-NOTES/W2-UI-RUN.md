# W2-UI-RUN handover: run session and HUD for v5

Owner files: `src/ui/run.ts`, `src/ui/loop.ts` (unchanged), `src/ui/input/**`, `src/ui/screens/Hud.ts`, new
`src/ui/hud/**`, `src/ui/run.test.ts`. Gates (Oct 16): `npx tsc --noEmit` clean, `npx vitest run` 52 files / 928
tests green. No sim, types.ts or shell files touched; no SIM_VERSION change (UI only, outcomes unchanged).

## Built

- **Ghost race** (`hud/ghosts.ts`): `createGhostLanes` starts each ghost with `initSim(play, cat, { simVersion })`
  (missing = SIM_VERSION), skips a broken ghost but keeps the others (before: one broken ghost dropped all),
  `stepGhostLanes` steps in lockstep; `ghostRules(ref)` marks `replayOnly` when the ref says so or its version is
  older. Lanes go to `renderer.setGhosts` and `hud.setGhosts`. Chips under the timer: "Mochi 4,210", green when you
  lead, red when behind; replay-only ghosts carry "replay only (older version)" and never show ahead/behind.
  `RunSession.ghostLanes` (new getter) exposes them.
- **buildResult** copies `wish, stashed, slides, pulls, onCamera, maxNoise, humans` (same derivation as
  `sim.runToEnd`).
- **HUD v5** (`hud/layer.ts`, slotted by `Hud.ts`):
  - Sunday: Zzz noise meter replaces the eye while the napper sleeps (also frozen-grey during the room event);
    pulses from 75 %, wake warning cue "Shh! She's stirring. Sneak!", "SHE'S AWAKE!" sticker at the napper.
  - Two humans: one shared meter with two state pips ('?', '!', 'z') in the eye; hint "Both looking" / "the other
    one is turning"; a floating "?" over the second human while it turns; the eye floats above the most alarming human.
  - Mirror cue "🪞 she can see you in the mirror" while the mirror is live (`mirrorHuman`), red "She saw you in the
    mirror!" for 1.5 s after a `seen {by:'mirror'}`.
  - Thursday: blinking REC badge (`webcamOn`), "📹 crashes on camera +50%" for the first 4 s, "+50% ON CAMERA"
    sticker on `cam` crashes.
  - Crime stickers (pooled, Web Animations transform/opacity, CSS fallback): FRAMED THE ROOMBA +300, WHEEE, YANK!,
    TIMBER!, x4 PLATES! (noun from the stack prop), "Mila is thrilled +500" (accomplice name; default
    `accompliceFor(dayNo, pinkPawId)`), If I fits, I sits, MUST-WRECK and STASHED. Max 3 per frame by priority, one
    per kind+anchor, deterministic tilt, kept on screen by measured width.
  - Event banners for all 12 `ROOM_EVENT_NAMES`: title "SURPRISE! 6 seconds", second line tagline
    ("he's not snoozing it"), aria-label "ALARM! he's not snoozing it". LAST CALL ×2 unchanged.
  - Suspicion eye above the human: `renderer.projectHuman(i)`, else `projectWorld(head x, z, 3)`; corner fallback
    when missing or off screen (boss rooms at 9:16 often fall back; render's edge arrow points at them).
  - Points pops now pooled too. Suspicion/noise fills animate by `scaleX` (no width layout per frame).
- **Haptics** (`hapticFor`, `tickHaptic`): one buzz per tick, strongest wins: light 12 ms swat/slide/pull/enter,
  medium 30 ms break/spill/seen/wake/framed, strong 60 ms topple. Topple also gets the 110 ms hitstop.
- **Input**: SWAT button reads PULL (🧶) next to a tablecloth or lamp cable (`swatHintFor`, optional
  `GameInput.setSwatHint`); the press bit is unchanged.
- FTUE prompts unchanged; the run never shows a paywall.

## Exported API

- `run.ts`: unchanged `RunDeps`, `RunSession`, `buildResult`, intro helpers; new `tickHaptic(events)`,
  `RunSession.ghostLanes`.
- `screens/Hud.ts`: unchanged `createHud(host, HudOptions)` and `Hud`; new optional `HudOptions.accompliceName`,
  `Hud.setProjector?(p)`, `Hud.setGhosts?(lanes)`, pure `humanHint(s, play, busyNew)`; re-exports types
  `HudProjector`, `GhostLaneView`.
- `hud/popups.ts`: `crimePopFor`, `crimePops`, `POP_PRIO`, `MAX_POPS_PER_FRAME`, `popTilt`, `hapticFor`, `HAPTIC`.
- `hud/meters.ts`: `noisePct`, `suspicionPct`, `noiseView`, `eyeVisible`, `napperOf`, `watchedHuman`, `humanPip`,
  `eyeAnchor`, `NOISE_PULSE_PCT`, `EYE_*`.
- `hud/ghosts.ts`: `ghostRules`, `createGhostLanes`, `stepGhostLanes`, `ghostScore`, `ghostChip`.
- `hud/copy-hud.ts`: `HUD_COPY`, `EVENT_TAGLINES`, `eventBannerText`, `pronounOf`, `stackNoun`.
- `hud/pool.ts`: `createStickerPool`, `slapFrames`, `riseFrames`, `clampX`. `hud/layer.ts`: `createV5Layer`.
- `input/source.ts`: `swatHintFor`, `type SwatHint`, `GameInput.setSwatHint?`.

## Tests

`src/ui/hud/hud.test.ts` (sticker text/priority per v5 event, haptics, 12 banners, noise mapping NOISE.max → 100 %,
eye anchor fallback, real-sim napper start, v4 ghost under rules 4 = replay only and bit-exact with an offline v4
replay, broken ghost skipped, chip labels, sticker clamp), `src/ui/hud/hud-dom.test.ts` (happy-dom: float vs corner
eye, projectWorld fallback, Zzz meter, two-human pips, ghost chips with the tag, banner, pooled DOM does not grow),
`src/ui/run.test.ts` (v5 result fields, tickHaptic, humanHint), `src/ui/input/swat-hint.test.ts`.

## Acceptance (dev server 5174, Playwright 390 × 844, swiftshader)

Screenshots in `bad-cat/test-results/w2-ui-run/` (scripts `run.mjs`, `ghost.mjs`, `stickers.mjs` next to them):
`sunday-napper-*` (/d/7: Zzz floating above the napper, stirring warning, then she wakes and the eye returns),
`thursday-zoom-*` (/d/4: REC badge, on-camera hint, eye over the WFH worker), `saturday-boss-*` (/d/6: two-human
pips, corner eye because both humans sit outside the 9:16 view), `ghost-d3-*` (/d/3 dare link with a v5 "Mochi"
and a v4 "Oldie" ghost: chips, replay-only tag, mirror cue turning red), `stickers-gallery.png` (every crime sticker
frozen mid-slap over a live boss run, plus the ALARM banner). Random play did not trigger real crimes in the live
runs; stickers are covered by the DOM test and the gallery. The dev server reloads now and then (other lanes'
edits); the scripts restart the briefing when that happens.

## For the integrator / W3

- app-shell may pass `accompliceName: this.accomplice?.name` to `createHud` (the fallback computes the same cat).
- app-shell still calls `r.setGhosts(...)` on load with its own fresh states; RunSession replaces them with the
  live lanes on start (harmless). The shell's own replay-only result copy is untouched.
- Room event kind is read as `Number(play.room.event)`.
- No change requests for types.ts.
- Known bugs listed in docs/*.md: none touched.
