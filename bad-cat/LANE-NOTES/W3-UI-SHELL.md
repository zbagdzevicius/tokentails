# W3-UI-SHELL handover: app shell and every flow (wave 3)

Owned: `src/ui/**`, `src/main.ts`, `index.html`, `e2e/**`, `playwright.config.ts`. Nothing outside was edited (no
types.ts change needed). No sim change, no SIM_VERSION bump. No git operations.

## Built

- **Router** (`router.ts`, pure): GDD 13.5 in full. New screen `studio`; events `offer` (paywall moments outside the
  share flow: home, archive, rooms, settings, cats, season, rapsheet; never in session 1, one per session),
  `studioPlay`, `household`; `replayReady { reAdd }` (clip handoff: catmaker re-add, skippable, then the result);
  `RouterCtx.ftueGlass(dayNo)` (the 40 s first heist on a boss or Napper day plays The Glass); `RunPlan.studio` /
  `household`; `RouterState.reAdd`, `offerBack`, `hhPlan`; the post-share offer now also requires session ≥ 2;
  `Router.jump()` for the QA hook. `Entry.studio` (`?studio=1` alone, when `env.studioAllowed`).
- **Pure helpers** (`shell-model.ts`): GDD 14 `entry` mapping (incl. `typed_or_direct`), tomorrow teaser, room chips,
  seen line, Felony Friday options and "names both cats" line, dare outcomes vs g + g2 (replay-only excluded),
  local hide list (`hidden`, 200 payload hashes), paywall gate, XP line, household second cat.
- **Home**: room card (weekday/theme/Felony/Community chips, human, twist, boss badge, credit), "Tomorrow: …", Nine
  Lives left, Club seen counter (`money.seen`, `bc_cameo_seen`, online Club members only), gold "Your week is ready"
  button, streak_break offer card inline (money's offerCard), A2HS with `bc_a2hs` shown/accepted, brand link when the
  server has `brand`, Club "Fridge cat" (`money.setClubCat`, also after the cat maker / cat manager / thanks).
- **Picker**: OG stills `og/d/<n>.png` (`og/glass.png`) with emoji fallback, shell icons.
- **Briefing**: boss banner, Felony Friday chooser (default today's Pink Paw cat = the accomplice; your cat; up to 3
  guest stars from the cameo bundle, which replace the chooser when they arrive), Community Sunday / remix credit,
  sponsor from the room or the schedule; the stage reloads with the chosen cat; streamer layout via
  `renderer.setLayout('streamer')` for Club + pref; desktop side panels (`screens/SidePanels.ts`: targets struck
  through on `target` events, accomplice wish, ghosts, Rap Sheet line, dare QR in streamer mode; CSS shows them only
  ≥ 900 px, landscape, hover devices).
- **Run end / result**: par paws (`progress.parPaws` + `DailyEntry.par`), new Rap Sheet stamps (`bc_rapsheet_new`),
  `bc_streak { length, freeze_used }`, season XP line, wish granted + "Meet <cat> at Pink Paw" (`bc_pinkpaw_adopt_click`),
  one dare line per ghost (`bc_dare_result` only for current-rules ghosts), friends board save as before.
- **Share**: "More ways to brag" (story card, Rap Sheet mugshot, cat card, cameo card for Club/cameo owners, room
  link, hide-and-report each link ghost), clip music toggle (saved to `prefs.clipMusic`), in-app steps per app
  (iOS/Android) + `intent_opened`, `reply_video` artifact for stitch/reply, household chip "Mochi vs Luna": with no
  second run it starts "Play Luna too" (router `household` → practice briefing of the same room with the second cat →
  back to share; the renderer is reloaded with cat A, then `exportClip({ format: 'household', second, secondFaces,
  restore })`), "Hide and report this room" (local hide list + `ugc_reported { payload_hash, kind }`).
- **Paywall moments**: post_share → perfect_crime (perfect runs) → gift_s1 after the share sheet is done;
  catmaker_saved (after a real save, not FTUE, not re-add); streak_break (home card); archive_old (offer screen,
  else a toast). Shell gate `mayOffer` + money's own rules; nothing after FTUE / studio / household shares.
- **Money routes**: thanks/redeem/restore apply entitlements (profile re-read, Club welcome toast, fridge cat sync).
- **Clip handoff**: `bc_inapp_handoff arrived`; no photo here → catmaker `reAdd: { name }` (skippable) → the clip job is
  rebuilt with the new face → result → share.
- **Studio** (`screens/Studio.ts` + shell): queue on the share module's `studioReducer` (lazy `import('../share')`),
  batch list paste, Next cat → cat maker studio mode (slot 4) → 40 s run (mode `ftue`, `plan.studio`) → stitch/reply
  clip with the @handle pill → Post marks the item saved → back to the queue. Room toggle Today / The Glass.
- **Clip job**: `ClipOptions.second/secondFaces/restore`; makeClipJob picks opener + face crop per cat
  (mine / studio / other), `codec` in `bc_clip_export`.
- **Analytics**: common props `entry` (GDD values), `utm_source`; events at their points as listed above.
- **Audio**: muted in in-app browsers until the first tap; volume prefs applied at boot.
- **QA hook**: `goto(screen, {dayNo, glass, mode})`, `setDay(n)`, `services()`, `router()`, `events()` (+ existing
  `screen/state/play/scoring`).
- Also fixed in owned code: `targetName` kept acronyms ("Gold TV remote", was "Gold tV remote"); stage loads are
  serialised (`stageQueue`): two overlapping `renderer.load()` calls threw `reading 'isReady'` inside three's
  compileAsync (Felony chip tapped during the warm-up; change request filed for render).
- QA `scoring(tries, minTargets)` now hill-climbs on the best run after the random phase when `minTargets > 0`.

## Tests

- `router-full.test.ts` (table-driven: every route, boot entries × first visit, FTUE Glass rule, clip handoff,
  every paywall placement, studio, household, side screens), `shell-model.test.ts`, `app-shell-full.test.ts`
  (fake services in `shell-world.test-util.ts`: paywall session 1/2 + catmaker_saved, Felony chooser, boss/community/
  tomorrow, FTUE Glass on a boss day, picker 16 cards with stills, result paws/wish/adopt, clip handoff re-add,
  household, hidden room link, hide-and-report, analytics props, consent session gate, QA hook, studio).
- `e2e/full.spec.ts` (13 tests): ≤ 6 taps link → clip → share; ranked once a day (+ reload); dare g + g2 with a v4
  replay-only ghost; room link → remix → clear it → publish → open; picker 14; archive lock; Saturday boss + Sunday
  Napper via setDay; Felony Friday chooser; clip handoff with re-add skip; no offer in session 1 / one after a share in
  session 2 (fake money via the QA hook); save code round trip; consent banner absent without a key; zero foreign
  requests with an empty env. `e2e/flow.spec.ts` handoff test now clicks `readd-skip` (the new browser has no photo).

## Deviations / decisions

- Studio saves the studio cat's photo in cat slot 4 (catMaker has no "do not store" option); fine on the founder's
  device, but it overwrites a Club player's 5th cat photo if they open `?studio=1` (dev/VITE_BADCAT_STUDIO only).
- Studio runs use mode `ftue` (40 s, spawn by the quickest target, fixed event) because RunMode has no 40 s practice.
- Consent banner: session ≥ 2 and only where analytics could send (PostHog key or dev); with an empty env it never
  shows (e2e checks absence).
- Felony Friday: the playable Pink Paw cat is the day's accomplice (`accompliceFor`), falling back to `fridayCriminal`.
- Side panels are DOM over the stage; the streamer QR is the plain daily link (no dare ghost yet before the run).

## Gaps

- e2e room flow: a random/hill-climb search almost never wrecks 2 of 3 targets in a player room, so the e2e plays the
  room link, remixes it, runs "Clear it" through the shell and checks the maker's verdict; the publish → My rooms →
  open-link half runs only when a clearing script is found (annotated otherwise). Publish + save + share is covered by
  `app-shell.test.ts` (fake editor).
- The glowing Post button is never "stable" for Playwright; the e2e taps it with `force`.

- Dev server :5174 was down (connection refused) during this lane; not restarted. The manual pass ran on my own
  `vite --port 5175` (home, d1–d7, studio, picker: no page errors). The real-device / webview checks remain open.
- Guest-star cats have no face decal (cameo faces are only decoded for spectators).
- The Rap Sheet / cat / cameo cards are rendered after the tap (async), so on iOS the native share may fall back to a
  download (same as the existing Rap Sheet card).
- No change requests for types.ts. Known bugs in docs/*.md: none touched.
