# Pawlegends: game design document

A cats vs dogs MOBA in three.js for Token Tails. Written 2026-10-17 and revised the same day after an adversarial review (repo paths re-verified). Status: proposal for founder review.

The Phase 1 build spec is in [`POC.md`](POC.md). This file is the whole game: what it is, how it makes money, and the three rollouts.

Sources used: Pink Paw Knight (PPK, the Swordcat repo, checked out next to this monorepo as `../swordcat`), `catnip-heist/`, `bad-cat/`, `cat-rave/`, `docs/GAMES.md`, `docs/CLAIMS.md`, `docs/MOBILE.md`, `docs/plans/viral-game/GDD.md` §9, `docs/plans/core-game-strategy.md`, `docs/plans/revenue-kickstart.md`, and a market scan of LoL, Wild Rift, Mobile Legends (MLBB), Honor of Kings (HoK), Pokémon UNITE, Brawl Stars, Marvel Rivals, Deadlock and Supervive.

---

## 0. Summary

- **Name:** **Pawlegends**, one coined word. It is the closest safe mark to the founder's "Cats Legends". Alternates: **Meowba** and **Nine Lives Arena** (§1).
- **Logline:** *Eight-minute cats vs dogs battles. Pick a legend, push the lane, pop the Bone Throne. Bring your own cat.*
- **Core mode:** 3v3, two lanes, a small jungle, two neutral objectives (the POC ships one, Pudding). Median match 7 to 9 minutes, hard end at 11:00. Desktop plays like LoL (right-click to move, QWER). Phones get the Wild Rift layout, landscape only.
- **Why we can build it:** PPK already has a LoL-style iso camera, MOBA orders, the Wild Rift touch cluster, ability aiming, telegraphs, a procedural cat rig and a dog faction with lore. Catnip Heist and Bad Cat already prove a deterministic sim that the backend re-simulates before it saves a score.
- **Key architecture call:** a new integer deterministic sim runs in a Web Worker ("LocalHost") in Phase 1. It speaks the same message protocol the Phase 2 match server will use. MVP netcode is then a transport swap, not a rewrite.
- **Revenue stance:** sell identity, never power. Skins, your own cat as a skin, a pass that never expires, a Club subscription, hero unlocks that can also be earned, map billboards. No paid randomness at any phase. Real prices in € or $ everywhere; no premium currency before Phase 3 (and only after a legal review).
- **Revenue test starts on POC launch day:** a $0.99 starter, a $9.99 Founder pack and a $29.99 Founder Legend (with a $20 upgrade), sold on the web through Stripe. My Cat Hero ($9.99) follows in the MVP.
- **Binding risk:** acquisition, not design. The platform had about 30 active players in 30 days against 540K+ registered. Every phase has a kill gate measured on human players, and Phase 1 has a funded distribution plan (§11.1).
- **Start:** after the open funding deadlines. Default start date **Thu 2026-10-22** (after Tameion Oct 17, the Anitya main jam Oct 21 and the Arc decision by Oct 21). POC launch **Thu 2026-11-12**.

| Phase | Name | Length | One line |
|---|---|---|---|
| 1 | POC "First Blood" | 3 weeks build (2 devs with AI agents) + 4 weeks measurement | 3v3 vs bots, 4 heroes, verified saves, real Founder presale. Proves the core loop, the purchase loop, phone performance and willingness to pay |
| 2 | MVP "Season 1" | 12 to 16 weeks | Realtime 3v3 PvP on a separate match server, 12 heroes, ranked, pass, Club, full web store |
| 3 | Full "Legends" | 6 to 9 months | 30 heroes, 5v5 and rotating modes, mobile IAP, earned-only collection draws, events |

---

## 1. Name and positioning

| | Name | Collision notes (market check, not legal clearance) | Use |
|---|---|---|---|
| **Primary** | **Pawlegends** | Coined word. No exact game or app hit. Further from "Cat Legends: Idle RPG" (apps.apple.com/app/id6476254307) than "Paw Legends" | Title, route `/pawlegends`, package `pawlegends/` |
| Alt 1 | **Meowba** | No exact hit. The "Meow's" cat PvP app exists (JP). "MOBA" makes it weaker as a mark | Fallback if the search fails; good as a hashtag |
| Alt 2 | **Nine Lives Arena** | "Nine Lives" is crowded, but no MOBA uses "Nine Lives Arena" | Mode name, or fallback |

Rejected:
- "Cat Legends" and "Cats Legends": taken.
- "Paw Legends" (two words): descriptive and close to "Cat Legends".
- Anything "...of Legends": Riot enforces its marks (Moonton, Riot Squad).
- "Clawsome Legends": collides with Whitethorn's *Clawsome*.

Rules:
- Run EUIPO TMview, USPTO and both app-store searches **before** any public use: before the launch post, a domain or a store listing. The POC can be built under the name; it ships publicly only after the search.
- Avoid LoL lookalikes in UI and terms (no "Summoner", "Rift", "Nexus", "Hextech").
- "Pink Paw" stays out of the title, hero names and skin names until Pink Paw approves (`docs/GAMES.md` Pink Paw Knight "Title" note; PPK `src/core/brand.js` `USE_PINK_PAW_NAME`).

---

## 2. Fantasy and factions

**The Truce Games.** PPK's story ends with the Hound Legion reconciled with Purrhaven ("If dogs can't have the sun, nobody can"; `swordcat/GAME_DESIGN.md` §2.4, §3.7). Pawlegends picks up right after. Cats and dogs now settle every dispute (the best sunbeam, the last fish, the couch) in matches on the Crossing, the neutral sand between Purrhaven Isle and the Isle of Woof.

| Side | Gate | Core | Towers | Minions | Palette |
|---|---|---|---|---|---|
| Purrhaven (cats) | Purrhaven Gate | Great Cat Tree | Scratching Posts | Kitten Cadets | cream, rose, gold |
| Woof (dogs) | Woof Gate | Bone Throne | Kennels | Pup Troopers | slate, navy, brass |

**Why cats vs dogs:**
- Two silhouette families (round cats, blocky dogs) read as "mine or theirs" on a phone in a glance.
- Lore and art exist: Clem, Mochi, Sage, Clover, Earl Grey, Pip on one side; Lord Barkus, Sir Brutus, the pugs, the Boneheads and the hyena Snickerpack on the other.
- Rivalry is built-in marketing: "Team Cat or Team Dog?" (weekly faction war from Phase 2).
- Dog people buy too. A cats-only roster leaves half the pet-owner market out.

**Rules:**
- **Map side is fixed in Phase 1.** The player's team is always Purrhaven (cat minions, cat towers, Cat Tree). This keeps one map dressing and one camera orientation.
- **Heroes are not locked to a side ("Truce rules").** Any hero plays on either team. A dog hero on the Purrhaven team wears a cream-and-rose sash (one material swap). Locked rosters would halve the pick pool for each team and split matchmaking.
- **Faction pledge is cosmetic.** From Phase 2 a player pledges Team Cat or Team Dog for the weekly faction war, a banner and a share-card badge.
- **Tone:** PPK warm toon. No blood. Defeated heroes poof into sparkles and nap at the fountain. Dogs are grumpy and honourable, not evil. Target PEGI 7 to 12.
- **Elements are cosmetic.** Each hero has a `CatAbilityType` tag (`shared/enums.ts`, `enum CatAbilityType`) that sets its VFX hue and its link to owned Token Tails cats (§7.2). It never changes numbers. The `STELLAR` element is labelled **"Star"** in every game string: "Stellar" is a chain name, and the game ships inside the app export (CLAIMS R10).

---

## 3. Match format

### 3.1 Modes by phase

| Mode | Players | Length | Phase |
|---|---|---|---|
| **Skirmish** (core) | 3v3, 2 lanes + jungle | median 7 to 9 min, hard end 11:00 | P1 vs bots; P2 PvP casual and ranked |
| Co-op vs bots | 1 to 3 humans + bots | same | P2 |
| **Duel** | 1v1, one lane | about 4 min | P2 |
| **Grand Clash** | 5v5, 3 lanes | 12 to 15 min | P3 |
| **Litterbox Rumble** | 2v2v2v2 rounds (LoL Arena shape) | about 10 min | P3 rotating |
| **Kibble Swarm** | 1 to 3 players, PvE survival | 10 min | P3 rotating. Needs no netcode solo, so it is also the fallback if Phase 1 fails |

Why 3v3: matchmaking needs 6 players, not 10; art, netcode and balance load is less than half of 5v5; bots can fill a small queue. Brawl Stars proves short sessions on phones; MLBB and UNITE sit at 10 to 15 minutes, and we go shorter.

### 3.2 Map: Purrhaven Crossing

```
             ┌─Inner─Outer──────────── SUNNY LANE ────────────Outer─Inner─┐
             │     rat camp   crow roost   Grizzlechop   crow roost   rat camp     │
 [fountain] [Great Cat Tree]          ~~~~ river ~~~~          [Bone Throne] [fountain]
             │     rat camp                Pudding                    rat camp     │
             └─Inner─Outer──────────── PUDDLE LANE ───────────Outer─Inner─┘
```

- About 100 × 60 m, **mirrored left-right across the centre line** (x = 50 m), so both objectives sit on the axis and both teams share Sunny (top) and Puddle (bottom). One core per side. Fountain to the river takes about 9 s at 5 m/s, to the enemy outer tower about 13 s. Exact POC coordinates are in `POC.md` §5.
- 2 towers per lane per side (outer, inner) and 1 core per side. No inhibitors. Destroy the core to win.
- Towers target minions first and switch to a hero that damages an allied hero in range (LoL rule).
- Minion waves every 25 s from 0:30: 2 melee + 1 ranged per lane. From 3:00 every third wave adds a siege unit (Yarn Catapult on the cat side, Bone Cart on the dog side).
- Jungle per side: 2 rat camps (XP) and 1 crow roost (the Feather buff: faster cooldowns for 60 s).
- **Captain Grizzlechop** (PPK rat boss) spawns in the river at 2:00, then every 3:00. Reward: team XP, and the team's next 2 waves are "armoured" (+30% HP).
- **Pudding** (PPK's 6 m dragon who is scared of everything) spawns at 5:00, then every 2:30. Teams "calm" him: a race to fill his calm meter, styled as cheering him up. Reward: **Pudding's Courage**. Pudding escorts the team's next wave down one lane and breathes on towers. This is the Baron role and the closer.
- **Catnip Bushes** (brush): units inside are hidden from enemies outside. Vision is computed in the sim (§9.4), so Phase 2 can send each team only what it can see.
- **POC subset** (`POC.md` §5): 1 rat camp per side, no crow roost, no Grizzlechop, 4 bushes, no fog of war (brush still hides). The rest arrives in the MVP.

### 3.3 Timeline and safety rails

| Time | Beat |
|---|---|
| 0:00 | Spawn at level 1. 10 s gate barrier |
| 0:30 | First wave; then every 25 s |
| 1:00 | Jungle camps up |
| 2:00 | Grizzlechop |
| 3:00 | Siege units start |
| 5:00 | Pudding |
| **8:00** | **Sunset.** Towers and cores take +40% damage, respawns ×1.5, minions +25% damage. Light turns golden, music stinger |
| **10:00** | **Sudden Death.** Cores lose 2% max HP a second; each hero takedown deals 10% core damage to the victim's core |
| **11:00** | **Safety end.** The team with less core HP loses; tie-break is total tower damage dealt. No match lasts longer than 11:00 |

Surrender vote from 4:00 (PvP only).

**Snowball and comeback:**
- There is **no gold and no item shop** (§3.4). Power in a match comes from levels and talents.
- Kill XP grows with the victim's streak (a shutdown pays more).
- A team behind in total level gets +20% catch-up XP from minions.
- A team behind by 2 or more towers gets +50% XP from Grizzlechop.

### 3.4 Levels, talents and Paw Tricks (no items)

Levels 1 to 10 in a match. The ultimate unlocks at level 4. Every level adds about 8% to base stats.

**Talents at levels 3, 6 and 9.** At each, the player taps one of two Whisker Upgrades, for example "Volley fires 7 arrows" or "Volley slows". Each talent changes one ability; none adds a button. Bots and new players see a recommended pick.

Why talents instead of items (the Heroes of the Storm approach):
- The deterministic sim has no gold, no shop, no inventory. Less code, less to keep deterministic.
- 4 heroes × 6 talents is a balance surface we can test headless. 4 heroes × a 6-item pool is not.
- New players on phones are not lost in a build.
- There is nothing power-adjacent to sell.

Items can come back in Phase 3 for Grand Clash 5v5 only, if data says players want builds.

**Paw Tricks** (summoner spells; PPK `src/player/tricks/PawTricks.js` slot). One is picked before the match:
- **Pounce:** 4 m blink (cooldown 120 s).
- **Snack Break:** heal 25% max HP over 2 s (cooldown 90 s).
- **Hiss:** 1 s fear in a 3 m radius (cooldown 100 s).
- From P2: **Zoomies** (+40% speed for 3 s) and **Snack Smite** (damage to a monster or minion).

---

## 4. Controls

PPK's controls spec (`swordcat/research/CONTROLS_SPEC.md`, 2026-10-10, "controlled like League of Legends") is the base. We lift its action model; we do not re-invent it.

### 4.1 Desktop

PPK `moba` preset (`INPUT.presets.moba` in `src/core/config.js`, read by `src/core/Input.js`), remapped to MOBA defaults. The POC ships the minimum set (`POC.md` §9); Shift-queue, the Brawler preset, rebinding, gamepad, Edit layout and the left-handed mirror arrive in the MVP. No binding uses Ctrl, Alt, Meta or an F-key (PPK rule). Full rebinding.

| Action | Default |
|---|---|
| Move / attack target | RMB; Shift+RMB queues (`src/player/Orders.js`) |
| Attack-move | A then LMB |
| Stop / hold | S / H |
| Abilities | Q W E, ultimate R. Quick-cast by default; hold to show the indicator and release to cast (`src/companions/abilityAim.js`) |
| Paw Trick | D |
| Nap (recall) | B (4 s channel, broken by damage) |
| Talent pick | 1 / 2 while the talent toast shows |
| Camera | Space centres, Y toggles lock, edge pan, wheel zoom (clamped) |
| Scoreboard | Tab |
| Alternative preset | "Brawler": WASD to move, LMB attacks toward the cursor (PPK `hybrid`). For players who do not play MOBAs |

### 4.2 Mobile (landscape only)

PPK STATUS records portrait framing as unsolved, so Pawlegends is landscape only. Built on `src/ui/touch.js`, `ui/touchLayout.js` and `ui/touchEditor.js`.

- **Left thumb:** floating joystick, 40 px dead ring. No tap-to-move in matches.
- **Right thumb (Wild Rift cluster):**
  - A big Attack button. Tap auto-targets with the PPK priority scorer (`src/combat/targeting.js`).
  - Two small buttons beside it: **Last-hit minion** and **Hit tower**.
  - Q, W, E in an arc, R larger on top. Tap smart-casts; drag aims with the range shape; drag onto ✕ cancels.
  - Paw Trick and Nap as small buttons.
- Top-left minimap; tap to peek.
- Target priority setting: lowest HP, closest, or heroes first.
- Left-handed mirror, Edit layout, device glyphs (`ui/inputGlyph.js`), reduced camera shake option.
- Gamepad comes free from the PPK action model.
- POC subset: joystick, Attack, Q/W/E/R, Trick, Nap, ✕ cancel, minimap peek. Last-hit and Tower buttons, Edit layout, left-handed mirror, target priority and gamepad are MVP.

**Onboarding rule:** the first match forces smart-cast. Aimed cast is offered as a tip after 3 matches.

### 4.3 Camera

- `src/camera/IsoRig.js` maths with fixed yaw, retuned in data for lane view: about 18 to 20 m from the focus, pitch about 55°. Minimum hero height on screen 30 CSS px.
- `Picker.js` for ground and actor picks, `Occluders.js` dithered fades for trees and towers, `CameraShake.js` for juice.
- **Not lifted:** `FollowCamera.js` (3,103 lines, story and cutscene framing). PvP keeps every player on the same field of view; a teamfight zoom-out of up to 10% is allowed in bot modes only.

---

## 5. Hero design

### 5.1 Roles

| Role | Job in 3v3 | Icon |
|---|---|---|
| Tank | Starts fights, protects | shield |
| Fighter | Duels, holds a lane | sword |
| Assassin | Picks off one target, roams the jungle | claw |
| Mage | Area burst and control | wand |
| Marksman | Sustained damage, takes towers | bow |
| Support | Heals, shields, buffs | bell |

Positions in 3v3: Sunny Lane, Puddle Lane, Roam/Jungle.

### 5.2 Kit template (every hero, no exceptions)

| Slot | Rule |
|---|---|
| Passive | One rule, readable in 8 words |
| Basic attack | Melee (1.6 m) or ranged (5.5 to 6.5 m), with a wind-up and an on-hit flash |
| Q | Bread-and-butter, cooldown 4 to 8 s |
| W | Utility or defence, cooldown 8 to 14 s |
| E | Mobility or engage, cooldown 10 to 16 s |
| R | Ultimate, cooldown 50 to 80 s, unlocks at level 4. Ground telegraph and a screen callout |
| Talents | 3 tiers × 2 options. Each changes one ability |

Production rules:
- **Every number is data** (PPK "no gameplay literals" rule): `pawlegends/src/data/heroes/<hero>.ts`, in integer units.
- **Effect primitives.** Kits are built from a closed library of about 20 primitives: `dash`, `blink`, `line` (skillshot), `cone`, `circle`, `ring`, `projectile` (pierce, bounce, reflect), `zone` (over time), `tether`, `shield`, `heal`, `cleanse`, `slow`, `stun`, `root`, `knockback`, `taunt`, `fear`, `stealth`, `buff`. A new hero is about a day of data plus 1 to 2 days for one bespoke VFX. That keeps the Phase 3 roster affordable.
- At most 1 hard CC and 1 soft CC per kit (tanks and supports may have 2 hard).
- Every enemy wind-up longer than 250 ms shows a ground telegraph (`fx/Telegraphs.js`, `fx/GroundDecals.js`). Ally indicators are cream, enemy indicators red-orange.
- **Art:** cats from `buildKitten(cfg)` (`src/characters/KittenBuilder.js`, `lite` tier), dogs from `BeastHead.js` + `BeastDress.js` on the KayKit rig, both **baked offline to GLB clips** on one shared cat skeleton and one shared dog skeleton. Skins are palette, prop and VFX swaps on the same mesh, so a skin costs hours, not weeks.

### 5.3 Combat feel (render layer only)

All juice lives in the renderer. The sim never pauses, so determinism holds.
- Hitstop 40 ms on crits and ult hits, 80 ms on a takedown (render freeze only).
- Light camera shake on your own big hits.
- **"Purrfect!"** callout when a dash dodges a projectile (PPK Purrfect Dodge).
- Death poof (`fx/Particles.js`, `Shockwaves.js`).
- Announcer kitten (babble voice): *First Paw* (first blood), *Double Scratch*, *Purrtacular* (triple).
- A short ult punch-in for the caster in bot modes.

### 5.4 Roster across phases (30 heroes: 15 cats, 15 dogs)

P1 = POC (4), P2 = MVP (+8, 12 total: 6 cats, 6 dogs), P3 = Full (+18, 30 total).

**Purrhaven (cats)**

| Hero | Role | Element | Signature | Phase | Source |
|---|---|---|---|---|---|
| **Clem** | Fighter | FAIRY | *Valor* meter; ult *Golden Hour* | **P1** | PPK Player, `Valor.js` |
| **Sage** | Marksman | WIND | Every 4th shot pierces; ult *Moonshot* | **P1** | PPK `sage.volley` |
| Clover | Support | GRASS | *Bell Chime* heals; ult *Lullaby* sleep zone | P2 | PPK `clover.mend` |
| Mochi | Tank | SAND | *Shield Wall* taunt; ult *Tuxedo Fortress* | P2 | PPK `mochi.shieldWall` |
| Earl Grey | Mage | ELECTRIC | Every third spell chains | P2 | PPK service kitten |
| Pip | Assassin | DARK | Stealth in brush; ult *Midnight* execute | P2 | PPK service kitten |
| Sir Marmalade | Tank/Fighter | FIRE | Immune to knockback; ult *Nap Time* | P3 | PPK NPC |
| Princess Snowpaw | Mage | ICE | Slowed targets take more damage | P3 | PPK |
| Sgt. Whiskerbottom | Support (engage) | SAND | *Rally* haste; ult *Charge!* | P3 | PPK |
| Tofu | Fighter | FIRE | Builds a mini anvil turret | P3 | PPK forge kitten |
| Pearl | Support | WATER | Bubble shield, *Giggle* charm | P3 | PPK |
| The Token Tails Cat | Marksman | STELLAR ("Star" in game copy) | *Coin Toss*: heads stuns, tails slows (seeded, shown on the coin) | P3 | PPK `PawTricks.js` |
| Biscuit | Tank | SAND | Maine Coon; ult *Fluff Wall* | P3 | new |
| Yarna | Mage | FAIRY | Yarn lines tie enemies together | P3 | new |
| Dot | Marksman | ELECTRIC | Laser pointer redirects enemy attacks | P3 | new |

**Isle of Woof (dogs)**

| Hero | Role | Element | Signature | Phase | Source |
|---|---|---|---|---|---|
| **Sir Brutus** | Tank | SAND | *Honour* shield; ult *Champion's Challenge* duel ring | **P1** | PPK pug, `BeastHead` |
| **Cacklejaw** | Assassin | DARK | *Pack Flank* bonus from behind; ult *Pack Hunt* | **P1** | PPK `hyenaStates` |
| Lord Barkus Grimjaw | Fighter | FIRE | Cleaver hits shred armour | P2 | PPK boss art |
| Pilfer | Support (thief) | WIND | Steals buffs | P2 | PPK stealer |
| Frostbark (Husky) | Mage | ICE | Slows stack into a freeze | P2 | Quaternius Husky |
| Kibo (Shiba) | Marksman | WIND | Attack speed while moving. Never "Doge" (CLAIMS R9) | P2 | Quaternius ShibaInu |
| Waddles | Support | WATER | Pug shieldbearer; bubble shield | P3 | PPK |
| Ashfang (Wolf) | Assassin | DARK | Marks the lowest-HP hero | P3 | Quaternius Wolf |
| Bonehead Shaman | Mage | DARK | Summons Bonelings | P3 | PPK Boneheads |
| Sir Loafington (corgi) | Fighter | SAND | Curls into an unstoppable roll | P3 | new |
| Longfellow (dachshund) | Marksman | FIRE | Long line shots | P3 | new |
| Spot (dalmatian) | Mage | STELLAR | Spot marks detonate | P3 | new |
| Madame Fifi (poodle) | Support | FAIRY | Charm, pom shield | P3 | new |
| Gentle Gus (Great Dane) | Tank | GRASS | Redirects ally damage to himself | P3 | new |
| Sniffer (beagle) | Assassin | WIND | Scent trail gives vision | P3 | new |

Full numbers for the 4 POC heroes are in `POC.md` §6.

**Real shelter cats are not heroes.** The names of real Pink Paw cats (Judas, Raudvis, Zare, Simas) appear only as **Rescue coats** with a photo card, under the existing licence for names and photos. A playable hero named after a real cat would imply an endorsement and needs specific consent. Pudding stays an objective (a playable "brave mode" Pudding is a Phase 3 event idea only).

**Release cadence after Phase 3 launch:** one hero every 3 weeks, alternating cat and dog, each with a launch bundle.

---

## 6. Progression

| Track | Design | Money hook (never power) |
|---|---|---|
| **Account level** 1 to 60 | XP per match; wins and losses both pay. Unlocks pace complexity: Paw Tricks at 2/4, Duel at 3, ranked at 8 (P2) | Club +20% account XP (cosmetic track only) |
| **Free hero rotation** (P2+) | 4 heroes a week, 6 for Club. Phase 2 launch week: all free (HoK trial lesson). Free heroes at account levels 4, 7 and 10 | The offer engine shows the hero after a third match on it |
| **Hero mastery** M1 to M7 | Points from playing a hero, scored on performance. M3 emote, M5 earned recolour, M7 animated border and a "Legend" title | Epic skin offer at M3 |
| **Ranked** (P2+) | Glicko-2. Tiers Kitten → Alley Cat → Tabby → Lion → Legend (top 100), 3 divisions each. Placement 5 matches. 8-week seasons, soft reset. Decay pauses while away. Never bot backfill. Needs account 8 and 6 owned heroes (all earnable in about 15 hours) | Ranked rewards are never sold. No purchase touches MMR (decision #36, `docs/BACKEND.md` Progression) |
| **7-day Welcome Path** (P2) | Day 1 to 7 rewards. **Never resets on absence** (PEGI 7, not 12). Day 7 gives a Rare coat | none |
| **Daily** | First win of the day bonus; 3 quests from P2 with one free reroll. Missing a day costs nothing | none |
| **Faction war** (P2+) | Each win adds a point to your pledged faction. The week's winner gets a map banner and a bonus weekend | Faction skins on Monday |

Soft currency **Yarn** (P2+): about 60 to 120 per match, +150 first win of the day. Buys heroes (2,500 to 4,800), Common coats (1,500), quest rerolls. Never sold, never converted, never touches Tails. About 25 to 40 matches per hero at ~90 Yarn a match, fewer with first-win bonuses; the 3 heroes beyond the 3 free ones needed for ranked take about 13 hours.

---

## 7. Economy

### 7.1 Currencies

| Currency | Phase | Sources | Sinks | Rules |
|---|---|---|---|---|
| Talents and levels | P1+ | In-match XP | In-match power | Reset each match. No gold exists |
| **Yarn** (soft) | P2+ | Matches, quests, Welcome Path, pass free track, mastery | Heroes, Common coats, rerolls | Earned only. Never sold, never in bundles |
| **Wish Tokens** | P3 | Free-track pass tiers, events, mastery 7 | Wishing Well draws (§8.6) | **Cannot be bought, directly or indirectly**: never in the premium pass track, Pass+, Club, bundles, gifts or any paid SKU (a draw fed by a paid source is paid randomness) |
| **Purrls** (premium) | P3, only after legal review | Purchase | Skins, pass, bundles | Real price shown next to every Purrl price; pack sizes equal item prices; no cash value. Default: not built (§12) |
| Token Tails catnip | P1+ | Verified results through `POST /user/catbassadors/live` | none | Capped per difficulty in `shared/caps.ts`. Separate from any game currency |
| Token Tails Tails | P2+ | Existing quest hook ("Win a Pawlegends match") through `earnTailsInc` | Rescue Goals | Never sold, never priced, no rate (R8), never "token" (R9). Not in the POC |

**Phases 1 and 2 have no premium currency.** Everything is priced directly in € and $. This is the cleanest position under the EU CPC key principles (March 2025), the CPC action of Oct 15 2026 and the Digital Fairness Act draft expected Nov 2026.

### 7.2 Owned Token Tails cats in Pawlegends (the cross-sell)

The host page calls `GET /user/cats` (signed-in or guest session) and passes a sanitised roster over the bridge: id, name, `type` (element), `tier`, `isStarter`, `starterBreed`, `origin` (one of `CAT_ORIGINS`: starter, pack, redeem, adopt, portrait). The access token never crosses the bridge (`docs/GAMES.md`, "Bridge v1"). **Owned cats have no stored breed:** `origin` keeps only the `CAT_ORIGINS` vocabulary (`backend/src/cat/cat.schema.ts`), so a coat comes from `starterBreed` when set, else from a stable hash of the cat id into a preset coat.

| You own on Token Tails | You get in Pawlegends (cosmetic only) | Phase |
|---|---|---|
| Any cat | It walks in your minion wave as a **Companion Kitten** (name tag, coat, element colour) and naps at your fountain | P1 |
| A cat of element X | The **X element chroma** on every hero you play. Owning a FIRE cat gives fire VFX on Clem, Sage and the rest | P1 |
| RARE tier | Rare profile frame | P1 |
| EPIC tier | Epic frame + recall sparkle | P1 |
| LEGENDARY tier | Legendary frame, gold name plate, "Legend's Recall" animation | P1 |
| Starter cat (`isStarter`, `starterBreed`, 5 breeds) | A free first coat matching the breed on every cat hero | P1 |
| A shelter cat (`origin: 'adopt'`, or a cat with a `blessing`) | A **Rescue coat** with that cat's name and photo card. Copy follows CLAIMS R2/R3 | P2 |

Tier sets frames and VFX intensity only. No stat effect anywhere.

**Revenue effect, without importing paid randomness.** Token Tails packs give random tiers, so the game **never links to, names or advertises packs**, in any build. The in-game "Get more coats" button (web only, hidden in app builds) opens the host's direct-purchase cats (named shelter cats at a fixed price), never the packs page. Tier frames apply to every owned cat whatever its origin, including cats from packs bought before; whether pack-origin tiers should count at all is founder decision #19. Game copy has no money words.

---

## 8. Monetization (revenue-first, fair)

### 8.1 Principles

1. **Never sell power, rank or MMR.** Heroes are sold but every hero is earnable with Yarn. Ranked is skill only.
2. **No paid randomness, ever, direct or indirect.** Randomness appears only as draws paid with an earned-only currency that no paid SKU grants (P3), with published odds and pity. The game never links to the Token Tails random packs (§7.2). Reasons: Belgium, PEGI 16 for paid random items (from June 2026), Brazil's ECA Digital, the CPC action and the DFA draft.
3. **Real prices.** € or $ on every item. Bundle savings are computed against prices actually charged. Timers are genuine and set by the server. No fake scarcity, no "never sold again".
4. **No offer card in the first session.** The store button is always in the lobby, but nothing is pushed until session 2.
5. **One offer card per session at most.** Never in matchmaking, hero pick, loading or a match. Only in the lobby or on the results screen.
6. **Minors.** Checkout asks for an age band once. Under 16: checkout is blocked with an "Ask a parent or guardian to buy this on their own device" message. 16 to 17: a €30 per 30 days cap. 18+: a soft €200 per 30 days cap that the player can raise by email to support. Server-enforced per account, email and device. Analytics wait for consent and carry no personal data; the game has no chat and no free-text names until moderated names arrive in the MVP.
7. **Never take free rewards away after launch** (the LoL Hextech lesson).
8. **No NFTs, tokens, chain or USDC words in the game iframe.** It ships inside the Capacitor `public/` (CLAIMS R10; PEGI 18 for NFT mechanics). Crypto checkout, if ever offered, lives on the host web page only.
9. **Shelter copy:** Token Tails is the subject of money verbs ("Token Tails sends Pink Paw ...") with a claim id (R2/R3); no giver counts (R6); `tools/copy-lint/` must pass. A `shelterShareBps` shown at checkout is a new public claim and needs a verified CLAIMS fact first (`docs/plans/payments-STATUS.md` Open). Until then, only the charity item carries a share.
10. **Web only until IAP.** App builds show `AppCheckoutNotice` ("Purchases are not available in the app yet.") instead of the store (`docs/MOBILE.md`, "Purchases"), show no offers, and **do not render web-bought items**: Apple 3.1.3(b) lets an app unlock content bought elsewhere only if it is also sold as IAP in the app, which waits for Phase 3.
11. **Tax.** Prices are VAT-inclusive. EU VAT on digital sales (Lithuanian VAT below the €10,000 EU cross-border threshold, OSS above it) is confirmed with the accountant before Stripe live mode (decision #17).

### 8.2 Phase 1 store (POC, web, Stripe)

Pattern: Bad Cat per-game Stripe (`BADCAT_SKUS` in `backend/src/badcat/badcat.contracts.ts` with inline `price_data`, `badcat-stripe.service.ts`, `badcat-webhook.service.ts`, signed entitlement token like `badcat-token.ts`, restore by email). Bad Cat charges USD only and inline `price_data` has no currency options, so the Pawlegends table holds a USD and a EUR row at the same numbers and the host picks one per session (`POC.md` §8.1).

| SKU | Price | Contents | Delivered | Purpose |
|---|---|---|---|---|
| `pl_starter` | **$0.99 / €0.99**, once per account and email | "Pink Bow Clem" Rare skin + "Starter" emote + 3-day Pride Club trial (bonus, activates at MVP) | Skin and emote now | Day-1 converter. Offered from session 2, after the first win, with a genuine 48 h window |
| `pl_founder` | **$9.99 / €9.99** | Founder Epic coat for every POC hero (gold-trim cape line from PPK capes data), animated Founder frame, Founder title. At MVP launch: 4 MVP heroes of your choice, the Season 1 Legends Pass premium, name in the in-game credits | Coat, frame, title now; heroes, pass, credits at MVP | The main POC KPI |
| `pl_founder_legend` | **$29.99 / €29.99**, first 500 (a real cap, creator codes included; the counter is real) | Everything in Founder, plus "Dawnblade Clem" Legendary skin (PPK `dawnblade` sword + new VFX), Legend frame. At MVP: **all 8 MVP heroes**, Legends Pass+ for Season 1, 1 month of Pride Club, your name on the Founders' Banner on the map | Skin and frame now; heroes, pass, Club, banner at MVP | Anchor and whale entry. Shown next to Founder |
| `pl_founder_legend_upgrade` | **$20.00 / €20.00**, Founder owners only | The difference, computed against the price actually paid | as above | Lets the anchor work after a Founder purchase |

Names in the credits and on the banner wait for the MVP because they need an opt-in and moderation (`normalizeCatName`, `isBlockedCatName` in `shared/name.ts`).

**My Cat Hero ($9.99) moves to the MVP store** (§8.5). It needs a coat-builder UI (pattern, colours, eyes, markings; Bad Cat's `CatSpec` encoding can be reused), which does not fit the 3-week POC. The photo path (Bad Cat `src/catmaker/` face-from-photo) ships only after the `/yourcat` launch checklist items for consent and controller details are done (`docs/YOURCAT.md`).

**Not in the POC store:** My Cat Hero, skins à la carte, the pass, Club, the charity item, billboards. The POC tests three price points ($0.99, $9.99, $29.99) and the anchor effect, not catalogue breadth.

**Free demand signal next to the paid one:** a "Legends Pass: notify me" email capture (no charge).

### 8.3 Presale terms (written before taking any money)

Founder packs promise items that arrive only at MVP launch. If the Phase 1 kill gate stops Phase 2, those buyers are owed something. Rules:
- Checkout shows two lines: "Delivered now: ..." and "Delivered at MVP launch (target 2027-04-30): ...".
- Terms page `/pawlegends/terms` (host page, live before Stripe live mode in POC M4) states:
  - If the MVP is not live by **2027-06-30**, any Founder buyer can ask for a full refund for 60 days after that date, by email, no questions. Items delivered now stay with them.
  - If the founder decides to stop the MOBA earlier, every Founder buyer is emailed within 7 days with the refund offer.
  - EU withdrawal: the buyer explicitly consents to immediate delivery of the "now" items and acknowledges loss of the 14-day withdrawal right for those items only. The deferred items keep the withdrawal right until delivered.
- Stripe metadata records `deferred: true` and the terms version, so refunds can be issued from a script.
- `pl_starter` contains only items delivered now (the Club trial is a bonus, not the paid item).
- A refund under these terms refunds the whole SKU price, including the share that paid for "now" items.

### 8.4 Offer engine (server-driven)

`GET /pawlegends/offer` returns at most one offer, or none. The game shows it only in the lobby or on results.

| Trigger | Offer | Cap | Phase |
|---|---|---|---|
| Session ≥ 2 and the first win is done | `pl_starter`, 48 h window starting when first shown | Once per account | P1 |
| 3rd completed match | Founder vs Founder Legend side by side | Once; again after 7 days if not bought | P1 |
| 5th match, or a player with owned cats | My Cat Hero | Once | P2 |
| 3rd match on a trial hero | That hero, plus a bundle with its best skin | Once per hero | P2 |
| Hero mastery 3 | That hero's Epic skin | Once per hero | P2 |
| Ranked blocked by owning fewer than 6 heroes | "3 heroes for $9.99" bundle | Once a season | P2 |
| Season start | Pass / Pass+ | Once a season | P2 |
| Lapsed 14 days | Free comeback gift (earned only) + Club trial | Once per lapse | P2 |

Global caps: 1 card per session; none in session 1; none for an account that hit its spend cap; none in app builds.

### 8.5 Phase 2 store (MVP, still direct prices)

| SKU | Price | Notes |
|---|---|---|
| Hero unlock | $3.99 (or 2,500 to 4,800 Yarn) | Every hero earnable |
| Hero launch bundle | hero + Epic skin + emote, about 25% off the sum ($11.99 vs $3.99 + $9.99 + $1.99 = $15.97) | Per new hero |
| Emote | $1.99 | Also earned through mastery |
| Common coat | $2.99 or 1,500 Yarn | Coat configs cost close to nothing |
| **My Cat Hero**, coat builder | $9.99 | Your cat's coat, eye colour, markings and name on one cat hero of your choice; one per hero. Name moderated |
| Rare skin | $4.99 | New prop and cape |
| Epic skin | $9.99 | New VFX and recall |
| Legendary skin | $19.99 | New model parts, VFX set, voice babble, custom ult |
| My Cat Hero, photo version | $14.99 | Only after the `/yourcat` checklist; coat-builder version stays $9.99 |
| **Legends Pass** (8-week season, **never expires**, Marvel Rivals model) | $7.99 | 50 tiers: 3 skins (1 Rare, 1 Epic, 1 Legendary at tier 50), coats, emotes. Free track for everyone |
| Legends Pass+ | $19.99 | Pass + 15 tier skips + an exclusive Epic chroma. Skips are cosmetic progress only |
| **Pride Club** subscription | $4.99/mo or $39.99/yr; **Founding $24.99 for year one, 200 seats** | Monthly Club coat, 6-hero rotation instead of 4, +20% account XP, Club frame, replay archive, 2 free quest rerolls. Not the pass. Reuses Bad Cat's subscription, founding coupon and customer portal |
| Faction bundle | 3 faction skins for $14.99, during faction war week | Real prices, no timer beyond the real week |
| Cameo minion | $4.99 per season | Your cat (name normalised with the Rave `normalizeCatName` rules, moderated) walks in your team's wave for everyone in your matches |
| **Shelter Bow** (charity cosmetic) | $4.99 | Labelled as a donation. "A donation. Token Tails sends the net to Pink Paw [claim id]." The name avoids "Pink Paw" until approval. Bad Cat collar precedent; card share via the keeper `rail:'card'` rows |
| **Arena billboards** (B2B) | $100 per 30 days per slot (6 slots); "Sponsor of the Week" lane banner $499 | `backend/src/rave/ads/rave-ads.config.ts` pattern. No pressure on players |

### 8.6 Phase 3 additions

- **Purrls** premium currency and a first-purchase double per pack tier ($0.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99), only if a legal review after the DFA draft allows it. Real price shown beside every Purrl price; pack sizes equal item prices. Default: **not built** (§12).
- **Weekly Treat Pass** $1.99 (only with Purrls; a daily drip with no loss for missed days).
- **Signature skins** $49.99, direct purchase only, 1 to 2 a year. Unique parts, VFX, announcer, kill poof, fountain statue.
- **Mythic Collection** $99.99: 5 seasonal Legendaries + an exclusive "Pudding-ride" recall. Only unowned items are counted, so owners pay less.
- **Wishing Well** (earned-only draw): paid only with Wish Tokens, which no paid SKU grants (§7.1). Odds per item published in the store before each pull, in the app as well (Apple 3.1.1, Google Play); a pull history the player can view. Hard pity at 40 pulls for the featured Epic. Duplicates convert to Yarn. Every Well item can be bought directly after the event, so nothing exists only behind randomness. Hidden for the under-16 band until a legal review says otherwise.
- **Mystery Mews:** $4.99 "choose 1 of 3": the 3 options are shown **before** payment and the buyer picks one; nothing is random after the money moves. Collection thrill, not a loot box.
- **Gifting** (Bad Cat `gift_*` pattern), **creator codes** (20% for 6 months, Bad Cat GDD §9).
- **RevenueCat IAP** for iOS and Android. Native prices may rise only where store fees force it; the web keeps base prices where anti-steering rules allow.

**What we never sell:** stats, rank, MMR, Yarn, Wish Tokens, Tails, paid draws, paid tier skips on ranked.

### 8.7 Offer calendar

| When | Offer | Price | Notes |
|---|---|---|---|
| POC launch (Thu Nov 12 2026) | Founder + Founder Legend presale opens | $9.99 / $29.99 | Founder Legend capped at 500 |
| POC, rolling | Starter (session 2+) | $0.99 | Offer engine |
| Nov 27 2026 23:59:59 UTC | Token Tails Legendary pack sale ends ($100 → $350) | host | Nothing in the game: it never mentions packs (§7.2) |
| Dec 2026 | "Winter Nap" coat (free, earned by playing) | free | Retention, not revenue |
| MVP launch (target Apr 2027) | Founder deliveries; Season 1 Legends Pass; Pride Club founding seats (200) | $7.99 / $19.99 / $24.99 | Founding seats close when sold out (real counter) |
| MVP week 1 | All heroes free; launch bundles for each new hero | $11.99 | HoK trial lesson |
| Every Monday (MVP+) | Faction bundle for the faction war week | $14.99 | Real week window |
| Every 3 weeks (P3) | New hero + launch bundle | $11.99 | Alternating cat and dog |
| Season start, every 8 weeks | New pass; ranked reset | $7.99 / $19.99 | Pass never expires |
| Halloween (Oct) | "Bonehead Night" event skins | $9.99 to $19.99 | Direct purchase |
| Lunar New Year (Jan/Feb) | Event skins + Mythic Collection | $19.99 / $99.99 | HoK's biggest month |
| Summer | "Sunbeam Festival" | $9.99 to $49.99 | Signature skin slot |

### 8.8 Revenue model (assumptions to replace with measured data)

These are benchmarks, not forecasts. FY2025 platform revenue was €105.

| Stage | MAU | Payer % | ARPPU / mo | Club | Other | Monthly |
|---|---|---|---|---|---|---|
| POC window (4 weeks) | 300 to 1,000 finishers | 2 to 3% | about $12 (mix of $0.99, $9.99, $29.99) | – | – | $70 to $360 (one-off) |
| MVP | 5,000 | 3% | $12 | 100 × $4.99 | 2 billboards $200 | about $2,500 |
| Full, with IAP | 50,000 | 3.5% | $15 | 900 × $4.99 | billboards, Signature | about $31,000 |

The POC money number is not the point; the conversion rate and the mix between the three Founder price points are.

---

## 9. Tech architecture

### 9.1 Principles

1. **New package, selective lift.** PPK's `src/` is about 100k lines and story-coupled. We copy only pure or near-pure modules with `pawlegends/tools/lift-ppk.mjs`, which writes a provenance header (PPK commit, source path, licence note). Never import across repos.
2. **Deterministic integer sim** in TypeScript, the Bad Cat and Heist approach: 30 Hz, integer maths only, seeded RNG, `SIM_VERSION`. **No PPK gameplay code enters `src/sim/`** (PPK's sim uses floats and is not lockstep-safe). PPK numbers and kits enter as data only.
3. **Client/server from day one.** In the POC the sim runs in a Web Worker called **LocalHost**. It speaks the exact protocol the Phase 2 match server will speak over WebSocket: inputs in, team-filtered snapshots and events out. The renderer only consumes snapshots.
4. **Bots live inside the sim.** A bot match replay is `{simVersion, seed, mode, difficulty, picks, humanInputs[]}`, and the backend re-sims it exactly.
5. **Juice lives in the renderer only.**
6. **Strict budgets in CI from day 1.** Pawlegends must not repeat PPK's 63 MB embed.
7. **No feature flags.** On by default, gated only on required secrets. The one off switch is a kill switch, `NEXT_PUBLIC_PAWLEGENDS=0`. Bad Cat's `BADCAT_*_ENABLED` flags are not copied.

### 9.2 Packages and paths

| Path | What | Phase |
|---|---|---|
| `pawlegends/` | Client: three ^0.186 + Vite 8 + TypeScript strict + Vitest + Playwright, port 5176 (5175 is Pink Paw Knight's dev server). `npm run build:client` writes `client/public/pawlegends-game/` | P1 |
| `pawlegends/src/sim/` | The integer sim. Pure TS, no three.js or DOM, Node-importable | P1 |
| `pawlegends/src/host/` | `protocol.ts` (shared with the server) and `local-host.worker.ts` | P1 |
| `backend/src/vendor/pawlegends-sim/` | Vendored sim via `pawlegends/tools/vendor-sim.mjs` (Bad Cat pattern), `--check` deploy gate. Generated, never edited | P1 |
| `backend/src/pawlegends/` | SKUs, Stripe, webhook, entitlement token, offer engine, `/live` verifier (in a worker thread), controller. Registered in the single `AppModule` | P1 |
| `client/pages/pawlegends/index.tsx`, `client/pages/pawlegends/terms.tsx`, `client/components/pawlegends/` | Host page (a plain import like `/swordcat`; the iframe needs no `next/dynamic`), bridge, roster bridge, checkout and terms | P1 |
| `pawlegends-server/` | Colyseus match server running the vendored sim, on its own DigitalOcean droplet | P2 |

### 9.3 What we lift from Pink Paw Knight

Paths are relative to the Swordcat repo (`../swordcat/` next to this monorepo).

| Need | PPK source | Treatment |
|---|---|---|
| Iso camera | `src/camera/IsoRig.js`, `Picker.js`, `Occluders.js`, `CameraShake.js` | Lift; retune distance and pitch in data |
| Input model | `src/core/Input.js` (`moba` + `hybrid` presets, rebinding) | Lift; strip story actions; emit sim commands |
| Orders | `src/player/Orders.js` | Lift the intent layer only (markers, Shift-queue UI). Orders become sim commands |
| Touch | `src/ui/touch.js`, `ui/touchLayout.js`, `ui/touchEditor.js` | Lift; actions become Q/W/E/R/D/B + attack, last-hit, tower |
| Aim and targets | `src/companions/abilityAim.js`, `src/player/Aim.js`, `src/combat/targeting.js` | Client preview; the scorer is **ported to integers inside the sim** so auto-target is deterministic |
| Indicators and VFX | `src/fx/GroundDecals.js`, `Telegraphs.js`, `DamageNumbers.js`, `Shockwaves.js`, `Particles.js`, `Horde.js` | Lift, pool, instance; driven by sim events |
| HUD | `src/ui/abilityBar.js`, `hpBars.js`, `inputGlyph.js`, `messages.js`, `ui.css` tokens | Lift; DOM/CSS HUD |
| Look | `src/core/toon.js`, `PostFX.js`, `characters/Outline.js`, `Readability.js` | Lift; bloom and outlines off on Low |
| Heroes | `src/characters/KittenBuilder.js` (`lite`), `Poses.js`, `BeastHead.js`, `BeastDress.js` | **Bake offline** to shared-skeleton GLBs; no per-frame procedural `animate()` |
| Pathfinding | `src/physics/Pathfind.js` (A*, typed-array heap) | Port to integer costs in the sim on a baked 1 m grid |
| Audio | `src/audio/AudioManager.js` subset, `sfxDefs.js` (zzfx) | Lift subset |
| Embed | `src/core/embed.js`, `scripts/copy-to-tokentails.mjs` | Pattern only; namespace `tt-pawlegends` |
| Tooling | `scripts/optimize-glb.mjs`, `prune-assets.mjs`, `bundle-budget.mjs` | Copy |

**Not lifted:** `Player.js`, `Enemy.js`, `FollowCamera.js`, `Physics.js` and the heightfield stack, story, cutscenes, the 184 MB asset tree.

From the monorepo: `catnip-heist/src/sim/{rng,replay,hash}.ts` patterns, `catnip-heist/src/render/quality.ts` (FPS-probe governor), `catnip-heist/src/onboarding/` (ghost paws), `client/components/heist/heistSaves.ts` (offline save queue), `bad-cat/tools/{budget,vendor-sim}.mjs`, `bad-cat/src/platform/{posthog,entitlements,checkout,pwa}.ts`, `bad-cat/src/money/paywall.ts`, `bad-cat/src/share/` (clip and OG export).

### 9.4 Sim design

- **Units:** integers held in JS numbers. Positions in mm, angles in 1/4096 turn, HP and damage as ints, time in ticks. Products stay below 2^53; division goes through `idiv` (truncates). Trig and sqrt from tables.
- **Tick:** 30 Hz. Safety end at 11:00 = 19,800 ticks.
- **State:** structure-of-arrays typed arrays. Full-game caps: 6 heroes, 48 minions, 8 towers, 2 cores, 16 monsters, 64 projectiles, 32 zones (POC caps in `POC.md` §4.1).
- **Commands per player per tick:** `move(x,y)`, `attack(id)`, `attackMove(x,y)`, `cast(slot,x,y,id)`, `trick(x,y)`, `stop`, `nap`, `talent(tier,choice)`.
- **Vision:** fog on a 2 m grid from team units and towers (MVP; the POC has brush only, `POC.md` §7.3); brush hides units inside from enemies outside. Bots read only what their team sees. LocalHost filters snapshots by team, the same way the server will.
- **Determinism CI:** a lint test forbids `Math.random`, `Date`, `performance`, float literals in arithmetic, `Math.sin/cos/sqrt/pow`, and iteration over `Object.keys`, Map or Set in `src/sim/**`. A state hash (FNV-1a over the typed arrays) every 30 ticks.
- **Re-sim cost:** a full bot match must simulate headless in **≤ 1.0 s** on one core (≤ 1.5 s at the 11:00 maximum), so backend verification and the Phase 2 server stay cheap. The backend runs it in a `worker_threads` worker behind its own bounded queue: the Heist replay queue runs on the main thread only because its replays take under 50 ms p95 (`backend/src/user/heist/replay-queue.ts`), and a second-long replay there would stall the single-instance API.
- **Units:** speeds in mm per second with a per-unit fraction carry, durations in ticks rounded from seconds (`POC.md` §4.2).

### 9.5 Rendering budgets (CI gates)

| Budget | POC | MVP |
|---|---|---|
| First-load JS (entry + three) | ≤ 450 KB gzip | ≤ 500 KB gzip |
| Total `client/public/pawlegends-game/` | ≤ 10 MB | ≤ 20 MB, assets on a CDN (`NEXT_PUBLIC_PAWLEGENDS_URL` location override, not a flag) |
| Draw calls, mobile Low, full teamfight | ≤ 70 | ≤ 80 |
| Frame time, iPhone 11 / Pixel 6a landscape Low | p95 ≤ 33 ms | same |
| Desktop Med, Iris Xe 1280×720 | p95 ≤ 16.7 ms | same |
| JS heap | ≤ 150 MB | ≤ 150 MB |
| Per hero | ≤ 6k triangles, 1 draw call, ≤ 250 KB | same |

Heroes: 1 skinned mesh each, shared skeletons, a 256² palette texture. Minions: `InstancedMesh`, vertex-shader bob, no skinning (about 2 draw calls for all). Map: merged static chunks with baked AO.

### 9.6 Networking (Phase 2)

| Option | Verdict |
|---|---|
| POC: bots, sim in a Worker, backend re-sim on save | ✅ No server cost |
| Lockstep P2P | ❌ Cannot protect fog (map hacks), one slow phone stalls everyone, tab pause breaks it |
| **MVP: authoritative server running the vendored sim** | ✅ Chosen |
| Framework | **Colyseus** (rooms, matchmaker, reconnection) with our own binary snapshot messages, not Colyseus Schema. Plain `ws` is the fallback if load tests show overhead |
| WebRTC UDP (geckos.io) | ⏸ Only if MVP data shows TCP stalls in more than 5% of matches |
| Run on the NestJS box | ❌ The backend is single-instance HTTP (`docs/DEPLOYMENT.md:36`); sim CPU would starve the API |

- `pawlegends-server/` on its own DigitalOcean droplet, EU-Frankfurt first (about $12 to $24 a month per 2 vCPU). A load-test spike in MVP week 1 measures matches per vCPU. A second region (US-East or SG) only in Phase 3, by demand.
- Server ticks at 30 Hz, sends 15 Hz delta snapshots filtered by team vision. The client predicts its own hero's movement only and reconciles; others are interpolated from a 100 ms buffer. Casts show a local wind-up at once; the server confirms.
- **Auth:** the host calls `POST /pawlegends/match/ticket` with `accesstoken` and hands the iframe an opaque single-use ticket valid for 60 s. The token never crosses the bridge.
- **Matchmaking:** in-memory queue on the match server; MMR read from and written through the backend. After 20 s the queue backfills with Normal bots (casual only, never ranked). No lobby waits more than 30 s.
- **Reconnect:** rejoin by `matchId` within 90 s; a bot pilots the hero meanwhile.
- **Results keep the single write path:** the match server signs `{matchId, seed, simVersion, picks, inputsHash, outcome}` with HMAC. The host posts it with the input log to `POST /user/catbassadors/live`, branch `PAWLEGENDS`. The backend checks the signature and re-sims ranked matches and a sample of casual ones. A 6-player input log can exceed the 64 KB `/live` body limit (`LIVE_GAME_BODY_LIMIT`), so Phase 2 measures it and raises the limit for this type only (the route parser in `src/user/heist/live-body-limit.ts`), never with a second endpoint.

### 9.7 Platform contracts (every copy)

- `GameType.PAWLEGENDS` in `shared/enums.ts` only, then `node scripts/sync-contracts.mjs` (it writes the backend, client, cms and Heist copies). `GameType` has no hand-kept copy; the hand copies in `backend/src/cat/cat.schema.ts` and `client/models/cats.ts` are `Tier` and `CatAbilityType`, which this game does not change. The places that do need a line (`liveGameTypes` but not `scoredGameTypes` in `backend/src/game/game.schema.ts`, the `/live` DTO and controller branch, the replay IP guard, the exhaustive `Record<GameType, …>` maps in `EndGameModal.tsx` and `audio/tracks.ts`, `shared/__tests__/enums.test.ts`, `docs/DEVELOPMENT.md`) are listed in `POC.md` §3.1.
- Caps in `shared/caps.ts` in the Heist shape: `PAWLEGENDS_LEVELS`, `PAWLEGENDS_LEVEL_CAPS`, `PAWLEGENDS_TICK_HZ`, `PAWLEGENDS_MAX_TICKS`, `PAWLEGENDS_MAX_INPUT_CHARS`.
- Save only through the replay-verified `PAWLEGENDS` branch of `/live` (Heist and Bad Cat precedent), never the plain scored-type path. On by default.
- `tools/copy-lint/` gets a `pawlegends` target (it scans client, heist, backend and cms today, not game packages such as `bad-cat/`).
- Docs at build time: `docs/GAMES.md` section, `docs/API.md` endpoints, `docs/CLIENT.md`, `docs/BACKEND.md` secret names, the root `CLAUDE.md` package table row.

### 9.8 Mobile and IAP

- The game plays in the Capacitor app (it ships in the app's `public/` copy); the store is replaced by `AppCheckoutNotice`, offers are off, and web-bought items are not rendered until the same items are sold through IAP (Apple 3.1.3(b)). Owned Token Tails cats still show as cosmetics, as they are not Pawlegends purchases.
- The `/game` picker card for Pawlegends is web only in Phases 1 and 2.
- Phase 1 and 2 revenue is **web only**.
- Phase 3: RevenueCat with Apple and Google IAP, odds UI for the Wishing Well (Apple 3.1.1, Google Play rules).

---

## 10. Rollouts

### 10.1 Phase 1: POC "First Blood" (build Thu Oct 22 to Wed Nov 11 2026, launch Thu Nov 12)

- **Goal.** Prove four things before paying for servers:
  1. **Core loop:** an 8-minute 3v3 cats vs dogs match against bots is fun on a phone and a laptop, and players start a second one.
  2. **Purchase loop:** tap Buy in the game, pay on the web, come back, see the item on your hero in the next match.
  3. It runs in the performance budget on a mid-range phone.
  4. People pay for it.
- **In scope:** Purrhaven Crossing with 2 lanes, outer and inner towers, cores, waves with siege units, 1 rat camp per side, Pudding, 4 Catnip Bushes and the full timeline rails (Sunset, Sudden Death, safety end); 4 heroes (Clem, Sage, Sir Brutus, Cacklejaw) with talents; 3 Paw Tricks; bots at Easy and Normal; the minimum desktop and landscape touch controls; a first match with event-triggered tips; dare links; owned cats as chromas, frames, starter coats and Companion Kittens; replay-verified save through `/live`; a 3-SKU web store (plus the upgrade) with offer engine, terms, age bands and spend caps; PostHog funnel; guest-first, no account needed to play.
- **Out of scope (MVP):** fog of war, Grizzlechop, crow roosts, Hard bots, the tutorial map, the Welcome Path, Legend Moment clips, My Cat Hero, advanced controls, and everything in `POC.md` §16. Never in the POC: PvP, ranked, Yarn, the pass, Club, premium currency, IAP, 5v5, other modes, chat, portrait.
- **Effort:** 2 developers with AI agents, 15 working days (Dev A: sim, bots, heroes; Dev B: client, input, HUD, backend, store, embed). With 1 developer, about 5 weeks (launch about Nov 26). The cut order if a milestone slips is in `POC.md` §14.
- **Measurement window:** 4 weeks after launch (to Thu Dec 10 2026). Humans only: a session counts only if it has real pointer or touch input and a match of at least 60 s (the Heist lesson: 8,000 bot runs to 1 human).

**Success metrics**

| Metric | Target |
|---|---|
| Human players who finish ≥ 1 match | ≥ 300 |
| First sessions that finish a match | ≥ 60% |
| Players who start a 2nd match within 24 h | ≥ 35% |
| D1 retention | ≥ 25% |
| D7 retention | ≥ 8% |
| Median match length | 7:00 to 9:00 |
| Purchases (any SKU) | ≥ 15, or ≥ 2% of finishers |
| Founder + Founder Legend purchases | ≥ 10 |
| Buyers who play a match with the bought item within 24 h | ≥ 70% (purchase loop works) |
| Mobile p95 frame time | ≤ 33 ms on the reference phones |
| "Notify me" signups | ≥ 10% of finishers (free demand signal) |

**Kill gates (two kinds, kept apart)**

| Gate | Condition | Action |
|---|---|---|
| **Acquisition failure** | Fewer than 300 human finishers after the 4-week window and the full distribution budget | **Pause.** Do not build Phase 2. The problem is reach, not the game. Re-test only with a new channel |
| **Monetization failure** | ≥ 300 finishers but fewer than 5 purchases | **Stop the MOBA.** Keep the sim and heroes as Kibble Swarm PvE inside Token Tails, or fold the kits into PPK |
| **Fun failure** | D1 under 15%, or under 35% start a 2nd match, after two tuning passes | Stop, or pivot to Litterbox Rumble or Swarm on the same sim |
| **Length failure** | Median under 5:00 or over 10:00 after two tuning passes | Rework the map and timeline before any Phase 2 decision |
| **Performance failure** | Mobile p95 over 50 ms after one optimisation pass | Go desktop-first for Phase 2 |

If a kill gate fires, the presale refund promise in §8.3 applies.

### 10.2 Phase 2: MVP "Season 1" (12 to 16 weeks after the gate, target launch Apr 2027)

- **Goal.** Real PvP retention and recurring revenue (pass and Club) on the web.
- **First, the POC carry-overs:** fog of war, Grizzlechop, crow roosts and the full jungle, Hard bots, the tutorial map, the 7-day Welcome Path, Legend Moment clips and the share card, the remaining controls (Shift-queue, Brawler preset, rebinding, gamepad, Edit layout, left-handed mirror, Last-hit and Tower buttons), own-hero prediction and reconcile with the netsim option, My Cat Hero (coat builder), moderated Founder names in the credits and on the banner.
- **In scope:** `pawlegends-server/` (Colyseus, one EU region) with matchmaking, bot backfill after 20 s, server-side fog and reconnect; casual and ranked 3v3, co-op vs bots, Duel, custom rooms by link; 12 heroes; Yarn, account level, mastery, free rotation, daily quests; the full Phase 2 store (§8.5); offer engine Phase 2 rows; Founder deliveries; faction war; Rescue coats; billboards; Shelter Bow with a claim id; parties and invite links; report and block, quick pings and emotes only (no free text, which avoids PEGI 18); PWA install; CDN assets.
- **Out of scope:** IAP, premium currency, 5v5, rotating modes, second region, spectating.
- **Effort:** about 12 to 16 weeks. Netcode and server about 45%, 8 heroes about 25%, store and meta about 30%.

| Metric | Target (4 weeks after launch) |
|---|---|
| D1 / D7 / D30 | ≥ 30% / ≥ 12% / ≥ 5% |
| Median queue | ≤ 30 s, with ≤ 50% bot slots at peak |
| Peak CCU | ≥ 150 |
| Payer conversion | ≥ 2.5% |
| ARPPU | ≥ $12 |
| Club subscribers by end of Season 1 | ≥ 100 |
| Pass attach | ≥ 5% of MAU |
| Desync or reconnect failure | < 0.5% of matches |
| Server cost | < 10% of revenue |

**Kill criteria:** bot slots above 80% at peak for 4 weeks, or D7 under 6% after two balance patches, or under $1k a month by Season 1 week 8. Then freeze PvP as "PvP weekends", keep the bot game as a free funnel title, and move effort to acquisition.

### 10.3 Phase 3: Full "Legends" (6 to 9 months, staged by revenue)

- **Goal.** A complete live-service game on web and app stores.
- **In scope:** 30 heroes (15 + 15), then one every 3 weeks; Grand Clash 5v5 on a 3-lane map; Litterbox Rumble and Kibble Swarm rotating; a second map (Moonlit Garden); seasonal events (Bonehead Night, Lunar New Year, Sunbeam Festival); Signature skins, Mythic Collection, Wishing Well (earned only, odds published, pity 40), Mystery Mews; gifting and creator codes; Purrls only if the legal review allows; RevenueCat IAP; a second region; spectating and replays (nearly free with a deterministic sim); clans; weekly in-client cups (no cash prizes, or sponsor-paid); localisation EN, LT, ES, PT-BR (with ECA Digital checks), ID.
- **Effort:** 1 to 2 developers plus a contract artist for skins and bespoke ults.

| Metric | Target |
|---|---|
| MAU | ≥ 20,000 |
| D30 | ≥ 6% |
| Payer conversion | ≥ 3.5% |
| Net revenue | ≥ $15k a month by month 6 |
| App-store rating | ≥ 4.3 |

**Kill or scale:** revenue under $5k a month for 3 months after IAP launch → stop new heroes, run seasonal recolour passes only. IAP revenue under 1.5× store fees plus review overhead → stay web-first.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Acquisition** (about 30 active players in 30 days; Supervive and Arena of Valor died with empty queues) | Funded distribution plan (§11.1); bots-first so the game is complete offline; dare links and clips as the free growth loop; separate acquisition kill gate |
| **Scope and the new sim** (integer sim and bots in 3 weeks, cross-engine determinism) | Talents, not items; no gold; no fog in the POC; 2 bot levels; 4 heroes on 18 primitives; two developer lanes; a written cut order (`POC.md` §14); determinism lint and Node/Chromium/WebKit hash test from day 1 |
| **Phase 2 netcode** (prediction, reconcile, reconnect, matchmaking) | Same protocol in the POC Worker with a latency simulator; Colyseus load-test spike in MVP week 1; one region first |
| **Mobile performance and size** (PPK at 100 to 111 draw calls, 63 MB) | Baked single-mesh heroes, instanced minions, merged map, budgets in CI from M0; 10 MB POC cap |
| **Presale liability** | Written terms, deferred items shown at checkout, refund window if the MVP is late or stopped (§8.3) |
| **Spend-pressure ethics and EU law** (CPC action Oct 15 2026, DFA draft) | No premium currency in P1 to P2; no paid randomness; genuine timers; real prices; no offer in session 1; one card per session; age bands and spend caps; no "never sold again" |
| **Loot-box law** | Zero paid randomness. Earned draws publish odds. Pack page must publish odds before Pawlegends links to it |
| **Trademark** | Coined mark; EUIPO, USPTO and store searches before public use; no LoL terms |
| **Claims** | `tools/copy-lint/` on all strings; no shelter or money words in game copy; Shelter Bow only with a claim id; no share shown at checkout without a fact; "Pink Paw" not used in names until approval |
| **Mobile revenue is zero until IAP** | Web-first; PWA install; RevenueCat in Phase 3 |
| **Privacy for photo skins** | POC uses the coat builder only; photo path waits for the `/yourcat` checklist |
| **Licence and provenance** | `lift-ppk.mjs` provenance headers; founder decision #3 recorded before M0 |
| **Process rules** | No `*_ENABLED` flags; every `GameType` and caps copy updated; scores only through `/live` |
| **Opportunity cost** (open funding work; Arbitrum Dubai build Nov 16 to Dec 4) | Start after Oct 21; the 3-week build ends Nov 11, before the Dubai window opens. With 1 developer the build runs to about Nov 26 and overlaps Dubai (decision #15) |
| **Replay CPU on the API box** | Re-sim in a worker thread behind a bounded queue with 429 + `Retry-After`; ≤ 1.0 s per match target |
| **App store rules** | No store, offers or web-bought items in app builds until IAP (Apple 3.1.3(b)) |

### 11.1 Distribution plan for the POC (funded)

Without 300 human finishers no gate can be read. Default budget: **€1,500**.

| Channel | Budget | Target |
|---|---|---|
| Token Tails email list (opted-in users only) and the `/game` lobby card | €0 | 150 finishers |
| Short-video paid test (TikTok, Instagram Reels, YouTube Shorts) using screen-captured match moments (the in-game Legend Moment clip is MVP), web landing at `/pawlegends` | €1,000 | ≤ €2 per finisher → 500 finishers |
| 20 small cat and mobile-gaming creators: a Founder Legend code each (counts toward the 500 cap) + €25; posts labelled as ads (#ad) | €500 | 100 finishers |
| Dare links, X posts, Reddit (r/WebGames, r/MobaGames rules permitting), itch.io page | €0 | 50 finishers |

Spend in two tranches: €500 in week 1 after launch, the rest only if cost per finisher is under €4.

---

## 12. Founder decisions ("Your call", defaults apply)

| # | Decision | Default |
|---|---|---|
| 1 | Final name | **Pawlegends**. TM searches before any public use |
| 2 | Start date and team | **Thu 2026-10-22**, after Tameion, the Anitya main jam and the Arc decision; **2 developers with AI agents**, launch Nov 12. With 1 developer, launch about Nov 26 |
| 3 | PPK code licence and provenance (lifting from the all-rights-reserved swordcat repo into the public monorepo) | Lift with provenance headers; same owner; `pawlegends/` README states "all rights reserved, pending", same as PPK |
| 4 | Founder presale in the POC | **Yes**, $9.99 and $29.99 (Legend capped at 500, creator codes included) plus the $20 upgrade, with the §8.3 terms |
| 5 | Starter $0.99 in the POC; My Cat Hero $9.99 | Starter **yes**. My Cat Hero **moves to the MVP** (coat-builder UI does not fit 3 weeks). Alternative: swap it in for Founder Legend if identity is the bet you most want tested |
| 6 | Premium currency (Purrls) | **None in P1 and P2.** Phase 3 only after a legal review of the DFA draft |
| 7 | Paid randomness, ever | **No** |
| 8 | Age bands and spend caps | Under 16 blocked; 16 to 17 €30 / 30 days; 18+ €200 / 30 days, raisable by email |
| 9 | Distribution budget | **€1,500**, in two tranches |
| 10 | Pink Paw share on SKUs | Only the Phase 2 Shelter Bow (100% net, labelled as a donation, claim id). No share shown on other SKUs until a CLAIMS fact exists |
| 11 | "Pink Paw" in hero or skin names | Not used until Pink Paw approves |
| 12 | Map side in the POC | Player team always Purrhaven; any hero on either side |
| 13 | Talents or items | Talents in every 3v3 phase; items only maybe in 5v5 (P3) |
| 14 | When to build IAP | Decide at the end of Phase 2; RevenueCat in Phase 3 |
| 15 | Arbitrum Dubai overlap | No overlap with 2 developers (build ends Nov 11). With 1 developer and Dubai a go (G10, Oct 31), Dubai waits until the POC launches |
| 16 | Presale delivery target | MVP live **2027-04-30**; refund window opens if not live by **2027-06-30** |
| 17 | EU VAT on digital sales | VAT-inclusive prices; the accountant confirms Lithuanian VAT vs OSS (and Stripe Tax) before Stripe live mode. Same open question as the Etsy row in the funding tracker |
| 18 | App builds | Pawlegends plays in the app with no store, no offers and no web-bought items until IAP; the `/game` card is web only in P1 and P2 |
| 19 | Pack-origin tiers as cosmetics | Tier frames apply to every owned cat, pack-origin ones included; the game never links to or names packs. Alternative: count only non-pack cats, which removes any paid-randomness link |
| 20 | Offer pressure | Max one offer card per session, none in session 1 (§8.1). Stricter alternative: offers on results screens only |

---

## 13. Known issues noticed (mentioned, not fixed)

- Resolved Oct 17: the Bad Cat and Moon Rave on/off flags (`BADCAT_*_ENABLED`, `RAVE_*_ENABLED`, `BADCAT_ROUTES`, the `VITE_BADCAT_*` switches) were removed; features are on whenever their secrets are set.
- `client/public/swordcat-game/` (about 63 MB) ships in every Vercel deploy and in the Capacitor `public/` copy.
- PPK posts results with no deterministic replay, so they can be forged (`docs/GAMES.md`, Pink Paw Knight "Phase 2").
- The Arc hot-wallet float (about $3) is too small for share-bearing SKU volume (`docs/plans/payments-STATUS.md` Go-live step 0).
- Whether the Token Tails pack page publishes tier odds is unchecked. Pawlegends no longer links to packs (§7.2), but the platform question stays open (`docs/plans/core-game-strategy.md`, "Simplify").
- `tools/copy-lint/` targets cover client, heist, backend and cms only, so strings in game packages such as `bad-cat/src/` are not scanned by the static lint.
- Bad Cat checkout charges USD only (`currency: 'usd'` in `badcat-stripe.service.ts`); EU buyers pay in USD with card FX.
- No checkout in the repo sets `automatic_tax` (Stripe Tax), so EU VAT handling for digital sales is not visible in code.
