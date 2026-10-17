# W2-TOOLS-HOSTING: handover

## Built

| File | What |
|---|---|
| `tools/lib/vite-load.mjs` | `viteLoader()` loads the TS sources from Node (Vite middleware mode, no port, no HMR). Never touches 5174 |
| `tools/lib/args.mjs` | `argValue`, `hasFlag`, `positionals` |
| `tools/lib/rooms.mjs` | `roomDefFor`, `dayNoOf`, `playableFor` (ranked for dailies, practice for glass/variants), `candidateRoomIds` |
| `tools/lib/par-math.mjs` | `median`, `parFrom` (integer: gold = floor(best*115/100)), `mergePar`, `ghostPayloadOf`, `ghostFromLink` |
| `tools/lib/og-meta.mjs` | `escapeHtml`, `publicOrigin`, `joinUrl`, `dayOgTitle`, `dayOgDescription`, `metaBlock`, `stripMeta`, `pageHtml(template, meta, depth)`, `STATIC_PAGES`, `INDEX_META` |
| `tools/lib/budget-lib.mjs` | `firstLoadAssets(html)`, `distPath`, `baseOf`, `isLazyName`, `summarize`, `kb`, `BUDGET_KB = 450` |
| `tools/lib/pink-paw-sync.mjs` | `cleanCat`, `normalizeSnapshot`, `mergeGallery`, `adoptUrlFor` |
| `tools/validate.mjs` | `npm run validate [-- --days N --quiet]`: dailies 1..200, The Glass, 7 variants, one room per shell (all 12 shells appear by day 46). Each room goes through `content.validate` and then one empty-input `runToEnd`, which checks the sim version stamp. Prints a table and exits 1 on error. Current result: 208 rooms, all ok |
| `tools/par.mjs` | `npm run par [-- --dry --prune]` replays `runs/<roomId>/*.ghost` under each ghost's own `simVersion` and merges the result into `src/content/par.json` (sorted keys). `npm run par -- add <link…>` saves dare or handoff links as ghosts and finds the room from the ghost room key. It refuses FTUE `m=f` links and player rooms. `BADCAT_RUNS_DIR` / `BADCAT_PAR_JSON` override the paths (tests only) |
| `tools/RECORDING.md` | How to record 5 human runs per room (dev server 5174, dare link → `par add`), what the QA hook may and may not be used for, and the ghost file format |
| `tools/og.html` + `tools/render-og.mjs` | `npm run og [-- --days N --only d\|s\|static --out dir]`: its own Vite server on 5175 (next free up to 5179), Playwright chromium with SwiftShader. Writes `public/og/d/<n>.png` (1200x630, title band "Kitchen #18 · Breakfast Heist · can your cat wreck it?"), `s/<shell>.png` per shell, `glass.png`, `pick.png` (2x2 grid), `r.png`, `c.png` (plinth cat). Only changed files are written. With no browser it warns and exits 0. `tools/og.html?preview=18` (or `?preview=pick`) shows one card |
| `tools/og-pages.mjs` | `npm run og:pages -- <outDir> [--days N --public-url --asset-path --page-path]` writes `d/<n>.html`, the 8 link-shell pages (thanks, redeem and restore get `noindex`) and rewrites `index.html` in place. Image fallback: `og/d/<n>.png`, then `og/s/<shell>.png`, then `og/pick.png`. Default days: max(63, today + 180). Absolute image URLs: `BADCAT_PUBLIC_URL` + `/badcat-game/og/…`. Idempotent (checked with `diff -r`) |
| `tools/sync-pink-paw.mjs` | `npm run sync:pinkpaw [file.json] [--url U] [--as-of D] [--dry]`. Without a source it re-emits the snapshot with no network call (the current file comes out byte-identical). With a source it maps through `shared/pink-paw.ts` itself (`parsePinkPawGalleryBody` or `pinkPawGallery`, loaded with Vite). Known cats keep their coat and photo. New cats get a starter coat and `coatGuess: true`. Cats missing from the source are kept. Remote photos are never downloaded |
| `tools/budget.mjs` | `npm run budget [-- distDir --limit 450]`: gzip sizes of every JS/CSS file. First-load JS is the entry plus the modulepreloads in `index.html`. Lazy names (share, clip, editor, mediabunny, encoder, gif) are excluded, and the tool warns if one gets preloaded. Scratch build: 363.9 KB, ok |
| `tools/*.test.mjs`, `tools/all.mjs`, `tools/package.json` | node:test, 21 tests (og-pages HTML and escaping, par maths, budget parsing, Pink Paw merge). Node 22 does not accept a directory for `node --test`, so `tools/package.json` `"main": "all.mjs"` makes `node --test tools` work. `node --test tools/*.test.mjs` works too. Vitest does not pick these up (it only runs `*.test.ts`) |
| `runs/.gitkeep` | Recorded runs go here |
| `public/og/**` | Generated: 63 days + 12 shells + 4 statics (22 MB) |
| `client/next.config.js` | Web builds only (always on since Oct 17; it was a build flag). afterFiles rewrites: `/badcat`, `/badcat/d/:n(\d{1,4})`, `/badcat/c/:cat`, the glass/pick/r/c/thanks/redeem/restore/maker pages, the club/archive/rapsheet/brand/cameo/settings routes to `index.html`, and the catch-all `/badcat/:path*`. Fallback rewrites: a day without a page goes to `index.html`. `headers()` adds `Service-Worker-Allowed: /badcat/` to sw.js. Redirects are unchanged. eslint clean |
| `docs/CLIENT.md` | New closing section "Bad Cat Daily (/badcat)": route table, flag, build flow, the `VITE_*` names, build-only names, typed redirect in the backend, no score path |

## Checks

- `npm run validate`: 208 rooms ok. `npm run og`: 79 PNGs in 110 s. `og:pages` was run for days 1..63 (and 1..70)
  into `/private/tmp/.../scratchpad/b*` from a scratch `vite build` (never `client/public/badcat-game`), with one
  `<title>` per page. `node --test tools`: 21/21. `npx vitest run`: 44 files / 841 tests green.
- `npx tsc --noEmit`: one error, in `src/share/index.ts:130` (W2-SHARE, still in progress, not this lane).
  `npm run build` / `npm run budget` against `dist/` therefore wait for that fix. Budget was verified on a scratch
  build.
- `par.json` stays `{}`. No human runs are recorded yet. That is a founder/dev task (tools/RECORDING.md); the
  scripted QA search must not be used for par (GDD 4.5: not a bot).

## Deviations and open points

- GDD 6.6 says `render-og.mjs` writes the per-day HTML. Here it is split into `render-og.mjs` (images) and
  `og-pages.mjs` (HTML), matching the frozen package.json script names.
- `public/og` is 22 MB of PNG (about 250 KB each). Decide whether to commit it or regenerate it in CI. JPEG would
  be about 4x smaller, but the brief fixed `.png` names.
- Days past the pre-rendered range rely on Next's fallback rewrite (`/badcat-game/d/:n.html` → `index.html`
  after the afterFiles rewrite finds no file). Rule matching was checked with Next's path-to-regexp, but not on a
  real Vercel deploy. Check `/badcat/d/<n beyond range>` once after the first deploy. The default range
  (today + 180) makes this rare anyway.
- SW scope: the header is in place. The platform still registers with scope `/badcat-game/` (change request
  appended to FULL-PLAN.md). Integrator: chain `og:pages` after `build:client` (plan 7.3).
- `pink-paw-cats.json` may now carry an optional `coatGuess: true` on new cats. `parsePinkPawSnapshot` ignores
  unknown fields.
