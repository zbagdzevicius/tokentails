# Formula Meow: iteration 4, "more fun" (SIM_VERSION 11)

Branch `feat/formula-meow` (from 73ee949c, SIM_VERSION 10). Read with `GDD.md`, `ITERATION-2.md`, `SETPIECES.md`
(sections 16 and 17) and `formula-meow/LANES.md` (section "Iteration 4").

**Freeze override.** The founder's earlier freeze rule for Formula Meow (no new feature work after iteration 3) is
overridden for this iteration by the founder's explicit request: "do additional fun iteration to make this game more
fun". The override covers this plan only.

## 1. Goals

1. **The first 30 seconds feel better.** A clean countdown, a start you can hold from pole, steering on a phone that
   keeps you in the pack, and something to react to in the first corners (a slipstream filling, a trick off the first
   ramp, a pass that punches the place number).
2. **Close racing reads as drama, not chance.** Fields often finish close together (in the headless probe, another
   kart crossed within 0.3 s of the player in 54 % of 48 races). Photo finishes, final-lap duel cues and comeback calls
   turn that into moments players notice and share.
3. **Reasons to replay.** Wild Card mutators and a Daily mutator, a Style score with stunt challenges, a fair climb
   inside a Grand Prix cup, a 1v1 ghost duel from dare links and Time Trial, and doodles that start out spectacular
   with a maker's lap to beat.
4. **Still easy to handle.** Auto-gas stays, every new mechanic is optional, phone first, reduced motion respected.

Non-goals: new modes, new items, new tracks, any server, any change to the economy beyond the new challenge rows.

## 2. Pain points this iteration fixes (from the playtest)

| # | Pain point (playtest) | Fixed by |
|---|---|---|
| P1 | On a GP reverse-grid pole the whole field passed the player in 4–11 s (AI behind the player gets `bandUp` plus the pack pull from GO) | F1 |
| P2 | Touch: the same line-follower brushed walls in 736–1,200 sampled frames vs 6–15 with keys, and fell out of the pack by 17 s | F2 |
| P3 | Ramp tricks: 7.8 ramp launches per race, 1.0 trick (0.2 s post-lip window, no prompt, not in Help) | F3 |
| P4 | Close finishes look like any other finish; no margin shown | F4 |
| P5 | Slipstream, being targeted, and the cat right behind you are invisible until something fires | F5 |
| P6 | Phone results: up to 9 buttons, the dare outcome line below the fold | F7 |
| P7 | The share clip scores loops, wall rides and landings 0, so it rarely shows them | F8 |
| P8 | Time Trial has no dare button; a dare puts the ghost among 7 AI; no live gap; no one-tap rematch | F9 |
| P9 | A fresh doodle is a flat oval with 2 boxes and 1 boost; stunt stickers sit below the fold | F10 |
| P10 | Five modifiers exist in the sim and ghost header but nothing sets them; the Daily varies only track and mirror | F11 |
| P11 | Set pieces are not in RaceStats, so challenges and achievements cannot reward them; "Take 2 shortcuts" stayed 0/2 for 10+ races | F12 |
| P12 | 3–4 taps (Your racer, Ready, class, cup) before every race; the Pounce hint covers the "1" | F13 |
| P13 | A beginner finished 8th in all four Kibble Cup races with nothing earned; "Unlocked: Alley Cat" next to an 8th place reads oddly | F13 |
| P14 | Battle: furniture hides the kart, the ring minimap does not find targets, the 2:30 round never escalates | F14 |
| P15 | Shelter cat-flap tunnel on a phone: streaks cover about two thirds of the screen | F2 (readability part) |

Measurements above come from scripted drivers (a novice line-follower, the bot=1 driver and a headless probe). They
are directions, not player data; re-measure after the lanes land (section 6).

## 3. Features (14)

Each feature lists what the player sees, acceptance criteria and tests. "Sim" marks the three items the Engine step
builds (section 5); everything else is render, input, UI or share code and does not change the hash.

### F1. Pole is a prize (Sim, Engine)

**Player:** Starting on pole means leading into turn 1 and having to defend it. The field no longer swarms past in
the first seconds.

- For the first `AI.bandRampTicks` (6 s, 360 ticks) after GO, the rubber band's `+bandUp` side and the pack pull ramp
  linearly from 0 to full (`items-ai/ai/rubber-band.ts`). `bandDown` is unchanged.
- **Acceptance:** with the bot=1 driver on pole (GP race 2 setup, 100cc, 3 seeds, 3 tracks) the player is still top 3
  at GO + 5 s in at least 2 of 3 runs per track. The 150cc bot podium rate stays ≤ 80 % and the 50cc podium rate in
  the existing 70–90 % band (72-race harness).
- **Tests:** `rubber-band.test.ts` ramp cases (0 at GO, half at 3 s, full at 6 s); golden hashes regenerated.

### F2. Smart Steer and phone readability

**Player:** On a phone the kart stops kissing the walls. Small corrections feel responsive. Tunnels stay readable.

- **Smart Steer** (input layer, on by default for touch, off for keys and gamepad; a Settings toggle): when the
  kart's projected path (0.5 s ahead at current speed and steer) leaves the road edge minus 0.6 m, the mux blends
  the stick toward the road heading, by at most 0.35 of full lock, ramped by the projected overshoot. It never acts
  while drifting with the stick pushed into the drift direction, on a loop rail, in the air, or during the countdown.
  The touch stick curve changes from `x^1.4` to a softer `x^1.15` with a smaller dead zone.
- The assist edits the TickInput before it is latched, so replays and ghosts record the assisted steer and stay
  deterministic. It reads only `MuxContext` (the Engine adds `edgeL`, `edgeR` look-ahead distances and `onRail`).
- **Tunnel readability** on screens narrower than 600 px: tunnel streaks at half opacity, kept to the walls (not the
  ceiling) and faded within 4 m of the camera; the road stays the brightest thing on screen.
- **Acceptance:** the novice line-follower on touch at 390x844 (Kitchen, Café, Shelter, 50cc) touches walls in at
  most a quarter of the frames it did with SIM_VERSION 10 and finishes within 8 s of the 50cc AI's mean. With
  keyboard nothing changes (bit-identical input). A deliberate drift is never pulled out (`mux.test.ts`).
- **Tests:** `mux.test.ts` (assist off for keys, off while drifting into the bend, bounded at 0.35, zero on a rail),
  `e2e/feel.spec.ts` touch run with a wall-frame count, `review:v3` tunnel shots at 390x844.

### F3. Tricks you can actually do (Sim, Engine, plus view)

**Player:** Every ramp shows a pulsing paw ring on its lip saying TAP!. Tap around the lip and the cat strikes a pose
and lands with a boost. Help explains it.

- Sim: the trick window becomes 0.12 s before the lip (a buffered tap, `KartState.trickBuf`, hashed) through 0.45 s
  after it. A pre-lip tap that is only a hop does not change the launch (the hop is swallowed while the buffer is
  armed within 0.12 s of a lip). AI trick taps keep scaling with skill (50cc stays gentle).
- View: a paw ring decal on each ramp lip and jump-gap lip (instanced, 1 draw call per track), pulsing as the player
  approaches; a 1-of-3 trick pose; "Tap on ramps for a trick boost" in Help and the first-race hints.
- **Acceptance:** the bot that taps once anywhere in [−0.1 s, +0.4 s] around every lip gets a trick on ≥ 90 % of
  launches; the 50cc AI trick rate is within ±20 % of SIM_VERSION 10; a pre-lip tap lands at the same spot ±0.5 m as
  no tap (`stunt.test.ts`).
- **Tests:** kart trick-window cases, launch-unchanged case, goldens; `e2e/stunt-juice.spec.ts` sees the ring.

### F4. Photo finish and the overtake punch

**Player:** Each place gained pops a "+1 ▲" and punches the place number with a whoosh; losing one shakes it red.
When you cross the line within 0.3 s of another cat, the frame freezes 0.4 s with a shutter flash and a click,
"PHOTO FINISH" slams in with the real margin ("by 0.07 s"), and the announcer says "By a whisker!" or "So close!".
A win shows "WON BY 1.8 s".

- The margin comes from `finishMargin(result, me)` (Engine, pure, sub-tick finish times). Decide only after the
  nearest other finisher is known: wait up to 18 ticks after the player's own finish. Never call it against a kart a
  lap down. Reduced motion: no freeze, no flash, the stamp still shows.
- **Acceptance:** juice unit tests cover ahead, behind, a lapped kart and "no one within 0.3 s"; TimeWarp scales only
  render time (hash unchanged); results row, share caption and clip carry the same margin (F7, F8).
- **Tests:** `juice.test.ts`, `audio.test.ts` (new lines respect cooldowns and never talk over "Final lap!").

### F5. Pack racing you can feel

**Player:** Tuck in behind a cat and wind ribbons stream past, a whoosh climbs and a ring fills: SLIPSTREAM!. A
hairball locked on you that misses gives "DODGED!". On the final lap a chip shows the gap to the cat ahead and behind
("+0.4 s" / "−0.3 s"); the bottom edge glows red (DEFEND!) when a cat is within 0.5 s behind and the top edge gold
(CATCH!) within 0.5 s ahead; the heartbeat layer speeds up. Taking P1 on the final lap cuts the music for one beat and
slams it back. New calls: "COMEBACK!" (3+ places gained on the final lap), "STOLEN AT THE LINE!", "Hold on!". A purple
"FASTEST LAP" flash when you set the race's fastest lap. Close passes play a short panned zip.

- All render or audio, from `k.slipTicks`, `core/hud/incoming.ts`, `st.order`, distance gaps divided by speed
  (smoothed 0.3 s, shown to 0.1 s) and `bestLapTicks`.
- DODGED needs a projectile that was closing on the player with an ETA under 0.6 s and ended within 3 m with no `hit`
  or `blocked` on the player within 20 ticks; one call per 2 s.
- **Acceptance:** ribbons reuse the speed-lines pass (no new draw call on the low tier, ≤ 1 elsewhere); 24-voice
  budget kept; glow and FOV off under reduced motion; zips silent during the countdown and the first 3 s after GO.
- **Tests:** juice unit tests for the dodge rule (hit, wall despawn, real miss), gap smoothing, comeback/steal
  triggers; `hud.test.ts` landscape layout of the gap chip.

### F6. Boost chains and ON FIRE

**Player:** Boosts that start within 1.2 s of the last one ending chain: "BOOST CHAIN x3", each link pitches the boost
sound up and pushes the flame toward white-pink. At x4 (or after a TRIPLE overtake) the kart goes ON FIRE for 5 s:
flame trail, glowing ears, the music's lead layer. Results show "Best chain".

- Pure tally in `juice/boost-chain.ts` from `boost` / `miniTurbo` / `trick` / `stuntExit` / `slipstream` events, unit
  tested like `juice/stunts.ts`. Callouts only from x3, at HUD priority 1.
- **Acceptance:** no sim change; FOV add capped at +4°; reduced motion: no FOV, trail at half opacity.

### F7. Results that land on a phone

**Player:** On a phone the results open on one big card: place, time and the one line that matters ("You beat Zyg's
ghost by 1.2 s", "Medutis beat you by 0.4 s", "PHOTO FINISH by 0.07 s", "New best"). Below it one primary button
(Next or Rematch), one Dare button and a "•••" tray with the rest. After a race with a strong highlight (photo
finish, combo x3+, chain x4), the clip button pulses with the reason ("That x4 combo deserves a clip"); quiet races do
not nag. A first-race unlock shows as "Next up: Alley Cat 100cc unlocked" in the tray area, not beside a pink 8th.

- Desktop keeps today's layout plus the headline line.
- **Acceptance:** at 390x844 the headline line and the primary button are above the fold on every mode's results;
  every existing `data-act` attribute and label still exists (in the tray); e2e specs keep passing.
- **Tests:** `share.test.ts` headline line selection; `e2e/share.spec.ts` and `e2e/modes.spec.ts` at 390x844.

### F8. Clips that show the best moment

**Player:** The 12 s share clip now picks your loop, wall ride, clean jump landing, combo, or photo finish, films a
loop from the TV-spot camera, and burns in a caption sticker ("LOOP-DE-MEOW", "STUNT COMBO x4", "PHOTO FINISH by
0.07 s"). The share text gains a stunt brag ("2nd · 1:31.20 · 3 loops, STUNT COMBO x4 🌀"); the Daily card gains a
stunt emoji.

- `eventScore`: `stuntExit` clean +3, `stuntLand` +3 (+1 per combo step), wall-ride enter +1, `netCatch` −2, a photo
  finish +6 (GDD 9.1). Existing penalties stay, so clips still favour the player doing well.
- **Acceptance:** `highlight.test.ts` windows for a loop, a landing and a photo finish; captions pass `BANNED_CLAIMS`;
  the clip chunk stays lazy.

### F9. Ghost duels

**Player:** Time Trial results get "⚔️ Dare a friend". Opening a dare shows a full-screen card ("Zyg dares you:
Kitchen Counter, 1:24.07", the sender's cat, TAP TO RACE) instead of a banner over the grid, and the flyover is cut
to 1 s. The race is a 1v1 against the ghost only, with a "Race the pack" toggle on the card for the old behaviour. A
HUD pill shows the live gap to the ghost ("+0.42" red, "−0.18" green). Results: "Lost by 0.31 s" with a big Rematch
(same ghost), or "You beat Zyg by 1.2 s" with "Send it back".

- The ghost-only race keeps the shadow world in lockstep as today (the ghost needs its own field to replay); the
  visible race has one kart. Gap from the ghost's logged lap + s progress, mirrored tracks and branches use the main
  loop's lap fraction.
- Old `#g=` links with an older SIM_VERSION open as the target-time race they open as today, now on the card.
- **Acceptance:** `dare10` fixture opens as a target-time race with the notice; a v11 TT dare and a v11 race dare
  both open as a duel, the ghost finishes at its encoded time (±1 tick); Rematch restarts with the same ghost.
- **Tests:** `share.test.ts`, `ugc-dare.test.ts`, `e2e/share.spec.ts` (TT dare round trip, duel, pack toggle).

### F10. Doodles that start spectacular

**Player:** A fresh doodle automatically gets a loop on its longest straight and a jump gap (plus a tunnel when there
is room); "Spice it up 🎲" re-rolls stunts and items; the hint says "Stunts added: drag them or roll again". A
"Surprise track" button makes a valid random doodle in a random theme with stunts, ready to race. Test-driving records
your best lap into the share link, and anyone opening it sees "Maker's lap 0:24.31, beat it", a live lap delta and
"You beat the maker by 0.6 s"; re-sharing carries your own lap.

- Placement goes through `ugc/editor/pieces.ts` snap and `validateSetPieces`, seeded from the doodle so it is
  reproducible; the random loop generator moves from `src/test/doodles.ts` to `src/ugc/editor/surprise.ts` (the test
  helper re-exports it). Track code v3 stays the format; `creatorLapCs` is already in the codec.
- **Acceptance:** 50 surprise seeds all validate, drive-check and round-trip through the track code; auto-stunts are
  placed on ≥ 90 % of finger doodles from the e2e set; a code without a lap shows no target; the lap is accepted only
  from a completed test-drive lap.
- **Tests:** `surprise.test.ts`, `pieces.test.ts`, `track-code.test.ts`, `e2e/editor.spec.ts`.

### F11. Wild Card mutators and the Daily mutator

**Player:** Single race gets a Wild Card row (Catnip Rain, Zoomies+, Box Party, Cucumbers Only, Night) and a
"Surprise me" chip. From a cutoff day the Daily Cup also deals one mutator, shown on the grid banner ("Daily Cup #9 ·
Box Party"). Night turns a day theme after-dark: stars, the warm fill light night themes use, kart headlights.

- The sim already honours the item modifiers and the ghost header carries them, so dares on a mutator replay exactly.
  Night is render-only. Days before the cutoff keep their `dailySetup` and `isDailyRace` keys.
- **Acceptance:** 72-race harness per mutator: field finishes, wall-hit limits hold; Cucumbers Only is offered from
  100cc only if the 50cc run shows the player bot's podium under 50 %; Night passes the colour-blind and
  high-contrast screenshots.
- **Tests:** `daily.test.ts` (pre-cutoff days unchanged), modifier label test, `e2e/modes.spec.ts` mutator race.

### F12. Style score and stunt challenges

**Player:** Each race gets a Style score (loops, clean landings, wall rides, tricks, pink mini-turbos, combos) with a
personal Style best per track. Daily challenges gain stunt goals ("Ride 3 loops", "Hit a STUNT COMBO x3", "Land 2 clean
jumps"), new achievements ("Loop-de-Meow", "Combo King"), and the shortcut challenge names the shortcut ("Take the
billboard cut twice").

- RaceStats gains `loops`, `walls`, `cleanLandings`, `bestCombo`, `style` (Engine, counted in `race-stats.ts` from
  events with the `juice/stunts.ts` tally rules). Stunt challenges only roll on tracks that have the piece (Yarn has no
  loop). `ACHIEVEMENT_IDS` is append-only.
- **Acceptance:** `race-stats.test.ts` counts; challenge generator never offers a loop goal on Yarn; old saves
  migrate.

### F13. Faster to the grid, fairer cups

**Player:** Menu tiles become one-tap starts ("Grand Prix ▶ Kibble · 100cc") with a small "change" link; the last
racer, class and cup or track are remembered per mode. The countdown digit stands alone; the Pounce hint sits in a
strip below and flashes green "POUNCE!" on a good start. Inside a Grand Prix, finishing 6th–8th and more than 8 s back
eases the next race's AI skill by one notch (and a win restores it); the standings say "The cats eased off: catch
them!".

- The comeback lowers `Personality.skill` in the cup's racer list (no RaceConfig field, no sim change). GP only; Daily
  Cup and dares are never eased.
- **Acceptance:** first visit still starts the first race straight away; menu → racing in 1 tap for a returning
  player; a scripted 8th-8th run shows the eased notice and a lower mean AI skill in race 2.
- **Tests:** `modes.test.ts` (memory per mode, ease and restore), `e2e/modes.spec.ts` updated for the new path.

### F14. Battle you can read (part Sim, Engine)

**Player:** Furniture between the camera and your kart fades to 30 %. A small arrow at the screen edge points to the
points leader. In the last 30 s the HUD shouts "DOUBLE POINTS", the music speeds up, and pops and steals score 2.

- Double points is the Engine's sim change in `modes/battle/rules.ts` (from tick `BATTLE_TICKS − 1800`), with a
  `frenzy` event at that tick. The fade (camera ray against furniture boxes, material opacity) and the arrow are render.
- **Acceptance:** draw calls on the Rug stay ≤ 80 with faded furniture; battle determinism test with the frenzy
  scoring; the 18-round stall check still holds (longest stall ≤ 3 s).

## 4. Rejected or deferred

| Idea | Why not now |
|---|---|
| Hop-bash shove | Sim balance risk (wall pinning, AI bullying at 50cc) for a small gain; revisit with a playtest |
| Squeaky Mouse item | New item = new weights column and pack-hit retune that SIM_VERSION 7 just settled |
| Last Cat Out, Fish Frenzy modes | M-cost each, use the last ghost-header mode slots; mutators give variety cheaper |
| Weekly Wild Cup | Depends on F11 being played first; next iteration |
| Golden Fish hunt, mastery stars, mastery cosmetics | Good replay content, but M-cost and needs F12 data; next iteration |
| Knock It Off props | Lovely, but per-track spot authoring on 6 tracks; next iteration |
| Final-lap item frenzy | Changes every race's item odds; F5 already adds final-lap tension without touching odds |
| Replay theatre, "watch the finish" replay | M-cost, scrub memory risk; F8 clips cover the share need |
| Remix lineage, decor stickers | Track-code changes for little immediate fun |
| Doodle of the Day | Needs 30 authored doodles; F10 Surprise track covers fresh tracks |
| Ghost taunt emoji | Small; fold into a later share pass |
| Victory fireworks | Only the margin banner ships (F4); particles add little over confetti |
| Laundry Spin pack racing at 100/150cc | Track/AI tuning issue, not juice; flagged for a tracks pass (known gap) |

## 5. Engine step (one agent, one commit, before the lanes)

All shared and frozen-file changes, one `SIM_VERSION` bump 10 → 11, golden hashes regenerated
(`core/sim/race.test.ts`, `core/sim/stunt.test.ts`, battle determinism).

1. **Sim (F1, F3, F14):** `AI.bandRampTicks` and the ramp in `items-ai/ai/rubber-band.ts`; `BOOST.trick.window` 0.45
   and `BOOST.trick.pre` 0.12, `KartState.trickBuf` (types, hash, `core/sim/kart.ts`), AI trick rate kept per skill
   (`items-ai/ai/driver.ts`); battle double points and the `frenzy` event (`modes/battle/rules.ts`, `types.ts`).
2. **Contracts:** `RaceStats` set-piece fields and their counting (`types.ts`, `core/app/race-stats.ts`);
   `finishMargin(result, me)` pure helper in a new `core/app/finish.ts`; `MuxContext.edgeL / edgeR / onRail` filled by
   `core/app/shell.ts`; a `smartSteer` setting in `core/app/settings.ts` (default: on for touch) and its save
   migration; new empty string table `src/ui/strings/share.en.ts` registered in `ui/install.ts`.
3. **Versions:** `dare10` stays a target-time fixture; add a `dare11` fixture generator note; the "another version"
   path covers 10. README "Known gaps" SIM_VERSION line updated.
4. **Checks:** `npx tsc --noEmit`, `npx vitest run`, `npm run build` (budget), `npm run e2e`; then the lanes branch.

Engine acceptance: F1 and F3 sim acceptance from section 3; goldens regenerated once; no lane needs to touch any
file in this list.

## 6. Lanes (parallel after the Engine)

Disjoint ownership; full table in `formula-meow/LANES.md` "Iteration 4". A lane that needs a file it does not own
writes a contract request in its final report. Lanes never edit `SIM_VERSION`, `types.ts`, `hash.ts`,
`core/sim/**`, `core/app/**` (except where listed) or another lane's string table.

| Lane | Features | Owns (summary) |
|---|---|---|
| juice | F3 view, F4, F5, F6 | `src/juice/**` except `juice/vfx/tunnel-fx.ts`, `src/core/hud/**` except `results.ts`, `src/ui/strings/core.en.ts` |
| feel | F2, F11 Night render, F14 fade | `src/core/input/**`, `src/core/render/**`, `src/core/camera/**`, `src/core/track/themes.ts`, `src/juice/vfx/tunnel-fx.ts`, `src/ui/screens/settings.ts`, `src/ui/strings/feel.en.ts` |
| modes | F11 rows and Daily mutator, F12, F13, F14 HUD, Help text | `src/modes/**`, `src/progression/**`, `src/content/{cups,cosmetics}.ts`, `src/share/daily/**`, `src/ui/strings/{modes,progression}.en.ts` |
| share-ugc | F7, F8, F9, F10 | `src/share/**` except `daily/`, `src/ugc/**`, `src/test/doodles.ts`, `src/core/hud/results.ts`, `src/ui/strings/{share,tracks}.en.ts` |

Merge order: feel → juice → modes → share-ugc (share-ugc reads juice's outcome lines through `finishMargin` and the
boost-chain tally exports, which the juice lane must keep stable).

## 7. Budgets and gates

- Build ≤ 450 kB gzip initial JS (`npm run build`); new chunks lazy where possible (clip, editor surprise).
- Draw calls ≤ 120 (target: no lane adds more than 3 per race frame; Rug ≤ 80 with faded furniture).
- 60 fps on the phone viewport; the low quality tier drops ribbons, fire trail and paw rings' pulse.
- Every new string through `t()`; honest copy: only measured numbers from this device and this race (margins,
  gaps, laps, counts); no player counts, no rankings beyond the device.
- Reduced motion: no freezes, flashes, FOV changes or edge glows; stamps and text still show.
- Old links: v1/v2/v3 track codes open; dares, ghosts and records stamped ≤ 10 open as target-time races with the
  notice. `review:v3` legacy codes pass.
- Final integration: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run e2e`, `npm run review:v3`,
  re-run the playtest probes for P1, P2, P3 and the 54 % close-finish figure, then `npm run build:client` and commit
  `client/public/formula-meow-game`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Smart Steer fights a deliberate line or drift | Bounded at 0.35 lock, off while drifting into the bend and on rails, Settings toggle, unit tests |
| Band ramp makes 50cc too hard or 150cc too easy | 72-race harness gates (section 3, F1); ramp length is one tuning number |
| Trick buffer changes launches | Swallowed hop within the pre-window; landing-spot test |
| Too much text and noise in the pack | HUD priorities, callouts only at x3+ chains, announcer cooldowns, voice budget |
| Results tray breaks e2e selectors | Keep every `data-act` and label |
| Ghost-only dare diverges | Shadow world unchanged; only the visible field changes; ±1 tick finish test |
| Night readability, colour-blind mode | Screenshot review in both a11y modes |
| Draw calls from faded furniture or ribbons | Instancing, reuse of speed-lines pass, Rug ≤ 80 gate |

## 9. What shipped (final pass, 2026-10-22)

Branch `feat/formula-meow`: the Engine commit (`9404a616`, SIM_VERSION 10 → 11), the four lanes merged in the planned
order (feel → juice → modes → share-ugc, `9e4dbdea`…`c85003f9`), the integration fixes (`7f469b84`) and this final
pass (playtest must-fixes and tuning). Nothing pushed.

### Features

| # | What the player sees | Status | Tests |
|---|---|---|---|
| F1 | From pole you lead into turn 1: the field's catch-up ramps in over 6 s after GO | shipped | `rubber-band` ramp cases, goldens, `balance.test.ts` |
| F2 | Smart Steer on touch (Settings toggle), softer stick curve, readable tunnels on phones | shipped | `mux.test.ts`, `smart-steer.test.ts` (solo novice wall gate), `e2e/feel.spec.ts` |
| F3 | A pulsing paw TAP! decal on every ramp and jump lip, laid flat on the run-up; tap around the lip for a trick | shipped; the decal was upright in the playtest and covered the kart | `stunt.test.ts`, `juice.test.ts` (`lipMatrix`), `e2e/stunt-juice.spec.ts` |
| F4 | Overtake punch "+1 ▲", PHOTO FINISH / WON BY with the real margin | shipped | `juice.test.ts`, `audio.test.ts`, e2e photo stamp |
| F5 | Slipstream ribbons and ring, DODGED!, final-lap gap chips with edge glow ("SIDE BY SIDE!" under 0.05 s), comeback / steal calls, FASTEST LAP, pass-by zips | shipped | `juice.test.ts`, `hud.test.ts` |
| F6 | BOOST CHAIN ×n, ON FIRE (badge now under the place, away from the left thumb), "Best chain" on the results | shipped | `juice.test.ts` |
| F7 | One results card on a phone: headline, Next / Rematch, Dare, "•••" tray; the clip button pulses only for a photo finish, a combo ×3+ or a chain ×4+ (loops alone no longer count) | shipped | `share.test.ts`, `highlight.test.ts`, `e2e/share.spec.ts` |
| F8 | 12 s clips that pick the loop, landing, combo or photo finish, with a caption sticker; stunt brag in the share text | shipped | `highlight.test.ts`, `e2e/clip.spec.ts` |
| F9 | Full-screen dare card (fits a landscape phone, the grid's PRESS ANY KEY waits behind it), 1v1 ghost duel with a live gap pill ("ghost stopped" when an old run never finishes), Rematch / Send it back, TT dares | shipped | `duel.test.ts`, `ugc-dare.test.ts`, `e2e/share.spec.ts` |
| F10 | Doodles start with stunts, Spice it up, Surprise track, the sender's lap to beat, now carried with its class (`&cls=`) and shown only at that class | shipped | `surprise.test.ts`, `track-code.test.ts`, `e2e/editor.spec.ts` |
| F11 | Wild Card mutators ("optional: shake up the race") and the Daily mutator; Night draws a moon (a crescent on Café) | shipped | `daily.test.ts`, `mutators.test.ts`, `e2e/modes.spec.ts` |
| F12 | Style score (now weighted toward tricks, pink turbos and combos), stunt challenges, Loop-de-Meow and Combo King | shipped | `race-stats.test.ts`, `style.test.ts`, `achievements.test.ts` |
| F13 | One-tap menu tiles, a Pounce strip under the countdown digit, a gentler GP (eased cats); no standings arrows after race 1 | shipped | `modes.test.ts`, `e2e/modes.spec.ts` |
| F14 | Battle: furniture fades, a leader arrow, DOUBLE POINTS (now under the held item's name) and faster music in the last 30 s | shipped | `battle.test.ts`, `e2e/feel.spec.ts`, `e2e/modes.spec.ts` |

### Playtest must-fixes (final pass)

| Must-fix | Fix | Test |
|---|---|---|
| Landscape duel countdown: "Race Zyg's ghost" banner on the Pounce hint | no banner in a duel (the gap pill names the ghost); the banner sits bottom centre in landscape | `e2e/share.spec.ts` landscape test |
| Landscape dare card cut at the bottom | compact landscape card | same test (card and TAP TO RACE inside 390 px) |
| Laundry sheet hid the kart ~0.3 s a lap | camera-ray screen-door fade (`alphaHash`) on the sheet | `hazard-view.test.ts`, `e2e/feel.spec.ts` Laundry test |
| 50cc too hard without drifting | cats ahead of the player ease off more at 50cc (`bandKAhead` 0.04, `bandDownAhead` 0.3); novice bot mean place 7.4 → 4.2, podium 0 → 40 % (60 races) | `balance.test.ts` novice gate |
| Clip prompt after every loop track | loops alone never prompt | `highlight.test.ts` |
| Achievement toast over the results buttons | toasts drop in at the top while results are up | `e2e/share.spec.ts` (portrait and landscape) |
| Maker's lap ignored class | links carry `&cls=`; the target shows only at that class | `track-code.test.ts`, `e2e/editor.spec.ts` |
| DOUBLE POINTS over the item name | chip placed under the name (phone, landscape, desktop) | `e2e/modes.spec.ts` battle test |
| Dare card over PRESS ANY KEY | the prompt and banner hide while the card is up | `e2e/share.spec.ts` |
| TAP! ring covered the kart | laid flat on the run-up, ending at the lip | `juice.test.ts` |
| Desktop 8th place row under the fade | the list scrolls the player's row into view (or drops the fade) | `e2e/share.spec.ts` |
| Grid label pill on the kart (1440x900) | bottom edge on desktop | `e2e/share.spec.ts` projection test |
| GP arrows after race 1 | no arrows, rows open in their real places | `e2e/modes.spec.ts` |

Tuning also applied: "Next up: … unlocked" only after a top-5 finish; no Rewards button when nothing waits; singular
stunt counts; seconds never wrap away from their number; NO ONE AHEAD only for a leader; no free Untouchable /
Pacifist in a 1v1 duel; "SIDE BY SIDE!"; duel results rank you out of two and put Rematch above Next; the first TT
record is said once; small callouts within 0.9 s of another are dropped; other cats right at the lens are hidden;
"by you" on your own track in the Tracks sheet; the `dare11` fixture is now a real SIM_VERSION 11 run.

### Versions

One SIM_VERSION bump in the iteration (10 → 11). The final pass changed 50cc races that have a human player (the band
for the cats ahead of the player) without a second bump: no SIM_VERSION 11 build has shipped, so no v11 link exists
outside dev builds. AI-only races are unchanged and the three golden hashes pass as they were. The trailer pipeline
(`formula-meow/review/trailer`) was probed on SIM_VERSION 10 and needs a re-probe before a re-render.

### Not done (next iteration)

Softer 150cc band after the opening laps (sim), item boxes as boosts in a duel (sim), a target time for SIM_VERSION ≤ 10
dares (the link has no trustworthy finish time), translucent battle balloons near the camera, a loop from auto-stunts
on every hand-drawn doodle and stickers that never stack, "Name it" on the first share.
