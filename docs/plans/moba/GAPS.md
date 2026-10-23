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

**Status (2026-10-20, committed in eb4ebf7a with no `pawlegends/src/sim` change, SIM_VERSION 9):**

| Item | Status | Note |
|---|---|---|
| A0 Cacklejaw coats | Done | `lookCoat('cacklejaw', …)` in `specs.ts`; a card skin still wins; the default look is unchanged |
| A1 Treat Track and quests | Done | 30 chests + a 32-coat loop, target picker, postcards, quests 11 → 17 with the round-robin hero slot. The second emote is a palette coat (the match has one emote slot). "Earn an A grade" is not added: it waits for A2's calibration |
| A2 Grade, MVP, Best on your team | Partial | Formula, MVP, Treat XP and the ladder swap are in. Calibration gate not met on fresh seeds: mage about 6.2 and support about 6.0 points off the ±5 target (`tools/grade-calibrate.mjs --check`); re-fit after v10 adds frontline stats |
| A3 Run it back / Switch cat | Done | `rematch_click` event; same page session, so no second offer |
| A4 Objective and respawn timers | Done | Chip, minimap rings, portrait strip with death timers. The chip tap sends no ping until B1 (as planned) |
| A5 Touch target lock | Done | 5 s / 9 m lock from a hero or portrait tap, "Target first" setting, optional last-hit and tower buttons (off). The −40% minion-hit measure needs round-3 data |
| A6 Small items | Done | First win of the day +150 Treat XP, loading-screen hero count and Bond, role label only on the pick screen, ally barks |

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
4. Backend deploy, then the `client/public/pawlegends-game/` build (`npm run build:client`), in that order. The backend
   must be live first: an older backend refuses every v10 replay as an unknown `simVersion`.
5. Scripted round 3.

The sim files (`world.ts`, `brain.ts`, `casts.ts`) are shared, so Wave B lanes must merge in sequence (B0 → B3 → B1 → B2 → B5 → B6), and balance runs go one after another.

**B0. Prerequisites.** M (2 days). Do these first.
- **Seeded bot talents:** `offerTalent` picks 0 or 1 from a forked stream (`rng.fork('talent:'+slot)`), so unrelated draws don't move. Headless `--bot-talents first|seeded|branch` also covers the player-bot.
- **Replay shape v10:** `ReplayRecord.mutator?: 'none'` (only `'none'` accepted in v10), so the backend changes once. Backend: add the field to `PawlegendsReplayDto`, `RECORD_KEYS` and the digest. Leave `mutator !== 'none'` out of `pawlegendsFastestWin` and catnip (see Your call 1).
- **`SlotStats` += `damageTaken`, `healShield`, `objective`** (for A2 v2 and ranked).
- **Funstats** (`tools/lib/funstats.mjs`): win rate when 5–9 or 10+ takedowns behind at the end, the human's level gap at 6:00, and the share of pings obeyed.
- **Dual verifier** (backend lane): `vendor-sim` writes `vendor/pawlegends-sim/v9` and `/v10`; `pawlegends-live.ts` and the worker choose by `simVersion` for 30 days. This makes the deploy order safe, and it matters most for app builds and cached tabs that keep posting v9.

**B0 status (2026-10-21, on `feat/pawlegends`, SIM_VERSION 10): done.** `SIM_VERSION` 10; seeded bot
talents (`rng.fork('talent:'+slot)`, headless `--bot-talents first|seeded|branch`); `ReplayRecord.mutator` ('none'
only, refused otherwise by the sim's server check and the backend DTO; in `RECORD_KEYS` and the digest from v10, never in
a v9 digest; a mutator match pays no catnip and sets no fastest win); `SlotStats.damageTaken`, `healShield`,
`objective`; funstats behind-at-the-end bands, the human's level gap at 3:00/5:00/6:00 and pings obeyed; dual verifier
(`backend/src/vendor/pawlegends-sim/v9` frozen beside `v10`, chosen by `simVersion`). Cores start at 120% on Normal and
Hard (130% before) to keep core kills before Sudden Death over 70% with seeded talents. **Deploy order: the backend
(with the v9 + v10 verifiers) must be live before the v10 client build (`client/public/pawlegends-game/`) ships**;
otherwise every v10 replay is refused as an unknown `simVersion`.

**B1. Command pings that bots obey, plus a lane swap.** M (4 days). The top fun lever.
- Sim: `Op.Ping = 9` (`kind u8, qx u16, qy u16, id u8`, 7 B). Only slot 0 can send it.
  - Kinds: Go here, Group on me, Take Pudding, Push Sunny, Push Puddle, Defend base, Fall back, Focus hero.
  - The sim takes one ping per 45 ticks and **at most 60 a match**; the client debounces before logging. `MAX_INPUT_BYTES` +600 (to 30,600, and 40,800 characters) in `src/data/limits.ts`, `shared/caps.ts` **and** `backend/src/shared-contracts/caps.ts`, so a heavy joystick player who pings is never cut off before 11:00.
- Bot brain: a ping sets an order on allied bots (slots 1–2) with a TTL, slotted **below** retreat and "fight back when hit" and **above** Pudding, camp and lane. Group, Push, Defend, Pudding and Go here last 450 ticks; Focus doubles the foe preference for 150 ticks; Fall back forces retreat for 240 ticks. A bot under 35% HP or napping refuses and barks "Healing first!". Enemy bots never see pings. New events: `ping` and `bark` (the text is chosen at render time).
- **Lane swap:** if the human stays in Puddle from 0:40, ally slot 1 takes Sunny. Then A6 can show lane hints.
- UI: desktop, hold G for a radial and Alt-click to Focus. Touch: one paw button by the minimap opens a 6-slice wheel; long-press the minimap for "Go here"; long-press a portrait to Focus; tap an A4 chip for its ping. Tip in match 2.
- Measure: a headless `pinger` profile on Normal should win 5–10 points more than `normal` (over 15 means pings are mandatory, so tone them down). Balance gates run without pings. Also: pings per match, share obeyed, and the round-3 veteran depth score.

**B1 status (2026-10-20, on `feat/pawlegends`, SIM_VERSION 10):** built. `Op.Ping = 9` (7 B), the sim's own ping gate
(one per 45 ticks, 60 a match, logged before the tick's other command; a ping never drops a waiting move), orders and
barks in `src/sim/bots/orders.ts`, lane swap, `MAX_INPUT_BYTES` 30,600 / `MAX_INPUT_CHARS` 40,800 in all three copies,
desktop G wheel and Alt-click, touch paw wheel and long presses, chip pings, the match-2 tip and the pick-screen lane hint.
Order priority as built: retreat, then the fight branch (fighting back on the way), then the back-off from a bad fight or
tower fire, then the order, then Pudding, camp and lane. A strict "fight back only while walking" cost 4 to 12 win points
in every headless test, so it was dropped. Fall back walks to the own outer structure instead of napping home.
**Measure not met:** at 2,000 seeds `pinger` won 48.2% against `normal` at 50.9% on the same seeds (−2.7). It sends 20.5
pings a match, 97.0% obeyed. At 800 seeds each kind alone was flat or negative: Focus −0.2, Take Pudding −2.0, Push +0.7,
Defend −4.3, Group −2.0, Fall back −7.0. The bots' own macro is already balanced, so an order mostly trades it away.

**B1 review fixes (2026-10-20):** the lane swap ignores a human within 9 m of either core (the fountain, the spawns and
the shared start of both lanes read as a lane, so a nap or a respawn flipped the swap). Stronger obey rules, orders that
shift power and not only goals: Fall back is the pre-B1 retreat (escape casts, then home) while an enemy hero is close
and ends once safe; Defend base comes before any fight elsewhere, like the core defence, and ends once the base is safe;
Focus with the human on the focused hero chases it without the power check; on Group or Push a bot beside the human
holds through a bad fight (never through untanked tower fire). At 800 seeds against `normal` 50.9%: Focus −0.6, Take
Pudding −0.5, Push +1.0, Defend −1.6, Group +1.0, Fall back −3.8, all kinds −2.6, the default mask (Focus + Take Pudding
+ Push) **+0.7** at 21.2 pings a match, 97.0% obeyed. Fall back and Defend are no longer clearly negative, but no mix
reaches +5: every figure is inside the noise (about ±1.8 points). See Your call 19.
The backend's v10 sim copy was rebuilt after these changes (`npm run vendor-sim`; `vendor-sim:check` had flagged it as stale).

**B2. Forfeit.** S (half a day).
- `Op.Forfeit = 10`. The sim accepts it from tick 7,200 on Normal and Hard and from 5,400 on Easy, never on Rookie; matches 1–3 are blocked on the client.
- `MatchResult.reason += 'forfeit'`; `outcome` stays `'lost'`.
- 20 Treat XP, no quest progress, full ladder loss. Catnip is paid on wins only, so nothing changes there.
- Measure: forfeit rate by difficulty. Over 15% on Normal means matches feel lost too early.

**B2 status (2026-10-20, on `feat/pawlegends`, SIM_VERSION 10):** built. `Op.Forfeit = 10` (1 B) applies from
`DifficultyRules.forfeitFrom` (Easy 5,400, Normal and Hard 7,200, Rookie 0 = never), is logged after the tick's other
command, and ends the match at that tick's win check (`reason` 'forfeit', `outcome` 'lost', `G.EndReason` 3; a core that
falls on the same tick wins over it). Earlier forfeits are dropped unlogged and never touch a waiting move. The other
commands leave `FORFEIT_RESERVE_BYTES` (4) of the input budget free, so a player at the cap can still forfeit and the
replay still fits. `VerifyResult` carries `reason`; the backend stores a forfeited row as outcome `'quit'` (the forfeit-rate
measure) and pays nothing extra. Client: `forfeitTick` (no button in matches 1–3), a disabled "Forfeit from M:SS" button,
then a confirm step in the pause menu; 20 Treat XP only (no grade, quest or first-win XP, no quest progress), and a full
ladder loss (no grade share and no placement shield). The determinism fuzz now forfeits in a quarter of its seeds (its own
RNG stream). `vendor-sim` adds `v10/forfeit-replay.fixture.json`. Bots never forfeit, so the balance gates do not move.

**B3. Less rubber-banding on Normal and Hard.** S–M (1 day plus gate runs). Rookie and Easy are unchanged.
- **First, an ablation run:** switch off each comeback source in headless runs (catch-up XP, `campBehindBp`, `enemyComeback` waves, Nine Lives) and measure P(win | 10+ behind) each time. Cut the biggest source first.
- Starting changes, as new `DifficultyRules` fields: catch-up +25% at 2 levels behind and +50% at 3 or more (cap 50%, was +35% a level and cap 75%); camp-behind 1.25× (was 1.5×); underdog waves from 3 or more towers behind only.
- **Do not narrow the Sudden Death gap decay.** It already favours the leader. If the targets miss, widen it to 1–8%.
- Pass on Normal: P(win | 10+ behind) ≤ 8% (round 1: 18–21%), P(win | 5–9 behind) ≤ 25%, median length 6:30–8:30, per-hero and side gates held.

**B3 status (2026-10-21, on `feat/pawlegends`, SIM_VERSION 10): partial (by design).** Built: the
`DifficultyRules` fields `catchUpPerLevelBp`, `catchUpMaxBp`, `campBehindBp` (from `XP` constants) and the headless
`--ablate catchup,camp,waves,nine` run. Underdog waves already start only from 3 towers behind. Not applied: the
starting cuts (+25%/+50% catch-up, 1.25× camp). The ablation found no single source carrying comebacks, and the cuts
*raised* P(win | 10+ behind) (balance 1.0% → 3.4%; novice vs Normal 2.4% → 7.1%), so every difficulty keeps the v9
values. Both Normal targets hold without them (final run, 2,000 seeds: 10+ behind won 2.6% of 195, 5–9 behind 11.5% of
680). Rookie and Easy are unchanged.

**B5. Purr-ify (Paw Tricks 3 → 4).** M− (1.5 days). Purr-ify removes stun, root, slow, fear and charm, then gives 15 ticks of crowd-control immunity; cooldown 3,000 ticks. It needs `cleanse` and `ccImmune` in `src/sim/effects/status.ts`. Bots cast it when crowd-controlled with 15 or more ticks left. The bot trick draw changes (`fillPicks`), so it is covered by the balance re-run. Pick screen: "Tank → Purr-ify" as a hint. Measure: with `--trick random`, every trick wins 47–53%.

**B5 status (2026-10-20, on `feat/pawlegends`, SIM_VERSION 10):** built. `purrify` is the 4th entry of
`TRICK_IDS` (old indices unchanged), `TRICKS.purrify` = cooldown 3,000, immune 15. `cleanse` and the `ccImmT` world
array (hashed) are in `src/sim/effects/status.ts`: `ccImmune` also holds while `ccImmT` > 0, so stun, root, slow, fear,
charm and knockback miss. Purr-ify is the one cast a stunned, feared or charmed hero can start and finish
(`castsThroughCc`; a knockback in flight still blocks it). Bots (`purrifyCast`, first in `think`) cast it with 15+ ticks
of stun, fear or charm left, or of root or slow with an enemy hero within 5 m; never on Rookie and Easy (trick `never`).
Snapshot bit `Purrified` (1 << 18), overhead word "Purr-ified", a gold ring, stars and a "Purr-ified!" word, a new
`purr` icon, and the pick-screen line "Tank → Purr-ify" under the trick chips (Sir Brutus, Lambo). `npm run match`
prints per-trick win rates and the balance gate checks them. Balance at 2,000 seeds: pounce 52.0%, snack 49.7%, hiss
50.5%, purrify 47.8%; heroes 46.2% (Sage) to 54.1% (Clem); Purrhaven 51.1%, cats 50.1%, median 7:08, no safety end.

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

**B6 status (2026-10-21, on `feat/pawlegends`, SIM_VERSION 10):** Sage and Sir Brutus built; Cacklejaw and
Lambo skipped (stretch). Talent tier 1 option 1 is the branch (`BRANCH_TALENT` in `src/data/heroes`); the other six
heroes show "Branch coming soon" on their level-6 card. **Piercing Shot** (replaces Quick Hop): `q.lance`, one 9 m line,
600 mm wide, 95 (+14/lvl), piercing everything (`PROJECTILE_KIND.lance`; Sticky Arrows still slows). **Guard Post**
(replaces Long Charge): `w.post`, a 3 m dome (`ZONE_KIND.dome`) for 60 ticks that shields his team inside it: an enemy
bolt is stopped only when its target is one of them (bolts at towers, the core, camps, Pudding or anyone outside pass), a
skillshot only as it enters from outside, and a shot fired from inside flies on without touching the units the dome
shields (`domeShields`). Enemies inside can still shoot out. Sir Brutus cannot walk or dash while it stands (`planted`)
and takes 25% less damage; cooldown 300 (Front Guard 420); the dome ends with him. Without the damage cut the root
cost him about 4 points (35.8% with the first numbers, 49.1% at 25%). Bots: Piercing Shot through the existing Volley
rules (fight, and a line count for wave clear); Guard Post only with the foe in Slam reach and never on Rookie and Easy
(it cut fun1's core kills before Sudden Death from 89.4% to 87.5% at 800 seeds). Client: line and dome aim shapes
(`aimFor(hero, slot, branch)` in `src/input/abilities.ts`), the swapped slot on the own bar, a badge on the enemy portrait
(`EntitySnap.branch`, both teams), a lance bolt, a gold half-sphere and cast effects. Clem `pvp.dmgBp` 9200 → 9100 (54.4%
after the branches), then 8800 once the dome stopped disarming enemies inside it (Clem 54.2% at 9100, 54.9% at 9000).
Balance at 2,000 seeds, seeded: Sage 49.2% (branch 49.4%), Sir Brutus 50.0% (branch 50.1%), heroes 47.8% (Cacklejaw)
to 53.4% (Clem), Purrhaven 48.4%, cats 51.1%, median 7:10, p95 7:56, no safety end. With `--bot-talents branch`: Sage
48.1%, Sir Brutus 49.8%, heroes 48.1% to 52.0%, cats 50.5%, median 7:14. `npm run match` prints per-hero level-6
win rates and the balance gate checks each branch at 45% to 55%. The backend's v10 copy was rebuilt (`npm run vendor-sim`).

**Wave B status (final check 2026-10-21, SIM_VERSION 10, all on `feat/pawlegends`):**

| Item | Status |
|---|---|
| B0 prerequisites | done |
| B1 pings + lane swap | done; measure not met: `pinger` +0.5 points vs `normal` at 2,000 seeds (48.9% vs 48.4%, 20.9 pings a match, 97.0% obeyed), so Your call 19's default applies |
| B2 forfeit | done (sim window, backend `quit` row, pause-menu UI, unit and e2e tests) |
| B3 less rubber-banding | partial: rules and ablation built, cuts not applied (they raised comebacks; targets already hold) |
| B5 Purr-ify | done |
| B6 branches | Sage and Sir Brutus done; Cacklejaw and Lambo (stretch) not built |

Nothing was cut: every gate in the bump steps passes. Balance at 2,000 seeds: heroes 47.8% (Cacklejaw) to 53.4% (Clem),
cats 51.1%, Purrhaven 48.4%, median 7:10, p95 7:56, 0 safety ends, core kill before Sudden Death 72.8%, 10+ behind won
2.6% of 195, 5–9 behind 11.5% of 680; tricks 47.9% to 52.1%; branches Sage 49.4%, Sir Brutus 50.1%. fun1, fun2,
novice (vs Easy), parked, idle, hard, feeder and feedNormal pass. Open: `--gate novice --difficulty normal` fails at
30.5% (≥ 40%), but the committed v9 build fails it too (31.5% on the same seeds), so it is not a Wave B regression and
the cut order would not move it. **Deploy order: the backend (v9 + v10 verifiers) first, then the v10 client build.**

**Cut order if gates fail on Nov 5:** B6 stretch heroes, then B6 Brutus, then B5, then B6 Sage. Keep B0, B1, B2 and B3. If those fail too, ship v9 with Wave A, and v10 becomes the first patch.

**Stretch, render only:** N1 replay viewer, if Wave B freezes early.

### Wave C (level growth, ability ranks, combat VFX, card-tier effects; still SIM_VERSION 10, unshipped)

C1 and C2 change sim data inside the one v10 bump (the v10 vendor copy was refreshed; v9 stays frozen). C3 and C4 are
render only. Card effects are cosmetic: no card reaches a stat, cooldown, hitbox or sim input.

| Item | Status |
|---|---|
| C1 level growth | done (attack speed and move speed per level by role) |
| C2 ability ranks | done (Q/W/E at 2, 5, 8; R at 4, 7, 10; pips, toast, tooltips); open: talents that set an absolute cooldown or damage lose value as ranks stack (Avietė Quick Shine 120 ticks better than base at level 6, 75 at level 8), a design call, not changed |
| C3 combat VFX | done; outlines on minions and towers not added (draw-call caps); known bug: unfiltered `levelup` ring (below) |
| C4 card-tier effects | done (Rare tint, Epic cast sparkle, Legendary hit burst, takedown flourish, ultimate paw wave) |

Final verification (2026-10-21, all of Wave C together): `tsc` clean; vitest 86 files passed, 1 skipped, 789 tests
passed, 4 skipped; `lint:sim` ok (100 files); `lift --check` ok; determinism 100 seeds, 264,666 commands, two runs
identical; build ok, first-load JS 394.8 KB gzip (budget 450 KB), output 1.69 MB; `vendor-sim:check` current (v9
frozen, v10); `sync-contracts --check` up to date; backend lint and build ok, backend tests 158 suites and 2,493 tests
passed (2 suites fail to load without `OPENAI_API_KEY` in the shell and pass with a dummy key; not a Wave C change).
Playwright: 74 passed, 48 skipped (per-project skips), 1 failed on the first run (`first-match` "all five tips", the
attack tip's text not caught at speed 4) and passed twice on re-run; Med perf with card effects at 59 draws (≤ 110). Balance at 2,000 seeds passes every line:
heroes 48.4% (Cacklejaw) to 53.4% (Avietė), cats 51.3%, Purrhaven 46.9% (inside the gate's 45–55%, under the plan's
47%), median 7:01, p95 7:52, 0 safety ends, core kill before Sudden Death 80.7%, 3.44 takedowns a minute, trailing at
3:30 won 26.8%; tricks 48.8% to 50.9%; branches Sage 52.5%, Sir Brutus 47.2%. fun1 (99.0%, 5:01), fun2 (80.0%, 6:40),
novice (90.5%) and parked (1.5%) pass.

**Wave C C1 + C2 status (2026-10-21, on `feat/pawlegends`, still SIM_VERSION 10, unshipped):** built. **C1 level
growth:** every level above 1 adds the role's attack speed and move speed (`ROLE_GROWTH` in
`src/data/heroes/growth.ts`; a hero may override it in `HeroBase`): fighter +2.5% / +30 mm/s, marksman +3% / +25,
tank +1.5% / +25, assassin +2.5% / +40, mage +1.5% / +25, support +1.5% / +30. Attack speed adds to buffs in one floored
division, never faster than one swing every 12 ticks (`GROWTH_FLOOR`); slows and hastes scale the levelled speed.
**C2 ranks:** Q, W and E rank up at levels 2, 5 and 8 (4 ranks), R unlocks at 4 and ranks up at 7 and 10 (3 ranks);
no rank level is a talent level, so each level-up brings one thing. Per-ability deltas live in `HeroData.ranks` and
merge before the talents (a talent number wins); the sim table is per hero, level and talent combination, the same for
bots. Half of each `dmgPerLevel` moved into the ranks, so level-1 and level-10 damage are unchanged; W and E get −0.5 s
a rank, R −3.3 s a rank. Client: rank pips on the desktop slots and touch buttons, a "Rank up!" toast at the level-ups
that rank something, tooltips and talent cards with the numbers at the current level and picks, and cooldown sweeps
from the same table. Tuning: Avietė `pvp.dmgBp` 13000 → 12700, Sage 10700 → 10900, Purr-ify cooldown 3000 → 2700.
Balance at 2,000 seeds: heroes 48.4% (Cacklejaw) to 53.4% (Avietė), cats 51.3%, Purrhaven 46.9%, median 7:01, p95 7:52,
0 safety ends, core kill before Sudden Death 80.7%; tricks 48.8% to 50.9%; branches Sage 52.5%, Sir Brutus 47.2%.
fun1, fun2, novice, parked, idle, hard, feeder and feedNormal pass. A2 grades drifted (fighter, assassin, mage over
5 points on the held-out block) and were refit on the same 1,400 seeds a hero.

**Wave C C3 status (2026-10-21, render only, no sim change):** built in `src/render/fx/combatVfx.ts`. Hit sparks and
the impact flash scale with the damage (an element ring on ability hits), a big-hit pop on a hero hit for 16% of its max
HP (the sim has no crits), slash crescents on melee basics and cone casts, element-coloured projectile trails with
embers and dash streaks, ground debris by biome (grass, lane dirt, river water, bridge wood, plaza stone), ultimates
with a relation-coloured wave (an enemy one reads red), a pillar and cracks, lightning on Avietė's ability hits and
areas, a power spike at levels 4, 7 and 10 with a level aura underfoot (no gold under another hero, none while
stealthed), and casts that grow 18% a C2 rank with a sparkle at the top rank. Colours come from the hero's element,
never from a card. Budgets: Low 800 particles (counts ×0.6, no embers, motes or cracks), Med 1,600, High 2,000; the
OS reduce-motion switch cuts counts ×0.6, stops sweeps, flickers and motes, and caps shake; Settings has Screen shake
Full / Low / Off. Enemy wind-up telegraphs and zones now draw after every particle layer. Outlines: heroes already have
the ink hull on Med and High; minions and towers were not given one (more draw calls against the perf caps).
First-load JS 392.3 KB gzip (387.0 KB before, budget 450 KB).
Review fixes: the aura layer holds two rings for all six heroes (it had 6 slots, so team 0 filled them and the other
team showed no level-7 or level-10 aura); the level spike, cast accents, dash streaks and hit sparks of another player's
hero never take the gold "you" family (Avietė, Sir Brutus and Lambo read gold; Clem's gold cast accent is mixed toward
white under another player too); the level spike draws only for a hero in the current snapshot.
**Known bug (predates C3, not fixed):** the `levelup` event is not vision filtered, and the render keeps a hero's
last-seen place for 3 s (`WHO_TTL`), so the small gold level-up ring still pops where an enemy that just stepped into
brush or fog is hiding.

**Wave C C4 status (2026-10-21, render only, no sim change):** built in `src/render/skins/cardFx.ts`. Card-tier
ability effects from the worn card skin's rung: Common is the default; Rare tints the hero's projectile trails, dash
streaks, melee slashes and hit sparks with the coat's glow colour (the most colourful coat colour, lifted; colour
only, the same counts, sizes and timings); Epic adds a sparkle at every ability cast (the footfall glint stays in
`tierFx.ts`); Legendary adds a paw-print hit burst inside the default impact flash (basic hits at most every 0.25 s a
hero), a takedown flourish over the fallen hero and a paw-print wave on the ultimate at 80% of its own wave radius (the
red enemy wave stays). Everyone sees them under Skin effects All; tints are always on, the extras follow tierFx's caps
(another hero's only on Med / High and outside a team fight, none while stealthed, skipped over 80% pool use, at most
60 live particles). Another hero's tint is never in the gold family nor within 25° of the opposing team's hue.
Previews: the pick screen under the Skins strip, the results line and a Card effects list on the Treat Track
("Legendary card: Ficus burst"), each with a small CSS demo in the coat colour; works with `?skins=demo`. Cosmetic
proof: `tests/unit/card-fx.test.ts` plays a match with every hero in a Legendary card and without, through the same
event director, and the replay (inputs, hash trail, final hash) is identical and verifies; the sim, the backend
verifier and the vendored bundles never mention cards. Balance at 2,000 seeds is unchanged from C1 + C2 (no sim
change): heroes 48.4% (Cacklejaw) to 53.4% (Avietė), cats 51.3%, median 7:01, 0 safety ends; fun1, fun2, novice and
parked pass. Perf (Med, every hero Legendary): 61 draws at most (≤ 110), 2,451 card-effect particles in the match.

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
19. **Pings give control, not win rate (B1 measure).** The `pinger` wins +0.7 points on Normal (+0.5 at 2,000 seeds in
    the final Wave B check), not the 5–10 in §3, even
    with the stronger obey rules. Default: accept pings as control and depth with no edge, keep the rules as built, and
    let round 3 (pings per match, share obeyed, veteran depth score) judge them. Alternative: bigger power shifts on an
    order (Focus damage bonus, Group skips the power check), which risks making pings mandatory (over +15).

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
