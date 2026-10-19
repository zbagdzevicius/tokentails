# Pawlegends gaps and plan: Wild Rift, MLBB and 2025–26 mobile MOBAs (2026-10-19, from SIM_VERSION 9)

Paths are relative to `pawlegends/` unless noted. Sim units: 30 ticks a second, mm, `Bp` = basis points (10000 = 100%).
The backend is `backend/` in this same worktree (`tokentails-pawlegends`, branch `feat/pawlegends`), not a separate
repo. Backend items stay in their own lane, and the `tokentails-app` checkout is never edited.

## 0. What the code says (checked before planning)

These checks change the plan:

| Claim | Code | Effect on the plan |
|---|---|---|
| Target lock needs no sim change | True. `Op.Attack {id}` and `Op.Cast {…, id}` exist (`src/sim/api.ts`) | Wave A |
| Timers need no sim change | True. `MatchClock.nextPhaseIn` already gives Sunset and Sudden Death. `respawnIn` is set on dead heroes of both teams. A camp clear shows as a `buff` event `'pack'`. Pudding respawn = the `pudding` escort-leave event + `PUDDING.respawn` (3600). The hash covers world arrays only (`src/sim/hash.ts`) | Wave A |
| Bots take talent option 0 | True for in-sim bots (`offerTalent` in `src/sim/heroes/talents.ts`). The headless player-bot also takes 0 (`src/sim/bots/index.ts`) | Branches in option 1 go untested on both sides. Seeded picks change every bot's talents, so they need v10 |
| "All 48 talents only change numbers" | 47 of 48. Clem's Second Wind is the only `hasTalent` hook | Every branch is new bespoke kit code, not data |
| Treat Track has 10 rewards | 9 (`src/meta/treats.ts`) at 300 XP a chest: about 22–27 matches | Same conclusion, sooner cliff |
| Give shelter champions 2 coats each | **Blocked by design.** `wardrobe()` returns only Classic for `SHELTER_HEROES`. They wear their real card's coat (`src/render/cosmetics.ts`) | Different rewards for champions (A1) |
| Cacklejaw ignores coats | True. `src/render/chars/specs.ts` calls `lookCoat` for clem, sage and brutus only. His two Track coats (`spotted`, `dusk`) already ship and do nothing. I could not find a GDD §13 entry for it | Fix as its own item (A0) |
| Narrow the Sudden Death decay to 2–4% to cut rubber-banding | **Wrong direction.** The decay grows per takedown the team *trails* by (`decayPerTakedownBp`, `src/data/timeline.ts`), so it rewards the leader | Leave it, or widen it. The rubber bands are catch-up XP, `campBehindBp`, `enemyComeback` waves and Nine Lives |
| Catch-up XP can be keyed by difficulty in `xp.ts` | `XP.catchUp*` is global. Per-difficulty values live in `DIFFICULTY_RULES` (`src/data/bots.ts`) | New `DifficultyRules` fields |
| Bot brain adds "+60% of the top utility score" | The brain is a **priority cascade** (retreat > fight > back off > Pudding > camp > lane), not a numeric scorer (`src/sim/bots/brain.ts`) | A ping is an override layer at a fixed priority |
| Lane roles are missing | Bots already lane by slot (`roleOf = id % 3`): slot 0 is the human in Sunny, ally 1 goes to Puddle, ally 2 roams | A "Puddle: solo lane" hint would put two heroes in Puddle and leave Sunny empty. Bots must swap lanes first |
| Pings fit "well under" the 40k cap | The input stream has a single byte budget (`MAX_INPUT_BYTES` 30,000 in `src/data/limits.ts`). A joystick at the move gap already reaches about 39,600 characters by design, and past the budget the sim **stops applying commands** | Cap pings per match and raise the budget in both copies |
| Mutator field: "the DTO must keep it" | `canonicalRecord` copies only `RECORD_KEYS` (`backend/src/pawlegends/pawlegends-live.ts`), so the worker and the digest would drop it. `$min pawlegendsFastestWin` would also take 4-minute Sunset Rush wins | Add it to `RECORD_KEYS`, the DTO and the digest. Leave mutator wins out of the fastest-win record |
| Dual v9/v10 verifier is small | The version check is in `pawlegends-live.ts` *and* `checkReplayShape`. Each vendored bundle is about 294 KB | Effort M (1–2 days): versioned vendor dirs plus dispatch in the worker |
| Adding tricks is data | Bot tricks are drawn from `TRICK_IDS` by seed (`fillPicks`). A new trick changes every bot's trick and needs bot cast logic. Whisker Ward changes `src/sim/map/brush.ts`, which bots also see through (`sense.ts`) | Purr-ify only in Wave B. The ward moves to Next with vision |
| Grade formula from `SlotStats` | `SlotStats` has only K/D/A, hero damage, tower damage and level. There is no damage taken, heal, shield or objective stat | Tanks (Brutus, Lambo) and the support (Gabė) would grade C. The formula must weight by role |
| Ladder: halve losses on S/A | `impactOf` already reduces a loss by up to 50% (`src/meta/ladder.ts`) | Replace `impact` with the grade. Do not stack the two |
| PostHog measures | Consent-gated (`src/analytics/posthog.ts`), so it sees a biased subset | Primary measures are the headless gates and the backend's verified `pawlegendsMatches`. PostHog is secondary |

## 1. Verdict

We lack **agency and depth inside the match, plus a reason to come back next week**. Content is not the gap.
- **The player can't lead.** Two allied bots, and no way to tell them anything.
- **Kits don't change shape.** 47 of 48 talents only change numbers.
- **Close matches are decided for you.** Catch-up XP, underdog waves and the camp bonus let a team that loses its fights still win.
- **Nothing rotates, and the meta skips our revenue heroes.** One mode, one objective, a 9-chest Treat Track, and quests and Track that skip the four shelter champions. Those champions drive Champion Meet, our only revenue path.

We already match or beat Wild Rift and MLBB on short matches, no pay-to-win, direct purchase only, death recap, end-cause
line and staged onboarding. The two items most likely to move fun from 5.2 toward 8 are **command pings** and **level-6
branches**. The rest is retention and teaching.

## 2. Gap matrix (summary)

Severity: **critical** blocks fun 8 or launch quality; **high** is a strong lever; **medium** is post-launch; **DNC** = do not copy.

| Area | Gap vs WR / MLBB / others | Pawlegends today | Severity | Plan |
|---|---|---|---|---|
| Social / agency | Pings and quick commands to bot allies (WR, MLBB pings; HoK AI Commander; PUBG Ally) | None | critical | B1 |
| Kits | Ability shape choices (Unite move branches; WR/MLBB builds) | Number talents | critical | B6 (2 heroes at launch) |
| Progression | Reward track that never ends and covers every hero | 9 chests; skips the shelter champions | critical | A1 |
| Comeback | WR cut catch-up XP; kills should decide on Normal/Hard | Strong rubber bands | high | B3 |
| Targeting | Hero lock, target priority, last-hit and tower buttons (MLBB Hero Lock / Advanced Aim, WR priority) | Auto chain only | high | A5 |
| Objectives | Timers on the HUD and minimap | Chips only in matches 1–3 | high | A4 |
| Results | Grade, MVP, MVP on the losing team (MLBB medals, WR grades) | K/D/A rows | high | A2 |
| Session | Rematch (Unite), surrender (WR, Unite) | Dare link only | high | A3, B2 |
| Modes | Rotating mutators (WR/MLBB arcade, Brawl modifiers) | One mode | high | N0 (launch +1 week) |
| Loadout | Battle spells (MLBB 1 of 12, WR 2) | 3 Paw Tricks | high | B5 Purr-ify, N5 more |
| Map | Repeating stacking objective (WR drakes) | Pudding only | high | N3 |
| Roster | Varied roster; no forced mirrors | 2 dogs for 3 slots: dog teams always duplicate | high | N4 |
| Replay | Replay viewer (missing in WR) | `runReplay`, no viewer | high | N1 |
| Live-ops | Remote config and an event calendar | Date-seeded daily quests only | high | N2 |
| Ranked | Protected low tiers, loss protection | Local ladder | medium–high | N6 |
| Practice | Training ground (MLBB) | None | medium | N7 |
| Lanes | Role lanes, solo-lane XP | Fixed lane by slot | medium | B1 lane swap, N9 |
| Vision | Fog and wards | Bushes only | medium (later) | Later |
| Monetization | Direct-purchase ladder | $5 cat = skin on all 8 | parity | Keep |
| Monetization | Gacha, stat skins, held items, pass, energy | None | DNC | Won't |
| Tech | Runs on cheap phones | Real devices not measured | critical (gate) | G-Dev |

Sources: [Wild Rift patch notes](https://wildrift.leagueoflegends.com/en-us/news/game-updates/),
[MLBB news and patch notes](https://m.mobilelegends.com/en/news),
[Pokémon UNITE news](https://unite.pokemon.com/en-us/news/),
[Honor of Kings news](https://www.honorofkings.com/),
[Brawl Stars blog](https://supercell.com/en/games/brawlstars/blog/),
[PUBG Mobile news](https://www.pubgmobile.com/en-US/news.shtml).
The version-specific claims (WR 7.0 catch-up cut, Unite rematch Dec 2025, HoK AI Commander "+30% retention", which is the
vendor's own claim) come from the inventory and were not re-checked in this pass. Check the linked notes before quoting them.

## 3. Now: before the Nov 12 launch

| When | What |
|---|---|
| Oct 20–24 | Wave A, no sim change |
| Oct 25 – Nov 3 | Wave B, one bump to SIM_VERSION 10; freeze Nov 3 |
| Nov 4–6 | Gates, `vendor-sim` with the dual verifier, backend deploy |
| Nov 6–8 | Scripted round 3 |
| Nov 10 | Human playtest and the real-device gate |
| Nov 12 | Launch (v10) |
| Nov 19 | v11: Weekly Twist mutators (N0) |

### Launch gates (run in parallel; they outrank everything below)

| Gate | What | Owner |
|---|---|---|
| G-Pay | Stripe test-mode checkout end to end through `open-cat` (POC item 22). Revenue is zero until it passes | You, backend lane |
| G-Dev | iPhone 11, Pixel 6a and Iris Xe on the Low and Med tiers: FPS, heap, cold load and map readability (POC 27), by Nov 10 | You |
| G-Doc | Rewrite LAUNCH.md §a.5 (playtest script and survey Q8 still describe the retired Starter/Founder store) | AI, S |

### Wave A (no sim change; `npm run determinism` hash trails stay identical)

**A0. Cacklejaw coats.** S (2–4 h). Wire `lookCoat('cacklejaw', …)` into his spec in `src/render/chars/specs.ts`. Listed on its own, not as a silent side fix: his two Track coats ship today and do nothing.

**A1. Treat Track for all 8 heroes, 30 chests, then a loop; quests for all 8.** S–M (1.5 days plus data).
- `src/meta/treats.ts`: 9 → 30 rewards.
  - **Cat and dog originals** (Clem, Sage, Brutus, Cacklejaw): +1 coat each (4) and 4 palette variants of the earlier coats.
  - **Shelter champions** (Lambo, Avietė, Bengas, Gabė): no coats, because they wear their real card's coat. Each gets a title (for example "Lambo's Pal"), a frame, and a **"Meet the real cat" postcard**: the licensed Pink Paw photo and a short story, shown in the profile (4 × 3 = 12).
  - 2 general emotes (if animation is cheap; otherwise 2 more palette variants).
- **Never free:** anything that owning the $5 card gives (element chroma, Companion Kitten, card badge, card skin). The free track must not cannibalise the one paid item.
- **Pick your next target:** a chest screen to choose the hero whose next reward you are working toward, with "N matches to go". The order inside each hero is fixed (Unite License Journeys, deterministic part only).
- **After chest 30:** loop through a fixed list of palette variants.
- `src/meta/quests.ts`, 11 → 17: `win_lambo`, `win_aviete`, `win_bengas`, `win_gabe`, "Play a shelter champion", "Calm Pudding twice". "Earn an A grade" follows once A2 is calibrated. Daily pick: date seed plus a round-robin hero slot, so each hero comes up every 8 days.
- **Compliance:** a quest may lead to a champion, but its reward is never an offer and never opens one. The offer rules stay as they are (`src/money/offer.ts`: not in session 1, once a page session, lobby and results screens only, none in app builds).
- **Measure:** unit tests (every hero in the pool; the Track never runs dry); D7 versus the pre-launch cohort; share of players with 3 or more champion matches by D7; Champion Meet impressions and the `open-cat` rate (**web only**, since app builds hide purchases).

**A2. Grade (S/A/B/C), MVP, "Best on your team" on a loss.** S–M (1.5 days). Risk: calibration.
- A pure `src/meta/grade.ts` on `MatchResult.stats`, weighted by role. KP = (K+A) / max(1, team kills); D = 1 − deaths/(deaths+3).
  - Carry roles (marksman, mage, assassin, fighter): `0.35·KP + 0.25·heroDmgShare + 0.20·towerDmgShare + 0.20·D`.
  - Tank and support (Brutus, Lambo, Gabė): `0.50·KP + 0.10·heroDmgShare + 0.10·towerDmgShare + 0.30·D`, until v10 adds `damageTaken` and `healShield` to `SlotStats` (part of B0).
- Starting thresholds: S ≥ 0.72, A ≥ 0.55, B ≥ 0.40, otherwise C. Calibrate **per role**: `npm run match -- --difficulty normal --profile normal --seeds 400 --json`, with each hero as the human. Target: about 12% S, 30% A, 35% B, 23% C for every role, and at least 25% of losses graded A or S.
- Treat XP: S +40, A +25, B +10. Never catnip. Ladder: the grade replaces `impactOf` in `recordLadder` (S/A loss = half points). It does not stack on top.
- **Measure:** `grade.test.ts`, the per-role distribution check, and round-3 comments on losses.

**A3. "Run it back" and "Switch cat".** S (half a day). Same hero, trick and difficulty with a new seed, or back to the pick screen with the difficulty kept (`src/app/matchSession.ts`, `src/app/app.ts`). A rematch stays in the same page session, so it never shows a second offer card. Measure: `rematch_click` and matches per session (+0.5).

**A4. Objective and respawn timers.** S (1 day).
- A top-centre "next objective" chip in every match: "Pudding in 0:42", "Calm Pudding!", "Escort: 1,840 HP", "Your rats 0:18", "Sunset in 1:10", "Sudden Death in 0:45".
- Minimap countdown rings, and a portrait strip with death timers from `respawnIn`.
- Data: `MatchClock.nextPhaseIn`, the `pudding` and `buff 'pack'` events and the constants in `src/data/{camps,pudding}.ts`. Enemy rats show only once a clear has been seen, as in WR and MLBB.
- **Tapping a chip sends the matching ping once B1 lands** (one tap, no wheel).
- Files: `src/ui/hud.ts`, `src/onboarding/objectives.ts`, `src/ui/minimap.ts`. Measure: a Playwright chip spec; round-3 testers stop saying "nothing says why".

**A5. Touch target lock and priority.** M (2–3 days). Risk: touch UX.
- Tap an enemy portrait (from the A4 strip) or an enemy hero to lock it for 5 s, or until it dies or goes beyond 9 m. While locked, Attack sends `Attack{id}` and smart casts pass `id` when the target is in range.
- Setting "Target first": Heroes / Lowest HP % / Closest (default Heroes). Optional last-hit and tower buttons, off by default (MLBB Advanced Aim).
- Files: `src/input/touch/{assist.ts,touchControls.ts,touchLayout.js}`, `src/input/targeting.ts`, `src/ui/settings.ts`, `src/ui/overhead.ts`.
- Measure: `assist.ts` unit tests, a Playwright touch spec, and the share of attacks that hit a minion while an enemy hero is in range (−40%).

**A6. Small items.** S (1 day).
- First win of the day: +150 Treat XP by local date. No streak that resets, and no catnip.
- Loading screen: the Bond badge and the match count on this hero.
- Pick screen: the role label only. **No lane hint until B1's lane swap lands**, because bots lane by slot.
- Positive bot barks on the human's takedowns and assists (`src/render/announcer.ts`).
- Measure: D1 return and the share of sessions that reach a first win.

### Wave B (one bump to SIM_VERSION 10, frozen Nov 3)

Bump steps:
1. `src/sim/version.ts` → 10, then `npm run lint:sim`, `npm run test`, `npm run determinism`.
2. `npm run match -- --gate balance`: each hero 46–54%, cat side 47–53%, median length 6:30–8:30, no safety ends. Then the `fun1`, `fun2`, `novice` and `parked` gates.
3. `npm run vendor-sim` and `vendor-sim:check`, with v9 kept frozen beside v10.
4. Backend deploy, then the `client/public/pawlegends-game/` build (`npm run build:client`), in that order.
5. Scripted round 3.

The sim files (`world.ts`, `brain.ts`, `casts.ts`) are shared, so Wave B lanes must merge in sequence (B0 → B3 → B1 → B2 → B5 → B6), and balance runs go one after another.

**B0. Prerequisites.** M (2 days). Do these first.
- **Seeded bot talents:** `offerTalent` picks 0 or 1 from a forked stream (`rng.fork('talent:'+slot)`), so unrelated draws don't move. Headless `--bot-talents first|seeded|branch` also covers the player-bot.
- **Replay shape v10:** `ReplayRecord.mutator?: 'none'` (only `'none'` accepted in v10), so the backend changes once. Backend: add the field to `PawlegendsReplayDto`, `RECORD_KEYS` and the digest. Leave `mutator !== 'none'` out of `pawlegendsFastestWin` and catnip (see Your call 1).
- **`SlotStats` += `damageTaken`, `healShield`, `objective`** (for A2 v2 and ranked).
- **Funstats** (`tools/lib/funstats.mjs`): win rate when 5–9 or 10+ takedowns behind at the end, the human's level gap at 6:00, and the share of pings obeyed.
- **Dual verifier** (backend lane): `vendor-sim` writes `vendor/pawlegends-sim/v9` and `/v10`; `pawlegends-live.ts` and the worker choose by `simVersion` for 30 days. This makes the deploy order safe, and it matters most for app builds and cached tabs that keep posting v9.

**B1. Command pings that bots obey, plus a lane swap.** M (4 days). The top fun lever.
- Sim: `Op.Ping = 9` (`kind u8, qx u16, qy u16, id u8`, 7 B). Only slot 0 can send it.
  - Kinds: Go here, Group on me, Take Pudding, Push Sunny, Push Puddle, Defend base, Fall back, Focus hero.
  - The sim takes one ping per 45 ticks and **at most 60 a match**; the client debounces before logging. `MAX_INPUT_BYTES` +600 (to 30,600, and 40,800 characters) in `src/data/limits.ts`, `shared/caps.ts` **and** `backend/src/shared-contracts/caps.ts`, so a heavy joystick player who pings is never cut off before 11:00.
- Bot brain: a ping sets an order on allied bots (slots 1–2) with a TTL, slotted **below** retreat and "fight back when hit" and **above** Pudding, camp and lane. Group, Push, Defend, Pudding and Go here last 450 ticks; Focus doubles the foe preference for 150 ticks; Fall back forces retreat for 240 ticks. A bot under 35% HP or napping refuses and barks "Healing first!". Enemy bots never see pings. New events: `ping` and `bark` (the text is chosen at render time).
- **Lane swap:** if the human stays in Puddle from 0:40, ally slot 1 takes Sunny. Then A6 can show lane hints.
- UI: desktop, hold G for a radial and Alt-click to Focus. Touch: one paw button by the minimap opens a 6-slice wheel; long-press the minimap for "Go here"; long-press a portrait to Focus; tap an A4 chip for its ping. Tip in match 2.
- Measure: a headless `pinger` profile on Normal should win 5–10 points more than `normal` (over 15 means pings are mandatory, so tone them down). Balance gates run without pings. Also: pings per match, share obeyed, and the round-3 veteran depth score.

**B2. Forfeit.** S (half a day).
- `Op.Forfeit = 10`. The sim accepts it from tick 7,200 on Normal and Hard and from 5,400 on Easy, never on Rookie; matches 1–3 are blocked on the client.
- `MatchResult.reason += 'forfeit'`; `outcome` stays `'lost'`.
- 20 Treat XP, no quest progress, full ladder loss. Catnip is paid on wins only, so nothing changes there.
- Measure: forfeit rate by difficulty. Over 15% on Normal means matches feel lost too early.

**B3. Less rubber-banding on Normal and Hard.** S–M (1 day plus gate runs). Rookie and Easy are unchanged.
- **First, an ablation run:** switch off each comeback source in headless runs (catch-up XP, `campBehindBp`, `enemyComeback` waves, Nine Lives) and measure P(win | 10+ behind) each time. Cut the biggest source first.
- Starting changes, as new `DifficultyRules` fields: catch-up +25% at 2 levels behind and +50% at 3 or more (cap 50%, was +35% a level and cap 75%); camp-behind 1.25× (was 1.5×); underdog waves from 3 or more towers behind only.
- **Do not narrow the Sudden Death gap decay.** It already favours the leader. If the targets miss, widen it to 1–8%.
- Pass on Normal: P(win | 10+ behind) ≤ 8% (round 1: 18–21%), P(win | 5–9 behind) ≤ 25%, median length 6:30–8:30, per-hero and side gates held.

**B5. Purr-ify (Paw Tricks 3 → 4).** M− (1.5 days). Purr-ify removes stun, root, slow, fear and charm, then gives 15 ticks of crowd-control immunity; cooldown 3,000 ticks. It needs `cleanse` and `ccImmune` in `src/sim/effects/status.ts`. Bots cast it when crowd-controlled with 15 or more ticks left. The bot trick draw changes (`fillPicks`), so it is covered by the balance re-run. Pick screen: "Tank → Purr-ify" as a hint. Measure: with `--trick random`, every trick wins 47–53%.

**B6. Level-6 branches: 2 heroes at launch, 2 as a stretch.** M (about 1.5 days a hero: kit code, bot casts, aim shape in `src/input/abilityAim.js`, VFX, text). Option 1 of talent tier 1 (level 6) becomes the shape branch.

| Order | Hero | Branch | Reuse | Note |
|---|---|---|---|---|
| 1 | Sage | Piercing Shot: Q becomes one 9 m line, 600 mm wide, piercing all | `projectile` pierce | replaces Quick Hop |
| 2 | Sir Brutus | Guard Post: W becomes a planted 3 m dome for 60 ticks; Brutus is rooted; it blocks enemy projectiles for allies inside | Front Guard block, `zone` | |
| 3 (stretch) | Cacklejaw | Jeer Hook: Q becomes a 6 m line that pulls the first hero 2 m | `line` + Lambo's pull | |
| 4 (stretch) | Lambo | Belly Bounce: E becomes 2 hops of 3 m (slow 30%, then stun 23 ticks) | `dash`, `ring`, recasts as in Clem Q | |
| Next | Clem | Twin Tumble: 2 charges | **needs a charge system** (new world arrays, snapshot field, HUD pips) | not "dash reuse" |
| Next | Avietė, Bengas, Gabė | Live Wire Fence, Flambé, Twin Wrap | tether, armed zone, shield | |

- Each branch ships only if the hero stays 46–54% with `--bot-talents branch`, the branch wins 45–55% against the number option, and bot casts handle the new shape.
- Show the branch on the enemy portrait so the other side can read it.
- Cut rule: a hero that fails on Nov 2 keeps its number talent.
- Measure: the gates, the veteran depth score, and branch pick rate (under 25% means it reads as a trap).

**Cut order if gates fail on Nov 5:** B6 stretch heroes, then B6 Brutus, then B5, then B6 Sage. Keep B0, B1, B2 and B3. If those fail too, ship v9 with Wave A, and v10 becomes the first patch.

**Stretch, render only:** N1 replay viewer, if Wave B freezes early.

## 4. Next: MVP (Nov 13 – early January)

- **N0. Weekly Twist mutators (v11, Nov 19).** M (2 days).
  - `MatchConfig.mutator`: `zoomies` (cooldowns ×0.5, ultimate at level 2), `clowder` (3 copies of one hero a team, in `fillPicks`), `sunsetRush` (Sunset 2:30, Sudden Death 4:30).
  - Rotation: ISO week modulo 3, from match 4. Skirmish stays the default.
  - No catnip and no fastest-win record (Your call 1).
  - Measure: per-mutator headless sanity (determinism, no safety ends, expected length), Weekly Twist play share, W1→W2 return.
- **N1. Replay viewer and share card.** M.
  - The Worker re-sims both teams' snapshots, with a keyframe every 30 s for seeking. A full re-sim takes up to 1.5 s.
  - 1×, 2× and 4× speed; free camera; "watch my deaths". The last 5 records are kept locally, current version only.
  - A 1200×630 share card through the `share` bridge message.
  - Measure: replay opens, shares, dare-link visits.
- **N2. Live-ops config and Winter Nap.** M (backend lane: `GET /pawlegends/config`, like `/pawlegends/offer`).
  - Fields: `activeMutators`, `event`, `featuredQuests`; the baked-in rotation is the fallback.
  - Winter Nap, Dec 15 – Jan 4: 5 missions unlock a free winter coat for the 4 original heroes and a winter title and frame for the 4 champions. No purchase, no extra catnip.
- **N3. Crow roost.** M–L. From 4:00, a 1,200 HP roost every 90 s at two mirrored river spots. The Feather order (Swift +6% speed / Sturdy 5% shield on respawn / Sharp +5% hero damage) is drawn from the seed and shown in advance, up to 3 stacks. Gates: median 7–9 min; more Feathers wins ≤ 65%.
- **N4. Third dog.** M–L. Lord Barkus or Pilfer, whichever reuses more effects; ends the forced dog mirror. Clowder keeps the joke.
- **N5. More tricks and the rest of the branches.** Whisker Ward (with N12 vision rules and `sense.ts`), Scratch (ignite plus anti-heal), Yowl (area slow); Clem charges; Avietė, Bengas and Gabė branches.
- **N6. Ranked against bots, server-verified.** L (backend). Kitten, Tabby, Alley, Lion, Legend; the bottom two tiers never lose points; S/A losses are cushioned; 8-week seasons, no decay, a season frame. Points come from the verified stats and the grade, posted only through `POST /user/catbassadors/live`. The grade function moves into the vendored sim facade so the server computes the same number.
- **N7. Training ground.** S–M. `mode: 'practice'`, dummies, sliders, never posted.
- **N8. Weekly fastest-win board per hero.** M (backend). Global only, initial plus cat name, opt-out, Skirmish only (no mutators).
- **N9. Role lanes.** M. Bots pick lanes by role around the human; solo-lane +15% minion XP until 4:00 on Normal and Hard.
- **N10. "Purrfect Moment".** S–M. After 3 takedowns without dying, the next ultimate gets +25% radius or range; resets on death.
- **N11. 7-day Welcome Path.** M. Treat XP and cosmetics per day; never an offer in session 1.
- **N12. Instinct keystone.** M. One flat pre-match keystone per role, never from cards, as a step toward build depth without a shop.

## 5. Later (2027)

- Fog of war and wards on Normal and Hard (snapshots are already filtered per team).
- PvP (Phase 2): Colyseus, casual and ranked 3v3, co-op against bots, parties, Duel, custom rooms. From day one: bot backfill after 20 s, and rejoin within 90 s while a bot holds the slot.
- One-lane brawl on Purrhaven, with bot lane logic.
- Captain Grizzlechop (pushes, never wins outright); Moonlit Garden map.
- Roster to 12, then 30. Hero revamps. A community-voted dog ability.
- Account level 1–60, hero mastery M1–M7, a free 8-week season track.
- Clip export; desktop shift-queue, hold and rebinding; gamepad (`Input.js`); left-handed mirror; camera lock.
- Grand Clash 5v5 (items only there, if at all).

## 6. Won't do

| Pattern | Why not |
|---|---|
| Gacha, Magic Wheel, exalted rolls, loot boxes | Paid randomness is banned. "Every cat is a direct buy" is a marketing point |
| Skin stats, upgradable held items | Pay-to-win. Cards never give power |
| Free Treat Track versions of card perks (element chroma, Companion Kitten, badge) | Cannibalises the one paid item |
| Gold shop with 6 slots before Phase 3 | Hard to learn on a phone; too much balance work for a tiny team |
| Energy walls, visible caps, 4-hour chests, streaks that reset | Session pressure and loss aversion |
| Punitive ranked (stars lost in low tiers, decay, credit score) | Wrong tone; no PvP to police |
| Draft and bans, honour, AFK systems | No value without PvP |
| 15–20 minute matches | 5–8 minutes is our edge |
| Hidden live score | Makes "I don't know why I lost" worse |
| Instant-win late objective (Zapdos) | Unite backed away from it |
| Free text or voice chat, regional or location boards | Child safety and privacy |
| Trading or consignment | Conflicts with direct purchase and the catnip caps |
| LLM voice commander | Cost, latency, non-determinism |
| Premium pass, membership | Recurring FOMO spend. Revisit only after PL1 |
| Offers in session 1, more than one a page session, offers tied to quests or rematches | Hard rule. App builds hide all purchases |
| UGC maps, Unite-style dunking | Moderation and verification cost; identity change |

## 7. Measures

| Item | Pass / target | Source |
|---|---|---|
| Fun | Scripted round 3 ≥ 6.5 (from 5.2); veteran depth up | Round 3, Nov 6–8 |
| B1 | `pinger` beats `normal` by +5 to +10 points on Normal | Headless |
| B3 | P(win, 10+ behind) ≤ 8%; P(win, 5–9 behind) ≤ 25% | Headless funstats |
| Balance | Hero 46–54%, side 47–53%, median 6:30–8:30 | `--gate balance` |
| A2 | Per-role grade spread within ±5 points of the target | Headless |
| A3 | Matches per session +0.5 | Backend `pawlegendsMatches`; PostHog |
| A1, A6 | D1 and D7 versus the pre-launch cohort | Backend; PostHog |
| Revenue | Champion Meet impressions → `open-cat` → paid (web only) | Host offer engine, Stripe |
| B2 | Forfeit rate on Normal < 15% | Backend `reason` |
| Determinism | Wave A hash trails identical; v9 and v10 replays both verify | `npm run determinism`, backend spec |

PostHog only sees players who consented. Use it for direction, not for the gates.

## 8. Your call (the plan follows the default if you don't answer)

1. **Mutator rewards.** Default: Treat XP only; no catnip and no fastest-win record (a 1-line backend rule once `mutator` is in the record). Alternative: count toward first-win-per-difficulty.
2. **v9 replays after the switch.** Default: the backend verifies v9 and v10 by `simVersion` for 30 days.
3. **Only one big sim item fits.** Default: B1 pings (with the lane swap). B6 moves to the first patch.
4. **Branches at launch.** Default: Sage and Brutus if they pass; Cacklejaw and Lambo as a stretch; the others show "Branch coming soon".
5. **Forfeit.** Default: from 4:00 on Normal and Hard, 3:00 on Easy; never on Rookie or in matches 1–3; 20 Treat XP.
6. **Less rubber-banding on Normal and Hard only.** Default: yes, guided by the ablation run.
7. **Third dog.** Default: whichever of Lord Barkus or Pilfer reuses more effects; decide by Nov 14.
8. **Champion access.** Default: all heroes stay free to play.
9. **Track after chest 30.** Default: loop through palette variants.
10. **Grade on losses.** Default: show it, with "Best on your team".
11. **Board names.** Default: initial plus cat name, global, opt-out.
12. **Ranked against bots.** Default: December, no decay, the bottom two tiers protected.
13. **Winter Nap.** Default: Dec 15 – Jan 4; coats for the original heroes, title and frame for the champions.
14. **Ship v10 before launch.** Default: yes, frozen Nov 3, with the cut order. Fallback: v9 with Wave A.
15. **Cacklejaw coats (A0).** Default: fix in Wave A as its own item.
16. **Shelter champion Track rewards.** Default: titles, frames and "Meet the real cat" postcards (photo licence of Oct 11), never recolours of the real cats.
17. **Input budget.** Default: 60 pings a match and `MAX_INPUT_BYTES` +600 in all three copies.
18. **Mutators date.** Default: v11 on Nov 19, the week-2 reason to return.

## 9. Backend lane (`backend/` in this worktree)

- Dual v9/v10 vendored sims and version dispatch (B0).
- `mutator` in the DTO, `RECORD_KEYS` and the digest; mutator wins left out of fastest win and catnip (B0, N0).
- Input cap +600 B in `shared/caps.ts` and `backend/src/shared-contracts/caps.ts`, equal to `src/data/limits.ts` (B1).
- Deploy before the client build (`npm run build:client` → `client/public/pawlegends-game/`).
- Later: `GET /pawlegends/config` (N2), ranked points (N6), the weekly board (N8). G-Pay checkout run.

## 10. Honest risk

- **Wave A is about 8 days of work in 5.** It fits only in parallel lanes with fixed contracts (as Formula Meow ran).
- **Wave B is cut to about 12 days in 10**, and the sim lanes merge in sequence. The cut order exists for that reason.
- **Fun:** B1 and B6 are the only items likely to add 1.5 points or more. With two branches at launch, expect round 3 around 6.5, not 8. Reaching 8 depends on the post-launch branches, mutators and the roost.
- **Determinism and deploys:** the dual verifier plus "backend first" removes the deploy-order risk. The input-budget change must land in all three copies in the same commit.
