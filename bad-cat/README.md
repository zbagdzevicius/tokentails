# Bad Cat Daily

A daily cat-chaos browser game for Token Tails. You play a house cat with 75 seconds to knock as much as you can
off the counters, shelves and tables of today's room while the human isn't looking. One ranked run a day,
unlimited practice, a boss room on Saturdays, and a 12-second vertical clip of your best crime to post. Your real
cat's face goes on the 3D cat from one photo, and you can build rooms for your friends to wreck.

Spec: `docs/plans/viral-game/GDD.md` v1.2. The FULL build plan (M0 + M1a + M1b + M2) and its wave log are in
`FULL-PLAN.md`; `LANES.md` is the M0 record; each package's handover note is in `LANE-NOTES/`. Phase 2 (GDD 10,
17.3: accounts, server-verified ranked runs, boards, server OG and short links, the room feed, live data, push,
the full store) is built on top, every piece behind flags that default off (see "Phase 2" below).

- Portrait first: iPhone Safari and Chrome Android, then desktop (side panels, streamer layout).
- No downloaded assets. All 3D is procedural low-poly three.js (merged primitives, flat shading, a warm toon
  palette) and all audio is WebAudio synthesis.
- The sim uses integer maths only and is deterministic, with no physics engine, floats, `Math.random`, trig or
  `Date`. The same inputs always give the same `finalHash`, which is what replays, ghosts and clips rely on.
  `SIM_VERSION` is 8 (QA round 3 balance: a cat frozen in sight within 2 cells of a mess under 2 s old is
  "red-pawed" and gains suspicion; a human who sees the cat move keeps his eyes on it for the rest of the look;
  fake-outs are 35 % of turns from 20 s and never two in a row; warnings are a quarter shorter (Monday 24 → 18,
  Saturday 15 → 12); the mirror glints once per 8 s; two humans never warn at once and are busy a quarter longer;
  the Couch Potato and the Party Host look over the coffee / party table (the Party Host and the Christmas Host
  across the whole room); the Napper hears crashes and swats a little less, forgets 1.5× faster while the cat
  loafs and loses v7's longer wake look). v7 (QA round 2 game feel: seat-chain JUMP, combo on lands and hits, a 4 s
  window held while a fall is in flight, stack combo cap, Roomba framing from 2 cells), v6, v5 and v4 ghosts
  (`MIN_REPLAY_SIM_VERSION` 4) replay on their own rules as "replay only" (the v8 daily content changed too).
  Rank titles come from each room's planner-bot score (`src/content/rank-bot.json`, Legendary = bot × 0.9, Gremlin
  = bot × 0.35; rooms past the table fall back to `RANK_PCT_BY_SHELL`). `src/sim/planner.ts` is that bot;
  `src/sim/balance.test.ts` checks the round 3 feel rules (a cat that never freezes is caught before 30 s, waiting
  ≤ 40 %, Couch Potato cones ≥ 60 % of the swat cells, 14+ Bedroom props to knock off) and `v8.test.ts` the v8 rules.
- Daily rooms (round 2 content rules, `feelProblems` in `src/content/validate.ts`): a fragile starter prop within
  3 cells of the spawn, wreckable in 5 s; on Thursdays the Home office webcam (a tripod at (4,5)) films 30 %+ of the
  raised props and a Must-Wreck target; 4+ raised props within 1 cell of the Roomba's road (the roads now run
  along the counters); the Bathroom and Bedroom carry a high-shelf perfume tray (kind 64, a 4-item glass stack).

## Commands

Run everything from `bad-cat/`.

| What | Command |
|---|---|
| Dev server | `npm run dev` (http://127.0.0.1:5174, strict port; a second one goes on 5175–5179) |
| Typecheck | `npx tsc --noEmit` (or `npm run typecheck`) |
| Unit tests | `npx vitest run` (or `npm test`); tool tests: `node --test tools` |
| Standalone build | `npm run build` (tsc, then Vite into `dist/`, relative base) |
| First-load budget | `npm run budget` after `npm run build` (entry + three ≤ 450 KB gzip; share, editor, GIF, encoders and `mediabunny` stay lazy) |
| Room validator | `npm run validate` (dailies 1..200, The Glass, the Kitchen variants, one room per shell) |
| OG images and pages | `npm run og` (Playwright, own port 5175–5179), `npm run og:pages` |
| Par paws | `npm run par` from recorded runs in `runs/<roomId>/*.ghost` (`tools/RECORDING.md`) |
| Pink Paw cast | `npm run sync:pinkpaw` (no network without a source) |
| Build for tokentails.com | `npm run build:client` (base `/badcat-game/`, output `../client/public/badcat-game`, then `og:pages` on it) |
| Vendor the sim into the backend | `npm run vendor-sim` (writes `backend/src/vendor/badcat-sim/`); `npm run vendor-sim:check` (CI); `npm run vendor-sim:check-remote -- <backend url>` (deploy gate) |
| Rewrite the backend golden runs | `BADCAT_WRITE_GOLDEN=1 npx vitest run src/server` (after a SIM_VERSION bump, then `npm run vendor-sim`) |
| Preview a build | `npm run preview` (port 4174) |
| Browser e2e | `npm run e2e` (Playwright; builds with `VITE_BADCAT_QA=1` into `.e2e-dist/`, serves on 4392 or `BADCAT_E2E_PORT`, 390×844) |
| Render dev page | `npm run dev`, then open `/src/render/dev.html` (not shipped) |
| Re-bake rooms | `BADCAT_WRITE_ROOMS=1 npx vitest run src/content/rooms.bake.test.ts` |

## Env flags

Only `VITE_*` variables reach the page (`vite.config.ts` sets `envPrefix`). Every flag defaults off: with no env
the game shows no Club, cameo, gift or shop UI and makes no request beyond its own static files.

| Flag | Effect |
|---|---|
| `VITE_BADCAT_API_URL` | Backend origin of the `badcat` module (`backend/src/badcat/`). Unset: offline, every server feature hidden |
| `VITE_BADCAT_CLUB` | `1` shows the Club, cameo, gift and shop UI (needs the API URL too) |
| `VITE_BADCAT_POSTHOG_KEY` | PostHog EU key; events are sent only with it and `tt-analytics-consent = granted` |
| `VITE_BADCAT_STUDIO` | `1` honours `?studio=1` in production builds (always on in dev) |
| `VITE_BADCAT_SHORT_URL` | Short URL on the clip's URL line |
| `VITE_BADCAT_PRESALE_URL` | Pre-sale Payment Link button (valid `https:` URL only) |
| `VITE_BADCAT_QA` | `1` installs `window.__BADCAT_QA__` (`screen`, `state`, `play`, `scoring`, `goto`, `setDay`, `services`, `router`, `events`). Never in production |
| `VITE_BADCAT_ONLINE` | Phase 2: `1` turns on `src/online` (needs the API URL; each feature also waits for its backend flag in `GET /badcat/status`). Unset: zero requests |
| `VITE_BADCAT_AUTH_ORIGIN` | Phase 2: origin of the client's `/badcat-account` page (sign-in + token bridge). Unset: the page's own origin on tokentails.com, else accounts are off |
| `VITE_BADCAT_LIVE_PINKPAW` | Phase 2: `1` reads Pink Paw statuses from the shelter gallery (badges and "went home" lines only) |
| `VITE_BADCAT_YOURCAT_IMPORT` | Phase 2: `1` offers "Import my cat from /yourcat" in Settings (signed in) |
| `VITE_BADCAT_TREAT_URL` | Phase 2: https page of the existing guest treat flow, linked from a PERFECT CRIME result. Unset: hidden |

Build-only (Node): `BADCAT_BASE`, `BADCAT_BUILD_ID`, `BADCAT_PUBLIC_URL`, `BADCAT_E2E_PORT`, `BADCAT_WRITE_ROOMS`.
The client app's `BADCAT_ROUTES` adds the `/badcat/*` rewrites (`docs/CLIENT.md`, "Bad Cat Daily"). The backend's
`BADCAT_*` flags (checkout, cameos, gifts, brand, faces, restore email, seen email, creator codes, typed redirect)
are in `docs/BACKEND.md`; Stripe runs in test mode only and a live key is refused unless `BADCAT_STRIPE_ALLOW_LIVE`.

## Architecture

`src/types.ts` holds the interfaces and constants (30 Hz ticks, `RUN_TICKS` 2,250 = 75 s, `FTUE_TICKS` 1,200 =
40 s, `BOSS_TICKS` 2,700 = 90 s). Each folder exposes its API through `index.ts`, and only `main.ts` wires the
folders into `GameServices` (`share` and `editor` are lazy chunks). Browser-only APIs (WebGL, WebAudio,
IndexedDB, WebCodecs, MediaRecorder) are created inside functions, so every module imports in Node tests.

| Folder | Role (GDD) |
|---|---|
| `src/sim/` | Deterministic rules (4), v5, v6 and v7 gated on `SimState.rules`: push, fall, domino, spill-slide, stack bonus, cloth and cable pull, grab and stash, Roomba with framing, box, accomplice wish, mirror and webcam cones (on-camera bonus), tall tree topple, Napper noise meter, two-human boss, suspicion → caught → cuddle, scoring, replay, state hash |
| `src/content/` | 12 shells (5 home rooms, Home office, Party room, Bedroom, boss and holiday shells), 14 routines, 21 authored dailies plus the generator to day 200+, The Glass, Kitchen variants, S1 Christmas, accomplice, sponsor and Community Sunday schedules, validator v2, par |
| `src/codec/` | Cat code, link routes (days, glass, pick, cat, room, thanks, redeem, restore, maker, club...), ghosts with replay-only v4, room codec v2 with remix ancestors, creator codes, payload hashes |
| `src/render/` | three.js: every shell and prop mesh, themes, 7 cat patterns and cosmetics, trails, personas, Napper, two humans, cones, scoop cuddle, edge arrow, ghosts, accomplice, cameo spectators and fridge wall, editor overlay and `pickCell`, portrait / streamer / editor camera poses, clip pass, portrait and room stills |
| `src/audio/` | SFX for every event, persona voices, Napper snore, boss loop, S1 sleigh layer, clip music sting, real-time scheduling for MediaRecorder clips |
| `src/catmaker/` | My Cat: photo or 2 s video opener, face crop, k-means palette and pattern guess, chips and cosmetics, studio handle, re-add after a handoff, up to 5 cats (`catIndex: -1` keeps a studio cat in memory only) |
| `src/platform/` | Env, storage, PostHog sender with consent, PWA (`sw.js`, A2HS), `.ics` reminder, treat meter, Pink Paw data |
| `src/progress/` | Streak with Club freezes, Rap Sheet, weekly card, season track S0–S3, par paws, friends board, My rooms, owned cosmetics, save code + QR |
| `src/money/` | Badcat API client, entitlement cache, Club checkout (monthly / annual), thanks, restore, portal, redeem, gifts, cameos and guest stars, shop, Brand Shelf, paywall engine with A/B, creator codes |
| `src/online/` | Phase 2 (offline unless `VITE_BADCAT_ONLINE=1`): account bridge to the client's `/badcat-account` iframe, ranked saves to `POST /user/catbassadors/live` (type BAD_CAT) with an offline queue, board, account, purchase claim, short links, room feed, live meter and Pink Paw statuses, `/yourcat` import, web-push subscription, creator dashboard |
| `src/server/` | Phase 2: the pure entry the backend vendors (`verifyRanked`, `checkRoom`, canonical logs, day numbers, name filter). No browser API |
| `src/share/` | Clip planner and 12 s export, 6 post formats plus household, Stitch / reply template, studio queue, Rap Sheet / cat / cameo / story cards, carousel, fallback-2 GIF, music toggle, MediaRecorder audio, in-app handoff and Android `intent://` |
| `src/editor/` | Room Maker: 6 shells, palette tabs, place / move / rotate / delete, undo / redo, routine and event, 3 targets, limits and BFS, clear-to-publish, link and 1200×630 card, remix, speed build, admin JSON |
| `src/meta/` | Archive, Rap Sheet, season track, settings, friends board, weekly card, consent banner, My rooms |
| `src/meta/` (Phase 2) | Daily board (`board.ts`), room feed (`feed.ts`), Settings → Online (`online.ts`), "Post to feed" on My rooms |
| `src/ui/` | Router (13.5) and every flow: home, picker, briefing (Felony Friday chooser, boss, Community Sunday, sponsor), run loop, HUD, result (par paws, wish, adopt, dare result), share formats, paywall moments, money and meta screens, household, studio, streamer layout and desktop side panels, clip handoff |
| `tools/`, `runs/` | Validator, par recorder, OG renderer and pages, Pink Paw sync, budget |
| `e2e/` | Playwright smoke, flow and full-flow specs driven by the QA hook |

Room flow: `boot → (pick) → (link ? catmaker : home) → briefing → run → result → share → home`. A first visit
from a link runs the cat maker, then a 40 s first heist (The Glass on a boss or Napper day), the clip and share
screens, then "Your ranked run is ready". Offers never show in session 1 and at most once per session.

## This build compared with the GDD milestones (17.1)

| Milestone | Status |
|---|---|
| M0 (Kitchen, sim, controls, face decal, clip export) | Built |
| M1a (dares, cards, analytics, Club checkout, shells, M1a rules, patterns, video opener, OG pages, streak, par, Pink Paw sync) | Built |
| M1b (Party room + Bedroom, 21 dailies, boss, picker, paywall moments, cameos/gifts/collar, Brand Shelf, Stitch/reply, 6 formats) | Built |
| M2 (Rap Sheet, season, Room Maker, remix, Community Sunday, PWA, Home office, cosmetics, k-means, 5 cats + household clip, seen email, creator codes) | Built |
| Phase 2 (accounts, BAD_CAT scores with replay verification, boards, store with entitlements, server OG + short links, /yourcat import, faces via /yourcat, live treat meter, web push and streak emails, public room feed, creator dashboard) | Built, every piece off by default (below) |
| Not in the plan for the first 6 months (GDD 17.1): TikTok LIVE, Twitch IRC, multiplayer, zoomies, Host Kit, portal builds, Live Photos | Not built (gamepad was on that list and is built) |

The only score write path in the repo stays `POST /user/catbassadors/live`; Phase 2 adds its `BAD_CAT` branch.

## Phase 2 (GDD 10, 17.3)

Two switches per feature: the game's `VITE_BADCAT_ONLINE=1` (plus `VITE_BADCAT_API_URL`), and the backend's
`BADCAT_ENABLED` plus the feature flag (`docs/BACKEND.md`, "Bad Cat Daily (badcat)", Phase 2). With either off the
feature is hidden and makes no request.

- **Accounts.** Token Tails sign-in through the client page `/badcat-account` (a full-page hop there and back; a
  hidden iframe of `/badcat-account?bridge=1` then hands out fresh Firebase ID tokens by `postMessage`, sent as the
  lowercase `accesstoken` header with the `fb` prefix). Your cats and progress stay on the device; the account is
  for ranking, claiming purchases, streak emails, `/yourcat` and the creator dashboard. Settings → Online.
- **Ranked runs on the server.** A ranked daily run (not practice, FTUE, studio or household) posts its input log
  to `POST /user/catbassadors/live` with `type: 'BAD_CAT'`. The backend replays it with this package's sim
  (`npm run vendor-sim` → `backend/src/vendor/badcat-sim/`, golden runs in `backend/src/badcat/fixtures/`) and
  keeps its own score. One ranked run per player and day. Offline or signed out, the run waits on the device
  (`rankQueue`, 5 runs, 3 days) and is sent after sign-in or on the next boot. The result screen says
  "Saved: #12 on today's board".
- **Daily board.** Home → 🏆 Daily board: top 100 registered players of a day (guests play but never rank), your
  rank, a day stepper.
- **Short links and server OG.** Dare and room links become `/badcat/s/<id>` with a per-link card ("Mochi scored
  8,420. Your cat can't."), made ahead of the tap so the share sheet still opens inside the gesture.
- **Room feed.** My rooms → Post to feed (a cleared room keeps its clear run); the server runs the Room Maker
  rules and replays the clear run, an admin approves it (CMS `/badcat`), Home → 🧱 Room feed lists rooms by newest
  or most played, with Play and Report.
- **Live data.** The treat meter from purchases (`GET /badcat/meter`), Pink Paw statuses from the shelter gallery
  (display only: the daily rotation keeps the bundled cast so every player and the server see the same room).
- **Return reasons.** Web push "Today's room is open" at the hour you pick (service worker `push` handler), and an
  opt-in streak email the evening a streak would end.
- **Store.** Four more looks (Spiked collar, Wizard hat, Bubble trail, Neon stamp) and a second bundle, through the
  same Stripe test-mode Checkout and entitlements; "Claim my purchases" moves them to any device signed in with
  the purchase email.
- **Other.** Gamepad (stick or d-pad, A jump, X/B swat, Y grab, Start pause), "Import my cat from /yourcat" (the
  family's coat on your cat), a cameo face from your `/yourcat` portrait (no AI call), the creator dashboard, and
  "Give a Pink Paw cat a treat" after a PERFECT CRIME (link to the existing treat flow, `VITE_BADCAT_TREAT_URL`).

## Known gaps

- Phase 2 was built and tested against mocks and in-memory models only: no run against a real MongoDB, Firebase
  project, push service or SendGrid account. The board's `$lookup` with a pipeline needs MongoDB 5+.
- A ranked log can be copied from a dare link (ghosts carry the inputs). The server refuses an exact copy (digest)
  but would replay an edited one; the board shows replayed scores only.
- `GameType.BAD_CAT` is in `shared/enums.ts`, but the generated copy in `catnip-heist/src/shared-contracts/` was
  not rewritten (catnip-heist is off-limits for this build): `node scripts/sync-contracts.mjs --check` reports that
  drift until `node scripts/sync-contracts.mjs` is run.
- The server OG card uses the backend host's fonts; a host without fonts draws the card without text.
- Accounts work only where the game and `/badcat-account` share a site (tokentails.com) or with
  `VITE_BADCAT_AUTH_ORIGIN` in development; Safari's third-party storage rules would block a cross-site bridge.
- No real-device run: encoding, MediaRecorder audio and the in-app handoff ran only in headless Chromium
  (swiftshader). iPhone 11 Safari, Galaxy A15 Chrome and the TikTok / Instagram webviews are still open.
- No Stripe test-mode run against a backend: money ran with mocks and the QA hook. A founder with test keys sets
  the backend flags in `docs/BACKEND.md` to try it.
- Par paws stay empty until human runs are recorded (`tools/RECORDING.md`).
- Guest-star cats on Felony Friday have no face decal (cameo faces are decoded for spectators only).
- The Rap Sheet, cat and cameo cards render after the tap, so iOS may fall back to a download.
- Formant voices are synthesized chirps, not words; the clip sting starts at the match cut.
- The brand queue still has no CMS screen (cameo faces, creator codes and the room feed now do: CMS `/badcat`).
