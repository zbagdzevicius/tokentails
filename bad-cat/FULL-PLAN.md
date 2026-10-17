# Bad Cat Daily: FULL build plan (M0 + M1a + M1b + M2)

Lead: tech lead (this file). Design: `docs/plans/viral-game/GDD.md` v1.2. What exists: `README.md` (M0 built, parts of
M1a). This plan replaces `LANES.md` for the FULL build; `LANES.md` stays as the M0 record.

Goal: every feature of milestones M0, M1a, M1b and M2 (GDD 17.1 table and 17.3) and every system of GDD 3–12 they
need. Phase 2 (accounts, `BAD_CAT` score type, global boards, server OG and short links) is out (see Excluded).

## 0. Status at plan time (Oct 16, 2026)

- `npx tsc --noEmit` clean, `npx vitest run` 28 files / 311 tests green after the lead's contract pass.
- `src/types.ts` extended (all additions optional or new, backward compatible). `SIM_VERSION` is now **5**,
  `MIN_REPLAY_SIM_VERSION` 4. Until W1-SIM lands, the sim still plays the v4 rules while stamping 5, and
  `codec/link.ts` rejects v4 links; both are fixed in wave 1 (W1-SIM gates rules on `SimState.rules`, W1-CODEC
  accepts 4..5 and marks v4 ghosts `replayOnly`).
- `PROP_KINDS` grew from 15 to 63 kinds (Appendix A targets and wishes, Season 1, sponsor product). The v4 rule data
  of kinds 1..20 is unchanged (a test pins it).
- New dependency (installed by the lead): `qrcode-generator` (bad-cat, runtime, MIT, no deps) for the save-code QR
  and the streamer dare QR. No other installs; packages must not install anything.
- Seam stub created: `src/render/world-dynamics.ts` (W1-RENDER-WORLD implements, W1-RENDER-ACTORS calls).
- `package.json` script names frozen: `validate`, `par`, `og`, `og:pages`, `sync:pinkpaw`, `budget` (tools land in
  wave 2).

## 0b. Wave 1 integration (Oct 16, 2026, lead)

- Gates: `npx tsc --noEmit` clean, `npx vitest run` 40 files / 773 tests, `npm run build` ok (first load ≈ 374 KB gzip:
  index 234.5 + three 132.9 + css 6.5; mediabunny and share stay lazy), `npm run e2e` 5/5; backend lint, build and
  `npm test` (134 suites, 2169 tests) green.
- `types.ts` change requests applied: `PaywallContext.breaksTonight`, `OfferCardProps.onSecondary`,
  `todayNo`/`dayLabel` on redeem/thanks/brand, `RedeemResponse.cameoId`, `Renderer.spectatorAt`/`projectHuman`, the
  v5 `SimState` internals, and the comments (humanSpot L0-L1, pickerRooms, ownedCosmetics keys, faceUrl). The money
  `*PropsX` adapters and `SimStateL1` still compile and may be dropped later.
- Sim (v5, unreleased, no SIM_VERSION bump): a mirror or webcam sees over furniture up to its own surface level, a
  webcam always from L2 (`lineOfSightOver`, `webcamOver`). The Home office webcam went from 1 to 15 cells, the Zoom
  tripod from 4 to 15. v4 golden replays unchanged.
- Codec: `buildLink`/`buildLinkAsync` now keep each ghost's `simVersion` (a chained v4 ghost was re-stamped as v5).
- Wired in `main.ts`: `progress` (full ProgressApi), `money` (on the platform's store, env, session id and A/B arm),
  `registerServiceWorker()`. The index.html links stay absolute: Vite rewrites `/icon.svg` to the base (`./`,
  `/badcat-game/`), so the W1-PLATFORM request is not needed.
- UI shell (W2/W3 replace these with their screens): router screens `sheet` (thanks, redeem, restore, club, cameo,
  brand, shop, gift, maker placeholder), `cats` (catMaker.manage), `rapsheet`; route links open them before any
  first-visit flow; room links (`/r?r=`) play the player room as practice and re-share it; replays and ghosts pass
  `simVersion`, v4 ghosts are "replay only" (no beat result); paywall offer card after the share (money decides);
  briefing notes (twist, boss, accomplice wish, sponsor, author); accomplice, cameo spectators (+ server faces) and
  trail on the renderer, wish → heart; season XP, Club freezes, friends board; Home season line, Rap Sheet link,
  Club/shop/gift/cameo buttons only with the Club UI flag and a live server, A2HS card, treat meter line; Settings
  consent, Your cats, Rap Sheet, .ics reminder, save code copy/load, restore and portal (Club, online).
- Still open for wave 2/3: HUD for v5 mechanics (noise meter, pull icon, mirror/on-camera cues, eye above the human
  via `projectHuman`), `setLayout('streamer')`, `setEditorOverlay`/`pickCell` (Room Maker), share formats and the
  music toggle / MediaRecorder audio wiring, `clipFrameTick` for any frame count (W2-SHARE), the clip-handoff
  `reAdd` opener prompt and `studioHandle` in captions, Felony Friday guest-star choice, archive beyond the picker
  (`content.archive`), `configureAnalytics({ common: { day_no, room_id } })` (the shell still adds both per event),
  SW scope for `/badcat/*` navigations (hosting).

## 0c. Wave 2 integration (Oct 16, 2026, lead)

- Gates: `npx tsc --noEmit` clean, `npx vitest run` 53 files / 939 tests, `npm run build` ok, `npm run budget`
  first load 384.4 KB gzip (index 252.6 + three 131.5; share, editor, gif, encoders and mediabunny stay lazy),
  `npm run validate` 208 rooms ok, `node --test tools` 21/21, `npm run e2e` 5/5. Backend not touched in wave 2.
- `types.ts` change requests applied: `FormatContext.secondName`, the `exportClip` extras (`adopted`, `link`,
  `secondFaces`, `restore`), `ShareApi.renderRapSheetLoop` (also on the `share` object), `SeasonView.tiers[].title`
  (progress fills it, meta shows it on title-only tiers), `RoomMakerOptions.renderer/cat/longPressMs`
  (`onReady` stays in the editor's `RoomMakerOptionsX`, dev only), `EditorApi.check` `bad` + `opts`.
- SW scope request applied: a page under `/badcat/*` registers `sw.js` with scope `/badcat/` (`swScope`), and
  `sw.js` routes the `/badcat-game/` assets relative to its own folder. `build:client` now chains `og:pages`.
- Wired (`main.ts`: `meta`, `loadEditor` lazy). Router screens `season`, `friends`, `weekly`, `rooms`, `maker`, the
  `playtest` event (maker → briefing → run → maker, never ranked, no result screen) and one-level back to
  My rooms / Rap Sheet / Settings. Shell: meta archive (Club lock = `archive_old` moment), Rap Sheet (share card,
  Club animated loop), season track (claim), full settings (sliders, clip music, caption style, consent, .ics,
  save code + QR, restore/portal/creator code only online), friends board (Race re-decodes the stored ghost),
  weekly card, consent banner on home (only with a PostHog key, or in dev), My rooms (play, share, remix, new),
  Room Maker (shell renderer released first: one WebGL context; publish saves to My rooms and shares the card),
  share screen "Post as..." chips (clip re-renders per format; stitch/reply ask for the @handle; carousel shares
  slides), fallback-2 GIF as the post, Android `intent://` link in in-app browsers, Remix / Report on player-room
  shares, HUD `accompliceName`, Club caption style and clip music from settings.
- Still open for wave 3: household clip (needs the second cat's run of the room), studio screen, streamer layout
  in runs, report = hide locally, an editor camera pose, render swapping the cat rig per clip pass (share reloads),
  Felony Friday guest-star choice, Community Sunday. Par stays `{}` until human runs are recorded.

## 0d. Wave 3 integration (Oct 16, 2026, lead)

- Gates: `npx tsc --noEmit` clean, `npx vitest run` 56 files / 1038 tests, `npm run build` ok, `npm run budget`
  first load 394.4 KB gzip (budget 450), `npm run validate` 208 rooms ok, `node --test tools` 21/21, `npm run e2e`
  18/18 (the room test now reaches publish → My rooms → open link every run); backend `npm run lint`, `npm run
  build`, `npm test` (134 suites, 2169 tests) green. Backend not touched in wave 3.
- Change requests applied: render `load()` waits for the running shader compile (overlapping loads crashed in
  three's compileAsync; the shell's `stageQueue` stays as a second guard); catmaker `catIndex: -1` = memory only
  (studio cats no longer overwrite cat slot 4); `RenderLayout` adds `'editor'` (70° whole-room pose) and the Room
  Maker uses it, so cells behind tall furniture can be tapped.
- Integration fixes: the desktop side panels (`SidePanels.ts`) shared the HUD's `.bc-side` class, so the Rap Sheet
  panel sat on top of the targets and a run showed two Must-Wreck lists; the panels are now `.bc-sp*` and hide the
  HUD aside while they show. The e2e player room marks three props near the spawn as targets (the authored ones sit
  on far counters, where no scripted run cleared 2 of 3), and reads the published link from My rooms when the card
  share saves an image instead of copying.
- Docs: `README.md` (built), `docs/ARCHITECTURE.md` (component + flow), `docs/DEVELOPMENT.md` (layout + section),
  the `CLAUDE.md` bad-cat row.
- Manual pass: the shared dev server on 5174 was down (connection refused, not restarted); the pass ran on the
  lead's own QA dev server on 5176 at 390×844 and 1280×800: first visit → first heist → clip export → share → home,
  days 1–7 (boss Saturday, Napper Sunday, Felony Friday chooser with rapid chip taps), household chip, picker,
  archive, settings, Rap Sheet, season, friends, My rooms, cats, Room Maker, studio, desktop side panels: no page
  or console errors.

## 1. Decisions

1. **Server pieces live in the backend, not in `client/pages/api`.** The client has no `pages/api` today, its
   Capacitor build is `output: "export"` (API routes are not allowed there), and it has no key-value store. The
   backend already has Stripe (`stripe` 20), MongoDB, a raw-body Stripe webhook pattern, `PermissionGuard`, throttling
   and SendGrid. So: new `backend/src/badcat/` module (controller + services + Mongo schemas, registered in the one
   `AppModule`), every route behind `BADCAT_*` flags that default off. This reverses GDD 10's "MVP Vercel functions,
   backend in Phase 2" for payments only; it is not Phase 2 (no accounts, no scores, no boards). Recorded as a
   deviation for the founder ("Your call": default backend).
2. **No score write path is added.** Scores stay local. The only score write path in the repo stays
   `POST /user/catbassadors/live`; the badcat module never touches scores.
3. **Stripe TEST mode only.** The badcat module uses its own key `BADCAT_STRIPE_SECRET_KEY` and refuses any live
   key (`sk_live_`/`rk_live_`) unless `BADCAT_STRIPE_ALLOW_LIVE=true`. Prices are inline `price_data` from
   `BADCAT_SKUS` (no dashboard setup). Tests mock Stripe; nothing calls Stripe, SendGrid or PostHog in tests.
4. **Rules versioning.** v5 rules are gated by `SimState.rules`; v4 ghosts replay bit-exact as "replay only".
   Preview days (dayNo ≤ 0), The Glass and `kitchen-v1..7` never change, so pre-launch v4 links keep their rooms.
5. **One WebGL context.** Portrait and room stills reuse the live renderer when one exists (GDD 11.2).
6. **Analytics** use the shared consent key `tt-analytics-consent` and PostHog EU via a fetch sender (no SDK), only
   when `VITE_BADCAT_POSTHOG_KEY` is set and consent is `granted`.
7. **Hosting**: `client/next.config.js` gets `/badcat/*` rewrites to `client/public/badcat-game/` behind the
   build-time flag `BADCAT_ROUTES` (default off), web build only (the Capacitor export is untouched).

## 2. New environment variable names (values never read by tooling)

Backend (`docs/BACKEND.md`, written by W1-BACKEND):

| Name | Default | Effect |
|---|---|---|
| `BADCAT_ENABLED` | off | Master switch; every `/badcat/*` route answers 404 when off (status answers all-false) |
| `BADCAT_CHECKOUT_ENABLED` | off | Checkout, webhook, entitlement, portal, redeem |
| `BADCAT_STRIPE_SECRET_KEY` | unset | Stripe key for the badcat module (test key required) |
| `BADCAT_STRIPE_WEBHOOK_SECRET` | unset | Signing secret of `/badcat/stripe/webhook` |
| `BADCAT_STRIPE_ALLOW_LIVE` | off | Only this allows a live key (founder decision, never in this build) |
| `BADCAT_ENTITLEMENT_SECRET` | unset | HMAC key of entitlement tokens; entitlement routes 503 without it |
| `BADCAT_PUBLIC_URL` | `https://tokentails.com` | Origin for Stripe return URLs, redeem/restore links, the typed redirect |
| `BADCAT_CAMEOS_ENABLED` | off | Cameo pool, shuffles, seen counter |
| `BADCAT_GIFTS_ENABLED` | off | Gift SKUs and redeem |
| `BADCAT_BRAND_ENABLED` | off | Brand Shelf and sponsor SKUs |
| `BADCAT_FACE_UPLOADS_ENABLED` | off | Cameo face upload + admin approval list |
| `BADCAT_RESTORE_EMAIL_ENABLED` | off | Restore magic link by SendGrid (off: dev returns the link outside production) |
| `BADCAT_SEEN_EMAIL_ENABLED` | off | Weekly "seen N times" email job for Club members |
| `BADCAT_CREATOR_CODES_ENABLED` | off | Creator code requests and the admin report |
| `BADCAT_TYPED_REDIRECT_ENABLED` | off | `GET /badcat/t` short-domain redirect + typed-arrival counter |

Game build (`bad-cat`, Vite, `docs/CLIENT.md` via W2-TOOLS-HOSTING): `VITE_BADCAT_API_URL` (backend origin; unset =
offline, every server feature hidden), `VITE_BADCAT_CLUB` (`1` shows Club/cameo/gift/shop UI), `VITE_BADCAT_POSTHOG_KEY`,
`VITE_BADCAT_STUDIO` (`1` allows `?studio=1` in production builds), `VITE_BADCAT_SHORT_URL` (clip URL line), existing
`VITE_BADCAT_PRESALE_URL`, `VITE_BADCAT_QA`. Client app: `BADCAT_ROUTES` (`1` adds the `/badcat/*` rewrites).

## 3. Waves and ownership (disjoint inside a wave)

| Wave | Package | Owns |
|---|---|---|
| 1 | W1-SIM | `bad-cat/src/sim/**` |
| 1 | W1-CONTENT | `bad-cat/src/content/**`, `bad-cat/public/daily/**` |
| 1 | W1-CODEC | `bad-cat/src/codec/**` |
| 1 | W1-RENDER-WORLD | `src/render/room-view.ts`, `props-view.ts`, `shards.ts`, `palette.ts`, `world-dynamics.ts`, `src/render/world/**`, `src/render/world.test.ts` |
| 1 | W1-RENDER-ACTORS | every other file in `src/render/**` (Renderer, index, rigs, materials, cone, overlays, cameras, clip pass, quality, context loss, preview, dev page, `render.test.ts`, `src/render/actors/**`) |
| 1 | W1-AUDIO | `bad-cat/src/audio/**` |
| 1 | W1-CATMAKER | `bad-cat/src/catmaker/**` |
| 1 | W1-PLATFORM | `src/platform/**` except `entitlements.ts`, `checkout.ts`, `cameos.ts`; `src/progress/**`; `vite.config.ts`; `public/` except `daily/**` and `og/**` |
| 1 | W1-MONEY | `src/money/**`, `src/platform/entitlements.ts`, `src/platform/checkout.ts`, `src/platform/cameos.ts` |
| 1 | W1-BACKEND | `backend/src/badcat/**`, `backend/src/app.module.ts` (badcat lines), `backend/src/user/heist/live-body-limit.ts` (+ spec, one raw path), `docs/BACKEND.md` and `docs/API.md` (new badcat sections only) |
| 2 | W2-SHARE | `bad-cat/src/share/**` |
| 2 | W2-EDITOR | `bad-cat/src/editor/**` |
| 2 | W2-META | `bad-cat/src/meta/**` |
| 2 | W2-UI-RUN | `src/ui/run.ts`, `src/ui/loop.ts`, `src/ui/input/**`, `src/ui/screens/Hud.ts`, `src/ui/hud/**`, `src/ui/run.test.ts`, `src/ui/loop.test.ts` |
| 2 | W2-TOOLS-HOSTING | `bad-cat/tools/**`, `bad-cat/runs/**`, `bad-cat/public/og/**`, `bad-cat/src/content/par.json` (created as `{}` by W1-CONTENT), `bad-cat/public/pink-paw-cats.json` (created by W1-PLATFORM), `client/next.config.js` (badcat lines), `docs/CLIENT.md` (badcat section) |
| 3 | W3-UI-SHELL | `src/ui/**` (all, incl. wave-2 UI-RUN files when needed), `src/main.ts`, `index.html`, `e2e/**`, `playwright.config.ts` |
| after 3 | INTEGRATOR (lead) | wire-up, budgets, docs outside the package, README, release checklist |

Lead-owned throughout: `src/types.ts`, `src/types.test.ts`, `package.json`, `package-lock.json`, `tsconfig.json`,
`vitest.config.ts`, `.gitignore`, this file (packages may only append to "Change requests").

## 4. Seams

- Wave 1 render seam: `createWorldDynamics(play, mat)` in `src/render/world-dynamics.ts` (stub in place).
  ACTORS adds `dyn.group` to the scene, calls `dyn.update(s, alpha, events)` every frame and `dyn.dispose()`;
  WORLD implements. Both keep `buildRoom(play, mat)` and `new PropsView(play, mat)` with today's signatures and
  `PropsView.update(...)`/`propPosition(...)` unchanged (WORLD may add optional parameters only).
- Wave 1 platform/money seam: `src/platform/index.ts` (PLATFORM) keeps re-exporting `getEntitlements`,
  `FREE_ENTITLEMENTS`, `CLUB_ENTITLEMENTS`, `type Entitlements` (from `./entitlements`), `openPresale` (from
  `./checkout`), `loadCameos`, `cameosEnabled`, `type Cameo` (from `./cameos`); MONEY keeps those names in its files.
  `getEntitlements(store?: Store): Entitlements` stays synchronous.
- Content may import `PINK_PAW_CATS`, `pinkPawWaiting` from `../platform` and `decodeRoom`, `dailyRoomId` from
  `../codec`. Render may import `decodeCat` from `../codec` (cameo cat codes). Share, editor, meta, ui use the
  services passed in plus the index exports named in their briefs.
- Every UI-producing package ships its own CSS file imported by its module and reuses `src/ui/styles.css` classes
  and CSS variables read-only (`bc-screen`, `bc-head`, `bc-cta`, `bc-link`, `bc-muted`, `bc-toggle`, `h()`/`btn()`/
  `toast()` from `src/ui/dom.ts`).
- Wave 3 wires everything through `GameServices` (`money`, `meta`, `loadEditor`, `progress`, `loadShare`).
- Import cycles: `src/platform/cameos.ts` (MONEY) stays self-contained and never imports `../money`; money imports platform, not the reverse.
- Par: W1-CONTENT reads `src/content/par.json` (`{ [roomId]: { bronze, silver, gold } }`, created empty); W2-TOOLS-HOSTING's `par.mjs` writes it from recorded runs in `bad-cat/runs/<roomId>/*.ghost`.

## 5. Common rules (in every brief)

Repo `/Users/zygimantasbagdzevicius/me/tokentails-app`, game package `bad-cat/`; always absolute paths. Never read
`.env*` files. No git commit, push, branch switch or stash. Do not touch `catnip-heist/`, `swordcat/`, `funding/`,
`client/public/heist-game`. Do not run `npm install`. Edit only the files you own; everything else is read-only. If
you need a change in a file you do not own (including `src/types.ts`), append one line to "Change requests" at the
end of this file (`- [PACKAGE-ID] what, why, workaround`) and work around it locally. Import other folders only
through their `index.ts`. No downloaded assets: procedural three.js geometry and WebAudio synthesis only.
Browser-only APIs (WebGL, WebAudio, IndexedDB, WebCodecs, MediaRecorder, `window`) are never touched at module top
level, so every module imports in Node tests. The sim stays integer-only and deterministic. The dev server already
runs on `http://localhost:5174` with an HTTPS tunnel: reuse it, never kill or restart it; start your own only on
5175–5179. Money and server features are behind env flags that default off; Stripe test mode only; never charge;
never call an external paid API (tests mock `fetch`, Stripe and SendGrid). Known bugs listed in `docs/*.md` are not
fixed silently; mention them. Done means `npx tsc --noEmit` and `npx vitest run` green in `bad-cat/` (backend: `npm
run lint`, `npm run build`, `npx jest src/badcat src/user/heist`), your acceptance checks pass, and a handover note
exists at `bad-cat/LANE-NOTES/<PACKAGE-ID>.md` (what you built, deviations, gaps). Tone: affectionate and cheeky,
never cruel; the cat never gets hurt, caught means a cuddle. Make it fun and charming.

## 6. Packages

Each package receives a full, self-contained brief from the orchestrator (ownership, GDD sections, types to use, build list, tests, acceptance). The scope line of each is below.

| Id | Wave | Scope |
|---|---|---|
| W1-SIM | 1 | v5 rules: spill-slide, stack bonus, cloth and cable pull, Roomba + framing, accomplice wish, box, mirror cone, on-camera bonus, tall tree + topple, Napper noise meter, two-human boss; rules gating with v4 golden replays |
| W1-CONTENT | 1 | 9 shells (5 home + Home office + 3–4 boss), 13 routines, 21 authored dailies (Appendix A + week 3), boss rooms, S1 Christmas schedule, generator beyond day 21, accomplice/sponsor/community schedule, validator v2, ContentApi additions |
| W1-CODEC | 1 | Room codec v2, replay-only ghosts (v4), link routes (thanks, redeem, restore, maker, club...), room links with dares and remix, creator codes, payload hash, size tests |
| W1-RENDER-WORLD | 1 | Furniture for every shell, 48 new prop meshes, stack pieces, cloth, cable, puddles, Roomba, tree topple, box, themes (S1, birthday, wedding, NYE), sponsor label, shards per material |
| W1-RENDER-ACTORS | 1 | 5 patterns, cosmetics on the cat, trails, personas and poses, Napper, two humans, mirror and webcam cones, scoop cuddle, edge arrow, projectWorld, ghosts, accomplice, cameo spectators and fridge wall, pickCell + editor overlay, streamer layout, portrait and room stills, clip pass sizes |
| W1-AUDIO | 1 | SFX for every new event and event kind, human voices per persona incl. "BAD KITTY... come here", Napper snore, boss loop, S1 sleigh layer, clip music sting, real-time clip scheduling for MediaRecorder |
| W1-CATMAKER | 1 | 2 s video opener, re-add after handoff, k-means palette + 7-pattern guess, all patterns, cosmetics chips, studio handle, up to 5 cats manager |
| W1-PLATFORM | 1 | PostHog sender + consent + common props, PWA (sw.js, A2HS), .ics, treat meter, env flags, progress (Rap Sheet 48+, streak + Club freezes, weekly card, season track S0–S3, par paws, friends board, my rooms, cosmetics owned), save code + QR, multi-cat profile, Pink Paw data |
| W1-MONEY | 1 | API client, entitlement cache, Club checkout (monthly/annual toggle, in-app), thanks, restore, portal, redeem, gifts, cameo/guest star flow, collar, shop, Brand Shelf/sponsor page, paywall engine + A/B, cameo bundle + shuffles + seen counter, creator code request |
| W1-BACKEND | 1 | `backend/src/badcat/`: status, checkout, webhook, entitlement tokens, restore, portal, redeem, cameos (weighted shuffles, load counters, seen), faces moderation, Club cat, creator codes, typed redirect, admin stats, weekly seen email job; all flagged off |
| W2-SHARE | 2 | 6 post formats + household, Stitch/reply template, studio session model, all cards (Rap Sheet mugshot, cat, cameo), carousel, 720×640 split, 6 s Roomba clip, still-waiting end line, video opener, music toggle, MediaRecorder audio, fallback 2 GIF, Club caption styles, Android `intent://` |
| W2-EDITOR | 2 | Room Maker: 6 shells, 6 palette tabs, place/move/rotate/delete, undo/redo 20, routine + event, 3 targets, limits + BFS, clear-to-publish, publish link + 1200×630 card, remix with 3 ancestors, speed build, admin JSON export |
| W2-META | 2 | Archive, Rap Sheet, season track, settings (consent, sliders, streamer, caption style, save code + QR, .ics, A2HS, restore, portal, cats, creator code), friends board, weekly card viewer, consent banner, my rooms |
| W2-UI-RUN | 2 | Run session and HUD for every v5 mechanic: ghost race with replay-only ghosts, two humans, noise meter, mirror/on-camera cues, crime popups, 12 event banners, suspicion eye above the human, haptics |
| W2-TOOLS-HOSTING | 2 | `tools/validate.mjs`, `par.mjs` + run recorder, `render-og.mjs` (Playwright), `og-pages.mjs` (per-day and per-shell HTML), `sync-pink-paw.mjs`, `budget.mjs`; `client/next.config.js` rewrites behind `BADCAT_ROUTES`; `docs/CLIENT.md` |
| W3-UI-SHELL | 3 | Router and every flow: home (streak, seen counter, treat meter, A2HS), picker 14, briefing (twist, accomplice, guest star choice, sponsor, community credit, boss), result (par paws, wish, adopt link, dare result), share screen with formats, paywall moments, money screens, meta screens, editor + room links + remix + Community Sunday, Felony Friday, household, studio, streamer layout, clip handoff re-render, consent, SW, analytics; e2e suite |

## 7. Integrator (lead) after wave 3: wire-up and release

1. Pull every package's `LANE-NOTES/*.md` and "Change requests"; apply the `types.ts` requests; resolve glue
   (GameServices wiring in `main.ts`, missing index exports, CSS collisions).
2. Green gates: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run validate`, `npm run budget`
   (first-load JS ≤ 450 KB gzip without share/clip/editor/mediabunny chunks), `npm run e2e`; backend `npm run lint`,
   `npm run build`, `npm test`.
3. Chain `og:pages` into `build:client` in `package.json`; do not commit `client/public/badcat-game`.
4. Check every flag defaults off: with no env, the game shows no Club/cameo/shop UI, makes no network call except
   static files, and the backend answers `GET /badcat/status` all-false.
5. Check the one-score-path rule: `rtk grep -rn "catbassadors/live" backend/src/badcat bad-cat/src` finds nothing.
6. Manual pass on the running dev server (http://localhost:5174, do not restart it): FTUE from a link, ranked run,
   clip export, each weekday room, a boss room, Sunday Napper, Felony Friday, Room Maker publish + open link, dare
   link with a v4 ghost (replay only), Club checkout in Stripe test mode against a local backend (only if the
   founder supplies test keys; otherwise mocked).
7. Docs outside the package: `CLAUDE.md` package table (it has uncommitted user edits: change only the bad-cat
   row), `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md` (the duplicated contract `bad-cat/src/types.ts` money block ↔
   `backend/src/badcat/badcat.contracts.ts`), `bad-cat/README.md` (milestone table now "built").
8. Founder "Your call" list: backend instead of Vercel functions (default: backend), founding renewal price,
   shelter share, Stripe live switch (never flipped by AI), name/hashtag, short domain.

## 8. Excluded (Phase 2 and other cuts)

> Update (Oct 16, 2026, Phase 2 build): the Phase 2 items below are now built behind flags that default off
> (accounts, `BAD_CAT` replay-verified saves through the one score route, boards, server OG + short links, the room
> feed, the live treat meter, live Pink Paw statuses, `/yourcat` import and faces, web push and streak emails, the
> full store, the creator dashboard) plus gamepad and the CMS moderation page. See `README.md` "Phase 2". Still not
> built: real-device QA, server clip render, Twitch/TikTok LIVE, multiplayer, zoomies, Host Kit, portal builds,
> Live Photos, the outfit slot.

- Accounts / Firebase sign-in for the game, accounts claiming purchases.
- `BAD_CAT` score type, server replay verification, any score write (only `POST /user/catbassadors/live` exists).
- Global leaderboards (`GET /badcat/board/:day`), public room feed.
- Server-rendered per-link OG images and short links (`POST /badcat/room`), live treat meter (`GET /badcat/meter`).
- `/yourcat` import, face uploads through `/yourcat` moderation, monthly HD portrait.
- Web push and streak emails beyond the weekly Club seen email.
- Real-device QA on iPhone 11 / Galaxy A15 and TikTok/IG webviews (needs hardware; the e2e suite covers emulation).
- Server clip render fallback, Twitch/TikTok LIVE modes, multiplayer, gamepad, zoomies, Host Kit, portal builds,
  Live Photos, a full cosmetics store beyond the 3 launch items + bundle.

## Change requests (append-only)

<!-- - [PACKAGE-ID] what, why, workaround in place -->
- [W1-MONEY] types.ts `PaywallContext`: add `breaksTonight?: boolean` (GDD 9.2 streak_break needs it); workaround: `PaywallCtx` in src/money/paywall.ts accepts it, undefined = trust the caller.
- [W1-MONEY] types.ts `OfferCardProps`: add `onSecondary?(sku: BadcatSku): void` (the offer's secondary button, e.g. "every week with Club"); workaround: `OfferCardPropsX`, without it the secondary calls onAccept.
- [W1-MONEY] types.ts `RedeemProps` and `ThanksProps`/`BrandProps`: add `todayNo?: number; dayLabel?(dayNo: number): string` (day picker for gift cameos, day labels on thanks/brand); workaround: `RedeemPropsX`/`ThanksPropsX` (without them the picker is hidden and labels read "Day #N").
- [W1-PLATFORM] platform/index.ts: also re-export `KEY_ENTITLEMENTS, decodeEntitlementToken, sanitizeEntitlements, cachedEntitlementToken, entitlementsExpired, cosmeticsForSkus, ownsCosmetic, OWNED_SKUS` from './entitlements' (money imports them from '../platform/entitlements' directly meanwhile; both files are W1-MONEY's).
- [W1-PLATFORM] detectEnv must fill `EnvInfo.apiUrl` (VITE_BADCAT_API_URL) and `clubUi` (VITE_BADCAT_CLUB=1); money treats `clubUi !== true` or no apiUrl as fully offline (zero requests).
- [W1-BACKEND] face upload contract chosen by money: `POST /badcat/face/:cameoId` JSON `{ token?, sessionId?, png: <base64 PNG, <= 64 KB raw> }` (~88 KB body); please accept that shape (or tell the integrator).
- [W1-PLATFORM] types.ts: document `ProgressApi.ownedCosmetics` as keys `slotIndex*256 + id` (slots collar, hat, trail, caption, stamp; ids are only unique per slot); workaround: `cosmeticKey`/`cosmeticFromKey`/`ownedCosmeticDefs` exported from src/progress.
- [W1-PLATFORM] index.html (W3): manifest and icon links should be relative (`manifest.webmanifest`, `icon.svg`) so they work under base `./` and `/badcat-game/`; main.ts should wire `progress` from src/progress and call `platform.registerServiceWorker?.()` at boot; workaround: none needed in platform.
- [W1-PLATFORM] hosting (W2-TOOLS-HOSTING): the SW scope `/badcat-game/` does not cover `/badcat/*` navigations; serve sw.js with `Service-Worker-Allowed: /badcat/` or accept asset-only caching; workaround: asset caching works as is.
- [W1-SIM] Replay callers (codec ghosts, ui run ghost race, render ghosts, share renderFrames) must pass `{ simVersion: ghost.simVersion }` to `initSim`/`runToEnd` (default is SIM_VERSION 5, RangeError outside 4..5); workaround: none needed in sim, callers own it.
- [W1-SIM] types.ts: add optional v5 internals to `SimState` (`slideStep`, `noisy`, `wishProp`, `napper`, `cables: number[]`) and widen `swatTarget` docs to `{ prop, grab, pull?: 'cloth' | 'cable' }`; why: they are hashed under rules 5 and survive structuredClone; workaround: local `SimStateL1` in `src/sim/events.ts`.
- [W1-BACKEND] `RedeemResponse` in src/types.ts: add optional `cameoId?: string` (the backend returns it for a redeemed gift cameo so the recipient can upload a face); backend contract already has it, clients can ignore it until then.
- [W1-BACKEND] `CameoEntry.faceUrl` is a backend-relative path (`/badcat/face/<id>.png`); W1-MONEY/W1-RENDER-ACTORS must prefix `VITE_BADCAT_API_URL` before loading it. No types change needed (document it in the comment).
- [W1-CONTENT] Shells 10 (Kitchen · holiday dinner, humanSpot2 for Thanksgiving) and 11 (Living room · Zoom, webcam) plus routine 13 (WFH Worker on the sofa) exist beyond the briefed 0..9 / 0..12 lists; codec v2 4-bit fields cover them, no types.ts change needed. Workaround: none needed.
- [W1-CONTENT] `ShellDef.humanSpot` comment says "a floor cell": FULL-build humans also sit on L1 (sofa, bed, office chair); suggest the comment read "floor or seat cell". Sim sight does not depend on the level. Workaround: validator allows L0-L1.
- [W1-CONTENT] `ContentApi.pickerRooms` comment ("Kitchen variants for the picker (M0)") is stale: it now returns The Glass, today and 14 past dailies. Workaround: none needed.
- [W1-RENDER-ACTORS] types.ts `Renderer`: add `spectatorAt?(clientX: number, clientY: number): CameoEntry | null` (cameo name tags on hover/tap, GDD 3.4) and `projectHuman?(i: number): { x: number; y: number; onScreen: boolean } | null` (HUD eye above human i); workaround: both are public methods on `GameRenderer` (cast via `isGameRenderer`).
- [W1-RENDER-ACTORS] W2-SHARE `clipFrameTick`: generalise to `plan.frames` (opener 60, tail 30, as render's `clipFrameToTick`/`clipFrames` already do; test in src/render/actors/actors.test.ts restates the rule); workaround: render follows the rule for any frame count.
- [W1-RENDER-ACTORS] W1-SIM/W1-CONTENT: the Home office webcam (shell 3, (5,0) on the desk, facing S) sees 1 cell because `shortConeCells` occludes on the desk cell next to it; the Thursday wedge is a single cell. Suggest the webcam/mirror line walk skip occluders at the origin's level or start beyond the furniture it sits on; workaround: render draws whatever cells the sim returns (sim cells win over the render fallback).
- [W1-RENDER-ACTORS] Cameo faces: `setCameos(bundle, faces)` takes decoded images keyed by `CameoEntry.id`; the caller (W1-MONEY / W3-UI) fetches `VITE_BADCAT_API_URL + faceUrl` and decodes it; render never fetches. Workaround: none needed.
- [W2-META] types.ts `SeasonView.tiers[]`: add optional `title?: string` (progress `tierTitle(t)`) so title-only tiers show their name; workaround: meta shows "Bragging rights" / "Title earned".
- [W2-TOOLS-HOSTING] W1-PLATFORM/W3: with `BADCAT_ROUTES` on, `next.config.js` serves `/badcat-game/sw.js` and `/badcat/sw.js` with `Service-Worker-Allowed: /badcat/`; to control `/badcat/*` navigations, register with `{ scope: '/badcat/' }` when `location.pathname` starts with `/badcat/` (today's default scope is `/badcat-game/`); workaround: asset-only caching as now. Integrator: chain `node tools/og-pages.mjs ../client/public/badcat-game` after `build:client` (plan 7.3).
- [W2-SHARE] types.ts `ShareApi.exportClip` opts: add `adopted?: boolean` (still_waiting "went home"), `link?: string` (fallback-2 card link), `secondFaces?: Map<number, FaceDecal>` and `restore?: { cats: CatSpec[]; faces?: Map<number, FaceDecal> }` (household reloads the renderer's cat model for pass B and restores it after); workaround: `ExportClipOptions` in share/index.ts accepts them, callers typed against `ShareApi` cannot pass them yet (default restore = `[cat]` without face decal).
- [W2-SHARE] types.ts `FormatContext`: add `secondName?: string` (household label "Mochi vs Luna"); workaround: `FormatContextX` in share/formats.ts.
- [W2-SHARE] types.ts `ShareApi`: add `renderRapSheetLoop?(input: Extract<CardInput, { kind: 'rapsheet' }>, opts?: { signal?: AbortSignal }): Promise<{ blob: Blob; mime: string } | null>` (animated Club Rap Sheet, 3 s loop); workaround: exported from share/index.ts as a module function.
- [W2-SHARE] render `renderFrames` draws the renderer's loaded cat rig, not the `cat` argument (sim only): suggest swapping the player rig when `cat` differs (household pass B, still_waiting with a Pink Paw cat); workaround: share reloads the renderer (`load(play, [second.cat])`) before pass B and after the clip.
- [W2-EDITOR] types.ts `RoomMakerOptions`: add optional `renderer?: Renderer` (reuse the live renderer, FULL-PLAN decision 5: one WebGL context), `cat?: CatSpec` (preview cat) and `onReady?(api)` (dev/e2e cell lookup); workaround: `RoomMakerOptionsX` in src/editor/RoomMaker.ts (without `renderer` the editor creates its own via `render.createRenderer`, disposes it during the playtest and on exit).
- [W2-EDITOR] types.ts `EditorApi.check`: return `bad?: number[]` (offending cells, z*width+x, for the red overlay) and accept `opts?: { admin?: boolean }`; workaround: `editor.check` already returns `bad` and takes the third arg (structurally compatible).
- [W2-EDITOR] Ancestors order: the editor writes `RoomDef.ancestors` newest first and capped at 3 (brief, GDD 6.4 "Remix of Zyg's Kitchen by Mia" = ancestors[0]); codec v2 keeps "the last 3" of longer lists, so callers must not pass > 3 newest-first names (the editor never does). W3/W2-META: show `ancestors[0]` as "Remix of ...". Workaround: none needed.
- [W2-EDITOR] render: the streamer pose used by the editor hides some cells behind tall furniture (Kitchen back counter x 0-1, floor behind the island); `pickCell` correctly returns the occluder, so those cells cannot be tapped. Suggest a `setLayout('editor')` pose (steeper pitch, ~70°) later; workaround: what you see is what you tap.
- [W3-UI-SHELL] catmaker: an option to keep the studio cat out of IndexedDB slots (e.g. `catIndex: -1` = memory only) would stop ?studio=1 overwriting slot 4; workaround: the shell uses slot 4.
- [W3-UI-SHELL] render: two overlapping Renderer.load() calls throw 'Cannot read properties of undefined (reading isReady)' from three's compileAsync (materials of the first load are disposed while it still polls); suggest load() cancel/await the previous compile; workaround: the shell serialises its loads (stageQueue).
- [LEAD] Applied in the wave 3 integration: the two W3-UI-SHELL requests (render load serialisation, catmaker `catIndex: -1`) and the W2-EDITOR `setLayout('editor')` pose.
