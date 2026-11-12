# Champion store

> Names (Nov 12, 2026): the shelter champions have English names in the game. Raspberry, Gabby and Bengal were Avietė, Gabė and Bengas (Lambo kept his name); hero ids stay `aviete`, `gabe`, `bengas`. The real Pink Paw cats keep their own names, written in plain letters (Aviete, Gabe, Bengas).

The founder's request, quoted exactly: "don't give every champion for free by default, give 1 of each type by default as a starter. then create a store to purchase more champs ultracode". Other requests are handled elsewhere.

Status: built on `feat/pawlegends-champion-store` (from origin/main 517eafbb). Nothing here touches the sim, the replay record, the hash or `simVersion`. Champion ownership is meta data only. §16 lists where the build differs from this design and why.

## 1. Research

How the two reference games handle champion unlocks:

**Wild Rift**
- Every champion has a Blue Mote cost "based on a variety of factors", and the price can drop with sales or as a champion stays available longer.
- Blue Motes are earned by playing: a payment for finishing a match, a bonus for the first win of the day, and rewards from missions and weekly chests.
- Wild Cores are the only paid currency. They buy champions, skins and other items, and they give no in-game advantage. (https://support.riotgames.com/wild-rift/store/in-game-currencies)
- Third-party guides give the standard price as about 5,500 Blue Motes or 725 Wild Cores. (https://www.ginx.tv/en/wild-rift-currency-guide-blue-motes-poro-coins-wild-cores)
- Level-up rewards hand out specific champions early, for example Garen and Jinx at level 1. (https://www.pocketgamer.com/wild-rift/free-champions-skins-level-up-rewards-in-league-of-legends-wild-rift)
- A weekly free rotation of about 10 champions is marked with an open-lock banner. (https://samurai-gamers.com/league-of-legends-wild-rift/free-champion-rotation/, https://www.ggrecon.com/articles/league-of-legends-wild-rift-free-champion-rotation)

**Mobile Legends**
- Battle Points are earned and buy heroes, but they can't buy skins and can't be converted to Diamonds. Weekly Battle Points from matches are capped.
- Trial cards (1, 3 or 7 days) unlock a hero for a limited time, and unused ones convert back to Battle Points. (https://mobile-legends.fandom.com/wiki/Battle_Points)
- Most heroes cost 32,000 BP or 599 Diamonds, by price tier. New heroes launch at full Diamond price and become BP-buyable later. Saving for a hero takes about a month. (https://www.playnews.gg/en/guides/mlbb-complete-beginner-s-guide-to-get-started-2026, https://zathong.com/ml-heroes-price-list/)
- There is a weekly free-hero rotation. (https://theglobalgaming.com/gaming/how-to-get-free-heroes-in-mobile-legends)

**What we take from them:** earned currency for every champion, a direct paid unlock, price tiers by age and complexity, free champions as level or milestone rewards, and a weekly rotation that works as the trial.

**What we drop:**
- A separate premium currency. GDD §8.1 #3 says real prices.
- Random champion chests. GDD §8.1 #2 says no paid randomness.
- Trial cards at launch. The rotation and Practice do that job.
- A month-long grind. GDD §7 targets 25 to 40 matches per hero.

## 2. Types and starters

"Type" means role, as in `HeroRole` (`data/heroes/types.ts`) and the role tabs (`ui/champSelect/roles.ts` `ROLE_ORDER`). There are 6 roles: fighter, marksman, tank, assassin, mage and support.

A team is never cats and dogs mixed, and co-op or casual PvP assigns a species. So the 6 starters are split 3 cats and 3 dogs. That way a new player always has 3 champions on whichever side they are given.

Roster by role (difficulty comes from `ui/champBrowser/meta.ts` `HERO_DIFFICULTY`):

| Role | Cats | Dogs |
|---|---|---|
| Fighter | Clem (Easy) | Howler (Easy) |
| Marksman | Sage (Medium), Pixel (Medium) | Chili (Hard), Rocket (Hard) |
| Tank | Lambo (Medium), Meatball (Easy) | Sir Brutus (Easy), Bravo (Medium) |
| Assassin | Raspberry (Hard), Stilts (Hard) | Cacklejaw (Hard), Frankie (Medium) |
| Mage | Bengal (Medium), Duchess (Medium) | Marshmallow (Medium), Domino (Hard) |
| Support | Gabby (Medium) | Nugget (Medium) |

**Starters: Clem, Sage, Gabby (cats) and Sir Brutus, Frankie, Marshmallow (dogs).**

- **Fighter, Clem:** Easy. He is the guided first match hero ("Play as Clem") and the party `newbieHero`, so the first match keeps working unchanged.
- **Marksman, Sage:** one of the original four and the face of the cat side. Pixel is the alternative. Both dog marksmen are Hard.
- **Tank, Sir Brutus:** Easy, one of the original four, and the "stands in front" tank. He is the iconic dog.
- **Assassin, Frankie:** the only assassin that isn't Hard. Cacklejaw is more iconic but Hard (founder decision 2).
- **Mage, Marshmallow:** Medium, with forgiving slows. Domino is Hard. Picking Marshmallow keeps the 3/3 species split.
- **Support, Gabby:** a shelter champion. One Pink Paw champion appears from match 1, so the shelter story is visible without a store. Nugget is the dog alternative, but taking her would make the split 2 cats and 4 dogs.

The dogs stay locked until the first match is done ("Dogs unlock after your first match"). After that, the 3 dog starters are owned.

## 3. Weekly free rotation

There are 6 rotating champions each week: 3 cats and 3 dogs, drawn only from the 14 non-starters, 7 per species.

**Schedule**
- Weeks start Monday 00:00 UTC, counted from `ROTATION_EPOCH` = the first Monday on or after release (the default is 2026-11-16).
- `w = floor((now − epoch) / 7 days) mod 7`. Cats take entries 3w, 3w+1 and 3w+2 (mod 7) of the cat cycle. Dogs take the same entries of the dog cycle, shifted by one week.
- Cat cycle: `[meatball, pixel, aviete, duchess, lambo, stilts, bengas]`
- Dog cycle: `[howler, chili, nugget, domino, cacklejaw, rocket, bravo]`

This is the best order from an exhaustive search:

| w | Free this week | Roles covered |
|---|---|---|
| 0 | Meatball, Pixel, Raspberry, Domino, Cacklejaw, Rocket | 4 |
| 1 | Duchess, Lambo, Stilts, Bravo, Howler, Chili | 5 |
| 2 | Bengal, Meatball, Pixel, Nugget, Domino, Cacklejaw | 5 |
| 3 | Raspberry, Duchess, Lambo, Rocket, Bravo, Howler | 5 |
| 4 | Stilts, Bengal, Meatball, Chili, Nugget, Domino | 5 |
| 5 | Pixel, Raspberry, Duchess, Cacklejaw, Rocket, Bravo | 4 |
| 6 | Lambo, Stilts, Bengal, Howler, Chili, Nugget | 6 |

**Properties (each is a test):**
- Every week has 3 cats and 3 dogs.
- No species has two champions of the same role in one week.
- No starter is ever in the rotation.
- Every non-starter is free 3 weeks out of every 7, and never waits more than 2 weeks.
- The starters cover all 6 roles across the two species (3 roles each). With the rotation, each species has 6 open champions covering 4 to 6 roles depending on the week (the build measured: cats 5-6, dogs 4-6).
- Every player can field at least 6 distinct champions per species, so a full 5-player team (the v21 5v5 work) can always pick distinct heroes.

**Why not every role on every side every week:** fighter and support have only one non-starter each (Howler and Nugget). Putting them in every week would make them permanently free. So a new dog-side player has no free fighter or support in some weeks (the design draft claimed full coverage per side; the build's test shows it is per pair of sides). This is founder decision 3; the alternative there (Howler and Nugget always free) closes the gap.

**Mid-match flips:** the rotation week is fixed when the pick phase opens (`party.rotationWeek`, and the save uses the match start time). A flip during a pick, a queue or a match never removes a champion.

## 4. Currencies

**Yarn** is the earned soft currency already specified in GDD §7 (§7.1 table and line 330).
- It is earned only. It is never sold, never put in a paid bundle, never converted, and never shown as money. It is separate from Tails.
- Yarn per verified match, written by the same `addXp` call sites in both `/live` writers, so there is still one score path:

| Result | Yarn |
|---|---|
| Win | 100 |
| Loss | 60 |
| Forfeit | 15 |
| Per takedown | +2, at most 10 takedowns |
| First win of the UTC day | +150 (reuses the atomic `winDay` claim) |

- The existing Season XP limits apply to Yarn: 30 paid matches a day, the solo spacing rule, and nothing for an AFK-rejected party save.
- Weekly chest, computed on the server: +400 Yarn for 10 verified matches in an ISO week.
- Daily quests stay local and pay no Yarn (STORE-PASS decision 4).
- **Welcome milestones**, server counted, like Wild Rift's level rewards: a free **Champion Pick** after verified matches 5, 15 and 30. A pick unlocks any Tier 1 or Tier 2 champion and is stored as an owned row with `source: 'milestone'`.
- **Pass:** the S1 table is unchanged, since rewards don't change mid-season. From S2, one Champion Pick sits on the free row at tier 15 (founder decision 6).

**Direct web purchase** goes through the existing Stripe store: signed-in only, the same spend caps (no age question since Nov 12: an unknown buyer gets the 16-17 cap, see STORE-PASS "Checkout sheet"), the purchase button as the consent, webhook grant and refund revoke.

## 5. Prices

Tiers are set by age and difficulty. VAT is included, and USD and EUR use the same numbers.

| Tier | Yarn | Web price | Champions |
|---|---|---|---|
| T1 Classic | 2,500 | $2.99 | Meatball, Howler, Cacklejaw |
| T2 Standard | 3,500 | $3.99 | Pixel, Duchess, Lambo, Bengal, Nugget, Bravo |
| T3 Advanced | 4,800 | $4.99 | Raspberry, Stilts, Chili, Rocket, Domino |
| Launch | 6,000 | $5.99 | A new champion during its first sim version (`CHAMP_LAUNCH`, empty today), then its normal tier |

At about 90 Yarn per match plus first-win bonuses, T2 takes about 30 matches and T3 about 40. That fits GDD §7.

**SKUs:**
- `pl_champ_<hero>` × 14
- `pl_champs_cats_s1` (7 cats, $16.99; singles $28.93)
- `pl_champs_dogs_s1` (7 dogs, $16.99; singles $28.93)
- `pl_champs_all_s1` (14, $29.99; singles $57.86)

`kind: 'champion'` in the catalogue; `oncePerAccount`.

**A bundle when some champions are already owned:** the bundle is offered at its price times the share of the singles' price still to unlock, rounded down to .99 (`championBundleCents`). The sheet says "You own 3 of these: you pay for the other 11". The price is computed on the server at checkout, stored on the hold, and the webhook checks the charge against the hold. This differs from cosmetic sets, which STORE-PASS decision 8 refuses: players earn champions, so refusing the bundle would punish them (founder decision 7).

Shelter champions carry no shelter-share wording, because that needs a CLAIMS fact first (GDD §8.1 #9).

## 6. Who owns what

`allowed(identity, hero, week)` is true when:
- the hero is a starter (dogs only after the first match, client side), or
- the hero is in `ROTATION(week)`, or
- there is an owned row `champ.<hero>` with source `purchase`, `yarn`, `milestone`, `pass`, `founders` or `legacy`.

Bots may use any champion; the bot-fill paths skip the check.

**Practice:** in champion select, a locked tile has "Practice". That starts a solo match against bots that saves nothing: no `/live` call, no XP, no Yarn, no rating, no quests. This replaces trial cards.

**Party-mate sharing:** off at launch (founder decision 8). It would complicate validation, and the rotation already gives breadth.

**Shelter champion cards:** today, owning a card unlocks cosmetics only. Default: it stays that way. If the founder chooses otherwise, only an `adopt` or `redeem` origin may unlock a champion, never a `pack` (GDD §8.1 #2). This is founder decision 9.

## 7. Founders roster (GDD §8.1 #7)

Release time `T` is the first time a backend with this code answers a champion request: the row `pawlegendsyarn/meta:champions-release` is written once (`$setOnInsert`) and read after.

**Grant** (`pawlegends-champion-store.ts` `ensureFounders`, lazy and idempotent; no batch script is needed):
- For every user id, registered or a guest user document, with at least one Paw Legends Game row created before `T` (solo and party saves both write Game rows):
  - upsert `pawlegendsowned {accountId, item: 'champ.<hero>', source: 'founders'}` for all 20 champions, and
  - upsert `{item: 'badge.founders_roster', source: 'founders'}`.
- The check runs once per account (`foundersChecked` on its Yarn row), from `GET /pawlegends/me`, the relay's allowed set and the solo save check.
- `PawlegendsOwnedSource` gains `'founders' | 'yarn' | 'milestone'`.

**Guest merge:** `mergeStoreProgress` moves every owned row (`champ.*` and the badge too) to the new account; the unique `{accountId, item}` index makes this idempotent. A free champion row (Founders, Yarn, a Champion Pick) drops the account's purchase session, so a refund never takes it. The guest's Yarn row adds to the account's once (the guest row is the claim), and the account's `foundersChecked` is cleared, so the Founders check runs again over the Game rows the merge moved.

**A Founders grant over a purchase:** the roster takes over a live purchase row and drops its session (it is free; a refund of that purchase never takes the champion).

**Relay-only guest keys** (`guestKeyHash`, no user document): not granted at launch (see §16).

**Players with only local saves** have no server record. A client-side match count can be faked, so it is not trusted. Default: no automatic grant; they get a support path ("Played before? Email us") (founder decision 4).

**Grant visibility:** the grant shows in the app, since it is a free grant and not a purchase. On the first launch after release, a one-time card says: "Founders roster: you keep all 20 champions."

## 8. Server validation points

1. **`party.service.ts` `heroAllowed`:** asks `PartyRules.allowed(p, m, hero)`. This covers `hover`, `pick.lock`, auto-lock on timeout (which only picks from the allowed set; Clem is a starter, so `newbieHero` is safe), and rematch `lastHero`, which is dropped at the rematch pick when no longer allowed.
   - The relay loads a member's owned champions once per identity (ticketed accounts only) and caches them. A refused hover or lock reloads them (at most once per 5 s per identity), so a purchase or unlock made in this session is seen on the next tap.
   - The party's rotation week is fixed when the pick opens (`p.rotationWeek`).
2. **`party-relay.ts` `startMatch`:** every human seat is checked again before the room is created (a seat that fails on this relay's cache, such as a party restored here, reads its account once first). A seat that fails refuses the room (`bad_message`, the party goes back to its lobby). A seat is never silently swapped.
3. **Quick Play (co-op, casual, ranked, 5v5):** matched players pick in the same `PartyService` pick, so the same check applies. Backfill bots and pilots skip it; a backfilled human keeps the seat's hero.
4. **`party.card`:** stays cosmetic. It resolves a card the caller owns and never grants or validates a champion.
5. **`/live` solo saves (the single score path):** the replay's hero is checked against the heroes the account could pick when the match started (now minus the match length). On a miss the Game row and catnip are unchanged, but it pays no Season XP and no Yarn (`season.heroLocked: true`). Party saves rely on the relay's check at the pick (the server chose and stored every seat's hero). No new write path is added.
6. **`POST /pawlegends/champions/unlock {hero, via: 'yarn' | 'pick', requestId}`:** the spend and its claim are one conditional update of the Yarn row (`balance >= price` or `picksLeft > 0`, and the hero not in `unlocked`; `$inc` and `$push unlocked`), so a crash after the spend is finished by the next call and never spends twice; the ledger row `unlock:<hero>` is the record. Idempotent; refuses owned and starter heroes; writes the owned row with `source: 'yarn'` or `'milestone'`. Allowed from the app.

## 9. Native app

**Allowed in the app:** Yarn balance and earning, Yarn unlocks, Champion Picks, the rotation, Practice, and the Founders roster.

**Not shown in the app:** prices, $ buttons, bundles, and any "buy on the web" wording. The host answers champion store intents with `ok: false`, as it does for the cosmetics store.

**Web-bought champions:** GDD §8.1 #10 and Apple 3.1.3(b) say web-bought items are not rendered in the app until IAP exists. Default: in the app, a web-bought champion shows as "Locked" with Practice only (no unlock row: the server refuses to unlock an owned champion again, and the app never says why). This hurts paying players who also use the app, so it is founder decision 1. The alternative is IAP in Phase 3. (The relay does not know which build a socket runs, so online the server allows a web-bought champion; only the app's own UI hides it. See §16.)

## 10. UI

**Champion select:**
- Locked tiles are dimmed, with a lock and the reason.
- Badges: "Free this week", "Starter" and "Owned" in the panel.
- Tapping a locked tile keeps the kit preview and skill peek, and shows:
  - "Unlock · 3,500 Yarn" when the balance is enough, or
  - "1,200 Yarn to go (about 13 matches)" when it isn't,
  - "Use a Champion Pick" when the player has one and the champion is Tier 1 or 2,
  - "Practice" instead of LOCK IN (solo), and
  - on the web only, a secondary "$3.99" button that opens the store sheet.
- No offer is pushed in session 1 (GDD §8.1 #4). The price shows only on a tile the player tapped.

**Store tab "Champions"** (web), next to cosmetics: every champion to unlock and the three bundle cards with honest savings.

**Store layout (Wild Rift style, founder request Nov 12: "make champions store in pawlegends be more like wild rift"; then Nov 12: "champ store should be vertically scrollable. and it's not for champs only, same should be for coats, for frames & titles. similar patter").** `ui/store.ts` with `ui/champStore/` (model, CSS):
- Top bar: back, STORE, Cats/Dogs (Champions only) or Coats/Sets (Coats only), the Yarn balance and Champion Picks. No money balance (there is no paid currency).
- **One vertical grid on every tab.** Each tab's content is a single grid of tall 2:3 cards that scrolls up and down (`[data-scroll="grid"]`, `overflow-y: auto`, momentum on touch, a soft fade at its foot while more is below). The page never scrolls; the top bar, the filters and the bottom tabs stay fixed. Columns fill the width: cards are at least 112 px wide on a phone held sideways (5 to 7 columns at 667 to 844 px), 150 to 186 px on a desktop (7 at 1440x900). Nothing scrolls sideways.
- Champions (the default tab): 6 role filters, an Unowned toggle and a sort (Default, Price, Name, Newest; remembered in `localStorage`, guarded), then the grid of splash cards (`public/assets/splash/<hero>-360|720.webp`, lazy `<img>` with srcset; the Low quality tier loads 360 only). Each card: a thin frame in its tier's gold, ribbons (Free this week, Starter, New), the name and role on a dark gradient, and a price bar (Yarn, and on the web its price; Owned or Starter when owned).
- Featured: the sections stacked in the same vertical scroll (Free this week, Champion bundles, New champions, Legends Pass), each a wrapping row of the same cards.
- Coats (with Sets) and Frames & Titles use the same card: the art is the coat worn by its hero (the game bakes every coat portrait of the grid in one pass, `render/portraits.ts` `bakeLooks`; the hero's splash when WebGL read-back fails), a set shows two of its coats, a frame shows a portrait in the frame's ring with its title on a gold plate, a pass card shows the crown. Ribbons: Epic, Legendary, Set, Equipped. The price bar: "Legendary · $14.99", Owned, Equipped (green frame), Own some, Pass owners. Cosmetic only and the safeguards line sit at the end of the grid.
- A card opens a detail: a champion's big splash, role, side, tier, difficulty, the blurb and the kit (P, Q, W, E, R), the rotation line, "Unlock · N Yarn" or "N Yarn to go", "Use a Champion Pick", the web price (the same checkout as before) and "Skills & lore" (the champion browser); a coat, set, frame or pass shows its big preview, what it is, and Buy $X, "Owned · Equip" / "Equipped", "Wear the frame" (sets), "Open the pass", or why it can't be bought. Esc closes the detail, then the store.
- Bottom tabs: Featured, Champions, Coats and Frames & Titles. The gold chevron marks the active tab.
- App builds never open the store today (STORE-PASS "Native app"). If one does, the panel shows Featured and Champions only, with Yarn unlocks and no price, bundle, pass or buy button.
- Purchase, ownership, rotation and server validation are unchanged.

**Collection:** "Champions 9/20" and the Founders roster badge.

**Lobby and results:** a "+90 Yarn" line on the results screen next to Season XP, and milestone lines ("Match 5: pick a free champion").

**Copy:** "Yarn", never coins, money or Tails.

## 11. Data and sync

All the champion values live in the catalogue file, which already has two byte-identical copies deep-compared by `pawlegends/tests/unit/store-pass.test.ts`: `backend/src/pawlegends/pawlegends-catalog.ts` and `pawlegends/src/money/catalog.ts`. They hold `CHAMPIONS`, `STARTERS`, `ROTATION_EPOCH`, `ROTATION_CATS`, `ROTATION_DOGS`, `CHAMP_TIER`, `TIER_PRICE`, `YARN`, `CHAMP_PICK_MILESTONES` and the champion SKUs. `docs/DEVELOPMENT.md` lists them.

**Yarn storage:** `pawlegendsyarn`, one row per account with the balance, the counted matches, the picks and the weekly chest week, plus a ledger `pawlegendsyarnlog` with a unique `(accountId, ref)`, where `ref` is `match:<digest>`, `unlock:<hero>` or `week:<isoWeek>`. Duplicate saves pay nothing.

**`GET /pawlegends/me`** adds `champions: {owned[{hero, source}], founders, starters[], rotation: {week, heroes[], endsAt}, yarn: {balance, matches, picksLeft, nextPickAt}, bundles[{sku, cents}]}`.

## 12. Analytics

Sent only after consent, with no personal data. Events: `champ_locked_view {hero}`, `champ_unlock {hero, via}`, `practice_try {hero}`.

KPIs:
- Share of new players unlocking a first champion within 7 days (target over 40%)
- Median matches to the first Yarn unlock
- Web conversion on locked-tile taps
- Day-7 retention of new players compared with before release
- Distribution of picks across the 6 starters (to spot dead starters)

## 13. Migration and release

There are no flags, and everything ships in one release.

1. Deploy the backend with the validation code. Its first champion request records `T`.
2. Every account is checked the first time it asks (`GET /pawlegends/me`, the relay's pick, a solo save): no migration to run.
3. Deploy the client (Vercel), then build the app.

Old clients that pick an unowned champion are refused at the pick (the tap does nothing; the timeout auto-locks an allowed hero). If anything breaks, fix forward.

## 14. Tests

Backend (`pawlegends-champion-store.spec.ts`, `party.service.spec.ts`): the party service refuses hover and lock for a locked hero, allows starters, rotation champions and owned ones, and auto-lock only picks allowed heroes; a rematch with a locked `lastHero` is dropped; a rotation flip during a pick keeps the hero; `/live` with a locked hero pays no XP or Yarn; unlock is atomic and idempotent, refuses insufficient Yarn and owned or starter heroes, and a concurrent double spend can't go negative; Yarn dedupes per save and pays nothing when capped; the webhook grants `champ.*`, a refund revokes it, and the bundle's prorated price matches; the Founders grant is idempotent and only for rows before T; the guest merge carries the rows.

Game (`champions.test.ts`): the catalogue mirror; the rotation properties from §3; the starters' roles match `HEROES`; the guided first match with Clem still works; locked tile states; the app build shows no prices.

## 15. Founder decisions (defaults used until answered)

1. **Web-bought champions in the native app:** default hidden in the app (GDD §8.1 #10, Apple 3.1.3(b)). Alternative: IAP in Phase 3.
2. **Starters:** default Clem, Sage, Gabby, Sir Brutus, Frankie, Marshmallow. Swaps: Cacklejaw for Frankie (more iconic but Hard), Nugget and Bengal for Gabby and Marshmallow (more shelter weight on the dog side), Pixel for Sage.
3. **Rotation:** default 6 a week (3 cats and 3 dogs), covering 4 to 6 roles, with the starters guaranteeing all 6. Alternative: Howler and Nugget always free, so the rotation covers every role.
4. **Founders roster:** default all 20 for anyone with server evidence of at least 1 match before T. Players with only local saves get a support email path, not an automatic grant.
5. **Prices:** default T1 $2.99 / 2,500 Yarn, T2 $3.99 / 3,500, T3 $4.99 / 4,800, launch $5.99 / 6,000. Bundles $16.99 per species and $29.99 for all 14.
6. **Pass:** default S1 unchanged; S2 free row gets a Champion Pick at tier 15.
7. **Bundle when some champions are owned:** default prorated price. Alternative: refused, like cosmetic sets.
8. **Party-mate sharing:** default off.
9. **Shelter champion cards:** default cosmetic only. Alternative: an adopted or redeemed card (never a pack) unlocks its champion.
10. **Yarn numbers:** default win 100, loss 60, first win +150, weekly chest +400, Champion Picks after matches 5, 15 and 30.
11. **Practice with any champion:** default on, with no rewards.

## 16. Where the build differs from the design

- **No new wire frames or error codes.** A `hero_locked` error and a `party.champs` refresh frame would change `pawlegends/src/net/proto.ts`, which needs a PROTO bump and the vendored copy in the backend. Instead the relay refuses a locked hover or lock silently (as it already does for a hero of the wrong side), reloads the member's champions after a refusal (at most every 5 s), and the game never offers a locked hero. A forged lock that reaches `startMatch` refuses the room with `bad_message`.
- **Party saves are not re-checked in `/live`.** The relay chose and stored every seat's hero, so a party save cannot carry a hero its player did not lock. A backfilled human keeps the seat's hero (a bot's), and must not lose the match's pay for it.
- **The app build online.** The relay does not know a socket's build, so a web-bought champion is allowed online; the app's UI does not offer it (decision 1).
- **Relay-only guest keys** (no ticket) get no Founders grant: there is no account to hold it. They see starters and the rotation.
- **Release time `T`** is recorded by the first backend that serves the code, not by a deploy script, so it can't be forgotten.
- **A standalone page** (the game opened without any host: no account, nothing is ever saved) opens every champion, as Practice does. With a host (the web embed or the app) a player without a server answer yet (signed out, an older host) gets the starters and the week's rotation.
- **Tests that pick heroes freely:** the e2e mock host (`pawlegends/tests/e2e/host.ts`) sends a Founders roster by default (`champState`), so the older specs keep working in every rotation week; `champion-store.spec.ts` sends a new guest's state.
- **Every game hero must be a catalogue champion:** `champion-store.test.ts` fails when a hero is added to the sim without a `CHAMPIONS` row, a tier and a rotation slot.
