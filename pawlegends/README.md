# Pawlegends (Phase 1 POC)

A 3v3 cats-and-dogs MOBA for Token Tails: five-to-seven-minute matches against bots in the browser. Build spec:
[`docs/plans/moba/POC.md`](../docs/plans/moba/POC.md) (wins over [`GDD.md`](../docs/plans/moba/GDD.md)).

## Run and check

Install and run inside this package (`npm install` here; it has its own `node_modules`).

| | Command |
|---|---|
| Dev server | `npm run dev` (port 5176), preview `npm run preview` (port 4176) |
| Types | `npm run typecheck` |
| Unit tests | `npm test` (vitest, Node; DOM tests opt in to happy-dom). Two projects: `unit`, then `perf` (perf-sim alone in one fork) |
| Sim determinism lint | `npm run lint:sim` |
| Bundle budget | `npm run build && npm run budget` |
| Browser tests | `npm run e2e` (Playwright; builds into `.e2e-dist/`, desktop 1280×720 and landscape 844×390 in Chromium, plus `webkit` for determinism-browser.spec.ts; `npx playwright install webkit` once) |
| Lift from PPK | `npm run lift` (`-- --check` verifies the provenance headers, `-- --force` overwrites hand edits) |
| Embed build | `npm run build:client` → `../client/public/pawlegends-game/` (commit it; keeps the previous 2 releases' `build/` files for open tabs, `build-releases.json`) |
| Headless matches | `npm run match -- --seeds 40 [--profile idle\|novice\|easy\|normal] [--difficulty easy\|normal] [--hero random] [--trick random] [--check-determinism] [--balance]` (`--balance` checks median, p95 ≤ 10:30, core kills, side and hero gates) |
| Determinism fuzz | `npm run determinism -- --seeds 1000` (record → replay, hash trails every 30 ticks, parallel processes) |
| Grade calibration (GAPS A2) | `node tools/grade-calibrate.mjs [--seeds 400] [--from 1] [--check]` (per-role S/A/B/C shares for a Normal human vs Normal bots; thresholds live in `src/meta/grade.ts`) |
| Nightly gates | `PAWLEGENDS_NIGHTLY=1 npx vitest run --project unit tests/unit/balance.test.ts tests/unit/bots.test.ts tests/unit/determinism.test.ts` (2,000 balance seeds, 400 novice seeds per difficulty, 1,000 fuzz seeds) |
| Card skin palettes | `npm run gen:skins` (writes `src/render/skins/families.gen.ts` from `../client/public/heist-game/assets/cats/*.png`; `-- --sheet <png>` writes a contact sheet), `npm run gen:skins:check` fails when the table is stale |
| Backend sim copy | `npm run vendor-sim` → `../backend/src/vendor/pawlegends-sim/`; `vendor-sim:check` fails when it is stale; `vendor-sim:check-remote -- <backend url>` compares `GET /pawlegends/sim` |

Not built yet (scripts reserved by POC.md §2.1): `bake:heroes`, `bake:map` (see "Hero art" below).

## Layout

- `src/sim/`: integer-only deterministic sim, Node-importable, vendored to the backend.
  `api.ts` is **the contract** other lanes code against; `index.ts` exports `createMatch / step / snapshot / hash /
  result` (+ `fillPicks`, `replayRecord`, `createPlayerBot`); `server.ts` exports `checkReplayShape` and
  `verifyReplay`; `commands.ts` is the §11.3 binary stream; `fixed.ts`, `rng.ts`, `hash.ts`, `world.ts` are the
  primitives. Map and nav (`map/`, `nav/`), units, combat, the 18 effect primitives (`effects/`), the four heroes
  and their talents (`heroes/`), XP and levels (`progression/`), bots (`bots/`), rat camps and Pudding are all in.
- `src/host/`: `protocol.ts` (§11.2 messages and the binary `snap` encoding), `host-core.ts`, the 30 Hz tick loop
  and the Worker host.
- `src/embed/bridge.ts`: the `tt-pawlegends` v1 bridge (accepts the configured origins plus its own origin when
  the parent is same-origin).
- `src/data/`: every gameplay number, integer units (mm, mm/s, ticks at 30 Hz, bp, 1/4096 turn).
- `src/host/protocol.ts`: §11.2 messages and the binary `snap` encoding.
- `src/render/`, `src/input/`, `src/ui/`: lifted PPK code (JS, provenance header on every file) plus our TS.
  Lifted support modules sit in `src/render/ppk/`; PPK modules we do not use are generated stubs in
  `src/render/ppk/stubs/`.
- `tools/`: `lift-ppk.mjs`, `lint-sim.mjs`, `budget.mjs`, `gen-cat-skins.mjs` (with `lib/png.mjs`, a dependency-free PNG decoder).

## Hero art (POC.md §6.9)

Decision for the POC: no baked GLBs and no KayKit models. Heroes, minions and Companion Kittens are upright,
chibi PPK-style characters built at runtime by `src/render/chars/` (founder feedback 2026-10-17: "make them upright
like in Pink Paw Knight"):

- **Skeleton and poses:** PPK's 27-bone kitten rig plus a weapon socket (`skeleton.ts`, ported from
  `KittenBuilder.js`), posed with PPK's own pose library and two-bone IK (`Poses.js`, lifted whole).
- **Geometry:** PPK's cheap-tier cat recipe rebuilt at low segment counts (`chibi.ts`), gear from `Accessories.js`,
  `Armour.js` and `Sword.js` (`gear.ts`), and the dogs' pug / spotted heads from `BeastHead.js` on the same skeleton
  (`beast.ts`). Everything per hero is ONE skinned mesh with vertex colours: 4.5k to 5.9k triangles at Med, 2.2k to
  2.8k at Low. Dogs are Kibble Corp guard dogs in uniform (charcoal, never the Woof navy).
- **Look:** the global PPK toon ramp, a dark ink rim in the shader on every tier, and an inverted-hull outline (one
  extra draw per hero) on Med and High only.
- **Animation** (`motion.ts`, from `SwordcatModel.js`): idle, run (ground-paced gait), per-hero attack (Clem's three
  slashes, Sage's draw and release, Brutus's shield bash, Cacklejaw's claw thrusts), cast, hit flinch, block /
  channel / stun / fear poses, faint on death, PPK's `nap` while recalling, and a respawn pop.
- **Minions:** kitten squires and pup guards from the same builder, posed on the CPU and tagged by body part, then
  drawn instanced (6 draws) with a per-copy `aAnim` attribute so each one walks on its own cycle. Siege carts and
  rat camps stay as they were.

Team colour sits on the shoulder mantle, the helmet / hood / cap, the pauldrons and the cape (21% to 34% of the
up-facing area, `tests/unit/team-read.test.ts`). `bake:heroes` and `bake:map` stay unwritten.

## Card skins (GDD §7.2)

Every owned Token Tails cat is a skin every champion can wear (`src/render/skins/`, render only):

- `classify.ts`: the pure sprite classifier (palette slots and the coat pattern from 48 px pixel art), shared by
  `tools/gen-cat-skins.mjs` (Node imports the `.ts` directly, so the file has no imports) and the runtime probe.
- `families.gen.ts` (generated, never edited) plus `overrides.json` (the reviewed misreads); `registry.ts` turns
  roster and featured cats into `CatSkin`s (palette chain, rung = max(tier rung, Bond), team-hue clamp);
  `spriteProbe.ts` (CORS fetch, 48 px decode, 64-entry cache with 24 h failures); `tierFx.ts` (Epic glints,
  Legendary foil and recall ring, quality and team-fight caps).
- The character shader gains `uFoil` / `uTime` (one program, `pl-char-v2`); `chars/specs.ts` has one card-skin branch
  (cats: coat, eyes, ears, nose; dogs: a cat costume). No draw calls are added; the dog costume costs ≤ 160 triangles.
- `?e2e=1&skins=legendary` dresses every hero in a synthetic Legendary skin (perf.spec.ts); it does nothing outside e2e.

## Pink Paw Knight lift

Lift base commit: **`7714dcb`** (`git -C ../../swordcat log -1 --format=%h` on 2026-10-17). The lifted files are
listed in `tools/lift-ppk.mjs` (`LISTED`, `SUPPORT`, `STUBS`). Imports are rewritten by the tool; any later hand
edit to a lifted file is marked `pawlegends:`. Integer rewrites of a PPK idea (`src/sim/nav/astar.ts` from
`Pathfind.js`, `src/sim/bots/casts.ts` from `abilityAim.js`) are listed in `PORTED` and carry a "Ported from Pink Paw
Knight" header with the same licence note; `npm run lift -- --check` also fails on any src file that says it ports,
rewrites or adapts PPK code without a header.

## Licence

Code licence: all rights reserved, Token Tails (pending founder decision, GDD §12 decision #3). This applies in
particular to the code lifted from Pink Paw Knight, which is all rights reserved, pending. Third-party assets keep
their own licences, listed in [public/assets/LICENSES.md](public/assets/LICENSES.md).

## Device performance results

Real devices (iPhone 11, Pixel 6a, Iris Xe; POC.md §15 item 27): not measured yet (M4, Tue 2026-11-10). Steps:
[`LAUNCH.md`](../docs/plans/moba/LAUNCH.md) §a.4 (`index.html?quality=low&perf=1` on the phones, `?quality=med&perf=1`
at 1280×720 on Iris Xe; record the worse of two 20 s teamfight runs). Pass: phones p95 ≤ 33 ms, draw calls ≤ 90,
heap ≤ 150 MB; Iris Xe p95 ≤ 16.7 ms. Note in the row when a number came from the remote profiler or from
`perf.spec.ts` instead of the overlay.

| Device | OS, browser | Tier | p95 frame | Draw calls | Heap | Pass | Date |
|---|---|---|---|---|---|---|---|
| iPhone 11 | | Low | | | | | |
| Pixel 6a | | Low | | | | | |
| Iris Xe laptop, 1280×720 | | Med | | | | | |

Automated (`tests/e2e/perf.spec.ts`, `perf-load.spec.ts`; Chromium headless, SwiftShader, Apple M3 Pro; busiest frame of a
6× first match, 6 heroes, 24 minions, 8 towers alive at once), 2026-10-17:

| Check | Budget | Measured |
|---|---|---|
| Draw calls, Low | ≤ 90 (§6.9 fallback) | 33 max (20 at the busiest frame) |
| Draw calls, Med | ≤ 110 | 46 max |
| JS heap after a match | ≤ 150 MB | 26.3 MB |
| Cold load to first controllable frame, 4G (9/9 Mbps, 170 ms RTT), Metal GPU | ≤ 6 s | 1.18 s (359 KB transferred) |
| Debug hooks in the build | none | none (`window.__THREE__` is three.js's own) |
| Sim, one Normal bot match, bundled, CPU time (`perf-sim.test.ts`, median of 5) | ≤ 1.0 s | 0.62 s at load average 147 |
| Sim, 11:00 worst case (median of 3) | ≤ 1.5 s | 0.87 s |

## Stripe test mode

Not run against Stripe yet: the backend specs use a fake Stripe client (no network), and `store.spec.ts` uses a mock
host. A real test-mode run needs the `PAWLEGENDS_STRIPE_*` keys in the local backend env and the Stripe CLI forwarding
`POST /pawlegends/stripe/webhook`; one checkout per SKU in USD and EUR, then record the session ids here. Exact
commands, the two-profile order (the starter and the upgrade are once per email and device; the upgrade needs a
Founder) and the test cards: [`LAUNCH.md`](../docs/plans/moba/LAUNCH.md) §a.3. "Item seen" = the item shows on the hero in
the lobby and in the next match.

| Run | Profile | SKU | Currency | Session id (`cs_test_…`) | Granted (`/entitlements`) | Item seen | Date |
|---|---|---|---|---|---|---|---|
| 1 | A | `pl_starter` | USD | | | | |
| 2 | A | `pl_founder` | USD | | | | |
| 3 | A | `pl_founder_legend_upgrade` | USD | | | | |
| 4 | B | `pl_founder_legend` | USD | | | | |
| 5 | C | `pl_starter` | EUR | | | | |
| 6 | C | `pl_founder` | EUR | | | | |
| 7 | C | `pl_founder_legend_upgrade` | EUR | | | | |
| 8 | D | `pl_founder_legend` | EUR | | | | |

Once-only checks (any profile): second starter refused ( ), under-16 blocked ( ), refund removes the item ( ).

## Launch

Launch kit for Thu 2026-11-12 (founder checklist, trademark searches, playtest, deploy, Stripe live mode,
distribution plan and launch copy): [`docs/plans/moba/LAUNCH.md`](../docs/plans/moba/LAUNCH.md).
