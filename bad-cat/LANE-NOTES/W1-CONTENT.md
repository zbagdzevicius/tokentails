# W1-CONTENT: handover

Owns `src/content/**` and `public/daily/**`. `npx tsc --noEmit` is clean for content. `npx vitest run src/content`:
82 tests green (content.test.ts + rooms.bake.test.ts). The frozen JSON is byte-identical: The Glass and
kitchen-v1..7 have pinned SHA-1 hashes in content.test.ts.

## What is built

- **Shells** (`shells.ts`), fixed indices:
  - 0 Kitchen (frozen; only optional fields were added: roombaLoop, spectatorSlots, fridgeWall, accompliceSpot on the fridge top, maker).
  - 1 Living room, 2 Bathroom (mirror), 3 Home office (webcam), 4 Party room (tablecloth table, karaoke stage), 5 Bedroom (the Napper on the bed).
  - Bosses at 14x12, each with a second human: 6 Birthday hall, 7 Wedding hall, 8 Christmas living room (the mantle (5,0) at L3 sits right above the tree spot (5,1)), 9 New Year's party.
  - **Two extra shells, as deviations**: 10 `Kitchen · holiday dinner` (the Kitchen with Grandma on the chair at (8,6), for the Thanksgiving Chef Dad + Grandma room) and 11 `Living room · Zoom` (the living room plus a webcam on a tripod at (5,6) facing north, for Appendix A day 4). Both have `maker: false` and fit the 4-bit shell field of codec v2.
  - Every shell has: L0 -> L3 access by +1 jumps (tested: every non-human cell is reachable in an empty room), occluders, a cat bed, 10-15 spectator slots (wall shelves, windowsills, free tops), an accomplice spot, a Roomba loop, and its own warm palette.
  - `DECOR_FURNITURE` lists the wall and floor pieces that have no heightmap footprint: window, rug, tv, mirror, webcam, arch, door.
- **Routines** (`routines.ts`), fixed indices 0..13:
  - 0..3 Chef Dad. Their v4 rule data is unchanged and pinned by a test. Index 0 gained `persona`/`holding`/`pose`/`maker`.
  - 4 Couch Potato, 5 Skincare Sis (mirror), 6 WFH Worker (onCamera), 7 Party Host, 8 Napper, 9 Grandma (telegraph 32, look 75-120, 5 % fake-outs), 10/11 Caterers, 12 Party Host at boss tempo.
  - **13 WFH Worker on the sofa** (onCamera, looks north): this one is a deviation, for the living-room Zoom call. `maker` is set on 0, 4, 6 and 8.
- **Weekday telegraph**: `RoomDef.telegraph` is Mon 24, Tue 22, Wed 20, Thu 19, Fri 17, Sat 15, Sun 24.
  - `resolve()` (now in `resolve.ts`) applies it to copies of `routine` and `routine2`. Grandma keeps her slowness on top of it (+8 ticks over 24).
  - `PlayableRoom.routine2` is set only when the shell has `humanSpot2`. Unknown indices fall back to the Kitchen and Chef Dad.
  - Legacy rooms have no `telegraph`, so their `play.routine` is still the same object as `ROUTINES[i]`. FTUE is unchanged: event at 450, plus `ftueSpawn`.
- **Dailies 1..21** are baked JSON (`rooms/daily-001..021.json`). Recipes are in `schedule.ts` (`AUTHORED_PLANS`); the builder is `authoring.ts buildDailyRoom` with per-shell kits in `kits.ts`.
  - Days 1-14 are exactly Appendix A, and 15-21 are week 3 (table below).
  - Charm pins: the day 1 wine glass sits on the counter edge right at Chef Dad's elbow, the remote is on the sofa next to the Couch Potato, the toilet roll is on the loo, the laptop sits beside the Zoom worker, and the phone is on the very edge of the nightstand.
  - Fillers come from per-area kinds (lived-in), with theme kinds mixed in. Floor top-up decor: the laundry nobody did, spare toilet rolls, presents under the tree, balloons in the corner. Every shell has a cat bed that nobody uses.
- **Generator beyond day 21** (`schedule.ts`): each weekday rotates through its variants week by week, with seeded jitter. The seed comes from dayNo, and up to 12 attempts are made until one validates.
  - S1 (Dec 1 - Jan 10): xmas theme and variants; the Christmas Tree boss every Saturday.
  - Dec 31 is the New Year's party boss. Outside S1, Saturdays alternate Birthday and Wedding by week parity. Feb 14 is the Valentine's dinner boss on the wedding shell with the `valentine` theme.
  - S3 days get the `spring` theme.
  - Validated for days 1..200, in ranked and FTUE modes.
- **Schedule data**: `public/daily/index.json` (version 2) holds the `DailyEntry` of days 1..63 and is written by the bake test. The hand fields `community` {code,title,author} and `sponsor` {label,url,brandShelf} are read by `daily.ts` and survive a re-bake.
  - Community applies on Sundays from day 21: the room is decoded with `decodeRoom`, its Roomba is re-docked on the loop, it is credited (`RoomDef.author`), and it must pass `validate`; otherwise the day keeps its generated room.
  - Sponsor: kind 63 goes on the first free kit cell that keeps the room valid, and `RoomDef.sponsor.propIndex` points at it.
  - Accomplice: `pinkPawWaiting()` in turn by dayNo, giving `RoomDef.accomplice {pinkPawId, wishPropIndex, x, z, level}` from the shell's accompliceSpot.
  - Fridays get `felonyFriday: true`.
  - `src/content/par.json` is created as `{}` and merged into `RoomDef.par` / `DailyEntry.par`.
- **ContentApi**: every old signature and export is kept. New on `content`: `dailyEntry`, `archive` (newest first), `roomLabel` ('Kitchen #18', 'Boss: Christmas Tree #20', 'Kitchen · Nov 2'), `shells`, `routines`. `pickerRooms` returns The Glass, today, then up to 14 past days after launch, or the 7 Kitchen variants before launch.
  - Extra exports from `index.ts`: `roomForDay`, `communityRoom`, `placeSponsor`, `entryFor`, `scheduleHand`, `weekdayOf`, `seasonOf`, `isXmasDay`, `planForDay`, `recipeForDay`, `generateRoom`, `buildDailyRoom`, `WEEKDAY_TELEGRAPH`, `SHELL`, `ROUTINE` (from routines.ts), `withTelegraph`, `wreckTicksFor`, `wishReachable`, `chaosBudget`, `isLegacyRoom`, plus the budget and size constants.
- **Validator v2** (`validate.ts`):
  - Size and shape: sizes are 12x10 or 14x12. Prop level must equal the shell level. Cloth extents must stay on one surface and must not overlap. A cable cell is L0, orthogonally next to its lamp, and free. Tall props stand on L0 with an L(tall) cell beside them. Enterable props stand on L0.
  - Shell features: the Roomba loop is closed, 8-way adjacent, L0, free of furniture and humans, and for v5 rooms the Roomba sits on it with no blocking prop on it. The mirror and webcam are inside the grid and exist when the routine needs them. Spectator slots and the accomplice spot are valid. `humanSpot2` is present if and only if `routine2` is set.
  - Play: every target and the wish are reachable and wreckable (push, cloth pull, cable pull, tree from L3) on a heap-based Dijkstra over the sim's moves. The first target is reachable within 6 s, and at least 2 targets are in some human's sight (both humans are counted). The usual FTUE checks still apply.
  - Limits: budget (daily 6000, boss 9500, Room Maker 3000) and prop counts (25-45, boss up to 60, Room Maker up to 40).
  - Legacy rooms (`glass`, `kitchen-vN`, `preview-*`) skip only the v5-only checks (budget, run length, Roomba on its loop).

### Days 1..21

| # | Date | Room | Human | Targets | Wish | Event | Theme |
|---|---|---|---|---|---|---|---|
| 1 | Mon Nov 16 | Kitchen #1: Breakfast Heist | Chef Dad | wine glass, fruit bowl, egg carton | tuna can | KETTLE! | default |
| 2 | Tue Nov 17 | Living room #2: TV Night | Couch Potato | TV remote, popcorn bowl, lamp | knitting yarn | PIZZA! | default |
| 3 | Wed Nov 18 | Bathroom #3: Toilet Paper Wednesday | Skincare Sis | toilet roll, perfume, toothbrush cup | rubber duck | PHONE CALL! | default |
| 4 | Thu Nov 19 | Living room #4: Zoom Call (shell 11, routine 13) | WFH Worker | laptop, mug, potted plant | pen cup | DELIVERY! (doorbell) | default |
| 5 | Fri Nov 20 | Party room #5: Felony Friday | Party Host | cake, cups tower, balloon | ribbon | SURPRISE! | birthday |
| 6 | Sat Nov 21 | Boss: Birthday Party #6 | Party Host + Grandma | cake, gift stack, punch bowl | birthday candles | SPEECHES! | birthday |
| 7 | Sun Nov 22 | Bedroom #7: Laundry Day | Napper | laundry basket, alarm clock, jewellery dish | sock | ALARM! | default |
| 8 | Mon Nov 23 | Kitchen #8: Bake Sale | Chef Dad | cookie tray, flour bag, mixer bowl | butter | OVEN DING! | default |
| 9 | Tue Nov 24 | Living room #9: Game Night | Couch Potato | board game, snack tower, controller | dice | DELIVERY! (doorbell) | default |
| 10 | Wed Nov 25 | Bathroom #10: Spa Day | Skincare Sis | scented candle, face-mask jar, towel stack | rubber duck | PHONE CALL! | default |
| 11 | Thu Nov 26 | Kitchen #11: Thanksgiving (shell 10) | Chef Dad + Grandma | gravy boat, pie, turkey platter | turkey leg | GUESTS! | thanksgiving |
| 12 | Fri Nov 27 | Party room #12: Black Friday Boxes | Party Host | box tower, bubble wrap, receipt pile | cardboard box (sit in it) | COURIER! | default |
| 13 | Sat Nov 28 | Boss: Wedding Cake #13 | Caterer A + Caterer B | cake, champagne tower, bouquet | ribbon | SPEECHES! | wedding |
| 14 | Sun Nov 29 | Bedroom #14: Sunday Nap | Napper | phone (nightstand edge), water glass, potted plant | blanket | ALARM! | default |
| 15 | Mon Nov 30 | Kitchen #15: Leftovers | Chef Dad | pie, gravy boat, plate stack | turkey leg | DELIVERY! | default |
| 16 | Tue Dec 1 | Living room #16: Tinsel TV Night | Couch Potato | ornament, snow globe, popcorn bowl | knitting yarn | AD BREAK! | xmas |
| 17 | Wed Dec 2 | Bathroom #17: Bubble Bath | Skincare Sis | scented candle, snow globe, perfume | rubber duck | PHONE CALL! | xmas |
| 18 | Thu Dec 3 | Home office #18: Zoom Call | WFH Worker | mug, cookie tray, snow globe | pen cup | YOU'RE ON MUTE! | xmas |
| 19 | Fri Dec 4 | Party room #19: Ugly Sweater Felony Friday | Party Host | cookie tray, gift stack, cups tower | ribbon | SURPRISE! | xmas |
| 20 | Sat Dec 5 | Boss: Christmas Tree #20 | Party Host + Grandma | Christmas tree (from the mantle), cookie tray, snow globe | ribbon | GUESTS! | xmas |
| 21 | Sun Dec 6 | Bedroom #21: Sunday Nap (first Community Sunday slot) | Napper | phone, alarm clock, water glass | blanket | ALARM! | xmas |

Every day has a Pink Paw accomplice, from `pinkPawWaiting()` in turn. Days 5, 12 and 19 are Felony Fridays.

## Deviations and decisions

- Shells 10 and 11 and routine 13 were added; see above. Without them, Appendix A day 4 (webcam) and day 11 (two humans in the Kitchen) would need fields on frozen data.
- `humanSpot` may be an L1 cell: the Couch Potato sits on the sofa, the WFH Worker on the office chair, the Napper on the bed, and Grandma on the stage, an armchair or a dining chair. The sim's sight test does not depend on the human's level.
- A lamp's `rot` points at its cable, so a codec that drops `cable` still finds the same cell (tested).
- `index.json` is imported by the game (`daily.ts` imports `../../public/daily/index.json`) so the hand fields work offline and synchronously. It adds about 5 KB gzip.
- The bake writes index.json with the current Pink Paw roster. When W1-PLATFORM changes `PINK_PAW_CATS`, re-run `BADCAT_WRITE_ROOMS=1 npx vitest run src/content/rooms.bake.test.ts`. The 21 room JSONs are re-baked too, because their `accomplice.pinkPawId` changes; `wishPropIndex` and the layout do not.
- Room ids of days 1+ changed content compared with M0 (it was a Kitchen cycle). There were no launch-day ghosts yet. Preview days, The Glass and kitchen-v1..7 are untouched.
- `dayLabel(n)` now equals `roomLabel(n)` ('Home office #18'). `KITCHEN_VARIANTS` and `variantIndexForDay` stay.

## For other lanes / the integrator

- W1-SIM:
  - Humans may stand on L1 cells (bed, sofa, office chair, stage).
  - Room 11 (Thanksgiving, shell 10) has two humans in a 75 s non-boss room.
  - Grabbable wishes are carried (yarn, duck, sock, butter, dice, ribbon, candles, turkey leg, blanket), the box wish is sat in (enterable), and the tuna can and pen cup wishes are wrecked.
  - The Roomba starts on `roombaLoop[0]`. The FROZEN Kitchen rooms keep theirs at (11,9), off the loop.
  - Cloths: kind 14 with `w`/`d` shares cells with the props on it.
- W1-CODEC: shells go up to 11, routines up to 13 (4 bits each), and themes include `valentine`, `thanksgiving` and `spring`. Daily rooms never travel in links (dayNo does), but community rooms do; their Roomba is re-docked on the loop when decoded.
- W1-RENDER-WORLD:
  - Every `FurnitureType` used is in `shells.ts`. Decor pieces (`DECOR_FURNITURE`) have no heightmap footprint; the Zoom webcam is a floor tripod at L0.
  - `src/render/world.test.ts` currently fails its draw-call budget with its own fixtures as well (70+ calls versus 48): this is in progress in that lane, not content data.
- W2-EDITOR: maker shells are `SHELLS.filter(s => s.maker)` (0..5), and maker routines are `ROUTINES.filter(r => r.maker)` (0, 4, 6, 8). Use `validate` with an `ugc-` id: the limits are 40 props and a 3000 budget.
- W2-TOOLS-HOSTING: `travelTicks`, `wreckTicksFor`, `chaosBudget`, `isLegacyRoom` and `content.dailyEntry` are exported. `par.json` is `{ [roomId]: {bronze, silver, gold} }`.

## Gaps

- The week-3 titles and boss variants beyond Appendix A are my picks (Leftovers, Tinsel TV Night, Bubble Bath, Zoom Call, Ugly Sweater Felony Friday, Christmas Tree, Sunday Nap). Change them in `schedule.ts` and re-bake.
- Sponsor placement prefers kit surface slots and then floor spots. The Brand Shelf (`brandShelf`) is passed through but has no dedicated shelf cell.
- No sim-driven playtest of the new rooms: the validator is static, and the sim smoke test runs days 1..21 with no input. Par paws stay empty until `tools/par.mjs` records runs.
