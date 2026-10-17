# Pawlegends (Phase 1 POC)

A 3v3 cats-and-dogs MOBA for Token Tails: nine-minute matches against bots in the browser. Build spec:
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
| Embed build | `npm run build:client` → `../client/public/pawlegends-game/` (commit it) |
| Headless matches | `npm run match -- --seeds 40 [--profile idle\|novice\|easy\|normal] [--difficulty easy\|normal] [--hero random] [--trick random] [--check-determinism] [--balance]` (`--balance` checks median, p95 ≤ 10:30, core kills, side and hero gates) |
| Determinism fuzz | `npm run determinism -- --seeds 1000` (record → replay, hash trails every 30 ticks, parallel processes) |
| Nightly gates | `PAWLEGENDS_NIGHTLY=1 npx vitest run --project unit tests/unit/balance.test.ts tests/unit/bots.test.ts tests/unit/determinism.test.ts` (2,000 balance seeds, 400 novice seeds per difficulty, 1,000 fuzz seeds) |
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
- `tools/`: `lift-ppk.mjs`, `lint-sim.mjs`, `budget.mjs`.

## Hero art (POC.md §6.9)

Decision for the POC: no baked GLBs. All four heroes are our own procedural runtime models
(`src/render/views/models.ts`, a vertex-shader part rig in `rig.ts`), one draw call per hero, dressed by the
roster look (coat, chroma gem, tier frame, purchased items). This is a variant of the §6.9 fallback;
`bake:heroes` and `bake:map` stay unwritten. Low tier measured 20 draw calls in a match (swiftshader).

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

Real devices (iPhone 11, Pixel 6a, Iris Xe; POC.md §15 item 27): not measured yet (M4).

| Device | Tier | p95 frame | Draw calls | Heap | Date |
|---|---|---|---|---|---|

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
`POST /pawlegends/stripe/webhook`; one checkout per SKU in USD and EUR, then record the session ids here.

| SKU | Currency | Session id | Date |
|---|---|---|---|
