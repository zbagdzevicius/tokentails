# L8 notes (platform + progress)

- No types.ts change needed. Local types: `Streak` (progress, extends the stub with freezesLeft/frozeDays/broken),
  `MemoryStore` (Store + remove/keys), `Entitlements`, `PinkPawCat`, `Cameo`, `RapSheet`, `SeasonData`.
- `recordCrimes(store, events, propKinds?, dayNo?)`: events carry prop indexes, not kinds, so prop crimes need
  `propKinds` (e.g. `state.props.map(p => p.kind)`); without it only special crimes count.
- `index.html` (L5) should link `manifest.webmanifest` and `icon.svg` (both in `public/`).
- Assumptions not in the GDD: practice XP = floor(score/100) without the 100 base; 300 XP per season tier;
  weeks run Mon..Sun from Day #1 (weekOf = floor((dayNo-1)/7)); freezes refill per week, no carry-over;
  an unusable gap spends no freeze.
- Pink Paw list: 8 real cats from the Catnip Heist snapshot (2026-10-04, all WAITING then). Coat colours are a
  stylised match; show `PINK_PAW_STATUS_AS_OF` with any status. M1 replaces it with `tools/sync-pink-paw.mjs`.
