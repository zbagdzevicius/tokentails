# W1-PLATFORM handover (platform + progress, wave 1)

Green: `npx tsc --noEmit` has no errors in `src/platform/**`, `src/progress/**` or `vite.config.ts`;
`npx vitest run src/platform src/progress` = 3 files, 80 tests. (Errors and failures in sim/content/render at
handover time belong to lanes still in progress.) `vite build` works (checked into the scratchpad, `BADCAT_BUILD_ID`
reaches the bundle).

## Built

**Env** (`env.ts`): `apiUrl` (https origin only, `http://localhost|127.0.0.1` only in dev, credentials/paths
dropped), `clubUi` (`VITE_BADCAT_CLUB=1|true`), `posthogKey` (`phc_…` only), `studioAllowed` (dev or
`VITE_BADCAT_STUDIO`), `shortUrl` (`VITE_BADCAT_SHORT_URL`, default `tokentails.com/badcat`), `isAndroidChrome`.
All default off/null.

**Analytics** (`analytics.ts`, `posthog.ts`): `track()` unchanged for callers. Common props via
`configureAnalytics({ common })` (null removes a key); createPlatform sets `sim_version`, `platform`,
`in_app_browser`, `entry` (`classifyEntry`: typed, daily_link, dare_link, room_link, cat_link, clip_handoff,
typed_or_direct, direct; hash params too), `via`, `utm_source`, `is_first_session`. **The UI sets `day_no` and
`room_id`** with `configureAnalytics({ common: { day_no, room_id } })` when a room opens. Event props win over common
props. PostHog EU fetch sender (POST `https://eu.i.posthog.com/capture/` with `{api_key, batch}`, keepalive, no
cookies, `$process_person_profile: false`, bodies split under 56 KB) is installed only when `posthogKey` is set; it
sends only when `tt-analytics-consent === 'granted'`. Batches: 1.5 s window or 20 events; flush on `pagehide`; queued
events flush when consent is granted. `distinct_id` = a random device id stored under `aid` (only created when a
batch is actually sent, i.e. after consent). No key = no sender = zero requests, even with consent.

**PlatformApi optional members, all implemented**: `consent`, `setConsent` (writes the shared key), `sessionId`
(24 hex, crypto, not stored), `abArm` (50/50, stored in the profile), `icsReminder`, `a2hs`,
`registerServiceWorker`, `treatMeter`.

**PWA**: `public/sw.js` (plain JS; cache `bcd-<v>` from `sw.js?v=<build>`; cache-first `build/*`, icons, manifest,
`og/*`; network-first navigations, HTML, every `.json` incl. `daily/`; offline navigation falls back to the cached
scope index; other origins and non-GET bypass; old `bcd-*` caches dropped on activate). `registerServiceWorker()`
skips dev, in-app browsers and no-SW browsers. `a2hs()`: available only after 2 ranked dailies (launch `days` +
`previewDays`), not when standalone/installed; Chrome via the captured `beforeinstallprompt`
(registerServiceWorker() also starts the capture: call it at boot); iOS (not in-app) returns `ios: true` for the
Share tip and `prompt()` resolves false. Tracks `bc_a2hs`. Manifest: id, `start_url ./?src=a2hs`, any + maskable
+ monochrome SVG icons (`public/icons/`). `vite.config.ts`: `define import.meta.env.VITE_BADCAT_BUILD`
(`BADCAT_BUILD_ID` or a base-36 timestamp; `dev` when serving); port 5174/strictPort/base/three chunk unchanged.

**.ics** (`ics.ts`): VCALENDAR, VEVENT with floating local DTSTART (today if still ahead, else tomorrow),
`RRULE:FREQ=DAILY`, VALARM at start, URL; CRLF, TEXT escaping, folding at 75 octets (never splits UTF-8).

**Treat meter**: `treatMeter()` fetches `<BASE_URL>treat-meter.json` (static), `parseTreatMeter`,
`formatTreatMeter` ("$12.40"). `public/treat-meter.json` ships zeros for 2026-11 (hand-edit monthly).

**Pink Paw** (`pink-paw.ts`): `public/pink-paw-cats.json` generated from the built-in snapshot
(`pinkPawSnapshot()`, colours as `#rrggbb`, `adoptUrl`, `photo: null`). `parsePinkPawSnapshot`,
`loadPinkPawCats()` (static JSON, falls back to the snapshot), `stillWaiting`, `alumni` (+ `FOUND_A_HOME` badge),
`pinkPawBadge`, `pinkPawGuestSpecs`, `fridayCriminal(dayNo)` (weekly rotation), `pinkPawFaceUrl` (only
`pink-paw/<slug>.(jpg|webp|png)` same-origin; null today). The accomplice rotation still uses the static
`PINK_PAW_CATS` so a day's accomplice never changes mid-day. All seam exports kept.

**Profile** (`records.ts`): `sanitizeProfile` validates `prefs` (`sanitizePrefs`), `abArm`, `trails`,
`lastSeenWeekly`; storage cap stays 5 cats. `profileFor(p, maxCats)` forces `active` to 0 when it points at an
extra; `mergeProfileSave(prev, next, maxCats)`: no new cats beyond the allowance, extras read-only (stored version
kept), a shorter list is accepted as a deletion; `editableCats`. createPlatform uses `getEntitlements(store).maxCats`
(MONEY's file) for both. A lapsed Club member never loses cats.

**Progress** (`src/progress/`, `progress` = `Required<ProgressApi>` ready for GameServices):
- Rap Sheet: catalog = 60 prop kinds (base > 0 or grabbable, ids `kind-<n>`) + 16 specials = 76 entries
  (`framed-roomba`, `tablecloth-pull`, `cable-pull`, `zoom-crash`, `puddle-slide`, `stack-avalanche`,
  `tree-topple`, `accomplice`, `box-sit`, `sock-smuggler`, `last-call`, `chain-reaction`, `nine-lives`, `ghost`,
  `cuddled`, `woke-napper`), each with icon and a one-line mugshot blurb. Old `prop:<slug>`/`framed`/… ids migrate
  on read. `crimes()` (gold = Club and 5+), `rapSheet()` (rank titles "Person of Interest" … "Legend of the Litter
  Box"), `weekly(store, now)` (ISO week of the Monday, ready Sunday 18:00 local, top 3 crimes, framed, most wanted
  room, Club `seen` and `mostWanted` from the caller, null for an empty week), `weeklyLine()`.
- `recordCrimes(store, events, propKinds?, dayNo?, { now?, room? })`: the week of the weekly card is the week the
  run was PLAYED (`now`), the room label defaults to the GDD 3.5 weekday room of `dayNo`. Pass `room` (e.g.
  "Kitchen") when known.
- Streak: `streakDetail()` (atRisk, breaksTonight, local), `STREAK_BADGES` (3/7/14/30/100 with names).
- Season: SEASONS by local date, then generated 42-day seasons (`s4` from 2027-04-05). 30 tiers, `XP_PER_TIER`
  300; tier titles for every tier; free items on tiers ≤ 15, Club items on 16–30. Ranked XP once per dayNo,
  practice/FTUE capped at 5 runs per local day. `claimTier` returns the CosmeticDef once (Club gets the Club item),
  null for locked/claimed/title-only tiers. `claimableTiers(view)` for a badge dot.
- Cosmetics: `ownedCosmetics()` = claimed tiers + Streak star collar at a 7-day best streak (also 30/100).
- `parPaws`, friends board (`ghosts`: per room, best first, max 50, dedupe by ghost or by cat code+name keeping the
  better score, hide list), my rooms (`rooms`: max 30, update in place, cleared stays cleared, `removeMyRoom`).
- Save code: `SAVE_KEYS` now profile, days, previewDays, best, streak, previewStreak, rapsheet, season, cosmetics,
  ghosts, rooms (never entitlements or `aid`); every key sanitised on import. `exportSave`/`importSave` (boolean),
  `qrSvg(text)` ('' above ~2,900 bytes, so long save codes show text only).

## Deviations / assumptions

- `ownedCosmetics(): number[]` key = slotIndex × 256 + id (collar 0, hat 1, trail 2, caption 3, stamp 4), because
  cosmetic ids are only unique per slot. A collar key equals its `CatSpec.collar` id. Decode with `cosmeticFromKey`
  or use `ownedCosmeticDefs`. (Change request filed.)
- Practice XP uses the same formula as ranked (types.ts comment), not the old "no base" assumption.
- "Daily player" for the 5-week tuning = one ranked + one practice run a day at ~4,000 points (test pins 28–38 days).
- Freezes keep the old semantics: the weekly allowance is set at the week's first refill; joining Club mid-week gives
  3 from the next week.
- Free Most Wanted rule ("7 golds in a week") is not computed (par paws per run are not stored); `mostWanted` is
  whatever the caller passes.
- `ProgressApi.addRunXp` changed the module's old export signature to `(store, run, opts)`; old
  `seasonOf(dayNo)` is gone (no consumers).
- `qrcode-generator` is re-exported from the platform index, so it lands in the first-load chunk (~20 KB min);
  W3/integrator can import `qrSvg` lazily if the 450 KB budget is tight.

## For W3 / integrator

- `main.ts`: use `progress` from `./progress` for `GameServices.progress`; call `platform.registerServiceWorker?.()`
  once at boot; set `configureAnalytics({ common: { day_no, room_id } })` per room.
- `index.html` links `/manifest.webmanifest` and `/icon.svg` absolutely; with base `./` or `/badcat-game/` they
  should be relative (`manifest.webmanifest`). Also add `<link rel="apple-touch-icon">` for iOS (SVG is ignored by
  iOS; a PNG would need a tool step, assets are procedural).
- Hosting: pages are served at `/badcat/*` but files at `/badcat-game/`, so the worker's scope `/badcat-game/`
  does not control `/badcat/*` navigations. Either serve `sw.js` with `Service-Worker-Allowed: /badcat/` and
  register with scope `/badcat/`, or accept asset-only caching (W2-TOOLS-HOSTING / integrator).
- No known bugs from `docs/*.md` were touched.
- Done (W1-PLATFORM): the MONEY request above is applied; platform/index.ts re-exports those 8 entitlement names, and env fills apiUrl/clubUi.
