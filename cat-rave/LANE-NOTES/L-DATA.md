# L-DATA notes

## Done
- `src/data/index.ts`: live feed (paging, 10 s timeout, memo stripped at fetch), staleness, polling with backoff
  (60/120/240/300 s) and visibility pause, diff, find, treat helpers. `src/data/feed.test.ts` (26 tests) + `count.test.ts`.
- `src/data/snapshot.json` regenerated 2026-10-16T15:41:35Z: 129 payouts, $10.11 = 10 cats. Now also carries
  `contracts[]` (indexedThrough, lastRunFailed) per split; `scripts/snapshot.mjs` writes it.

## For L-UI (main.ts / hud)
- `createPayoutFeed` returns `RavePayoutFeed` (a superset of `PayoutFeed`): `staleChains`, `lastError`,
  `pending` / `pendingUsdMicro` (treats sent from this page, not yet indexed; draw "on its way", never add to the count),
  `treatStatus()`, `sendTreat()` (records pending + refreshes at 30 s and 2.5 min), `nextPollInMs`, `dispose()`.
- `load()` waits up to 1.2 s for live, else answers with the bundle; the live result then arrives via `subscribe`.
  On that bundle→live swap `diff.newCats` only holds cats completed in the last 15 min; every diff caps drop-ins at 24.
- `stale` is true today: Base (Oct 8) and Avalanche (Oct 15) have `lastRunFailed`. Use `feed.staleChains` for the
  "index catching up" text (e.g. "Base, Avalanche catching up").
- Pure helpers: `describeCat(cat)` (card title/line/"made of N payouts"/url), `formatUsd(micro, {cents})`,
  `SOURCE_LABEL`, `treatAllowedHere(location.host)` (in-page treat only on tokentails.com; else link `LINKS.give`).
- `main.ts` shout could use `describeCat`/`SOURCE_LABEL` for "Thanks to a wallet gift on Arc".

## Requests for the spec owner (types.ts / config.ts frozen)
- Optional: add `staleChains` + `pendingUsdMicro` to `PayoutFeed`/`PayoutSnapshot` so consumers need not import `RavePayoutFeed`.
